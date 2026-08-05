# Milana Premium mobile release readiness

Last verified: 2026-08-04

## Completed in the repository

- Flutter analyzer passes with no issues.
- All 114 Flutter tests pass, including account-scoped persistence, crash-safe checkout recovery, live-catalog cart reconciliation, request timeouts, website-session propagation, backend provenance, responsive layout, sticky purchase actions, and 200% text/keyboard accessibility regressions.
- All 36 Firebase Functions tests, all 29 customer security-rule checks, and all
  34 release/tool regression tests pass.
- Firebase Functions 7.3.2 and the modular Firebase Admin SDK 14.2.0 load and pass the complete checkout/payment/support/ERP emulator flow. The production dependency audit has no high or critical findings; seven moderate `uuid` findings remain in the current upstream Google Cloud Storage dependency chain.
- Android debug APK builds successfully.
- Android production builds use an App Bundle and fail closed when upload signing is missing.
- Android release builds preserve native symbol tables, and the protected
  release workflow verifies R8 mapping, the generated native-symbol archive,
  and retained Flutter `.symbols` files for its obfuscated Dart build.
- Production Android traffic is HTTPS-only; development manifests can still reach local HTTP services.
- iOS deployment target is 15.0.
- Milanapremium launcher icons and launch artwork replace the stock Flutter assets.
- Release mode does not silently create local demo accounts when Firebase is unavailable.
- The browser preview is verified against the proxied live catalog API. Its
  semantic controls are available immediately for keyboard, screen-reader, and
  automated browser journeys.
- The current website catalog export contains 894 products and 898 referenced
  images. Firebase web builds validate and package every image; the hosting test
  rejects the SPA HTML fallback and verified a real 607,398-byte WebP response.
- Signup now records explicit Privacy Policy and Terms consent, and the account screen exposes privacy, terms, support, and deletion access.
- Verified Firebase accounts exchange their ID token for a Milanapremium website session; native and web commerce calls use Firebase callable proxies that validate the verified account email before forwarding the session to the canonical commerce backend.
- Order history, support history, payment proof, and eligible cancellation use the website-backed account APIs, with legacy Firestore records retained only as a compatibility fallback.
- Guest and signed-in cart, favorites, and recent-product state are isolated by account scope; account deletion clears the deleted account's device-scoped state.
- The authenticated `deleteCustomerAccount` callable anonymizes Firestore order/support/payment records, removes the customer profile, and deletes Firebase Auth.
- The static production preflight fails closed on missing mobile configuration, public-HTTPS URL syntax, package identity, versioning, Android data-protection rules, iOS privacy declarations, and Android upload signing.
- A separate live gate requires the production catalog and configured privacy, terms, support, and deletion pages to return successful substantive responses.
- Android backup and device-transfer rules exclude app data, and the protected workflow verifies the final manifest, permission allowlist, ARM64/16 KB ELF alignment, signer, R8 mapping, and native symbols.
- The iOS source includes an app privacy manifest and exempt-encryption declaration; the protected workflow validates these in an unsigned iOS device build.
- Prepared English/Russian store copy, a 512×512 Play icon, a text-free
  1024×500 feature graphic, per-platform questionnaire/privacy/review/
  distribution records, asset hashes/rights records, and physical-device
  screenshot manifests are present. All unverified owner decisions remain
  explicitly `unknown`.
- Android and iOS publication gates are platform-specific and fail closed on
  their own owner, legal, privacy, rights, review-account, and physical-device
  inputs. Release-candidate jobs use the prepared gate plus exact version/build
  and protected-URL consistency, so screenshots captured from a candidate no
  longer circularly block creation of that candidate.
- A guarded Google Play publisher validates version consistency, AAB, R8
  mapping, native-symbol archive, localized notes, and the official edit request
  sequence. It is plan-only by default; a real Internal Testing commit requires
  Android Publisher credentials and the exact `PUBLISH_PLAY_INTERNAL`
  confirmation. No upload was performed in this workspace.
- A guarded App Store Connect publisher validates a signed IPA, its embedded
  provisioning/signature entries, bundle/version metadata, and checksum. It is
  plan-only by default; a real upload requires macOS, Xcode, App Store Connect
  API credentials, and the exact `UPLOAD_APP_STORE_CONNECT` confirmation.
