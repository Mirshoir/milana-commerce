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
