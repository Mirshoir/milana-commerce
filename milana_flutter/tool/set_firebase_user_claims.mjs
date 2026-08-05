#!/usr/bin/env node
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
let auth;

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

function usage() {
  return [
    'Usage:',
    '  npm run admin:claims -- --project PROJECT --email user@example.com [--admin true] [--manager true]',
    '  npm run admin:claims -- --project PROJECT --email erp@example.com --create --password PASSWORD --erp-bridge true',
    '',
    'Credentials:',
    '  Pass --service-account /path/key.json, set GOOGLE_APPLICATION_CREDENTIALS,',
    '  or set FIREBASE_SERVICE_ACCOUNT_JSON.',
  ].join('\n');
}

function fail(error) {
  const message = error?.message || String(error);
  console.error(`Error: ${message}\n\n${usage()}`);
  process.exit(1);
}

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

if (args.has('--help')) {
  console.log(usage());
  process.exit(0);
}

const projectId = args.get('--project') || process.env.FIREBASE_PROJECT_ID;
const email = args.get('--email') || process.env.FIREBASE_USER_EMAIL || '';
const uid = args.get('--uid') || process.env.FIREBASE_USER_UID || '';
const password = args.get('--password') || process.env.FIREBASE_USER_PASSWORD || '';
const createUser = args.has('--create');
const dryRun = args.has('--dry-run');

if (!projectId) throw new Error('Pass --project <firebase-project-id> or set FIREBASE_PROJECT_ID.');
if (!email && !uid) throw new Error('Pass --email <user@email> or --uid <firebase-uid>.');
if (createUser && !email) throw new Error('--create requires --email.');

function boolFlag(name, fallback) {
  if (!args.has(name)) return fallback;
  const value = String(args.get(name)).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(`${name} must be true or false.`);
}

function desiredClaims() {
  const claims = {};
  claims.admin = boolFlag('--admin', true);
  if (args.has('--manager')) claims.manager = boolFlag('--manager', true);
  if (args.has('--erp-bridge')) claims.erp_bridge = boolFlag('--erp-bridge', true);
  return claims;
}

async function readServiceAccount() {
  const file = args.get('--service-account') || process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
  if (args.get('--service-account-json')) {
    return JSON.parse(args.get('--service-account-json'));
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  if (file) return JSON.parse(await fs.readFile(file, 'utf8'));
  return null;
}

async function initializeAdmin() {
  if (auth) return;
  const serviceAccount = await readServiceAccount();
  const app =
    getApps()[0] ||
    initializeApp({
      projectId,
      credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    });
  auth = getAuth(app);
}

async function getUser() {
  try {
    return uid ? await auth.getUser(uid) : await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found' || !createUser) throw error;
    if (dryRun) {
      return {
        uid: '<new-user>',
        email,
        customClaims: {},
      };
    }
    return auth.createUser({
      email,
      password: password || undefined,
      emailVerified: false,
      disabled: false,
    });
  }
}

function redactUser(user) {
  return {
    uid: user.uid,
    email: user.email || email || '',
    customClaims: user.customClaims || {},
  };
}

await initializeAdmin();
const user = await getUser();
const existingClaims = user.customClaims || {};
const mergedClaims = { ...existingClaims, ...desiredClaims() };

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dry_run: true,
    project_id: projectId,
    user: redactUser(user),
    next_custom_claims: mergedClaims,
    would_update_password: Boolean(password && user.uid !== '<new-user>'),
  }, null, 2));
  process.exit(0);
}

if (password && user.uid !== '<new-user>') {
  await auth.updateUser(user.uid, { password });
}
await auth.setCustomUserClaims(user.uid, mergedClaims);
const updated = await auth.getUser(user.uid);

console.log(JSON.stringify({
  ok: true,
  project_id: projectId,
  user: redactUser(updated),
}, null, 2));
