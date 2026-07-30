# Google Play Data Safety Draft

This is a release-owner worksheet based on the current app and backend. Recheck
every answer against the final production build and every enabled third-party
service before submitting it in Play Console.

## Security and deletion

- Data is encrypted in transit: **Yes**. The release app and API reject cleartext
  HTTP.
- Users can request account deletion: **Yes**.
- In-app deletion path: **Account > Delete Account**.
- Web deletion URL: <https://milanapremium.uz/account/delete>.
- Privacy Policy: <https://milanapremium.uz/privacy>.
- Data sold: **No**.
- Advertising or cross-app tracking: **No**, provided no advertising/tracking
  SDK is added to the release build.

## Data collected

| Play data type | Examples in Milana | Purpose |
|---|---|---|
| Name | account, order recipient, support request | account management, order fulfillment, support |
| Email address | login, email verification, recovery, support | authentication, account management, support |
| Phone number | customer profile, order confirmation | order fulfillment, customer support |
| User IDs | internal customer/session IDs, Firebase identity | authentication, fraud prevention, account sync |
| Device or other IDs | Firebase Authentication app and authentication identifiers | authentication, security, service operation |
| Address | city, delivery address, postcode | order fulfillment |
| Purchase history | products, quantities, order and payment status | order processing, customer order history |
| App interactions | saved items and server-synced account actions | app functionality and personalization |
| Other user-generated content | support/chat messages and delivery notes | support and order fulfillment |

The app currently does not collect precise location, contacts, health data,
calendar data, browsing history, audio, or payment card credentials.

Firebase Authentication also transmits IP addresses, Firebase app identifiers,
and Firebase/device/app user-agent metadata for authentication security and
service operation. Recheck Google's current Firebase disclosure documentation
when completing the form; SDK behavior can change between releases.

## Service providers

Firebase Authentication processes identity data as a service provider. Hosting,
email delivery, support notification, and optional AI-assistant providers may
process only the data required to deliver those features. Under Google Play's
definitions, service-provider processing is not automatically “sharing,” but
contracts and final data flows must be reviewed before answering the form.

## Retention

Deleting an account removes the customer profile, sessions, saved items,
reviews, coupons, and associated chat data. Legally required order records may
be retained only after customer identity fields are anonymized. Support records
are redacted. The public policy must remain consistent with actual production
behavior.

Official form guidance:
<https://support.google.com/googleplay/android-developer/answer/10787469>

Firebase Android disclosure guidance:
<https://firebase.google.com/docs/android/play-data-disclosure>
