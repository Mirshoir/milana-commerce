# Milana Premium Flutter

Flutter storefront for Milana Premium wholesale catalog.

## What is included

- Catalog with real product photos/data from the shared Milana backend API.
- Last successful catalog is cached locally so the app can still open during short Firebase/API outages.
- Cached product imagery with branded loading and broken-image states for smoother catalog browsing.
- Gender/type filters and search.
- Saved products with guest-local persistence and Firebase customer profile sync after sign in.
- Recently viewed products with guest-local persistence and Firebase customer profile sync after sign in.
- Product detail sheet with similar model recommendations.
- Wholesale cart with guest-local persistence and Firebase customer profile sync after sign in.
- Wholesale rule: 1 qop = 60 clothes, 6 sizes, 10 clothes per size.
- Backend checkout: server-side qop totals, order creation, payment status, and customer support through the shared Milana API.
- Customer order timeline for creation, payment review, and fulfillment updates.
- Production database target: PostgreSQL behind the Milana backend API, shared by website, Flutter apps, payment callbacks, and future ERP workers.
- Firebase Auth-ready sign in/sign up remains available as an optional identity layer.
- Customer support form backed by the shared API.
- Firebase Hosting/Firestore config remains useful for experiments, hosting, push, analytics, or Auth, but it is no longer the recommended main business database.
- Branded Milana PWA manifest, favicon, install icons, and local no-cache preview server.

## Run locally

Keep the Milana backend running on `4173`, then:

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

To preview the built app locally:

```bash
PORT=5180 npm run serve:web
```

## Catalog export

```bash
npm run export:catalog
npm run mirror:images
```

This writes the raw catalog to `firebase/catalog.products.json`, then creates `firebase/catalog.firebase-products.json` with all product images rewritten to `/uploads/...`. Remote catalog images are cached under `firebase/image-cache` and copied into `build/web/uploads` during Firebase web builds.

## Firebase setup

For production business data, use the shared backend API with PostgreSQL. Firebase
is optional for Auth, Hosting, push notifications, analytics, or temporary
emulator testing.

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md).
For GitHub Actions deployment, see [FIREBASE_DEPLOYMENT_CHECKLIST.md](FIREBASE_DEPLOYMENT_CHECKLIST.md).

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

One-command callable checkout verification:

```bash
npm run test:emulator:checkout
```

One-command full Firebase emulator verification:

```bash
npm run test:emulator:full
```

Open the app at `http://127.0.0.1:5000` and Emulator UI at `http://127.0.0.1:4000`.

The currently logged-in Firebase account has no obvious Milana project, so this repo includes `.firebaserc.example` instead of binding to an unrelated project. Once the real project exists:

```bash
npm run prepare:firebase -- --project your-project-id
npm run prepare:firebase:mobile -- --project your-project-id
firebase deploy --project your-project-id --only functions
firebase deploy --project your-project-id --only firestore:rules,firestore:indexes
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run import:catalog -- --project your-project-id
npm run deploy:firebase:web
npm run verify:firebase -- --project your-project-id --service-account /path/to/service-account.json
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run admin:claims -- --project your-project-id --email manager@milana.example --admin true --manager true
npm run build:firebase:android
npm run build:firebase:ios:nocodesign
```
