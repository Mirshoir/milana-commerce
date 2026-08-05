#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ANDROID_ID = 'uz.milana.milana_flutter';
const DEFAULT_IOS_ID = 'uz.milana.milanaFlutter';
const VALID_PLATFORMS = new Set(['all', 'android', 'ios']);
const FIREBASE_COMMON_KEYS = [
  'FIREBASE_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_ASSET_BASE_URL',
];
const ANDROID_FIREBASE_KEYS = [
  'FIREBASE_ANDROID_API_KEY',
  'FIREBASE_ANDROID_APP_ID',
  'FIREBASE_ANDROID_PACKAGE',
];
const IOS_FIREBASE_KEYS = [
  'FIREBASE_IOS_API_KEY',
  'FIREBASE_IOS_APP_ID',
  'FIREBASE_IOS_BUNDLE_ID',
];
const LEGAL_URLS = [
  { key: 'PRIVACY_POLICY_URL', aliases: [] },
  { key: 'TERMS_OF_SERVICE_URL', aliases: ['TERMS_URL'] },
  {
    key: 'ACCOUNT_DELETION_URL',
    aliases: ['ACCOUNT_DELETION_REQUEST_URL', 'DELETE_ACCOUNT_URL'],
  },
  { key: 'SUPPORT_URL', aliases: [] },
];

export class ReleasePreflightError extends Error {
  constructor(blockers, checks = []) {
    super(`Production release preflight failed with ${blockers.length} blocker(s).`);
    this.name = 'ReleasePreflightError';
    this.blockers = blockers;
    this.checks = checks;
  }
}

function parseCliArgs(argv) {
  const booleanFlags = new Set(['--json', '--help']);
  const valueFlags = new Set([
    '--root',
    '--defines',
    '--platform',
    '--artifact',
    '--mode',
    '--expected-android-id',
    '--expected-ios-id',
  ]);
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (booleanFlags.has(flag)) {
      parsed[flag.slice(2)] = true;
      continue;
    }
    if (!valueFlags.has(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a value.`);
    }
    parsed[flag.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

export function parseDefines(text, source = 'Dart defines file') {
  const values = {};
  for (const [index, originalLine] of text.split(/\r?\n/).entries()) {
    let line = originalLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice('export '.length).trim();
    const equals = line.indexOf('=');
    if (equals <= 0) {
      throw new Error(`${source}:${index + 1} must use KEY=value syntax.`);
    }
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      throw new Error(`${source}:${index + 1} contains an invalid key "${key}".`);
    }
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (Object.hasOwn(values, key)) {
      throw new Error(`${source}:${index + 1} duplicates ${key}.`);
    }
    values[key] = value;
  }
  return values;
}

function parseProperties(text, source) {
  const values = {};
  for (const [index, originalLine] of text.split(/\r?\n/).entries()) {
    const line = originalLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const separator = line.search(/[=:]/);
    if (separator <= 0) {
      throw new Error(`${source}:${index + 1} must use key=value syntax.`);
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (Object.hasOwn(values, key)) {
      throw new Error(`${source}:${index + 1} duplicates ${key}.`);
    }
    values[key] = value;
  }
  return values;
}

function isPlaceholder(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return true;
  return (
    /^<.*>$/.test(normalized) ||
    /(^|[-_.\s])(your|placeholder|changeme|replace[-_.\s]?me|todo|dummy)([-_.\s]|$)/.test(
      normalized,
    ) ||
    normalized.includes('example.com') ||
    normalized.includes('.invalid') ||
    /^0+$/.test(normalized)
  );
}

function assertConfigured(key, value) {
  if (!String(value ?? '').trim()) throw new Error(`${key} is missing.`);
  if (isPlaceholder(value)) throw new Error(`${key} still contains a placeholder value.`);
}

function validateGoogleApiKey(key, value) {
  assertConfigured(key, value);
  if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(value)) {
    throw new Error(`${key} does not have a valid Google API key format.`);
  }
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function validatePublicHttps(key, value) {
  assertConfigured(key, value);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid absolute URL.`);
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') throw new Error(`${key} must use HTTPS.`);
  if (url.username || url.password) throw new Error(`${key} must not contain URL credentials.`);
  if (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost') ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error(`${key} must use a public production host.`);
  }
  return url;
}

function validateIdentifier(key, value, kind = 'android') {
  assertConfigured(key, value);
  const pattern =
    kind === 'ios'
      ? /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}$/
      : /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){2,}$/;
  if (!pattern.test(value)) {
    throw new Error(`${key} must be a valid reverse-DNS identifier.`);
  }
}

