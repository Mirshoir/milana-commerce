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
const displayName = args.get('--display-name') || 'Milana Flutter';
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

async function writeProjectFiles(config, appId) {
  await fs.writeFile(
    '.firebaserc',
    JSON.stringify({ projects: { default: projectId } }, null, 2) + '\n',
  );
  await fs.mkdir('firebase', { recursive: true });
  await fs.writeFile('firebase/web-app-config.json', JSON.stringify(config, null, 2) + '\n');
  await fs.writeFile(
    'firebase/flutter-dart-defines.env',
    [
      `FIREBASE_API_KEY=${config.apiKey || ''}`,
      `FIREBASE_APP_ID=${config.appId || appId || ''}`,
      `FIREBASE_WEB_APP_ID=${config.appId || appId || ''}`,
      `FIREBASE_PROJECT_ID=${config.projectId || projectId}`,
      `FIREBASE_MESSAGING_SENDER_ID=${config.messagingSenderId || ''}`,
      `FIREBASE_AUTH_DOMAIN=${config.authDomain || `${projectId}.firebaseapp.com`}`,
      `FIREBASE_STORAGE_BUCKET=${config.storageBucket || `${projectId}.appspot.com`}`,
      `FIREBASE_ASSET_BASE_URL=https://${projectId}.web.app`,
      'API_BASE_URL=https://milanapremium.uz',
    ].join('\n') + '\n',
  );
}

let apps = firebaseJson(['apps:list', 'WEB']);
let app = apps[0];

if (!app && noCreate) {
  throw new Error(`No WEB app exists in ${projectId}. Re-run without --no-create to create "${displayName}".`);
}

if (!app) {
  firebaseJson(['apps:create', 'WEB', displayName]);
  apps = firebaseJson(['apps:list', 'WEB']);
  app = apps.find((candidate) => candidate.displayName === displayName) || apps[0];
}

const appId = app.appId || app.appId === 0 ? String(app.appId) : app.appId;
if (!appId) throw new Error(`Could not determine Web app id from Firebase apps:list: ${JSON.stringify(app)}`);

const config = firebaseJson(['apps:sdkconfig', 'WEB', appId]);
await writeProjectFiles(config.sdkConfig || config, appId);

console.log(`Prepared Firebase web app ${appId} for ${projectId}`);
console.log('Wrote .firebaserc, firebase/web-app-config.json, firebase/flutter-dart-defines.env');
console.log('Build flags:');
console.log(
  (await fs.readFile('firebase/flutter-dart-defines.env', 'utf8'))
    .trim()
    .split('\n')
    .map((line) => `--dart-define=${line}`)
    .join(' \\\n  '),
);
