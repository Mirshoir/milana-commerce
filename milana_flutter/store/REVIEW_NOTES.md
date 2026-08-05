# Store review notes

Status: **Draft. Do not paste into App Store Connect or Play Console until the
legal pages, website-backed deletion, reviewer accounts, and production-like
smoke tests are complete.**

Milana Premium is a wholesale catalog and ordering app for physical clothing manufactured in Uzbekistan. It does not sell digital content, subscriptions, or services consumed inside the app; platform billing is therefore not used.

The reviewer flow is:

1. Browse the catalog without an account.
2. Open a product and choose Pack or Bag where available.
3. Add to cart and review piece/package totals.
4. Sign in with the dedicated review account. Email must already be verified so the Firebase identity can securely link to the Milanapremium commerce account.
5. Wait for the account screen to show that the commerce account is connected. If synchronization is temporarily unavailable, use the visible retry action before checkout.
6. Select the designated non-fulfilling review manager and submit a synthetic order using the Manager payment method. Include the agreed review marker so operations do not fulfill it.
7. Open Account → My Orders to see the same website-backed order, then use the documented cancellation/cleanup procedure.
8. Open the external Privacy, Terms, Support, and account-deletion-request pages from the legal panel.
9. Use a separate disposable verified account to test the destructive in-app account deletion control. Do not delete the primary review account.

## Owner-supplied review access

Provide these values through the store's protected reviewer fields, never in the
repository:

- primary verified review email and password;
- disposable verified deletion-test email and password;
- review manager name/selection and synthetic-order marker;
- expected commerce-connected state and retry instructions;
- order cleanup or cancellation instructions; and
- review contact name, email, phone, timezone, and response hours.

The review manager/account must be isolated from real fulfillment and customer
notifications wherever practical. If the production path still sends Telegram
or ERP events, notify the responsible operators and define cleanup before review.

Do not submit until the public privacy, terms, support, and deletion pages are
live and legally reviewed, and website-backed account deletion/anonymization is
implemented and tested alongside Firebase deletion. The external deletion
resource and the in-app destructive deletion control are separate requirements;
review notes must explain both accurately.
