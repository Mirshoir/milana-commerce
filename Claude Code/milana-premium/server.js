/* ============================================================
   MILANA PREMIUM — production server
   Serves the public site, the admin panel and a JSON API.
   SQLite remains the local fallback; PostgreSQL is the production data target.
   Run:  node server.js          (PORT env to override, default 4173)
   ============================================================ */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";
loadEnvFile(path.join(DATA_DIR, "supabase.env"));
loadEnvFile(path.join(DATA_DIR, "firebase.env"));
loadEnvFile(path.join(DATA_DIR, "telegram.env"));
loadEnvFile(path.join(DATA_DIR, "sms.env"));
loadEnvFile(path.join(DATA_DIR, "email.env"));
loadEnvFile(path.join(DATA_DIR, "openai.env"));
loadEnvFile(path.join(DATA_DIR, "catalog.env"), { override: true });
const CATALOG_SOURCE_ENABLED = process.env.CATALOG_SOURCE_ENABLED === "1";
const SEED_FALLBACK_CATALOG = process.env.SEED_FALLBACK_CATALOG === "1";
const CATALOG_API_BASE = (process.env.CATALOG_API_BASE || "").replace(/\/+$/, "");
const CATALOG_API_TOKEN = (process.env.CATALOG_API_TOKEN || "").trim();
const CATALOG_SUPABASE_URL = (process.env.SUPABASE_URL || "https://qldfdpatlpxikdrheasw.supabase.co").replace(/\/+$/, "");
const CATALOG_SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_I9XcHaVcJYRdgtSoKaB8nQ_ISVq1RI3";
const CATALOG_TABLE = process.env.SUPABASE_PRODUCTS_TABLE || "milana_products";
const CATALOG_IMAGE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET || "product-images";
const CATALOG_CACHE_MS = Math.max(10_000, Number(process.env.CATALOG_CACHE_MS) || 5 * 60_000);
const FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.FIREBASE_PROJECT_ID || "",
  appId: process.env.FIREBASE_APP_ID || "",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
};
const FIREBASE_ENABLED = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
const SMS_WEBHOOK_URL = (process.env.SMS_WEBHOOK_URL || "").trim();
const SMS_WEBHOOK_TOKEN = (process.env.SMS_WEBHOOK_TOKEN || "").trim();
const SMS_SEND_IN_DEV = process.env.SMS_SEND_IN_DEV === "1";
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM_EMAIL = (process.env.RESEND_FROM_EMAIL || "Milana Premium <onboarding@resend.dev>").trim();
const EMAIL_WEBHOOK_URL = (process.env.EMAIL_WEBHOOK_URL || "").trim();
const EMAIL_WEBHOOK_TOKEN = (process.env.EMAIL_WEBHOOK_TOKEN || "").trim();
const EMAIL_SEND_IN_DEV = process.env.EMAIL_SEND_IN_DEV === "1";
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_API_BASE = (process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-5.5").trim();
const OPENAI_ASSISTANT_ENABLED = process.env.OPENAI_ASSISTANT_ENABLED !== "0" && Boolean(OPENAI_API_KEY);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadEnvFile(file, options = {}) {
  try {
    const text = fs.readFileSync(file, "utf8");
    text.split(/\r?\n/).forEach((line) => {
      const clean = line.trim();
      if (!clean || clean.startsWith("#")) return;
      const i = clean.indexOf("=");
      if (i <= 0) return;
      const key = clean.slice(0, i).trim();
      const value = clean.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && (options.override || process.env[key] == null)) process.env[key] = value;
    });
  } catch {}
}

/* ============================ DB ============================ */

const db = new DatabaseSync(path.join(DATA_DIR, "milana.db"));
db.exec(`
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    model_no TEXT DEFAULT '',
    variant TEXT DEFAULT '',
    gender TEXT DEFAULT 'unisex',
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    desc_en TEXT DEFAULT '', desc_ru TEXT DEFAULT '', desc_uz TEXT DEFAULT '',
    fabric_en TEXT DEFAULT '', fabric_ru TEXT DEFAULT '', fabric_uz TEXT DEFAULT '',
    price REAL NOT NULL,
    old_price REAL,
    sizes TEXT DEFAULT '[]',
    images TEXT DEFAULT '[]',
    tag TEXT DEFAULT '',
    rating REAL DEFAULT 0,
    reviews INTEGER DEFAULT 0,
    wholesale_price REAL DEFAULT 0,
    wholesale_moq INTEGER DEFAULT 60,
    retail_enabled INTEGER DEFAULT 1,
    retail_price REAL DEFAULT 0,
    retail_stock INTEGER DEFAULT 0,
    available_qop INTEGER,
    like_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    sort INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE,
    customer_id INTEGER,
    customer TEXT NOT NULL,
    items TEXT NOT NULL,
    total REAL NOT NULL,
    order_type TEXT DEFAULT 'wholesale',
    tracking_number TEXT DEFAULT '',
    status TEXT DEFAULT 'new',
    lang TEXT DEFAULT 'en',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    order_number TEXT DEFAULT '',
    provider TEXT DEFAULT 'manual',
    method TEXT DEFAULT 'manager',
    status TEXT DEFAULT 'pending',
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    reference TEXT DEFAULT '',
    payload TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    city TEXT DEFAULT '',
    address TEXT DEFAULT '',
    account_type TEXT DEFAULT 'business',
    approval_status TEXT DEFAULT 'active',
    company_name TEXT DEFAULT '',
    tax_id TEXT DEFAULT '',
    legal_address TEXT DEFAULT '',
    contact_person TEXT DEFAULT '',
    expected_volume TEXT DEFAULT '',
    business_license_url TEXT DEFAULT '',
    terms_accepted_at TEXT DEFAULT '',
    phone_verified INTEGER DEFAULT 0,
    customer_tier TEXT DEFAULT 'regular',
    assigned_manager TEXT DEFAULT '',
    price_discount REAL DEFAULT 0,
    provider TEXT DEFAULT 'local',
    provider_uid TEXT DEFAULT '',
    password_hash TEXT DEFAULT '',
    role TEXT DEFAULT 'customer',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS customer_sessions (
    token TEXT PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS phone_otps (
    phone TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified_at TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS email_otps (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified_at TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    lang TEXT DEFAULT 'en',
    source TEXT DEFAULT 'footer',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS support_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE,
    customer_id INTEGER,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT DEFAULT '',
    topic TEXT DEFAULT 'general',
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    lang TEXT DEFAULT 'en',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    product_slug TEXT DEFAULT '',
    customer_id INTEGER NOT NULL,
    order_id INTEGER,
    rating INTEGER NOT NULL,
    comment TEXT DEFAULT '',
    photo_url TEXT DEFAULT '',
    verified_purchase INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    product_id INTEGER,
    product_slug TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(customer_id, product_id, product_slug),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    visitor_name TEXT DEFAULT '',
    visitor_phone TEXT DEFAULT '',
    visitor_email TEXT DEFAULT '',
    status TEXT DEFAULT 'bot',
    agent_id TEXT DEFAULT '',
    rating INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT DEFAULT 'system',
    event TEXT NOT NULL,
    meta TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS catalog_product_overrides (
    catalog_id INTEGER PRIMARY KEY,
    active INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_products_public ON products(active, gender, category, tag, sort DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
  CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
  CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_support_status_created ON support_requests(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_customers_provider ON customers(provider, provider_uid);
  CREATE INDEX IF NOT EXISTS idx_customer_sessions_created ON customer_sessions(created_at);
  CREATE INDEX IF NOT EXISTS idx_phone_otps_expires ON phone_otps(expires_at);
  CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps(expires_at);
  CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, product_slug, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_likes_customer ON likes(customer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_status_created ON chat_sessions(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id ASC);
  CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
`);

const getSetting = (k) => db.prepare("SELECT value FROM settings WHERE key=?").get(k)?.value;
const setSetting = (k, v) => db.prepare(
  "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
).run(k, String(v));

/* ---------- first-run: password + seed ---------- */

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return salt + ":" + hash;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const ref = Buffer.from(hash, "hex");
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const hashOtp = (phone, code) => sha256(`${phone}:${code}:${getSetting("pass_hash") || "milana"}`);
const hashEmailOtp = (email, code) => sha256(`${email}:${code}:${getSetting("pass_hash") || "milana-email"}`);
function otpSmsMessage(code, lang = "uz") {
  if (lang === "en") return `Milana Premium verification code: ${code}`;
  if (lang === "ru") return `Код подтверждения Milana Premium: ${code}`;
  return `Milana Premium tasdiqlash kodi: ${code}`;
}
function otpEmailMessage(code, lang = "uz") {
  const subject = lang === "en" ? "Milana Premium verification code"
    : lang === "ru" ? "Код подтверждения Milana Premium"
    : "Milana Premium tasdiqlash kodi";
  const text = lang === "en" ? `Your Milana Premium verification code is ${code}. It expires in 10 minutes.`
    : lang === "ru" ? `Ваш код подтверждения Milana Premium: ${code}. Код действует 10 минут.`
    : `Milana Premium tasdiqlash kodi: ${code}. Kod 10 daqiqa amal qiladi.`;
  return { subject, text };
}
async function sendSms(phone, message, meta = {}) {
  if (!SMS_WEBHOOK_URL) return { ok: false, error: "sms_not_configured" };
  const headers = { "content-type": "application/json" };
  if (SMS_WEBHOOK_TOKEN) headers.authorization = `Bearer ${SMS_WEBHOOK_TOKEN}`;
  let response;
  try {
    response = await fetch(SMS_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone, message, ...meta })
    });
  } catch {
    return { ok: false, error: "sms_failed" };
  }
  if (!response.ok) return { ok: false, error: "sms_failed", status: response.status };
  return { ok: true };
}
function emailHtml(text) {
  return `<p>${str(text, 5000)
    .replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]))
    .replace(/\r?\n/g, "<br>")}</p>`;
}
async function sendEmail(to, subject, text, meta = {}) {
  if (RESEND_API_KEY) {
    let response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${RESEND_API_KEY}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: [to],
          subject,
          text,
          html: emailHtml(text),
          tags: meta.purpose ? [{ name: "purpose", value: str(meta.purpose, 60) }] : undefined
        })
      });
    } catch {
      return { ok: false, error: "email_failed" };
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Resend email failed:", response.status, body.slice(0, 500));
      return { ok: false, error: "email_failed", status: response.status };
    }
    return { ok: true };
  }
  if (!EMAIL_WEBHOOK_URL) return { ok: false, error: "email_not_configured" };
  const headers = { "content-type": "application/json" };
  if (EMAIL_WEBHOOK_TOKEN) headers.authorization = `Bearer ${EMAIL_WEBHOOK_TOKEN}`;
  let response;
  try {
    response = await fetch(EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ to, subject, text, ...meta })
    });
  } catch {
    return { ok: false, error: "email_failed" };
  }
  if (!response.ok) return { ok: false, error: "email_failed", status: response.status };
  return { ok: true };
}

function audit(actor, event, meta = {}) {
  try {
    db.prepare("INSERT INTO audit_events (actor, event, meta) VALUES (?,?,?)")
      .run(str(actor, 60) || "system", str(event, 80), JSON.stringify(meta).slice(0, 5000));
  } catch (e) {
    console.error("Audit failed:", e.message);
  }
}

if (!getSetting("pass_hash")) {
  const initial = crypto.randomBytes(5).toString("hex"); // 10 chars
  setSetting("pass_hash", hashPassword(initial));
  fs.writeFileSync(path.join(DATA_DIR, "ADMIN-PASSWORD.txt"),
    "MILANA PREMIUM admin panel\r\nURL: http://localhost:" + PORT + "/admin\r\nLogin: admin\r\nPassword: " + initial +
    "\r\n\r\nChange it in Admin > Settings — this file is then deleted automatically.\r\n");
  console.log("\n  ADMIN PASSWORD (first run): " + initial);
  console.log("  Also saved to data/ADMIN-PASSWORD.txt — change it after first login.\n");
}

const SETTINGS_DEFAULTS = {
  admin_user: "admin",
  phone: "+998 50 155 10 10",
  whatsapp: "998501551010",
  telegram: "milanapremium2",
  instagram: "milana.premium",
  email: "",
  address_en: "Uzbekistan, Andijan, Qoratut 605 · Mon–Sat 08:00–18:00",
  address_ru: "Узбекистан, Андижан, Коратут, дом 605 · Пн–Сб 08:00–18:00",
  address_uz: "O‘zbekiston, Andijon, Qoratut 605-uy · Du–Sh 08:00–18:00",
  currency: "$",
  currency_pos: "before",
  hero_type: "image",                       // image | video
  hero_image: "/assets/img/hero.jpg",
  hero_video: "",
  hero_poster: "/assets/img/hero.jpg",
  accent: "#5c1f2d",                         // primary brand accent
  accent_dark: "#421521",                    // darker shade (dark sections, hovers)
};
for (const [k, v] of Object.entries(SETTINGS_DEFAULTS)) if (getSetting(k) == null) setSetting(k, v);

const ORDER_BAG_SIZE = 60;
const ORDER_BAG_SIZE_COUNT = 6;
const ORDER_SIZE_QTY = ORDER_BAG_SIZE / ORDER_BAG_SIZE_COUNT;
function defaultOrderSizes(gender, category) {
  if (gender === "kids" || category === "pajamas") return ["28", "30", "32", "34", "36", "38"];
  if (gender === "men") return ["46", "48", "50", "52", "54", "56"];
  return ["44", "46", "48", "50", "52", "54"];
}

function orderSizeMix(sizes, gender, category) {
  const seen = new Set();
  const merged = [...(Array.isArray(sizes) ? sizes : []), ...defaultOrderSizes(gender, category)]
    .map((s) => str(s, 8))
    .filter(Boolean)
    .filter((s) => (seen.has(s) ? false : (seen.add(s), true)))
    .slice(0, ORDER_BAG_SIZE_COUNT);
  return merged.map((size) => ({ size, qty: ORDER_SIZE_QTY }));
}

function paymentProvider(method) {
  if (method === "click") return "click";
  if (method === "payme") return "payme";
  if (method === "card") return "card";
  return "manual";
}

const SETTINGS_LEGACY_REFRESH = {
  phone: ["+39 02 8736 1144", SETTINGS_DEFAULTS.phone],
  whatsapp: ["393287361144", SETTINGS_DEFAULTS.whatsapp],
  telegram: ["milanapremium", SETTINGS_DEFAULTS.telegram],
  email: ["ciao@milanapremium.com", SETTINGS_DEFAULTS.email],
  address_en: ["Via Tortona 31, 20144 Milano · Mon–Sat 10:00–19:00", SETTINGS_DEFAULTS.address_en],
  address_ru: ["Via Tortona 31, 20144 Милан · Пн–Сб 10:00–19:00", SETTINGS_DEFAULTS.address_ru],
  address_uz: ["Via Tortona 31, 20144 Milan · Du–Sh 10:00–19:00", SETTINGS_DEFAULTS.address_uz],
  currency: ["€", SETTINGS_DEFAULTS.currency],
};
for (const [k, [legacy, next]] of Object.entries(SETTINGS_LEGACY_REFRESH)) {
  if (getSetting(k) === legacy) setSetting(k, next);
}

const seedMod = require("./seed.js");

