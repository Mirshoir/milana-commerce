#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const expectedBundleId = 'uz.milana.milanaFlutter';
const requiredConfirmation = 'UPLOAD_APP_STORE_CONNECT';

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const separator = argument.indexOf('=');
    if (separator !== -1) {
      args.set(argument.slice(0, separator), argument.slice(separator + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(argument, next);
      index += 1;
    } else {
      args.set(argument, 'true');
    }
  }
  return args;
}

function parsePubspecVersion(text) {
  const match = text.match(/^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\+([1-9][0-9]*)\s*$/m);
  if (!match) throw new Error('pubspec.yaml has no semantic version plus positive build number.');
  return { versionName: match[1], buildNumber: Number(match[2]) };
}

function run(command, args, options = {}) {
  const result = (options.spawnImpl || spawnSync)(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args[0] || ''} failed with exit ${result.status}.`);
  }
  return result;
}

function plistValue(xml, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<key>\\s*${escaped}\\s*</key>\\s*<string>([^<]*)</string>`));
  return match?.[1]?.trim() || '';
}

function parsePlist(buffer, { platform = process.platform, spawnImpl = spawnSync } = {}) {
  const text = buffer.toString('utf8');
  if (text.includes('<plist')) {
    return {
      bundleId: plistValue(text, 'CFBundleIdentifier'),
      versionName: plistValue(text, 'CFBundleShortVersionString'),
      buildNumber: plistValue(text, 'CFBundleVersion'),
      packageType: plistValue(text, 'CFBundlePackageType'),
      executable: plistValue(text, 'CFBundleExecutable'),
    };
  }
  if (platform !== 'darwin') {
    throw new Error('A binary IPA Info.plist must be inspected on macOS.');
  }
  const result = run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], {
    input: buffer,
    encoding: 'utf8',
    spawnImpl,
  });
  let decoded;
  try {
    decoded = JSON.parse(result.stdout);
  } catch {
    throw new Error('The IPA Info.plist could not be decoded.');
  }
  return {
    bundleId: String(decoded.CFBundleIdentifier || ''),
    versionName: String(decoded.CFBundleShortVersionString || ''),
    buildNumber: String(decoded.CFBundleVersion || ''),
    packageType: String(decoded.CFBundlePackageType || ''),
    executable: String(decoded.CFBundleExecutable || ''),
  };
}

function inspectIpa(ipaPath, options = {}) {
  const list = run('unzip', ['-Z1', ipaPath], options).stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (list.some((entry) => entry.startsWith('/') || entry.split('/').includes('..'))) {
    throw new Error('IPA contains an unsafe archive path.');
  }
  const infoEntries = list.filter((entry) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(entry));
  if (infoEntries.length !== 1) throw new Error('IPA must contain exactly one Payload/*.app/Info.plist.');
  const appPrefix = infoEntries[0].slice(0, -'Info.plist'.length);
  for (const required of [
    `${appPrefix}_CodeSignature/CodeResources`,
    `${appPrefix}embedded.mobileprovision`,
  ]) {
    if (!list.includes(required)) throw new Error(`IPA is missing signed distribution entry ${required}.`);
  }
  const plistBuffer = run('unzip', ['-p', ipaPath, infoEntries[0]], {
    ...options,
    encoding: null,
  }).stdout;
  const plist = parsePlist(plistBuffer, options);
  if (!plist.executable || !list.includes(`${appPrefix}${plist.executable}`)) {
    throw new Error('IPA does not contain its declared executable.');
  }
  return { entries: list.length, infoEntry: infoEntries[0], ...plist };
}

