# Milana Flutter Firebase Setup

This Flutter app is Firebase-ready. It runs in two modes:

- Firebase mode: pass Firebase config with `--dart-define`; catalog and account data use Firestore/Firebase Auth, while checkout uses the manager-aware public website API. Saved products sync to `customers/{uid}.saved_product_ids`, recently viewed products sync to `customers/{uid}.recent_product_ids`, and the wholesale qop cart syncs to `customers/{uid}.cart_items`.
- Local development mode: without Firebase config, catalog/orders/support use the existing local website API at `API_BASE_URL`. The last successful catalog, saved products, and cart items persist locally with `shared_preferences`.

## 1. Create or select Firebase project

```bash
firebase login
firebase projects:list
npm run prepare:firebase -- --project your-project-id
```

`prepare:firebase` writes:

- `.firebaserc`
- `firebase/web-app-config.json`
- `firebase/flutter-dart-defines.env`

It also creates a Firebase Web app named `Milana Flutter` if the selected project does not have one yet.

Prepare Android/iOS Firebase apps and download native config files:

```bash
npm run prepare:firebase:mobile -- --project your-project-id
```

Defaults:

- Android package: `uz.milana.milana_flutter`
- iOS bundle ID: `uz.milana.milanaFlutter`
- Android output: `android/app/google-services.json`
- iOS output: `ios/Runner/GoogleService-Info.plist`
- Mobile Dart defines output: `firebase/mobile-dart-defines.env`

Both generated web and mobile define files include
`API_BASE_URL=https://milanapremium.uz`.

The Flutter app uses platform-specific Firebase app IDs when present:

- Web: `FIREBASE_WEB_APP_ID`
- Android: `FIREBASE_ANDROID_APP_ID`
- iOS: `FIREBASE_IOS_APP_ID`

For Android release signing, create `android/key.properties` locally or in CI before a release build:

```properties
storePassword=...
keyPassword=...
keyAlias=upload
storeFile=app/upload-keystore.jks
```

Keep `android/key.properties` and the keystore out of git.

## 2. Enable Firebase products

In Firebase Console:

- Enable Authentication with Email/Password.
- Enable Cloud Firestore.
- Enable Cloud Functions billing/deployment for callable checkout.
- Optional later: enable Storage for product images if images move away from the existing catalog URLs.

## 3. Export and import catalog

Keep the existing Milana website backend running, then export the catalog:

```bash
npm run export:catalog
npm run mirror:images
```

`export:catalog` writes the raw API export to
`firebase/catalog.products.json`. `mirror:images` creates
`firebase/catalog.firebase-products.json`, downloads absolute remote product
images into the ignored `firebase/image-cache`, and rewrites all image values
to Firebase Hosting paths such as `/uploads/model.jpg`. Relative images are
resolved during the Firebase web build from the website upload directory, the
cache, or `https://milanapremium.uz`, in that order.

Import to Firestore with a service account JSON:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
FIREBASE_PROJECT_ID=your-project-id \
npm run import:catalog
```

Or with an OAuth access token:

```bash
FIRESTORE_ACCESS_TOKEN="$(gcloud auth application-default print-access-token)" \
FIREBASE_PROJECT_ID=your-project-id \
npm run import:catalog
```

If `gcloud` is not installed, pass a token directly:

```bash
npm run import:catalog -- --project your-project-id --access-token "ya29..."
```

The import writes product documents from `firebase/catalog.firebase-products.json` into `products`. Image values are `/uploads/...`; after each Flutter web build run:

```bash
npm run sync:uploads
```

That packages every referenced image into `build/web/uploads` for Firebase
Hosting. The command validates image signatures and content types, downloads a
missing relative image from the canonical website into the ignored cache, and
fails if any catalog image cannot be resolved. Use
`FIREBASE_UPLOADS_SOURCE_URL` to select a different reviewed source. The
hosting verification also requests a real catalog image and rejects Firebase's
SPA HTML fallback.

## 4. Deploy functions, rules, and hosting

```bash
firebase deploy --project your-project-id --only functions
firebase deploy --project your-project-id --only firestore:rules,firestore:indexes
npm run deploy:firebase:web
npm run verify:firebase -- --project your-project-id --service-account /path/to/service-account.json
```

Checkout first loads active managers from `GET /api/managers`, requires the
customer to select one, and sends `manager_id`, `source: "flutter"`, and the
qop items to `POST /api/orders`. That keeps server-side totals, stock rules,
manager assignment, and manager-specific Telegram delivery in one backend.
Native builds call the HTTPS API directly. A Firebase-hosted web build uses
the `listCheckoutManagers` and `placeWebsiteOrder` callable proxies because
the API and Hosting origins differ; both proxies forward to the same public
API and never create a second manager-unaware Firebase order.

The older `placeOrder` callable remains available for legacy/emulator
verification, but current Flutter checkout does not use it.

`verify:firebase` checks the Firebase Web/Android/iOS apps, active product count, Firebase-hosted `/uploads/...` product images, Hosting URL, deployed checkout API proxies and the remaining support/payment/admin Cloud Functions, and required Function runtime configuration such as `PAYMENT_WEBHOOK_SECRET` on `paymentWebhook`. Use `--skip-mobile-apps`, `--skip-functions`, `--skip-function-env`, `--skip-hosting`, or `--skip-image-hosting` only for partial troubleshooting.

### Admin and ERP roles

Trusted manager and ERP worker accounts need Firebase Auth custom claims before they can update catalog, payment, order, support, or ERP outbox records. Use a service account with Firebase Auth admin access:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json \
npm run admin:claims -- --project your-project-id --email manager@milana.example --admin true --manager true
```

