# Google Play Account And Closed Testing

For a newly created **personal** Play developer account, production access is a
manual Google Play gate.

## Account verification

On the Play Console home page, finish every verification task before attempting
contact-phone verification:

1. Confirm the linked Google Payments profile uses the account owner's exact
   legal name and address.
2. Submit the requested government identity document and wait for approval.
3. Verify the private contact email and contact phone in international E.164
   format, for example `+998...`.
4. Keep 2-Step Verification enabled on every Google account with Play Console
   access.

The phone verification control can remain disabled while identity documents are
pending. This state cannot be repaired in application code.

## Required closed test

1. Create the app with package `uz.milanapremium.app`.
2. Complete App content, Data safety, account deletion, privacy policy, content
   rating, target audience, ads, and store listing forms.
3. Upload the signed `.aab` to the **Closed testing** track.
4. Add at least 12 real testers to the tester list.
5. Share the opt-in link. A tester counts only after opting in; merely adding an
   email address is insufficient.
6. Keep at least 12 testers opted in continuously for 14 days. Avoid removing
   testers or replacing the testing track during this window.
7. Collect real feedback and record the tested devices, Android versions,
   crashes, login, product media, cart, checkout, account deletion, and network
   recovery results.
8. After the full period, use **Apply for production access** and answer the
   testing questions accurately.

Google can require additional remediation or testing. Do not mark
`closedTestCompleted` or `productionAccessGranted` true in
`store-readiness.local.json` until Play Console confirms each state.

Official references:

- <https://support.google.com/googleplay/android-developer/answer/14151465>
- <https://support.google.com/googleplay/android-developer/answer/10840893>
- <https://support.google.com/googleplay/android-developer/answer/13327111>
