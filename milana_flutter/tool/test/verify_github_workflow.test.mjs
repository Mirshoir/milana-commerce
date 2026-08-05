import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const verifierPath = path.join(projectRoot, 'tool', 'verify_github_workflow.mjs');
const expectedInvocation =
  'firebase emulators:exec --project milana-local --only auth,firestore,functions,hosting';
const requiredStoreScripts = {
  'verify:store:submission:android':
    'node tool/verify_store_listing.mjs --mode=submission --platform=android',
  'verify:store:submission:ios':
    'node tool/verify_store_listing.mjs --mode=submission --platform=ios',
  'verify:play-publisher:self-test':
    'node --test tool/test/publish_google_play_internal.test.mjs',
  'verify:app-store-publisher:self-test':
    'node --test tool/test/publish_app_store_connect.test.mjs',
  'verify:mobile-builder:self-test':
    'node --test tool/test/build_firebase_mobile.test.mjs',
  'publish:play:internal': 'node tool/publish_google_play_internal.mjs',
  'publish:app-store-connect': 'node tool/publish_app_store_connect.mjs',
};

async function runVerifierWithScripts(scripts) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-workflow-verifier-'));
  const packagePath = path.join(tempDir, 'package.json');

  try {
    await fs.writeFile(
      packagePath,
      JSON.stringify({ scripts: { ...requiredStoreScripts, ...scripts } }),
      'utf8',
    );
    return spawnSync(
      process.execPath,
      [verifierPath, `--package=${packagePath}`],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('accepts an isolated full-emulator command with complete emulator coverage', async () => {
  const result = await runVerifierWithScripts({
    'test:emulator:full':
      `PAYMENT_WEBHOOK_SECRET=local-payment-webhook-secret ` +
      `FUNCTIONS_DISCOVERY_TIMEOUT=60 ${expectedInvocation} "npm test"`,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('does not let a sibling package script satisfy full-emulator isolation', async () => {
  const result = await runVerifierWithScripts({
    'test:emulator:checkout':
      `PAYMENT_WEBHOOK_SECRET=local-payment-webhook-secret ` +
      `FUNCTIONS_DISCOVERY_TIMEOUT=60 ${expectedInvocation} "npm test"`,
    'test:emulator:full': `${expectedInvocation} "npm test"`,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scripts\["test:emulator:full"\]/);
  assert.match(result.stderr, /PAYMENT_WEBHOOK_SECRET=local-payment-webhook-secret/);
  assert.match(result.stderr, /FUNCTIONS_DISCOVERY_TIMEOUT=60/);
});

test('requires the full-emulator command to start every expected emulator', async () => {
  const result = await runVerifierWithScripts({
    'test:emulator:full':
      'PAYMENT_WEBHOOK_SECRET=local-payment-webhook-secret ' +
      'FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase emulators:exec --project milana-local --only firestore "npm test"',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scripts\["test:emulator:full"\]/);
  assert.match(
    result.stderr,
    /firebase emulators:exec --project milana-local --only auth,firestore,functions,hosting/,
  );
});

test('requires platform-specific publication gates', async () => {
  const result = await runVerifierWithScripts({
    ...requiredStoreScripts,
    'test:emulator:full':
      `PAYMENT_WEBHOOK_SECRET=local-payment-webhook-secret ` +
      `FUNCTIONS_DISCOVERY_TIMEOUT=60 ${expectedInvocation} "npm test"`,
    'verify:store:submission:android':
      'node tool/verify_store_listing.mjs --mode=submission --platform=ios',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verify:store:submission:android/);
  assert.match(result.stderr, /--mode=submission --platform=android/);
});
