#!/usr/bin/env node
import fs from 'node:fs/promises';

const workflowPath =
  process.argv.find((arg) => arg.startsWith('--workflow='))?.slice('--workflow='.length) ||
  '../.github/workflows/milana-flutter-firebase.yml';
const mobileWorkflowPath =
  process.argv.find((arg) => arg.startsWith('--mobile-workflow='))
    ?.slice('--mobile-workflow='.length) ||
  '../.github/workflows/milana-mobile-release.yml';
const androidGradlePath =
  process.argv.find((arg) => arg.startsWith('--android-gradle='))
    ?.slice('--android-gradle='.length) ||
  'android/app/build.gradle.kts';
const packagePath =
  process.argv.find((arg) => arg.startsWith('--package='))
    ?.slice('--package='.length) ||
  'package.json';
const [text, mobileText, androidGradleText, packageText] = await Promise.all([
  fs.readFile(workflowPath, 'utf8'),
  fs.readFile(mobileWorkflowPath, 'utf8'),
  fs.readFile(androidGradlePath, 'utf8'),
  fs.readFile(packagePath, 'utf8'),
]);

const requiredSnippets = [
  'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
  'subosito/flutter-action@1a449444c387b1966244ae4d4f8c696479add0b2',
  'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
  'actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961',
  'npm install -g firebase-tools@15.22.2',
  '.github/workflows/milana-mobile-release.yml',
  'MILANA_PAYMENT_WEBHOOK_SECRET',
  'PAYMENT_WEBHOOK_SECRET: ${{ secrets.MILANA_PAYMENT_WEBHOOK_SECRET }}',
  'test -n "$PAYMENT_WEBHOOK_SECRET"',
  'functions/.env.$FIREBASE_PROJECT_ID',
  'node --check tool/run_erp_bridge_worker.mjs',
  'node --check tool/set_firebase_user_claims.mjs',
  'node --check tool/verify_pwa_manifest.mjs',
  'node --check tool/verify_store_listing.mjs',
  'node --check tool/publish_google_play_internal.mjs',
  'node --check tool/publish_app_store_connect.mjs',
  'node --check functions/account.js',
  'node --check functions/test/account.test.js',
  'node --check functions/payment.js',
  'node --check functions/product.js',
  'node --check functions/erp.js',
  'npm run test:emulator:full',
  'npm run functions:audit',
  'npm run verify:pwa',
  'npm run verify:firebase:self-test',
  'npm run verify:hosting-tools:self-test',
  'npm run verify:store:self-test',
  'npm run verify:store:prepared',
  'npm run verify:play-publisher:self-test',
  'npm run verify:app-store-publisher:self-test',
  'npm run verify:mobile-builder:self-test',
  'npm run verify:release:self-test',
  'npm run verify:release:live:self-test',
  'npm run verify:firebase -- --project "$FIREBASE_PROJECT_ID"',
  'name: Compile iOS release',
  'needs: validate',
  'runs-on: macos-26',
  'Xcode 26.2 or newer is required',
  'flutter build ios',
  '--no-codesign',
  'test -f "$app_path/PrivacyInfo.xcprivacy"',
];

const missing = requiredSnippets.filter((snippet) => !text.includes(snippet));
if (missing.length > 0) {
  throw new Error(`Workflow is missing required Milana Firebase checks: ${missing.join(', ')}`);
}
const mobileWorkflowTriggerCount =
  text.split('.github/workflows/milana-mobile-release.yml').length - 1;
if (mobileWorkflowTriggerCount < 2) {
  throw new Error(
    'Standard CI must watch the protected mobile workflow on both pull requests and main pushes.',
  );
}

