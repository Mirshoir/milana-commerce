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

const projectId = args.get('--project') || process.env.FIREBASE_PROJECT_ID;
const androidPackage = args.get('--android-package') || 'uz.milana.milana_flutter';
const iosBundle = args.get('--ios-bundle') || 'uz.milana.milanaFlutter';
const displayName = args.get('--display-name') || 'Milana Premium';
const noCreate = args.has('--no-create');

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

const androidAppId = ensureApp(
  'ANDROID',
  androidPackage,
  ['--package-name', androidPackage],
  (app) => app.packageName === androidPackage || app.package_name === androidPackage,
);
const iosAppId = ensureApp(
  'IOS',
  iosBundle,
  ['--bundle-id', iosBundle],
  (app) => app.bundleId === iosBundle || app.bundle_id === iosBundle,
);

await fs.mkdir('android/app', { recursive: true });
await fs.mkdir('ios/Runner', { recursive: true });
await fs.mkdir('firebase', { recursive: true });

execFileSync('firebase', ['--project', projectId, 'apps:sdkconfig', 'ANDROID', androidAppId, '--out', 'android/app/google-services.json'], {
  stdio: 'inherit',
});
execFileSync('firebase', ['--project', projectId, 'apps:sdkconfig', 'IOS', iosAppId, '--out', 'ios/Runner/GoogleService-Info.plist'], {
  stdio: 'inherit',
});

const androidConfig = JSON.parse(await fs.readFile('android/app/google-services.json', 'utf8'));
const androidClient = androidConfig.client?.[0] || {};
const apiKey = androidClient.api_key?.[0]?.current_key || '';
const projectInfo = androidConfig.project_info || {};

await fs.writeFile(
  'firebase/mobile-dart-defines.env',
  [
    `FIREBASE_API_KEY=${apiKey}`,
    `FIREBASE_PROJECT_ID=${projectInfo.project_id || projectId}`,
    `FIREBASE_MESSAGING_SENDER_ID=${projectInfo.project_number || ''}`,
    `FIREBASE_STORAGE_BUCKET=${projectInfo.storage_bucket || `${projectId}.appspot.com`}`,
    `FIREBASE_ASSET_BASE_URL=https://${projectId}.web.app`,
    `FIREBASE_ANDROID_APP_ID=${androidAppId}`,
    `FIREBASE_ANDROID_PACKAGE=${androidPackage}`,
    `FIREBASE_IOS_APP_ID=${iosAppId}`,
    `FIREBASE_IOS_BUNDLE_ID=${iosBundle}`,
  ].join('\n') + '\n',
);

console.log(`Prepared Firebase Android app ${androidAppId} (${androidPackage})`);
console.log(`Prepared Firebase iOS app ${iosAppId} (${iosBundle})`);
console.log('Wrote android/app/google-services.json, ios/Runner/GoogleService-Info.plist, firebase/mobile-dart-defines.env');
