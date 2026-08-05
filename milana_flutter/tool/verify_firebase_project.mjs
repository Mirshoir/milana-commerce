#!/usr/bin/env node
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { googleAccessToken } from './google_access_token.mjs';
import { defaultFirebaseFunctionNames } from './firebase_function_names.mjs';

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
const expectedProducts = Number(args.get('--min-products') || 300);
const hostingUrl = args.get('--hosting-url') || (projectId ? `https://${projectId}.web.app` : '');
const functionRegion = args.get('--function-region') || 'asia-southeast1';
const minImageChecks = Number(args.get('--min-image-checks') || 3);
const functionNames = (
  args.get('--function-name') ||
  args.get('--functions') ||
  defaultFirebaseFunctionNames.join(',')
)
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const requiredFunctionEnv = {
  paymentWebhook: ['PAYMENT_WEBHOOK_SECRET'],
};

export function missingRequiredFunctionEnv({
  functionName,
  serviceConfig = {},
  skipFunctionEnv = false,
}) {
  if (skipFunctionEnv) return [];
  const env = serviceConfig.environmentVariables || {};
  const secretEnv = serviceConfig.secretEnvironmentVariables || [];
  const secretNames = new Set(
    secretEnv
      .map((row) => row.key || row.name || row.secret || '')
      .filter(Boolean),
  );
  const requiredEnv = requiredFunctionEnv[functionName] || [];
  return requiredEnv.filter(
    (name) => !Object.prototype.hasOwnProperty.call(env, name) && !secretNames.has(name),
  );
}

if (args.has('--self-test')) {
  const directMissing = missingRequiredFunctionEnv({
    functionName: 'paymentWebhook',
    serviceConfig: { environmentVariables: { PAYMENT_WEBHOOK_SECRET: 'set' } },
  });
  const secretMissing = missingRequiredFunctionEnv({
    functionName: 'paymentWebhook',
    serviceConfig: { secretEnvironmentVariables: [{ key: 'PAYMENT_WEBHOOK_SECRET' }] },
  });
  const missing = missingRequiredFunctionEnv({
    functionName: 'paymentWebhook',
    serviceConfig: { environmentVariables: {} },
  });
  if (directMissing.length !== 0 || secretMissing.length !== 0) {
    throw new Error('Self-test failed: configured paymentWebhook env was reported missing.');
  }
  if (missing.join(',') !== 'PAYMENT_WEBHOOK_SECRET') {
    throw new Error(`Self-test failed: expected PAYMENT_WEBHOOK_SECRET missing, got ${missing.join(',')}`);
  }
  console.log(JSON.stringify({ ok: true, selfTest: 'verify_firebase_project' }, null, 2));
  process.exit(0);
}

if (!projectId) throw new Error('Pass --project <firebase-project-id> or set FIREBASE_PROJECT_ID.');

function firebaseJson(commandArgs) {
  const out = execFileSync('firebase', ['--project', projectId, ...commandArgs, '--json'], { encoding: 'utf8' });
  const jsonStart = out.indexOf('{');
  if (jsonStart < 0) throw new Error(`Firebase command returned no JSON: ${out}`);
  const parsed = JSON.parse(out.slice(jsonStart));
  if (parsed.status !== 'success') throw new Error(parsed.error || out);
  return parsed.result;
}

