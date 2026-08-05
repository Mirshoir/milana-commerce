import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildAppStoreConnectPlan,
  publishAppStoreConnect,
} from '../publish_app_store_connect.mjs';

async function fixture(t, { signed = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-app-store-publish-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'store'), { recursive: true });
  await fs.writeFile(path.join(root, 'pubspec.yaml'), 'name: test\nversion: 1.0.0+1\n');
  await fs.writeFile(
    path.join(root, 'store/listing-metadata.json'),
    JSON.stringify({ release: { versionName: '1.0.0', buildNumber: 1 } }),
  );
  const app = path.join(root, 'Payload', 'Milana.app');
  await fs.mkdir(path.join(app, '_CodeSignature'), { recursive: true });
  await fs.writeFile(
    path.join(app, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>uz.milana.milanaFlutter</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>Milana</string>
</dict></plist>`,
  );
  await fs.writeFile(path.join(app, 'Milana'), Buffer.alloc(1536, 0x4d));
  if (signed) {
    await fs.writeFile(path.join(app, '_CodeSignature', 'CodeResources'), 'signed-resources');
    await fs.writeFile(path.join(app, 'embedded.mobileprovision'), 'distribution-profile');
  }
  const ipa = path.join(root, 'Milana.ipa');
  const zip = spawnSync('zip', ['-qry', ipa, 'Payload'], { cwd: root, encoding: 'utf8' });
  assert.equal(zip.status, 0, zip.stderr);
  return { root, ipa };
}

async function planFixture(t) {
  const { root, ipa } = await fixture(t);
  const plan = await buildAppStoreConnectPlan({
    root,
    versionName: '1.0.0',
    buildNumber: 1,
    ipaPath: ipa,
  });
  return { root, ipa, plan };
}

test('plan mode validates a signed IPA without invoking Xcode upload', async (t) => {
  const { plan } = await planFixture(t);
  let spawned = false;
  const result = await publishAppStoreConnect(plan, {
    spawnImpl: () => {
      spawned = true;
      throw new Error('upload must not run');
    },
  });
  assert.equal(result.mode, 'plan');
  assert.equal(spawned, false);
  assert.equal(result.plan.bundleId, 'uz.milana.milanaFlutter');
  assert.deepEqual(result.plan.operations, [
    'validate-signed-ipa',
    'upload-app-store-connect',
    'await-processing',
  ]);
});

test('rejects an IPA that lacks distribution signing entries', async (t) => {
  const { root, ipa } = await fixture(t, { signed: false });
  await assert.rejects(
    () =>
      buildAppStoreConnectPlan({
        root,
        versionName: '1.0.0',
        buildNumber: 1,
        ipaPath: ipa,
      }),
    /signed distribution entry/,
  );
});

test('real upload requires exact confirmation, credentials, and macOS', async (t) => {
  const { plan } = await planFixture(t);
  await assert.rejects(
    () => publishAppStoreConnect(plan, { commit: true, confirmation: 'yes' }),
    /UPLOAD_APP_STORE_CONNECT/,
  );
  await assert.rejects(
    () =>
      publishAppStoreConnect(plan, {
        commit: true,
        confirmation: 'UPLOAD_APP_STORE_CONNECT',
      }),
    /API_KEY_ID/,
  );
  await assert.rejects(
    () =>
      publishAppStoreConnect(plan, {
        commit: true,
        confirmation: 'UPLOAD_APP_STORE_CONNECT',
        apiKeyId: 'ABCDEF1234',
        issuerId: '12345678-1234-1234-1234-123456789012',
        platform: 'linux',
      }),
    /requires macOS/,
  );
});

test('guarded upload invokes xcrun altool without exposing credentials', async (t) => {
  const { plan } = await planFixture(t);
  const calls = [];
  const result = await publishAppStoreConnect(plan, {
    commit: true,
    confirmation: 'UPLOAD_APP_STORE_CONNECT',
    apiKeyId: 'ABCDEF1234',
    issuerId: '12345678-1234-1234-1234-123456789012',
    platform: 'darwin',
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: '{"success":true}', stderr: '' };
    },
  });
  assert.equal(result.mode, 'uploaded');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'xcrun');
  assert.deepEqual(calls[0].args.slice(0, 6), [
    'altool',
    '--upload-app',
    '--type',
    'ios',
    '--file',
    plan.artifact.path,
  ]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(JSON.stringify(result).includes('ABCDEF1234'), false);
  assert.equal(JSON.stringify(result).includes('12345678-1234-1234-1234-123456789012'), false);
});