/* ---------- schema migration: add model_no / variant / gender, split category ---------- */
(() => {
  const cols = db.prepare("PRAGMA table_info(products)").all().map((c) => c.name);
  if (!cols.includes("model_no")) db.exec("ALTER TABLE products ADD COLUMN model_no TEXT DEFAULT ''");
  if (!cols.includes("variant")) db.exec("ALTER TABLE products ADD COLUMN variant TEXT DEFAULT ''");
  if (!cols.includes("gender")) db.exec("ALTER TABLE products ADD COLUMN gender TEXT DEFAULT ''");
  if (!cols.includes("wholesale_price")) db.exec("ALTER TABLE products ADD COLUMN wholesale_price REAL DEFAULT 0");
  if (!cols.includes("wholesale_moq")) db.exec("ALTER TABLE products ADD COLUMN wholesale_moq INTEGER DEFAULT 60");
  if (!cols.includes("retail_enabled")) db.exec("ALTER TABLE products ADD COLUMN retail_enabled INTEGER DEFAULT 1");
  if (!cols.includes("retail_price")) db.exec("ALTER TABLE products ADD COLUMN retail_price REAL DEFAULT 0");
  if (!cols.includes("retail_stock")) db.exec("ALTER TABLE products ADD COLUMN retail_stock INTEGER DEFAULT 0");
  if (!cols.includes("available_qop")) db.exec("ALTER TABLE products ADD COLUMN available_qop INTEGER");
  if (!cols.includes("like_count")) db.exec("ALTER TABLE products ADD COLUMN like_count INTEGER DEFAULT 0");
  db.exec("UPDATE products SET wholesale_price=price WHERE COALESCE(wholesale_price,0)<=0");
  db.exec("UPDATE products SET retail_price=price WHERE COALESCE(retail_price,0)<=0");
  db.exec("UPDATE products SET wholesale_moq=60 WHERE COALESCE(wholesale_moq,0)<=0");

  // backfill any row lacking a gender (old single-category data or imports)
  const stale = db.prepare("SELECT id, slug, category FROM products WHERE gender IS NULL OR gender=''").all();
  if (stale.length) {
    const bySlug = Object.fromEntries((seedMod.products || []).map((p) => [p.slug, p]));
    const GEN = { women: "women", men: "men", kids: "kids", pajamas: "women", robes: "women", homewear: "unisex" };
    const CLO = { women: "loungewear", men: "loungewear", kids: "pajamas", pajamas: "pajamas", robes: "robes", homewear: "homewear" };
    const upd = db.prepare("UPDATE products SET model_no=?, variant=?, gender=?, category=? WHERE id=?");
    stale.forEach((r) => {
      const sd = bySlug[r.slug];
      upd.run(
        sd?.model_no || "MP-" + String(1000 + r.id),
        sd?.variant || "",
        sd?.gender || GEN[r.category] || "unisex",
        sd?.category || CLO[r.category] || r.category,
        r.id
      );
    });
    console.log("  Migrated " + stale.length + " product(s) to gender + clothing schema.");
  }

  const orderCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
  if (!orderCols.includes("customer_id")) db.exec("ALTER TABLE orders ADD COLUMN customer_id INTEGER");
  if (!orderCols.includes("order_type")) db.exec("ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'wholesale'");
  if (!orderCols.includes("tracking_number")) db.exec("ALTER TABLE orders ADD COLUMN tracking_number TEXT DEFAULT ''");
  if (!orderCols.includes("updated_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN updated_at TEXT DEFAULT ''");
    db.exec("UPDATE orders SET updated_at=COALESCE(NULLIF(created_at,''), datetime('now')) WHERE updated_at=''");
  }
  const customerCols = db.prepare("PRAGMA table_info(customers)").all().map((c) => c.name);
  if (!customerCols.includes("city")) db.exec("ALTER TABLE customers ADD COLUMN city TEXT DEFAULT ''");
  if (!customerCols.includes("address")) db.exec("ALTER TABLE customers ADD COLUMN address TEXT DEFAULT ''");
  if (!customerCols.includes("account_type")) db.exec("ALTER TABLE customers ADD COLUMN account_type TEXT DEFAULT 'business'");
  if (!customerCols.includes("approval_status")) db.exec("ALTER TABLE customers ADD COLUMN approval_status TEXT DEFAULT 'active'");
  if (!customerCols.includes("company_name")) db.exec("ALTER TABLE customers ADD COLUMN company_name TEXT DEFAULT ''");
  if (!customerCols.includes("tax_id")) db.exec("ALTER TABLE customers ADD COLUMN tax_id TEXT DEFAULT ''");
  if (!customerCols.includes("legal_address")) db.exec("ALTER TABLE customers ADD COLUMN legal_address TEXT DEFAULT ''");
  if (!customerCols.includes("contact_person")) db.exec("ALTER TABLE customers ADD COLUMN contact_person TEXT DEFAULT ''");
  if (!customerCols.includes("expected_volume")) db.exec("ALTER TABLE customers ADD COLUMN expected_volume TEXT DEFAULT ''");
  if (!customerCols.includes("business_license_url")) db.exec("ALTER TABLE customers ADD COLUMN business_license_url TEXT DEFAULT ''");
  if (!customerCols.includes("terms_accepted_at")) db.exec("ALTER TABLE customers ADD COLUMN terms_accepted_at TEXT DEFAULT ''");
  if (!customerCols.includes("phone_verified")) db.exec("ALTER TABLE customers ADD COLUMN phone_verified INTEGER DEFAULT 0");
  if (!customerCols.includes("customer_tier")) db.exec("ALTER TABLE customers ADD COLUMN customer_tier TEXT DEFAULT 'regular'");
  if (!customerCols.includes("assigned_manager")) db.exec("ALTER TABLE customers ADD COLUMN assigned_manager TEXT DEFAULT ''");
  if (!customerCols.includes("price_discount")) db.exec("ALTER TABLE customers ADD COLUMN price_discount REAL DEFAULT 0");
})();

if (SEED_FALLBACK_CATALOG && !db.prepare("SELECT COUNT(*) c FROM products").get().c) {
  try {
    seedMod.seed(db);
    console.log("  Seeded fallback Milana catalog (" + db.prepare("SELECT COUNT(*) c FROM products").get().c + " products).");
  } catch (e) { console.error("Seed failed:", e.message); }
}

/* ========================= helpers ========================= */

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".gif": "image/gif", ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8",
};

function cspOrigin(url) {
  try { return new URL(url).origin; } catch { return ""; }
}
const CATALOG_ASSET_ORIGIN = cspOrigin(CATALOG_SUPABASE_URL);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${CATALOG_ASSET_ORIGIN} https://lh3.googleusercontent.com`,
    "font-src 'self'",
    `media-src 'self' ${CATALOG_ASSET_ORIGIN}`,
    `connect-src 'self' ${CATALOG_ASSET_ORIGIN} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://firestore.googleapis.com`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
};

const DEV_CORS_ORIGINS = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5180",
  "http://localhost:5180",
]);
const CONFIGURED_CORS_ORIGINS = new Set(
  String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean)
);

function corsHeaders(req) {
  const origin = String(req.headers.origin || "").replace(/\/+$/, "");
  if (!DEV_CORS_ORIGINS.has(origin) && !CONFIGURED_CORS_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Vary": "Origin",
  };
}

function send(res, code, body, headers = {}) {
  const h = { ...SECURITY_HEADERS, "Cache-Control": "no-store", ...headers };
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body);
    h["Content-Type"] = "application/json; charset=utf-8";
  }
  res.writeHead(code, h);
  res.end(body);
}
const fail = (res, code, error) => send(res, code, { error });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
async function readJson(req, limit = 1e6) {
  const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (type && type !== "application/json") throw new Error("bad_type");
  const buf = await readBody(req, limit);
  try { return JSON.parse(buf.toString("utf8") || "{}"); }
  catch { throw new Error("bad_json"); }
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function sameOrigin(req) {
  const header = req.headers.origin || req.headers.referer;
  if (!header) return true;
  try {
    const got = new URL(header);
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
    return got.host.toLowerCase() === host;
  } catch {
    return false;
  }
}
function trustedRequestOrigin(req) {
  const origin = String(req.headers.origin || "").replace(/\/+$/, "");
  return !origin || sameOrigin(req) || DEV_CORS_ORIGINS.has(origin) || CONFIGURED_CORS_ORIGINS.has(origin);
}

/* ---------- rate limiting ---------- */
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  return b.count <= max;
}
const ipOf = (req) => (req.socket.remoteAddress || "?").replace(/^::ffff:/, "");

/* ---------- sessions ---------- */
const SESSION_TTL = 30 * 24 * 3600 * 1000;
function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, created_at) VALUES (?,?)").run(sha256(token), Date.now());
  return token;
}
function isAdmin(req) {
  const token = parseCookies(req).sid;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const tokenHash = sha256(token);
  let row = db.prepare("SELECT created_at FROM sessions WHERE token=?").get(tokenHash);
  if (!row) {
    row = db.prepare("SELECT created_at FROM sessions WHERE token=?").get(token); // legacy plaintext session
    if (row) db.prepare("UPDATE sessions SET token=? WHERE token=?").run(tokenHash, token);
  }
  if (!row) return false;
  if (Date.now() - row.created_at > SESSION_TTL) {
    db.prepare("DELETE FROM sessions WHERE token IN (?,?)").run(tokenHash, token);
    return false;
  }
  return true;
}
function sessionCookie(req, token, maxAge) {
  const secure = (req.headers["x-forwarded-proto"] === "https") ? "; Secure" : "";
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function customerCookie(req, token, maxAge) {
  const secure = (req.headers["x-forwarded-proto"] === "https") ? "; Secure" : "";
  return `cid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function publicCustomer(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || "",
    phone: row.phone || "",
    city: row.city || "",
    address: row.address || "",
    account_type: row.account_type || "business",
    approval_status: row.approval_status || "active",
    company_name: row.company_name || "",
    tax_id: row.tax_id || "",
    legal_address: row.legal_address || "",
    contact_person: row.contact_person || "",
    expected_volume: row.expected_volume || "",
    phone_verified: !!row.phone_verified,
    customer_tier: normalizeCustomerTier(row.customer_tier),
    assigned_manager: row.assigned_manager || "",
    price_discount: Math.max(0, Math.min(90, Number(row.price_discount) || 0)),
    provider: row.provider || "local",
    role: row.role || "customer",
  };
}

function createCustomerSession(customerId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO customer_sessions (token, customer_id, created_at) VALUES (?,?,?)")
    .run(sha256(token), customerId, Date.now());
  return token;
}

function customerFromRequest(req) {
  const auth = String(req.headers.authorization || "");
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const token = bearer || parseCookies(req).cid;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = sha256(token);
  const row = db.prepare(`
    SELECT c.* FROM customer_sessions s
    JOIN customers c ON c.id=s.customer_id
    WHERE s.token=?
  `).get(tokenHash);
  if (!row) return null;
  if (Date.now() - Number(db.prepare("SELECT created_at FROM customer_sessions WHERE token=?").get(tokenHash)?.created_at || 0) > SESSION_TTL) {
    db.prepare("DELETE FROM customer_sessions WHERE token=?").run(tokenHash);
    return null;
  }
  return row;
}

function authResponse(req, res, code, customer, token) {
  send(res, code, { customer: publicCustomer(customer), session_token: token }, { "Set-Cookie": customerCookie(req, token, 30 * 24 * 3600) });
}

function firebasePublicConfig() {
  if (!FIREBASE_ENABLED) return null;
  return Object.fromEntries(Object.entries(FIREBASE_CONFIG).filter(([, v]) => Boolean(v)));
}

let firebaseCertCache = { at: 0, maxAgeMs: 3600_000, certs: {} };

function b64UrlJson(part) {
  return JSON.parse(Buffer.from(String(part).replace(/-/g, "+").replace(/_/g, "/"), "base64url").toString("utf8"));
}

async function firebaseCerts() {
  const now = Date.now();
  if (firebaseCertCache.certs && Object.keys(firebaseCertCache.certs).length && now - firebaseCertCache.at < firebaseCertCache.maxAgeMs) {
    return firebaseCertCache.certs;
  }
  const r = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!r.ok) throw new Error("firebase_certs_" + r.status);
  const cc = r.headers.get("cache-control") || "";
  const maxAge = Number(cc.match(/max-age=(\d+)/)?.[1] || 3600);
  firebaseCertCache = { at: now, maxAgeMs: Math.max(300, maxAge - 60) * 1000, certs: await r.json() };
  return firebaseCertCache.certs;
}

async function verifyFirebaseIdToken(idToken) {
  if (!FIREBASE_ENABLED) throw new Error("firebase_not_configured");
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("bad_token");
  const header = b64UrlJson(parts[0]);
  const payload = b64UrlJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("bad_token_header");
  const cert = (await firebaseCerts())[header.kid];
  if (!cert) throw new Error("firebase_cert_missing");
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(parts[0] + "." + parts[1]),
    cert,
    Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64")
  );
  if (!ok) throw new Error("bad_token_signature");
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now || payload.iat > now + 60) throw new Error("token_expired");
  if (payload.aud !== FIREBASE_CONFIG.projectId) throw new Error("bad_token_audience");
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_CONFIG.projectId}`) throw new Error("bad_token_issuer");
  if (!payload.sub || String(payload.sub).length > 128) throw new Error("bad_token_subject");
  return payload;
}

function normalizeAccountType(v) {
  return v === "individual" ? "individual" : v === "business" ? "business" : "";
}
function normalizeCustomerTier(v) {
  return ["regular", "premium", "vip"].includes(v) ? v : "regular";
}
function normalizeApproval(v, accountType) {
  if (["active", "pending_review", "rejected", "info_requested"].includes(v)) return v;
  return "active";
}
function termsAccepted(v) {
  return v === true || v === "true" || v === "on" || v === "1" || v === 1;
}

