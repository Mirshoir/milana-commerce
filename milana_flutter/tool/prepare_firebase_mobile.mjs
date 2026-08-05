#!/usr/bin/env node
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (!key.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    i += 1;
  } else {
    args.set(key, 'true');
  }
}

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

let sourceConfig = {};
const sourceEnvFile = args.get('--source-env');
if (sourceEnvFile) {
  sourceConfig = parseEnv(await fs.readFile(sourceEnvFile, 'utf8'));
}

const projectId =
  args.get('--project') ||
  process.env.FIREBASE_PROJECT_ID ||
  sourceConfig.FIREBASE_PROJECT_ID;
const androidPackage = args.get('--android-package') || 'uz.milana.milana_flutter';
const iosBundle = args.get('--ios-bundle') || 'uz.milana.milanaFlutter';
const displayName = args.get('--display-name') || 'Milana Premium';
const noCreate = args.has('--no-create');

let existingDefines = {};
try {
  const source = await fs.readFile('firebase/mobile-dart-defines.env', 'utf8');
  existingDefines = parseEnv(source);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function requiredPublicUrl(flag, environmentKey) {
  const value =
    args.get(flag) || process.env[environmentKey] || existingDefines[environmentKey] || '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Pass ${flag} <public-https-url> or set ${environmentKey}.`);
  }
  if (url.protocol !== 'https:' || !url.hostname || url.hostname === 'localhost') {
    throw new Error(`${environmentKey} must be a public HTTPS URL.`);
  }
  return url.toString();
}

const privacyPolicyUrl = requiredPublicUrl('--privacy-url', 'PRIVACY_POLICY_URL');
const termsOfServiceUrl = requiredPublicUrl('--terms-url', 'TERMS_OF_SERVICE_URL');
const accountDeletionUrl = requiredPublicUrl('--deletion-url', 'ACCOUNT_DELETION_URL');
const supportUrl = requiredPublicUrl('--support-url', 'SUPPORT_URL');

if (!projectId) throw new Error('Pass --project <firebase-project-id> or set FIREBASE_PROJECT_ID.');

function firebaseJson(commandArgs) {
  const out = execFileSync('firebase', ['--project', projectId, ...commandArgs, '--json'], { encoding: 'utf8' });
  const jsonStart = out.indexOf('{');
  if (jsonStart < 0) throw new Error(`Firebase command returned no JSON: ${out}`);
  const parsed = JSON.parse(out.slice(jsonStart));
  if (parsed.status !== 'success') throw new Error(parsed.error || out);
  return parsed.result;
}

function appIdFor(apps, platform, matcher) {
  const app = apps.find((candidate) => matcher(candidate));
  if (!app) return '';
  return app.appId || app.app_id || app.name?.split('/').pop() || '';
}

function ensureApp(platform, label, createArgs, matcher) {
  let apps = firebaseJson(['apps:list', platform]);
  let appId = appIdFor(apps, platform, matcher);
  if (!appId && noCreate) {
    throw new Error(`No ${platform} Firebase app exists for ${label}. Re-run without --no-create to create it.`);
  }
  if (!appId) {
    firebaseJson(['apps:create', platform, displayName, ...createArgs]);
    apps = firebaseJson(['apps:list', platform]);
    appId = appIdFor(apps, platform, matcher);
  }
  if (!appId) throw new Error(`Could not find or create ${platform} app for ${label}.`);
  return appId;
}

const suppliedAndroidAppId = args.get('--android-app-id') || '';
const suppliedIosAppId = args.get('--ios-app-id') || '';
const suppliedAndroidApiKey = args.get('--android-api-key') || '';
const suppliedIosApiKey = args.get('--ios-api-key') || '';
const directConfiguration =
  suppliedAndroidAppId &&
  suppliedIosAppId &&
  suppliedAndroidApiKey &&
  suppliedIosApiKey;

if (
  !directConfiguration &&
  (suppliedAndroidAppId || suppliedIosAppId || suppliedAndroidApiKey || suppliedIosApiKey)
) {
  throw new Error(
    'Direct configuration requires --android-app-id, --ios-app-id, --android-api-key, and --ios-api-key together.',
  );
}

const androidAppId = directConfiguration
  ? suppliedAndroidAppId
  : ensureApp(
      'ANDROID',
      androidPackage,
      ['--package-name', androidPackage],
      (app) => app.packageName === androidPackage || app.package_name === androidPackage,
    );
const iosAppId = directConfiguration
  ? suppliedIosAppId
  : ensureApp(
      'IOS',
      iosBundle,
      ['--bundle-id', iosBundle],
      (app) => app.bundleId === iosBundle || app.bundle_id === iosBundle,
    );

