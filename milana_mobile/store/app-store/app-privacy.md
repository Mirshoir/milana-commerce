# App Store Privacy Draft

Verify these selections against the final App Store build and all production
providers before submission.

## Data linked to the user

- Contact Info: name, email address, phone number, physical address.
- Purchases: order history and manually confirmed payment status.
- User Content: support messages, chat messages, and delivery notes.
- Identifiers: customer account and Firebase authentication identifiers.
- Usage Data: saved-item/account interactions when synchronized to the backend.

Purposes: app functionality, account authentication, order fulfillment,
customer support, personalization, and security/fraud prevention.

## Not collected by the current app

Precise/coarse device location, contacts, health/fitness, financial card
credentials, audio, browsing history, search history outside Milana, or data
used for third-party advertising.

## Tracking

Tracking: **No**, provided no tracking or advertising SDK is added before
release. `PrivacyInfo.xcprivacy` declares no tracking. Review Apple's generated
privacy report after the final archive because third-party SDK manifests are
part of the declaration.

Firebase Authentication also processes authentication identifiers and
Firebase/device/app user-agent metadata, and may process IP addresses for
security. Compare the final archive against Firebase's current Apple disclosure
guide before submitting the App Privacy form:
<https://firebase.google.com/docs/ios/app-store-data-collection>.

## Account deletion

The app provides **Account > Delete Account**, and the public deletion path is
<https://milanapremium.uz/account/delete>.

Privacy Policy: <https://milanapremium.uz/privacy>
