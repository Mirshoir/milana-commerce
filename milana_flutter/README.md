# Milana Premium Flutter

Flutter storefront, ordering, and customer-account app for Milana Premium.

## What is included

- Catalog with real product photos/data from the shared Milana backend API.
- Last successful catalog is cached locally so the app can still open during short Firebase/API outages.
- Cached product imagery with branded loading and broken-image states for smoother catalog browsing.
- Gender/type filters and search.
- Saved products with guest-local persistence and Firebase customer profile sync after sign in.
- Recently viewed products with guest-local persistence and Firebase customer profile sync after sign in.
- Product detail sheet with similar model recommendations.
- Wholesale cart with guest-local persistence and Firebase customer profile sync after sign in.
- Website-driven order units: customers can choose a smaller Pack or a 60-piece Bag using each product's current API rules.
- Backend checkout: server-authoritative Pack/Bag units, stock and totals, order creation, payment status, and customer support through the shared Milana API.
- Customer order timeline for creation, payment review, and fulfillment updates.
- Production commerce source: the canonical Milanapremium website API, shared by the website admin panel, Flutter apps, and ERP. Its database driver is deployment-specific.
- Production account features use Firebase Auth for verified identity, then exchange the Firebase ID token for a revocable Milanapremium website session. Authenticated native and web commerce calls pass through Firebase callable proxies that bind the session to the verified account before forwarding it; browsing and limited guest flows can still work without an account.
- Production account lifecycle includes explicit legal consent and authenticated Firebase profile deletion/anonymization; the public website deletion process must be configured before store submission.
- Customer support form backed by the shared API.
- Firebase remains required for production identity and callable protection, but Firestore is not the canonical order/support database. Firebase Hosting, push, analytics, and emulator tooling remain optional capabilities.
- Branded Milana PWA manifest, favicon, install icons, and local no-cache preview server.

## Run locally

For a local browser preview backed by the live website API:

```bash
flutter build web --dart-define=API_BASE_URL=http://127.0.0.1:5411
PORT=5411 npm run serve:web
```

The preview server proxies only `/api` and `/uploads` to
`https://milanapremium.uz`, avoiding browser CORS restrictions without changing
the production server. Override the target with `API_PROXY_TARGET` when needed.

When running a local Milana backend on `4173` instead:

```bash
flutter run -d chrome --dart-define=API_BASE_URL=http://127.0.0.1:4173
```

Android emulator local backend:

```bash
flutter run -d emulator --dart-define=API_BASE_URL=http://10.0.2.2:4173
```

## Build web

```bash
flutter build web --dart-define=API_BASE_URL=http://127.0.0.1:4173
npm run sync:uploads
```

Firebase Hosting serves `build/web`.

Production web/mobile builds use
`--dart-define=API_BASE_URL=https://milanapremium.uz`. The Firebase
preparation scripts add this value to their generated define files
automatically.

To preview the built app locally:

```bash
PORT=5180 npm run serve:web
```

## Catalog export

```bash
npm run export:catalog
npm run mirror:images
```

This writes the raw catalog to `firebase/catalog.products.json`, then creates
`firebase/catalog.firebase-products.json` with product images represented as
`/uploads/...`. Firebase web builds resolve every referenced image from the
website upload directory, the ignored `firebase/image-cache`, or the canonical
`https://milanapremium.uz` asset source, in that order. Images are validated as
real raster files before being copied into `build/web/uploads`; a missing image
or an HTML fallback fails the build. Override the canonical source only when
needed with `FIREBASE_UPLOADS_SOURCE_URL=https://assets.example.com` or
`--uploads-source-url` on `tool/build_firebase_web.mjs`.

## Firebase setup

For production business data, use the shared Milanapremium commerce API and its
configured database. Firebase Auth is required for production account identity;
Firestore is retained for profile synchronization, compatibility, and Firebase
tooling rather than as the canonical commerce database.

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md).
For GitHub Actions deployment, see [FIREBASE_DEPLOYMENT_CHECKLIST.md](FIREBASE_DEPLOYMENT_CHECKLIST.md).

## Mobile release and store preparation

- [STORE_RELEASE_READINESS.md](STORE_RELEASE_READINESS.md) tracks completed work, owner inputs, and submission blockers.
- [MOBILE_RELEASE_WORKFLOW.md](MOBILE_RELEASE_WORKFLOW.md) documents the protected release-candidate workflow.
- [PRODUCTION_RELEASE_PREFLIGHT.md](PRODUCTION_RELEASE_PREFLIGHT.md) explains static and live release verification.
- The draft store privacy inventory, review notes, screenshot plan, and listing copy are under [`store/`](store/). They are preparation materials, not proof of publication or policy approval.

## Local Firebase emulator mode

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

One-command customer rules verification:

```bash
npm run test:emulator:rules
```

One-command legacy Firebase commerce lifecycle verification:

```bash
npm run test:emulator:checkout
```

This emulator harness exercises the legacy Firestore `placeOrder` lifecycle and
its payment/ERP rules. The production app uses the Milanapremium website-session
bridge; validate that path with the Flutter/Functions tests and an authenticated
smoke test against the deployed website and Firebase project.

One-command full Firebase emulator verification:

```bash
npm run test:emulator:full
```

Open the app at `http://127.0.0.1:5000` and Emulator UI at `http://127.0.0.1:4000`.

The repository intentionally includes `.firebaserc.example` instead of binding
source control to a production Firebase project. Once the owner has selected the
real project, prepare mobile configuration with reviewed public policy URLs:

```bash
npm run prepare:firebase -- --project your-project-id
npm run prepare:firebase:mobile -- \
  --project your-project-id \
  --asset-base-url https://milanapremium.uz \
  --privacy-url https://milanapremium.uz/privacy \
  --terms-url https://milanapremium.uz/terms \
  --deletion-url https://milanapremium.uz/delete-account \
  --support-url https://milanapremium.uz/support
firebase deploy --project your-project-id --only functions
firebase deploy --project your-project-id --only firestore:rules,firestore:indexes
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run import:catalog -- --project your-project-id
npm run deploy:firebase:web
npm run verify:firebase -- --project your-project-id --service-account /path/to/service-account.json
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run admin:claims -- --project your-project-id --email manager@milana.example --admin true --manager true
npm run build:firebase:android
npm run build:firebase:ios:nocodesign
```

The URL flags are mandatory on a fresh setup unless equivalent environment
values or an existing `firebase/mobile-dart-defines.env` provide them. Do not
deploy or build a store candidate until the pages are reviewed and live. Deploy
and verify the website account/session/order endpoints before deploying the
Firebase proxy callables that depend on them.

When app registrations are created in Firebase Console instead of the local
CLI, pass all four verified native values together with `--android-app-id`,
`--android-api-key`, `--ios-app-id`, and `--ios-api-key`. Use `--source-env`
to reuse the web app's project, sender, bucket, and web client configuration.
