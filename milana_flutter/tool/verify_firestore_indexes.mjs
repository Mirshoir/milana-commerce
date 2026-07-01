#!/usr/bin/env node
import fs from 'node:fs/promises';

const indexFile =
  process.argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length) ||
  'firebase/firestore.indexes.json';

const spec = JSON.parse(await fs.readFile(indexFile, 'utf8'));
const indexes = Array.isArray(spec.indexes) ? spec.indexes : [];

const required = [
  {
    collectionGroup: 'orders',
    fields: [
      ['customer_id', 'ASCENDING'],
      ['created_at', 'DESCENDING'],
    ],
  },
  {
    collectionGroup: 'support_requests',
    fields: [
      ['customer_id', 'ASCENDING'],
      ['created_at', 'DESCENDING'],
    ],
  },
  {
    collectionGroup: 'erp_events',
    fields: [
      ['status', 'ASCENDING'],
      ['created_at', 'ASCENDING'],
    ],
  },
  {
    collectionGroup: 'erp_events',
    fields: [
      ['status', 'ASCENDING'],
      ['lease_until', 'ASCENDING'],
    ],
  },
];

function hasIndex(requiredIndex) {
  return indexes.some((index) => {
    if (index.collectionGroup !== requiredIndex.collectionGroup) return false;
    const fields = Array.isArray(index.fields) ? index.fields : [];
    return requiredIndex.fields.every(([fieldPath, order], position) => {
      const field = fields[position] || {};
      return field.fieldPath === fieldPath && field.order === order;
    });
  });
}

const missing = required.filter((index) => !hasIndex(index));
if (missing.length > 0) {
  throw new Error(
    `Missing required Firestore indexes: ${missing
      .map((index) => `${index.collectionGroup}(${index.fields.map(([field, order]) => `${field}:${order}`).join(',')})`)
      .join('; ')}`,
  );
}

console.log(JSON.stringify({
  ok: true,
  indexFile,
  checked: required.length,
}, null, 2));