Create the ERP bridge sign-in account with:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json \
npm run admin:claims -- --project your-project-id --email erp-bridge@milana.example --create --password 'strong-worker-password' --admin true --erp-bridge true
```

Use `--dry-run` first to inspect the target user and resulting claims without writing changes.

### Payment webhooks

Set `PAYMENT_WEBHOOK_SECRET` in Cloud Functions. Callback senders must POST JSON to `paymentWebhook` with `x-milana-signature: sha256=<hmac>`, where the HMAC is SHA-256 over the raw request body. The payload accepts `provider` (`click`, `payme`, `card`, `bank`, `erp`, or `manual`), `event_id`, either `order_id` or `reference`, `status`, optional `amount`, `currency`, `provider_payment_id`, `paid_at`, and `note`. Status aliases like `success`, `succeeded`, or `completed` become `paid`; failed/cancelled/refunded aliases are normalized too. Repeated delivery of the same `provider + event_id` is idempotent and returns `duplicate: true`.

## 5. Build mobile apps with Firebase

After running `npm run prepare:firebase:mobile -- --project your-project-id`:

```bash
npm run build:firebase:android
npm run build:firebase:ios:nocodesign
```

`build:firebase:android` reads `firebase/mobile-dart-defines.env` and builds a release APK. `build:firebase:ios:nocodesign` builds iOS with the same Firebase settings without code signing, which is useful for CI validation.

## Local Firebase emulator mode

This tests the app in Firebase mode before a production Firebase project is ready.

Terminal 1:

```bash
npm run build:emulator:web
npm run emulators
```

Terminal 2, after emulators start:

```bash
npm run import:catalog:emulator
```

One-command Firestore emulator catalog verification:

```bash
npm run test:emulator:catalog
```

One-command customer order/support rules verification:

```bash
npm run test:emulator:rules
```

One-command callable checkout verification:

```bash
npm run test:emulator:checkout
```

One-command full Firebase emulator verification:

```bash
npm run test:emulator:full
```

The emulator scripts set `FUNCTIONS_DISCOVERY_TIMEOUT=60` so callable functions have enough time to publish definitions on local machines where the host Node version differs from the requested Functions runtime.

Then open:

- App: `http://127.0.0.1:5000`
- Emulator UI: `http://127.0.0.1:4000`

For local testing against the existing backend:

```bash
flutter run -d chrome --dart-define=API_BASE_URL=http://127.0.0.1:4173
```

For Android emulator against the local backend:

```bash
flutter run -d emulator --dart-define=API_BASE_URL=http://10.0.2.2:4173
```

## Firestore collections expected by the app

### `products`

Product documents should match the existing website API shape:

```json
{
  "slug": "f-2219",
  "name": "F-2219",
  "gender": "women",
  "category": "homewear",
  "price": 4.5,
  "sizes": ["44", "46", "48", "50", "52", "54"],
  "images": ["https://.../product.jpg"],
  "model_no": "F-2219",
  "variant": "",
  "fabric_uz": "Suprem",
  "desc_uz": "Milana Premium model",
  "rating": 4.8,
  "reviews": 0,
  "active": true,
  "available_qop": 12
}
```

