"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitFor(url, timeoutMs = 5000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function rawRequest(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: "127.0.0.1",
      port,
      path: requestPath,
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response));
    });
    request.on("error", reject);
  });
}

async function loadI18n(lang) {
  const dictionaries = Object.fromEntries(["en", "ru", "uz"].map((code) => [
    code,
    JSON.parse(fs.readFileSync(path.join(ROOT, "public", "lang", `${code}.json`), "utf8")),
  ]));
  const document = {
    body: { dataset: {} },
    documentElement: { lang: "", style: { setProperty() {} } },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const window = {
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent {},
    document,
    fetch: async (url) => ({
      json: async () => url === "/api/settings"
        ? {}
        : dictionaries[String(url).match(/\/lang\/(en|ru|uz)\.json$/)?.[1]],
    }),
    localStorage: {
      getItem(key) { return key === "ml-lang" ? lang : null; },
      setItem() {},
    },
    navigator: { language: lang },
    window,
  });
  const source = fs.readFileSync(path.join(ROOT, "public", "js", "i18n.js"), "utf8");
  vm.runInContext(source, context, { filename: "i18n.js" });
  await window.I18N.ready;
  return window.I18N;
}

test("product presentation uses short localized garment names", async () => {
  const fixtures = [
    {
      product: {
        catalog_panel: "tunics",
        product_type: "dress",
        name_i18n: { en: "Black belted tunic", ru: "Туника с ремнём", uz: "Qora kamarli tunika" },
      },
      expected: { en: "Tunic", ru: "Туника", uz: "Tunika" },
    },
    {
      product: {
        catalog_panel: "robes",
        product_type: "dress",
        name_i18n: { en: "Raspberry button robe", ru: "Малиновый халат", uz: "Malina rang xalat" },
      },
      expected: { en: "Robe", ru: "Халат", uz: "Xalat" },
    },
    {
      product: {
        product_type: "dress",
        name_i18n: { en: "Lace nightgown", ru: "Сорочка с кружевом", uz: "To‘rli sarochka" },
      },
      expected: { en: "Sarochka", ru: "Сорочка", uz: "Sarochka" },
    },
    {
      product: {
        product_type: "set",
        name_i18n: { en: "Plaid pajama set", ru: "Пижама в клетку", uz: "Katak pijama" },
      },
      expected: { en: "Pajamas", ru: "Пижама", uz: "Pijama" },
    },
  ];

  for (const lang of ["en", "ru", "uz"]) {
    const i18n = await loadI18n(lang);
    for (const fixture of fixtures) {
      assert.equal(i18n.productName(fixture.product), fixture.expected[lang]);
    }
  }
});

test("order lifecycle UI covers backend statuses and existing mutation endpoints", () => {
  const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  const authSource = fs.readFileSync(path.join(ROOT, "public", "js", "auth.js"), "utf8");
  const adminSource = fs.readFileSync(path.join(ROOT, "public", "js", "admin.js"), "utf8");
  const managerSource = fs.readFileSync(path.join(ROOT, "views", "manager-app.html"), "utf8");
  const enumValues = (name) => {
    const match = serverSource.match(new RegExp(`const ${name} = \\[([^\\]]+)\\]`));
    assert.ok(match, `${name} must exist`);
    return JSON.parse(`[${match[1]}]`);
  };

  const orderStatuses = enumValues("ORDER_STATUSES");
  const paymentStatuses = enumValues("PAYMENT_STATUSES");
  for (const lang of ["en", "ru", "uz"]) {
    const dictionary = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "lang", `${lang}.json`), "utf8"));
    for (const status of orderStatuses) assert.ok(dictionary[`auth.orderStatus.${status}`], `${lang} order ${status}`);
    for (const status of paymentStatuses) assert.ok(dictionary[`auth.paymentStatus.${status}`], `${lang} payment ${status}`);
  }

  assert.ok(authSource.includes("`/api/auth/orders/${encodeURIComponent(id)}/cancel`"));
  assert.ok(authSource.includes("`/api/auth/orders/${encodeURIComponent(id)}/payment-proof`"));
  assert.ok(authSource.includes("`/api/products/${encodeURIComponent(id)}/like`"));
  assert.match(authSource, /method: "DELETE"/);
  for (const status of paymentStatuses) assert.match(adminSource, new RegExp(`\\b${status}:`));
  assert.match(adminSource, /tracking_number: tracking/);
  assert.match(managerSource, /tracking_number: tracking/);
});

test("frontend returns 400 for malformed percent encoding and stays alive", async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ["serve_frontend.mjs"], {
    cwd: ROOT,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  t.after(async () => {
    if (!child.killed) child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  });

  const base = `http://127.0.0.1:${port}`;
  await waitFor(base + "/");
  const malformed = await rawRequest(port, "/%E0%A4%A");
  assert.equal(malformed.statusCode, 400, logs);
  const healthy = await fetch(base + "/");
  assert.equal(healthy.status, 200, logs);
});