function upsertCustomer({
  email,
  name = "",
  phone = "",
  city = "",
  address = "",
  account_type = "",
  approval_status = "",
  company_name = "",
  tax_id = "",
  legal_address = "",
  contact_person = "",
  expected_volume = "",
  business_license_url = "",
  terms_accepted_at = "",
  phone_verified = 0,
  provider = "local",
  provider_uid = "",
  password_hash = "",
}) {
  const cleanEmail = normalizeEmail(email);
  if (!emailOk(cleanEmail)) throw new Error("email");
  const cleanAccount = normalizeAccountType(account_type);
  const cleanApproval = approval_status
    ? normalizeApproval(approval_status, cleanAccount || "business")
    : cleanAccount ? normalizeApproval("", cleanAccount) : "";
  const existing = db.prepare("SELECT * FROM customers WHERE email=?").get(cleanEmail);
  if (existing) {
    db.prepare(`
      UPDATE customers SET
        name=COALESCE(NULLIF(?,''), name),
        phone=COALESCE(NULLIF(?,''), phone),
        city=COALESCE(NULLIF(?,''), city),
        address=COALESCE(NULLIF(?,''), address),
        account_type=COALESCE(NULLIF(?,''), account_type),
        approval_status=COALESCE(NULLIF(?,''), approval_status),
        company_name=COALESCE(NULLIF(?,''), company_name),
        tax_id=COALESCE(NULLIF(?,''), tax_id),
        legal_address=COALESCE(NULLIF(?,''), legal_address),
        contact_person=COALESCE(NULLIF(?,''), contact_person),
        expected_volume=COALESCE(NULLIF(?,''), expected_volume),
        business_license_url=COALESCE(NULLIF(?,''), business_license_url),
        terms_accepted_at=COALESCE(NULLIF(?,''), terms_accepted_at),
        phone_verified=MAX(phone_verified, ?),
        provider=?,
        provider_uid=COALESCE(NULLIF(?,''), provider_uid),
        password_hash=COALESCE(NULLIF(?,''), password_hash),
        updated_at=datetime('now')
      WHERE id=?
    `).run(
      str(name, 80),
      str(phone, 25),
      str(city, 80),
      str(address, 300),
      cleanAccount,
      cleanApproval,
      str(company_name, 140),
      str(tax_id, 32),
      str(legal_address, 300),
      str(contact_person, 80),
      str(expected_volume, 80),
      str(business_license_url, 300),
      str(terms_accepted_at, 40),
      phone_verified ? 1 : 0,
      provider,
      str(provider_uid, 160),
      password_hash,
      existing.id
    );
    return db.prepare("SELECT * FROM customers WHERE id=?").get(existing.id);
  }
  const r = db.prepare(`
    INSERT INTO customers (
      email, name, phone, city, address, account_type, approval_status,
      company_name, tax_id, legal_address, contact_person, expected_volume,
      business_license_url, terms_accepted_at, phone_verified,
      provider, provider_uid, password_hash
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    cleanEmail,
    str(name, 80),
    str(phone, 25),
    str(city, 80),
    str(address, 300),
    cleanAccount || "business",
    cleanApproval || "active",
    str(company_name, 140),
    str(tax_id, 32),
    str(legal_address, 300),
    str(contact_person, 80),
    str(expected_volume, 80),
    str(business_license_url, 300),
    str(terms_accepted_at, 40),
    phone_verified ? 1 : 0,
    provider,
    str(provider_uid, 160),
    password_hash
  );
  return db.prepare("SELECT * FROM customers WHERE id=?").get(r.lastInsertRowid);
}

/* ---------- misc ---------- */
const CATS = ["pajamas", "robes", "homewear", "loungewear"]; // clothing type
const GENDERS = ["women", "men", "kids", "unisex"];
const TAGS = ["", "bestseller", "new", "sale"];
const ORDER_STATUSES = ["new", "processing", "shipped", "done", "cancelled"];
const PAYMENT_METHODS = ["manager", "cash", "bank", "click", "payme", "card"];
const PAYMENT_STATUSES = ["pending", "invoice_sent", "waiting_for_customer", "submitted", "paid", "failed", "refunded", "cancelled"];
const SUPPORT_TOPICS = ["general", "catalog", "price", "delivery", "defect", "payment", "order"];
const SUPPORT_STATUSES = ["new", "open", "waiting", "done", "closed"];
const ACCOUNT_TYPES = ["business", "individual"];
const APPROVAL_STATUSES = ["active", "pending_review", "rejected", "info_requested"];
const CUSTOMER_TIERS = ["regular", "premium", "vip"];
const REVIEW_STATUSES = ["pending", "approved", "rejected"];
const CHAT_STATUSES = ["bot", "escalated", "open", "closed"];
const str = (v, max = 1000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const normalizeEmail = (v) => str(v, 254).toLowerCase();
const normalizePhone = (v) => str(v, 25).replace(/\D/g, "");
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && !/[<>"']/.test(v);
const htmlText = (v) => str(v, 5000).replace(/\s+/g, " ").trim();
const money = (n, currency = "USD") => `${Math.round((Number(n) || 0) * 100) / 100} ${currency}`;

const TELEGRAM_BOT_TOKEN = str(process.env.TELEGRAM_BOT_TOKEN || "", 200);
const TELEGRAM_ORDER_CHAT_ID = str(process.env.TELEGRAM_ORDER_CHAT_ID || "", 80);
const TELEGRAM_ORDER_THREAD_ID = str(process.env.TELEGRAM_ORDER_THREAD_ID || "", 30);
const TELEGRAM_API_BASE = str(process.env.TELEGRAM_API_BASE || "https://api.telegram.org", 500).replace(/\/+$/, "");
const TELEGRAM_ORDERS_ENABLED = process.env.TELEGRAM_ORDERS_ENABLED !== "0" && Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_ORDER_CHAT_ID);

function truncateTelegram(text) {
  return text.length <= 3900 ? text : text.slice(0, 3880) + "\n...truncated";
}

function formatTelegramOrder({ number, customer, items, total, orderType, paymentMethod, source, lang }) {
  const orderTypeLabel = orderType === "retail" ? "chakana" : "ulgurji";
  const paymentLabel = paymentMethod === "bank" ? "bank" : paymentMethod === "cash" ? "naqd" : "menejer orqali";
  const hasPendingPrice = items.some((item) => item.price_pending);
  const lines = [
    `Yangi Milana buyurtmasi ${number}`,
    `Manba: ${source || "website"} · Til: ${lang || "uz"} · Tur: ${orderTypeLabel}`,
    `Mijoz: ${customer.name || "-"}`,
    `Telefon: ${customer.phone || "-"}`,
  ];
  if (customer.customer_tier) lines.push(`Mijoz turi: ${customer.customer_tier}`);
  if (customer.assigned_manager) lines.push(`Biriktirilgan menejer: ${customer.assigned_manager}`);
  if (customer.email) lines.push(`Email: ${customer.email}`);
  if (customer.city || customer.address) lines.push(`Manzil: ${[customer.city, customer.address].filter(Boolean).join(", ")}`);
  if (customer.comment) lines.push(`Izoh: ${customer.comment}`);
  lines.push("", "Mahsulotlar:");
  items.forEach((item, idx) => {
    const mix = (item.size_mix || []).map((m) => `${m.size}x${m.qty}`).join(", ");
    lines.push(`${idx + 1}. ${item.name}`);
    const unit = item.unit_type === "piece" ? "dona" : "qop";
    const packLabel = item.unit_type === "piece" ? "dona" : "qop";
    if (item.price_pending) {
      lines.push(`   ${item.qty} ${unit} · ${item.bag_size} dona/${packLabel} · narxni menejer tasdiqlaydi`);
    } else {
      lines.push(`   ${item.qty} ${unit} · ${item.bag_size} dona/${packLabel} · birlik ${money(item.unit_price)} · jami ${money(item.price * item.qty)}`);
    }
    if (mix) lines.push(`   O'lchamlar: ${mix}`);
  });
  lines.push("", `Umumiy summa: ${hasPendingPrice ? "menejer tasdiqlaydi" : money(total)}`, `To'lov: ${paymentLabel} · kutilmoqda/qo'lda tasdiqlanadi`);
  lines.push(`Admin: ${process.env.PUBLIC_SITE_URL || "https://milanapremium.uz"}/admin`);
  return truncateTelegram(lines.join("\n"));
}

async function notifyTelegramOrder(order) {
  if (!TELEGRAM_ORDERS_ENABLED) return { skipped: true };
  const body = {
    chat_id: TELEGRAM_ORDER_CHAT_ID,
    text: formatTelegramOrder(order),
    disable_web_page_preview: true,
  };
  if (/^\d+$/.test(TELEGRAM_ORDER_THREAD_ID)) body.message_thread_id = Number(TELEGRAM_ORDER_THREAD_ID);
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("telegram_" + response.status);
  return await response.json().catch(() => ({ ok: true }));
}

function notifyTelegramOrderLater(order) {
  notifyTelegramOrder(order).then((result) => {
    if (result?.skipped) {
      audit("system", "telegram.order_skipped", { number: order.number });
      return;
    }
    audit("system", "telegram.order_sent", { number: order.number, message_id: result?.result?.message_id || result?.message_id || "" });
  }).catch((e) => {
    console.error("Telegram order notification failed:", e.message);
    audit("system", "telegram.order_failed", { number: order.number, error: e.message });
  });
}

const CATALOGS = [
  { source_pdf: "01_Staple_Model_Catalog.pdf", gender: "women", category: "loungewear" },
  { source_pdf: "02_Milana_Man_Premium_Collection.pdf", gender: "men", category: "loungewear" },
  { source_pdf: "03_Kindergarten_Set.pdf", gender: "kids", category: "pajamas" },
  { source_pdf: "04_Milana_Products_in_Stock.pdf", gender: "women", category: "loungewear" },
];
const catalogSourceMeta = (source) => CATALOGS.find((c) => c.source_pdf === source) || CATALOGS[3];

let catalogCache = { at: 0, products: [], byId: new Map(), bySlug: new Map(), error: null };

function catalogOverrideMap() {
  try {
    return new Map(db.prepare("SELECT catalog_id, active FROM catalog_product_overrides").all().map((r) => [Number(r.catalog_id), Number(r.active) !== 0]));
  } catch {
    return new Map();
  }
}

function applyCatalogOverrides(products) {
  const overrides = catalogOverrideMap();
  return products.map((p) => ({
    ...p,
    active: overrides.has(Number(p.id)) ? overrides.get(Number(p.id)) : p.active,
  }));
}

function setCatalogProductActive(id, active) {
  db.prepare(`
    INSERT INTO catalog_product_overrides (catalog_id, active, updated_at)
    VALUES (?,?,datetime('now'))
    ON CONFLICT(catalog_id) DO UPDATE SET active=excluded.active, updated_at=datetime('now')
  `).run(Number(id), active ? 1 : 0);
}

function catalogHeaders() {
  if (CATALOG_API_TOKEN) return { Authorization: "Bearer " + CATALOG_API_TOKEN };
  return { apikey: CATALOG_SUPABASE_KEY, Authorization: "Bearer " + CATALOG_SUPABASE_KEY };
}

