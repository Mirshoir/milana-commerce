#!/usr/bin/env node
import fs from 'node:fs/promises';

const workflowPath =
  process.argv.find((arg) => arg.startsWith('--workflow='))?.slice('--workflow='.length) ||
  '../.github/workflows/milana-flutter-firebase.yml';
const text = await fs.readFile(workflowPath, 'utf8');

const requiredSnippets = [
  'MILANA_PAYMENT_WEBHOOK_SECRET',
  'PAYMENT_WEBHOOK_SECRET: ${{ secrets.MILANA_PAYMENT_WEBHOOK_SECRET }}',
  'test -n "$PAYMENT_WEBHOOK_SECRET"',
  'functions/.env.$FIREBASE_PROJECT_ID',
  'node --check tool/run_erp_bridge_worker.mjs',
  'node --check tool/set_firebase_user_claims.mjs',
  'node --check tool/verify_pwa_manifest.mjs',
  'node --check functions/payment.js',
  'node --check functions/product.js',
  'node --check functions/erp.js',
  'npm run test:emulator:full',
  'npm run verify:pwa',
  'npm run verify:firebase:self-test',
  'npm run verify:firebase -- --project "$FIREBASE_PROJECT_ID"',
];

const missing = requiredSnippets.filter((snippet) => !text.includes(snippet));
if (missing.length > 0) {
  throw new Error(`Workflow is missing required Milana Firebase checks: ${missing.join(', ')}`);
}

console.log(JSON.stringify({
  ok: true,
  workflow: workflowPath,
  checked: requiredSnippets.length,
}, null, 2));