function configValue(defines, environment, key, aliases = []) {
  for (const candidate of [key, ...aliases]) {
    const environmentValue = environment[candidate];
    if (typeof environmentValue === 'string' && environmentValue.trim()) {
      return { key: candidate, value: environmentValue.trim(), source: 'environment' };
    }
    const defineValue = defines[candidate];
    if (typeof defineValue === 'string' && defineValue.trim()) {
      return { key: candidate, value: defineValue.trim(), source: 'defines' };
    }
  }
  return { key, value: '', source: 'missing' };
}

function firebaseAppIdParts(value, platform) {
  const match = value.match(new RegExp(`^1:(\\d{6,20}):${platform}:([A-Fa-f0-9]{8,})$`));
  if (!match) {
    throw new Error(
      `FIREBASE_${platform.toUpperCase()}_APP_ID must be a valid Firebase ${platform} app ID.`,
    );
  }
  return { senderId: match[1] };
}

function parsePubspecVersion(text) {
  const match = text.match(/^version:\s*["']?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\+(\d+)["']?\s*$/m);
  if (!match) {
    throw new Error('pubspec.yaml must define version as semantic-version+positive-build-number.');
  }
  const buildNumber = Number(match[2]);
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 1 || buildNumber > 2_100_000_000) {
    throw new Error('The Flutter build number must be between 1 and 2100000000.');
  }
  return { version: match[1], buildNumber };
}

function extractAndroidId(gradle) {
  const match = gradle.match(/\bapplicationId\s*=\s*["']([^"']+)["']/);
  if (!match) throw new Error('android/app/build.gradle.kts has no literal applicationId.');
  return match[1];
}

function extractIosIds(projectFile) {
  return [...projectFile.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;\s]+)\s*;/g)]
    .map((match) => match[1].replace(/^"|"$/g, ''))
    .filter((identifier) => !identifier.includes('RunnerTests') && !identifier.includes('$('));
}

function validateAndroidBuildScript(packageJson) {
  const command = packageJson.scripts?.['build:firebase:android'];
  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('package.json is missing build:firebase:android.');
  }
  const required = [
    [/--platform(?:=|\s+)android(?:\s|$)/, '--platform android'],
    [/--artifact(?:=|\s+)appbundle(?:\s|$)/, '--artifact appbundle'],
    [/--mode(?:=|\s+)release(?:\s|$)/, '--mode release'],
  ];
  for (const [pattern, label] of required) {
    if (!pattern.test(command)) throw new Error(`build:firebase:android must explicitly use ${label}.`);
  }
  if (/--artifact(?:=|\s+)apk(?:\s|$)/.test(command)) {
    throw new Error('build:firebase:android must not create an APK for Play submission.');
  }
  if (/--mode(?:=|\s+)(?:debug|profile)(?:\s|$)/.test(command)) {
    throw new Error('build:firebase:android must not use debug or profile mode.');
  }
}