function catalogImageUrl(row, width = 900, quality = 76) {
  const explicit = str(row.image_url, 1000);
  if (explicit) {
    if (/^https?:\/\//i.test(explicit)) return explicit;
    if (explicit.startsWith("/storage/")) return explicit;
    return explicit.startsWith("/") && CATALOG_API_BASE ? explicit : explicit;
  }
  const bucket = str(row.image_storage_bucket, 120) || CATALOG_IMAGE_BUCKET;
  const imgPath = str(row.image_storage_path, 1000).replace(/^\/+/, "");
  if (!imgPath) return "";
  if (CATALOG_API_BASE) return `/storage/${encodeURIComponent(bucket)}/${encodeStoragePath(imgPath)}`;
  const params = new URLSearchParams({ width: String(width), quality: String(quality), resize: "contain" });
  return `${CATALOG_SUPABASE_URL}/storage/v1/render/image/public/${encodeURIComponent(bucket)}/${encodeStoragePath(imgPath)}?${params}`;
}

function encodeStoragePath(p) {
  return String(p).split("/").map(encodeURIComponent).join("/");
}

function parseCatalogSizes(text) {
  const found = [];
  const seen = new Set();
  String(text || "").split(/\s+/).forEach((token) => {
    const clean = token.replace(/[^\dA-Za-z]/g, "").toUpperCase();
    const numeric = /^\d{2}$/.test(clean) ? Number(clean) : 0;
    const ok = numeric >= 24 && numeric <= 60 && numeric % 2 === 0;
    if (ok && !seen.has(clean)) { seen.add(clean); found.push(clean); }
  });
  return found.slice(0, 12);
}

function catalogFabric(row) {
  const text = String(row.combined_text || row.native_text || row.ocr_text || "");
  const lines = text.split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((line) => !/^(MIL[>A-Z]*|PREMIUM|MODEL|CODE|SALE)$/i.test(line))
    .filter((line) => !/^\d+(\.\d+)?\s*\$?$/i.test(line))
    .filter((line) => !/^[A-Z]-?\d+$/i.test(line))
    .filter((line) => !/^\d{2}$/.test(line));
  return htmlText(row.material_type || lines.slice(0, 2).join(" · "), 300);
}

function catalogCategory(row) {
  const meta = catalogSourceMeta(row.source_pdf);
  const text = String([row.combined_text, row.native_text, row.ocr_text, row.model_code, row.product_code].filter(Boolean).join(" ")).toLowerCase();
  if (/robe|halat|халат/.test(text)) return "robes";
  if (/pajama|pijama|пижам|sleep|kindergarten|садик|bog/.test(text)) return "pajamas";
  if (/home|waffle|cotton|sweat|hood|футбол|t-?shirt/.test(text)) return "homewear";
  return meta.category;
}

function catalogProductName(row) {
  const model = str(row.model_code, 80);
  const code = str(row.product_code, 80);
  if (model && code && model !== code) return `${model} / ${code}`;
  return model || code || `Catalog item ${row.id}`;
}

function reviewSummary(productId, slug) {
  const row = db.prepare(`
    SELECT COUNT(*) count, AVG(rating) avg
    FROM reviews
    WHERE status='approved' AND (product_id=? OR product_slug=?)
  `).get(Number(productId) || 0, str(slug, 120));
  return { count: Number(row?.count || 0), avg: Number(row?.avg || 0) };
}

function likeCount(productId, slug) {
  return Number(db.prepare(`
    SELECT COUNT(*) count FROM likes WHERE product_id=? OR product_slug=?
  `).get(Number(productId) || 0, str(slug, 120))?.count || 0);
}

function decorateProduct(p) {
  const summary = reviewSummary(p.id, p.slug);
  const storedReviews = Number(p.reviews) || 0;
  const storedRating = Number(p.rating) || 0;
  const reviews = summary.count || storedReviews;
  const rating = summary.count ? Math.round(summary.avg * 10) / 10 : (storedRating || 4.8);
  const wholesale = Number(p.wholesale_price || p.price || 0);
  const retail = Number(p.retail_price || p.price || wholesale || 0);
  return {
    ...p,
    price: wholesale,
    wholesale_price: wholesale,
    wholesale_moq: Math.max(1, Math.round(Number(p.wholesale_moq) || ORDER_BAG_SIZE)),
    retail_enabled: p.retail_enabled !== false && Number(p.retail_enabled) !== 0,
    retail_price: retail,
    retail_stock: Math.max(0, Math.round(Number(p.retail_stock) || 0)),
    available_qop: p.available_qop == null || p.available_qop === "" ? null : Math.max(0, Math.round(Number(p.available_qop) || 0)),
    like_count: likeCount(p.id, p.slug),
    rating,
    reviews,
  };
}

function customerCanSeeContractPrice(customer) {
  const tier = normalizeCustomerTier(customer?.customer_tier);
  return Boolean(customer && customer.approval_status === "active" && (tier === "premium" || tier === "vip"));
}

function contractDiscount(customer) {
  if (!customerCanSeeContractPrice(customer)) return 0;
  return Math.max(0, Math.min(90, Number(customer.price_discount) || 0));
}

function priceForCustomer(product, customer, orderType = "wholesale") {
  const retail = orderType === "retail";
  const base = Number(retail ? product.retail_price || product.price : product.wholesale_price || product.price) || 0;
  if (!customerCanSeeContractPrice(customer)) {
    return {
      visible: false,
      unit: 0,
      base,
      discount: 0,
      source: "manager_confirmation",
      label: "manager",
      assigned_manager: customer?.assigned_manager || "",
    };
  }
  const discount = contractDiscount(customer);
  const unit = Math.round(base * (1 - discount / 100) * 100) / 100;
  return {
    visible: true,
    unit,
    base,
    discount,
    source: discount ? "customer_discount" : "premium_catalog",
    label: normalizeCustomerTier(customer.customer_tier),
    assigned_manager: customer.assigned_manager || "",
  };
}

function productForCustomer(product, customer, orderType = "wholesale") {
  const pricing = priceForCustomer(product, customer, orderType);
  return {
    ...product,
    price: pricing.visible ? pricing.unit : 0,
    wholesale_price: pricing.visible ? pricing.unit : 0,
    retail_price: pricing.visible ? pricing.unit : 0,
    old_price: pricing.visible ? product.old_price : null,
    price_visible: pricing.visible,
    price_label: pricing.label,
    price_source: pricing.source,
    price_discount: pricing.discount,
    assigned_manager: pricing.assigned_manager,
  };
}

function catalogRowToProduct(row) {
  const meta = catalogSourceMeta(row.source_pdf);
  const name = catalogProductName(row);
  const code = str(row.product_code, 80);
  const model = str(row.model_code, 80);
  const text = htmlText(row.combined_text || row.native_text || row.ocr_text || "", 5000);
  const fabric = catalogFabric(row);
  const price = Number(row.price) || 0;
  const image = catalogImageUrl(row);
  const isSale = /\bSALE\b/i.test(String(row.combined_text || row.native_text || row.ocr_text || ""));
  const category = catalogCategory(row);
  const slug = uniqueSlugFromCatalog(row, name);
  return decorateProduct({
    id: Number(row.id),
    slug,
    name,
    model_no: model,
    variant: code,
    gender: meta.gender,
    category,
    price,
    old_price: null,
    sizes: parseCatalogSizes(text),
    images: image ? [image] : [],
    tag: isSale ? "sale" : "",
    rating: 4.8,
    reviews: 0,
    active: true,
    sort: 1_000_000 - (Number(row.page) || 0) * 100 - (Number(row.card_index) || 0),
    desc: { en: text, ru: text, uz: text },
    fabric: { en: fabric, ru: fabric, uz: fabric },
    created_at: row.created_at || "",
    source: CATALOG_API_BASE ? "catalog_api" : "supabase_catalog",
    source_pdf: row.source_pdf,
    currency: row.currency || "USD",
    available_qop: row.available_qop,
  });
}

function uniqueSlugFromCatalog(row, name) {
  const base = slugify([name, row.source_pdf, row.page, row.card_index].filter(Boolean).join("-"));
  return "catalog-" + row.id + "-" + base;
}

async function fetchCatalogRows() {
  if (CATALOG_API_BASE) {
    const url = new URL(CATALOG_API_BASE + "/api/products");
    url.searchParams.set("include_hidden", "false");
    const response = await fetch(url, { headers: catalogHeaders() });
    if (!response.ok) throw new Error("catalog_api_" + response.status);
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  }
  const baseSelect = [
    "id", "source_pdf", "page", "card_index", "model_code", "product_code", "material_type",
    "price", "currency", "image_url", "image_storage_bucket", "image_storage_path",
    "extraction_status", "native_text", "ocr_text", "combined_text", "created_at"
  ].join(",");
  let url = `${CATALOG_SUPABASE_URL}/rest/v1/${encodeURIComponent(CATALOG_TABLE)}?select=${baseSelect}&price=not.is.null&order=source_pdf.asc,page.asc,card_index.asc&limit=1000`;
  let response = await fetch(url, { headers: catalogHeaders() });
  if (!response.ok) {
    const fallbackSelect = baseSelect.replace("material_type,", "");
    url = `${CATALOG_SUPABASE_URL}/rest/v1/${encodeURIComponent(CATALOG_TABLE)}?select=${fallbackSelect}&price=not.is.null&order=source_pdf.asc,page.asc,card_index.asc&limit=1000`;
    response = await fetch(url, { headers: catalogHeaders() });
  }
  if (!response.ok) throw new Error("catalog_supabase_" + response.status);
  return await response.json();
}

async function catalogProducts(force = false) {
  if (!CATALOG_SOURCE_ENABLED) return [];
  if (!CATALOG_API_BASE && (!CATALOG_SUPABASE_URL || !CATALOG_SUPABASE_KEY)) return [];
  const now = Date.now();
  if (!force && catalogCache.products.length && now - catalogCache.at < CATALOG_CACHE_MS) return applyCatalogOverrides(catalogCache.products);
  const rows = await fetchCatalogRows();
  const products = rows
    .filter((row) => row && row.extraction_status !== "admin_hidden")
    .map(catalogRowToProduct)
    .filter((p) => p.id && p.price > 0 && p.images.length);
  catalogCache = {
    at: now,
    products,
    byId: new Map(products.map((p) => [p.id, p])),
    bySlug: new Map(products.map((p) => [p.slug, p])),
    error: null,
  };
  return applyCatalogOverrides(products);
}

async function catalogProductById(id) {
  const products = await catalogProducts();
  return products.find((p) => p.id === Number(id)) || catalogCache.byId.get(Number(id));
}

async function catalogProductBySlug(slug) {
  const products = await catalogProducts();
  return products.find((p) => p.slug === slug) || catalogCache.bySlug.get(slug);
}

const SMART_SYNONYMS = {
  ayol: "women", ayollar: "women", women: "women", woman: "women", female: "women", jenskiy: "women", zhenskij: "women", женский: "women", женщина: "women",
  erkak: "men", erkaklar: "men", men: "men", man: "men", male: "men", mujskoy: "men", muzhskoy: "men", мужской: "men", мужчина: "men",
  bola: "kids", bolalar: "kids", kids: "kids", children: "kids", child: "kids", detskiy: "kids", детский: "kids", дети: "kids",
  pijama: "pajamas", pajama: "pajamas", pajamas: "pajamas", пижама: "pajamas", пижамы: "pajamas",
  halat: "robes", xalat: "robes", robe: "robes", robes: "robes", халат: "robes",
  uy: "homewear", home: "homewear", homewear: "homewear", domashniy: "homewear", домашняя: "homewear",
  lounge: "loungewear", loungewear: "loungewear", komplekt: "loungewear", set: "loungewear", комплект: "loungewear",
  paxta: "cotton", хлопок: "cotton", cotton: "cotton", suprem: "suprem", suprema: "suprem",
};

function smartNormalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[а-яёёўқғҳ]/g, (c) => TRANSLIT[c] ?? c)
    .replace(/['’`ʻ]/g, "")
    .replace(/[^a-z0-9.$]+/g, " ")
    .trim();
}

function smartTokens(query) {
  const seen = new Set();
  const tokens = smartNormalize(query).split(/\s+/).filter((t) => t.length > 1);
  return tokens.flatMap((t) => [t, SMART_SYNONYMS[t]].filter(Boolean)).filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}

function productSearchText(p) {
  return smartNormalize([
    p.name, p.slug, p.model_no, p.variant, p.gender, p.category, p.tag,
    Array.isArray(p.sizes) ? p.sizes.join(" ") : "",
    p.desc?.en, p.desc?.ru, p.desc?.uz,
    p.fabric?.en, p.fabric?.ru, p.fabric?.uz,
  ].filter(Boolean).join(" "));
}

function smartProductScore(p, query) {
  const tokens = smartTokens(query);
  if (!tokens.length) return { score: 0, reasons: [] };
  const text = productSearchText(p);
  const model = smartNormalize([p.model_no, p.variant, p.name].filter(Boolean).join(" "));
  const reasons = [];
  let score = 0;
  for (const token of tokens) {
    if (!text.includes(token)) continue;
    score += 8;
    if (model.includes(token)) {
      score += 18;
      reasons.push(token.toUpperCase());
    } else if (p.gender === token || p.category === token) {
      score += 12;
      reasons.push(token);
    } else if ((p.sizes || []).some((s) => smartNormalize(s) === token)) {
      score += 10;
      reasons.push("size " + token.toUpperCase());
    }
  }
  const q = smartNormalize(query);
  if (q && model.includes(q)) score += 35;
  score += Math.min(8, Number(p.like_count || 0));
  score += Math.min(6, Number(p.reviews || 0));
  score += Math.max(0, Number(p.rating || 0) - 4) * 2;
  return { score, reasons: [...new Set(reasons)].slice(0, 3) };
}

function publicProductCard(p, extra = {}) {
  return {
    ...p,
    images: (p.images || []).slice(0, 2),
    desc: undefined,
    fabric: p.fabric,
    ...extra,
  };
}

function smartSearchProducts(products, query, limit = 12) {
  const q = str(query || "", 120);
  if (!q.trim()) return [];
  return products
    .map((p) => ({ p, ...smartProductScore(p, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (b.p.sort || 0) - (a.p.sort || 0) || b.p.id - a.p.id)
    .slice(0, limit)
    .map((row) => publicProductCard(row.p, { smart_score: row.score, smart_reasons: row.reasons }));
}

function smartRecommendProducts(products, seed, limit = 4) {
  const seedPrice = Number(seed?.price || 0);
  const seedSizes = new Set(seed?.sizes || []);
  return products
    .filter((p) => p.active !== false && p.id !== seed?.id && p.slug !== seed?.slug)
    .map((p) => {
      let score = 0;
      if (p.category === seed?.category) score += 28;
      if (p.gender === seed?.gender) score += 24;
      if (seedPrice && Math.abs(Number(p.price || 0) - seedPrice) <= Math.max(1, seedPrice * 0.25)) score += 12;
      score += (p.sizes || []).filter((s) => seedSizes.has(s)).length * 2;
      score += Math.min(8, Number(p.like_count || 0));
      score += Math.min(6, Number(p.reviews || 0));
      score += Math.max(0, Number(p.rating || 0) - 4) * 2;
      return { p, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (b.p.sort || 0) - (a.p.sort || 0) || b.p.id - a.p.id)
    .slice(0, limit)
    .map((row) => publicProductCard(row.p, { smart_score: row.score }));
}

async function activeProductsForCatalog(forceCatalogRefresh = false) {
  const localProducts = db.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort DESC, id DESC LIMIT 1000").all().map((r) => rowToProduct(r));
  if (CATALOG_SOURCE_ENABLED) {
    try {
      const seen = new Set(localProducts.map((p) => p.slug));
      const imported = (await catalogProducts(forceCatalogRefresh)).filter((p) => p.active !== false && !seen.has(p.slug));
      return [...localProducts, ...imported];
    }
    catch (e) {
      catalogCache.error = e.message;
      console.error("Catalog source failed; falling back to SQLite:", e.message);
    }
  }
  return localProducts;
}

async function adminProductsForCatalog(forceCatalogRefresh = false) {
  const localProducts = db.prepare("SELECT * FROM products ORDER BY sort DESC, id DESC LIMIT 1000").all().map((r) => rowToProduct(r));
  if (CATALOG_SOURCE_ENABLED) {
    try {
      const seen = new Set(localProducts.map((p) => p.slug));
      const imported = (await catalogProducts(forceCatalogRefresh)).filter((p) => !seen.has(p.slug));
      return [...localProducts, ...imported];
    } catch (e) {
      catalogCache.error = e.message;
      console.error("Catalog source failed; falling back to SQLite:", e.message);
    }
  }
  return localProducts;
}

function isProductIntent(message) {
  const lower = smartNormalize(message);
  return /\b(find|search|show|recommend|suggest|need|want|looking|top|tavsiya|qidir|top|kerak|bor|narx|model|size|razmer|размер|найди|покажи|посовет|нужно|цена|модель)\b/.test(lower)
    || smartTokens(message).some((t) => ["women", "men", "kids", "pajamas", "robes", "homewear", "loungewear", "cotton", "suprem"].includes(t));
}

function localizedAssistantProductReply(products, lang) {
  const priceText = (p) => p.price_visible === false
    ? (lang === "ru" ? "цену подтвердит менеджер" : lang === "en" ? "manager confirms price" : "narxni menejer tasdiqlaydi")
    : money(p.price);
  const lines = products.map((p, index) => `${index + 1}. ${p.name} — ${priceText(p)} · ${["uz", "ru"].includes(lang) ? "o'lchamlar" : "sizes"}: ${(p.sizes || []).slice(0, 6).join(", ") || "—"} · /p/${p.slug}`);
  if (lang === "ru") return "Подходящие товары:\n" + lines.join("\n");
  if (lang === "en") return "Matching products:\n" + lines.join("\n");
  return "Mos keladigan mahsulotlar:\n" + lines.join("\n");
}

function responseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if (typeof c?.text === "string") chunks.push(c.text);
      if (typeof c?.content === "string") chunks.push(c.content);
    }
  }
  return chunks.join("\n").trim();
}

function parseAssistantJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch {}
  return null;
}

function assistantCatalogContext(products, query) {
  const matches = smartSearchProducts(products, query, 8);
  const fallback = products
    .slice()
    .sort((a, b) => (b.like_count || 0) - (a.like_count || 0) || (b.sort || 0) - (a.sort || 0) || b.id - a.id)
    .slice(0, 8)
    .map((p) => publicProductCard(p));
  const seen = new Set();
  return [...matches, ...fallback].filter((p) => {
    if (seen.has(p.slug)) return false;
    seen.add(p.slug);
    return true;
  }).slice(0, 8);
}

async function openAiAssistantReply(message, lang, catalogProductsList) {
  if (!OPENAI_ASSISTANT_ENABLED) return null;
  const contextProducts = assistantCatalogContext(catalogProductsList, message);
  const productText = contextProducts.map((p) => ({
    slug: p.slug,
    name: p.name,
    model: p.model_no || "",
    variant: p.variant || "",
    gender: p.gender,
    category: p.category,
    price_usd: Number(p.price || 0),
    sizes: (p.sizes || []).slice(0, 8),
    fabric: p.fabric?.[lang] || p.fabric?.uz || p.fabric?.en || "",
  }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${OPENAI_API_BASE}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_output_tokens: 420,
        input: [
          {
            role: "developer",
            content: [
              "You are Milana Premium's shopping assistant for wholesale and retail clothing.",
              "Answer in the requested language: " + lang + ".",
              "Use only the product context below for product claims. Do not invent stock, discounts, payment status, or delivery guarantees.",
              "Wholesale rule: 1 qop = 60 clothes; managers confirm stock, payment, and dispatch.",
              "Keep answers short, helpful, and businesslike.",
              "Return JSON only with this shape: {\"reply\":\"...\",\"product_slugs\":[\"slug\"]}. Include up to 3 product_slugs from the context when relevant.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              message,
              language: lang,
              products: productText,
            }),
          },
        ],
      }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error("openai_" + response.status + ": " + body.slice(0, 220));
    const parsedBody = JSON.parse(body);
    const parsed = parseAssistantJson(responseText(parsedBody));
    if (!parsed?.reply) throw new Error("openai_bad_response");
    const bySlug = new Map(contextProducts.map((p) => [p.slug, p]));
    const selected = Array.isArray(parsed.product_slugs)
      ? parsed.product_slugs.map((slug) => bySlug.get(String(slug))).filter(Boolean).slice(0, 3)
      : [];
    return { reply: str(parsed.reply, 1500), products: selected };
  } finally {
    clearTimeout(timer);
  }
}

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y",
  ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
};
function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[а-яёўқғҳ]/g, (c) => TRANSLIT[c] ?? "")
    .replace(/['’`ʻ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}
function uniqueSlug(base, ignoreId = 0) {
  let slug = base, i = 2;
  while (db.prepare("SELECT id FROM products WHERE slug=? AND id!=?").get(slug, ignoreId)) slug = base + "-" + i++;
  return slug;
}

function rowToProduct(r, lite = false) {
  const p = decorateProduct({
    id: r.id, slug: r.slug, name: r.name,
    model_no: r.model_no || "", variant: r.variant || "", gender: r.gender || "unisex", category: r.category,
    price: r.price, old_price: r.old_price,
    wholesale_price: r.wholesale_price || r.price,
    wholesale_moq: r.wholesale_moq || ORDER_BAG_SIZE,
    retail_enabled: r.retail_enabled,
    retail_price: r.retail_price || r.price,
    retail_stock: r.retail_stock || 0,
    available_qop: r.available_qop,
    like_count: r.like_count || 0,
    sizes: JSON.parse(r.sizes || "[]"), images: JSON.parse(r.images || "[]"),
    tag: r.tag, rating: r.rating, reviews: r.reviews, active: !!r.active, sort: r.sort,
  });
  if (lite) {
    p.images = p.images.slice(0, 2);
    p.fabric = { en: r.fabric_en, ru: r.fabric_ru, uz: r.fabric_uz };
    return p;
  }
  p.desc = { en: r.desc_en, ru: r.desc_ru, uz: r.desc_uz };
  p.fabric = { en: r.fabric_en, ru: r.fabric_ru, uz: r.fabric_uz };
  p.created_at = r.created_at;
  return p;
}

function validateProduct(b) {
  const name = str(b.name, 120);
  if (name.length < 2) throw new Error("name");
  if (!CATS.includes(b.category)) throw new Error("category");
  const gender = GENDERS.includes(b.gender) ? b.gender : "unisex";
  const model_no = str(b.model_no, 40);
  const variant = str(b.variant, 60);
  const price = Number(b.price);
  if (!(price > 0 && price < 1e9)) throw new Error("price");
  const wholesale_price = Number(b.wholesale_price || b.price);
  if (!(wholesale_price > 0 && wholesale_price < 1e9)) throw new Error("wholesale_price");
  const wholesale_moq = Math.max(1, Math.min(10000, Math.round(Number(b.wholesale_moq) || ORDER_BAG_SIZE)));
  const retail_enabled = b.retail_enabled === false ? 0 : 1;
  const retail_price = Number(b.retail_price || b.price);
  if (retail_enabled && !(retail_price > 0 && retail_price < 1e9)) throw new Error("retail_price");
  const retail_stock = Math.max(0, Math.min(1e6, Math.round(Number(b.retail_stock) || 0)));
  const available_qop = b.available_qop === null || b.available_qop === "" || b.available_qop === undefined
    ? null
    : Math.max(0, Math.min(1e6, Math.round(Number(b.available_qop) || 0)));
  let old_price = b.old_price === null || b.old_price === "" || b.old_price === undefined ? null : Number(b.old_price);
  if (old_price !== null && !(old_price > 0 && old_price < 1e9)) throw new Error("old_price");
  const sizes = Array.isArray(b.sizes) ? b.sizes.map((s) => str(s, 8)).filter(Boolean).slice(0, 12) : [];
  const images = (Array.isArray(b.images) ? b.images : [])
    .map((u) => str(u, 300))
    .filter((u) => (
      (/^\/(uploads|assets)\/[\w\-./%]+$/.test(u) && !u.includes("..")) ||
      /^https:\/\/[\w.-]+\/[\w\-./%?=&:]+$/.test(u)
    ))
    .slice(0, 12);
  const tag = TAGS.includes(b.tag) ? b.tag : "";
  const rating = Math.min(5, Math.max(0, Number(b.rating) || 0));
  const reviews = Math.min(1e6, Math.max(0, Math.round(Number(b.reviews) || 0)));
  return {
    name, model_no, variant, gender, category: b.category, price: wholesale_price, old_price, tag, rating, reviews,
    wholesale_price, wholesale_moq, retail_enabled, retail_price, retail_stock, available_qop,
    sizes: JSON.stringify(sizes), images: JSON.stringify(images),
    desc_en: str(b.desc?.en, 5000), desc_ru: str(b.desc?.ru, 5000), desc_uz: str(b.desc?.uz, 5000),
    fabric_en: str(b.fabric?.en, 300), fabric_ru: str(b.fabric?.ru, 300), fabric_uz: str(b.fabric?.uz, 300),
    active: b.active ? 1 : 0,
    sort: Math.max(-1e6, Math.min(1e6, Math.round(Number(b.sort) || 0))),
  };
}

const PUBLIC_SETTING_KEYS = ["phone", "whatsapp", "telegram", "instagram", "email",
  "address_en", "address_ru", "address_uz", "currency", "currency_pos",
  "hero_type", "hero_image", "hero_video", "hero_poster", "accent", "accent_dark"];
const allSettings = () => {
  const settings = Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, getSetting(k) ?? ""]));
  if (CATALOG_SOURCE_ENABLED && settings.currency === "€") settings.currency = "$";
  return settings;
};

