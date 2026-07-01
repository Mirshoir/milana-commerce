# Firebase Deployment Checklist

Use this when the real Milana Firebase project is available.

## Required Firebase project

- A dedicated Milana Firebase project ID.
- Authentication enabled with Email/Password.
- Cloud Firestore enabled.
- Cloud Functions enabled.
- Firebase Hosting enabled.
- Android release keystore available before publishing to Play Store.

## Required GitHub secrets

Add these repository secrets before running `.github/workflows/milana-flutter-firebase.yml` manually:

- `MILANA_FIREBASE_PROJECT_ID`: Firebase project ID.
- `MILANA_FIREBASE_SERVICE_ACCOUNT_JSON`: full service account JSON with access to:
  - Firebase project read/write management for web app config.
  - Firestore document write/read.
  - Firebase Functions deploy.
  - Cloud Functions read/list for deployment verification.
  - Firebase Hosting deploy.
  - Firestore rules/index deploy.
- `MILANA_PAYMENT_WEBHOOK_SECRET`: HMAC secret used by `paymentWebhook` for signed Click/Payme/card/ERP callbacks.

For the ERP bridge worker runtime, configure these in the worker host, not in the public Flutter app:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_API_KEY`
- `ERP_BRIDGE_EMAIL`
- `ERP_BRIDGE_PASSWORD`
- `ERP_WEBHOOK_URL`
- `ERP_WEBHOOK_SECRET`

For payment provider callbacks, configure this as a Cloud Functions runtime secret/env var:

- `PAYMENT_WEBHOOK_SECRET`: HMAC secret shared with Click/Payme/card/ERP callback sender.

The GitHub deploy workflow writes `MILANA_PAYMENT_WEBHOOK_SECRET` into `functions/.env.$MILANA_FIREBASE_PROJECT_ID` immediately before deploying Functions. Local deploys should do the same or export `PAYMENT_WEBHOOK_SECRET` in the Functions runtime environment.

## Manual workflow

1. Open GitHub Actions.
2. Run `Milana Flutter Firebase`.
3. Set `deploy` to `true`.
4. Confirm the `Validate Flutter app` job passes. It runs Flutter checks, function unit tests, Android debug build, catalog dry-run, and the full Firebase emulator verification.
5. After the workflow finishes, verify:
   - Firebase Hosting URL opens.
   - Catalog shows products.
   - Product image URLs in Firestore use `/uploads/...`, not Supabase URLs.
   - Several `/uploads/...` product image URLs open from Firebase Hosting.
   - Firebase Console has Web, Android, and iOS apps for Milana.
   - Firebase Console has the `placeOrder`, `createSupportTicket`, `submitPaymentProof`, `cancelOrder`, `updatePaymentStatus`, `paymentWebhook`, `updateOrderStatus`, `updateSupportStatus`, `updateProductAvailability`, `claimErpEvents`, and `ackErpEvent` functions in `asia-southeast1`.
   - Firebase Console has `products`, `customers`, `orders`, `payments`, and `support_requests` collections.
   - Firestore indexes include customer latest orders, customer latest support requests, ERP pending event claim order (`erp_events.status + created_at`), and expired ERP lease reclaim order (`erp_events.status + lease_until`).
   - The workflow `Verify Firebase deployment` step reports Web, Android, iOS, product count, product image checks, Hosting, `placeOrder`, `createSupportTicket`, `submitPaymentProof`, `cancelOrder`, `updatePaymentStatus`, `paymentWebhook`, `updateOrderStatus`, `updateSupportStatus`, `updateProductAvailability`, `claimErpEvents`, and `ackErpEvent`.
   - The same verification output shows `paymentWebhook.requiredEnvironment.PAYMENT_WEBHOOK_SECRET` as configured.
   - A staging payment callback can POST to `paymentWebhook` with `x-milana-signature: sha256=<hmac>` and mark a test order as paid once; repeated delivery returns `duplicate: true`.
   - Manager/admin Firebase Auth accounts have the custom claim `admin: true`.
   - The ERP worker Firebase Auth account exists and has the custom claims `admin: true` and `erp_bridge: true`.
   - A staging run of `npm run erp:bridge -- --dry-run` can claim and acknowledge test `erp_events`.

Admin/ERP claims can be set with:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json \
npm run admin:claims -- --project YOUR_PROJECT_ID --email manager@milana.example --admin true --manager true

GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json \
npm run admin:claims -- --project YOUR_PROJECT_ID --email erp-bridge@milana.example --create --password 'strong-worker-password' --admin true --erp-bridge true
```

## Mobile Firebase config

The GitHub deploy workflow runs this automatically. Run it locally if you need native Firebase files before the first CI deploy:

```bash
npm run prepare:firebase:mobile -- --project YOUR_PROJECT_ID
```

This creates or reuses:

- Android Firebase app for `uz.milana.milana_flutter`
- iOS Firebase app for `uz.milana.milanaFlutter`

It downloads:

- `android/app/google-services.json`
- `ios/Runner/GoogleService-Info.plist`

## Local equivalent

```bash
npm --prefix functions ci --omit=dev
npm run prepare:firebase -- --project YOUR_PROJECT_ID
npm run prepare:firebase:mobile -- --project YOUR_PROJECT_ID
firebase deploy --project YOUR_PROJECT_ID --only functions
firebase deploy --project YOUR_PROJECT_ID --only firestore:rules,firestore:indexes
GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json npm run import:catalog -- --project YOUR_PROJECT_ID
npm run deploy:firebase:web
npm run verify:firebase -- --project YOUR_PROJECT_ID --service-account /path/service-account.json
npm run build:firebase:android
npm run build:firebase:ios:nocodesign
```

## Current blocker

The currently logged-in Firebase account only lists `kotiba-ai-mobile` and `payoma-f123a`. New project creation failed because the account project quota is exceeded. Do not deploy Milana into those projects unless the owner explicitly confirms that choice.