### `customers`, `orders`, `payments`, `support_requests`, `erp_events`

The Flutter app creates and updates `customers/{uid}` profile documents for signed-in users, including `city` and `address` delivery defaults, `saved_product_ids` for account-synced saved products, `recent_product_ids` for cross-device recently viewed products, and `cart_items` for cross-device wholesale cart restore. Each `cart_items` entry stores a compact product snapshot, qop quantity, unit price, images, and size data; Firestore rules cap the profile cart and recent products at 100 items and limit profile `city` to 80 chars and `address` to 200 chars. The legacy `placeOrder` Cloud Function creates Firebase `orders` and `payments` for emulator/backward-compatibility flows; current checkout uses the shared website backend described above. `cancelOrder` and `submitPaymentProof` apply to those Firebase-backed legacy orders. The `updateProductAvailability`, `updatePaymentStatus`, `updateOrderStatus`, and `updateSupportStatus` Cloud Functions let trusted admin/ERP users update catalog availability, payment, fulfillment status, Cargo tracking, and support replies without exposing direct writes to client apps. The `createSupportTicket` Cloud Function creates `support_requests`. Mutating Cloud Functions create private `erp_events` with `type`, `entity_type`, `entity_id`, `actor`, `payload`, `status: pending`, `attempts`, `created_at`, and `updated_at`. Client apps cannot read or write `erp_events`; ERP bridge code should call `claimErpEvents` with a worker name and lease duration, push each payload to the Milana ERP, then call `ackErpEvent` with `processed` plus an ERP external id or `failed` plus an error message. If a worker crashes while events are `processing`, a later `claimErpEvents` call reclaims them after `lease_until` passes.

## ERP bridge worker

After the real ERP endpoint exists, run the bridge as a scheduled worker:

```bash
FIREBASE_PROJECT_ID=your-project-id \
FIREBASE_API_KEY=web-api-key \
ERP_BRIDGE_EMAIL=erp-worker@milana.example \
ERP_BRIDGE_PASSWORD='strong-password' \
ERP_WEBHOOK_URL=https://erp.example.com/milana/events \
ERP_WEBHOOK_SECRET='shared-hmac-secret' \
npm run erp:bridge
```

The `ERP_BRIDGE_EMAIL` user must exist in Firebase Auth and have the custom claim `admin: true`. The worker signs in, calls `claimErpEvents`, POSTs each event to `ERP_WEBHOOK_URL`, then calls `ackErpEvent`. Webhook requests include `x-milana-event-id`, `x-milana-event-type`, and, when `ERP_WEBHOOK_SECRET` is set, `x-milana-signature: sha256=<hmac>`. Use `--dry-run` or `ERP_BRIDGE_DRY_RUN=1` to claim and acknowledge via dry payloads during staging without a live ERP endpoint.

## Business rules implemented

- Product cards show one clothing price only.
- Checkout total is `unit price × 60 × qop quantity`.
- One qop contains 60 clothes: 6 sizes with 10 clothes per size.
- Numeric `available_qop` is a hard qop stock limit. Checkout reserves/decrements it atomically; omitted `available_qop` means the manager confirms stock manually. Cancelled or failed orders release reserved qop exactly once.
- Signed-in order owners can cancel early unpaid orders before submitting payment proof, or submit payment proof/reference details. The payment status becomes `submitted` until admin/ERP confirms it as `paid`, `failed`, or another reviewed status.
- Order creation, customer payment proof, admin payment updates, and admin fulfillment updates append customer-visible order activity entries.
- Product/order/payment/support mutations create private pending ERP outbox events for backend sync.
- ERP bridge workers lease events with `claimErpEvents`; leased records move to `processing`, expired leases can be reclaimed by a later worker, and `ackErpEvent` finalizes them as `processed` or `failed`.
- Payment method is recorded with customer instructions and starts as pending. Admin/ERP users can move it to `waiting_for_customer`, `submitted`, `paid`, `failed`, `cancelled`, or `refunded`; signed provider/ERP webhooks can also confirm or reject payment idempotently. Real Click/Payme/card charging still needs merchant account credentials and provider-specific request mapping.
