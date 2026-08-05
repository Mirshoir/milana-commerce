import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildGooglePlayInternalPlan,
  publishGooglePlayInternal,
} from '../publish_google_play_internal.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-play-publish-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'store'));
  await fs.writeFile(path.join(root, 'pubspec.yaml'), 'name: test\nversion: 1.0.0+1\n');
  await fs.writeFile(path.join(root, 'store/listing-metadata.json'), JSON.stringify({
    release: { versionName: '1.0.0', buildNumber: 1 },
  }));
  const aab = Buffer.alloc(2048, 0x41);
  aab.write('PK', 0, 'ascii');
  const symbols = Buffer.alloc(512, 0x42);
  symbols.write('PK', 0, 'ascii');
  await fs.writeFile(path.join(root, 'app.aab'), aab);
  await fs.writeFile(path.join(root, 'mapping.txt'), 'mapping-data-that-is-long-enough');
  await fs.writeFile(path.join(root, 'symbols.zip'), symbols);
  const plan = await buildGooglePlayInternalPlan({
    root,
    versionName: '1.0.0',
    versionCode: 1,
    aabPath: 'app.aab',
    mappingPath: 'mapping.txt',
    nativeSymbolsPath: 'symbols.zip',
    releaseNotes: { 'en-US': 'Initial internal release.' },
  });
  return { root, plan };
}

test('plan mode validates artifacts without any network request', async (t) => {
  const { plan } = await fixture(t);
  let requested = false;
  const result = await publishGooglePlayInternal(plan, {
    fetchImpl: async () => {
      requested = true;
      throw new Error('network must not run');
    },
  });
  assert.equal(result.mode, 'plan');
  assert.equal(requested, false);
  assert.deepEqual(result.plan.operations, [
    'insert-edit', 'upload-aab', 'upload-proguard-mapping', 'upload-native-symbols',
    'update-internal-track', 'validate-edit', 'commit-edit',
  ]);
  assert.equal('_buffers' in result.plan, false);
});

test('real publication requires the exact confirmation and a token', async (t) => {
  const { plan } = await fixture(t);
  await assert.rejects(
    () => publishGooglePlayInternal(plan, { commit: true, confirmation: 'yes', accessToken: 'token' }),
    /PUBLISH_PLAY_INTERNAL/,
  );
  await assert.rejects(
    () => publishGooglePlayInternal(plan, { commit: true, confirmation: 'PUBLISH_PLAY_INTERNAL' }),
    /access token is required/,
  );
});

test('publisher executes and commits the official edit flow in order', async (t) => {
  const { plan } = await fixture(t);
  const calls = [];
  const responses = [
    { id: 'edit-123' },
    { versionCode: 1 },
    { deobfuscationFile: { symbolType: 'proguard' } },
    { deobfuscationFile: { symbolType: 'nativeCode' } },
    { track: 'internal' },
    { id: 'edit-123' },
    { id: 'edit-123' },
  ];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body });
    return new Response(JSON.stringify(responses[calls.length - 1]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const result = await publishGooglePlayInternal(plan, {
    commit: true,
    confirmation: 'PUBLISH_PLAY_INTERNAL',
    accessToken: 'not-logged-token',
    fetchImpl,
  });
  assert.equal(result.mode, 'committed');
  assert.equal(calls.length, 7);
  assert.deepEqual(calls.map(({ method }) => method), ['POST', 'POST', 'POST', 'POST', 'PUT', 'POST', 'POST']);
  assert.match(calls[1].url, /\/bundles\?uploadType=media$/);
  assert.match(calls[2].url, /deobfuscationFiles\/proguard\?uploadType=media$/);
  assert.match(calls[3].url, /deobfuscationFiles\/nativeCode\?uploadType=media$/);
  assert.match(calls[4].url, /\/tracks\/internal$/);
  assert.match(calls[5].url, /:validate$/);
  assert.match(calls[6].url, /:commit\?changesInReviewBehavior=ERROR_IF_IN_REVIEW$/);
  assert.equal(String(calls[4].body).includes('not-logged-token'), false);
});

test('publisher deletes an uncommitted edit after an upload failure', async (t) => {
  const { plan } = await fixture(t);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    if (calls.length === 1) return new Response(JSON.stringify({ id: 'edit-failed' }), { status: 200 });
    if (options.method === 'DELETE') return new Response('{}', { status: 200 });
    return new Response(JSON.stringify({ error: { message: 'bundle rejected' } }), { status: 400 });
  };
  await assert.rejects(
    () => publishGooglePlayInternal(plan, {
      commit: true,
      confirmation: 'PUBLISH_PLAY_INTERNAL',
      accessToken: 'token',
      fetchImpl,
    }),
    /bundle rejected/,
  );
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.match(calls.at(-1).url, /\/edits\/edit-failed$/);
});