async function maybeRead(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function safeRelative(root, file) {
  const relative = path.relative(root, file);
  return relative && !relative.startsWith('..') ? relative : file;
}

/**
 * Runs the mobile production preflight without invoking Flutter, Gradle, Xcode,
 * Firebase, a network request, or a signing command.
 */
export async function verifyProductionRelease(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const platform = options.platform ?? 'all';
  const artifact = options.artifact ?? 'appbundle';
  const mode = options.mode ?? 'release';
  const expectedAndroidId = options.expectedAndroidId ?? DEFAULT_ANDROID_ID;
  const expectedIosId = options.expectedIosId ?? DEFAULT_IOS_ID;
  const environment = options.environment ?? process.env;
  const definesPath = path.resolve(root, options.defines ?? 'firebase/mobile-dart-defines.env');
  const checks = [];
  const blockers = [];

  const record = async (id, action) => {
    try {
      const detail = await action();
      checks.push({ id, detail: detail || 'passed' });
    } catch (error) {
      blockers.push({ id, message: error instanceof Error ? error.message : String(error) });
    }
  };

  if (!VALID_PLATFORMS.has(platform)) {
    blockers.push({ id: 'platform', message: `Platform must be one of: ${[...VALID_PLATFORMS].join(', ')}.` });
  }

  let defines = {};
  await record('dart-defines', async () => {
    const text = await maybeRead(definesPath);
    if (text === null) {
      throw new Error(`${safeRelative(root, definesPath)} does not exist.`);
    }
    defines = parseDefines(text, safeRelative(root, definesPath));
    return `${safeRelative(root, definesPath)} parsed`;
  });

  const api = configValue(defines, environment, 'API_BASE_URL');
  await record('production-api', () => {
    const url = validatePublicHttps('API_BASE_URL', api.value);
    return `${url.origin} via ${api.source}`;
  });

  for (const key of FIREBASE_COMMON_KEYS) {
    const configured = configValue(defines, environment, key);
    await record(`firebase-${key.slice('FIREBASE_'.length).toLowerCase().replaceAll('_', '-')}`, () => {
      assertConfigured(key, configured.value);
      if (key === 'FIREBASE_API_KEY') validateGoogleApiKey(key, configured.value);
      if (key === 'FIREBASE_PROJECT_ID' && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(configured.value)) {
        throw new Error('FIREBASE_PROJECT_ID does not have a valid Firebase project ID format.');
      }
      if (key === 'FIREBASE_MESSAGING_SENDER_ID' && !/^\d{6,20}$/.test(configured.value)) {
        throw new Error('FIREBASE_MESSAGING_SENDER_ID must contain 6 to 20 digits.');
      }
      if (key === 'FIREBASE_STORAGE_BUCKET') {
        if (configured.value.includes('://') || !/^[a-z0-9][a-z0-9._-]{2,221}[a-z0-9]$/.test(configured.value)) {
          throw new Error('FIREBASE_STORAGE_BUCKET must be a bucket hostname without a URL scheme.');
        }
      }
      if (key === 'FIREBASE_ASSET_BASE_URL') validatePublicHttps(key, configured.value);
      return `configured via ${configured.source}`;
    });
  }

  const senderId = configValue(defines, environment, 'FIREBASE_MESSAGING_SENDER_ID').value;

  if (platform === 'all' || platform === 'android') {
    for (const key of ANDROID_FIREBASE_KEYS) {
      const configured = configValue(defines, environment, key);
      await record(`firebase-${key.slice('FIREBASE_'.length).toLowerCase().replaceAll('_', '-')}`, () => {
        assertConfigured(key, configured.value);
        if (key === 'FIREBASE_ANDROID_API_KEY') {
          validateGoogleApiKey(key, configured.value);
        } else if (key === 'FIREBASE_ANDROID_APP_ID') {
          const parsed = firebaseAppIdParts(configured.value, 'android');
          if (senderId && parsed.senderId !== senderId) {
            throw new Error('FIREBASE_ANDROID_APP_ID does not match FIREBASE_MESSAGING_SENDER_ID.');
          }
        } else {
          validateIdentifier(key, configured.value, 'android');
        }
        return `configured via ${configured.source}`;
      });
    }
  }

  if (platform === 'all' || platform === 'ios') {
    for (const key of IOS_FIREBASE_KEYS) {
      const configured = configValue(defines, environment, key);
      await record(`firebase-${key.slice('FIREBASE_'.length).toLowerCase().replaceAll('_', '-')}`, () => {
        assertConfigured(key, configured.value);
        if (key === 'FIREBASE_IOS_API_KEY') {
          validateGoogleApiKey(key, configured.value);
        } else if (key === 'FIREBASE_IOS_APP_ID') {
          const parsed = firebaseAppIdParts(configured.value, 'ios');
          if (senderId && parsed.senderId !== senderId) {
            throw new Error('FIREBASE_IOS_APP_ID does not match FIREBASE_MESSAGING_SENDER_ID.');
          }
        } else {
          validateIdentifier(key, configured.value, 'ios');
        }
        return `configured via ${configured.source}`;
      });
    }
  }

  const legalValues = [];
  for (const legal of LEGAL_URLS) {
    const configured = configValue(defines, environment, legal.key, legal.aliases);
    await record(`legal-${legal.key.toLowerCase().replaceAll('_', '-')}`, () => {
      const url = validatePublicHttps(legal.key, configured.value);
      legalValues.push(url.href);
      return `${configured.key} via ${configured.source}`;
    });
  }
  await record('legal-urls-distinct', () => {
    if (legalValues.length === LEGAL_URLS.length && new Set(legalValues).size !== legalValues.length) {
      throw new Error('Privacy, terms, account deletion, and support URLs must be distinct.');
    }
    return 'legal destinations are distinct';
  });

  let appVersion;
  await record('app-version', async () => {
    const file = path.join(root, 'pubspec.yaml');
    const text = await maybeRead(file);
    if (text === null) throw new Error('pubspec.yaml does not exist.');
    appVersion = parsePubspecVersion(text);
    return `${appVersion.version}+${appVersion.buildNumber}`;
  });

  let androidId;
  if (platform === 'all' || platform === 'android') {
    await record('android-application-id', async () => {
      validateIdentifier('expected Android application ID', expectedAndroidId, 'android');
      const file = path.join(root, 'android/app/build.gradle.kts');
      const text = await maybeRead(file);
      if (text === null) throw new Error('android/app/build.gradle.kts does not exist.');
      androidId = extractAndroidId(text);
      if (androidId !== expectedAndroidId) {
        throw new Error(`Android applicationId is ${androidId}; expected ${expectedAndroidId}.`);
      }
      const firebasePackage = configValue(defines, environment, 'FIREBASE_ANDROID_PACKAGE').value;
      if (firebasePackage && firebasePackage !== androidId) {
        throw new Error('FIREBASE_ANDROID_PACKAGE does not match the Android applicationId.');
      }
      if (!/versionCode\s*=\s*flutter\.versionCode/.test(text) || !/versionName\s*=\s*flutter\.versionName/.test(text)) {
        throw new Error('Android versionCode/versionName must be sourced from the Flutter version.');
      }
      return androidId;
    });

    await record('android-data-protection', async () => {
      const manifestFile = path.join(root, 'android/app/src/main/AndroidManifest.xml');
      const manifest = await maybeRead(manifestFile);
      if (manifest === null) throw new Error('Android production manifest does not exist.');
      for (const requirement of [
        'android:allowBackup="false"',
        'android:usesCleartextTraffic="false"',
        'android:fullBackupContent="@xml/backup_rules"',
        'android:dataExtractionRules="@xml/data_extraction_rules"',
      ]) {
        if (!manifest.includes(requirement)) {
          throw new Error(`Android production manifest must include ${requirement}.`);
        }
      }
      const legacy = await maybeRead(
        path.join(root, 'android/app/src/main/res/xml/backup_rules.xml'),
      );
      const modern = await maybeRead(
        path.join(root, 'android/app/src/main/res/xml/data_extraction_rules.xml'),
      );
      if (!legacy?.includes('<full-backup-content>') || !legacy.includes('domain="sharedpref"')) {
        throw new Error('Legacy Android backup rules must exclude shared preferences.');
      }
      if (
        !modern?.includes('<cloud-backup>') ||
        !modern.includes('<device-transfer>') ||
        !modern.includes('domain="sharedpref"')
      ) {
        throw new Error('Android data-extraction rules must exclude cloud and device transfer data.');
      }
      return 'backup and device transfer disabled';
    });

    await record('android-artifact-mode', async () => {
      if (artifact !== 'appbundle') throw new Error('Google Play production releases must use an Android App Bundle.');
      if (mode !== 'release') throw new Error('Google Play production releases must use release mode.');
      const file = path.join(root, 'package.json');
      const text = await maybeRead(file);
      if (text === null) throw new Error('package.json does not exist.');
      let packageJson;
      try {
        packageJson = JSON.parse(text);
      } catch {
        throw new Error('package.json is not valid JSON.');
      }
      validateAndroidBuildScript(packageJson);
      return 'release AAB';
    });

    await record('android-upload-signing', async () => {
      const propertiesFile = path.join(root, 'android/key.properties');
      const text = await maybeRead(propertiesFile);
      if (text === null) throw new Error('android/key.properties does not exist.');
      const properties = parseProperties(text, 'android/key.properties');
      for (const key of ['storeFile', 'storePassword', 'keyPassword', 'keyAlias']) {
        assertConfigured(key, properties[key]);
      }
      const configuredStoreFile = properties.storeFile;
      const keystoreFile = path.isAbsolute(configuredStoreFile)
        ? configuredStoreFile
        : path.resolve(root, 'android/app', configuredStoreFile);
      let stat;
      try {
        stat = await fs.stat(keystoreFile);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          throw new Error(`Android upload keystore does not exist at ${safeRelative(root, keystoreFile)}.`);
        }
        throw error;
      }
      if (!stat.isFile() || stat.size === 0) {
        throw new Error('The configured Android upload keystore must be a non-empty file.');
      }
      return `${safeRelative(root, keystoreFile)} exists; secrets redacted`;
    });
  }

  if (platform === 'all' || platform === 'ios') {
    await record('ios-bundle-id', async () => {
      validateIdentifier('expected iOS bundle ID', expectedIosId, 'ios');
      const projectFile = path.join(root, 'ios/Runner.xcodeproj/project.pbxproj');
      const projectText = await maybeRead(projectFile);
      if (projectText === null) throw new Error('ios/Runner.xcodeproj/project.pbxproj does not exist.');
      const identifiers = [...new Set(extractIosIds(projectText))];
      if (identifiers.length === 0) throw new Error('The Runner iOS bundle ID was not found.');
      if (identifiers.length !== 1 || identifiers[0] !== expectedIosId) {
        throw new Error(`Runner iOS bundle IDs are [${identifiers.join(', ')}]; expected only ${expectedIosId}.`);
      }
      const firebaseBundle = configValue(defines, environment, 'FIREBASE_IOS_BUNDLE_ID').value;
      if (firebaseBundle && firebaseBundle !== expectedIosId) {
        throw new Error('FIREBASE_IOS_BUNDLE_ID does not match the Runner bundle ID.');
      }
      const infoFile = path.join(root, 'ios/Runner/Info.plist');
      const infoText = await maybeRead(infoFile);
      if (infoText === null || !infoText.includes('$(PRODUCT_BUNDLE_IDENTIFIER)')) {
        throw new Error('ios/Runner/Info.plist must source CFBundleIdentifier from PRODUCT_BUNDLE_IDENTIFIER.');
      }
      if (
        !/<key>CFBundleShortVersionString<\/key>\s*<string>\$\(FLUTTER_BUILD_NAME\)<\/string>/.test(infoText) ||
        !/<key>CFBundleVersion<\/key>\s*<string>\$\(FLUTTER_BUILD_NUMBER\)<\/string>/.test(infoText)
      ) {
        throw new Error('iOS display version and build number must be sourced from the Flutter version.');
      }
      return expectedIosId;
    });

    await record('ios-privacy-manifest', async () => {
      const infoFile = path.join(root, 'ios/Runner/Info.plist');
      const infoText = await maybeRead(infoFile);
      if (
        infoText === null ||
        !/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(infoText)
      ) {
        throw new Error('Info.plist must explicitly declare exempt-only encryption usage.');
      }
      const privacyFile = path.join(root, 'ios/Runner/PrivacyInfo.xcprivacy');
      const privacyText = await maybeRead(privacyFile);
      if (privacyText === null) throw new Error('Runner PrivacyInfo.xcprivacy does not exist.');
      for (const requirement of [
        'NSPrivacyTracking',
        'NSPrivacyCollectedDataTypes',
        'NSPrivacyCollectedDataTypeName',
        'NSPrivacyCollectedDataTypeEmailAddress',
        'NSPrivacyCollectedDataTypePhoneNumber',
        'NSPrivacyCollectedDataTypePhysicalAddress',
        'NSPrivacyCollectedDataTypeUserID',
        'NSPrivacyCollectedDataTypePurchaseHistory',
        'NSPrivacyCollectedDataTypeCustomerSupport',
        'NSPrivacyCollectedDataTypeProductInteraction',
      ]) {
        if (!privacyText.includes(requirement)) {
          throw new Error(`PrivacyInfo.xcprivacy must declare ${requirement}.`);
        }
      }
      const projectText = await maybeRead(
        path.join(root, 'ios/Runner.xcodeproj/project.pbxproj'),
      );
      if (!projectText?.includes('PrivacyInfo.xcprivacy in Resources')) {
        throw new Error('PrivacyInfo.xcprivacy must be included in Runner resources.');
      }
      return 'app privacy inventory packaged';
    });
  }

  if (blockers.length) throw new ReleasePreflightError(blockers, checks);
  return {
    ok: true,
    platform,
    artifact: platform === 'ios' ? null : artifact,
    mode,
    version: appVersion?.version,
    buildNumber: appVersion?.buildNumber,
    androidApplicationId: androidId,
    iosBundleId: platform === 'android' ? undefined : expectedIosId,
    checks,
  };
}