await fs.mkdir('android/app', { recursive: true });
await fs.mkdir('ios/Runner', { recursive: true });
await fs.mkdir('firebase', { recursive: true });

let androidApiKey = suppliedAndroidApiKey;
let iosApiKey = suppliedIosApiKey;
let projectInfo = {};

if (!directConfiguration) {
  execFileSync('firebase', ['--project', projectId, 'apps:sdkconfig', 'ANDROID', androidAppId, '--out', 'android/app/google-services.json'], {
    stdio: 'inherit',
  });
  execFileSync('firebase', ['--project', projectId, 'apps:sdkconfig', 'IOS', iosAppId, '--out', 'ios/Runner/GoogleService-Info.plist'], {
    stdio: 'inherit',
  });

  const androidConfig = JSON.parse(await fs.readFile('android/app/google-services.json', 'utf8'));
  const androidClient = androidConfig.client?.[0] || {};
  androidApiKey = androidClient.api_key?.[0]?.current_key || '';
  projectInfo = androidConfig.project_info || {};

  const iosConfig = await fs.readFile('ios/Runner/GoogleService-Info.plist', 'utf8');
  iosApiKey = iosConfig.match(/<key>API_KEY<\/key>\s*<string>([^<]+)<\/string>/)?.[1] || '';
}

const webApiKey =
  sourceConfig.FIREBASE_API_KEY ||
  sourceConfig.FIREBASE_WEB_API_KEY ||
  existingDefines.FIREBASE_WEB_API_KEY ||
  existingDefines.FIREBASE_API_KEY ||
  androidApiKey;
const webAppId =
  sourceConfig.FIREBASE_APP_ID ||
  sourceConfig.FIREBASE_WEB_APP_ID ||
  existingDefines.FIREBASE_WEB_APP_ID ||
  '';
const authDomain =
  sourceConfig.FIREBASE_AUTH_DOMAIN ||
  existingDefines.FIREBASE_AUTH_DOMAIN ||
  `${projectId}.firebaseapp.com`;
const senderId =
  sourceConfig.FIREBASE_MESSAGING_SENDER_ID ||
  existingDefines.FIREBASE_MESSAGING_SENDER_ID ||
  projectInfo.project_number ||
  '';
const storageBucket =
  sourceConfig.FIREBASE_STORAGE_BUCKET ||
  existingDefines.FIREBASE_STORAGE_BUCKET ||
  projectInfo.storage_bucket ||
  `${projectId}.firebasestorage.app`;
const assetBaseUrl =
  args.get('--asset-base-url') ||
  sourceConfig.FIREBASE_ASSET_BASE_URL ||
  existingDefines.FIREBASE_ASSET_BASE_URL ||
  `https://${projectId}.web.app`;

await fs.writeFile(
  'firebase/mobile-dart-defines.env',
  [
    `FIREBASE_API_KEY=${webApiKey}`,
    `FIREBASE_WEB_API_KEY=${webApiKey}`,
    `FIREBASE_WEB_APP_ID=${webAppId}`,
    `FIREBASE_AUTH_DOMAIN=${authDomain}`,
    `FIREBASE_PROJECT_ID=${projectInfo.project_id || projectId}`,
    `FIREBASE_MESSAGING_SENDER_ID=${senderId}`,
    `FIREBASE_STORAGE_BUCKET=${storageBucket}`,
    `FIREBASE_ASSET_BASE_URL=${assetBaseUrl}`,
    `FIREBASE_ANDROID_API_KEY=${androidApiKey}`,
    `FIREBASE_ANDROID_APP_ID=${androidAppId}`,
    `FIREBASE_ANDROID_PACKAGE=${androidPackage}`,
    `FIREBASE_IOS_API_KEY=${iosApiKey}`,
    `FIREBASE_IOS_APP_ID=${iosAppId}`,
    `FIREBASE_IOS_BUNDLE_ID=${iosBundle}`,
    'API_BASE_URL=https://milanapremium.uz',
    `PRIVACY_POLICY_URL=${privacyPolicyUrl}`,
    `TERMS_OF_SERVICE_URL=${termsOfServiceUrl}`,
    `ACCOUNT_DELETION_URL=${accountDeletionUrl}`,
    `SUPPORT_URL=${supportUrl}`,
  ].join('\n') + '\n',
);

console.log(`Prepared Firebase Android app ${androidAppId} (${androidPackage})`);
console.log(`Prepared Firebase iOS app ${iosAppId} (${iosBundle})`);
console.log(
  directConfiguration
    ? 'Wrote firebase/mobile-dart-defines.env from verified Firebase app configuration'
    : 'Wrote android/app/google-services.json, ios/Runner/GoogleService-Info.plist, firebase/mobile-dart-defines.env',
);