/* per-key validation for settings writes (anything not listed → trimmed string) */
const mediaPathOk = (v) => v === "" || (/^\/(uploads|assets)\/[\w\-./%]+$/.test(v) && !v.includes(".."));
const hexOk = (v) => /^#[0-9a-fA-F]{6}$/.test(v);
const SETTING_VALIDATORS = {
  hero_type: (v) => (v === "video" ? "video" : "image"),
  hero_image: (v) => (mediaPathOk(v) ? v : null),
  hero_video: (v) => (mediaPathOk(v) ? v : null),
  hero_poster: (v) => (mediaPathOk(v) ? v : null),
  accent: (v) => (hexOk(v) ? v : null),
  accent_dark: (v) => (hexOk(v) ? v : null),
};

function healthResponse(req, res) {
  const probe = db.prepare("SELECT 1 ok").get();
  send(res, 200, {
    ok: probe?.ok === 1,
    env: NODE_ENV,
    uptime: Math.round(process.uptime()),
    products: db.prepare("SELECT COUNT(*) c FROM products").get().c,
    orders: db.prepare("SELECT COUNT(*) c FROM orders").get().c,
    catalog_source: CATALOG_SOURCE_ENABLED ? (CATALOG_API_BASE ? "catalog_api" : "supabase") : "sqlite",
    catalog_cached_products: catalogCache.products.length,
    catalog_error: catalogCache.error,
  });
}

/* ========================= API ========================= */

