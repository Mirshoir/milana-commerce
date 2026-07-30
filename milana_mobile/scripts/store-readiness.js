"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const blockers = [];
const passed = [];

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function pass(message) {
  passed.push(message);
}

function block(message) {
  blockers.push(message);
}

function parseProperties(source) {
  const result = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    result[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return result;
}

function plistValue(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`<key>${escaped}<\\/key>\\s*<string>([^<]+)<\\/string>`))?.[1] || "";
}

function checkAndroidFirebase() {
  const file = "android/app/google-services.json";
  if (!exists(file)) {
    block(`${file} is missing. Download it from the Firebase Android app registered as uz.milanapremium.app.`);
    return;
  }
  try {
    const config = JSON.parse(read(file));
    const packageNames = (config.client || [])
      .map((client) => client?.client_info?.android_client_info?.package_name)
      .filter(Boolean);
    if (!packageNames.includes("uz.milanapremium.app")) {
      block(`${file} does not contain the Android package uz.milanapremium.app.`);
      return;
    }
    pass("Android Firebase configuration matches uz.milanapremium.app");
  } catch {
    block(`${file} is not valid JSON.`);
  }
}

function checkAndroidSigning() {
  const file = "android/key.properties";
  if (!exists(file)) {
    block(`${file} is missing. Create the private Play upload keystore configuration from android/key.properties.example.`);
    return;
  }
  const properties = parseProperties(read(file));
  const required = ["storeFile", "storePassword", "keyAlias", "keyPassword"];
  const missing = required.filter((key) => !properties[key] || properties[key] === "CHANGE_ME");
  if (missing.length) {
    block(`${file} is incomplete: ${missing.join(", ")}.`);
    return;
  }
  const keystore = path.resolve(root, "android", properties.storeFile);
  if (!fs.existsSync(keystore)) {
    block(`Android upload keystore not found at ${keystore}.`);
    return;
  }
  pass("Android Play upload signing is configured");
}

function checkIosFirebase() {
  const file = "ios/App/App/GoogleService-Info.plist";
  if (!exists(file)) {
    block(`${file} is missing. Download it from the Firebase iOS app registered as uz.milanapremium.app.`);
    return;
  }
  const config = read(file);
  if (plistValue(config, "BUNDLE_ID") !== "uz.milanapremium.app") {
    block(`${file} does not match bundle ID uz.milanapremium.app.`);
    return;
  }
  const reversedClientId = plistValue(config, "REVERSED_CLIENT_ID");
  if (!reversedClientId) {
    block(`${file} has no REVERSED_CLIENT_ID for native Google sign-in.`);
    return;
  }
  if (!read("ios/App/App/Info.plist").includes(reversedClientId)) {
    block("The iOS Google REVERSED_CLIENT_ID URL scheme has not been added to Info.plist.");
    return;
  }
  pass("iOS Firebase configuration and Google callback URL scheme are configured");
}

function checkIosSigningAndSdk() {
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  const team = process.env.APPLE_DEVELOPMENT_TEAM || project.match(/DEVELOPMENT_TEAM = ([A-Z0-9]+);/)?.[1];
  if (!team) {
    block("Apple Development Team is not configured. Set APPLE_DEVELOPMENT_TEAM or select the team in Xcode signing settings.");
  } else {
    pass("Apple Development Team is configured");
  }

  try {
    const version = execFileSync("xcodebuild", ["-version"], { encoding: "utf8" });
    const major = Number(version.match(/Xcode\s+(\d+)/)?.[1] || 0);
    if (major < 26) {
      block(`Xcode 26 or newer is required for the current App Store upload SDK requirement; found ${version.split(/\r?\n/)[0] || "unknown"}.`);
    } else {
      pass(`${version.split(/\r?\n/)[0]} satisfies the current App Store SDK requirement`);
    }
  } catch {
    block("Xcode command-line tools are unavailable.");
  }
}

function checkManualStoreGates() {
  const file = "store-readiness.local.json";
  if (!exists(file)) {
    block(`Manual store gate status is missing. Copy store-readiness.example.json to ${file} and update it only after each console task is genuinely complete.`);
    return;
  }
  let status;
  try {
    status = JSON.parse(read(file));
  } catch {
    block(`${file} is not valid JSON.`);
    return;
  }
  const gates = [
    ["googlePlay.accountVerified", status?.googlePlay?.accountVerified, "Google Play developer identity, email, and phone verification"],
    ["googlePlay.appContentCompleted", status?.googlePlay?.appContentCompleted, "Google Play listing, reviewer access, and App content declarations"],
    ["googlePlay.closedTestCompleted", status?.googlePlay?.closedTestCompleted, "Google Play closed test with at least 12 opted-in testers for 14 continuous days"],
    ["googlePlay.productionAccessGranted", status?.googlePlay?.productionAccessGranted, "Google Play production access approval"],
    ["apple.developerMembershipActive", status?.apple?.developerMembershipActive, "Active Apple Developer Program membership"],
    ["apple.agreementsAccepted", status?.apple?.agreementsAccepted, "Current App Store Connect agreements"],
    ["apple.appMetadataCompleted", status?.apple?.appMetadataCompleted, "App Store privacy, age rating, reviewer access, and listing metadata"],
    ["release.publicLegalPagesLive", status?.release?.publicLegalPagesLive, "Public privacy policy and account-deletion pages deployed over HTTPS"],
    ["release.deviceQaPassed", status?.release?.deviceQaPassed, "Final Android and iOS physical-device QA"],
  ];
  for (const [key, value, label] of gates) {
    if (value === true) pass(label);
    else block(`${label} is not complete (${key}=false).`);
  }
}

checkAndroidFirebase();
checkAndroidSigning();
checkIosFirebase();
checkIosSigningAndSdk();
checkManualStoreGates();

if (passed.length) {
  console.log("Passed:\n- " + passed.join("\n- "));
}

if (blockers.length) {
  console.error("\nStore publication is blocked:\n- " + blockers.join("\n- "));
  console.error("\nSee store/README.md for the owner-only console steps. No production deployment was attempted.");
  process.exit(1);
}

console.log("\nStore publication preflight passed. Build artifacts still require final device QA before submission.");
