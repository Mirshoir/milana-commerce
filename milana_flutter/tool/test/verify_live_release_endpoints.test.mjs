import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  LiveEndpointError,
  verifyLiveReleaseEndpoints,
} from '../verify_live_release_endpoints.mjs';

const defines = `
API_BASE_URL=https://milanapremium.uz
PRIVACY_POLICY_URL=https://milanapremium.uz/privacy
TERMS_OF_SERVICE_URL=https://milanapremium.uz/terms
ACCOUNT_DELETION_URL=https://milanapremium.uz/delete-account
SUPPORT_URL=https://milanapremium.uz/support
`;

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-live-release-'));
  await fs.mkdir(path.join(root, 'firebase'));
  await fs.writeFile(path.join(root, 'firebase/mobile-dart-defines.env'), defines);
  return root;
}

test('accepts a live catalog and substantive legal documents', async () => {
  const root = await fixture();
  const report = await verifyLiveReleaseEndpoints({
    root,
    environment: {},
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes('/api/products')) {
        return new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('x'.repeat(120), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.checks.length, 5);
});

test('accepts protected environment URLs when the local defines file is absent', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-live-environment-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const environment = Object.fromEntries(
    defines
      .trim()
      .split('\n')
      .map((line) => line.split('='))
      .map(([key, ...value]) => [key, value.join('=')]),
  );
  const report = await verifyLiveReleaseEndpoints({
    root,
    environment,
    fetchImpl: async (url) =>
      String(url).includes('/api/products')
        ? new Response(JSON.stringify([{ id: 1 }]), { status: 200 })
        : new Response('x'.repeat(120), { status: 200 }),
  });
  assert.equal(report.ok, true);
  assert.equal(report.checks.length, 5);
});

test('rejects 404 policy pages and empty catalog results', async () => {
  const root = await fixture();
  await assert.rejects(
    verifyLiveReleaseEndpoints({
      root,
      environment: {},
      fetchImpl: async (url) => {
        const target = String(url);
        if (target.includes('/api/products')) {
          return new Response('[]', { status: 200 });
        }
        if (target.endsWith('/privacy')) {
          return new Response('not found', { status: 404 });
        }
        return new Response('x'.repeat(120), { status: 200 });
      },
    }),
    (error) => {
      assert.ok(error instanceof LiveEndpointError);
      assert.ok(error.failures.some((failure) => failure.key === 'API_BASE_URL'));
      assert.ok(
        error.failures.some((failure) => failure.key === 'PRIVACY_POLICY_URL'),
      );
      return true;
    },
  );
});

test('rejects a substantive-length legal page that identifies itself as a draft', async () => {
  const root = await fixture();
  await assert.rejects(
    verifyLiveReleaseEndpoints({
      root,
      environment: {},
      fetchImpl: async (url) => {
        const target = String(url);
        if (target.includes('/api/products')) {
          return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
        }
        if (target.endsWith('/terms')) {
          return new Response(
            `Эти рабочие условия являются практическим черновиком. ${'x'.repeat(120)}`,
            { status: 200 },
          );
        }
        return new Response('x'.repeat(120), { status: 200 });
      },
    }),
    (error) => {
      assert.ok(error instanceof LiveEndpointError);
      assert.ok(error.failures.some(
        (failure) => failure.key === 'TERMS_OF_SERVICE_URL' &&
          failure.message.includes('draft or placeholder'),
      ));
      return true;
    },
  );
});
