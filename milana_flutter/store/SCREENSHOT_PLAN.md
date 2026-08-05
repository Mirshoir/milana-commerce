# Physical-device screenshot plan

Status: **Draft capture plan; no final store assets have been produced or published.**

Capture final screenshots only from signed TestFlight and Play Internal Testing
builds connected to production-like data. The user requested no simulator, so
the plan uses physical devices and store-delivered builds.

## Required scenes

1. Home hero with Milanapremium collection navigation and visible cart access.
2. Catalog showing search, category rail, filters, live item count, and product cards.
3. Product detail showing gallery, pack/bag selection, size mix, price, and sticky add action.
4. Cart showing item editing, authoritative piece/package totals, manager selection, and privacy notice.
5. Verified account showing synchronized order connection and account metrics.
6. My Orders showing order/payment status and delivery progress without real customer PII.
7. Support showing FAQ search and direct assistance.

## Device matrix

- Google Play phone: physical modern Android handset, portrait.
- Google Play 7-inch/10-inch tablet: the current Android package declares no tablet exclusion, so capture tablet assets unless the owner deliberately changes distribution and documents the decision.
- App Store iPhone: physical 6.9-inch class and one smaller supported iPhone.
- App Store iPad: physical 13-inch class and one smaller supported iPad while `TARGETED_DEVICE_FAMILY="1,2"` remains enabled.

## Store asset specifications

Google Play preparation must include:

- a 512×512 32-bit PNG listing icon, maximum 1024 KB;
- a 1024×500 JPEG or 24-bit PNG feature graphic with no alpha channel;
- at least two phone screenshots for Play's publication floor; Milana's
  professional publication gate deliberately requires four polished captures
  at 1080×1920 (or the landscape equivalent); and
- separate tablet captures sized for the actual physical devices if tablet
  distribution remains enabled.

App Store preparation must include between 1 and 10 screenshots for each
required device class. Capture at the physical device's native resolution and
confirm the current accepted App Store Connect dimensions immediately before
upload. Because the current target is universal, do not omit the required iPad
set unless iPad support is intentionally removed from the binary.

Do not stretch, upscale, or reuse one device capture as another required aspect
ratio. Preview video is optional and is not currently planned.

## Data, localization, and QA

- Use dedicated reviewer accounts and synthetic orders so customer PII is never
  present in the original capture. Prefer recapturing over retouching UI content.
- Remove notification banners, device identifiers, and personal status-bar
  information before capture, without editing the represented app behavior.
- Version 1.0's interface is Uzbek. Use Uzbek screenshots and disclose that fact
  in any English/Russian listing, or postpone those localized listings until the
  app itself is localized.
- Use a consistent device theme, time, connectivity state, ordering, captions,
  filename convention, and release version across each store set.
- Verify every screenshot against the final store-delivered build and ensure it
  does not imply unavailable payment, deletion, localization, or fulfillment
  behavior.

Record each final file, order, scene, caption, alt text, SHA-256, build version,
physical device/OS, capture time, synthetic-data confirmation, and rights record
in `store/screenshots/manifest.json`. Files that are absent from that manifest,
browser mockups, and simulator captures cannot satisfy the publication gate.
