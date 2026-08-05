import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseDefines,
  ReleasePreflightError,
  verifyProductionRelease,
} from '../verify_production_release.mjs';

const androidId = 'uz.milana.milana_flutter';
const iosId = 'uz.milana.milanaFlutter';

function validDefines(overrides = {}) {
  const values = {
    FIREBASE_API_KEY: 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456789',
    FIREBASE_PROJECT_ID: 'milana-production',
    FIREBASE_MESSAGING_SENDER_ID: '123456789012',
    FIREBASE_STORAGE_BUCKET: 'milana-production.firebasestorage.app',
    FIREBASE_ASSET_BASE_URL: 'https://assets.milanapremium.uz',
    FIREBASE_ANDROID_API_KEY: 'AIzaSyANDROIDABCDEFGHIJKLMNOPQRSTUVWXYZ123',
    FIREBASE_ANDROID_APP_ID: '1:123456789012:android:abcdef1234567890',
    FIREBASE_ANDROID_PACKAGE: androidId,
    FIREBASE_IOS_API_KEY: 'AIzaSyIOSABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
    FIREBASE_IOS_APP_ID: '1:123456789012:ios:0123456789abcdef',
    FIREBASE_IOS_BUNDLE_ID: iosId,
    API_BASE_URL: 'https://api.milanapremium.uz',
    PRIVACY_POLICY_URL: 'https://milanapremium.uz/privacy',
    TERMS_OF_SERVICE_URL: 'https://milanapremium.uz/terms',
    ACCOUNT_DELETION_URL: 'https://milanapremium.uz/account-deletion',
    SUPPORT_URL: 'https://milanapremium.uz/support',
    ...overrides,
  };
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

async function write(root, relative, content) {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

async function fixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-release-preflight-'));
  const buildScript =
    options.buildScript ??
    'npm run verify:release:android && node tool/build_firebase_mobile.mjs --platform android --artifact appbundle --mode release';

  await write(root, 'pubspec.yaml', `name: fixture\nversion: ${options.version ?? '1.2.3+42'}\n`);
  await write(
    root,
    'package.json',
    `${JSON.stringify({ scripts: { 'build:firebase:android': buildScript } }, null, 2)}\n`,
  );
  await write(
    root,
    'firebase/mobile-dart-defines.env',
    options.defines ?? validDefines(),
  );
  await write(
    root,
    'android/app/build.gradle.kts',
    `android {
  defaultConfig {
    applicationId = "${options.androidId ?? androidId}"
    versionCode = flutter.versionCode
    versionName = flutter.versionName
  }
}
`,
  );
  await write(
    root,
    'android/key.properties',
    options.keyProperties ??
      'storePassword=strong-store-password\nkeyPassword=strong-key-password\nkeyAlias=upload\nstoreFile=upload-keystore.jks\n',
  );
  if (!options.omitKeystore) {
    await write(root, 'android/app/upload-keystore.jks', 'non-empty-test-keystore');
  }
  await write(
    root,
    'android/app/src/main/AndroidManifest.xml',
    `<application android:allowBackup="false" android:usesCleartextTraffic="false" android:fullBackupContent="@xml/backup_rules" android:dataExtractionRules="@xml/data_extraction_rules" />\n`,
  );
  await write(
    root,
    'android/app/src/main/res/xml/backup_rules.xml',
    '<full-backup-content><exclude domain="sharedpref" path="." /></full-backup-content>\n',
  );
  await write(
    root,
    'android/app/src/main/res/xml/data_extraction_rules.xml',
    '<data-extraction-rules><cloud-backup><exclude domain="sharedpref" path="." /></cloud-backup><device-transfer><exclude domain="sharedpref" path="." /></device-transfer></data-extraction-rules>\n',
  );
  await write(
    root,
    'ios/Runner.xcodeproj/project.pbxproj',
    `PRODUCT_BUNDLE_IDENTIFIER = ${options.iosId ?? iosId};
PRODUCT_BUNDLE_IDENTIFIER = ${options.iosId ?? iosId};
PRODUCT_BUNDLE_IDENTIFIER = ${options.iosId ?? iosId}.RunnerTests;
PrivacyInfo.xcprivacy in Resources
`,
  );
  await write(
    root,
    'ios/Runner/Info.plist',
    `<key>CFBundleIdentifier</key>
<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleShortVersionString</key>
<string>$(FLUTTER_BUILD_NAME)</string>
<key>CFBundleVersion</key>
<string>$(FLUTTER_BUILD_NUMBER)</string>
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
`,
  );
  await write(
    root,
    'ios/Runner/PrivacyInfo.xcprivacy',
    `<key>NSPrivacyTracking</key><false/>
<key>NSPrivacyCollectedDataTypes</key><array>
<string>NSPrivacyCollectedDataTypeName</string>
<string>NSPrivacyCollectedDataTypeEmailAddress</string>
<string>NSPrivacyCollectedDataTypePhoneNumber</string>
<string>NSPrivacyCollectedDataTypePhysicalAddress</string>
<string>NSPrivacyCollectedDataTypeUserID</string>
<string>NSPrivacyCollectedDataTypePurchaseHistory</string>
<string>NSPrivacyCollectedDataTypeCustomerSupport</string>
<string>NSPrivacyCollectedDataTypeProductInteraction</string>
</array>\n`,
  );

  return root;
}

async function expectBlockers(root, expectedIds, options = {}) {
  await assert.rejects(
    () => verifyProductionRelease({ root, environment: {}, ...options }),
    (error) => {
      assert.ok(error instanceof ReleasePreflightError);
      const ids = new Set(error.blockers.map((blocker) => blocker.id));
      for (const id of expectedIds) assert.ok(ids.has(id), `expected blocker ${id}; got ${[...ids]}`);
      return true;
    },
  );
}

test('accepts a consistent production configuration for both stores', async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await verifyProductionRelease({ root, environment: {} });

  assert.equal(report.ok, true);
  assert.equal(report.version, '1.2.3');
  assert.equal(report.buildNumber, 42);
  assert.equal(report.androidApplicationId, androidId);
  assert.equal(report.iosBundleId, iosId);
  assert.ok(report.checks.some((check) => check.id === 'android-upload-signing'));
});

