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
        : dictionaries[String(url).match(/\/lang\/(en|ru|uz)\.json(?:\?.*)?$/)?.[1]],
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
        name_i18n: { en: "Black belted tunic", ru: "Туника с ремнём", uz: "Qora kamarli tunika" },
      },
      expected: { en: "Tunic", ru: "Туника", uz: "Tunika" },
    },
    {
      product: {
        catalog_panel: "robes",
        name_i18n: { en: "Raspberry button robe", ru: "Малиновый халат", uz: "Malina rang xalat" },
      },
      expected: { en: "Robe", ru: "Халат", uz: "Xalat" },
    },
    {
      product: {
        name_i18n: { en: "Lace nightgown", ru: "Сорочка с кружевом", uz: "To‘rli sarochka" },
      },
      expected: { en: "Sarochka", ru: "Сорочка", uz: "Sarochka" },
    },
    {
      product: {
        name_i18n: { en: "Plaid pajama set", ru: "Пижама в клетку", uz: "Katak pijama" },
      },
      expected: { en: "Pajamas", ru: "Пижама", uz: "Pijama" },
    },
    {
      product: {
        catalog_panel: "trousers",
        product_type: "capri",
        name_i18n: { en: "Cropped trousers", ru: "Укороченные брюки", uz: "Qisqartirilgan shim" },
      },
      expected: { en: "Capri", ru: "Бриджи", uz: "Kapri" },
    },
  ];

  for (const lang of ["en", "ru", "uz"]) {
    const i18n = await loadI18n(lang);
    for (const fixture of fixtures) {
      assert.equal(i18n.productName(fixture.product), fixture.expected[lang]);
    }
  }
});

