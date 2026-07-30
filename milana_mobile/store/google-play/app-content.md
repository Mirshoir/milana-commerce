# Google Play App Content Checklist

Complete these answers in Play Console against the exact release build. The
current app behavior supports the following declarations.

## Store setup

- App category: **Shopping**
- App type: **App**
- Pricing: **Free**
- Ads: **No**, while no advertising SDK or paid placement is present.
- Target audience: adults using wholesale clothing ordering. Do not select
  children as a target audience.
- News app: **No**
- Government app: **No**
- Health app: **No**
- Financial features: **No**. The app does not process card payments, lend
  money, exchange currency, or sell financial products.

## App access

Catalog browsing is available without signing in. Account-only features include
saved-item synchronization, order submission, order history, support identity,
and account deletion.

Create a dedicated **reviewer account** in production and provide its email and
password in Play Console under App access. The account must:

- remain active for the full review period;
- require no SMS or email code after the credentials are entered;
- contain no real customer information;
- have enough access for reviewers to test order history and account deletion.

Never place reviewer credentials in Git or this document.

## Content rating and AI

Answer the content-rating questionnaire based on the final app. The customer app
contains commerce content and direct support messaging, but no public social
feed, gambling, dating, or anonymous user-to-user chat.

The current mobile “AI assistant” is a local, predefined help system and does
not generate open-ended model output. Human support messages are private between
the customer and Milana staff. If generative AI replies are enabled in a future
release, add an in-app reporting control and reassess Google Play's AI-generated
content policy before upload.

## Required declarations

1. Publish the privacy policy and account-deletion pages over HTTPS.
2. Complete Data safety using `data-safety.md` and the final SDK inventory.
3. Enter the public deletion URL:
   `https://milanapremium.uz/account/delete`.
4. Complete Target audience and content, Content rating, Ads, App access, and
   every other App content task shown in the console.
5. Confirm the package name is exactly `uz.milanapremium.app`.
6. Verify the support email, website, and privacy URL in the store listing.
7. Do not mark `appContentCompleted` true until Play Console shows no incomplete
   App content tasks.

Official references:

- <https://support.google.com/googleplay/android-developer/answer/9859455>
- <https://support.google.com/googleplay/android-developer/answer/10787469>
- <https://support.google.com/googleplay/android-developer/answer/13327111>