function usage() {
  return `Usage: node tool/verify_production_release.mjs [options]

Options:
  --root <path>                  Project root (default: current directory)
  --defines <path>               Mobile Dart defines file, relative to root
  --platform <all|android|ios>   Platform scope (default: all)
  --artifact <appbundle>         Android artifact type (default: appbundle)
  --mode <release>               Flutter build mode (default: release)
  --expected-android-id <id>     Expected immutable Android application ID
  --expected-ios-id <id>         Expected immutable iOS bundle ID
  --json                         Print machine-readable output
  --help                         Show this help

Named process-environment values override matching entries in the defines file.
The verifier never prints Firebase API keys or signing secrets.`;
}

async function main() {
  let args;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    console.log(usage());
    return;
  }

  try {
    const report = await verifyProductionRelease({
      root: args.root,
      defines: args.defines,
      platform: args.platform,
      artifact: args.artifact,
      mode: args.mode,
      expectedAndroidId: args['expected-android-id'],
      expectedIosId: args['expected-ios-id'],
    });
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const check of report.checks) console.log(`✓ ${check.id}: ${check.detail}`);
      console.log(
        `Production release preflight passed for ${report.platform} (${report.version}+${report.buildNumber}).`,
      );
    }
  } catch (error) {
    if (error instanceof ReleasePreflightError) {
      if (args.json) {
        console.error(
          JSON.stringify(
            { ok: false, checks: error.checks, blockers: error.blockers },
            null,
            2,
          ),
        );
      } else {
        console.error(error.message);
        for (const blocker of error.blockers) {
          console.error(`✗ ${blocker.id}: ${blocker.message}`);
        }
      }
      process.exitCode = 1;
      return;
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
