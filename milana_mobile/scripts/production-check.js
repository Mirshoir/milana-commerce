"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function requireFile(file) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
}

function requireText(file, pattern, message) {
  if (!pattern.test(read(file))) failures.push(message);
}

[
  "index.html",
  "app.js",
  "styles.css",
  "capacitor.config.json",
  "android/key.properties.example",
  "android/app/src/main/AndroidManifest.xml",
  "ios/App/App/App.entitlements",
  "ios/App/App/Info.plist",
  "ios/App/App/PrivacyInfo.xcprivacy",
  "assets/app-icon-192.png",
  "assets/app-icon-512.png",
  "store/README.md",
  "store/google-play/app-content.md",
  "store/google-play/closed-testing.md",
  "store/google-play/data-safety.md",
  "store/google-play/listing.md",
  "store/app-store/app-privacy.md",
  "store/app-store/listing.md",
].forEach(requireFile);

requireText("index.html", /Content-Security-Policy/i, "Content Security Policy is missing");
requireText("index.html", /viewport-fit=cover/, "Safe-area viewport support is missing");
requireText("index.html", /https:\/\/milanapremium\.uz\/privacy/, "Privacy Policy must be accessible from the app");
requireText("index.html", /https:\/\/milanapremium\.uz\/terms/, "Terms of Use must be accessible from the app");
requireText("index.html", /id="btn-delete-account"/, "In-app account deletion is missing");
requireText("capacitor.config.json", /"CapacitorHttp"\s*:\s*\{\s*"enabled"\s*:\s*true/s, "Native HTTP is not enabled");
requireText("capacitor.config.json", /"CapacitorCookies"\s*:\s*\{\s*"enabled"\s*:\s*true/s, "Native cookies are not enabled");
requireText("capacitor.config.json", /"providers"\s*:\s*\[[^\]]*"google\.com"[^\]]*"apple\.com"[^\]]*\]/s, "Native Google and Apple auth providers must both be configured");
requireText("android/app/src/main/AndroidManifest.xml", /android:usesCleartextTraffic="false"/, "Android cleartext traffic must be disabled");
requireText("android/app/src/main/AndroidManifest.xml", /android:allowBackup="false"/, "Android backups must not expose app data");
requireText("android/app/build.gradle", /release\s*\{[\s\S]*minifyEnabled true[\s\S]*shrinkResources true/, "Android release shrinking is not enabled");
requireText("android/app/build.gradle", /key\.properties/, "Android release signing hook is missing");
requireText("android/app/build.gradle", /bundleRelease|releaseRequested/, "Android release builds must enforce publication credentials");
requireText("android/variables.gradle", /minSdkVersion\s*=\s*24/, "Android minimum SDK must remain explicitly supported");
requireText("android/variables.gradle", /targetSdkVersion\s*=\s*36/, "Android target SDK is not publication-ready");
requireText("ios/App/App/Info.plist", /<key>NSAppTransportSecurity<\/key>[\s\S]*<key>NSAllowsArbitraryLoads<\/key>\s*<false\/>/, "iOS must reject arbitrary insecure transport");
requireText("ios/App/App/App.entitlements", /com\.apple\.developer\.applesignin/, "Sign in with Apple entitlement is missing");
requireText("ios/App/App/PrivacyInfo.xcprivacy", /NSPrivacyTracking[\s\S]*<false\/>/, "iOS privacy manifest must declare tracking behavior");
requireText("ios/App/App/PrivacyInfo.xcprivacy", /NSPrivacyCollectedDataTypeEmailAddress/, "iOS privacy manifest must declare customer data collection");
requireText("app.js", /signInWithApple/, "Sign in with Apple is missing from the customer auth flow");
requireText("app.js", /\/api\/auth\/account/, "The in-app account deletion request is missing");

const app = read("app.js");
if (/store\.save\("authToken"/.test(app) && !/if \(!IS_NATIVE\) store\.save\("authToken"/.test(app)) {
  failures.push("Native auth tokens must not be persisted in localStorage");
}

if (failures.length) {
  console.error("Production preflight failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Production preflight passed for unsigned Android and iOS projects.");
