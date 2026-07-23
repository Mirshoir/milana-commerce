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
  "android/app/src/main/AndroidManifest.xml",
  "ios/App/App/Info.plist",
  "assets/app-icon-192.png",
  "assets/app-icon-512.png",
].forEach(requireFile);

requireText("index.html", /Content-Security-Policy/i, "Content Security Policy is missing");
requireText("index.html", /viewport-fit=cover/, "Safe-area viewport support is missing");
requireText("capacitor.config.json", /"CapacitorHttp"\s*:\s*\{\s*"enabled"\s*:\s*true/s, "Native HTTP is not enabled");
requireText("capacitor.config.json", /"CapacitorCookies"\s*:\s*\{\s*"enabled"\s*:\s*true/s, "Native cookies are not enabled");
requireText("android/app/src/main/AndroidManifest.xml", /android:usesCleartextTraffic="false"/, "Android cleartext traffic must be disabled");
requireText("android/app/src/main/AndroidManifest.xml", /android:allowBackup="false"/, "Android backups must not expose app data");
requireText("android/app/build.gradle", /release\s*\{[\s\S]*minifyEnabled true[\s\S]*shrinkResources true/, "Android release shrinking is not enabled");
requireText("ios/App/App/Info.plist", /<key>NSAppTransportSecurity<\/key>[\s\S]*<key>NSAllowsArbitraryLoads<\/key>\s*<false\/>/, "iOS must reject arbitrary insecure transport");

const app = read("app.js");
if (/store\.save\("authToken"/.test(app) && !/if \(!IS_NATIVE\) store\.save\("authToken"/.test(app)) {
  failures.push("Native auth tokens must not be persisted in localStorage");
}

if (failures.length) {
  console.error("Production preflight failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Production preflight passed for unsigned Android and iOS projects.");
