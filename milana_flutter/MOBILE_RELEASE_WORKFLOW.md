# Protected mobile release workflow

The manual `Milana Mobile Release Candidate` workflow builds and verifies a
signed Android App Bundle and, by default, compiles an unsigned iOS release on
the current stable Xcode supplied by GitHub's `macos-26` runner. It never sends
an artifact to Google Play or App Store Connect.

## One-time GitHub configuration

Create an environment named `mobile-release`, require designated reviewers,
prevent self-review, and restrict deployment branches or tags. Store these
environment secrets in it:

| Secret | Required value |
| --- | --- |
| `MILANA_RELEASE_GUARD` | Exact text `MOBILE_RELEASE_APPROVED` |
| `MILANA_ANDROID_UPLOAD_KEYSTORE_BASE64` | Base64 of the Play upload JKS file |
| `MILANA_ANDROID_KEY_ALIAS` | Alias in that JKS file |
| `MILANA_ANDROID_KEY_PASSWORD` | Password for the upload key |
| `MILANA_ANDROID_STORE_PASSWORD` | Password for the JKS file |
| `MILANA_MOBILE_DART_DEFINES_BASE64` | Base64 of the reviewed production `firebase/mobile-dart-defines.env` |

Generate single-line base64 values without committing the source files:

```sh
base64 < android/app/upload-keystore.jks | tr -d '\n'
base64 < firebase/mobile-dart-defines.env | tr -d '\n'
```

The defines file must contain every key in
`firebase/mobile-dart-defines.env.example`, including distinct public HTTPS
values for `PRIVACY_POLICY_URL`, `TERMS_OF_SERVICE_URL`,
`ACCOUNT_DELETION_URL`, and `SUPPORT_URL`. It must use the production
application and bundle IDs and point `API_BASE_URL` to HTTPS.

## Run and retrieve

In GitHub Actions, select `Milana Mobile Release Candidate`, choose the exact
branch or tag, enter a semantic `version_name`, enter a new positive
`build_number` between 1 and 2100000000, and type
`BUILD_SIGNED_MOBILE_RELEASE`. After an environment
reviewer approves the run, download the verified AAB and SHA-256 file from the
run's artifacts. The Android artifact also contains R8 `mapping.txt`,
`native-debug-symbols.zip`, and Flutter Dart `.symbols` files; retain all of
them with the release record for crash symbolization and deobfuscation. The
artifact is retained in GitHub Actions for 30 days.

The workflow fails when Flutter or Functions tests fail, a secret is absent, the
keystore cannot be opened, configuration is incomplete, a live production
endpoint is unavailable, version/package metadata differs, or an inspected
artifact violates the checks below. The production API endpoint must be exactly
`https://milanapremium.uz`. Secrets and generated signing files are removed from
the runner even when a later step fails.

The release-candidate jobs run the platform-specific **prepared** listing gate,
then compare the requested version/build and every protected legal/support URL
with `pubspec.yaml` and `store/listing-metadata.json` after the protected defines
file is materialized. They intentionally do not run the publication gate:
physical-device screenshots must come from the signed Internal Testing or
TestFlight candidate, so requiring them before candidate creation would be
circular. Before an external upload or review submission, run the corresponding
fail-closed gate:

```sh
npm run verify:store:submission:android
npm run verify:store:submission:ios
```

Each command checks only its own store, so an Android candidate is not blocked
by App Store assets and an iOS candidate is not blocked by Play metadata.

## Android verification performed

The protected Android job:

- runs Flutter analysis/tests and Firebase Functions tests;
- runs the network-free production preflight and the separate live endpoint gate;
- creates one signed release AAB with the requested version and build number;
- validates AAB structure, JAR signature, and equality with the protected upload keystore;
- inspects the final merged manifest for API 36, non-debuggable mode, HTTPS-only traffic, backup/device-transfer exclusions, and the permission allowlist;
- requires ARM64 libraries and rejects native ELF load segments aligned below 16 KB; and
- builds obfuscated Dart code and requires the corresponding Flutter symbol files; and
- requires and uploads the R8 mapping and native debug-symbol archive with an AAB checksum.

