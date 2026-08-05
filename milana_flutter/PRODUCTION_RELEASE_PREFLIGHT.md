# Production mobile release preflight

`tool/verify_production_release.mjs` is a read-only, network-free release gate for
the Flutter mobile app. It reports all detected blockers in one run and exits
non-zero before an invalid Play or App Store build starts.

## Commands

```sh
npm run verify:release:mobile
npm run verify:release:android
npm run verify:release:ios
npm run verify:release:self-test
npm run verify:release:live
npm run verify:release:live:self-test
```

`npm run build:firebase:android` automatically runs the Android gate before it
creates the release App Bundle. Debug APK builds remain independent of the
production gate. That local build command does not run the networked live gate
or the protected workflow's post-build artifact inspection; it is not the
submission-artifact path.

The platform preflight and its self-test are network-free.
`verify:release:live` is a separate networked availability gate used by the
protected mobile release workflow.

## Required production configuration

By default, values come from `firebase/mobile-dart-defines.env`. A matching
process-environment value overrides the file value for CI validation. CI values
must also be included in the Dart defines passed to the Flutter build; the
preflight validates configuration but never writes or injects secrets.

Firebase and backend values:

```dotenv
FIREBASE_API_KEY=AIza...
FIREBASE_PROJECT_ID=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_ASSET_BASE_URL=https://...
FIREBASE_ANDROID_APP_ID=1:...:android:...
FIREBASE_ANDROID_PACKAGE=uz.milana.milana_flutter
FIREBASE_IOS_APP_ID=1:...:ios:...
FIREBASE_IOS_BUNDLE_ID=uz.milana.milanaFlutter
API_BASE_URL=https://...
```

Public legal and support destinations:

```dotenv
PRIVACY_POLICY_URL=https://milanapremium.uz/privacy
TERMS_OF_SERVICE_URL=https://milanapremium.uz/terms
ACCOUNT_DELETION_URL=https://milanapremium.uz/delete-account
SUPPORT_URL=https://milanapremium.uz/support
```

For compatibility, `TERMS_URL`, `ACCOUNT_DELETION_REQUEST_URL`, and
`DELETE_ACCOUNT_URL` are accepted aliases. The canonical names above are
recommended.

On a fresh setup, `npm run prepare:firebase:mobile` requires these destinations
through `--privacy-url`, `--terms-url`, `--deletion-url`, and `--support-url`, or
through matching environment values. Existing reviewed values in
`firebase/mobile-dart-defines.env` are preserved. The preparation script refuses
to manufacture placeholder policy URLs.

Android release signing also requires `android/key.properties`:

```properties
storePassword=...
keyPassword=...
keyAlias=...
storeFile=upload-keystore.jks
```

Relative `storeFile` paths are resolved from `android/app`, matching Gradle's
application-module behavior. Signing secrets and Firebase API keys are never
printed by the verifier.

## Checks enforced

- API, asset, privacy, terms, deletion, and support URLs use public HTTPS hosts.
- Required mobile Firebase values exist, are not placeholders, have plausible
  formats, and use matching messaging-sender IDs.
- Firebase package/bundle values match the immutable Android and iOS IDs.
- `pubspec.yaml` contains a valid semantic version and positive store build
  number.
- Android reads its version from Flutter and the production package script
  explicitly builds a release AAB, not an APK/debug/profile artifact.
- The production Android manifest disables cleartext traffic and backup, points
  at legacy and Android 12+ extraction rules, and those rules exclude shared
  preferences from cloud backup and device transfer.
- Android signing properties are complete and the configured upload keystore is
  a non-empty file.
- The iOS Runner configurations agree on one bundle ID and `Info.plist` sources
  it from `PRODUCT_BUNDLE_IDENTIFIER`.
- The iOS app declares exempt-only encryption use and includes an app privacy
  manifest with tracking disabled and the required first-party data inventory.

The preflight deliberately does not contact URLs, validate signing certificates,
inspect built artifacts, upload artifacts, or replace physical-device and
store-track testing. The protected workflow adds signing/artifact checks after
the build.

## Live endpoint verification

`npm run verify:release:live` reads the same defines file and performs HTTPS GET
requests against:

- `API_BASE_URL/api/products?limit=1`;
- the configured privacy policy;
- terms of service;
- account-deletion resource; and
- support resource.

It follows redirects, requires successful status codes, requires a non-empty
catalog JSON array, and rejects empty or very short policy documents.
Environment values override matching file values, as with the static verifier.

This gate proves availability and basic response shape only. It does not review
legal wording, confirm that a deletion request can be completed, validate the
Firebase-to-website session bridge, call authenticated order/support/payment
endpoints, verify deployed callable versions, or inspect a mobile artifact.
Complete those checks through legal review, backend verification, protected
release jobs, and store-track smoke tests.

## CI output

Use `--json` for structured output:

```sh
node tool/verify_production_release.mjs \
  --platform all \
  --artifact appbundle \
  --mode release \
  --json
```

Other supported overrides are shown by:

```sh
node tool/verify_production_release.mjs --help
```

The live verifier also supports structured output:

```sh
npm run verify:release:live -- --json
```