const api = {

  /* ----- public ----- */

  "GET /health": (req, res) => healthResponse(req, res),

  "GET /api/health": (req, res) => healthResponse(req, res),

  "GET /api/settings": (req, res) => send(res, 200, allSettings()),

  "GET /api/auth/config": (req, res) => send(res, 200, {
    provider: FIREBASE_ENABLED ? "firebase" : "local",
    firebase: firebasePublicConfig(),
  }),

  "GET /api/auth/me": (req, res) => send(res, 200, {
    customer: publicCustomer(customerFromRequest(req)),
  }),

  "POST /api/auth/otp/start": async (req, res) => {
    if (!rateLimit("customer-otp:" + ipOf(req), 8, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 4e3);
    const phone = str(b.phone, 25);
    if (!/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    const normalized = normalizePhone(phone);
    if (!rateLimit("customer-otp-phone:" + normalized, 4, 3600e3)) return fail(res, 429, "rate_limited");
    const lang = ["en", "ru", "uz"].includes(b.lang) ? b.lang : "uz";
    const code = String(100000 + crypto.randomInt(900000));
    const shouldSendSms = NODE_ENV === "production" || SMS_SEND_IN_DEV;
    if (shouldSendSms) {
      const sms = await sendSms(normalized, otpSmsMessage(code, lang), { purpose: "phone_otp", lang });
      if (!sms.ok) return fail(res, sms.error === "sms_not_configured" ? 503 : 502, sms.error || "sms_failed");
    }
    db.prepare(`
      INSERT INTO phone_otps (phone, code_hash, expires_at, attempts, verified_at)
      VALUES (?,?,?,?, '')
      ON CONFLICT(phone) DO UPDATE SET
        code_hash=excluded.code_hash,
        expires_at=excluded.expires_at,
        attempts=0,
        verified_at='',
        created_at=datetime('now')
    `).run(normalized, hashOtp(normalized, code), Date.now() + 10 * 60e3, 0);
    audit("customer", "auth.otp_started", { phone: normalized.slice(-4), sms: shouldSendSms ? "sent" : "local" });
    const body = { ok: true, expires_in: 600 };
    if (!shouldSendSms) body.dev_code = code;
    send(res, 200, body);
  },

  "POST /api/auth/otp/verify": async (req, res) => {
    if (!rateLimit("customer-otp-verify:" + ipOf(req), 12, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 4e3);
    const phone = normalizePhone(b.phone);
    const code = str(b.code, 12);
    if (!phone || !/^\d{6}$/.test(code)) return fail(res, 400, "otp");
    const row = db.prepare("SELECT * FROM phone_otps WHERE phone=?").get(phone);
    if (!row || Date.now() > Number(row.expires_at || 0)) return fail(res, 401, "otp_expired");
    if (Number(row.attempts || 0) >= 6) return fail(res, 429, "otp_locked");
    if (row.code_hash !== hashOtp(phone, code)) {
      db.prepare("UPDATE phone_otps SET attempts=attempts+1 WHERE phone=?").run(phone);
      return fail(res, 401, "otp_wrong");
    }
    db.prepare("UPDATE phone_otps SET verified_at=datetime('now') WHERE phone=?").run(phone);
    audit("customer", "auth.otp_verified", { phone: phone.slice(-4) });
    send(res, 200, { ok: true });
  },

  "POST /api/auth/email-otp/start": async (req, res) => {
    if (!rateLimit("customer-email-otp:" + ipOf(req), 8, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 4e3);
    const email = normalizeEmail(b.email);
    if (!emailOk(email)) return fail(res, 400, "email");
    if (!rateLimit("customer-email-otp-address:" + email, 4, 3600e3)) return fail(res, 429, "rate_limited");
    const lang = ["en", "ru", "uz"].includes(b.lang) ? b.lang : "uz";
    const code = String(100000 + crypto.randomInt(900000));
    const shouldSendEmail = NODE_ENV === "production" || EMAIL_SEND_IN_DEV;
    let emailDelivery = shouldSendEmail ? "sent" : "local";
    if (shouldSendEmail) {
      const message = otpEmailMessage(code, lang);
      const sent = await sendEmail(email, message.subject, message.text, { purpose: "password_recovery", lang });
      if (!sent.ok) {
        if (NODE_ENV === "production") return fail(res, sent.error === "email_not_configured" ? 503 : 502, sent.error || "email_failed");
        emailDelivery = "local_fallback";
      }
    }
    db.prepare(`
      INSERT INTO email_otps (email, code_hash, expires_at, attempts, verified_at)
      VALUES (?,?,?,?, '')
      ON CONFLICT(email) DO UPDATE SET
        code_hash=excluded.code_hash,
        expires_at=excluded.expires_at,
        attempts=0,
        verified_at='',
        created_at=datetime('now')
    `).run(email, hashEmailOtp(email, code), Date.now() + 10 * 60e3, 0);
    audit("customer", "auth.email_otp_started", { email: email.replace(/^(.).+(@.+)$/, "$1***$2"), email_delivery: emailDelivery });
    const body = { ok: true, expires_in: 600 };
    if (!shouldSendEmail || emailDelivery === "local_fallback") body.dev_code = code;
    send(res, 200, body);
  },

  "POST /api/auth/email-otp/verify": async (req, res) => {
    if (!rateLimit("customer-email-otp-verify:" + ipOf(req), 12, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 4e3);
    const email = normalizeEmail(b.email);
    const code = str(b.code, 12);
    if (!emailOk(email) || !/^\d{6}$/.test(code)) return fail(res, 400, "otp");
    const row = db.prepare("SELECT * FROM email_otps WHERE email=?").get(email);
    if (!row || Date.now() > Number(row.expires_at || 0)) return fail(res, 401, "otp_expired");
    if (Number(row.attempts || 0) >= 6) return fail(res, 429, "otp_locked");
    if (row.code_hash !== hashEmailOtp(email, code)) {
      db.prepare("UPDATE email_otps SET attempts=attempts+1 WHERE email=?").run(email);
      return fail(res, 401, "otp_wrong");
    }
    db.prepare("UPDATE email_otps SET verified_at=datetime('now') WHERE email=?").run(email);
    audit("customer", "auth.email_otp_verified", { email: email.replace(/^(.).+(@.+)$/, "$1***$2") });
    send(res, 200, { ok: true });
  },

  "GET /api/auth/orders": (req, res) => {
    const customer = customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const rows = db.prepare(`
      SELECT id, number, status, order_type, tracking_number, items, total, lang, created_at, updated_at
      FROM orders
      WHERE customer_id=?
      ORDER BY id DESC
      LIMIT 50
    `).all(customer.id).map((row) => {
      let items = [];
      try { items = JSON.parse(row.items || "[]"); } catch {}
      const payment = db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(row.id) || {};
      let paymentPayload = {};
      try { paymentPayload = JSON.parse(payment.payload || "{}"); } catch {}
      return {
        id: row.id,
        number: row.number,
        status: row.status,
        order_type: row.order_type || "wholesale",
        tracking_number: row.tracking_number || "",
        total: row.total,
        lang: row.lang,
        created_at: row.created_at,
        updated_at: row.updated_at,
        payment: {
          id: payment.id || null,
          method: payment.method || "manager",
          provider: payment.provider || "manual",
          status: payment.status || "pending",
          amount: payment.amount || row.total,
          currency: payment.currency || "USD",
          reference: payment.reference || "",
          submission: paymentPayload.submission || {},
        },
        delivery: {
          tracking_number: row.tracking_number || "",
        },
        items: Array.isArray(items) ? items.map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          qty: item.qty,
          unit_price: item.unit_price,
          bag_size: item.bag_size,
          unit_type: item.unit_type,
          image: item.image || "",
          images: item.image ? [item.image] : [],
          price: item.price,
          line_total: Math.round(Number(item.price || 0) * Number(item.qty || 0) * 100) / 100,
          size_mix: Array.isArray(item.size_mix) ? item.size_mix : [],
        })) : [],
      };
    });
    send(res, 200, { orders: rows });
  },

  "GET /api/auth/support": (req, res) => {
    const customer = customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const rows = db.prepare(`
      SELECT id, number, topic, message, status, lang, created_at, updated_at
      FROM support_requests
      WHERE customer_id=?
      ORDER BY id DESC
      LIMIT 50
    `).all(customer.id);
    send(res, 200, { support: rows });
  },

  "PUT /api/auth/profile": async (req, res) => {
    const customer = customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const b = await readJson(req, 12e3);
    const name = str(b.name, 80);
    const phone = str(b.phone, 25);
    if (name.length < 2) return fail(res, 400, "name");
    if (phone && !/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    db.prepare(`
      UPDATE customers
      SET name=?, phone=?, city=?, address=?, updated_at=datetime('now')
      WHERE id=?
    `).run(name, phone, str(b.city, 80), str(b.address, 300), customer.id);
    const updated = db.prepare("SELECT * FROM customers WHERE id=?").get(customer.id);
    audit("customer", "auth.profile_updated", { id: customer.id });
    send(res, 200, { customer: publicCustomer(updated) });
  },

  "POST /api/auth/signup": async (req, res) => {
    if (!rateLimit("customer-signup:" + ipOf(req), 10, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 12e3);
    const email = normalizeEmail(b.email);
    const password = String(b.password || "");
    const phone = str(b.phone, 25);
    const accountType = normalizeAccountType(b.account_type);
    if (!emailOk(email)) return fail(res, 400, "email");
    if (password.length < 8 || password.length > 100) return fail(res, 400, "password");
    if (phone && !/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    if (!ACCOUNT_TYPES.includes(accountType)) return fail(res, 400, "account_type");
    if (!termsAccepted(b.terms_accepted || b.terms)) return fail(res, 400, "terms");
    if (!phone) return fail(res, 400, "phone");
    const normalizedPhone = normalizePhone(phone);
    let otpRow = db.prepare("SELECT verified_at FROM phone_otps WHERE phone=? AND verified_at!=''").get(normalizedPhone);
    if (!otpRow && /^\d{6}$/.test(str(b.otp_code, 12))) {
      const row = db.prepare("SELECT * FROM phone_otps WHERE phone=?").get(normalizedPhone);
      if (row && Date.now() <= Number(row.expires_at || 0) && row.code_hash === hashOtp(normalizedPhone, str(b.otp_code, 12))) {
        db.prepare("UPDATE phone_otps SET verified_at=datetime('now') WHERE phone=?").run(normalizedPhone);
        otpRow = { verified_at: new Date().toISOString() };
      }
    }
    if (!otpRow) return fail(res, 400, "phone_not_verified");
    if (str(b.name, 80).length < 2) return fail(res, 400, "name");
    if (db.prepare("SELECT id FROM customers WHERE email=?").get(email)) return fail(res, 409, "email_exists");
    const customer = upsertCustomer({
      email,
      name: str(b.name, 80),
      phone,
      city: str(b.city, 80),
      address: str(b.address, 300),
      account_type: accountType,
      approval_status: "active",
      company_name: str(b.company_name, 140),
      tax_id: str(b.tax_id, 32),
      legal_address: str(b.legal_address, 300),
      contact_person: str(b.contact_person || b.name, 80),
      expected_volume: str(b.expected_volume, 80),
      business_license_url: str(b.business_license_url, 300),
      terms_accepted_at: new Date().toISOString(),
      phone_verified: 1,
      provider: "local",
      password_hash: hashPassword(password),
    });
    const token = createCustomerSession(customer.id);
    audit("customer", "auth.signup", { id: customer.id, provider: "local" });
    authResponse(req, res, 201, customer, token);
  },

  "POST /api/auth/register": async (req, res) => api["POST /api/auth/signup"](req, res),

  "POST /api/auth/signin": async (req, res) => {
    if (!rateLimit("customer-signin:" + ipOf(req), 12, 15 * 60e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 8e3);
    const email = normalizeEmail(b.email);
    const row = emailOk(email) ? db.prepare("SELECT * FROM customers WHERE email=?").get(email) : null;
    if (!row || !row.password_hash || !verifyPassword(String(b.password || ""), row.password_hash)) {
      return fail(res, 401, "wrong_credentials");
    }
    const token = createCustomerSession(row.id);
    audit("customer", "auth.signin", { id: row.id, provider: row.provider || "local" });
    authResponse(req, res, 200, row, token);
  },

  "POST /api/auth/recover": async (req, res) => {
    if (!rateLimit("customer-recover:" + ipOf(req), 8, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 12e3);
    const email = normalizeEmail(b.email);
    const password = String(b.password || "");
    const otpCode = str(b.email_code || b.otp_code || b.code, 12);
    if (!emailOk(email)) return fail(res, 400, "email");
    if (!/^\d{6}$/.test(otpCode)) return fail(res, 400, "otp");
    if (password.length < 8 || password.length > 100) return fail(res, 400, "password");
    const row = db.prepare("SELECT * FROM customers WHERE email=?").get(email);
    if (!row) return fail(res, 401, "recovery_mismatch");
    const otpRow = db.prepare("SELECT * FROM email_otps WHERE email=?").get(email);
    if (!otpRow || Date.now() > Number(otpRow.expires_at || 0)) return fail(res, 401, "otp_expired");
    if (Number(otpRow.attempts || 0) >= 6) return fail(res, 429, "otp_locked");
    if (otpRow.code_hash !== hashEmailOtp(email, otpCode)) {
      db.prepare("UPDATE email_otps SET attempts=attempts+1 WHERE email=?").run(email);
      return fail(res, 401, "otp_wrong");
    }
    db.prepare("UPDATE email_otps SET verified_at=datetime('now') WHERE email=?").run(email);
    db.prepare("UPDATE customers SET password_hash=?, provider='local', updated_at=datetime('now') WHERE id=?")
      .run(hashPassword(password), row.id);
    db.prepare("DELETE FROM customer_sessions WHERE customer_id=?").run(row.id);
    const updated = db.prepare("SELECT * FROM customers WHERE id=?").get(row.id);
    const token = createCustomerSession(row.id);
    audit("customer", "auth.password_recovered", { id: row.id, provider: row.provider || "local" });
    authResponse(req, res, 200, updated, token);
  },

  "POST /api/auth/firebase": async (req, res) => {
    if (!rateLimit("customer-firebase:" + ipOf(req), 30, 15 * 60e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 32e3);
    let payload;
    try { payload = await verifyFirebaseIdToken(b.idToken); }
    catch (e) { return fail(res, 401, e.message); }
    const email = normalizeEmail(payload.email || b.email);
    if (!emailOk(email)) return fail(res, 400, "email");
    const customer = upsertCustomer({
      email,
      name: str(payload.name || b.name, 80),
      phone: str(b.phone || payload.phone_number || "", 25),
      city: str(b.city, 80),
      address: str(b.address, 300),
      provider: "firebase",
      provider_uid: String(payload.sub || ""),
    });
    const token = createCustomerSession(customer.id);
    audit("customer", "auth.firebase", { id: customer.id, uid: payload.sub });
    authResponse(req, res, 200, customer, token);
  },

  "POST /api/auth/logout": (req, res) => {
    const auth = String(req.headers.authorization || "");
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const token = bearer || parseCookies(req).cid;
    if (token) db.prepare("DELETE FROM customer_sessions WHERE token=?").run(sha256(token));
    send(res, 200, { ok: true }, { "Set-Cookie": customerCookie(req, "x", 0) });
  },

  "GET /api/products": async (req, res, u) => {
    const q = u.searchParams;
    const customer = customerFromRequest(req);
    if (CATALOG_SOURCE_ENABLED) {
      try {
        let products = await activeProductsForCatalog();
        if (CATS.includes(q.get("category"))) products = products.filter((p) => p.category === q.get("category"));
        if (GENDERS.includes(q.get("gender"))) products = products.filter((p) => p.gender === q.get("gender"));
        if (TAGS.includes(q.get("tag")) && q.get("tag")) products = products.filter((p) => p.tag === q.get("tag"));
        const term = str(q.get("q") || "", 120);
        if (term) {
          products = smartSearchProducts(products, term, 1000);
        }
        const sorts = {
          "new": (a, b) => b.id - a.id,
          "price-asc": (a, b) => a.price - b.price,
          "price-desc": (a, b) => b.price - a.price,
          "popular": (a, b) => b.reviews - a.reviews || b.rating - a.rating,
          "default": term ? (a, b) => (b.smart_score || 0) - (a.smart_score || 0) || b.sort - a.sort || b.id - a.id : (a, b) => b.sort - a.sort || b.id - a.id,
        };
        products = products.slice().sort(sorts[q.get("sort")] || sorts.default);
        const limit = Math.min(1000, Math.max(1, Number(q.get("limit")) || 1000));
        return send(res, 200, products.slice(0, limit).map((p) => publicProductCard(productForCustomer(p, customer))));
      } catch (e) {
        catalogCache.error = e.message;
        console.error("Catalog source failed; falling back to SQLite:", e.message);
      }
    }
    let sql = "SELECT * FROM products WHERE active=1";
    const args = [];
    if (CATS.includes(q.get("category"))) { sql += " AND category=?"; args.push(q.get("category")); }
    if (GENDERS.includes(q.get("gender"))) { sql += " AND gender=?"; args.push(q.get("gender")); }
    if (TAGS.includes(q.get("tag")) && q.get("tag")) { sql += " AND tag=?"; args.push(q.get("tag")); }
    const term = str(q.get("q") || "", 60);
    const sorts = {
      "new": "created_at DESC, id DESC",
      "price-asc": "price ASC", "price-desc": "price DESC",
      "popular": "reviews DESC, rating DESC",
      "default": "sort DESC, id DESC",
    };
    sql += " ORDER BY " + (sorts[q.get("sort")] || sorts.default);
    const limit = Math.min(1000, Math.max(1, Number(q.get("limit")) || 200));
    sql += " LIMIT " + (term ? 1000 : limit);
    let products = db.prepare(sql).all(...args).map((r) => rowToProduct(r));
    if (term) products = smartSearchProducts(products, term, limit);
    send(res, 200, products.slice(0, limit).map((p) => publicProductCard(productForCustomer(p, customer))));
  },

  "GET /api/search/smart": async (req, res, u) => {
    const query = str(u.searchParams.get("q") || "", 120);
    if (query.trim().length < 2) return send(res, 200, { query, products: [] });
    let products = await activeProductsForCatalog();
    const gender = u.searchParams.get("gender");
    const category = u.searchParams.get("category");
    if (GENDERS.includes(gender)) products = products.filter((p) => p.gender === gender);
    if (CATS.includes(category)) products = products.filter((p) => p.category === category);
    const limit = Math.min(24, Math.max(1, Number(u.searchParams.get("limit")) || 8));
    const customer = customerFromRequest(req);
    send(res, 200, { query, products: smartSearchProducts(products.map((p) => productForCustomer(p, customer)), query, limit) });
  },

  "GET /api/recommendations": async (req, res, u) => {
    const slug = str(u.searchParams.get("slug") || "", 120);
    const id = Number(u.searchParams.get("id")) || 0;
    const products = await activeProductsForCatalog();
    const seed = products.find((p) => (slug && p.slug === slug) || (id && p.id === id));
    if (!seed) return send(res, 200, { products: [] });
    const limit = Math.min(12, Math.max(1, Number(u.searchParams.get("limit")) || 4));
    const customer = customerFromRequest(req);
    send(res, 200, { products: smartRecommendProducts(products, seed, limit).map((p) => publicProductCard(productForCustomer(p, customer))) });
  },

  "GET /api/products/:slug": async (req, res, u, m) => {
    const customer = customerFromRequest(req);
    const row = db.prepare("SELECT * FROM products WHERE slug=? AND active=1").get(m.slug);
    if (row) {
      const localProduct = rowToProduct(row);
      const related = smartRecommendProducts(await activeProductsForCatalog(), localProduct, 4).map((p) => publicProductCard(productForCustomer(p, customer)));
      return send(res, 200, { ...productForCustomer(localProduct, customer), related });
    }
    if (CATALOG_SOURCE_ENABLED) {
      try {
        const product = await catalogProductBySlug(m.slug);
        if (product && product.active !== false) {
          const related = smartRecommendProducts(await activeProductsForCatalog(), product, 4).map((p) => publicProductCard(productForCustomer(p, customer)));
          return send(res, 200, { ...productForCustomer(product, customer), related });
        }
      } catch (e) {
        catalogCache.error = e.message;
        console.error("Catalog product lookup failed; falling back to SQLite:", e.message);
      }
    }
    return fail(res, 404, "not_found");
  },

  "GET /api/auth/likes": (req, res) => {
    const customer = customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const rows = db.prepare(`
      SELECT l.product_id, l.product_slug, l.created_at, p.slug, p.name, p.price, p.images
      FROM likes l
      LEFT JOIN products p ON p.id=l.product_id
      WHERE l.customer_id=?
      ORDER BY l.id DESC
      LIMIT 100
    `).all(customer.id).map((row) => ({
      id: row.product_id,
      slug: row.slug || row.product_slug,
      name: row.name || row.product_slug || String(row.product_id),
      price: row.price || 0,
      image: (() => { try { return JSON.parse(row.images || "[]")[0] || ""; } catch { return ""; } })(),
      added_at: row.created_at,
    }));
    send(res, 200, { likes: rows });
  },

  "POST /api/products/:id/like": async (req, res, u, m) => {
    const customer = customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const id = Number(m.id);
    if (!id) return fail(res, 400, "product");
    let slug = "";
    if (CATALOG_SOURCE_ENABLED) {
      try { slug = (await catalogProductById(id))?.slug || ""; } catch {}
    }
    if (!slug) slug = db.prepare("SELECT slug FROM products WHERE id=?").get(id)?.slug || "";
    db.prepare("INSERT OR IGNORE INTO likes (customer_id, product_id, product_slug) VALUES (?,?,?)")
      .run(customer.id, id, slug);
    db.prepare("UPDATE products SET like_count=(SELECT COUNT(*) FROM likes WHERE product_id=?) WHERE id=?").run(id, id);
    send(res, 200, { liked: true, like_count: likeCount(id, slug) });
  },

  "DELETE /api/products/:id/like": (req, res, u, m) => {
    const customer = customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const id = Number(m.id);
    db.prepare("DELETE FROM likes WHERE customer_id=? AND product_id=?").run(customer.id, id);
    db.prepare("UPDATE products SET like_count=(SELECT COUNT(*) FROM likes WHERE product_id=?) WHERE id=?").run(id, id);
    const slug = db.prepare("SELECT slug FROM products WHERE id=?").get(id)?.slug || "";
    send(res, 200, { liked: false, like_count: likeCount(id, slug) });
  },

  "GET /api/products/:slug/reviews": (req, res, u, m) => {
    const slug = str(m.slug, 120);
    const productId = Number(u.searchParams.get("product_id")) || 0;
    const rows = db.prepare(`
      SELECT r.id, r.rating, r.comment, r.photo_url, r.verified_purchase, r.created_at,
             COALESCE(c.name, 'Milana customer') customer_name
      FROM reviews r
      JOIN customers c ON c.id=r.customer_id
      WHERE r.status='approved' AND (r.product_slug=? OR r.product_id=?)
      ORDER BY r.id DESC
      LIMIT 50
    `).all(slug, productId);
    send(res, 200, { summary: reviewSummary(productId, slug), reviews: rows });
  },

  "POST /api/reviews": async (req, res) => {
    const customer = customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    if (!rateLimit("review:" + customer.id, 12, 24 * 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 16e3);
    const productId = Number(b.product_id) || 0;
    const productSlug = str(b.product_slug, 120);
    const rating = Math.max(1, Math.min(5, Math.round(Number(b.rating) || 0)));
    const comment = str(b.comment, 1200);
    const photo = str(b.photo_url, 300);
    if (!productId && !productSlug) return fail(res, 400, "product");
    if (!rating) return fail(res, 400, "rating");
    const orders = db.prepare("SELECT id, items FROM orders WHERE customer_id=? AND status!='cancelled' ORDER BY id DESC LIMIT 100").all(customer.id);
    let orderId = 0;
    for (const order of orders) {
      let items = [];
      try { items = JSON.parse(order.items || "[]"); } catch {}
      if (items.some((item) => Number(item.id) === productId || item.slug === productSlug)) {
        orderId = order.id;
        break;
      }
    }
    if (!orderId) return fail(res, 403, "verified_purchase_required");
    const r = db.prepare(`
      INSERT INTO reviews (product_id, product_slug, customer_id, order_id, rating, comment, photo_url, verified_purchase, status)
      VALUES (?,?,?,?,?,?,?,?, 'pending')
    `).run(productId || null, productSlug, customer.id, orderId, rating, comment, photo, 1);
    audit("customer", "review.created", { id: r.lastInsertRowid, product_id: productId, status: "pending" });
    send(res, 201, { id: r.lastInsertRowid, status: "pending" });
  },

  "POST /api/chat/message": async (req, res) => {
    if (!rateLimit("chat:" + ipOf(req), 40, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 12e3);
    const signedInCustomer = customerFromRequest(req);
    const message = str(b.message, 1500);
    if (message.length < 2) return fail(res, 400, "message");
    let sessionId = Number(b.session_id) || 0;
    const existing = sessionId ? db.prepare("SELECT id FROM chat_sessions WHERE id=?").get(sessionId) : null;
    if (!existing) {
      const r = db.prepare(`
        INSERT INTO chat_sessions (customer_id, visitor_name, visitor_phone, visitor_email, status)
        VALUES (?,?,?,?, 'bot')
      `).run(
        signedInCustomer?.id || null,
        str(b.name || signedInCustomer?.name || "", 80),
        str(b.phone || signedInCustomer?.phone || "", 25),
        normalizeEmail(b.email || signedInCustomer?.email || "")
      );
      sessionId = r.lastInsertRowid;
    }
    db.prepare("INSERT INTO chat_messages (session_id, sender_type, message) VALUES (?,?,?)").run(sessionId, "customer", message);
    const lower = message.toLowerCase();
    const chatLang = ["en", "ru", "uz"].includes(b.lang) ? b.lang : "uz";
    const chatReplies = {
      en: {
        default: "Thank you. A Milana manager will clarify soon. Wholesale orders follow the 1 qop = 60 clothes rule.",
        delivery: "Delivery is agreed by region. We dispatch from Andijan; cargo usually takes 1-5 business days.",
        price: "Price depends on the catalog model. Wholesale price is calculated by qop, while retail price is shown by piece.",
        human: "We will connect you with a manager. Leaving your contact number helps us answer faster."
      },
      ru: {
        default: "Спасибо. Менеджер Milana скоро уточнит детали. Оптовые заказы работают по правилу: 1 qop = 60 вещей.",
        delivery: "Доставка согласуется по региону. Отправляем из Андижана; cargo обычно занимает 1-5 рабочих дней.",
        price: "Цена зависит от модели в каталоге. Оптовая цена считается по qop, розничная цена указана за штуку.",
        human: "Подключим менеджера. Оставьте контактный номер, чтобы мы ответили быстрее."
      },
      uz: {
        default: "Rahmat. Milana menejeri tez orada aniqlashtiradi. Ulgurji buyurtmalar 1 qop = 60 dona qoida bilan ishlaydi.",
        delivery: "Yetkazib berish hudud bo'yicha kelishiladi. Andijondan jo'natamiz, cargo muddati odatda 1-5 ish kuni.",
        price: "Narx katalogdagi modelga bog'liq. Ulgurji narx qop bo'yicha, chakana narx esa dona bo'yicha ko'rsatiladi.",
        human: "Menejerga ulaymiz. Kontakt raqamingizni qoldirsangiz, javobni tezlashtiramiz."
      }
    };
    const replies = chatReplies[chatLang];
    let reply = replies.default;
    let products = [];
    const visibleCatalog = async () => (await activeProductsForCatalog()).map((p) => productForCustomer(p, signedInCustomer));
    const wantsHuman = /human|manager|оператор|odam|менеджер/.test(lower);
    if (!wantsHuman && OPENAI_ASSISTANT_ENABLED) {
      try {
        const ai = await openAiAssistantReply(message, chatLang, await visibleCatalog());
        if (ai?.reply) {
          reply = ai.reply;
          products = ai.products || [];
        }
      } catch (e) {
        console.error("OpenAI assistant failed; using local fallback:", e.message);
      }
    }
    if (!products.length && isProductIntent(message)) {
      try {
        products = smartSearchProducts(await visibleCatalog(), message, 3);
        if (products.length && reply === replies.default) reply = localizedAssistantProductReply(products, chatLang);
      } catch (e) {
        console.error("Smart assistant catalog lookup failed:", e.message);
      }
    }
    if (/deliver|достав|yetkaz|cargo|карго/.test(lower) && reply === replies.default) reply = replies.delivery;
    if (/price|цена|narx|стоим/.test(lower) && !products.length) reply = replies.price;
    if (wantsHuman) {
      reply = replies.human;
      db.prepare("UPDATE chat_sessions SET status='escalated', updated_at=datetime('now') WHERE id=?").run(sessionId);
    }
    db.prepare("INSERT INTO chat_messages (session_id, sender_type, message) VALUES (?,?,?)").run(sessionId, "bot", reply);
    send(res, 200, { session_id: sessionId, reply, products });
  },

  "POST /api/chat/escalate": async (req, res) => {
    const b = await readJson(req, 12e3);
    const signedInCustomer = customerFromRequest(req);
    const sessionId = Number(b.session_id) || 0;
    const name = str(b.name || signedInCustomer?.name || "", 80);
    const phone = str(b.phone || signedInCustomer?.phone || "", 25);
    const email = normalizeEmail(b.email || signedInCustomer?.email || "");
    const message = str(b.message || "Chat escalation", 3000);
    if (name.length < 2) return fail(res, 400, "name");
    if (!/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    if (sessionId) db.prepare("UPDATE chat_sessions SET status='escalated', visitor_name=?, visitor_phone=?, visitor_email=?, updated_at=datetime('now') WHERE id=?")
      .run(name, phone, email, sessionId);
    const r = db.prepare(`
      INSERT INTO support_requests (customer_id, name, phone, email, topic, message, lang)
      VALUES (?,?,?,?, 'general', ?, ?)
    `).run(signedInCustomer?.id || null, name, phone, email, message, ["en", "ru", "uz"].includes(b.lang) ? b.lang : "uz");
    const number = "MS-" + new Date().getFullYear() + "-" + String(r.lastInsertRowid).padStart(4, "0");
    db.prepare("UPDATE support_requests SET number=? WHERE id=?").run(number, r.lastInsertRowid);
    send(res, 201, { number, status: "new" });
  },

  "POST /api/orders": async (req, res) => {
    if (!rateLimit("order:" + ipOf(req), 10, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 64e3);
    const c = b.customer || {};
    const name = str(c.name, 80), phone = str(c.phone, 25);
    const requestedPayment = str(b.payment?.method || c.payment_method || "manager", 30);
    const paymentMethod = PAYMENT_METHODS.includes(requestedPayment) ? requestedPayment : "manager";
    const source = str(b.source || req.headers["x-client-name"] || "website", 40) || "website";
    if (name.length < 2) return fail(res, 400, "name");
    if (!/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    const signedInCustomer = customerFromRequest(req);
    const requestedOrderType = b.order_type === "retail" ? "retail" : b.order_type === "wholesale" ? "wholesale" : "";
    const orderType = signedInCustomer?.account_type === "individual" ? "retail" : (requestedOrderType || "wholesale");
    const customer = {
      customer_id: signedInCustomer?.id || null,
      name, phone,
      email: signedInCustomer?.email || normalizeEmail(c.email || ""),
      city: str(c.city, 80), address: str(c.address, 300), comment: str(c.comment, 1000),
      customer_tier: normalizeCustomerTier(signedInCustomer?.customer_tier),
      assigned_manager: signedInCustomer?.assigned_manager || "",
    };
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) return fail(res, 400, "items");
    const items = [];
    const stockAdjustments = [];
    let total = 0;
    for (const it of b.items) {
      let product = null;
      if (CATALOG_SOURCE_ENABLED) {
        try { product = await catalogProductById(Number(it.id)); } catch (e) { catalogCache.error = e.message; }
      }
      if (product && product.active === false) product = null;
      const row = product ? null : db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(Number(it.id));
      if (!product && !row) return fail(res, 400, "item_unavailable");
      const sizes = product ? product.sizes : JSON.parse(row.sizes || "[]");
      const images = product ? product.images : JSON.parse(row.images || "[]");
      const id = product ? product.id : row.id;
      const slug = product ? product.slug : row.slug;
      const name = product ? product.name : row.name;
      const gender = product ? product.gender : row.gender;
      const category = product ? product.category : row.category;
      const sourceProduct = product || rowToProduct(row);
      const pricing = priceForCustomer(sourceProduct, signedInCustomer, orderType);
      const retailEnabled = product ? product.retail_enabled !== false : Number(row.retail_enabled) !== 0;
      const availableQop = product ? product.available_qop : row.available_qop;
      const retailStock = Number(product ? product.retail_stock : row.retail_stock) || 0;
      const rawQty = Number(it.qty);
      if (!Number.isInteger(rawQty) || rawQty < 1) return fail(res, 400, "invalid_qty");
      const maxQty = orderType === "retail" ? 99 : 20;
      if (rawQty > maxQty) return fail(res, 400, "qty_limit");
      if (orderType === "wholesale" && availableQop != null && rawQty > Number(availableQop)) return fail(res, 400, "insufficient_stock");
      if (orderType === "retail" && retailStock > 0 && rawQty > retailStock) return fail(res, 400, "insufficient_stock");
      let size_mix = [];
      let unit_price = pricing.unit;
      let bag_size = ORDER_BAG_SIZE;
      let price = Math.round(unit_price * bag_size * 100) / 100;
      let unit_type = "qop";
      const price_pending = !pricing.visible;
      const qty = rawQty;
      if (orderType === "retail") {
        if (!retailEnabled) return fail(res, 400, "retail_unavailable");
        unit_price = pricing.unit;
        bag_size = 1;
        price = Math.round(unit_price * 100) / 100;
        unit_type = "piece";
        if (row && retailStock > 0) stockAdjustments.push({ type: "retail", id: row.id, qty });
      } else {
        size_mix = orderSizeMix(sizes, gender, category);
        if (row && availableQop != null) stockAdjustments.push({ type: "wholesale", id: row.id, qty });
      }
      items.push({
        id, slug, name, qty, unit_price, bag_size, unit_type, size_mix, price, image: images[0] || "",
        price_pending,
        price_source: pricing.source,
        price_label: pricing.label,
        assigned_manager: pricing.assigned_manager,
      });
      total += price * qty;
    }
    const lang = ["en", "ru", "uz"].includes(b.lang) ? b.lang : "en";
    const r = db.prepare("INSERT INTO orders (customer_id, customer, items, total, order_type, lang) VALUES (?,?,?,?,?,?)")
      .run(signedInCustomer?.id || null, JSON.stringify(customer), JSON.stringify(items), Math.round(total * 100) / 100, orderType, lang);
    const number = "MP-" + new Date().getFullYear() + "-" + String(r.lastInsertRowid).padStart(4, "0");
    db.prepare("UPDATE orders SET number=? WHERE id=?").run(number, r.lastInsertRowid);
    const amount = Math.round(total * 100) / 100;
    const payment = db.prepare(`
      INSERT INTO payments (order_id, order_number, provider, method, status, amount, currency, payload)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      r.lastInsertRowid,
      number,
      paymentProvider(paymentMethod),
      paymentMethod,
      "pending",
      amount,
      "USD",
      JSON.stringify({ source: "checkout", gateway_connected: false })
    );
    audit("customer", "order.created", { order_id: r.lastInsertRowid, number, total: Math.round(total * 100) / 100, order_type: orderType });
    audit("customer", "payment.created", { order_id: r.lastInsertRowid, payment_id: payment.lastInsertRowid, method: paymentMethod, amount });
    for (const adjustment of stockAdjustments) {
      if (adjustment.type === "retail") {
        db.prepare("UPDATE products SET retail_stock=MAX(0, retail_stock-?) WHERE id=?").run(adjustment.qty, adjustment.id);
      } else {
        db.prepare("UPDATE products SET available_qop=MAX(0, available_qop-?) WHERE id=? AND available_qop IS NOT NULL").run(adjustment.qty, adjustment.id);
      }
    }
    notifyTelegramOrderLater({ id: r.lastInsertRowid, number, customer, items, total: amount, orderType, paymentMethod, source, lang });
    send(res, 201, { id: r.lastInsertRowid, order_id: r.lastInsertRowid, number, total: amount, order_type: orderType, payment: { method: paymentMethod, status: "pending", amount, currency: "USD" } });
  },

  "POST /api/auth/orders/:id/cancel": async (req, res, u, m) => {
    const customer = customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const id = Number(m.id);
    const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(id, customer.id);
    if (!order) return fail(res, 404, "not_found");
    const payment = db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(id) || {};
    if (order.status !== "new" || !["pending", "waiting_for_customer", "invoice_sent"].includes(payment.status || "pending")) {
      return fail(res, 409, "cannot_cancel");
    }
    const b = await readJson(req, 4e3);
    db.prepare("UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(id);
    db.prepare("UPDATE payments SET status='cancelled', payload=?, updated_at=datetime('now') WHERE id=?").run(
      JSON.stringify({ cancelled_by: "customer", reason: str(b.reason, 500), cancelled_at: new Date().toISOString() }),
      payment.id
    );
    audit("customer", "order.cancelled", { id, number: order.number, reason: str(b.reason, 120) });
    send(res, 200, { order_id: id, status: "cancelled", payment_status: "cancelled", cancelled_at: new Date().toISOString(), stock_released_qop: 0 });
  },

  "POST /api/auth/orders/:id/payment-proof": async (req, res, u, m) => {
    const customer = customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const id = Number(m.id);
    const order = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(id, customer.id);
    if (!order) return fail(res, 404, "not_found");
    if (["cancelled", "done"].includes(order.status)) return fail(res, 409, "order_closed");
    const payment = db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(id);
    if (!payment) return fail(res, 404, "payment_not_found");
    const b = await readJson(req, 8e3);
    const method = PAYMENT_METHODS.includes(b.method) ? b.method : payment.method || "manager";
    const reference = str(b.reference, 120);
    const note = str(b.note, 1000);
    const amount = Number(b.amount);
    if (!reference && !note) return fail(res, 400, "proof");
    const submittedAt = new Date().toISOString();
    let payload = {};
    try { payload = JSON.parse(payment.payload || "{}"); } catch {}
    payload.submission = {
      method,
      amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : payment.amount,
      reference,
      note,
      submitted_at: submittedAt,
    };
    db.prepare("UPDATE payments SET method=?, status='submitted', reference=COALESCE(NULLIF(?,''), reference), payload=?, updated_at=datetime('now') WHERE id=?")
      .run(method, reference, JSON.stringify(payload), payment.id);
    audit("customer", "payment.submitted", { order_id: id, payment_id: payment.id, method });
    send(res, 200, { order_id: id, payment_status: "submitted", submitted_at: submittedAt });
  },

  "POST /api/newsletter": async (req, res) => {
    if (!rateLimit("newsletter:" + ipOf(req), 5, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 8e3);
    const email = normalizeEmail(b.email);
    if (!emailOk(email)) return fail(res, 400, "email");
    const lang = ["en", "ru", "uz"].includes(b.lang) ? b.lang : "en";
    const r = db.prepare(
      "INSERT OR IGNORE INTO subscribers (email, lang, source) VALUES (?,?,?)"
    ).run(email, lang, str(b.source, 40) || "footer");
    if (r.changes) audit("customer", "subscriber.created", { email, lang });
    send(res, r.changes ? 201 : 200, { ok: true, duplicate: !r.changes });
  },

  "POST /api/support": async (req, res) => {
    if (!rateLimit("support:" + ipOf(req), 8, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 24e3);
    const signedInCustomer = customerFromRequest(req);
    const name = str(b.name || signedInCustomer?.name || "", 80);
    const phone = str(b.phone || signedInCustomer?.phone || "", 25);
    const email = normalizeEmail(b.email || signedInCustomer?.email || "");
    const message = str(b.message, 3000);
    const topic = SUPPORT_TOPICS.includes(b.topic) ? b.topic : "general";
    const lang = ["en", "ru", "uz"].includes(b.lang) ? b.lang : "en";
    if (name.length < 2) return fail(res, 400, "name");
    if (!/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    if (email && !emailOk(email)) return fail(res, 400, "email");
    if (message.length < 8) return fail(res, 400, "message");
    const r = db.prepare(`
      INSERT INTO support_requests (customer_id, name, phone, email, topic, message, lang)
      VALUES (?,?,?,?,?,?,?)
    `).run(signedInCustomer?.id || null, name, phone, email, topic, message, lang);
    const number = "MS-" + new Date().getFullYear() + "-" + String(r.lastInsertRowid).padStart(4, "0");
    db.prepare("UPDATE support_requests SET number=? WHERE id=?").run(number, r.lastInsertRowid);
    audit("customer", "support.created", { id: r.lastInsertRowid, number, topic });
    send(res, 201, { number, status: "new" });
  },

  /* ----- auth ----- */

  "POST /api/login": async (req, res) => {
    if (!rateLimit("login:" + ipOf(req), 8, 15 * 60e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 4e3);
    const loginOk = str(b.login, 60).toLowerCase() === String(getSetting("admin_user") || "admin").toLowerCase();
    const passOk = verifyPassword(String(b.password || ""), getSetting("pass_hash"));
    if (!loginOk || !passOk) return fail(res, 401, "wrong_credentials");
    const token = createSession();
    audit("admin", "auth.login", { ip: ipOf(req) });
    send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, token, 30 * 24 * 3600) });
  },

  "POST /api/logout": (req, res) => {
    const token = parseCookies(req).sid;
    if (token) db.prepare("DELETE FROM sessions WHERE token IN (?,?)").run(sha256(token), token);
    audit("admin", "auth.logout", { ip: ipOf(req) });
    send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "x", 0) });
  },

  "GET /api/me": (req, res) => send(res, 200, { admin: isAdmin(req) }),

  /* ----- admin ----- */

  "GET /api/admin/customers": (req, res, u) => {
    let rows = db.prepare(`
      SELECT id, email, name, phone, city, address, account_type, approval_status,
             company_name, tax_id, legal_address, contact_person, expected_volume,
             phone_verified, customer_tier, assigned_manager, price_discount,
             provider, created_at, updated_at
      FROM customers
      ORDER BY CASE approval_status WHEN 'pending_review' THEN 0 WHEN 'info_requested' THEN 1 ELSE 2 END, id DESC
      LIMIT 1000
    `).all();
    const type = normalizeAccountType(u.searchParams.get("account_type"));
    if (type) rows = rows.filter((row) => row.account_type === type);
    if (APPROVAL_STATUSES.includes(u.searchParams.get("approval_status"))) rows = rows.filter((row) => row.approval_status === u.searchParams.get("approval_status"));
    send(res, 200, rows.map(publicCustomer));
  },

  "PUT /api/admin/customers/:id/approval": async (req, res, u, m) => {
    const b = await readJson(req, 4e3);
    if (!APPROVAL_STATUSES.includes(b.approval_status)) return fail(res, 400, "approval_status");
    const id = Number(m.id);
    const existing = db.prepare("SELECT approval_status FROM customers WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    db.prepare("UPDATE customers SET approval_status=?, updated_at=datetime('now') WHERE id=?").run(b.approval_status, id);
    audit("admin", "customer.approval_changed", { id, from: existing.approval_status, to: b.approval_status });
    send(res, 200, publicCustomer(db.prepare("SELECT * FROM customers WHERE id=?").get(id)));
  },

  "PUT /api/admin/customers/:id/commercial": async (req, res, u, m) => {
    const b = await readJson(req, 8e3);
    const id = Number(m.id);
    const existing = db.prepare("SELECT * FROM customers WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    const tier = normalizeCustomerTier(b.customer_tier);
    const manager = str(b.assigned_manager, 80);
    const discount = Math.max(0, Math.min(90, Number(b.price_discount) || 0));
    db.prepare(`
      UPDATE customers
      SET customer_tier=?, assigned_manager=?, price_discount=?, updated_at=datetime('now')
      WHERE id=?
    `).run(tier, manager, discount, id);
    audit("admin", "customer.commercial_changed", {
      id,
      from_tier: existing.customer_tier || "regular",
      to_tier: tier,
      manager,
      discount,
    });
    send(res, 200, publicCustomer(db.prepare("SELECT * FROM customers WHERE id=?").get(id)));
  },

  "GET /api/admin/reviews": (req, res) => {
    const rows = db.prepare(`
      SELECT r.*, c.name customer_name, c.email customer_email
      FROM reviews r
      JOIN customers c ON c.id=r.customer_id
      ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC
      LIMIT 500
    `).all();
    send(res, 200, rows);
  },

  "PUT /api/admin/reviews/:id": async (req, res, u, m) => {
    const b = await readJson(req, 4e3);
    if (!REVIEW_STATUSES.includes(b.status)) return fail(res, 400, "status");
    const id = Number(m.id);
    const existing = db.prepare("SELECT * FROM reviews WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    db.prepare("UPDATE reviews SET status=?, updated_at=datetime('now') WHERE id=?").run(b.status, id);
    audit("admin", "review.moderated", { id, from: existing.status, to: b.status });
    send(res, 200, { ok: true });
  },

  "GET /api/admin/chat": (req, res) => {
    const rows = db.prepare(`
      SELECT s.*, c.name customer_name, c.email customer_email
      FROM chat_sessions s
      LEFT JOIN customers c ON c.id=s.customer_id
      ORDER BY s.id DESC
      LIMIT 300
    `).all().map((session) => ({
      ...session,
      messages: db.prepare("SELECT sender_type, message, created_at FROM chat_messages WHERE session_id=? ORDER BY id ASC LIMIT 30").all(session.id),
    }));
    send(res, 200, rows);
  },

  "PUT /api/admin/chat/:id": async (req, res, u, m) => {
    const b = await readJson(req, 4e3);
    if (!CHAT_STATUSES.includes(b.status)) return fail(res, 400, "status");
    const id = Number(m.id);
    const existing = db.prepare("SELECT status FROM chat_sessions WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    db.prepare("UPDATE chat_sessions SET status=?, updated_at=datetime('now') WHERE id=?").run(b.status, id);
    audit("admin", "chat.status_changed", { id, from: existing.status, to: b.status });
    send(res, 200, { ok: true });
  },

  "GET /api/admin/products": async (req, res, u) => {
    if (CATALOG_SOURCE_ENABLED) {
      try {
        return send(res, 200, await adminProductsForCatalog(u.searchParams.get("refresh") === "1"));
      } catch (e) {
        catalogCache.error = e.message;
      }
    }
    send(res, 200, db.prepare("SELECT * FROM products ORDER BY sort DESC, id DESC").all().map((r) => rowToProduct(r)));
  },

  "POST /api/admin/products": async (req, res) => {
    const b = await readJson(req);
    let v;
    try { v = validateProduct(b); } catch (e) { return fail(res, 400, "invalid_" + e.message); }
    const slug = uniqueSlug(slugify(str(b.slug, 80) || v.name));
    const cols = Object.keys(v);
    const r = db.prepare(
      `INSERT INTO products (slug,${cols.join(",")}) VALUES (?${",?".repeat(cols.length)})`
    ).run(slug, ...cols.map((c) => v[c]));
    audit("admin", "product.created", { id: r.lastInsertRowid, slug });
    send(res, 201, rowToProduct(db.prepare("SELECT * FROM products WHERE id=?").get(r.lastInsertRowid)));
  },

  "PUT /api/admin/products/:id": async (req, res, u, m) => {
    const id = Number(m.id);
    const existing = db.prepare("SELECT * FROM products WHERE id=?").get(id);
    const b = await readJson(req);
    if (!existing && CATALOG_SOURCE_ENABLED) {
      const product = await catalogProductById(id);
      if (!product) return fail(res, 404, "not_found");
      setCatalogProductActive(id, b.active !== false);
      audit("admin", "catalog_product.availability_changed", { id, active: b.active !== false });
      const updated = (await catalogProductById(id)) || { ...product, active: b.active !== false };
      return send(res, 200, updated);
    }
    if (!existing) return fail(res, 404, "not_found");
    let v;
    try { v = validateProduct(b); } catch (e) { return fail(res, 400, "invalid_" + e.message); }
    const slug = uniqueSlug(slugify(str(b.slug, 80) || v.name), id);
    const cols = Object.keys(v);
    db.prepare(`UPDATE products SET slug=?, ${cols.map((c) => c + "=?").join(",")} WHERE id=?`)
      .run(slug, ...cols.map((c) => v[c]), id);
    audit("admin", "product.updated", { id, slug });
    send(res, 200, rowToProduct(db.prepare("SELECT * FROM products WHERE id=?").get(id)));
  },

  "DELETE /api/admin/products/:id": (req, res, u, m) => {
    const id = Number(m.id);
    const existing = db.prepare("SELECT id FROM products WHERE id=?").get(id);
    if (!existing && CATALOG_SOURCE_ENABLED) {
      setCatalogProductActive(id, false);
      audit("admin", "catalog_product.hidden", { id });
      return send(res, 200, { ok: true });
    }
    db.prepare("DELETE FROM products WHERE id=?").run(id);
    audit("admin", "product.deleted", { id });
    send(res, 200, { ok: true });
  },

  "POST /api/admin/upload": async (req, res) => {
    const buf = await readBody(req, 64 * 1024 * 1024); // up to 64 MB (video)
    if (buf.length < 100) return fail(res, 400, "empty");
    let ext = null, kind = "image";
    // images
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ext = "jpg";
    else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ext = "png";
    else if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") ext = "webp";
    // videos
    else if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) { ext = "webm"; kind = "video"; }
    else if (buf.slice(4, 8).toString("latin1") === "ftyp") { ext = "mp4"; kind = "video"; }
    if (!ext) return fail(res, 400, "format_not_allowed");
    if (kind === "image" && buf.length > 8 * 1024 * 1024) return fail(res, 413, "image_too_large"); // 8 MB cap for images
    const name = (kind === "video" ? "v" : "p") + Date.now().toString(36) + "-" + crypto.randomBytes(4).toString("hex") + "." + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    audit("admin", "media.uploaded", { name, kind, bytes: buf.length });
    send(res, 201, { url: "/uploads/" + name, kind });
  },

  "GET /api/admin/orders": (req, res) => {
    const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500").all().map((r) => ({
      id: r.id, number: r.number, status: r.status, order_type: r.order_type || "wholesale", tracking_number: r.tracking_number || "",
      total: r.total, lang: r.lang, customer_id: r.customer_id || null,
      customer: JSON.parse(r.customer), items: JSON.parse(r.items), created_at: r.created_at,
      payment: db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(r.id) || null,
    }));
    send(res, 200, rows);
  },

  "GET /api/admin/support": (req, res) => {
    const rows = db.prepare("SELECT * FROM support_requests ORDER BY id DESC LIMIT 500").all();
    send(res, 200, rows);
  },

  "PUT /api/admin/support/:id": async (req, res, u, m) => {
    const b = await readJson(req, 4e3);
    if (!SUPPORT_STATUSES.includes(b.status)) return fail(res, 400, "status");
    const id = Number(m.id);
    const existing = db.prepare("SELECT status FROM support_requests WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    db.prepare("UPDATE support_requests SET status=?, updated_at=datetime('now') WHERE id=?").run(b.status, id);
    audit("admin", "support.status_changed", { id, from: existing.status, to: b.status });
    send(res, 200, { ok: true });
  },

  "PUT /api/admin/orders/:id": async (req, res, u, m) => {
    const b = await readJson(req, 4e3);
    if (!ORDER_STATUSES.includes(b.status)) return fail(res, 400, "status");
    const id = Number(m.id);
    const existing = db.prepare("SELECT status FROM orders WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    db.prepare("UPDATE orders SET status=?, tracking_number=COALESCE(NULLIF(?,''), tracking_number), updated_at=datetime('now') WHERE id=?").run(b.status, str(b.tracking_number, 80), id);
    audit("admin", "order.status_changed", { id, from: existing.status, to: b.status });
    send(res, 200, { ok: true });
  },

  "PUT /api/admin/payments/:id": async (req, res, u, m) => {
    const b = await readJson(req, 8e3);
    if (!PAYMENT_STATUSES.includes(b.status)) return fail(res, 400, "status");
    const id = Number(m.id);
    const existing = db.prepare("SELECT * FROM payments WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    const reference = "reference" in b ? str(b.reference, 120) : existing.reference;
    db.prepare("UPDATE payments SET status=?, reference=?, updated_at=datetime('now') WHERE id=?").run(b.status, reference, id);
    audit("admin", "payment.status_changed", { id, order_id: existing.order_id, from: existing.status, to: b.status });
    send(res, 200, { ok: true });
  },

  "GET /api/admin/settings": (req, res) =>
    send(res, 200, { ...allSettings(), admin_user: getSetting("admin_user") || "admin" }),

  "PUT /api/admin/settings": async (req, res) => {
    const b = await readJson(req, 32e3);
    for (const k of PUBLIC_SETTING_KEYS) {
      if (!(k in b)) continue;
      const raw = str(b[k], 300);
      if (SETTING_VALIDATORS[k]) {
        const clean = SETTING_VALIDATORS[k](raw);
        if (clean !== null) setSetting(k, clean); // silently ignore invalid values
      } else {
        setSetting(k, raw);
      }
    }
    if ("admin_user" in b) setSetting("admin_user", str(b.admin_user, 60) || "admin");
    audit("admin", "settings.updated", { keys: Object.keys(b).filter((k) => k !== "password").slice(0, 30) });
    send(res, 200, { ...allSettings(), admin_user: getSetting("admin_user") });
  },

  "POST /api/admin/password": async (req, res) => {
    const b = await readJson(req, 4e3);
    if (!verifyPassword(String(b.current || ""), getSetting("pass_hash"))) return fail(res, 401, "wrong_password");
    const next = String(b.next || "");
    if (next.length < 8 || next.length > 100) return fail(res, 400, "too_short");
    setSetting("pass_hash", hashPassword(next));
    db.prepare("DELETE FROM sessions").run(); // log out everywhere
    const token = createSession();
    try { fs.unlinkSync(path.join(DATA_DIR, "ADMIN-PASSWORD.txt")); } catch {}
    audit("admin", "auth.password_changed", { ip: ipOf(req) });
    send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, token, 30 * 24 * 3600) });
  },

  "GET /api/admin/subscribers": (req, res) => {
    send(res, 200, db.prepare("SELECT id, email, lang, source, created_at FROM subscribers ORDER BY id DESC LIMIT 1000").all());
  },

  "GET /api/admin/events": (req, res) => {
    const rows = db.prepare("SELECT * FROM audit_events ORDER BY id DESC LIMIT 300").all().map((r) => ({
      id: r.id, actor: r.actor, event: r.event, meta: JSON.parse(r.meta || "{}"), created_at: r.created_at,
    }));
    send(res, 200, rows);
  },
};

/* ===================== routing ===================== */

function matchRoute(method, pathname) {
  const direct = api[method + " " + pathname];
  if (direct) return { handler: direct, params: {} };
  for (const key of Object.keys(api)) {
    const [m, pattern] = key.split(" ");
    if (m !== method || !pattern.includes(":")) continue;
    const pp = pattern.split("/"), aa = pathname.split("/");
    if (pp.length !== aa.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(":")) params[pp[i].slice(1)] = decodeURIComponent(aa[i]);
      else if (pp[i] !== aa[i]) { ok = false; break; }
    }
    if (ok) return { handler: api[key], params };
  }
  return null;
}

function serveFile(res, absPath, cache, req) {
  let st;
  try { st = fs.statSync(absPath); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(absPath).toLowerCase();
  const lastMod = st.mtime.toUTCString();
  if (req && req.headers["if-modified-since"] === lastMod) {
    res.writeHead(304, { ...SECURITY_HEADERS, "Cache-Control": cache, "Last-Modified": lastMod });
    res.end();
    return true;
  }
  const stream = fs.createReadStream(absPath);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": st.size,
    "Cache-Control": cache,
    "Last-Modified": lastMod,
  });
  stream.pipe(res);
  return true;
}

/* serve an uploaded file, honoring HTTP Range (needed for <video> seeking) */
function serveUpload(req, res, absPath) {
  let st;
  try { st = fs.statSync(absPath); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(absPath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const base = {
    ...SECURITY_HEADERS,
    ...corsHeaders(req),
    "Access-Control-Allow-Origin": "*",
    "Content-Type": type,
    "Cache-Control": "public, max-age=604800",
    "Accept-Ranges": "bytes",
  };
  const range = req.headers.range;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m) {
    let start = m[1] === "" ? null : parseInt(m[1], 10);
    let end = m[2] === "" ? st.size - 1 : parseInt(m[2], 10);
    if (start === null) { start = st.size - end; end = st.size - 1; } // suffix range
    if (isNaN(start) || isNaN(end) || start > end || end >= st.size) {
      res.writeHead(416, { ...SECURITY_HEADERS, "Content-Range": `bytes */${st.size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...base, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
    if (req.method === "HEAD") { res.end(); return true; }
    fs.createReadStream(absPath, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...base, "Content-Length": st.size });
  if (req.method === "HEAD") { res.end(); return true; }
  fs.createReadStream(absPath).pipe(res);
  return true;
}

async function proxyCatalogStorage(req, res, pathname) {
  if (!CATALOG_API_BASE) return false;
  if (!pathname.startsWith("/storage/") || pathname.includes("..") || pathname.includes("\\")) return false;
  const target = CATALOG_API_BASE + pathname;
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const upstream = await fetch(target, { method: "GET", headers });
  if (!upstream.ok) {
    fail(res, upstream.status === 404 ? 404 : 502, upstream.status === 404 ? "not_found" : "catalog_storage_failed");
    return true;
  }
  const responseHeaders = {
    ...SECURITY_HEADERS,
    ...corsHeaders(req),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=86400",
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
  };
  const length = upstream.headers.get("content-length");
  if (length) responseHeaders["Content-Length"] = length;
  const range = upstream.headers.get("content-range");
  if (range) responseHeaders["Content-Range"] = range;
  res.writeHead(upstream.status, responseHeaders);
  if (req.method === "HEAD") { res.end(); return true; }
  if (!upstream.body) { res.end(); return true; }
  for await (const chunk of upstream.body) res.write(chunk);
  res.end();
  return true;
}

const PAGE_ALIASES = { "/": "index.html", "/shop": "shop.html", "/support": "support.html", "/signin": "signin.html", "/signup": "signin.html", "/account": "signin.html", "/checkout": "shop.html", "/terms": "terms.html", "/ordering": "ordering.html" };
const VIEWS_DIR = path.join(ROOT, "views");

const server = http.createServer(async (req, res) => {
  let u;
  try { u = new URL(req.url, "http://x"); } catch { return fail(res, 400, "bad_url"); }
  const pathname = u.pathname;

  try {
    if (pathname === "/health") {
      Object.entries(corsHeaders(req)).forEach(([key, value]) => res.setHeader(key, value));
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "method_not_allowed");
      return healthResponse(req, res);
    }

    /* API */
    if (pathname.startsWith("/api/")) {
      Object.entries(corsHeaders(req)).forEach(([key, value]) => res.setHeader(key, value));
      if (req.method === "OPTIONS") return send(res, 204, "");
      const route = matchRoute(req.method, pathname);
      if (!route) return fail(res, 404, "not_found");
      const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      const cookieAuthPath = pathname.startsWith("/api/admin/") || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/products/") || pathname.startsWith("/api/reviews") || pathname.startsWith("/api/chat") || pathname === "/api/logout" || pathname === "/api/login";
      if (unsafe && cookieAuthPath && !trustedRequestOrigin(req)) return fail(res, 403, "bad_origin");
      if (pathname.startsWith("/api/admin/") && !isAdmin(req)) return fail(res, 401, "unauthorized");
      return await route.handler(req, res, u, route.params);
    }

    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "method_not_allowed");

    /* uploads (Range-aware so video can stream / seek) */
    if (pathname.startsWith("/uploads/")) {
      const name = path.basename(pathname); // flat dir – kills any traversal
      if (serveUpload(req, res, path.join(UPLOAD_DIR, name))) return;
      return fail(res, 404, "not_found");
    }

    if (pathname.startsWith("/storage/")) {
      Object.entries(corsHeaders(req)).forEach(([key, value]) => res.setHeader(key, value));
      if (await proxyCatalogStorage(req, res, pathname)) return;
      return fail(res, 404, "not_found");
    }

    /* admin: the panel HTML is served only to an authenticated session —
       everyone else gets the login page. The file itself lives outside public/. */
    if (pathname === "/admin" || pathname === "/admin/") {
      const file = isAdmin(req) ? "admin-app.html" : "admin-login.html";
      return serveFile(res, path.join(VIEWS_DIR, file), "no-store") || fail(res, 404, "not_found");
    }

    /* pretty product url /p/:slug */
    if (/^\/p\/[a-z0-9-]+$/.test(pathname)) {
      return serveFile(res, path.join(PUBLIC_DIR, "product.html"), "no-store") || fail(res, 404, "not_found");
    }

    /* pages + static */
    const alias = PAGE_ALIASES[pathname];
    const rel = alias || pathname.slice(1);
    const abs = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!abs.startsWith(PUBLIC_DIR + path.sep) && abs !== PUBLIC_DIR) return fail(res, 403, "forbidden");
    const ext = path.extname(abs).toLowerCase();
    /* html/css/js/json always revalidate so admin edits and updates land
       immediately; images and fonts can cache for a day */
    const cache = ext === ".html" || ext === "" ? "no-store"
      : [".css", ".js", ".json"].includes(ext) ? "no-cache"
      : "public, max-age=86400";
    if (serveFile(res, abs, cache, req)) return;

    fail(res, 404, "not_found");
  } catch (e) {
    if (e.message === "too_large") return fail(res, 413, "too_large");
    if (e.message === "bad_json") return fail(res, 400, "bad_json");
    if (e.message === "bad_type") return fail(res, 415, "unsupported_media_type");
    console.error(req.method, pathname, e);
    fail(res, 500, "server_error");
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 5_000;

function shutdown(signal) {
  console.log("\n  " + signal + " received; closing server.");
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.listen(PORT, HOST, () => {
  console.log("\n  MILANA PREMIUM");
  console.log("  Site:  http://localhost:" + PORT);
  console.log("  Shop:  http://localhost:" + PORT + "/shop");
  console.log("  Admin: http://localhost:" + PORT + "/admin\n");
});
