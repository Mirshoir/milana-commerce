"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("mobile source parses and uses the HTTPS production API", () => {
  assert.doesNotThrow(() => new Function(read("app.js")));
  assert.match(read("index.html"), /https:\/\/milanapremium\.uz/);
  assert.doesNotMatch(read("index.html"), /window\.MILANA_API_BASE\s*=\s*"http:/);
});

test("mobile build excludes large source-only creative assets", () => {
  const packageJson = JSON.parse(read("package.json"));
  const prepare = packageJson.scripts["prepare:mobile"];
  assert.match(prepare, /hero-fashion-video-source\.mp4/);
  assert.match(prepare, /hero-tennis\.png/);
  assert.match(prepare, /hero-garden\.png/);
});

test("order quantities remain aligned with the website rules", () => {
  const app = read("app.js");
  assert.match(app, /const BAG_SIZE = 60/);
  assert.match(app, /const PACK_SIZE = 6/);
});

test("catalog pagination preserves cart and wishlist references", () => {
  const app = read("app.js");
  assert.match(app, /async function hydrateReferencedProducts/);
  assert.doesNotMatch(app, /cart\s*=\s*cart\.filter\(\(line\)\s*=>\s*find\(line\.id\)\)/);
  assert.doesNotMatch(app, /wishlist\s*=.*\.filter\(\(id\)\s*=>\s*find\(id\)\)/);
});

test("store-required customer privacy and deletion controls are present", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /https:\/\/milanapremium\.uz\/privacy/);
  assert.match(html, /https:\/\/milanapremium\.uz\/terms/);
  assert.match(html, /id="btn-delete-account"/);
  assert.match(html, /id="delete-account-form"/);
  assert.match(app, /method:\s*"DELETE"/);
  assert.match(app, /\/api\/auth\/account/);
});

test("native auth supports both Google and Apple", () => {
  const config = JSON.parse(read("capacitor.config.json"));
  assert.deepEqual(
    config.plugins.FirebaseAuthentication.providers,
    ["google.com", "apple.com"],
  );
  assert.match(read("app.js"), /signInWithApple/);
  assert.match(read("ios/App/App/App.entitlements"), /com\.apple\.developer\.applesignin/);
});

test("native release projects include privacy and signing gates", () => {
  const android = read("android/app/build.gradle");
  assert.match(android, /key\.properties/);
  assert.match(android, /releaseSigningConfigured/);
  assert.match(android, /google-services\.json is required for the release build/);
  assert.match(read("ios/App/App/PrivacyInfo.xcprivacy"), /NSPrivacyTracking/);
  assert.match(read("ios/App/App/PrivacyInfo.xcprivacy"), /<false\/>/);
  assert.match(read("ios/App/App/PrivacyInfo.xcprivacy"), /NSPrivacyCollectedDataTypeEmailAddress/);
});

test("publication handoff includes Play testing and privacy declarations", () => {
  assert.match(read("store/google-play/app-content.md"), /reviewer account/i);
  assert.match(read("store/google-play/app-content.md"), /target audience/i);
  assert.match(read("store/google-play/closed-testing.md"), /12 real testers/i);
  assert.match(read("store/google-play/closed-testing.md"), /14 days/i);
  assert.match(read("store/google-play/data-safety.md"), /account\/delete/);
  assert.match(read("store/app-store/app-privacy.md"), /Tracking:\s*\*\*No\*\*/);
});
