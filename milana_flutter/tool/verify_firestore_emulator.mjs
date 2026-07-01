#!/usr/bin/env node
const projectId = process.env.FIREBASE_PROJECT_ID || 'milana-local';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const collection = process.argv[2] || 'products';

const url = `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
const response = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'active' },
          op: 'EQUAL',
          value: { booleanValue: true },
        },
      },
      limit: 500,
    },
  }),
});

const body = await response.text();
if (!response.ok) throw new Error(`Public active-products query failed ${response.status}: ${body}`);

const rows = JSON.parse(body);
const docs = rows.map((row) => row.document).filter(Boolean);
if (docs.length < 300) {
  throw new Error(`Expected at least 300 active ${collection} docs, found ${docs.length}`);
}

const fields = docs[0]?.fields || {};
const sample = {
  count: docs.length,
  name: fields.name?.stringValue,
  active: fields.active?.booleanValue,
  price: fields.price?.doubleValue ?? fields.price?.integerValue,
  image: fields.images?.arrayValue?.values?.[0]?.stringValue,
};

const remoteImages = docs.filter((doc) =>
  (doc.fields?.images?.arrayValue?.values || []).some((image) =>
    /^https?:\/\//.test(image.stringValue || ''),
  ),
).length;

if (remoteImages > 0) {
  throw new Error(`Expected Firebase-hosted image paths, found ${remoteImages} docs with remote image URLs`);
}

console.log(JSON.stringify(sample, null, 2));
