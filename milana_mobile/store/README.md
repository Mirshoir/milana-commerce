# Store Publication Readiness

This directory is the release handoff for the customer-facing Capacitor app with
bundle/application ID `uz.milanapremium.app`.

## Automated gates

Run:

```bash
npm test
npm run mobile:sync
npm run check:store
```

`check:store` intentionally fails until private signing/Firebase files and the
owner-only console requirements are genuinely complete. Copy
`store-readiness.example.json` to the ignored
`store-readiness.local.json`, then change a value to `true` only after the
corresponding console confirms completion.

Private release files must never be committed:

- `android/key.properties`
- Android upload `.jks`/`.keystore`
- `android/app/google-services.json`
- `ios/App/App/GoogleService-Info.plist`
- distribution certificates and provisioning profiles

The Google Play console answers are mapped in
[`google-play/app-content.md`](google-play/app-content.md). Do not guess these
answers or mark a manual gate complete before the Play Console confirms it.

## Public URLs

- Website: <https://milanapremium.uz>
- Support: <https://milanapremium.uz/support>
- Privacy Policy: <https://milanapremium.uz/privacy>
- Terms: <https://milanapremium.uz/terms>
- Account deletion: <https://milanapremium.uz/account/delete>

## Release order

1. Complete Google/Apple developer account verification.
2. Register the exact Android and iOS app IDs in Firebase and add the private
   native configuration files.
3. Enable Google and Apple providers in Firebase Authentication. Set
   `FIREBASE_APPLE_ENABLED=1` on the backend only after Apple is configured.
4. Create the Play upload key, keep it backed up securely, and configure Play
   App Signing.
5. Complete the Google Play App content forms and provide a working reviewer
   account for the signed-in order flow.
6. Run local native device QA and `npm run check:store`.
7. Upload an Android App Bundle to **closed testing**, not production.
8. Complete the required Google Play closed test and obtain production access.
9. Archive the iOS app with the currently required Xcode/iOS SDK, upload to
   TestFlight, and complete App Review metadata.

No script can complete identity verification, receive an SMS, accept legal
agreements, recruit testers, or truthfully mark a test as completed. Those
owner-only gates remain visible in `check:store` so they cannot be overlooked.
