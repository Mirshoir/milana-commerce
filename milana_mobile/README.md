# Milana Premium Mobile

Customer-facing Capacitor application for Android and iOS. The website admin
panel and its SQLite-backed API remain the single source of truth for products,
customers, wishlists, and orders.

This directory is the active release application. The repository's
`milana_flutter` directory is retained only as a legacy experiment.

## Local Run

Start the mobile app bridge/static server:

```
npm start
```

Then open http://localhost:5411 — on a desktop browser it renders inside a
centered phone frame; on a phone it fills the screen (installable-friendly,
safe-area aware).

The mobile server connects to the production website backend at
`https://milanapremium.uz` by default. For local website development, override it
with `WEBSITE_API_BASE=http://127.0.0.1:4173`.
It stores only local mobile session conveniences in `data/store.json`.

Products, uploaded images, support tickets, and checkout orders are read from or
written to the website backend, so the website admin panel remains the control
center.

There is no embedded demo catalog. Product and customer data come from the
website API, whose production database source is SQLite.

## Production Rules

- Product source: `https://milanapremium.uz`
- Product database: website SQLite database
- Admin behavior: admin controls products, clients, and orders only from the website admin panel
- Mobile behavior: customer-facing app only
- Order units:
  - `1 qop = 60 pcs`
  - `1 qadoq = 6 pcs` (`pachka` in the website API)
- Auth: mobile customers sign in with the website customer auth; signup and forgot key/password recovery use website email-code verification

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Backend health and counts |
| `GET` | `/api/products` | Public catalog from the website backend |
| `GET` | `/api/products/:id` | Product detail from the website backend |
| `GET` | `/api/auth/me` | Current signed-in customer |
| `POST` | `/api/auth/signin` | Customer sign in |
| `POST` | `/api/auth/signup` | Customer account creation |
| `POST` | `/api/auth/email-otp/start` | Email verification code for signup and forgot key |
| `POST` | `/api/auth/recover` | Reset customer key/password |
| `POST` | `/api/auth/firebase` | Google or Apple/Firebase customer sign-in when configured |
| `POST` | `/api/auth/logout` | Customer logout |
| `DELETE` | `/api/auth/account` | Delete the signed-in customer account and anonymize retained order records |
| `GET` | `/api/auth/orders` | Signed-in customer orders |
| `GET` / `PUT` | `/api/wishlist` | Wishlist IDs/products for the current browser session |
| `POST` | `/api/orders` | Creates an order in the website backend database |

## Screens

| Screen | Deep link |
|---|---|
| Home (hero carousel, categories, brands, best sellers) | `/` |
| Category listing (tabs, sort/filter row, product grid) | `/?screen=categories` |
| Product detail (colors, sizes, add to cart) | `/?product=<product-id>` |
| Cart (qty steppers, order summary, checkout) | `/?screen=cart` |
| Wishlist | `/?screen=wishlist` |
| Profile | `/?screen=profile` |

## Features

- Paginated, API-backed catalog with remote search and stable deep links
- Working cart and cross-device wishlist; native auth tokens stay out of browser storage
- Customer auth, email-code signup, logout, Google and Apple/Firebase sign-in when configured, and forgot key/password recovery through the website backend
- In-app account deletion plus a public email-code deletion path at `https://milanapremium.uz/account/delete`
- Offline detection, retry UI, request timeouts, and safe network retries
- Category tabs, color/size selection, cart badge with bump animation
- Qop/qadoq cart unit selection with website-matching totals
- Checkout success overlay, empty states for cart/wishlist
- Android and iOS native projects with HTTPS-only transport, dark splash screen, status bar integration, and production asset preparation

## Verification

```bash
npm test
npm run mobile:sync
npm run android:debug
npm run check:store
```

`npm test` runs behavior checks and a native production preflight. Android debug
builds can run without release credentials. Release App Bundles intentionally
fail until the ignored upload-keystore configuration and Android Firebase file
are present. The iOS project can be compiled for Simulator without an Apple
signing identity.

`npm run check:store` is the strict publication gate. It remains red until
private native Firebase/signing files, current Xcode, Apple membership, Play
account verification, the required Play closed test, and production access are
all genuinely complete. See [`store/README.md`](store/README.md).

## Private Release Credentials

The following must not be committed to the repository:

- Android upload keystore, `android/key.properties`, and signed `.aab`
- Android Firebase `google-services.json` plus release SHA-1/SHA-256 fingerprints
- Apple distribution certificate and provisioning profile
- iOS Firebase `GoogleService-Info.plist` and Google reversed-client URL scheme

## Structure

- `index.html` — all screens' markup
- `styles.css` — design tokens from the UI kit (bg `#0B0E10`, accent `#A3453C`, Jost + Playfair Display)
- `app.js` — API-backed products, auth, cart/wishlist state, navigation
- `assets/` — current logo, category, brand, and hero media