- A protected manual GitHub workflow can build and verify a signed AAB and validate an unsigned iOS release without publishing externally; standard CI also compiles an unsigned iOS device release on Xcode 26.2+ after the main quality gate. The repository verifier now checks 85 guardrails across both CI workflows, package scripts, and the Android release configuration.
- Standard CI actions and Firebase CLI 15.22.2 are pinned, and standard CI is
  triggered when either mobile workflow changes.

## Required owner inputs before signed store builds

### Google Play

1. Confirm that `uz.milana.milana_flutter` is the final application ID.
2. Create and securely back up the Play upload keystore.
3. Add `android/key.properties` with:

   ```properties
   storePassword=...
   keyPassword=...
   keyAlias=...
   storeFile=upload-keystore.jks
   ```

4. Place the key at `android/app/upload-keystore.jks`.
5. Configure the production Firebase values and reviewed privacy, terms, deletion, and support URLs in `firebase/mobile-dart-defines.env`.
6. Deploy and verify the compatible Milanapremium website account/order endpoints and Firebase proxy callables.
7. Run the protected `Milana Mobile Release Candidate` workflow and use its verified AAB, checksum, R8 mapping, and native-symbol artifacts. A local `npm run build:firebase:android` output is for development validation, not the submission source.
8. Upload the protected workflow AAB to Play Internal Testing first and retain the mapping/symbol files with the release record.
9. Grant a dedicated service account the minimum Play Console permissions. Run
   the guarded publisher in plan mode, review its hashes/operations, then use
   commit mode only from a protected release environment.

### App Store

1. Confirm that `uz.milana.milanaFlutter` is the final bundle ID.
2. Upgrade the build machine to Xcode 26.2 or newer, which is required by the resolved Firebase Apple SDK.
3. Install the Apple Distribution certificate and App Store provisioning profile for team `49YZ89X9A5`.
4. Configure the production Firebase mobile values and reviewed privacy, terms, deletion, and support URLs.
5. Archive, validate, and upload through App Store Connect; begin with TestFlight internal testing.

## Policy and product blockers

- Publish reviewed Privacy Policy, Terms, and account-deletion request pages on `milanapremium.uz`.
- The currently configured live privacy and deletion URLs return 404, and the live Terms page identifies itself as a practical draft; these must be replaced with reviewed public documents.
- Deploy and verify `deleteCustomerAccount` and the website order/support/payment/cancellation proxy callables in the final Milana Firebase project.
- Complete the public deletion process for personally associated records held by the shared Milanapremium website/order backend; the Firebase callable intentionally cannot erase that separate database.
- Complete App Store privacy disclosures and Google Play Data Safety using the actual production data inventory.
- Resolve and owner-approve the structured questionnaire, commercial,
  SDK-privacy, rights, review-information, and screenshot records under
  `store/`; supply the public Play contact email and App Store SKU/copyright.
- Legally and commercially review the draft English/Russian copy and upload it
  with the category, age rating, review credentials, physical-device
  screenshots, rights-cleared Play graphics, and other console assets.
- Run checkout, authentication, offline-cache, relaunch, and account-lifecycle smoke tests on physical Android and iOS devices before submission.

## Release gates

Do not submit unless all of the following are true:

- `flutter analyze`, all Flutter tests, all Functions tests, the high/critical production dependency audit, and the static/live verifier self-tests pass.
- The production website account/session/order endpoints and matching Firebase proxy callables are deployed and pass authenticated smoke tests.
- The Android AAB comes from the protected workflow, is upload-key signed, targets API 36, passes the permission/data-protection and native 16 KB checks, and includes retained R8 mapping/native symbols.
- Play Console App Bundle validation and pre-launch checks pass, including Play-generated split installation on supported devices.
- A signed iOS archive built with the currently required Xcode/iOS SDK validates and reaches TestFlight; the repository's unsigned workflow is not a substitute for this gate.
- Production Firebase configuration is present, the verified Firebase-to-website account bridge is ready, and demo authentication is disabled.
- Live privacy, terms, support, and deletion URLs return successful responses and their legal content/processes have been reviewed.
- Website-backed deletion/anonymization is implemented and verified alongside Firebase deletion.
- Google Play Data Safety, App Store privacy answers, listing metadata, review credentials, and required creative assets match the final build.
- TestFlight and Play Internal Testing checkout/account smoke tests pass without duplicate or unlinked orders.
