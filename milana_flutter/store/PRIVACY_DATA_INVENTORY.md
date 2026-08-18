# Store privacy and Data Safety inventory

Status: **Draft and release-blocking until the open classifications and retention periods are reviewed.**

This is an internal worksheet for App Store privacy labels and Google Play Data
Safety, not a completed console declaration. Final answers must be checked
against the deployed Firebase project, Milanapremium website API and database,
ERP and Telegram integrations, hosting logs, and every enabled SDK.

The machine-readable companion `store/compliance/privacy-data.json` separately
lists Firebase Auth, Cloud Firestore, Cloud Functions, Messaging, and opt-in Analytics data for
Android and iOS, including IP address, user agent/app identifiers, signed-in
user ID, function name, and FCM token where applicable. Every nullable field,
purpose, processor role, retention rule, and deletion rule remains
release-blocking until owner-approved against the deployed configuration.

| Data | Linked to user | Collection/sharing status | Purpose and processors | Retention/deletion treatment |
| --- | --- | --- | --- | --- |
| Name | Yes | Collected; processor-sharing classification pending | Account, order fulfillment, support; Firebase and website commerce | Firebase profile deleted; website deletion/anonymization remains a release blocker |
| Email | Yes | Collected; processor-sharing classification pending | Authentication, verification, order contact; Firebase Auth/profile and website commerce | Firebase identity deleted; website copy remains blocked on backend deletion |
| Phone | Yes | Collected; may be included in manager operations | Manager contact, delivery, support; Firebase, website commerce, and operational notifications | Website/notification retention and deletion must be documented |
| City, physical address, postcode, and delivery note | Yes | Collected | Fulfillment and delivery; Firebase profile and website commerce | Firebase profile deleted; website order PII needs reviewed anonymization/retention |
| Company name, contact name, phone, email, country, and city | Yes or potentially identifying | Collected when a user applies for partnership | Distributor qualification and sales follow-up; Cloud Firestore, Cloud Functions, and sales operations | Signed-in applications are anonymized during Firebase account deletion; guest lead retention and downstream sales-system deletion require an approved policy |
| Firebase UID and website customer ID | Yes | Collected | Authentication and account-to-order linking; Firebase and website commerce | Firebase UID deleted; website identifier requires backend deletion/anonymization |
| Firebase ID token and website session token/hash | Yes | Used for authentication; not advertising/tracking | Verified account bridge and authorized commerce requests; Firebase and website commerce | Firebase SDK manages its credential persistence; the website token is held in app memory and the server stores its hash; confirm TTL and log retention |
| Legal-consent version and acceptance timestamp | Yes | Collected | Record Privacy Policy/Terms acceptance; Firestore profile | Delete with the Firebase profile unless a reviewed legal requirement says otherwise |
| Purchase history and order items | Yes | Collected; ERP/manager processing review required | Fulfillment, support, accounting; website commerce, ERP, and legacy Firestore records | Retain only reviewed operational/legal transaction fields and remove account PII |
| Payment method, reference, amount, and note | Yes | Collected; payment/manager processor review required | Payment confirmation and fraud prevention; website commerce and legacy Firestore | Define statutory/operational retention and anonymization before submission |
| Support topic, message, reply, and attachments/links if enabled | Yes when signed in | Collected | Customer support; website commerce or legacy Firestore | Delete/anonymize with the account subject to reviewed support-retention rules |
| AI assistant message | Potentially | Collected when submitted | Catalog/service answers; website chat API | Define provider, retention, logging, and deletion in the public privacy policy |
| Saved product IDs, recent products, and cart | Yes when signed in | Collected; device copy also retained | App functionality and personalization; Firestore and account-scoped device storage | Firebase profile and deleted account's device scope are cleared; verify other signed-in devices |
| Product search query and result count | Potentially | Sent to the website smart-search API; also recorded by Firebase Analytics only after opt-in | App functionality and analytics; website commerce API and Firebase Analytics | Define website access/search-log retention and confirm Firebase Analytics retention before submission |
| Product views, wishlist additions, cart additions, checkout starts, submitted wholesale orders, distributor leads, authentication method, and AI-assistant engagement | Potentially | Recorded by Firebase Analytics only after explicit in-app opt-in | Product analytics and conversion measurement; Firebase Analytics, with Google Ads only after an approved project linkage | Analytics can be disabled in-app; approve Firebase retention and any Ads destination/deletion treatment before linking |
| Network address, request metadata, Firebase installation/auth metadata, and service diagnostics | Potentially | Collected automatically; exact declarations pending | Security, fraud prevention, authentication, and service operation; hosting and Firebase SDKs | Confirm each provider's retention and Data Safety/App Privacy guidance |
| Push-notification token, device platform, language, preferences, delivery result, and notification inbox | Yes when signed in | Collected after user opt-in; processor-sharing classification pending | Transactional and partnership communications; Firebase Cloud Messaging, Cloud Functions, and Firestore | Device and inbox records are deleted with the Firebase account; stale invalid tokens are removed after failed delivery; define routine expiry for inactive tokens |
| Telegram manager notifications and ERP events | Yes when order/support PII is included | Operational transfer; sharing classification pending | Order routing, fulfillment, and support | Minimize fields, restrict recipients, and document retention/deletion behavior |

## Open decisions before console submission

- Classify each Firebase, hosting, ERP, Telegram, payment, and manager transfer as
  collection, service-provider processing, or sharing under each store's rules.
- Record concrete retention periods and deletion/anonymization behavior for every
  server-side system and log source.
- Reconcile automatic Firebase/SDK collection, opt-in Analytics, and any Google Ads linkage against the final dependency set.
- Verify that public policy wording, in-app disclosures, Google Play Data Safety,
  and App Store privacy answers all describe the same behavior.
- Complete website-backed account deletion and test it before marking any row as
  fully deletable.

Tracking is declared disabled in the iOS application privacy manifest, and
Firebase Analytics collection defaults to off on Android and iOS until the
customer opts in. Google
Play Data Safety is a separate declaration. The app does not request advertising
ID, location, contacts, camera, microphone, photos, health, or Bluetooth
permissions. Reconfirm the final merged Android manifest, Play-generated APKs,
iOS archive, embedded SDK manifests/signatures, and production dependency set
before each store submission.

The app sells physical clothing. Apple In-App Purchase and Google Play Billing are not used.