test("custom clothing categories have a readable storefront fallback", async () => {
  const dresses = { en: "Dresses", ru: "Платья", uz: "Ko‘ylaklar" };
  for (const lang of ["en", "ru", "uz"]) {
    const i18n = await loadI18n(lang);
    assert.equal(i18n.catName("night-wear"), "Night Wear");
    assert.equal(i18n.catName("Платья"), dresses[lang]);
  }
  const shopSource = fs.readFileSync(path.join(ROOT, "public", "js", "shop.js"), "utf8");
  const gallerySource = fs.readFileSync(path.join(ROOT, "public", "js", "gallery.js"), "utf8");
  assert.match(shopSource, /availableCategories = new Set\(all\.map\(\(product\) => product\.category\)\.filter\(Boolean\)\)/);
  assert.match(shopSource, /const PRODUCT_TYPES = \[/);
  assert.match(shopSource, /p\.product_type === type/);
  assert.match(shopSource, /p\.set\("product_type", \[\.\.\.state\.types\]\.join\(","\)\)/);
  assert.match(shopSource, /I18N\.productName\(\{ product_type: type \}\)/);
  assert.match(shopSource, /wrap\.style\.display = pages <= 1 \? "none" : ""/);
  assert.doesNotMatch(shopSource, /type:capri|isCapriProduct|CAPRI_FACET/);
  assert.match(gallerySource, /allProducts\.map\(\(p\) => p\.category\)\.filter\(Boolean\)/);
});

test("clothing set catalog panel is localized separately from two-piece sets", async () => {
  const expected = {
    en: { clothing: "Clothing set", twoPiece: "Two-piece sets" },
    ru: { clothing: "Комплект одежды", twoPiece: "Двойки" },
    uz: { clothing: "Kiyim to‘plami", twoPiece: "Ikki qismli to‘plam" },
  };
  for (const lang of ["en", "ru", "uz"]) {
    const i18n = await loadI18n(lang);
    assert.equal(i18n.panelName("clothing_sets"), expected[lang].clothing);
    assert.equal(i18n.panelName("sets"), expected[lang].twoPiece);
  }
  const shopSource = fs.readFileSync(path.join(ROOT, "public", "js", "shop.js"), "utf8");
  assert.match(shopSource, /"sets", "clothing_sets", "tshirts"/);
  assert.match(shopSource, /panel === "clothing_sets" \? "sets" : panel/);
  assert.match(shopSource, /\(PANELS\.includes\(panel\) && panel !== "clothing_sets"\) \|\| all\.some/);
});

test("custom Basic reference values remain readable on the storefront", async () => {
  for (const lang of ["en", "ru", "uz"]) {
    const i18n = await loadI18n(lang);
    assert.equal(i18n.productName({ product_type: "Жилет" }), "Жилет");
    assert.equal(i18n.productName({ product_type: "vest" }), "Vest");
  }
  const shopSource = fs.readFileSync(path.join(ROOT, "public", "js", "shop.js"), "utf8");
  assert.match(shopSource, /const genders = \[\.\.\.new Set\(\[\.\.\.GENDERS, \.\.\.all\.map/);
  assert.match(shopSource, /const curations = \[\.\.\.new Set\(\[\.\.\.CURATIONS, \.\.\.all\.map/);
  assert.match(shopSource, /const collections = \[\.\.\.new Set\(\[\.\.\.COLLECTIONS, \.\.\.all\.map/);
  assert.match(shopSource, /const panels = \[\.\.\.new Set\(\[\.\.\.PANELS, \.\.\.all\.map/);
});

test("catalog, package, and product specification values stay localized", async () => {
  const expected = {
    en: {
      capri: "Capri",
      material: "Suprem",
      composition: "100% Cotton, 8% Elastane",
      season: "Demi-season",
      country: "Uzbekistan",
      units: "Pack · Bag",
      unitsLower: "pack / bag",
    },
    ru: {
      capri: "Бриджи",
      material: "Супрем",
      composition: "100% Хлопок, 8% Эластан",
      season: "Демисезон",
      country: "Узбекистан",
      units: "Пачка · Мешок",
      unitsLower: "пачка / мешок",
    },
    uz: {
      capri: "Kapri",
      material: "Suprem",
      composition: "100% Paxta, 8% Elastan",
      season: "Mavsum oralig‘i",
      country: "O‘zbekiston",
      units: "Qadoq · Qop",
      unitsLower: "qadoq / qop",
    },
  };

  for (const lang of ["en", "ru", "uz"]) {
    const i18n = await loadI18n(lang);
    assert.equal(i18n.productName({ name: "Бриджи" }), expected[lang].capri);
    assert.equal(i18n.fieldValue("material", "Супрем"), expected[lang].material);
    assert.equal(i18n.fieldValue("composition", "100% Хлопок, 8% Эластан"), expected[lang].composition);
    assert.equal(i18n.fieldValue("season", "Демисезон"), expected[lang].season);
    assert.equal(i18n.fieldValue("country", "Узбекистан"), expected[lang].country);
    assert.equal(i18n.packageText("QADOQ · QOP"), expected[lang].units);
    assert.equal(i18n.packageText("qadoq / qop"), expected[lang].unitsLower);
  }

  const productSource = fs.readFileSync(path.join(ROOT, "public", "js", "product.js"), "utf8");
  for (const field of ["color", "country", "material", "composition", "season"]) {
    assert.match(productSource, new RegExp(`I18N\\.fieldValue\\("${field}"`));
  }
});

test("checkout retries safely and localizes API errors", () => {
  const cartSource = fs.readFileSync(path.join(ROOT, "public", "js", "cart.js"), "utf8");
  assert.match(cartSource, /ORDER_ATTEMPT_STORAGE = "ml-checkout-attempt"/);
  assert.match(cartSource, /subtle\.digest\("SHA-256"/);
  assert.match(cartSource, /sessionStorage\.getItem\(ORDER_ATTEMPT_STORAGE\)/);
  assert.match(cartSource, /sessionStorage\.setItem\(ORDER_ATTEMPT_STORAGE/);
  assert.match(cartSource, /sessionStorage\.removeItem\(ORDER_ATTEMPT_STORAGE\)/);
  assert.match(cartSource, /orderAttempt\?\.fingerprint/);
  assert.match(cartSource, /value="\$\{esc\(customer\.city \|\| ""\)\}"/);
  assert.match(cartSource, /value="\$\{esc\(customer\.address \|\| ""\)\}"/);
  assert.match(cartSource, /crypto|webCrypto/);
  assert.match(cartSource, /randomUUID|getRandomValues/);
  assert.match(cartSource, /"Idempotency-Key": idempotencyKey/);
  assert.match(cartSource, /body: serialized/);
  assert.match(cartSource, /orderAttempt = null/);
  assert.match(cartSource, /orderErrorMessage\(ex\.message\)/);
  assert.match(cartSource, /t\("cart\.retailRule"\)/);
  assert.match(cartSource, /t\("cart\.orderingLink"\)/);
  assert.doesNotMatch(cartSource, /Retail order: quantities are pieces/);
  assert.equal(cartSource.includes('t("cart.invalid") + " ("'), false);

  const errorCodes = [
    "size_required",
    "invalid_size",
    "preorder_unavailable",
    "retail_unavailable",
    "insufficient_stock",
    "customer_not_active",
    "idempotency_conflict",
    "checkout_product_changed",
    "checkout_database_mismatch",
  ];
  for (const lang of ["en", "ru", "uz"]) {
    const dictionary = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "lang", `${lang}.json`), "utf8"));
    assert.ok(dictionary["cart.retailRule"], `${lang} retail checkout note`);
    assert.ok(dictionary["cart.orderingLink"], `${lang} ordering link`);
    assert.ok(dictionary["cart.orderFailed"], `${lang} generic order error`);
    for (const code of errorCodes) {
      const message = dictionary[`cart.error.${code}`];
      assert.ok(message && message !== code, `${lang} ${code}`);
    }
  }
});

test("admin product form saves every editable color value", () => {
  const adminSource = fs.readFileSync(path.join(ROOT, "public", "js", "admin.js"), "utf8");
  assert.match(adminSource, /color:\s*\$\("#f-color"\)\.value\.trim\(\)/);
  assert.match(adminSource, /data-customer-account="\$\{c\.id\}"/);
  assert.match(adminSource, /account_type:\s*document\.querySelector\(`\[data-customer-account="\$\{id\}"\]`\)/);
  assert.match(adminSource, /retail_stock:\s*\$\("#f-retail-stock"\)\.value === "" \? null : Number/);
  assert.match(adminSource, /\/api\/admin\/products\/" \+ id \+ "\/availability"/);
  assert.match(adminSource, /method:\s*"PATCH",\s*body:\s*next/);
  assert.doesNotMatch(adminSource, /method:\s*"PUT",\s*body:\s*\{\s*\.\.\.p,\s*\.\.\.next\s*\}/);
});

test("storefront honors account-specific availability, stock, price, and retail size", () => {
  const sources = Object.fromEntries(["cart", "product", "shop", "home"].map((name) => [
    name,
    fs.readFileSync(path.join(ROOT, "public", "js", `${name}.js`), "utf8"),
  ]));

  for (const [name, source] of Object.entries(sources)) {
    assert.match(source, /can_order_wholesale/, `${name} must consume wholesale orderability`);
    assert.match(source, /can_order_retail/, `${name} must consume retail orderability`);
    assert.match(source, /availability_wholesale/, `${name} must consume wholesale availability`);
    assert.match(source, /availability_retail/, `${name} must consume retail availability`);
  }

  assert.match(sources.product, /data-retail-size=/);
  assert.match(sources.product, /availability === "preorder"\s*\?\s*"https:\/\/schema\.org\/PreOrder"/);
  assert.doesNotMatch(sources.product, /Number\(p\.available_qop\) === 0\s*\?\s*"https:\/\/schema\.org\/OutOfStock"/);
  assert.match(sources.cart, /const references = \[\s*stableId \? String\(stableId\) : "",\s*String\(item\?\.slug \|\| ""\)\.trim\(\)/);
  assert.match(sources.cart, /product_type:\s*current\.product_type \|\| item\.product_type/);
  assert.match(sources.product, /product_type:\s*p\.product_type/);
  assert.match(sources.shop, /product_type:\s*p\.product_type/);
  assert.match(sources.cart, /Number\(current\.id\) !== stableId/);
  assert.match(sources.cart, /slug: current\.slug \|\| item\.slug/);
  assert.match(sources.cart, /size:\s*orderMode\(\) === "retail" \? i\.size : ""/);
  assert.match(sources.cart, /availability\.remaining_units/);
  assert.match(sources.cart, /availability\.remaining_qop/);
  assert.match(sources.cart, /hasBlockedItems\(\)/);
  assert.match(sources.cart, /if \(!canOrder\(next\) \|\| maxOrderQty\(next\) < 1\)/);
  assert.match(sources.shop, /const orderable = canOrder\(p\)/);
  assert.match(sources.home, /const orderable = canOrder\(p\)/);
  assert.match(sources.shop, /if \(retailMode\(\) && !size\)/);
  assert.match(sources.home, /if \(retailMode\(\) && !size\)/);
  assert.match(sources.home, /\/api\/products\?tag=bestseller&sort=popular&limit=/);
});

test("wishlist refresh replaces stale product links by stable ID", () => {
  const stored = new Map([["ml-wishlist", JSON.stringify([{
    id: "41",
    slug: "old-product-slug",
    name: "Old name",
    image: "/old.webp",
    price: 5,
    price_visible: true,
  }])]]);
  const document = {
    addEventListener() {},
    querySelectorAll() { return []; },
  };
  const window = {
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent {},
    document,
    localStorage: {
      getItem(key) { return stored.get(key) || null; },
      setItem(key, value) { stored.set(key, value); },
    },
    navigator: { onLine: true },
    requestAnimationFrame() {},
    window,
  });
  const source = fs.readFileSync(path.join(ROOT, "public", "js", "app-state.js"), "utf8");
  vm.runInContext(source, context, { filename: "app-state.js" });

  assert.equal(window.MilanaState.wishlist.refresh([{
    id: 41,
    slug: "current-product-slug",
    name: "Current name",
    images: ["/current.webp"],
    price: 8,
    price_visible: true,
  }]), true);
  assert.equal(window.MilanaState.wishlist.all()[0].slug, "current-product-slug");
  assert.equal(JSON.parse(stored.get("ml-wishlist"))[0].slug, "current-product-slug");
});

test("automatic product copy recognizes Capri as its own garment type", () => {
  const { TYPE_LABELS, descriptionFromFacts } = require("../lib/product-content");
  assert.equal(TYPE_LABELS.en.sarochka, "Sarochka");
  assert.equal(TYPE_LABELS.en.pajamas, "pajamas");
  assert.equal(TYPE_LABELS.en.set, "set");
  assert.equal(TYPE_LABELS.en.polo, "polo");
  assert.equal(TYPE_LABELS.en.capri, "Capri");
  assert.equal(TYPE_LABELS.ru.capri, "бриджи");
  assert.equal(TYPE_LABELS.uz.capri, "kapri");
  assert.match(descriptionFromFacts({ product_type: "sarochka", pieces: 0, details: [], components: [] }, "en"), /: Sarochka\./);
  assert.doesNotMatch(Object.values(TYPE_LABELS.en).join(" "), /nightgown|pajama set|clothing set|polo shirt/);
});

test("fabric placeholders are removed and valid composition drives material care", () => {
  const {
    cleanFabricText,
    isFabricPlaceholder,
    localizedMaterial,
    localizedCare,
  } = require("../lib/product-content");
  const product = {
    material: "Супрем",
    composition: "100% Хлопок",
    fabric: {
      en: "Composition not specified — confirm with a manager",
      ru: "Состав не указан — уточните у менеджера",
      uz: "Tarkibi ko‘rsatilmagan — menejerdan aniqlang",
    },
  };
  assert.equal(isFabricPlaceholder(product.fabric.en), true);
  assert.equal(cleanFabricText(product.fabric.en), "");
  assert.equal(cleanFabricText(product.fabric.ru), "");
  assert.equal(cleanFabricText(product.fabric.uz), "");
  assert.equal(localizedMaterial(product, "en"), "Suprem knit");
  assert.equal(localizedMaterial(product, "ru"), "Трикотаж супрем");
  assert.equal(localizedMaterial(product, "uz"), "Suprem trikotaj");
  assert.doesNotMatch(localizedCare(product, "en"), /unconfirmed/i);
  assert.doesNotMatch(localizedCare(product, "ru"), /не подтверждён/i);
  assert.doesNotMatch(localizedCare(product, "uz"), /tasdiqlanmagan/i);

  const cardsSource = fs.readFileSync(path.join(ROOT, "public", "js", "cards.js"), "utf8");
  const shopSource = fs.readFileSync(path.join(ROOT, "public", "js", "shop.js"), "utf8");
  const homeSource = fs.readFileSync(path.join(ROOT, "public", "js", "home.js"), "utf8");
  const productSource = fs.readFileSync(path.join(ROOT, "public", "js", "product.js"), "utf8");
  const adminSource = fs.readFileSync(path.join(ROOT, "public", "js", "admin.js"), "utf8");
  assert.match(cardsSource, /MilanaIsFabricPlaceholder/);
  assert.match(cardsSource, /I18N\.fieldValue\("composition", composition\)/);
  assert.match(shopSource, /MilanaFabricText\(p, I18N\.lang\)/);
  assert.match(shopSource, /fabric \? "" : " hidden"/);
  assert.match(homeSource, /fab\.hidden = !fabric/);
  assert.match(productSource, /const composition = p\.composition \? I18N\.fieldValue\("composition", p\.composition\) : ""/);
  assert.match(productSource, /const lines = \[composition, fabric, p\.care/);
  assert.match(adminSource, /cleanFabricInput/);
  assert.match(adminSource, /fabric_not_saved/);
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
  assert.match(authSource, /sendPasswordResetEmail\(firebaseAuth, data\.email\)/);
  assert.match(authSource, /querySelectorAll\("\[data-local-recovery\]"\)/);
  assert.match(authSource, /method: "DELETE"/);
  for (const status of paymentStatuses) assert.match(adminSource, new RegExp(`\\b${status}:`));
  assert.match(adminSource, /tracking_number: tracking/);
  assert.match(managerSource, /tracking_number: tracking/);
  assert.match(adminSource, /transitionOptions\(STATUS_RU, ORDER_TRANSITIONS, o\.status\)/);
  assert.match(adminSource, /transitionOptions\(PAYMENT_STATUS_RU, PAYMENT_TRANSITIONS, pay\.status \|\| "pending"\)/);
  assert.match(managerSource, /statusOptions\(order\.status\)/);
  assert.match(managerSource, /item\.size_mix/);
  assert.match(managerSource, /item\.unit_price/);
});

test("public legal pages and translations stay production-ready", () => {
  const expectedKeys = [
    "privacy.title", "privacy.collectText", "privacy.rightsText",
    "delete.title", "delete.webText", "delete.retainedText",
    "terms.acceptanceText", "terms.returnsText", "terms.lawText",
    "support.topicAccountDeletion", "foot.deleteAccount",
  ];
  for (const lang of ["en", "ru", "uz"]) {
    const dictionary = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "lang", `${lang}.json`), "utf8"));
    for (const key of expectedKeys) assert.ok(dictionary[key], `${lang} legal key ${key}`);
    assert.doesNotMatch(dictionary["terms.lead"], /draft|черновик|loyiha/i);
  }

  const privacy = fs.readFileSync(path.join(ROOT, "public", "privacy.html"), "utf8");
  const deletion = fs.readFileSync(path.join(ROOT, "public", "delete-account.html"), "utf8");
  const support = fs.readFileSync(path.join(ROOT, "public", "support.html"), "utf8");
  const frontend = fs.readFileSync(path.join(ROOT, "serve_frontend.mjs"), "utf8");
  assert.match(privacy, /rel="canonical" href="https:\/\/milanapremium\.uz\/privacy"/);
  assert.match(deletion, /rel="canonical" href="https:\/\/milanapremium\.uz\/delete-account"/);
  assert.match(deletion, /support\?topic=account_deletion/);
  assert.match(support, /value="account_deletion"/);
  assert.match(frontend, /\["\/privacy", "privacy\.html"\]/);
  assert.match(frontend, /\["\/delete-account", "delete-account\.html"\]/);
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