export async function buildAppStoreConnectPlan({
  root = process.cwd(),
  bundleId = expectedBundleId,
  versionName,
  buildNumber,
  ipaPath,
  platform = process.platform,
  spawnImpl = spawnSync,
} = {}) {
  if (bundleId !== expectedBundleId) throw new Error(`Bundle ID must be ${expectedBundleId}.`);
  if (!/^\d+\.\d+\.\d+$/.test(versionName || '')) {
    throw new Error('versionName must be semantic, for example 1.0.0.');
  }
  const numericBuild = Number(buildNumber);
  if (!Number.isSafeInteger(numericBuild) || numericBuild < 1 || numericBuild > 2_100_000_000) {
    throw new Error('buildNumber must be an integer between 1 and 2100000000.');
  }
  if (!ipaPath) throw new Error('--ipa is required.');

  const pubspec = parsePubspecVersion(await fs.readFile(path.resolve(root, 'pubspec.yaml'), 'utf8'));
  const metadata = JSON.parse(
    await fs.readFile(path.resolve(root, 'store/listing-metadata.json'), 'utf8'),
  );
  if (
    versionName !== pubspec.versionName ||
    numericBuild !== pubspec.buildNumber ||
    versionName !== metadata.release?.versionName ||
    numericBuild !== Number(metadata.release?.buildNumber)
  ) {
    throw new Error(
      `Requested ${versionName}+${numericBuild} must match pubspec and listing metadata ` +
        `(${pubspec.versionName}+${pubspec.buildNumber}).`,
    );
  }

  const absoluteIpa = path.resolve(root, ipaPath);
  const buffer = await fs.readFile(absoluteIpa);
  if (buffer.length < 1024) throw new Error(`${absoluteIpa} is too small (${buffer.length} bytes).`);
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) throw new Error(`${absoluteIpa} is not a ZIP-based IPA.`);
  run('unzip', ['-tq', absoluteIpa], { spawnImpl });
  const inspection = inspectIpa(absoluteIpa, { platform, spawnImpl });
  if (inspection.bundleId !== bundleId) {
    throw new Error(`IPA bundle ID is ${inspection.bundleId || 'missing'}; expected ${bundleId}.`);
  }
  if (inspection.versionName !== versionName || inspection.buildNumber !== String(numericBuild)) {
    throw new Error(
      `IPA version is ${inspection.versionName}+${inspection.buildNumber}; expected ${versionName}+${numericBuild}.`,
    );
  }
  if (inspection.packageType !== 'APPL') throw new Error('IPA CFBundlePackageType must be APPL.');

  return {
    bundleId,
    versionName,
    buildNumber: numericBuild,
    destination: 'App Store Connect / TestFlight processing',
    artifact: {
      path: absoluteIpa,
      bytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      entries: inspection.entries,
    },
    operations: ['validate-signed-ipa', 'upload-app-store-connect', 'await-processing'],
  };
}

function redact(value, secrets) {
  let result = String(value || '');
  for (const secret of secrets) {
    if (secret) result = result.replaceAll(secret, '[redacted]');
  }
  return result.slice(-2000);
}

export async function publishAppStoreConnect(
  plan,
  {
    commit = false,
    confirmation = '',
    apiKeyId = '',
    issuerId = '',
    platform = process.platform,
    spawnImpl = spawnSync,
  } = {},
) {
  if (!commit) return { ok: true, mode: 'plan', plan };
  if (confirmation !== requiredConfirmation) {
    throw new Error(`A real upload requires --confirmation=${requiredConfirmation}.`);
  }
  if (!/^[A-Z0-9]{10}$/.test(apiKeyId)) {
    throw new Error('APP_STORE_CONNECT_API_KEY_ID must be a 10-character key ID.');
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(issuerId)) {
    throw new Error('APP_STORE_CONNECT_API_ISSUER_ID must be a UUID.');
  }
  if (platform !== 'darwin') throw new Error('App Store Connect upload requires macOS and Xcode.');

  const result = spawnImpl(
    'xcrun',
    [
      'altool',
      '--upload-app',
      '--type',
      'ios',
      '--file',
      plan.artifact.path,
      '--apiKey',
      apiKeyId,
      '--apiIssuer',
      issuerId,
      '--output-format',
      'json',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: false },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `App Store Connect upload failed with exit ${result.status}: ` +
        redact(result.stderr || result.stdout, [apiKeyId, issuerId]),
    );
  }
  return {
    ok: true,
    mode: 'uploaded',
    bundleId: plan.bundleId,
    versionName: plan.versionName,
    buildNumber: plan.buildNumber,
    artifactSha256: plan.artifact.sha256,
    nextStep: 'Wait for App Store Connect processing, then assign the build to TestFlight.',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.get('--root') || process.cwd());
  const plan = await buildAppStoreConnectPlan({
    root,
    bundleId: args.get('--bundle-id') || expectedBundleId,
    versionName: args.get('--version-name'),
    buildNumber: args.get('--build-number'),
    ipaPath: args.get('--ipa'),
  });
  const result = await publishAppStoreConnect(plan, {
    commit: args.has('--commit'),
    confirmation: args.get('--confirmation') || '',
    apiKeyId: process.env.APP_STORE_CONNECT_API_KEY_ID || '',
    issuerId: process.env.APP_STORE_CONNECT_API_ISSUER_ID || '',
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
