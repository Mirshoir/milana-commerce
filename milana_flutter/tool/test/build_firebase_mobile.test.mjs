import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const builder = path.join(projectRoot, 'tool', 'build_firebase_mobile.mjs');

async function definesFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-mobile-build-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'defines.env');
  await fs.writeFile(file, 'FIREBASE_API_KEY=secret-ish-value\nAPI_BASE_URL=https://example.test\n');
  return file;
}

function dryRun(args) {
  return spawnSync(process.execPath, [builder, ...args, '--dry-run'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

test('release dry-run enables obfuscation and redacts Dart define values', async (t) => {
  const defines = await definesFixture(t);
  const result = dryRun([
    '--platform', 'android',
    '--artifact', 'appbundle',
    '--mode', 'release',
    '--defines', defines,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /flutter build appbundle --release/);
  assert.match(result.stdout, /--obfuscate/);
  assert.match(result.stdout, /--split-debug-info=build\/symbols\/android/);
  assert.match(result.stdout, /--dart-define=FIREBASE_API_KEY=\[redacted\]/);
  assert.equal(result.stdout.includes('secret-ish-value'), false);
  assert.equal(result.stdout.includes('https://example.test'), false);
});

test('debug dry-run does not request release obfuscation', async (t) => {
  const defines = await definesFixture(t);
  const result = dryRun([
    '--platform', 'android',
    '--artifact', 'apk',
    '--mode', 'debug',
    '--defines', defines,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /flutter build apk --debug/);
  assert.equal(result.stdout.includes('--obfuscate'), false);
  assert.equal(result.stdout.includes('--split-debug-info'), false);
});