async function activeProductDocs() {
  const token = await googleAccessToken(args);
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'products' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'active' },
            op: 'EQUAL',
            value: { booleanValue: true },
          },
        },
        limit: 1000,
      },
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Firestore query failed ${response.status}: ${body}`);
  return JSON.parse(body).map((row) => row.document).filter(Boolean);
}

function stringArray(field) {
  return (field?.arrayValue?.values || [])
    .map((value) => value.stringValue || '')
    .filter(Boolean);
}

async function verifyHostedProductImages(productDocs) {
  if (args.has('--skip-image-hosting')) return 'not_checked';

  const remoteImageDocs = productDocs.filter((doc) =>
    stringArray(doc.fields?.images).some((image) => /^https?:\/\//.test(image)),
  ).length;
  if (remoteImageDocs > 0 && !args.has('--allow-remote-images')) {
    throw new Error(`Expected Firebase Hosting image paths, found ${remoteImageDocs} products with remote image URLs.`);
  }

  const images = productDocs
    .flatMap((doc) => stringArray(doc.fields?.images))
    .filter((image) => image.startsWith('/uploads/'))
    .slice(0, minImageChecks);

  if (images.length < Math.min(minImageChecks, 1)) {
    throw new Error('No /uploads/... product images found in Firestore products.');
  }

  const checked = [];
  for (const image of images) {
    const url = `${hostingUrl.replace(/\/+$/, '')}${image}`;
    const response = await fetch(url);
    const bytes = Number(response.headers.get('content-length') || 0);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) throw new Error(`Hosted product image check failed ${response.status}: ${url}`);
    if (contentType && !contentType.startsWith('image/')) {
      throw new Error(`Hosted product image returned ${contentType || 'unknown content type'}: ${url}`);
    }
    const body = bytes > 0 ? null : await response.arrayBuffer();
    const size = bytes || body.byteLength;
    if (size < 1000) throw new Error(`Hosted product image looked too small (${size} bytes): ${url}`);
    checked.push({ image, bytes: size });
  }
  return checked;
}

async function verifyFunction(functionName) {
  const token = await googleAccessToken(args, 'https://www.googleapis.com/auth/cloud-platform');
  const url = `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/${functionRegion}/functions/${functionName}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Cloud Function check failed ${response.status}: ${body}`);
  }
  const parsed = JSON.parse(body);
  if (parsed.state && parsed.state !== 'ACTIVE') {
    throw new Error(`Cloud Function ${functionName} is ${parsed.state}, expected ACTIVE.`);
  }
  const requiredEnv = args.has('--skip-function-env')
    ? []
    : requiredFunctionEnv[functionName] || [];
  const missingEnv = missingRequiredFunctionEnv({
    functionName,
    serviceConfig: parsed.serviceConfig || {},
    skipFunctionEnv: args.has('--skip-function-env'),
  });
  if (missingEnv.length > 0) {
    throw new Error(
      `Cloud Function ${functionName} is missing required environment configuration: ${missingEnv.join(', ')}`,
    );
  }
  return {
    name: functionName,
    region: functionRegion,
    state: parsed.state || 'unknown',
    url: parsed.serviceConfig?.uri || null,
    requiredEnvironment: Object.fromEntries(
      requiredEnv.map((name) => [name, 'configured']),
    ),
  };
}

const apps = firebaseJson(['apps:list', 'WEB']);
if (!apps.length) throw new Error(`${projectId} has no Firebase Web app. Run npm run prepare:firebase -- --project ${projectId}`);

let androidApps = [];
let iosApps = [];
if (!args.has('--skip-mobile-apps')) {
  androidApps = firebaseJson(['apps:list', 'ANDROID']);
  iosApps = firebaseJson(['apps:list', 'IOS']);
  if (!androidApps.length) {
    throw new Error(`${projectId} has no Firebase Android app. Run npm run prepare:firebase:mobile -- --project ${projectId}`);
  }
  if (!iosApps.length) {
    throw new Error(`${projectId} has no Firebase iOS app. Run npm run prepare:firebase:mobile -- --project ${projectId}`);
  }
}

let config = {};
try {
  config = JSON.parse(await fs.readFile('firebase/web-app-config.json', 'utf8'));
} catch {}

const productDocs = await activeProductDocs();
const count = productDocs.length;
if (count < expectedProducts) {
  throw new Error(`Expected at least ${expectedProducts} active products, found ${count}`);
}

let hosting = 'not_checked';
let productImages = 'not_checked';
if (!args.has('--skip-hosting')) {
  const response = await fetch(hostingUrl);
  hosting = response.ok ? 'ok' : `failed_${response.status}`;
  if (!response.ok) throw new Error(`Hosting check failed: ${hostingUrl} returned ${response.status}`);
  productImages = await verifyHostedProductImages(productDocs);
}

const functionStatus = args.has('--skip-functions')
  ? 'not_checked'
  : await Promise.all(functionNames.map((name) => verifyFunction(name)));

console.log(JSON.stringify({
  projectId,
  webApps: apps.length,
  androidApps: androidApps.length,
  iosApps: iosApps.length,
  configProjectId: config.projectId || null,
  activeProducts: count,
  productImages,
  function: functionStatus,
  hosting,
  hostingUrl,
}, null, 2));