const requiredMobileSnippets = [
  'name: Milana Mobile Release Candidate',
  'environment: mobile-release',
  'MOBILE_RELEASE_APPROVED',
  'npm run verify:release:android',
  'npm run verify:release:ios',
  'npm run verify:release:live',
  'npm --prefix functions audit --omit=dev --audit-level=high',
  'npm run verify:store:prepared -- --platform=android',
  'npm run verify:store:prepared -- --platform=ios',
  '--version="$RELEASE_VERSION_NAME"',
  '--build-number="$RELEASE_BUILD_NUMBER"',
  '--defines=firebase/mobile-dart-defines.env',
  'flutter build appbundle',
  'build/app/outputs/bundle/release/app-release.aab',
  'build/app/outputs/mapping/release/mapping.txt',
  'build/app/outputs/native-debug-symbols/release/native-debug-symbols.zip',
  '--obfuscate',
  '--split-debug-info="$dart_symbols"',
  'build/symbols/android/${RELEASE_VERSION_NAME}+${RELEASE_BUILD_NUMBER}',
  "-name '*.symbols' -size +0c",
  'jarsigner -verify',
  '0x4000',
  'runs-on: macos-26',
  'xcode_major',
  'xcode_minor',
  'Xcode 26.2 or newer is required',
  'PrivacyInfo.xcprivacy',
  'flutter build ios',
  '--no-codesign',
  'if-no-files-found: error',
  'External store upload: not performed',
];
const missingMobile = requiredMobileSnippets.filter(
  (snippet) => !mobileText.includes(snippet),
);
if (missingMobile.length > 0) {
  throw new Error(
    `Protected mobile workflow is missing required release checks: ${missingMobile.join(', ')}`,
  );
}

const requiredAndroidReleaseSnippets = [
  'debugSymbolLevel = "SYMBOL_TABLE"',
  'signingConfig = signingConfigs.getByName("release")',
];
const missingAndroidRelease = requiredAndroidReleaseSnippets.filter(
  (snippet) => !androidGradleText.includes(snippet),
);
if (missingAndroidRelease.length > 0) {
  throw new Error(
    `Android release configuration cannot satisfy protected workflow artifacts: ${missingAndroidRelease.join(', ')}`,
  );
}

let packageJson;
try {
  packageJson = JSON.parse(packageText);
} catch (error) {
  throw new Error(`Package manifest ${packagePath} is not valid JSON: ${error.message}`);
}

const fullEmulatorScript = packageJson.scripts?.['test:emulator:full'];
if (typeof fullEmulatorScript !== 'string' || fullEmulatorScript.trim() === '') {
  throw new Error('Package manifest is missing scripts["test:emulator:full"]');
}

const requiredFullEmulatorScriptSnippets = [
  'PAYMENT_WEBHOOK_SECRET=local-payment-webhook-secret',
  'FUNCTIONS_DISCOVERY_TIMEOUT=60',
  'firebase emulators:exec --project milana-local --only auth,firestore,functions,hosting',
];
const missingFullEmulatorScript = requiredFullEmulatorScriptSnippets.filter(
  (snippet) => !fullEmulatorScript.includes(snippet),
);
if (missingFullEmulatorScript.length > 0) {
  throw new Error(
    `scripts["test:emulator:full"] is missing required test isolation or emulator coverage: ${missingFullEmulatorScript.join(', ')}`,
  );
}

const requiredStoreSubmissionScripts = {
  'verify:store:submission:android': '--mode=submission --platform=android',
  'verify:store:submission:ios': '--mode=submission --platform=ios',
  'verify:play-publisher:self-test': 'node --test tool/test/publish_google_play_internal.test.mjs',
  'verify:app-store-publisher:self-test': 'node --test tool/test/publish_app_store_connect.test.mjs',
  'verify:mobile-builder:self-test': 'node --test tool/test/build_firebase_mobile.test.mjs',
  'publish:play:internal': 'node tool/publish_google_play_internal.mjs',
  'publish:app-store-connect': 'node tool/publish_app_store_connect.mjs',
};
for (const [scriptName, requiredInvocation] of Object.entries(requiredStoreSubmissionScripts)) {
  const script = packageJson.scripts?.[scriptName];
  if (typeof script !== 'string' || !script.includes(requiredInvocation)) {
    throw new Error(`scripts["${scriptName}"] must include ${requiredInvocation}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  workflows: [workflowPath, mobileWorkflowPath],
  androidGradle: androidGradlePath,
  package: packagePath,
  checked:
    requiredSnippets.length +
    1 +
    requiredMobileSnippets.length +
    requiredAndroidReleaseSnippets.length +
    requiredFullEmulatorScriptSnippets.length +
    Object.keys(requiredStoreSubmissionScripts).length,
}, null, 2));