These checks do not upload to Google Play, compare the upload certificate with
an independently recorded Play Console fingerprint, generate every Play split,
or replace Play App Bundle validation, Internal Testing, the pre-launch report,
and runtime testing on a 16 KB-capable device. Native ELF validation is one part
of 16 KB readiness; Play-generated APK packaging and runtime behavior remain
store-track gates.

## Guarded Play Internal Testing upload

`tool/publish_google_play_internal.mjs` implements the official edit flow:
insert edit, upload AAB, attach ProGuard mapping and native symbols, update the
`internal` track, validate the edit, then commit it with
`ERROR_IF_IN_REVIEW`. On a pre-commit failure it attempts to delete the open
edit. The tool never prints credentials and never performs network requests in
its default plan mode.

After downloading and independently verifying the protected Android artifacts,
review a plan:

```sh
npm run publish:play:internal -- \
  --version-name=1.0.0 \
  --version-code=1 \
  --aab=/path/app-release.aab \
  --mapping=/path/mapping.txt \
  --native-symbols=/path/native-debug-symbols.zip \
  --release-notes-en=store/listing/en-US/release-notes.txt \
  --release-notes-ru=store/listing/ru-RU/release-notes.txt
```

A real internal-track upload additionally requires a Play-authorized service
account plus both explicit switches:

```sh
npm run publish:play:internal -- \
  <the same artifact/version arguments> \
  --service-account=/protected/play-publisher.json \
  --commit \
  --confirmation=PUBLISH_PLAY_INTERNAL
```

Do not use commit mode until the package already exists in Play Console, the
upload certificate is independently confirmed, the candidate quality gates are
green, and the protected environment has approved the operation. Internal
Testing is not production publication and does not replace Play processing,
pre-launch review, tester installation, or the later publication gate.

## iOS candidate validation and guarded upload

The iOS job proves that release-mode code compiles with Xcode 26.2 or newer and
that the bundle identifier and requested version are correct. It also verifies
the packaged app privacy manifest, tracking-disabled declaration, declared data
categories, and `ITSAppUsesNonExemptEncryption=false`. Its output is deliberately
unsigned and is not uploaded as a distributable artifact.

`tool/publish_app_store_connect.mjs` provides a separate fail-closed upload step
for a signed distribution IPA. Its default mode performs no upload: it checks
the ZIP structure, requires exactly one app bundle, verifies the embedded
distribution profile and code-signature entries, inspects bundle/version/build
metadata, and prints the IPA checksum and intended operations.

Review a plan on macOS after exporting the signed IPA:

```sh
npm run publish:app-store-connect -- \
  --version-name=1.0.0 \
  --build-number=1 \
  --ipa=/protected/Milana.ipa
```

A real upload requires Xcode, an App Store Connect API private key installed in
an `altool`-supported private-key directory, the API key and issuer IDs in the
environment, and both explicit switches:

```sh
APP_STORE_CONNECT_API_KEY_ID=XXXXXXXXXX \
APP_STORE_CONNECT_API_ISSUER_ID=00000000-0000-0000-0000-000000000000 \
npm run publish:app-store-connect -- \
  --version-name=1.0.0 \
  --build-number=1 \
  --ipa=/protected/Milana.ipa \
  --commit \
  --confirmation=UPLOAD_APP_STORE_CONNECT
```

The uploader sends the binary to App Store Connect for processing; it does not
submit the app for review, select export-compliance answers, assign external
TestFlight groups, or release the app. Those remain explicit owner-reviewed
steps. Creating the signed IPA still requires an Apple Distribution certificate
and password, matching App Store provisioning profile, and reviewed export
options.

## Live endpoint gate scope

Both jobs require the configured production catalog, privacy, terms, deletion,
and support URLs to return successful substantive responses. This proves basic
availability only. It does not constitute legal review, prove that the deletion
resource completes a request, or exercise the authenticated website-session,
order, payment, cancellation, and support APIs. Those flows require separate
production-like smoke tests before store submission.