test('rejects insecure API, placeholder Firebase values, and incomplete legal URLs', async (t) => {
  const root = await fixture({
    defines: validDefines({
      API_BASE_URL: 'http://127.0.0.1:4173',
      FIREBASE_API_KEY: 'your-mobile-api-key',
      FIREBASE_ANDROID_API_KEY: 'your-android-api-key',
      FIREBASE_PROJECT_ID: 'your-project-id',
      PRIVACY_POLICY_URL: 'http://milanapremium.uz/privacy',
      ACCOUNT_DELETION_URL: '',
    }),
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await expectBlockers(root, [
    'production-api',
    'firebase-api-key',
    'firebase-android-api-key',
    'firebase-project-id',
    'legal-privacy-policy-url',
    'legal-account-deletion-url',
  ]);
});

test('rejects APK/debug release commands and a missing upload keystore', async (t) => {
  const root = await fixture({
    buildScript:
      'node tool/build_firebase_mobile.mjs --platform android --artifact apk --mode debug',
    omitKeystore: true,
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await expectBlockers(
    root,
    ['android-artifact-mode', 'android-upload-signing'],
    { artifact: 'apk', mode: 'debug' },
  );
});

test('rejects invalid versioning and identifiers that drift from Firebase', async (t) => {
  const root = await fixture({
    version: '1.2+0',
    androidId: 'uz.milana.changed',
    iosId: 'uz.milana.changedIos',
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await expectBlockers(root, ['app-version', 'android-application-id', 'ios-bundle-id']);
});

test('process environment can supply release values without exposing secret details', async (t) => {
  const root = await fixture({
    defines: validDefines({ FIREBASE_API_KEY: '', FIREBASE_IOS_API_KEY: '', SUPPORT_URL: '' }),
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await verifyProductionRelease({
    root,
    platform: 'ios',
    environment: {
      FIREBASE_API_KEY: 'AIzaSyZYXWVUTSRQPONMLKJIHGFEDCBA987654321',
      FIREBASE_IOS_API_KEY: 'AIzaSyIOSZYXWVUTSRQPONMLKJIHGFEDCBA987654',
      SUPPORT_URL: 'https://support.milanapremium.uz/help',
    },
  });

  assert.equal(report.ok, true);
  assert.ok(
    report.checks.some(
      (check) => check.id === 'firebase-api-key' && check.detail === 'configured via environment',
    ),
  );
  assert.equal(JSON.stringify(report).includes('AIza'), false);
});

test('defines parser rejects duplicate keys instead of accepting ambiguous input', () => {
  assert.throws(
    () => parseDefines('API_BASE_URL=https://api.milanapremium.uz\nAPI_BASE_URL=https://other.test\n'),
    /duplicates API_BASE_URL/,
  );
});
