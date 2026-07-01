#!/usr/bin/env node
import fs from 'node:fs/promises';
import { googleAccessToken } from './google_access_token.mjs';

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

const projectId = args.get('--project') || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
const catalogFile = args.get('--catalog') || 'firebase/catalog.products.json';
const collection = args.get('--collection') || 'products';
const dryRun = args.has('--dry-run');
const emulatorHost = args.get('--emulator-host') || process.env.FIRESTORE_EMULATOR_HOST;

if (!projectId && !dryRun) {
  throw new Error('Pass --project <firebase-project-id>, set FIREBASE_PROJECT_ID, or use --dry-run.');
}

const products = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
if (!Array.isArray(products)) throw new Error(`${catalogFile} must contain a JSON array.`);

function safeId(product) {
  return String(product.slug || product.id).replace(/[/?#[\]]/g, '-');
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])),
      },
    };
  }
  return { stringValue: String(value) };
}

function documentFields(product) {
  return Object.fromEntries(Object.entries(product).map(([key, value]) => [key, firestoreValue(value)]));
}

async function batchWrite(writes) {
  if (emulatorHost) {
    const response = await fetch(`http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents:batchWrite`, {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ writes }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Firestore emulator batchWrite failed ${response.status}: ${body}`);
    return;
  }
  const token = await googleAccessToken(args);
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:batchWrite`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Firestore batchWrite failed ${response.status}: ${body}`);
}

const writes = products.map((product) => ({
  update: {
    name: `projects/${projectId || 'dry-run'}/databases/(default)/documents/${collection}/${safeId(product)}`,
    fields: documentFields(product),
  },
}));

if (dryRun) {
  console.log(`Dry run: ${writes.length} ${collection} documents are ready from ${catalogFile}`);
  console.log(JSON.stringify(writes[0], null, 2).slice(0, 1200));
  process.exit(0);
}

for (let i = 0; i < writes.length; i += 450) {
  await batchWrite(writes.slice(i, i + 450));
  console.log(`Imported ${Math.min(i + 450, writes.length)}/${writes.length}`);
}

console.log(`Imported ${writes.length} products into ${projectId}/${collection}`);
