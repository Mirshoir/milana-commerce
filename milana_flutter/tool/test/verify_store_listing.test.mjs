import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { StoreListingError, verifyStoreListing } from '../verify_store_listing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function withMetadata(t, mutate) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-store-listing-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'store/listing-metadata.json'), 'utf8'));
  await mutate(metadata, directory);
  const metadataPath = path.join(directory, 'listing-metadata.json');
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return { directory, metadataPath };
}

function blockerIds(error) {
  assert.ok(error instanceof StoreListingError);
  return new Set(error.blockers.map((blocker) => blocker.id));
}

test('prepared store metadata, records, version, and graphics satisfy repository gates', async () => {
  const report = await verifyStoreListing({ root, mode: 'prepared' });
  assert.equal(report.ok, true);
  for (const id of ['release-version', 'structured-records', 'play-icon', 'play-feature-graphic', 'app-store-copy']) {
    assert.ok(report.checks.some((check) => check.id === id), `missing prepared check ${id}`);
  }
});

test('Android submission gate is platform-specific and fails closed on owner and device inputs', async () => {
  await assert.rejects(
    () => verifyStoreListing({ root, mode: 'submission', platform: 'android' }),
    (error) => {
      const ids = blockerIds(error);
      for (const expected of [
        'submission-global-questionnaire-legal-pages',
        'submission-android-questionnaire-data-safety',
        'submission-android-review',
        'submission-android-screenshots-google-play-phone-en-US-count',
        'submission-android-contact-email',
      ]) assert.ok(ids.has(expected), `missing expected blocker ${expected}`);
      assert.ok([...ids].every((id) => !id.startsWith('submission-ios-')));
      return true;
    },
  );
});

test('iOS submission gate does not depend on Google Play assets or contact fields', async () => {
  await assert.rejects(
    () => verifyStoreListing({ root, mode: 'submission', platform: 'ios' }),
    (error) => {
      const ids = blockerIds(error);
      assert.ok(ids.has('submission-ios-questionnaire-app-privacy'));
      assert.ok(ids.has('submission-ios-screenshots-app-store-iphone-en-US-count'));
      assert.ok(ids.has('submission-ios-sku'));
      assert.ok([...ids].every((id) => !id.startsWith('submission-android-')));
      return true;
    },
  );
});

test('prepared gate rejects missing or private required URLs', async (t) => {
  const { metadataPath } = await withMetadata(t, async (metadata) => {
    delete metadata.urls.privacy;
    metadata.urls.support = 'https://127.0.0.1/support';
  });
  await assert.rejects(
    () => verifyStoreListing({ root, metadataPath }),
    (error) => {
      const ids = blockerIds(error);
      assert.ok(ids.has('url-privacy'));
      assert.ok(ids.has('url-support'));
      return true;
    },
  );
});

test('prepared gate rejects unsupported store locales and pubspec version drift', async (t) => {
  const { metadataPath } = await withMetadata(t, async (metadata) => {
    metadata.release.versionName = '9.9.9';
    metadata.googlePlay.localizations.uz = { ...metadata.googlePlay.localizations['en-US'] };
  });
  await assert.rejects(
    () => verifyStoreListing({ root, metadataPath, platform: 'android' }),
    (error) => {
      const ids = blockerIds(error);
      assert.ok(ids.has('release-version'));
      assert.ok(ids.has('android-copy-uz-locale'));
      return true;
    },
  );
});

test('candidate version and protected define URLs must match repository metadata', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-store-defines-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const definesPath = path.join(directory, 'defines.env');
  await fs.writeFile(definesPath, [
    'API_BASE_URL=https://milanapremium.uz',
    'PRIVACY_POLICY_URL=https://milanapremium.uz/privacy',
    'TERMS_OF_SERVICE_URL=https://milanapremium.uz/not-the-terms',
    'ACCOUNT_DELETION_URL=https://milanapremium.uz/delete-account',
    'SUPPORT_URL=https://milanapremium.uz/support',
  ].join('\n'));
  await assert.rejects(
    () => verifyStoreListing({
      root,
      platform: 'android',
      version: '1.0.1',
      buildNumber: '2',
      definesPath,
    }),
    (error) => {
      const ids = blockerIds(error);
      assert.ok(ids.has('release-requested-version'));
      assert.ok(ids.has('release-requested-build'));
      assert.ok(ids.has('defines-terms_of_service_url'));
      return true;
    },
  );
});
