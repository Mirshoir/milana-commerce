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
const zlib = require("node:zlib");
const net = require("node:net");
const tls = require("node:tls");
const { spawn, spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { PostgresCatalog } = require("./lib/postgres-catalog");
const { PostgresCommerce } = require("./lib/postgres-commerce");
const {
  visibleFacts,
  descriptionFromFacts,
  localizedMaterial,
  localizedCare,
} = require("./lib/product-content");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const UPLOAD_ORIGINAL_DIR = path.join(UPLOAD_DIR, "originals");
const UPLOAD_THUMB_DIR = path.join(UPLOAD_DIR, "thumbs");
const UPLOAD_WORK_DIR = path.join(DATA_DIR, "upload-work");
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";
const SITE_ORIGIN = String(process.env.SITE_ORIGIN || "https://milanapremium.uz").replace(/\/+$/, "");
const TRUSTED_PROXY_IPS = new Set(
  String(process.env.TRUSTED_PROXY_IPS || "127.0.0.1,::1,172.16.10.2,172.16.10.5")
    .split(",")
    .map((value) => value.trim().replace(/^::ffff:/, ""))
    .filter((value) => net.isIP(value))
);
loadEnvFile(path.join(DATA_DIR, "supabase.env"));
loadEnvFile(path.join(DATA_DIR, "firebase.env"));
loadEnvFile(path.join(DATA_DIR, "telegram.env"));
loadEnvFile(path.join(DATA_DIR, "sms.env"));
loadEnvFile(path.join(DATA_DIR, "email.env"));
loadEnvFile(path.join(DATA_DIR, "openai.env"));
loadEnvFile(path.join(DATA_DIR, "postgres.env"));
loadEnvFile(path.join(DATA_DIR, "catalog.env"), { override: true });
loadEnvFile(path.join(DATA_DIR, "local-store.env"), { override: true });
const CATALOG_SOURCE_ENABLED = false;
const CATALOG_DB_DRIVER = String(process.env.CATALOG_DB_DRIVER || "sqlite").toLowerCase();
const POSTGRES_CATALOG_ENABLED = CATALOG_DB_DRIVER === "postgres";
const COMMERCE_DB_DRIVER = String(process.env.COMMERCE_DB_DRIVER || "sqlite").toLowerCase();
const POSTGRES_COMMERCE_ENABLED = COMMERCE_DB_DRIVER === "postgres";
if (POSTGRES_CATALOG_ENABLED && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required when CATALOG_DB_DRIVER=postgres");
}
if (POSTGRES_COMMERCE_ENABLED && !POSTGRES_CATALOG_ENABLED) {
  throw new Error("COMMERCE_DB_DRIVER=postgres requires CATALOG_DB_DRIVER=postgres so checkout and stock share one transaction.");
}
const SEED_FALLBACK_CATALOG = process.env.SEED_FALLBACK_CATALOG === "1";
const LOCAL_STORE_UPLOAD_BASE = (process.env.LOCAL_STORE_API_BASE || "").replace(/\/+$/, "");
const LOCAL_STORE_API_BASE = process.env.LOCAL_STORE_PROXY_ENABLED === "0"
  ? ""
  : LOCAL_STORE_UPLOAD_BASE;
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
const FIREBASE_APPLE_ENABLED = FIREBASE_ENABLED && process.env.FIREBASE_APPLE_ENABLED === "1";
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
const SMS_WEBHOOK_URL = (process.env.SMS_WEBHOOK_URL || "").trim();
const SMS_WEBHOOK_TOKEN = (process.env.SMS_WEBHOOK_TOKEN || "").trim();
const SMS_SEND_IN_DEV = process.env.SMS_SEND_IN_DEV === "1";
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM_EMAIL = (process.env.RESEND_FROM_EMAIL || "Milana Premium <onboarding@resend.dev>").trim();
const SMTP_HOST = (process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "1" || SMTP_PORT === 465;
const SMTP_STARTTLS = process.env.SMTP_STARTTLS !== "0";
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const SMTP_PASS = (process.env.SMTP_PASS || "").trim();
const SMTP_FROM_EMAIL = (process.env.SMTP_FROM_EMAIL || RESEND_FROM_EMAIL || SMTP_USER).trim();
const EMAIL_WEBHOOK_URL = (process.env.EMAIL_WEBHOOK_URL || "").trim();
const EMAIL_WEBHOOK_TOKEN = (process.env.EMAIL_WEBHOOK_TOKEN || "").trim();
const EMAIL_SEND_IN_DEV = process.env.EMAIL_SEND_IN_DEV === "1";
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_API_BASE = (process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-5.5").trim();
const OPENAI_ASSISTANT_ENABLED = process.env.OPENAI_ASSISTANT_ENABLED !== "0" && Boolean(OPENAI_API_KEY);
const CATALOG_PANEL_IDS = [
  "pajamas", "robes", "men", "tunics", "trousers",
  "nightgowns", "sets", "tshirts", "kids",
];
const PRODUCT_TYPE_IDS = [
  "tunic", "sarochka", "robe", "pajamas", "set", "tracksuit",
  "hoodie", "dress", "shirt", "polo", "trousers", "tshirt",
  "shorts", "top",
];
const PRODUCT_PHOTO_TYPES = (() => {
  try {
    const review = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "product-photo-types.json"), "utf8"));
    return Object.fromEntries(
      Object.entries(review?.types || {})
        .filter(([id, type]) => /^\d+$/.test(id) && PRODUCT_TYPE_IDS.includes(type))
    );
  } catch {
    return {};
  }
})();
const MEDIA_OPTIMIZE_ENABLED = process.env.MEDIA_OPTIMIZE_ENABLED !== "0";
const MEDIA_IMAGE_MAX_EDGE = Math.max(1800, Math.min(5000, Number(process.env.MEDIA_IMAGE_MAX_EDGE) || 3200));
const MEDIA_IMAGE_QUALITY = Math.max(82, Math.min(98, Number(process.env.MEDIA_IMAGE_QUALITY) || 92));
const MEDIA_THUMB_WIDTH = Math.max(320, Math.min(1280, Number(process.env.MEDIA_THUMB_WIDTH) || 640));
const MEDIA_THUMB_QUALITY = Math.max(50, Math.min(90, Number(process.env.MEDIA_THUMB_QUALITY) || 72));
const MEDIA_VIDEO_MAX_EDGE = Math.max(1080, Math.min(2160, Number(process.env.MEDIA_VIDEO_MAX_EDGE) || 1920));
const MEDIA_VIDEO_CRF = Math.max(18, Math.min(28, Number(process.env.MEDIA_VIDEO_CRF) || 22));
const FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_BIN || "ffprobe";
const CWEBP_BIN = process.env.CWEBP_BIN || "cwebp";
const FFMPEG_AVAILABLE = (() => {
  try { return spawnSync(FFMPEG_BIN, ["-version"], { stdio: "ignore" }).status === 0; } catch { return false; }
})();
const FFPROBE_AVAILABLE = (() => {
  try { return spawnSync(FFPROBE_BIN, ["-version"], { stdio: "ignore" }).status === 0; } catch { return false; }
})();
const CWEBP_AVAILABLE = (() => {
  try { return spawnSync(CWEBP_BIN, ["-version"], { stdio: "ignore" }).status === 0; } catch { return false; }
})();

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_ORIGINAL_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_WORK_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_THUMB_DIR, { recursive: true });

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
const postgresCatalog = POSTGRES_CATALOG_ENABLED
  ? new PostgresCatalog({
      connectionString: process.env.DATABASE_URL,
      max: process.env.POSTGRES_POOL_MAX,
      min: process.env.POSTGRES_POOL_MIN,
      statementTimeoutMillis: process.env.POSTGRES_STATEMENT_TIMEOUT_MS,
      applicationName: `milana-${NODE_ENV}`,
    })
  : null;
const postgresCommerce = POSTGRES_COMMERCE_ENABLED
  ? new PostgresCommerce({ pool: postgresCatalog.pool })
  : null;
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
    catalog_panel TEXT NOT NULL DEFAULT '',
    product_type TEXT NOT NULL DEFAULT '',
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
    wholesale_moq INTEGER DEFAULT 6,
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
    manager_id INTEGER,
    manager_name TEXT DEFAULT '',
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
  CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    discount_type TEXT DEFAULT 'percent',
    value REAL DEFAULT 0,
    min_total REAL DEFAULT 0,
    usage_limit INTEGER DEFAULT 0,
    per_customer_limit INTEGER DEFAULT 1,
    starts_at TEXT DEFAULT '',
    expires_at TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS customer_coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    promo_id INTEGER,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    discount_type TEXT DEFAULT 'percent',
    value REAL DEFAULT 0,
    min_total REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    source TEXT DEFAULT 'promo',
    assigned_at TEXT DEFAULT (datetime('now')),
    redeemed_at TEXT DEFAULT '',
    expires_at TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    UNIQUE(customer_id, code),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY(promo_id) REFERENCES promo_codes(id) ON DELETE SET NULL
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
  CREATE TABLE IF NOT EXISTS managers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    login TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL DEFAULT '',
    telegram_thread_id TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS manager_sessions (
    token TEXT PRIMARY KEY,
    manager_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(manager_id) REFERENCES managers(id) ON DELETE CASCADE
  );
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
  CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(active, code);
  CREATE INDEX IF NOT EXISTS idx_customer_coupons_customer ON customer_coupons(customer_id, status, expires_at);
  CREATE INDEX IF NOT EXISTS idx_phone_otps_expires ON phone_otps(expires_at);
  CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps(expires_at);
  CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, product_slug, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_likes_customer ON likes(customer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_status_created ON chat_sessions(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id ASC);
  CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
  CREATE INDEX IF NOT EXISTS idx_managers_active ON managers(active, name);
  CREATE INDEX IF NOT EXISTS idx_manager_sessions_created ON manager_sessions(created_at);
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

function emailAddress(value) {
  const match = String(value || "").match(/<([^<>@\s]+@[^<>\s]+)>/);
  if (match) return match[1];
  const plain = String(value || "").trim();
  return emailOk(plain) ? plain : "";
}

function encodeHeader(value) {
  const clean = String(value || "").replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function smtpMessage({ from, to, subject, text }) {
  const html = emailHtml(text);
  const boundary = "milana-" + crypto.randomBytes(12).toString("hex");
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Message-ID: <${crypto.randomBytes(12).toString("hex")}@milanapremium.uz>`,
    `Date: ${new Date().toUTCString()}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    String(text || ""),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n").replace(/^\./gm, "..");
}

function smtpRead(socket, state) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => cleanup(new Error("smtp_timeout")), 20_000);
    const onData = (chunk) => {
      state.buffer += chunk.toString("utf8");
      const lines = state.buffer.split(/\r?\n/);
      if (!state.buffer.endsWith("\n")) state.buffer = lines.pop() || "";
      else state.buffer = "";
      for (const line of lines) {
        if (!line) continue;
        const match = line.match(/^(\d{3})([\s-])(.*)$/);
        if (match && match[2] === " ") cleanup(null, { code: Number(match[1]), line });
      }
    };
    const onError = (err) => cleanup(err);
    function cleanup(err, value) {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      if (err) reject(err);
      else resolve(value);
    }
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function smtpCommand(socket, state, command, okCodes) {
  if (command) socket.write(command + "\r\n");
  const res = await smtpRead(socket, state);
  if (!okCodes.includes(res.code)) throw new Error(`smtp_${res.code}`);
  return res;
}

function smtpConnect() {
  return new Promise((resolve, reject) => {
    const options = { host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST, rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "0" };
    const socket = SMTP_SECURE ? tls.connect(options) : net.connect(options);
    socket.setTimeout(25_000);
    socket.once(SMTP_SECURE ? "secureConnect" : "connect", () => resolve(socket));
    socket.once("error", reject);
    socket.once("timeout", () => reject(new Error("smtp_timeout")));
  });
}

function smtpUpgrade(socket) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: SMTP_HOST, rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "0" });
    secure.once("secureConnect", () => resolve(secure));
    secure.once("error", reject);
  });
}

async function sendSmtpEmail(to, subject, text) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return { ok: false, error: "email_not_configured" };
  const from = SMTP_FROM_EMAIL || SMTP_USER;
  const fromAddress = emailAddress(from) || SMTP_USER;
  let socket;
  let state = { buffer: "" };
  try {
    socket = await smtpConnect();
    await smtpCommand(socket, state, "", [220]);
    await smtpCommand(socket, state, `EHLO ${HOST === "0.0.0.0" ? "milanapremium.uz" : HOST}`, [250]);
    if (!SMTP_SECURE && SMTP_STARTTLS) {
      await smtpCommand(socket, state, "STARTTLS", [220]);
      socket = await smtpUpgrade(socket);
      state = { buffer: "" };
      await smtpCommand(socket, state, `EHLO ${HOST === "0.0.0.0" ? "milanapremium.uz" : HOST}`, [250]);
    }
    await smtpCommand(socket, state, "AUTH PLAIN " + Buffer.from(`\0${SMTP_USER}\0${SMTP_PASS}`).toString("base64"), [235]);
    await smtpCommand(socket, state, `MAIL FROM:<${fromAddress}>`, [250]);
    await smtpCommand(socket, state, `RCPT TO:<${to}>`, [250, 251]);
    await smtpCommand(socket, state, "DATA", [354]);
    socket.write(smtpMessage({ from, to, subject, text }) + "\r\n.\r\n");
    await smtpCommand(socket, state, "", [250]);
    await smtpCommand(socket, state, "QUIT", [221]);
    socket.end();
    return { ok: true };
  } catch (e) {
    if (socket) socket.destroy();
    console.error("SMTP email failed:", e.message);
    return { ok: false, error: "email_failed" };
  }
}

async function sendEmail(to, subject, text, meta = {}) {
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) return sendSmtpEmail(to, subject, text, meta);
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
if (!getSetting("chat_session_secret")) setSetting("chat_session_secret", crypto.randomBytes(32).toString("hex"));

function chatSessionRef(id) {
  const numericId = Number(id);
  const signature = crypto.createHmac("sha256", getSetting("chat_session_secret"))
    .update(String(numericId))
    .digest("hex");
  return `${numericId}.${signature}`;
}

function verifiedChatSessionId(value) {
  const match = String(value || "").match(/^(\d+)\.([a-f0-9]{64})$/);
  if (!match) return 0;
  const expected = chatSessionRef(Number(match[1])).split(".")[1];
  const supplied = Buffer.from(match[2], "hex");
  const trusted = Buffer.from(expected, "hex");
  return supplied.length === trusted.length && crypto.timingSafeEqual(supplied, trusted)
    ? Number(match[1])
    : 0;
}

const ORDER_BAG_SIZE = 60;
const ORDER_BAG_SIZE_COUNT = 6;
const ORDER_SIZE_QTY = ORDER_BAG_SIZE / ORDER_BAG_SIZE_COUNT;
const ORDER_PACHKA_SIZE = 6;
const ORDER_PACKAGE_UNITS = new Set(["pachka", "qop"]);
const ORDER_PACKAGE_ALIASES = { qadoq: "pachka", pachka: "pachka", qop: "qop" };
function defaultOrderSizes(gender, category) {
  if (gender === "kids" || category === "pajamas") return ["28", "30", "32", "34", "36", "38"];
  if (gender === "men") return ["46", "48", "50", "52", "54", "56"];
  return ["44", "46", "48", "50", "52", "54"];
}

/* реальный размерный ряд модели; шаблон подставляем, только если у товара размеров нет вовсе */
function orderSizes(sizes, gender, category) {
  const seen = new Set();
  const own = (Array.isArray(sizes) ? sizes : [])
    .map((s) => str(s, 8))
    .filter(Boolean)
    .filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
  return (own.length ? own : defaultOrderSizes(gender, category)).slice(0, 12);
}

/* пачка — по одному изделию на каждый размер модели.
   «Свободный размер» (ряд из одного значения) — исключение: пачка обычная, 6 изделий одного размера */
function packPieces(sizes, gender, category) {
  const n = orderSizes(sizes, gender, category).length;
  return n > 1 ? n : ORDER_PACHKA_SIZE;
}

/* мешок — всегда 60 изделий, разложенных по реальным размерам (остаток идёт в первые) */
function orderSizeMix(sizes, gender, category) {
  const list = orderSizes(sizes, gender, category);
  if (!list.length) return [];
  const base = Math.floor(ORDER_BAG_SIZE / list.length);
  let rest = ORDER_BAG_SIZE - base * list.length;
  return list.map((size) => ({ size, qty: base + (rest-- > 0 ? 1 : 0) }));
}

function packageSizeMix(sizes, gender, category, packageSize) {
  if (packageSize === ORDER_BAG_SIZE) return orderSizeMix(sizes, gender, category);
  const list = orderSizes(sizes, gender, category);
  if (list.length <= 1) return list.map((size) => ({ size, qty: packageSize }));
  return list.slice(0, packageSize).map((size) => ({ size, qty: 1 }));
}

function orderUnitsFor(p = {}) {
  const n = packPieces(p.sizes, p.gender, p.category);
  return [
    { unit_type: "pachka", label: "Qadoq", pieces: n, per_size: 1, min_qty: 1 },
    { unit_type: "qop", label: "Qop", pieces: ORDER_BAG_SIZE, per_size: Math.floor(ORDER_BAG_SIZE / n), min_qty: 1 },
  ];
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

/* ============ справочники: полотно, состав, сезон, размерный ряд ============
   заполняются в админке, товар выбирает значение из готового списка         */
const DICT_KINDS = ["material", "composition", "season", "sizes"];
db.exec(`CREATE TABLE IF NOT EXISTS dictionaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  sort INTEGER DEFAULT 0
)`);
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS dictionaries_kind_value ON dictionaries(kind, value)");

function dictList(kind) {
  return db.prepare("SELECT value FROM dictionaries WHERE kind=? ORDER BY sort, value").all(kind).map((r) => r.value);
}
const DICT_COLUMN = { material: "material", composition: "composition", season: "season" };

/* размерный ряд товара в том же виде, в каком он лежит в справочнике */
function sizeRunOf(rawSizes) {
  try { return (JSON.parse(rawSizes || "[]") || []).map((x) => String(x).trim()).filter(Boolean).join(", "); }
  catch (e) { return ""; }
}

function dictUsage() {
  const usage = { material: {}, composition: {}, season: {}, sizes: {} };
  for (const [kind, col] of Object.entries(DICT_COLUMN)) {
    for (const r of db.prepare(`SELECT TRIM(${col}) v, COUNT(*) n FROM products WHERE TRIM(COALESCE(${col},'')) <> '' GROUP BY 1`).all()) {
      usage[kind][r.v] = r.n;
    }
  }
  for (const r of db.prepare("SELECT sizes FROM products WHERE COALESCE(sizes,'') <> ''").all()) {
    const key = sizeRunOf(r.sizes);
    if (key) usage.sizes[key] = (usage.sizes[key] || 0) + 1;
  }
  return usage;
}

function dictAll() {
  return { ...Object.fromEntries(DICT_KINDS.map((k) => [k, dictList(k)])), usage: dictUsage() };
}
function dictReplace(kind, values) {
  const clean = [...new Set((Array.isArray(values) ? values : []).map((v) => String(v ?? "").slice(0, 200).trim()).filter(Boolean))].slice(0, 400);
  db.prepare("DELETE FROM dictionaries WHERE kind=?").run(kind);
  const ins = db.prepare("INSERT OR IGNORE INTO dictionaries (kind, value, sort) VALUES (?,?,?)");
  clean.forEach((v, i) => ins.run(kind, v, i));
  return clean;
}


const seedMod = require("./seed.js");

function inferCatalogPanel(product = {}) {
  if (product.gender === "men") return "men";
  if (product.gender === "kids") return "kids";
  const text = String([
    product.model_no, product.variant, product.name,
    product.desc_en, product.desc_ru, product.desc_uz,
  ].filter(Boolean).join(" ")).toLowerCase();
  if (/(?:^|\s)(?:xj|x)-?\d|халат|xalat|\brobe\b/.test(text) || product.category === "robes") return "robes";
  if (/(?:^|\s)tj-?\d|туник|tunika|\btunic\b/.test(text)) return "tunics";
  if (/(?:^|\s)bj-?\d|иштон|ishton|штаны|брюки|\btrousers?\b|\bpants?\b/.test(text)) return "trousers";
  if (/(?:^|\s)sj-?\d|сорочк|sarochka|nightgown|nightdress|кормяшк/.test(text)) return "nightgowns";
  if (/двойк|двойн|тройк|комплект|dvojka|dvoyka|\bset\b|футболк.{0,24}(?:шорт|бридж|штан)|(?:майка|лямка).{0,24}(?:шорт|бридж|штан)/.test(text)) return "sets";
  if (/(?:^|\s)f-?\d|футболк|futbolka|t-?shirt/.test(text)) return "tshirts";
  if (/пижам|pijama|pajama|(?:^|\s)pj-?\d/.test(text) || product.category === "pajamas") return "pajamas";
  if (product.category === "homewear" || product.category === "loungewear") return "sets";
  return "pajamas";
}

function inferProductType(product = {}) {
  const reviewed = PRODUCT_PHOTO_TYPES[String(product.id || "")];
  if (PRODUCT_TYPE_IDS.includes(reviewed)) return reviewed;
  const text = String([
    product.name, product.model_no, product.variant,
  ].filter(Boolean).join(" ")).toLowerCase();
  const patterns = [
    ["sarochka", /сорочк|sarochka|nightdress|nightgown|анжелик/],
    ["robe", /халат|robe|xalat/],
    ["tunic", /туник|tunic|tunika/],
    ["pajamas", /пижам|pajama|pijama/],
    ["tracksuit", /спортивк|tracksuit/],
    ["hoodie", /худи|hoodie/],
    ["dress", /плать|dress/],
    ["shirt", /рубашк|shirt/],
    ["set", /тройк|двойк|комплект|футболк.*(?:шорт|бридж|штан)|(?:майка|лямка).*(?:шорт|бридж|штан)|\bset\b/],
    ["trousers", /штаны|брюки|trouser|pants/],
    ["tshirt", /футболк|t-shirt|tshirt/],
    ["shorts", /шорт|shorts/],
    ["top", /майка|top|tank/],
  ];
  const matched = patterns.find(([, pattern]) => pattern.test(text))?.[0];
  if (matched) return matched;
  if (PRODUCT_TYPE_IDS.includes(product.product_type)) return product.product_type;
  const panelType = {
    pajamas: "pajamas", robes: "robe", tunics: "tunic", trousers: "trousers",
    nightgowns: "sarochka", sets: "set", tshirts: "tshirt",
  }[product.catalog_panel];
  if (panelType) return panelType;
  return { robes: "robe", pajamas: "pajamas", homewear: "set", loungewear: "set" }[product.category] || "set";
}

/* ---------- schema migration: add model_no / variant / gender, split category ---------- */
(() => {
  const cols = db.prepare("PRAGMA table_info(products)").all().map((c) => c.name);
  if (!cols.includes("model_no")) db.exec("ALTER TABLE products ADD COLUMN model_no TEXT DEFAULT ''");
  if (!cols.includes("variant")) db.exec("ALTER TABLE products ADD COLUMN variant TEXT DEFAULT ''");
  if (!cols.includes("gender")) db.exec("ALTER TABLE products ADD COLUMN gender TEXT DEFAULT ''");
  if (!cols.includes("catalog_panel")) db.exec("ALTER TABLE products ADD COLUMN catalog_panel TEXT NOT NULL DEFAULT ''");
  if (!cols.includes("size_chart")) db.exec("ALTER TABLE products ADD COLUMN size_chart TEXT DEFAULT ''");
  if (!cols.includes("color")) db.exec("ALTER TABLE products ADD COLUMN color TEXT DEFAULT ''");
  if (!cols.includes("country")) db.exec("ALTER TABLE products ADD COLUMN country TEXT DEFAULT ''");
  if (!cols.includes("material")) db.exec("ALTER TABLE products ADD COLUMN material TEXT DEFAULT ''");
  if (!cols.includes("season")) db.exec("ALTER TABLE products ADD COLUMN season TEXT DEFAULT ''");
  if (!cols.includes("composition")) db.exec("ALTER TABLE products ADD COLUMN composition TEXT DEFAULT ''");
  if (!cols.includes("product_type")) db.exec("ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT ''");
  if (!cols.includes("wholesale_price")) db.exec("ALTER TABLE products ADD COLUMN wholesale_price REAL DEFAULT 0");
  if (!cols.includes("wholesale_moq")) db.exec("ALTER TABLE products ADD COLUMN wholesale_moq INTEGER DEFAULT 6");
  if (!cols.includes("retail_enabled")) db.exec("ALTER TABLE products ADD COLUMN retail_enabled INTEGER DEFAULT 1");
  if (!cols.includes("retail_price")) db.exec("ALTER TABLE products ADD COLUMN retail_price REAL DEFAULT 0");
  if (!cols.includes("retail_stock")) db.exec("ALTER TABLE products ADD COLUMN retail_stock INTEGER DEFAULT 0");
  if (!cols.includes("available_qop")) db.exec("ALTER TABLE products ADD COLUMN available_qop INTEGER");
  if (!cols.includes("like_count")) db.exec("ALTER TABLE products ADD COLUMN like_count INTEGER DEFAULT 0");
  if (!cols.includes("collection")) db.exec("ALTER TABLE products ADD COLUMN collection TEXT DEFAULT ''");
  if (!cols.includes("views")) db.exec("ALTER TABLE products ADD COLUMN views INTEGER DEFAULT 0");
  db.exec("UPDATE products SET wholesale_price=price WHERE COALESCE(wholesale_price,0)<=0");
  db.exec("UPDATE products SET retail_price=price WHERE COALESCE(retail_price,0)<=0");
  /* минимальный заказ = число размеров модели: пачка содержит по 1 изделию на размер */
  for (const r of db.prepare("SELECT id, sizes, wholesale_moq FROM products").all()) {
    let n = 0;
    try { n = (JSON.parse(r.sizes || "[]") || []).filter(Boolean).length; } catch (e) { n = 0; }
    n = n || ORDER_PACHKA_SIZE;
    if (Number(r.wholesale_moq) !== n) db.prepare("UPDATE products SET wholesale_moq=? WHERE id=?").run(n, r.id);
  }

/* первое наполнение — из того, что уже заведено в каталоге */
(function seedDictionaries() {
  const column = { material: "material", composition: "composition", season: "season" };
  for (const kind of Object.keys(column)) {
    if (dictList(kind).length) continue;
    const rows = db.prepare(`SELECT DISTINCT TRIM(${column[kind]}) v FROM products WHERE TRIM(COALESCE(${column[kind]},'')) <> ''`).all();
    dictReplace(kind, rows.map((r) => r.v).sort((a, b) => a.localeCompare(b, "ru")));
  }
  if (dictList("sizes").length) return;
  const runs = new Set();
  for (const r of db.prepare("SELECT sizes FROM products WHERE COALESCE(sizes,'') <> ''").all()) {
    try {
      const list = (JSON.parse(r.sizes) || []).map((x) => String(x).trim()).filter(Boolean);
      if (list.length) runs.add(list.join(", "));
    } catch (e) { /* строка не разобралась — пропускаем */ }
  }
  dictReplace("sizes", [...runs].sort((a, b) => a.localeCompare(b, "ru")));
})();

/* полотно и сезон в карточках ещё не заполнены — даём стартовые списки, их можно править в админке */
(function seedDictionaryDefaults() {
  if (!dictList("material").length) dictReplace("material", [
    "Бамбуковая ткань", "Хлопковая ткань", "Вискозная ткань", "Шёлковая ткань", "Атласная ткань",
    "Муслин", "Ткань модал", "Велюр", "Трикотаж с начёсом", "Трикотаж супрем", "Трикотаж лапша",
    "Штапель", "Двухниточный трикотаж", "Трёхниточный трикотаж", "Трикотаж", "Полиэстеровая ткань",
  ]);
  if (!dictList("season").length) dictReplace("season", ["Всесезонный", "Лето", "Демисезон", "Зима"]);
  if (!db.prepare("SELECT 1 FROM dictionaries WHERE kind='sizes' AND value='Свободный размер'").get()) {
    db.prepare("INSERT OR IGNORE INTO dictionaries (kind, value, sort) VALUES ('sizes','Свободный размер',-1)").run();
  }
})();

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
  const ungrouped = db.prepare(`
    SELECT id, model_no, variant, gender, category, catalog_panel, name, desc_en, desc_ru, desc_uz
    FROM products
    WHERE catalog_panel IS NULL OR catalog_panel='' OR catalog_panel NOT IN (${CATALOG_PANEL_IDS.map(() => "?").join(",")})
  `).all(...CATALOG_PANEL_IDS);
  if (ungrouped.length) {
    const updatePanel = db.prepare("UPDATE products SET catalog_panel=? WHERE id=?");
    ungrouped.forEach((product) => updatePanel.run(inferCatalogPanel(product), product.id));
    console.log("  Grouped " + ungrouped.length + " product(s) into catalog panels.");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_products_catalog_panel ON products(active, catalog_panel, sort DESC, id DESC)");
  const applyReviewedType = db.prepare(`
    UPDATE products
    SET product_type=?
    WHERE id=? AND COALESCE(product_type,'')<>?
  `);
  let reviewedTypeCount = 0;
  db.exec("BEGIN");
  try {
    Object.entries(PRODUCT_PHOTO_TYPES).forEach(([id, type]) => {
      reviewedTypeCount += Number(applyReviewedType.run(type, Number(id), type).changes || 0);
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  if (reviewedTypeCount) {
    console.log("  Applied photo-reviewed names to " + reviewedTypeCount + " product(s).");
  }
  const untypedProducts = db.prepare(`
    SELECT id, model_no, variant, gender, category, name, desc_en, desc_ru, desc_uz
    FROM products
    WHERE product_type IS NULL OR product_type=''
  `).all();
  const saveInferredType = db.prepare("UPDATE products SET product_type=? WHERE id=?");
  let inferredTypeCount = 0;
  db.exec("BEGIN");
  try {
    untypedProducts.forEach((product) => {
      const type = inferProductType(product);
      if (type) inferredTypeCount += Number(saveInferredType.run(type, product.id).changes || 0);
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  if (inferredTypeCount) {
    console.log("  Inferred concise product names for " + inferredTypeCount + " product(s).");
  }
  const typedProducts = db.prepare(`
    SELECT id, model_no, variant, gender, category, catalog_panel, product_type,
           name, desc_en, desc_ru, desc_uz
    FROM products
  `).all();
  const reconcileType = db.prepare("UPDATE products SET product_type=? WHERE id=?");
  let reconciledTypeCount = 0;
  db.exec("BEGIN");
  try {
    typedProducts.forEach((product) => {
      const type = inferProductType(product);
      if (type && type !== product.product_type) {
        reconciledTypeCount += Number(reconcileType.run(type, product.id).changes || 0);
      }
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  if (reconciledTypeCount) {
    console.log("  Corrected concise product names for " + reconciledTypeCount + " product(s).");
  }

  const orderCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
  if (!orderCols.includes("customer_id")) db.exec("ALTER TABLE orders ADD COLUMN customer_id INTEGER");
  if (!orderCols.includes("order_type")) db.exec("ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'wholesale'");
  if (!orderCols.includes("tracking_number")) db.exec("ALTER TABLE orders ADD COLUMN tracking_number TEXT DEFAULT ''");
  if (!orderCols.includes("manager_id")) db.exec("ALTER TABLE orders ADD COLUMN manager_id INTEGER");
  if (!orderCols.includes("manager_name")) db.exec("ALTER TABLE orders ADD COLUMN manager_name TEXT DEFAULT ''");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_manager_created ON orders(manager_id, created_at DESC)");
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

  if (!db.prepare("SELECT COUNT(*) count FROM managers").get().count && process.env.TELEGRAM_ORDER_CHAT_ID) {
    const password = String(process.env.TELEGRAM_DEFAULT_MANAGER_PASSWORD || crypto.randomBytes(7).toString("base64url"));
    const name = String(process.env.TELEGRAM_DEFAULT_MANAGER_NAME || "Milana Manager").trim().slice(0, 80);
    const login = String(process.env.TELEGRAM_DEFAULT_MANAGER_LOGIN || "manager").trim().slice(0, 60).toLowerCase();
    db.prepare(`
      INSERT INTO managers (name, login, password_hash, telegram_chat_id, telegram_thread_id)
      VALUES (?,?,?,?,?)
    `).run(
      name,
      login,
      hashPassword(password),
      String(process.env.TELEGRAM_ORDER_CHAT_ID).trim().slice(0, 80),
      String(process.env.TELEGRAM_ORDER_THREAD_ID || "").trim().slice(0, 30)
    );
    if (!process.env.TELEGRAM_DEFAULT_MANAGER_PASSWORD) {
      fs.writeFileSync(
        path.join(DATA_DIR, "MANAGER-PASSWORD.txt"),
        `MILANA PREMIUM manager panel\r\nURL: http://localhost:${PORT}/admin\r\nLogin: ${login}\r\nPassword: ${password}\r\n`
      );
    }
    console.log("  Created the default Telegram manager account.");
  }
})();

if (SEED_FALLBACK_CATALOG && !db.prepare("SELECT COUNT(*) c FROM products").get().c) {
  try {
    seedMod.seed(db);
    console.log("  Seeded fallback Milana catalog (" + db.prepare("SELECT COUNT(*) c FROM products").get().c + " products).");
  } catch (e) { console.error("Seed failed:", e.message); }
}
const seededUngrouped = db.prepare(`
  SELECT id, model_no, variant, gender, category, name, desc_en, desc_ru, desc_uz
  FROM products WHERE catalog_panel IS NULL OR catalog_panel=''
`).all();
if (seededUngrouped.length) {
  const updatePanel = db.prepare("UPDATE products SET catalog_panel=? WHERE id=?");
  seededUngrouped.forEach((product) => updatePanel.run(inferCatalogPanel(product), product.id));
}

/* ========================= helpers ========================= */

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".gif": "image/gif", ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
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
    `img-src 'self' data: ${CATALOG_ASSET_ORIGIN} https://milanapremium.uz https://lh3.googleusercontent.com`,
    "font-src 'self'",
    `media-src 'self' ${CATALOG_ASSET_ORIGIN} https://d8j0ntlcm91z4.cloudfront.net`,
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

const COMPRESSIBLE_TYPES = new Set([
  "application/json", "application/javascript", "text/javascript", "text/css",
  "text/html", "text/plain", "image/svg+xml",
]);

function acceptedEncoding(req) {
  const value = String(req?.headers?.["accept-encoding"] || "").toLowerCase();
  if (value.includes("br")) return "br";
  if (value.includes("gzip")) return "gzip";
  return "";
}

function compressBuffer(buffer, req, contentType) {
  const type = String(contentType || "").split(";", 1)[0].toLowerCase();
  const encoding = buffer.length >= 512 && COMPRESSIBLE_TYPES.has(type) ? acceptedEncoding(req) : "";
  if (!encoding) return { body: buffer, encoding: "" };
  try {
    return {
      body: encoding === "br"
        ? zlib.brotliCompressSync(buffer, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
        : zlib.gzipSync(buffer, { level: 6 }),
      encoding,
    };
  } catch { return { body: buffer, encoding: "" }; }
}

function send(res, code, body, headers = {}) {
  const h = { ...SECURITY_HEADERS, "Cache-Control": "no-store", ...headers };
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body);
    h["Content-Type"] = "application/json; charset=utf-8";
  }
  if (body != null && !Buffer.isBuffer(body)) body = Buffer.from(String(body));
  if (Buffer.isBuffer(body)) {
    const compressed = compressBuffer(body, res._milanaReq || res.req, h["Content-Type"]);
    body = compressed.body;
    if (compressed.encoding) {
      h["Content-Encoding"] = compressed.encoding;
      h.Vary = "Accept-Encoding";
    }
    h["Content-Length"] = body.length;
  }
  res.writeHead(code, h);
  res.end(body);
}

function sendText(req, res, code, text, contentType, cache = "no-store") {
  const source = Buffer.from(String(text));
  const compressed = compressBuffer(source, req, contentType);
  const headers = {
    ...SECURITY_HEADERS,
    "Content-Type": contentType,
    "Content-Length": compressed.body.length,
    "Cache-Control": cache,
  };
  if (compressed.encoding) {
    headers["Content-Encoding"] = compressed.encoding;
    headers.Vary = "Accept-Encoding";
  }
  res.writeHead(code, headers);
  if (req.method === "HEAD") return res.end();
  res.end(compressed.body);
}
const fail = (res, code, error) => send(res, code, { error });

function paginationFrom(searchParams, { defaultLimit = 48, maxLimit = 250 } = {}) {
  const requestedLimit = Number(searchParams.get("limit"));
  const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : defaultLimit));
  const requestedPage = Number(searchParams.get("page"));
  const page = Math.max(1, Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1);
  const offsetParam = searchParams.get("offset");
  const requestedOffset = offsetParam === null ? Number.NaN : Number(offsetParam);
  const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0
    ? Math.floor(requestedOffset)
    : (page - 1) * limit;
  return { limit, offset, page: Math.floor(offset / limit) + 1 };
}

function sendPage(res, items, { total, limit, offset, page }, searchParams) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const hasMore = offset + items.length < safeTotal;
  const meta = {
    total: safeTotal,
    limit,
    offset,
    page,
    pages: Math.max(1, Math.ceil(safeTotal / limit)),
    has_more: hasMore,
    next_offset: hasMore ? offset + items.length : null,
  };
  const headers = {
    "X-Total-Count": String(meta.total),
    "X-Page": String(meta.page),
    "X-Page-Size": String(meta.limit),
    "X-Has-More": String(meta.has_more),
  };
  // `meta=1` is the scalable contract. The default remains an array so the
  // existing website and mobile app continue to work during migration.
  if (searchParams.get("meta") === "1") return send(res, 200, { items, meta }, headers);
  return send(res, 200, items, headers);
}

function localStoreReadProxyAllowed(method, pathname) {
  if (!LOCAL_STORE_API_BASE || !["GET", "HEAD"].includes(method)) return false;
  return pathname === "/api/health"
    || pathname === "/api/settings"
    || pathname === "/api/search/smart"
    || pathname === "/api/recommendations"
    || pathname === "/api/products"
    || /^\/api\/products\/[a-z0-9-]+(?:\/reviews)?$/.test(pathname);
}

async function proxyLocalStoreRead(req, res) {
  const target = new URL(req.url, LOCAL_STORE_API_BASE);
  const upstream = await fetch(target, {
    method: req.method === "HEAD" ? "GET" : "GET",
    headers: { accept: "application/json" },
  });
  const responseHeaders = {
    ...SECURITY_HEADERS,
    ...corsHeaders(req),
    "Cache-Control": "no-store",
    "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
  };
  let body = req.method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await upstream.arrayBuffer());
  // The local storefront reads the production catalog, but site-builder
  // settings belong to this safe local snapshot until deployment is approved.
  if (req.method !== "HEAD" && target.pathname === "/api/settings") {
    try {
      const settings = JSON.parse(body.toString("utf8"));
      settings.site_config = getSetting("site_config") ?? "";
      body = Buffer.from(JSON.stringify(settings));
    } catch { /* Preserve the upstream response if it is not valid JSON. */ }
  }
  if (req.method !== "HEAD") {
    const compressed = compressBuffer(body, req, responseHeaders["Content-Type"]);
    body = compressed.body;
    if (compressed.encoding) {
      responseHeaders["Content-Encoding"] = compressed.encoding;
      responseHeaders.Vary = "Accept-Encoding";
    }
    responseHeaders["Content-Length"] = body.length;
  }
  res.writeHead(upstream.status, responseHeaders);
  res.end(req.method === "HEAD" ? undefined : body);
  return true;
}

/* Same-origin map tiles keep Leaflet compatible with the site's CSP and are
   cached on disk so repeat visits do not depend on a third-party round trip. */
const MAP_TILE_DIR = path.join(DATA_DIR, "map-tiles");
const MAP_TILE_UPSTREAMS = [
  (z, x, y) => `https://${"abcd"[(x + y) % 4]}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
  (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
];
async function serveMapTile(req, res, z, x, y) {
  const max = 2 ** z;
  if (z < 3 || z > 19 || x < 0 || y < 0 || x >= max || y >= max) return fail(res, 404, "not_found");
  const file = path.join(MAP_TILE_DIR, String(z), String(x), y + ".png");
  const headers = { "Content-Type": "image/png", "Cache-Control": "public, max-age=2592000, stale-while-revalidate=86400" };
  try {
    const buf = await fs.promises.readFile(file);
    return send(res, 200, buf, headers);
  } catch { /* not cached yet */ }
  for (const upstream of MAP_TILE_UPSTREAMS) {
    try {
      const response = await fetch(upstream(z, x, y), { headers: { "user-agent": "MilanaPremium-Site/1.0 (map tile cache)" } });
      if (!response.ok) continue;
      const buf = Buffer.from(await response.arrayBuffer());
      fs.promises.mkdir(path.dirname(file), { recursive: true })
        .then(() => fs.promises.writeFile(file, buf))
        .catch(() => {});
      return send(res, 200, buf, headers);
    } catch { /* try the fallback tile source */ }
  }
  return fail(res, 502, "tiles_unavailable");
}

let localStoreProductCache = { at: 0, products: [] };
async function localStoreProductById(id) {
  if (!LOCAL_STORE_API_BASE || !id) return null;
  const now = Date.now();
  if (!localStoreProductCache.products.length || now - localStoreProductCache.at > 30_000) {
    const upstream = await fetch(LOCAL_STORE_API_BASE + "/api/products?limit=1000", { headers: { accept: "application/json" } });
    if (!upstream.ok) return null;
    const products = await upstream.json();
    localStoreProductCache = { at: now, products: Array.isArray(products) ? products : [] };
  }
  return localStoreProductCache.products.find((p) => Number(p.id) === Number(id)) || null;
}

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

function detectUploadMedia(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", kind: "image" };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: "png", kind: "image" };
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return { ext: "webp", kind: "image" };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { ext: "webm", kind: "video" };
  if (buf.slice(4, 8).toString("latin1") === "ftyp") return { ext: "mp4", kind: "video" };
  const signature = buf.slice(0, 4).toString("latin1");
  if ((signature === "wOFF" || signature === "wOF2") && buf.length >= 48) {
    const declaredLength = buf.readUInt32BE(8);
    const tableCount = buf.readUInt16BE(12);
    if (declaredLength === buf.length && tableCount > 0 && tableCount <= 256) {
      return { ext: signature === "wOF2" ? "woff2" : "woff", kind: "font" };
    }
  }
  const sfnt = buf.length >= 12 && (
    signature === "OTTO"
    || (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00)
  );
  if (sfnt) {
    const tableCount = buf.readUInt16BE(4);
    if (tableCount > 0 && tableCount <= 256 && 12 + tableCount * 16 <= buf.length) {
      return { ext: signature === "OTTO" ? "otf" : "ttf", kind: "font" };
    }
  }
  return null;
}

function runMediaTool(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split(/\r?\n/).slice(-3).join(" ") || "media_optimizer_failed"));
    });
  });
}

function runCwebpTool(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(CWEBP_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split(/\r?\n/).slice(-3).join(" ") || "webp_optimizer_failed"));
    });
  });
}

function probeMediaSize(file) {
  if (!FFPROBE_AVAILABLE) return null;
  try {
    const result = spawnSync(FFPROBE_BIN, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0:s=x",
      file,
    ], { encoding: "utf8" });
    const match = String(result.stdout || "").trim().match(/^(\d+)x(\d+)$/);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  } catch {
    return null;
  }
}

function probeMediaRotation(file) {
  if (!FFPROBE_AVAILABLE) return 0;
  try {
    const result = spawnSync(FFPROBE_BIN, [
      "-v", "error",
      "-show_entries", "stream_tags=rotate:side_data=rotation",
      "-of", "default=nw=1",
      file,
    ], { encoding: "utf8" });
    const match = String(result.stdout || "").match(/(?:rotation|rotate)=(-?\d+)/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

function cwebpResizeArgs(file) {
  const size = probeMediaSize(file);
  if (!size) return [];
  const edge = Math.max(size.width, size.height);
  if (edge <= MEDIA_IMAGE_MAX_EDGE) return [];
  return size.width >= size.height
    ? ["-resize", String(MEDIA_IMAGE_MAX_EDGE), "0"]
    : ["-resize", "0", String(MEDIA_IMAGE_MAX_EDGE)];
}

function maxEdgeScaleFilter(maxEdge) {
  return `scale='if(gt(iw,ih),min(${maxEdge},iw),-2)':'if(gt(iw,ih),-2,min(${maxEdge},ih))':flags=lanczos`;
}

/* Card thumbnail: uploads/thumbs/<base>.webp, without upscaling. */
async function generateUploadThumb(sourcePath, name) {
  if (!CWEBP_AVAILABLE || !/\.(webp|png|jpe?g)$/i.test(name)) return;
  try {
    const thumbName = name.replace(/\.(png|jpe?g|webp)$/i, ".webp");
    const size = probeMediaSize(sourcePath);
    const resizeArgs = !size || size.width > MEDIA_THUMB_WIDTH ? ["-resize", String(MEDIA_THUMB_WIDTH), "0"] : [];
    await runCwebpTool([
      "-quiet",
      "-preset", "picture",
      "-q", String(MEDIA_THUMB_QUALITY),
      "-m", "6",
      "-sharp_yuv",
      ...resizeArgs,
      sourcePath,
      "-o", path.join(UPLOAD_THUMB_DIR, thumbName),
    ]);
  } catch {}
}

async function optimizeUploadedMedia({ originalPath, finalBase, ext, kind, originalBytes }) {
  if (kind === "font") {
    const name = `${finalBase}.${ext}`;
    fs.copyFileSync(originalPath, path.join(UPLOAD_DIR, name));
    return { name, kind, bytes: originalBytes, optimized: false, originalBytes, savedBytes: 0, reason: "font_validated" };
  }
  const toolAvailable = kind === "image" ? CWEBP_AVAILABLE : FFMPEG_AVAILABLE;
  if (!MEDIA_OPTIMIZE_ENABLED || !toolAvailable) {
    const name = `${finalBase}.${ext}`;
    fs.copyFileSync(originalPath, path.join(UPLOAD_DIR, name));
    return { name, kind, bytes: originalBytes, optimized: false, originalBytes, savedBytes: 0, reason: MEDIA_OPTIMIZE_ENABLED ? "optimizer_missing" : "disabled" };
  }

  const targetExt = kind === "video" ? "mp4" : "webp";
  const targetName = `${finalBase}.${targetExt}`;
  const targetPath = path.join(UPLOAD_WORK_DIR, targetName);
  try { fs.unlinkSync(targetPath); } catch {}

  try {
    if (kind === "image") {
      let imageSource = originalPath;
      let orientedPath = "";
      const rotation = probeMediaRotation(originalPath);
      if (rotation && FFMPEG_AVAILABLE) {
        orientedPath = path.join(UPLOAD_WORK_DIR, `${finalBase}-oriented.png`);
        try { fs.unlinkSync(orientedPath); } catch {}
        await runMediaTool([
          "-y", "-hide_banner", "-loglevel", "error",
          "-i", originalPath,
          "-vf", maxEdgeScaleFilter(MEDIA_IMAGE_MAX_EDGE),
          orientedPath,
        ]);
        imageSource = orientedPath;
      }
      await runCwebpTool([
        "-quiet",
        "-preset", "picture",
        "-q", String(MEDIA_IMAGE_QUALITY),
        "-m", "6",
        "-sharp_yuv",
        ...(orientedPath ? [] : cwebpResizeArgs(originalPath)),
        imageSource,
        "-o", targetPath,
      ]);
      if (orientedPath) {
        try { fs.unlinkSync(orientedPath); } catch {}
      }
    } else {
      await runMediaTool([
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", originalPath,
        "-vf", maxEdgeScaleFilter(MEDIA_VIDEO_MAX_EDGE),
        "-an",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", String(MEDIA_VIDEO_CRF),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        targetPath,
      ]);
    }

    const optimizedBytes = fs.statSync(targetPath).size;
    const acceptsOptimized = kind === "video"
      ? optimizedBytes > 1024 && optimizedBytes <= originalBytes * 1.15
      : optimizedBytes > 1024 && optimizedBytes < originalBytes * 0.98;
    if (acceptsOptimized) {
      fs.renameSync(targetPath, path.join(UPLOAD_DIR, targetName));
      if (kind === "image") await generateUploadThumb(path.join(UPLOAD_DIR, targetName), targetName);
      return {
        name: targetName,
        kind,
        bytes: optimizedBytes,
        optimized: true,
        originalBytes,
        savedBytes: Math.max(0, originalBytes - optimizedBytes),
      };
    }
  } catch {
    try { fs.unlinkSync(targetPath); } catch {}
  }

  const fallbackName = `${finalBase}.${ext}`;
  fs.copyFileSync(originalPath, path.join(UPLOAD_DIR, fallbackName));
  if (kind === "image") await generateUploadThumb(path.join(UPLOAD_DIR, fallbackName), fallbackName);
  return { name: fallbackName, kind, bytes: originalBytes, optimized: false, originalBytes, savedBytes: 0, reason: "kept_original" };
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
    const peer = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
    const forwardedHost = TRUSTED_PROXY_IPS.has(peer)
      ? String(req.headers["x-forwarded-host"] || "").split(",").at(-1).trim()
      : "";
    const host = String(forwardedHost || req.headers.host || "").toLowerCase();
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
function ipOf(req) {
  const peer = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  if (!TRUSTED_PROXY_IPS.has(peer)) return peer || "?";
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim().replace(/^::ffff:/, ""))
    .filter((value) => net.isIP(value))
    .at(-1);
  return forwarded || peer || "?";
}

/* ---------- sessions ---------- */
const SESSION_TTL = 30 * 24 * 3600 * 1000;
function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, created_at) VALUES (?,?)").run(sha256(token), Date.now());
  return token;
}
function createManagerSession(managerId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO manager_sessions (token, manager_id, created_at) VALUES (?,?,?)")
    .run(sha256(token), managerId, Date.now());
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
function managerFromRequest(req) {
  const token = parseCookies(req).sid;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = sha256(token);
  let row = db.prepare(`
    SELECT m.id, m.name, m.login, m.telegram_chat_id, m.telegram_thread_id,
           m.active, s.created_at
    FROM manager_sessions s
    JOIN managers m ON m.id=s.manager_id
    WHERE s.token=?
  `).get(tokenHash);
  if (!row) {
    row = db.prepare(`
      SELECT m.id, m.name, m.login, m.telegram_chat_id, m.telegram_thread_id,
             m.active, s.created_at
      FROM manager_sessions s
      JOIN managers m ON m.id=s.manager_id
      WHERE s.token=?
    `).get(token);
    if (row) db.prepare("UPDATE manager_sessions SET token=? WHERE token=?").run(tokenHash, token);
  }
  if (!row || !row.active || Date.now() - row.created_at > SESSION_TTL) {
    db.prepare("DELETE FROM manager_sessions WHERE token IN (?,?)").run(tokenHash, token);
    return null;
  }
  return row;
}
function staffFromRequest(req) {
  if (isAdmin(req)) return { role: "admin" };
  const manager = managerFromRequest(req);
  return manager ? { role: "manager", manager } : null;
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

async function createCustomerSession(customerId) {
  const token = crypto.randomBytes(32).toString("hex");
  if (postgresCommerce) await postgresCommerce.createCustomerSession(sha256(token), customerId, Date.now());
  else db.prepare("INSERT INTO customer_sessions (token, customer_id, created_at) VALUES (?,?,?)")
    .run(sha256(token), customerId, Date.now());
  return token;
}

async function customerFromRequest(req) {
  const auth = String(req.headers.authorization || "");
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const token = bearer || parseCookies(req).cid;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = sha256(token);
  if (postgresCommerce) return postgresCommerce.customerFromSession(tokenHash, Date.now() - SESSION_TTL);
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

async function verifyGoogleAccessToken(accessToken) {
  if (!GOOGLE_CLIENT_ID) throw new Error("google_not_configured");
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("bad_google_token");
  const tokenInfo = await fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(token));
  if (!tokenInfo.ok) throw new Error("bad_google_token");
  const info = await tokenInfo.json();
  if (info.aud !== GOOGLE_CLIENT_ID) throw new Error("bad_google_audience");
  if (!String(info.scope || "").split(/\s+/).includes("email")) throw new Error("bad_google_scope");
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!profileRes.ok) throw new Error("bad_google_profile");
  const profile = await profileRes.json();
  if (!profile.sub || !emailOk(normalizeEmail(profile.email))) throw new Error("bad_google_profile");
  if (profile.email_verified !== true && profile.email_verified !== "true") throw new Error("google_email_not_verified");
  return profile;
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

function firebaseCustomerProvider(payload) {
  const signInProvider = String(payload?.firebase?.sign_in_provider || "");
  if (signInProvider === "apple.com") return "apple";
  if (signInProvider === "google.com") return "google";
  return "firebase";
}

function termsAccepted(v) {
  return v === true || v === "true" || v === "on" || v === "1" || v === 1;
}

async function upsertCustomer({
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
  if (postgresCommerce) {
    return postgresCommerce.upsertCustomer({
      email: cleanEmail,
      name: str(name, 80), phone: str(phone, 25), city: str(city, 80), address: str(address, 300),
      account_type: cleanAccount || "business", approval_status: cleanApproval || "active",
      company_name: str(company_name, 140), tax_id: str(tax_id, 32), legal_address: str(legal_address, 300),
      contact_person: str(contact_person, 80), expected_volume: str(expected_volume, 80),
      business_license_url: str(business_license_url, 300), terms_accepted_at: str(terms_accepted_at, 40),
      phone_verified: Boolean(phone_verified), provider, provider_uid: str(provider_uid, 160), password_hash,
    });
  }
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
const CATS = ["pajamas", "robes", "homewear", "loungewear"]; // broad clothing type
const CATALOG_PANELS = CATALOG_PANEL_IDS;
const GENDERS = ["women", "men", "kids", "unisex"];
const TAGS = ["", "bestseller", "new", "sale"];
const COLLECTIONS = ["", "ss26"];
const ORDER_STATUSES = ["new", "processing", "shipped", "done", "cancelled"];
const PAYMENT_METHODS = ["manager", "cash", "bank", "click", "payme", "card"];
const PAYMENT_STATUSES = ["pending", "invoice_sent", "waiting_for_customer", "submitted", "paid", "failed", "refunded", "cancelled"];
const ORDER_STATUS_TRANSITIONS = {
  new: new Set(["new", "processing", "cancelled"]),
  processing: new Set(["processing", "shipped", "cancelled"]),
  shipped: new Set(["shipped", "done"]),
  done: new Set(["done"]),
  cancelled: new Set(["cancelled"]),
};
const PAYMENT_STATUS_TRANSITIONS = {
  pending: new Set(["pending", "invoice_sent", "waiting_for_customer", "submitted", "paid", "failed", "cancelled"]),
  invoice_sent: new Set(["invoice_sent", "waiting_for_customer", "submitted", "paid", "failed", "cancelled"]),
  waiting_for_customer: new Set(["waiting_for_customer", "invoice_sent", "submitted", "paid", "failed", "cancelled"]),
  submitted: new Set(["submitted", "waiting_for_customer", "paid", "failed", "cancelled"]),
  paid: new Set(["paid", "refunded"]),
  failed: new Set(["failed", "pending", "invoice_sent", "waiting_for_customer", "submitted", "cancelled"]),
  refunded: new Set(["refunded"]),
  cancelled: new Set(["cancelled"]),
};
const ORDER_CANCELLABLE_PAYMENT_STATUSES = new Set([
  "pending", "invoice_sent", "waiting_for_customer", "submitted", "failed", "cancelled", "refunded",
]);
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
const transitionAllowed = (matrix, from, to) => Boolean(matrix[from]?.has(to));

function stockAdjustmentsFromOrderItems(items) {
  const aggregate = new Map();
  const source = Array.isArray(items) ? items : [];
  for (const item of source) {
    const adjustment = item?.stock_adjustment;
    const id = Number(adjustment?.id);
    const type = adjustment?.type;
    const amount = type === "retail" ? Number(adjustment?.qty) : Number(adjustment?.qop);
    if (!Number.isInteger(id) || id <= 0 || !["retail", "wholesale"].includes(type)
      || !Number.isFinite(amount) || amount <= 0 || (type === "retail" && !Number.isInteger(amount))) continue;
    const key = `${type}:${id}`;
    const current = aggregate.get(key) || { type, id, qty: 0, qop: 0 };
    if (type === "retail") current.qty += amount;
    else current.qop = Math.round((current.qop + amount) * 1000) / 1000;
    aggregate.set(key, current);
  }
  return [...aggregate.values()];
}

function parseOrderItems(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function restoreSqliteStock(items) {
  const released = { retail: 0, qop: 0 };
  for (const adjustment of stockAdjustmentsFromOrderItems(items)) {
    if (adjustment.type === "retail") {
      const result = db.prepare("UPDATE products SET retail_stock=retail_stock+? WHERE id=?")
        .run(adjustment.qty, adjustment.id);
      if (result.changes) released.retail += adjustment.qty;
    } else {
      const result = db.prepare("UPDATE products SET available_qop=available_qop+? WHERE id=? AND available_qop IS NOT NULL")
        .run(adjustment.qop, adjustment.id);
      if (result.changes) released.qop += adjustment.qop;
    }
  }
  return released;
}

function normalizePromoCode(v) {
  return str(v, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

function publicCoupon(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    title: row.title || row.code,
    description: row.description || "",
    discount_type: row.discount_type || "percent",
    value: Math.max(0, Number(row.value) || 0),
    min_total: Math.max(0, Number(row.min_total) || 0),
    status: row.status || "active",
    source: row.source || "promo",
    assigned_at: row.assigned_at || "",
    redeemed_at: row.redeemed_at || "",
    expires_at: row.expires_at || "",
  };
}

function ensureDefaultPromoCodes() {
  db.prepare(`
    INSERT OR IGNORE INTO promo_codes
      (code, title, description, discount_type, value, min_total, usage_limit, per_customer_limit, starts_at, expires_at, active)
    VALUES
      ('WELCOME10', 'Welcome coupon', '10% off your next Milana order.', 'percent', 10, 0, 0, 1, datetime('now'), datetime('now', '+365 days'), 1)
  `).run();
}

function promoIsUsable(promo) {
  if (!promo || !Number(promo.active)) return false;
  const now = Date.now();
  if (promo.starts_at && Date.parse(promo.starts_at) > now) return false;
  if (promo.expires_at && Date.parse(promo.expires_at) < now) return false;
  return true;
}

async function couponsForCustomer(customerId) {
  if (postgresCommerce) return (await postgresCommerce.couponsForCustomer(customerId)).map(publicCoupon);
  return db.prepare(`
    SELECT *
    FROM customer_coupons
    WHERE customer_id=?
    ORDER BY
      CASE status WHEN 'active' THEN 0 WHEN 'reserved' THEN 1 WHEN 'used' THEN 2 ELSE 3 END,
      COALESCE(NULLIF(expires_at,''), '9999-12-31') ASC,
      id DESC
  `).all(customerId).map(publicCoupon);
}

async function assignCouponToCustomer(customer, promo, source = "promo") {
  const code = normalizePromoCode(promo.code);
  if (postgresCommerce) return postgresCommerce.assignCoupon(customer.id, { ...promo, code }, source);
  const existing = db.prepare("SELECT * FROM customer_coupons WHERE customer_id=? AND code=?").get(customer.id, code);
  if (existing) return existing;
  const r = db.prepare(`
    INSERT INTO customer_coupons
      (customer_id, promo_id, code, title, description, discount_type, value, min_total, status, source, expires_at, metadata)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    customer.id,
    promo.id || null,
    code,
    promo.title || code,
    promo.description || "",
    promo.discount_type || "percent",
    Math.max(0, Number(promo.value) || 0),
    Math.max(0, Number(promo.min_total) || 0),
    "active",
    source,
    promo.expires_at || "",
    JSON.stringify({ assigned_by: source })
  );
  return db.prepare("SELECT * FROM customer_coupons WHERE id=?").get(r.lastInsertRowid);
}

async function ensureCustomerWelcomeCoupon(customer) {
  if (!customer) return null;
  if (postgresCommerce) {
    const promo = await postgresCommerce.promoByCode("WELCOME10");
    if (!promo || !promoIsUsable(promo)) return null;
    return assignCouponToCustomer(customer, promo, "welcome");
  }
  const promo = db.prepare("SELECT * FROM promo_codes WHERE code='WELCOME10'").get();
  if (!promo || !promoIsUsable(promo)) return null;
  return assignCouponToCustomer(customer, promo, "welcome");
}

async function customerOrderSummary(customerId, limit = 6) {
  const rows = postgresCommerce ? await postgresCommerce.customerOrderSummary(customerId, limit) : db.prepare(`
    SELECT id, number, status, order_type, tracking_number, items, total, lang, created_at, updated_at
    FROM orders
    WHERE customer_id=?
    ORDER BY id DESC
    LIMIT ?
  `).all(customerId, limit);
  return rows.map((row) => {
    let items = [];
    if (Array.isArray(row.items)) items = row.items;
    else try { items = JSON.parse(row.items || "[]"); } catch {}
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      order_type: row.order_type || "wholesale",
      tracking_number: row.tracking_number || "",
      total: Number(row.total) || 0,
      lang: row.lang || "en",
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
      item_count: Array.isArray(items) ? items.reduce((n, item) => n + (Number(item.qty) || 0), 0) : 0,
    };
  });
}

ensureDefaultPromoCodes();

const TELEGRAM_BOT_TOKEN = str(process.env.TELEGRAM_BOT_TOKEN || "", 200);
const TELEGRAM_ORDER_CHAT_ID = str(process.env.TELEGRAM_ORDER_CHAT_ID || "", 80);
const TELEGRAM_ORDER_THREAD_ID = str(process.env.TELEGRAM_ORDER_THREAD_ID || "", 30);
const TELEGRAM_API_BASE = str(process.env.TELEGRAM_API_BASE || "https://api.telegram.org", 500).replace(/\/+$/, "");
const TELEGRAM_ORDERS_ENABLED = process.env.TELEGRAM_ORDERS_ENABLED !== "0" && Boolean(TELEGRAM_BOT_TOKEN);

function truncateTelegram(text) {
  return text.length <= 3900 ? text : text.slice(0, 3880) + "\n...truncated";
}

function formatTelegramOrder({ number, customer, items, total, orderType, paymentMethod, source, lang, manager }) {
  const orderTypeLabel = orderType === "retail" ? "chakana" : "ulgurji";
  const paymentLabel = paymentMethod === "bank" ? "bank" : paymentMethod === "cash" ? "naqd" : "menejer orqali";
  const hasPendingPrice = items.some((item) => item.price_pending);
  const lines = [
    `Yangi Milana buyurtmasi ${number}`,
    `Manba: ${source || "website"} · Til: ${lang || "uz"} · Tur: ${orderTypeLabel}`,
    `Menejer: ${manager?.name || customer.assigned_manager || "-"}`,
    `Mijoz: ${customer.name || "-"}`,
    `Telefon: ${customer.phone || "-"}`,
  ];
  if (customer.customer_tier) lines.push(`Mijoz turi: ${customer.customer_tier}`);
  if (customer.assigned_manager) lines.push(`Biriktirilgan menejer: ${customer.assigned_manager}`);
  if (customer.email) lines.push(`Email: ${customer.email}`);
  if (customer.city || customer.address) lines.push(`Manzil: ${[customer.city, customer.address].filter(Boolean).join(", ")}`);
  if (customer.postcode) lines.push(`Pochta indeksi: ${customer.postcode}`);
  if (customer.delivery_note) lines.push(`Yetkazish izohi: ${customer.delivery_note}`);
  if (customer.comment) lines.push(`Izoh: ${customer.comment}`);
  lines.push("", "Mahsulotlar:");
  items.forEach((item, idx) => {
    const mix = (item.size_mix || []).map((m) => `${m.size}x${m.qty}`).join(", ");
    lines.push(`${idx + 1}. ${item.name}`);
    const unit = item.unit_type === "piece" ? "dona" : item.unit_type === "pachka" ? "qadoq" : "qop";
    const packLabel = item.unit_type === "piece" ? "dona" : item.unit_type === "pachka" ? "qadoq" : "qop";
    if (item.color) lines.push(`   Rang: ${item.color}`);
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
  if (!TELEGRAM_ORDERS_ENABLED || !order.manager?.telegram_chat_id) return { skipped: true };
  const body = {
    chat_id: order.manager.telegram_chat_id,
    text: formatTelegramOrder(order),
    disable_web_page_preview: true,
  };
  if (/^\d+$/.test(order.manager.telegram_thread_id || "")) body.message_thread_id = Number(order.manager.telegram_thread_id);
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
    audit("system", "telegram.order_sent", {
      number: order.number,
      manager_id: order.manager?.id || null,
      message_id: result?.result?.message_id || result?.message_id || "",
    });
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
    WHERE status='approved' AND verified_purchase=1 AND product_id=? AND product_slug=?
  `).get(Number(productId) || 0, str(slug, 120));
  return { count: Number(row?.count || 0), avg: Number(row?.avg || 0) };
}

function likeCount(productId, slug) {
  return Number(db.prepare(`
    SELECT COUNT(*) count FROM likes WHERE product_id=? OR product_slug=?
  `).get(Number(productId) || 0, str(slug, 120))?.count || 0);
}

function productColors(p) {
  /* приоритет: отдельное поле «Цвет», затем массив, затем вариант (совместимость со старыми записями) */
  const raw = p.color ? [p.color] : (Array.isArray(p.colors) && p.colors.length ? p.colors : String(p.variant || "").split(/[,;|]/));
  return raw.map((color) => str(color, 80)).filter(Boolean).slice(0, 12);
}

function decorateProduct(p) {
  const summary = reviewSummary(p.id, p.slug);
  // Approved reviews are the only public source of rating data. Imported and
  // seeded catalog rows historically contained a placeholder 4.8 value, which
  // must never be presented as customer feedback.
  const reviews = summary.count;
  const rating = reviews ? Math.round(summary.avg * 10) / 10 : 0;
  const wholesale = Number(p.wholesale_price || p.price || 0);
  const retail = Number(p.retail_price || p.price || wholesale || 0);
  const colors = productColors(p);
  return {
    ...p,
    price: wholesale,
    colors,
    wholesale_price: wholesale,
    wholesale_moq: packPieces(p.sizes, p.gender, p.category),
    in_stock: p.active !== false && Number(p.active) !== 0,   /* false — товар под заказ */
    retail_enabled: p.retail_enabled !== false && Number(p.retail_enabled) !== 0,
    retail_price: retail,
    retail_stock: Math.max(0, Math.round(Number(p.retail_stock) || 0)),
    available_qop: p.available_qop == null || p.available_qop === ""
      ? null
      : Math.max(0, Math.round((Number(p.available_qop) || 0) * 1000) / 1000),
    like_count: likeCount(p.id, p.slug),
    views: Math.max(0, Number(p.views) || 0),
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
  const discount = contractDiscount(customer);
  const unit = Math.round(base * (1 - discount / 100) * 100) / 100;
  return {
    visible: true,
    unit,
    base,
    discount,
    source: discount ? "customer_discount" : "public_catalog",
    label: customer ? normalizeCustomerTier(customer.customer_tier) : "public",
    assigned_manager: customer?.assigned_manager || "",
  };
}

function packPriceForCustomer(product, customer) {
  const wholesale = priceForCustomer(product, customer, "wholesale");
  const retail = priceForCustomer(product, customer, "retail");
  const rawMarkup = getSetting("pack_markup");
  const markup = rawMarkup == null || rawMarkup === "" ? 0 : Number(rawMarkup);
  const safeMarkup = Number.isFinite(markup) ? Math.max(0, Math.min(200, markup)) : 0;
  if (retail.unit > wholesale.unit) {
    return { ...retail, source: "retail_price", pack_markup: safeMarkup };
  }
  return {
    ...wholesale,
    unit: Math.round(wholesale.unit * (1 + safeMarkup / 100) * 100) / 100,
    source: safeMarkup ? "pack_markup" : wholesale.source,
    pack_markup: safeMarkup,
  };
}

function productForCustomer(product, customer, orderType = "wholesale") {
  const effectiveOrderType = customer?.account_type === "individual" ? "retail" : orderType;
  const pricing = priceForCustomer(product, customer, effectiveOrderType);
  const wholesale = priceForCustomer(product, customer, "wholesale");
  const retail = priceForCustomer(product, customer, "retail");
  return {
    ...product,
    price: pricing.unit,
    wholesale_price: wholesale.unit,
    retail_price: retail.unit,
    old_price: product.old_price,
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
    catalog_panel: inferCatalogPanel({ ...row, gender: meta.gender, category, name }),
    product_type: inferProductType({ ...row, gender: meta.gender, category, name }),
    price,
    old_price: null,
    sizes: parseCatalogSizes(text),
    images: image ? [image] : [],
    tag: isSale ? "sale" : "",
    rating: 0,
    reviews: 0,
    active: true,
    sort: 1_000_000 - (Number(row.page) || 0) * 100 - (Number(row.card_index) || 0),
    desc: { en: text, ru: text, uz: text },
    fabric: { en: fabric, ru: fabric, uz: fabric },
    colors: [],
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
    p.name, p.slug, p.model_no, p.variant, p.gender, p.category, p.catalog_panel, p.product_type, p.tag,
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
    } else if (p.gender === token || p.category === token || p.catalog_panel === token) {
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

/* другие варианты той же модели: TJ-2182 → V-4607, V-4608, V-4609 */
function modelVariants(product) {
  const model = String(product?.model_no || "").trim();
  if (!model) return [];
  const rows = db.prepare(
    `SELECT id, slug, variant, color, images, active FROM products
     WHERE LOWER(TRIM(model_no)) = LOWER(?) AND ${CATALOG_VISIBLE_SQL}
     ORDER BY TRIM(variant), id LIMIT 24`
  ).all(model);
  if (rows.length < 2) return [];
  return rows.map((r) => {
    let images = [];
    try { images = JSON.parse(r.images || "[]") || []; } catch (e) { images = []; }
    return {
      id: r.id,
      slug: r.slug,
      variant: r.variant || "",
      color: r.color || "",
      image: images[0] || "",
      in_stock: !!r.active,
    };
  });
}

function publicProductCard(p, extra = {}) {
  return {
    ...p,
    images: (p.images || []).slice(0, 12),
    fabric: p.fabric,
    order_units: orderUnitsFor(p),
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

/* The admin's active flag is authoritative: hidden products must not leak into
   catalog/search/review/checkout routes merely because they still have images. */
const CATALOG_VISIBLE_SQL = "active=1";

async function activeProductsForCatalog(forceCatalogRefresh = false) {
  const localProducts = postgresCatalog
    ? (await postgresCatalog.list({ activeOnly: true, limit: 1000, offset: 0 })).rows.map((r) => rowToProduct(r))
    : db.prepare(`SELECT * FROM products WHERE ${CATALOG_VISIBLE_SQL} ORDER BY sort DESC, id DESC LIMIT 2000`).all().map((r) => rowToProduct(r));
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function escapeXml(value) {
  return escapeHtml(value);
}

function plainMetaText(value, fallback = "") {
  const text = String(value || fallback || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= 160) return text;
  return text.slice(0, 157).replace(/\s+\S*$/, "") + "…";
}

function absoluteSiteUrl(value = "/") {
  try { return new URL(String(value || "/"), SITE_ORIGIN + "/").href; }
  catch { return SITE_ORIGIN + "/"; }
}

function jsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

async function activeProductBySlug(slug) {
  const row = postgresCatalog
    ? await postgresCatalog.getBySlug(slug, true)
    : db.prepare(`SELECT * FROM products WHERE slug=? AND ${CATALOG_VISIBLE_SQL}`).get(slug);
  if (row) return rowToProduct(row);
  if (!CATALOG_SOURCE_ENABLED) return null;
  try {
    const product = await catalogProductBySlug(slug);
    return product && product.active !== false ? product : null;
  } catch (error) {
    catalogCache.error = error.message;
    console.error("Catalog product lookup failed for SEO:", error.message);
    return null;
  }
}

function productSeo(product) {
  const url = absoluteSiteUrl(`/p/${encodeURIComponent(product.slug)}`);
  const productName = localizedProductType(product, "uz");
  const identifiers = [str(product.model_no, 80), str(product.variant, 80)]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const model = identifiers.join(" · ");
  const displayName = `${productName}${model ? ` ${model}` : ""}`;
  const title = `${displayName} — MILANA PREMIUM`;
  const description = plainMetaText(
    product.desc?.uz || product.desc?.en || product.desc?.ru,
    `${productName} — Milana Premium ulgurji kiyim katalogi.`,
  );
  const images = (product.images || []).filter(Boolean).map(absoluteSiteUrl);
  const image = images[0] || absoluteSiteUrl("/assets/hero-poster.jpg");
  const price = Number(product.wholesale_price || product.price || 0);
  const currency = String(product.currency || "USD").toUpperCase();
  const preorder = product.preorder === true || product.in_stock === false;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: displayName,
    description,
    image: images.length ? images : [image],
    sku: identifiers.join("-") || String(product.id),
    category: product.product_type || inferProductType(product) || product.category || "Clothing",
    brand: { "@type": "Brand", name: "MILANA PREMIUM" },
    url,
  };
  if (price > 0) {
    schema.offers = {
      "@type": "Offer",
      url,
      price,
      priceCurrency: currency,
      availability: preorder
        ? "https://schema.org/PreOrder"
        : Number(product.available_qop) === 0
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "MILANA PREMIUM" },
    };
  }
  if (Number(product.reviews) > 0 && Number(product.rating) > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(product.rating),
      reviewCount: Number(product.reviews),
    };
  }
  return { url, title, description, image, price, currency, schema };
}

function renderProductDocument(template, product) {
  const seo = productSeo(product);
  const tags = [
    `<link rel="canonical" href="${escapeHtml(seo.url)}">`,
    '<meta property="og:locale" content="uz_UZ">',
    '<meta property="og:site_name" content="MILANA PREMIUM">',
    '<meta property="og:type" content="product">',
    `<meta property="og:title" content="${escapeHtml(seo.title)}">`,
    `<meta property="og:description" content="${escapeHtml(seo.description)}">`,
    `<meta property="og:url" content="${escapeHtml(seo.url)}">`,
    `<meta property="og:image" content="${escapeHtml(seo.image)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(seo.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(seo.image)}">`,
    seo.price > 0 ? `<meta property="product:price:amount" content="${escapeHtml(seo.price)}">` : "",
    seo.price > 0 ? `<meta property="product:price:currency" content="${escapeHtml(seo.currency)}">` : "",
    `<script id="product-jsonld" type="application/ld+json">${jsonForHtml(seo.schema)}</script>`,
  ].filter(Boolean).join("\n  ");
  return template
    .replace(/<html lang="[^"]*">/, '<html lang="uz">')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(seo.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(seo.description)}">`)
    .replace("</head>", `  ${tags}\n</head>`);
}

function sitemapDate(product) {
  const date = new Date(product.updated_at || product.created_at || "");
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

async function sitemapXml() {
  const staticPaths = ["/", "/shop", "/ordering", "/support", "/terms"];
  const products = await activeProductsForCatalog();
  const urls = staticPaths.map((pathname) => ({ loc: absoluteSiteUrl(pathname), lastmod: "" }))
    .concat(products.map((product) => ({
      loc: absoluteSiteUrl(`/p/${encodeURIComponent(product.slug)}`),
      lastmod: sitemapDate(product),
    })));
  const entries = urls.map(({ loc, lastmod }) =>
    `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

async function adminProductsForCatalog(forceCatalogRefresh = false) {
  const localProducts = postgresCatalog
    ? (await postgresCatalog.list({ limit: 2500, offset: 0 })).rows.map((r) => rowToProduct(r))
    : db.prepare("SELECT * FROM products ORDER BY sort DESC, id DESC LIMIT 2500").all().map((r) => rowToProduct(r));
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

function localProductImageDataUrl(imageUrl) {
  const pathname = String(imageUrl || "").split(/[?#]/, 1)[0];
  const roots = pathname.startsWith("/uploads/")
    ? { prefix: "/uploads/", dir: UPLOAD_DIR }
    : pathname.startsWith("/assets/")
      ? { prefix: "/assets/", dir: path.join(PUBLIC_DIR, "assets") }
      : null;
  if (!roots) throw new Error("image_not_local");
  let relative;
  try { relative = decodeURIComponent(pathname.slice(roots.prefix.length)); }
  catch { throw new Error("image_invalid"); }
  const file = path.resolve(roots.dir, relative);
  const root = path.resolve(roots.dir) + path.sep;
  if (!file.startsWith(root) || !fs.existsSync(file)) throw new Error("image_not_found");
  const bytes = fs.readFileSync(file);
  if (bytes.length > 20 * 1024 * 1024) throw new Error("image_too_large");
  const media = detectUploadMedia(bytes);
  if (!media || media.kind !== "image") throw new Error("image_required");
  const mime = media.ext === "jpg" ? "image/jpeg" : `image/${media.ext}`;
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function openAiProductDescriptions(body) {
  if (!OPENAI_ASSISTANT_ENABLED) throw new Error("openai_not_configured");
  const imageUrls = (Array.isArray(body.images) ? body.images : [body.image])
    .map((value) => str(value, 300))
    .filter(Boolean)
    .filter((value) => !/\.(mp4|webm)(?:[?#]|$)/i.test(value))
    .slice(0, 3);
  if (!imageUrls.length) throw new Error("image_required");
  const imageParts = imageUrls.map((value) => ({
    type: "input_image",
    image_url: localProductImageDataUrl(value),
    detail: "high",
  }));
  const context = {
    current_name: str(body.name, 120),
    model: str(body.model_no, 40),
    variant: str(body.variant, 60),
    category: CATS.includes(body.category) ? body.category : "",
    gender: GENDERS.includes(body.gender) ? body.gender : "",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
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
        max_output_tokens: 700,
        text: {
          format: {
            type: "json_schema",
            name: "product_photo_descriptions",
            strict: true,
            schema: {
              type: "object",
              properties: {
                product_type: {
                  type: "string",
                  enum: PRODUCT_TYPE_IDS,
                },
                facts: {
                  type: "object",
                  properties: {
                    color: {
                      type: "string",
                      enum: ["", "black", "white", "gray", "beige", "brown", "red", "raspberry", "pink", "orange", "yellow", "green", "blue", "light_blue", "purple"],
                    },
                    pattern: {
                      type: "string",
                      enum: ["", "plaid", "striped", "floral", "polka_dot", "animal", "printed"],
                    },
                    sleeve: {
                      type: "string",
                      enum: ["", "sleeveless", "short", "three_quarter", "long"],
                    },
                    neckline: {
                      type: "string",
                      enum: ["", "collared", "v_neck", "round"],
                    },
                    closure: {
                      type: "string",
                      enum: ["", "buttons", "zipper"],
                    },
                    details: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["waist_belt", "lace", "ruffle", "pockets", "hood", "embroidery"],
                      },
                    },
                    pieces: { type: "integer", minimum: 0, maximum: 4 },
                  },
                  required: ["color", "pattern", "sleeve", "neckline", "closure", "details", "pieces"],
                  additionalProperties: false,
                },
              },
              required: ["product_type", "facts"],
              additionalProperties: false,
            },
          },
        },
        input: [
          {
            role: "developer",
            content: [
              "Write an accurate clothing product description from the supplied product photos.",
              "First identify the main garment type from the photo. Use exactly one product_type from: " + PRODUCT_TYPE_IDS.join(", ") + ".",
              "Return only the structured visible facts defined by the schema. Use an empty string or empty array when a fact is hidden or uncertain.",
              "Identify garment type or set pieces, color, print, neckline or collar, sleeves, closure, and visible decorative details.",
              "Use the metadata only as supporting context. The photos are the source of truth.",
              "Do not guess fabric, fiber composition, comfort, quality, season, fit, performance, age, brand, price, sizes, stock, packaging, Qadoq, Qop, or shipping.",
              "Do not claim a detail that is hidden or uncertain. Do not use promotional superlatives.",
              "Return JSON matching the supplied schema.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: `Product context: ${JSON.stringify(context)}` },
              ...imageParts,
            ],
          },
        ],
      }),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error("openai_" + response.status + ": " + raw.slice(0, 220));
    const parsed = parseAssistantJson(responseText(JSON.parse(raw)));
    const facts = parsed?.facts;
    if (!PRODUCT_TYPE_IDS.includes(parsed?.product_type) || !facts || !Array.isArray(facts.details)) {
      throw new Error("openai_bad_response");
    }
    const normalizedFacts = { ...facts, product_type: parsed.product_type };
    return {
      product_type: parsed.product_type,
      names: {
        ru: localizedProductType({ product_type: parsed.product_type }, "ru"),
        uz: localizedProductType({ product_type: parsed.product_type }, "uz"),
        en: localizedProductType({ product_type: parsed.product_type }, "en"),
      },
      desc: {
        ru: descriptionFromFacts(normalizedFacts, "ru"),
        uz: descriptionFromFacts(normalizedFacts, "uz"),
        en: descriptionFromFacts(normalizedFacts, "en"),
      },
    };
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

async function uniqueCatalogSlug(base, ignoreId = 0) {
  if (!postgresCatalog) return uniqueSlug(base, ignoreId);
  let slug = base;
  let i = 2;
  while (await postgresCatalog.slugExists(slug, ignoreId)) slug = `${base}-${i++}`;
  return slug;
}

const PRODUCT_COPY_LABELS = {
  en: {
    genders: { women: "women", men: "men", kids: "kids", unisex: "unisex" },
    categories: { pajamas: "Pajamas", robes: "Robes", homewear: "Homewear", loungewear: "Loungewear" },
    text: ({ name, gender, model, variant, sizes, price }) =>
      `${name} for ${gender}. Model ${model}${variant ? `, ${variant}` : ""}. Sizes: ${sizes}. Wholesale orders start from 1 pack (6 pcs, 1 per size) or 1 bag (60 pcs, 10 per size). Availability is confirmed by a manager.${price ? ` Unit price: ${price}.` : ""}`,
  },
  ru: {
    genders: { women: "женский", men: "мужской", kids: "детский", unisex: "унисекс" },
    categories: { pajamas: "Пижамы", robes: "Халаты", homewear: "Домашняя одежда", loungewear: "Лаунж-сеты" },
    text: ({ name, gender, model, variant, sizes, price }) =>
      `${name}, ${gender}. Модель ${model}${variant ? `, ${variant}` : ""}. Размеры: ${sizes}. Оптовый заказ от 1 упаковки (6 шт., по 1 на размер) или 1 мешка (60 шт., по 10 на размер). Наличие подтверждает менеджер.${price ? ` Цена за 1 шт.: ${price}.` : ""}`,
  },
  uz: {
    genders: { women: "ayollar", men: "erkaklar", kids: "bolalar", unisex: "uniseks" },
    categories: { pajamas: "pijama", robes: "xalat", homewear: "uy kiyimi", loungewear: "lounge to'plam" },
    text: ({ name, category, gender, model, variant, sizes, price }) =>
      `${name} — ${gender} uchun ${category}. Model ${model}${variant ? `, variant ${variant}` : ""}. O'lchamlar: ${sizes}. Ulgurji buyurtma kamida 1 Qadoq (6 dona, har o'lchamdan 1 tadan) yoki 1 Qop (60 dona, har o'lchamdan 10 tadan); mavjudlik va jo'natishni menejer tasdiqlaydi.${price ? ` 1 dona narxi: ${price}.` : ""}`,
  },
};

const PRODUCT_TYPE_COPY = {
  en: {
    tunic: "Tunic", sarochka: "Nightgown", robe: "Robe", pajamas: "Pajamas",
    set: "Set", tracksuit: "Tracksuit", hoodie: "Hoodie", dress: "Dress",
    shirt: "Shirt", polo: "Polo", trousers: "Trousers", tshirt: "T-shirt",
    shorts: "Shorts", top: "Top",
  },
  ru: {
    tunic: "Туника", sarochka: "Сорочка", robe: "Халат", pajamas: "Пижама",
    set: "Комплект", tracksuit: "Спортивный костюм", hoodie: "Худи", dress: "Платье",
    shirt: "Рубашка", polo: "Поло", trousers: "Штаны", tshirt: "Футболка",
    shorts: "Шорты", top: "Майка",
  },
  uz: {
    tunic: "Tunika", sarochka: "Sarochka", robe: "Xalat", pajamas: "Pijama",
    set: "To‘plam", tracksuit: "Sport kostyum", hoodie: "Hudi", dress: "Ko‘ylak",
    shirt: "Ko‘ylak", polo: "Polo", trousers: "Ishton", tshirt: "Futbolka",
    shorts: "Shortik", top: "Mayka",
  },
};

function localizedProductType(product, lang = "uz") {
  const type = inferProductType(product);
  return PRODUCT_TYPE_COPY[lang]?.[type]
    || PRODUCT_TYPE_COPY.en[type]
    || String(product.name || "Milana");
}

function productCopyPrice(p) {
  const price = Number(p.wholesale_price || p.price || 0);
  return price > 0 ? `$${price.toFixed(2)}` : "";
}

function defaultProductDescription(p, lang) {
  const productType = inferProductType(p);
  return descriptionFromFacts(visibleFacts(p, productType), lang);
}

function normalizeProductLocalizedCopy(p) {
  p.desc = {
    en: defaultProductDescription(p, "en"),
    ru: defaultProductDescription(p, "ru"),
    uz: defaultProductDescription(p, "uz"),
  };
  p.fabric = {
    en: localizedMaterial(p, "en"),
    ru: localizedMaterial(p, "ru"),
    uz: localizedMaterial(p, "uz"),
  };
  p.care = {
    en: localizedCare(p, "en"),
    ru: localizedCare(p, "ru"),
    uz: localizedCare(p, "uz"),
  };
  return p;
}

function rowToProduct(r, lite = false) {
  const arrayValue = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try { return JSON.parse(value); } catch { return []; }
  };
  const p = decorateProduct({
    id: r.id, slug: r.slug, name: r.name,
    name_i18n: { ru: r.name, en: r.name_en || r.name, uz: r.name_uz || r.name },
    model_no: r.model_no || "", variant: r.variant || "", gender: r.gender || "unisex", category: r.category,
    catalog_panel: CATALOG_PANELS.includes(r.catalog_panel) ? r.catalog_panel : inferCatalogPanel(r),
    product_type: inferProductType(r),
    price: r.price, old_price: r.old_price,
    wholesale_price: r.wholesale_price || r.price,
    wholesale_moq: ORDER_PACHKA_SIZE,
    retail_enabled: r.retail_enabled,
    retail_price: r.retail_price || r.price,
    retail_stock: r.retail_stock || 0,
    available_qop: r.available_qop,
    like_count: r.like_count || 0,
    sizes: arrayValue(r.sizes), images: arrayValue(r.images),
    tag: r.tag, collection: r.collection || "", size_chart: r.size_chart || "", color: r.color || "", country: r.country || "", material: r.material || "", season: r.season || "", composition: r.composition || "", rating: r.rating, reviews: r.reviews, views: r.views || 0, active: !!r.active, sort: r.sort,
  });
  if (lite) {
    p.images = p.images.slice(0, 2);
    p.fabric = { en: r.fabric_en, ru: r.fabric_ru, uz: r.fabric_uz };
    return p;
  }
  p.desc = { en: r.desc_en, ru: r.desc_ru, uz: r.desc_uz };
  p.fabric = { en: r.fabric_en, ru: r.fabric_ru, uz: r.fabric_uz };
  p.created_at = r.created_at;
  return normalizeProductLocalizedCopy(p);
}

function validateProduct(b) {
  const name = str(b.name, 120);
  const size_chart = str(b.size_chart, 4000);
  const color = str(b.color, 60);
  const country = str(b.country, 60);
  const material = str(b.material, 120);
  const season = str(b.season, 60);
  const composition = str(b.composition, 200);
  if (name.length < 2) throw new Error("name");
  if (!CATS.includes(b.category)) throw new Error("category");
  const gender = GENDERS.includes(b.gender) ? b.gender : "unisex";
  const catalog_panel = CATALOG_PANELS.includes(b.catalog_panel)
    ? b.catalog_panel
    : inferCatalogPanel({ ...b, gender });
  const product_type = PRODUCT_TYPE_IDS.includes(b.product_type)
    ? b.product_type
    : inferProductType(b);
  const model_no = str(b.model_no, 40);
  const variant = str(b.variant, 60);
  /* цена одна: столбец price оставлен для совместимости и хранит ту же оптовую цену */
  const price = Number(b.wholesale_price || b.price);
  if (!(price > 0 && price < 1e9)) throw new Error("price");
  const wholesale_price = price;
  const retail_enabled = b.retail_enabled === false ? 0 : 1;
  const retail_price = Number(b.retail_price || b.price);
  if (retail_enabled && !(retail_price > 0 && retail_price < 1e9)) throw new Error("retail_price");
  const retail_stock = Math.max(0, Math.min(1e6, Math.round(Number(b.retail_stock) || 0)));
  const available_qop = b.available_qop === null || b.available_qop === "" || b.available_qop === undefined
    ? null
    : Math.max(0, Math.min(1e6, Math.round((Number(b.available_qop) || 0) * 1000) / 1000));
  let old_price = b.old_price === null || b.old_price === "" || b.old_price === undefined ? null : Number(b.old_price);
  if (old_price !== null && !(old_price > 0 && old_price < 1e9)) throw new Error("old_price");
  const sizes = Array.isArray(b.sizes) ? b.sizes.map((s) => str(s, 8)).filter(Boolean).slice(0, 12) : [];
  const wholesale_moq = packPieces(sizes, gender, b.category);
  const images = (Array.isArray(b.images) ? b.images : [])
    .map((u) => str(u, 300))
    .filter((u) => (
      (/^\/(uploads|assets)\/[\w\-./%]+$/.test(u) && !u.includes("..")) ||
      /^https:\/\/[\w.-]+\/[\w\-./%?=&:]+$/.test(u)
    ))
    .slice(0, 12);
  const tag = TAGS.includes(b.tag) ? b.tag : "";
  const collection = COLLECTIONS.includes(b.collection) ? b.collection : "";
  const rating = Math.min(5, Math.max(0, Number(b.rating) || 0));
  const reviews = Math.min(1e6, Math.max(0, Math.round(Number(b.reviews) || 0)));
  return {
    name, size_chart, color, country, material, season, composition, model_no, variant, gender, category: b.category, catalog_panel, product_type, price: wholesale_price, old_price, tag, collection, rating, reviews,
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
  "hero_type", "hero_image", "hero_video", "hero_poster", "accent", "accent_dark",
  "hero_gap",
  "pack_markup", "preorder_min", "preorder_max", "site_config"];
const allSettings = () => {
  const settings = Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, getSetting(k) ?? ""]));
  settings.currency = "$";
  settings.currency_pos = "before";
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
  // минимальная партия предзаказа, мешков
  preorder_min: (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 999 ? String(n) : null; },
  preorder_max: (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 999 ? String(n) : null; },
  pack_markup: (v) => { // наценка на пачку, % от оптовой цены (0…200)
    if (v === "") return "";
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n <= 200 ? String(n) : null;
  },
  hero_gap: (v) => {
    if (v === "") return "";
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= -2 && n <= 2 ? String(n) : null;
  },
};

async function healthResponse(req, res) {
  const probe = db.prepare("SELECT 1 ok").get();
  let catalogHealth = { ok: true, products: db.prepare("SELECT COUNT(*) c FROM products").get().c };
  if (postgresCatalog) catalogHealth = await postgresCatalog.health();
  const commerceHealth = postgresCommerce ? await postgresCommerce.health() : {
    customers: db.prepare("SELECT COUNT(*) c FROM customers").get().c,
    orders: db.prepare("SELECT COUNT(*) c FROM orders").get().c,
  };
  send(res, 200, {
    ok: probe?.ok === 1 && catalogHealth.ok,
    env: NODE_ENV,
    uptime: Math.round(process.uptime()),
    products: catalogHealth.products,
    orders: commerceHealth.orders,
    customers: commerceHealth.customers,
    commerce_source: COMMERCE_DB_DRIVER,
    catalog_source: CATALOG_SOURCE_ENABLED ? (CATALOG_API_BASE ? "catalog_api" : "supabase") : CATALOG_DB_DRIVER,
    catalog_cached_products: catalogCache.products.length,
    catalog_error: catalogCache.error,
  });
}

/* ========================= API ========================= */

const api = {

  /* ----- public ----- */

  "GET /health": async (req, res) => healthResponse(req, res),

  "GET /api/health": async (req, res) => healthResponse(req, res),

  "GET /api/settings": (req, res) => send(res, 200, allSettings()),

  "GET /api/auth/config": (req, res) => send(res, 200, {
    provider: FIREBASE_ENABLED ? "firebase" : "local",
    firebase: firebasePublicConfig(),
    googleClientId: GOOGLE_CLIENT_ID || "",
    appleEnabled: FIREBASE_APPLE_ENABLED,
  }),

  "GET /api/auth/me": async (req, res) => send(res, 200, {
    customer: publicCustomer(await customerFromRequest(req)),
  }),

  "GET /api/auth/profile-dashboard": async (req, res) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    await ensureCustomerWelcomeCoupon(customer);
    const orders = await customerOrderSummary(customer.id, 6);
    const coupons = await couponsForCustomer(customer.id);
    const totals = postgresCommerce ? await postgresCommerce.customerDashboardTotals(customer.id) : db.prepare(`
      SELECT COUNT(*) orders_count, COALESCE(SUM(total),0) lifetime_spend
      FROM orders
      WHERE customer_id=? AND status!='cancelled'
    `).get(customer.id) || {};
    send(res, 200, {
      customer: publicCustomer(customer),
      stats: {
        orders_count: Number(totals.orders_count) || 0,
        lifetime_spend: Math.round((Number(totals.lifetime_spend) || 0) * 100) / 100,
        active_coupons: coupons.filter((coupon) => coupon.status === "active").length,
        price_discount: Math.max(0, Math.min(90, Number(customer.price_discount) || 0)),
      },
      coupons,
      orders,
    });
  },

  "POST /api/auth/promo/redeem": async (req, res) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    if (!rateLimit("customer-promo:" + customer.id, 20, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 4e3);
    const code = normalizePromoCode(b.code);
    if (!code || code.length < 3) return fail(res, 400, "promo_code");
    const promo = postgresCommerce ? await postgresCommerce.promoByCode(code) : db.prepare("SELECT * FROM promo_codes WHERE code=?").get(code);
    if (!promo || !promoIsUsable(promo)) return fail(res, 404, "promo_not_found");
    const existing = postgresCommerce ? await postgresCommerce.couponByCustomerCode(customer.id, code) : db.prepare("SELECT * FROM customer_coupons WHERE customer_id=? AND code=?").get(customer.id, code);
    if (existing) return send(res, 200, { coupon: publicCoupon(existing), status: "already_added" });
    const usageLimit = Number(promo.usage_limit) || 0;
    const postgresCounts = postgresCommerce ? await postgresCommerce.couponCounts(promo.id, customer.id) : null;
    if (usageLimit > 0) {
      const used = postgresCounts ? postgresCounts.total : db.prepare("SELECT COUNT(*) c FROM customer_coupons WHERE promo_id=?").get(promo.id).c;
      if (Number(used) >= usageLimit) return fail(res, 409, "promo_limit_reached");
    }
    const perCustomer = Math.max(1, Number(promo.per_customer_limit) || 1);
    const customerUses = postgresCounts ? postgresCounts.customer : db.prepare("SELECT COUNT(*) c FROM customer_coupons WHERE customer_id=? AND promo_id=?").get(customer.id, promo.id).c;
    if (Number(customerUses) >= perCustomer) return fail(res, 409, "promo_already_used");
    const coupon = await assignCouponToCustomer(customer, promo, "redeemed");
    audit("customer", "promo.redeemed", { id: customer.id, code });
    send(res, 201, { coupon: publicCoupon(coupon), status: "added" });
  },

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
    if (postgresCommerce) await postgresCommerce.upsertOtp("phone", normalized, hashOtp(normalized, code), Date.now() + 10 * 60e3);
    else db.prepare(`
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
    const row = postgresCommerce ? await postgresCommerce.otp("phone", phone) : db.prepare("SELECT * FROM phone_otps WHERE phone=?").get(phone);
    if (!row || Date.now() > Number(row.expires_at || 0)) return fail(res, 401, "otp_expired");
    if (Number(row.attempts || 0) >= 6) return fail(res, 429, "otp_locked");
    if (row.code_hash !== hashOtp(phone, code)) {
      if (postgresCommerce) await postgresCommerce.incrementOtp("phone", phone);
      else db.prepare("UPDATE phone_otps SET attempts=attempts+1 WHERE phone=?").run(phone);
      return fail(res, 401, "otp_wrong");
    }
    if (postgresCommerce) await postgresCommerce.verifyOtp("phone", phone);
    else db.prepare("UPDATE phone_otps SET verified_at=datetime('now') WHERE phone=?").run(phone);
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
    if (postgresCommerce) await postgresCommerce.upsertOtp("email", email, hashEmailOtp(email, code), Date.now() + 10 * 60e3);
    else db.prepare(`
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
    const row = postgresCommerce ? await postgresCommerce.otp("email", email) : db.prepare("SELECT * FROM email_otps WHERE email=?").get(email);
    if (!row || Date.now() > Number(row.expires_at || 0)) return fail(res, 401, "otp_expired");
    if (Number(row.attempts || 0) >= 6) return fail(res, 429, "otp_locked");
    if (row.code_hash !== hashEmailOtp(email, code)) {
      if (postgresCommerce) await postgresCommerce.incrementOtp("email", email);
      else db.prepare("UPDATE email_otps SET attempts=attempts+1 WHERE email=?").run(email);
      return fail(res, 401, "otp_wrong");
    }
    if (postgresCommerce) await postgresCommerce.verifyOtp("email", email);
    else db.prepare("UPDATE email_otps SET verified_at=datetime('now') WHERE email=?").run(email);
    audit("customer", "auth.email_otp_verified", { email: email.replace(/^(.).+(@.+)$/, "$1***$2") });
    send(res, 200, { ok: true });
  },

  "GET /api/auth/orders": async (req, res) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const sourceRows = postgresCommerce ? await postgresCommerce.customerOrders(customer.id, 50) : db.prepare(`
      SELECT id, number, status, order_type, tracking_number, items, total, lang, created_at, updated_at
      FROM orders
      WHERE customer_id=?
      ORDER BY id DESC
      LIMIT 50
    `).all(customer.id);
    const rows = sourceRows.map((row) => {
      let items = [];
      if (Array.isArray(row.items)) items = row.items;
      else try { items = JSON.parse(row.items || "[]"); } catch {}
      const payment = postgresCommerce ? {
        id: row.payment_id, method: row.payment_method, provider: row.payment_provider,
        status: row.payment_status, amount: row.payment_amount, currency: row.payment_currency,
        reference: row.payment_reference, payload: row.payment_payload,
      } : db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(row.id) || {};
      let paymentPayload = {};
      if (payment.payload && typeof payment.payload === "object") paymentPayload = payment.payload;
      else try { paymentPayload = JSON.parse(payment.payload || "{}"); } catch {}
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
          size: item.size || "",
          color: item.color || "",
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

  "GET /api/auth/support": async (req, res) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const rows = postgresCommerce ? await postgresCommerce.supportForCustomer(customer.id, 50) : db.prepare(`
      SELECT id, number, topic, message, status, lang, created_at, updated_at
      FROM support_requests
      WHERE customer_id=?
      ORDER BY id DESC
      LIMIT 50
    `).all(customer.id);
    send(res, 200, { support: rows });
  },

  "PUT /api/auth/profile": async (req, res) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const b = await readJson(req, 12e3);
    const name = str(b.name, 80);
    const phone = str(b.phone, 25);
    if (name.length < 2) return fail(res, 400, "name");
    if (phone && !/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    const city = str(b.city, 80);
    const address = str(b.address, 300);
    const business = {
      company_name: str(b.company_name, 120),
      tax_id: str(b.tax_id, 40),
      legal_address: str(b.legal_address, 300),
      contact_person: str(b.contact_person, 80),
      expected_volume: str(b.expected_volume, 120),
    };
    let updated;
    if (postgresCommerce) {
      updated = await postgresCommerce.updateCustomerProfile(customer.id, { name, phone, city, address, ...business });
    } else {
      db.prepare(`
        UPDATE customers
        SET name=?, phone=?, city=?, address=?, company_name=?, tax_id=?, legal_address=?,
            contact_person=?, expected_volume=?, updated_at=datetime('now')
        WHERE id=?
      `).run(
        name, phone, city, address, business.company_name, business.tax_id,
        business.legal_address, business.contact_person, business.expected_volume, customer.id
      );
      updated = db.prepare("SELECT * FROM customers WHERE id=?").get(customer.id);
    }
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
    const normalizedPhone = phone ? normalizePhone(phone) : "";
    const emailCode = str(b.email_code || b.code, 12);
    let emailOtpRow = postgresCommerce ? await postgresCommerce.otp("email", email) : db.prepare("SELECT verified_at FROM email_otps WHERE email=? AND verified_at!=''").get(email);
    if (emailOtpRow && !emailOtpRow.verified_at) emailOtpRow = null;
    if (!emailOtpRow && /^\d{6}$/.test(emailCode)) {
      const row = postgresCommerce ? await postgresCommerce.otp("email", email) : db.prepare("SELECT * FROM email_otps WHERE email=?").get(email);
      if (row && Date.now() <= Number(row.expires_at || 0) && row.code_hash === hashEmailOtp(email, emailCode)) {
        if (postgresCommerce) await postgresCommerce.verifyOtp("email", email);
        else db.prepare("UPDATE email_otps SET verified_at=datetime('now') WHERE email=?").run(email);
        emailOtpRow = { verified_at: new Date().toISOString() };
      }
    }
    let otpRow = normalizedPhone ? (postgresCommerce ? await postgresCommerce.otp("phone", normalizedPhone) : db.prepare("SELECT verified_at FROM phone_otps WHERE phone=? AND verified_at!=''").get(normalizedPhone)) : null;
    if (otpRow && !otpRow.verified_at) otpRow = null;
    if (!otpRow && normalizedPhone && /^\d{6}$/.test(str(b.otp_code, 12))) {
      const row = postgresCommerce ? await postgresCommerce.otp("phone", normalizedPhone) : db.prepare("SELECT * FROM phone_otps WHERE phone=?").get(normalizedPhone);
      if (row && Date.now() <= Number(row.expires_at || 0) && row.code_hash === hashOtp(normalizedPhone, str(b.otp_code, 12))) {
        if (postgresCommerce) await postgresCommerce.verifyOtp("phone", normalizedPhone);
        else db.prepare("UPDATE phone_otps SET verified_at=datetime('now') WHERE phone=?").run(normalizedPhone);
        otpRow = { verified_at: new Date().toISOString() };
      }
    }
    if (!emailOtpRow && !otpRow) return fail(res, 400, "email_not_verified");
    if (str(b.name, 80).length < 2) return fail(res, 400, "name");
    if (postgresCommerce ? await postgresCommerce.customerByEmail(email) : db.prepare("SELECT id FROM customers WHERE email=?").get(email)) return fail(res, 409, "email_exists");
    const customer = await upsertCustomer({
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
      phone_verified: otpRow ? 1 : 0,
      provider: "local",
      password_hash: hashPassword(password),
    });
    const token = await createCustomerSession(customer.id);
    audit("customer", "auth.signup", { id: customer.id, provider: "local" });
    authResponse(req, res, 201, customer, token);
  },

  "POST /api/auth/register": async (req, res) => api["POST /api/auth/signup"](req, res),

  "POST /api/auth/signin": async (req, res) => {
    if (!rateLimit("customer-signin:" + ipOf(req), 12, 15 * 60e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 8e3);
    const email = normalizeEmail(b.email);
    const row = emailOk(email) ? (postgresCommerce ? await postgresCommerce.customerByEmail(email) : db.prepare("SELECT * FROM customers WHERE email=?").get(email)) : null;
    if (!row || !row.password_hash || !verifyPassword(String(b.password || ""), row.password_hash)) {
      return fail(res, 401, "wrong_credentials");
    }
    const token = await createCustomerSession(row.id);
    audit("customer", "auth.signin", { id: row.id, provider: row.provider || "local" });
    authResponse(req, res, 200, row, token);
  },

  "POST /api/auth/passwordless": async (req, res) => {
    if (!rateLimit("customer-passwordless:" + ipOf(req), 12, 15 * 60e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 8e3);
    const email = normalizeEmail(b.email);
    const code = str(b.code || b.email_code, 12);
    if (!emailOk(email) || !/^\d{6}$/.test(code)) return fail(res, 400, "otp");
    const customer = postgresCommerce ? await postgresCommerce.customerByEmail(email) : db.prepare("SELECT * FROM customers WHERE email=?").get(email);
    const otp = postgresCommerce ? await postgresCommerce.otp("email", email) : db.prepare("SELECT * FROM email_otps WHERE email=?").get(email);
    if (!customer) return fail(res, 401, "account_not_found");
    if (!otp || Date.now() > Number(otp.expires_at || 0)) return fail(res, 401, "otp_expired");
    if (Number(otp.attempts || 0) >= 6) return fail(res, 429, "otp_locked");
    if (otp.code_hash !== hashEmailOtp(email, code)) {
      if (postgresCommerce) await postgresCommerce.incrementOtp("email", email);
      else db.prepare("UPDATE email_otps SET attempts=attempts+1 WHERE email=?").run(email);
      return fail(res, 401, "otp_wrong");
    }
    const token = await createCustomerSession(customer.id);
    if (postgresCommerce) await postgresCommerce.deleteOtp("email", email);
    else db.prepare("DELETE FROM email_otps WHERE email=?").run(email);
    audit("customer", "auth.passwordless", { id: customer.id, provider: customer.provider || "local" });
    authResponse(req, res, 200, customer, token);
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
    const row = postgresCommerce ? await postgresCommerce.customerByEmail(email) : db.prepare("SELECT * FROM customers WHERE email=?").get(email);
    if (!row) return fail(res, 401, "recovery_mismatch");
    const otpRow = postgresCommerce ? await postgresCommerce.otp("email", email) : db.prepare("SELECT * FROM email_otps WHERE email=?").get(email);
    if (!otpRow || Date.now() > Number(otpRow.expires_at || 0)) return fail(res, 401, "otp_expired");
    if (Number(otpRow.attempts || 0) >= 6) return fail(res, 429, "otp_locked");
    if (otpRow.code_hash !== hashEmailOtp(email, otpCode)) {
      if (postgresCommerce) await postgresCommerce.incrementOtp("email", email);
      else db.prepare("UPDATE email_otps SET attempts=attempts+1 WHERE email=?").run(email);
      return fail(res, 401, "otp_wrong");
    }
    if (["firebase", "google", "apple"].includes(String(row.provider || "").toLowerCase())) {
      return send(res, 409, {
        error: "federated_password_reset_required",
        provider: String(row.provider).toLowerCase(),
      });
    }
    const updated = postgresCommerce ? await postgresCommerce.updateCustomerPassword(row.id, hashPassword(password)) :
      (db.prepare("UPDATE customers SET password_hash=?, provider='local', updated_at=datetime('now') WHERE id=?").run(hashPassword(password), row.id),
       db.prepare("SELECT * FROM customers WHERE id=?").get(row.id));
    if (postgresCommerce) await postgresCommerce.deleteOtp("email", email);
    else db.prepare("DELETE FROM email_otps WHERE email=?").run(email);
    if (postgresCommerce) await postgresCommerce.deleteCustomerSessions(row.id);
    else db.prepare("DELETE FROM customer_sessions WHERE customer_id=?").run(row.id);
    const token = await createCustomerSession(row.id);
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
    const customerProvider = firebaseCustomerProvider(payload);
    const customer = await upsertCustomer({
      email,
      name: str(payload.name || b.name, 80),
      phone: str(b.phone || payload.phone_number || "", 25),
      city: str(b.city, 80),
      address: str(b.address, 300),
      provider: customerProvider,
      provider_uid: String(payload.sub || ""),
    });
    const token = await createCustomerSession(customer.id);
    audit("customer", `auth.${customerProvider}`, { id: customer.id, uid: payload.sub });
    authResponse(req, res, 200, customer, token);
  },

  "POST /api/auth/google": async (req, res) => {
    if (!rateLimit("customer-google:" + ipOf(req), 30, 15 * 60e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 32e3);
    let payload;
    try { payload = await verifyGoogleAccessToken(b.accessToken); }
    catch (e) { return fail(res, 401, e.message); }
    const email = normalizeEmail(payload.email);
    if (!emailOk(email)) return fail(res, 400, "email");
    const customer = await upsertCustomer({
      email,
      name: str(payload.name, 80),
      phone: "",
      provider: "google",
      provider_uid: String(payload.sub || ""),
      approval_status: "active",
    });
    const token = await createCustomerSession(customer.id);
    audit("customer", "auth.google", { id: customer.id, uid: payload.sub });
    authResponse(req, res, 200, customer, token);
  },

  "POST /api/auth/logout": async (req, res) => {
    const auth = String(req.headers.authorization || "");
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const token = bearer || parseCookies(req).cid;
    if (token && postgresCommerce) await postgresCommerce.deleteCustomerSession(sha256(token));
    else if (token) db.prepare("DELETE FROM customer_sessions WHERE token=?").run(sha256(token));
    send(res, 200, { ok: true }, { "Set-Cookie": customerCookie(req, "x", 0) });
  },

  "GET /api/products": async (req, res, u) => {
    const q = u.searchParams;
    const customer = await customerFromRequest(req);
    const paging = paginationFrom(q, { defaultLimit: 48, maxLimit: 2500 });
    if (CATALOG_SOURCE_ENABLED) {
      try {
        let products = await activeProductsForCatalog();
        if (CATALOG_PANELS.includes(q.get("panel"))) products = products.filter((p) => p.catalog_panel === q.get("panel"));
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
        const total = products.length;
        const items = products.slice(paging.offset, paging.offset + paging.limit)
          .map((p) => publicProductCard(productForCustomer(p, customer)));
        return sendPage(res, items, { ...paging, total }, q);
      } catch (e) {
        catalogCache.error = e.message;
        console.error("Catalog source failed; falling back to SQLite:", e.message);
      }
    }
    if (postgresCatalog) {
      const result = await postgresCatalog.list({
        activeOnly: true,
        filters: {
          catalog_panel: CATALOG_PANELS.includes(q.get("panel")) ? q.get("panel") : "",
          category: CATS.includes(q.get("category")) ? q.get("category") : "",
          gender: GENDERS.includes(q.get("gender")) ? q.get("gender") : "",
          tag: TAGS.includes(q.get("tag")) ? q.get("tag") : "",
        },
        search: str(q.get("q") || "", 60),
        sort: q.get("sort") || "default",
        limit: paging.limit,
        offset: paging.offset,
      });
      const items = result.rows
        .map((row) => rowToProduct(row))
        .map((product) => publicProductCard(productForCustomer(product, customer)));
      return sendPage(res, items, { ...paging, total: result.total }, q);
    }
    let where = ` FROM products WHERE ${CATALOG_VISIBLE_SQL}`;
    const args = [];
    if (CATALOG_PANELS.includes(q.get("panel"))) { where += " AND catalog_panel=?"; args.push(q.get("panel")); }
    if (CATS.includes(q.get("category"))) { where += " AND category=?"; args.push(q.get("category")); }
    if (GENDERS.includes(q.get("gender"))) { where += " AND gender=?"; args.push(q.get("gender")); }
    if (TAGS.includes(q.get("tag")) && q.get("tag")) { where += " AND tag=?"; args.push(q.get("tag")); }
    const term = str(q.get("q") || "", 60);
    if (term) {
      const like = `%${term.toLowerCase()}%`;
      where += " AND (LOWER(name) LIKE ? OR LOWER(model_no) LIKE ? OR LOWER(variant) LIKE ? OR LOWER(slug) LIKE ?)";
      args.push(like, like, like, like);
    }
    const sorts = {
      "new": "created_at DESC, id DESC",
      "price-asc": "price ASC", "price-desc": "price DESC",
      "popular": "reviews DESC, rating DESC",
      "default": "sort DESC, id DESC",
    };
    const total = db.prepare("SELECT COUNT(*) AS c" + where).get(...args).c;
    const sql = "SELECT *" + where
      + " ORDER BY " + (sorts[q.get("sort")] || sorts.default)
      + " LIMIT ? OFFSET ?";
    const products = db.prepare(sql).all(...args, paging.limit, paging.offset).map((r) => rowToProduct(r));
    const items = products.map((p) => publicProductCard(productForCustomer(p, customer)));
    sendPage(res, items, { ...paging, total }, q);
  },

  "GET /api/search/smart": async (req, res, u) => {
    const query = str(u.searchParams.get("q") || "", 120);
    if (query.trim().length < 2) return send(res, 200, { query, products: [] });
    let products = await activeProductsForCatalog();
    const gender = u.searchParams.get("gender");
    const category = u.searchParams.get("category");
    const panel = u.searchParams.get("panel");
    if (GENDERS.includes(gender)) products = products.filter((p) => p.gender === gender);
    if (CATS.includes(category)) products = products.filter((p) => p.category === category);
    if (CATALOG_PANELS.includes(panel)) products = products.filter((p) => p.catalog_panel === panel);
    const limit = Math.min(24, Math.max(1, Number(u.searchParams.get("limit")) || 8));
    const customer = await customerFromRequest(req);
    send(res, 200, { query, products: smartSearchProducts(products.map((p) => productForCustomer(p, customer)), query, limit) });
  },

  "GET /api/recommendations": async (req, res, u) => {
    const slug = str(u.searchParams.get("slug") || "", 120);
    const id = Number(u.searchParams.get("id")) || 0;
    const products = await activeProductsForCatalog();
    const seed = products.find((p) => (slug && p.slug === slug) || (id && p.id === id));
    if (!seed) return send(res, 200, { products: [] });
    const limit = Math.min(12, Math.max(1, Number(u.searchParams.get("limit")) || 4));
    const customer = await customerFromRequest(req);
    send(res, 200, { products: smartRecommendProducts(products, seed, limit).map((p) => publicProductCard(productForCustomer(p, customer))) });
  },

  "GET /api/products/:slug": async (req, res, u, m) => {
    const customer = await customerFromRequest(req);
    const row = postgresCatalog
      ? await postgresCatalog.getBySlug(m.slug, true)
      : db.prepare(`SELECT * FROM products WHERE slug=? AND ${CATALOG_VISIBLE_SQL}`).get(m.slug);
    if (row) {
      const localProduct = rowToProduct(row);
      const related = smartRecommendProducts(await activeProductsForCatalog(), localProduct, 4).map((p) => publicProductCard(productForCustomer(p, customer)));
      return send(res, 200, { ...publicProductCard(productForCustomer(localProduct, customer)), related, variants: modelVariants(localProduct) });
    }
    if (CATALOG_SOURCE_ENABLED) {
      try {
        const product = await catalogProductBySlug(m.slug);
        if (product && product.active !== false) {
          const related = smartRecommendProducts(await activeProductsForCatalog(), product, 4).map((p) => publicProductCard(productForCustomer(p, customer)));
          return send(res, 200, { ...publicProductCard(productForCustomer(product, customer)), related });
        }
      } catch (e) {
        catalogCache.error = e.message;
        console.error("Catalog product lookup failed; falling back to SQLite:", e.message);
      }
    }
    return fail(res, 404, "not_found");
  },

  "GET /api/auth/likes": async (req, res) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const localRows = postgresCommerce ? await postgresCommerce.likesForCustomer(customer.id, 100) : db.prepare(`
      SELECT l.product_id, l.product_slug, l.created_at, p.slug, p.name, p.price, p.images
      FROM likes l
      LEFT JOIN products p ON p.id=l.product_id
      WHERE l.customer_id=?
      ORDER BY l.id DESC
      LIMIT 100
    `).all(customer.id);
    const rows = await Promise.all(localRows.map(async (row) => {
      const pg = postgresCatalog ? await postgresCatalog.getById(row.product_id) : null;
      const source = pg || row;
      const images = Array.isArray(source.images) ? source.images : (() => { try { return JSON.parse(source.images || "[]"); } catch { return []; } })();
      return {
        id: row.product_id,
        slug: source.slug || row.product_slug,
        name: source.name || row.product_slug || String(row.product_id),
        price: Number(source.price || 0),
        image: images[0] || "",
        added_at: row.created_at,
      };
    }));
    send(res, 200, { likes: rows });
  },

  /* просмотр карточки: один засчитанный просмотр на посетителя в час */
  "POST /api/products/:id/view": async (req, res, u, m) => {
    const id = Number(m.id);
    if (!id) return fail(res, 400, "product");
    if (!rateLimit(`view:${ipOf(req)}:${id}`, 1, 3600e3)) return send(res, 200, { ok: true, counted: false });
    const r = db.prepare("UPDATE products SET views = COALESCE(views, 0) + 1 WHERE id=?").run(id);
    if (!r.changes) return fail(res, 404, "not_found");
    const views = db.prepare("SELECT views FROM products WHERE id=?").get(id)?.views || 0;
    send(res, 200, { ok: true, counted: true, views });
  },

  "POST /api/products/:id/like": async (req, res, u, m) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const id = Number(m.id);
    if (!id) return fail(res, 400, "product");
    let slug = "";
    if (CATALOG_SOURCE_ENABLED) {
      try { slug = (await catalogProductById(id))?.slug || ""; } catch {}
    }
    if (!slug && postgresCatalog) slug = (await postgresCatalog.getById(id))?.slug || "";
    if (!slug) slug = db.prepare("SELECT slug FROM products WHERE id=?").get(id)?.slug || "";
    let count;
    if (postgresCommerce) count = await postgresCommerce.addLike(customer.id, id, slug);
    else {
      db.prepare("INSERT OR IGNORE INTO likes (customer_id, product_id, product_slug) VALUES (?,?,?)").run(customer.id, id, slug);
      count = likeCount(id, slug);
    }
    if (postgresCatalog) await postgresCatalog.setLikeCount(id, count);
    else db.prepare("UPDATE products SET like_count=(SELECT COUNT(*) FROM likes WHERE product_id=?) WHERE id=?").run(id, id);
    send(res, 200, { liked: true, like_count: count });
  },

  "DELETE /api/products/:id/like": async (req, res, u, m) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const id = Number(m.id);
    let count;
    if (postgresCommerce) count = await postgresCommerce.deleteLike(customer.id, id);
    else db.prepare("DELETE FROM likes WHERE customer_id=? AND product_id=?").run(customer.id, id);
    const slug = postgresCatalog
      ? (await postgresCatalog.getById(id))?.slug || ""
      : db.prepare("SELECT slug FROM products WHERE id=?").get(id)?.slug || "";
    if (!postgresCommerce) count = likeCount(id, slug);
    if (postgresCatalog) await postgresCatalog.setLikeCount(id, count);
    else db.prepare("UPDATE products SET like_count=(SELECT COUNT(*) FROM likes WHERE product_id=?) WHERE id=?").run(id, id);
    send(res, 200, { liked: false, like_count: count });
  },

  "GET /api/products/:slug/reviews": async (req, res, u, m) => {
    const slug = str(m.slug, 120);
    const product = await activeProductBySlug(slug);
    if (!product) return fail(res, 404, "product_not_found");
    const productId = Number(product.id);
    const rows = postgresCommerce ? await postgresCommerce.reviewsForProduct(productId, slug, 50) : db.prepare(`
      SELECT r.id, r.rating, r.comment, r.photo_url, r.verified_purchase, r.created_at,
             COALESCE(c.name, 'Milana customer') customer_name
      FROM reviews r
      JOIN customers c ON c.id=r.customer_id
      WHERE r.status='approved' AND r.verified_purchase=1 AND r.product_slug=? AND r.product_id=?
      ORDER BY r.id DESC
      LIMIT 50
    `).all(slug, productId);
    const summary = postgresCommerce ? await postgresCommerce.reviewSummary(productId, slug) : reviewSummary(productId, slug);
    send(res, 200, {
      summary: {
        count: Number(summary.count) || 0,
        rating: Number(summary.rating ?? summary.avg) || 0,
      },
      reviews: rows,
    });
  },

  "POST /api/reviews": async (req, res) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    if (!rateLimit("review:" + customer.id, 12, 24 * 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 16e3);
    const requestedProductId = Number(b.product_id) || 0;
    const requestedProductSlug = str(b.product_slug, 120);
    const rating = Number(b.rating);
    const comment = str(b.comment, 1200);
    const photo = str(b.photo_url, 300);
    if (!requestedProductId && !requestedProductSlug) return fail(res, 400, "product");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(res, 400, "rating");
    if (!comment) return fail(res, 400, "comment");
    let canonical = null;
    if (postgresCatalog) {
      canonical = requestedProductId
        ? await postgresCatalog.getById(requestedProductId, true)
        : await postgresCatalog.getBySlug(requestedProductSlug, true);
      if (canonical) canonical = rowToProduct(canonical);
    } else {
      const row = requestedProductId
        ? db.prepare(`SELECT * FROM products WHERE id=? AND ${CATALOG_VISIBLE_SQL}`).get(requestedProductId)
        : db.prepare(`SELECT * FROM products WHERE slug=? AND ${CATALOG_VISIBLE_SQL}`).get(requestedProductSlug);
      if (row) canonical = rowToProduct(row);
    }
    if (!canonical && CATALOG_SOURCE_ENABLED) {
      canonical = requestedProductId
        ? await catalogProductById(requestedProductId)
        : await catalogProductBySlug(requestedProductSlug);
      if (canonical?.active === false) canonical = null;
    }
    if (!canonical && requestedProductId) {
      try { canonical = await localStoreProductById(requestedProductId); } catch {}
      if (canonical?.active === false) canonical = null;
    }
    if (!canonical) return fail(res, 404, "product_not_found");
    const productId = Number(canonical.id);
    const productSlug = str(canonical.slug, 120);
    if ((requestedProductId && requestedProductId !== productId)
      || (requestedProductSlug && requestedProductSlug !== productSlug)) {
      return fail(res, 409, "product_mismatch");
    }
    const orders = postgresCommerce ? await postgresCommerce.ordersForCustomer(customer.id, 100) : db.prepare("SELECT id, items FROM orders WHERE customer_id=? AND status!='cancelled' ORDER BY id DESC LIMIT 100").all(customer.id);
    let orderId = 0;
    for (const order of orders) {
      let items = [];
      if (Array.isArray(order.items)) items = order.items;
      else try { items = JSON.parse(order.items || "[]"); } catch {}
      if (items.some((item) => Number(item.id) === productId || item.slug === productSlug)) {
        orderId = order.id;
        break;
      }
    }
    if (!orderId) return fail(res, 403, "verified_purchase_required");
    const verified = 1;
    if (!postgresCommerce && db.prepare("SELECT id FROM reviews WHERE customer_id=? AND product_id=? LIMIT 1").get(customer.id, productId)) {
      return fail(res, 409, "duplicate_review");
    }
    let created = null;
    if (postgresCommerce) {
      try {
        created = await postgresCommerce.createReview({
          productId, productSlug, customerId: customer.id, orderId: orderId || null,
          rating, comment, photoUrl: photo, verified: Boolean(verified),
        });
      } catch (error) {
        if (error.message === "review_exists") return fail(res, 409, "duplicate_review");
        throw error;
      }
    }
    const r = created ? null : db.prepare(`
      INSERT INTO reviews (product_id, product_slug, customer_id, order_id, rating, comment, photo_url, verified_purchase, status)
      VALUES (?,?,?,?,?,?,?,?, 'pending')
    `).run(productId || null, productSlug, customer.id, orderId || null, rating, comment, photo, verified);
    const reviewId = created ? created.id : r.lastInsertRowid;
    audit("customer", "review.created", { id: reviewId, product_id: productId, status: "pending", verified });
    send(res, 201, { id: reviewId, status: "pending" });
  },

  "POST /api/chat/message": async (req, res) => {
    if (!rateLimit("chat:" + ipOf(req), 40, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 12e3);
    const signedInCustomer = await customerFromRequest(req);
    const message = str(b.message, 1500);
    if (message.length < 2) return fail(res, 400, "message");
    let sessionId = verifiedChatSessionId(b.session_id);
    let existing = sessionId
      ? (postgresCommerce ? await postgresCommerce.chatSession(sessionId) : db.prepare("SELECT * FROM chat_sessions WHERE id=?").get(sessionId))
      : null;
    if (!existing && signedInCustomer && /^\d+$/.test(String(b.session_id || ""))) {
      const candidateId = Number(b.session_id);
      const candidate = postgresCommerce
        ? await postgresCommerce.chatSession(candidateId)
        : db.prepare("SELECT * FROM chat_sessions WHERE id=?").get(candidateId);
      if (candidate && Number(candidate.customer_id) === Number(signedInCustomer.id)) {
        sessionId = candidateId;
        existing = candidate;
      }
    }
    if (!existing) {
      if (postgresCommerce) {
        const session = await postgresCommerce.createChatSession({
          customerId: signedInCustomer?.id || null,
          name: str(b.name || signedInCustomer?.name || "", 80),
          phone: str(b.phone || signedInCustomer?.phone || "", 25),
          email: normalizeEmail(b.email || signedInCustomer?.email || ""),
        });
        sessionId = session.id;
      } else {
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
    }
    if (postgresCommerce) await postgresCommerce.addChatMessage(sessionId, "customer", message);
    else db.prepare("INSERT INTO chat_messages (session_id, sender_type, message) VALUES (?,?,?)").run(sessionId, "customer", message);
    const lower = message.toLowerCase();
    const chatLang = ["en", "ru", "uz"].includes(b.lang) ? b.lang : "uz";
    const chatReplies = {
      en: {
        default: "Thank you. A Milana manager will clarify soon. Wholesale orders are available by pack or bag; 1 bag contains 60 items.",
        delivery: "Delivery is agreed by region. We dispatch from Andijan; cargo usually takes 1-5 business days.",
        price: "Price depends on the catalog model. Wholesale price is calculated by pack or bag, while retail price is shown per item.",
        human: "We will connect you with a manager. Leaving your contact number helps us answer faster."
      },
      ru: {
        default: "Спасибо. Менеджер Milana скоро уточнит детали. Оптовый заказ доступен упаковками или мешками; 1 мешок содержит 60 изделий.",
        delivery: "Доставка согласуется по региону. Отправляем из Андижана; cargo обычно занимает 1-5 рабочих дней.",
        price: "Цена зависит от модели в каталоге. Оптовая цена считается по упаковке или мешку, розничная цена указана за штуку.",
        human: "Подключим менеджера. Оставьте контактный номер, чтобы мы ответили быстрее."
      },
      uz: {
        default: "Rahmat. Milana menejeri tez orada aniqlashtiradi. Ulgurji buyurtma qadoq yoki qop bilan beriladi; 1 qopda 60 dona bor.",
        delivery: "Yetkazib berish hudud bo'yicha kelishiladi. Andijondan jo'natamiz, cargo muddati odatda 1-5 ish kuni.",
        price: "Narx katalogdagi modelga bog'liq. Ulgurji narx qadoq yoki qop bo'yicha, chakana narx esa dona bo'yicha ko'rsatiladi.",
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
      if (postgresCommerce) await postgresCommerce.escalateChat(sessionId);
      else db.prepare("UPDATE chat_sessions SET status='escalated', updated_at=datetime('now') WHERE id=?").run(sessionId);
    }
    if (postgresCommerce) await postgresCommerce.addChatMessage(sessionId, "bot", reply);
    else db.prepare("INSERT INTO chat_messages (session_id, sender_type, message) VALUES (?,?,?)").run(sessionId, "bot", reply);
    send(res, 200, { session_id: chatSessionRef(sessionId), reply, products });
  },

  "POST /api/chat/escalate": async (req, res) => {
    const b = await readJson(req, 12e3);
    const signedInCustomer = await customerFromRequest(req);
    let sessionId = verifiedChatSessionId(b.session_id);
    const name = str(b.name || signedInCustomer?.name || "", 80);
    const phone = str(b.phone || signedInCustomer?.phone || "", 25);
    const email = normalizeEmail(b.email || signedInCustomer?.email || "");
    const message = str(b.message || "Chat escalation", 3000);
    if (name.length < 2) return fail(res, 400, "name");
    if (!/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    if (!sessionId && signedInCustomer && /^\d+$/.test(String(b.session_id || ""))) {
      const candidateId = Number(b.session_id);
      const candidate = postgresCommerce
        ? await postgresCommerce.chatSession(candidateId)
        : db.prepare("SELECT * FROM chat_sessions WHERE id=?").get(candidateId);
      if (candidate && Number(candidate.customer_id) === Number(signedInCustomer.id)) sessionId = candidateId;
    }
    if (b.session_id && !sessionId) return fail(res, 403, "chat_session_forbidden");
    if (sessionId) {
      if (postgresCommerce) await postgresCommerce.escalateChat(sessionId, { name, phone, email });
      else db.prepare("UPDATE chat_sessions SET status='escalated', visitor_name=?, visitor_phone=?, visitor_email=?, updated_at=datetime('now') WHERE id=?")
        .run(name, phone, email, sessionId);
    }
    const support = postgresCommerce ? await postgresCommerce.createSupport({
      customerId: signedInCustomer?.id || null,
      name, phone, email, topic: "general", message,
      lang: ["en", "ru", "uz"].includes(b.lang) ? b.lang : "uz",
    }) : null;
    const r = support ? null : db.prepare(`
      INSERT INTO support_requests (customer_id, name, phone, email, topic, message, lang)
      VALUES (?,?,?,?, 'general', ?, ?)
    `).run(signedInCustomer?.id || null, name, phone, email, message, ["en", "ru", "uz"].includes(b.lang) ? b.lang : "uz");
    const number = support?.number || ("MS-" + new Date().getFullYear() + "-" + String(r.lastInsertRowid).padStart(4, "0"));
    if (!support) db.prepare("UPDATE support_requests SET number=? WHERE id=?").run(number, r.lastInsertRowid);
    send(res, 201, { number, status: "new" });
  },

  "GET /api/managers": (req, res) => {
    const managers = db.prepare(`
      SELECT id, name
      FROM managers
      WHERE active=1 AND telegram_chat_id<>''
      ORDER BY name COLLATE NOCASE, id
    `).all();
    send(res, 200, managers);
  },

  "POST /api/orders": async (req, res) => {
    const b = await readJson(req, 64e3);
    const c = b.customer || {};
    const name = str(c.name, 80), phone = str(c.phone, 25);
    const managerId = Number(b.manager_id || c.manager_id);
    const manager = Number.isInteger(managerId) && managerId > 0
      ? db.prepare(`
        SELECT id, name, telegram_chat_id, telegram_thread_id
        FROM managers
        WHERE id=? AND active=1 AND telegram_chat_id<>''
      `).get(managerId)
      : null;
    if (!manager) return fail(res, 400, "manager");
    const requestedPayment = str(b.payment?.method || c.payment_method || "manager", 30);
    const paymentMethod = PAYMENT_METHODS.includes(requestedPayment) ? requestedPayment : "manager";
    const source = str(b.source || req.headers["x-client-name"] || "website", 40) || "website";
    const customerCity = str(c.city, 80);
    const customerAddress = str(c.address, 300);
    const customerPostcode = str(c.postcode || c.post_code || c.zip || c.postal_code, 40);
    const customerDeliveryNote = str(c.delivery_note || c.note, 500);
    if (name.length < 2) return fail(res, 400, "name");
    if (!/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    // Production traffic reaches this service through a reverse proxy, so a
    // strict per-socket-IP limit groups every shopper into one shared bucket.
    // Keep a generous proxy-wide safety cap and enforce the meaningful limit
    // per normalized customer phone number instead.
    const orderPhoneKey = phone.replace(/\D/g, "");
    if (!rateLimit("order-proxy:" + ipOf(req), 300, 3600e3)
      || !rateLimit("order-phone:" + orderPhoneKey, 12, 3600e3)) {
      return fail(res, 429, "rate_limited");
    }
    if (source === "react_frontend" && customerCity.length < 2) return fail(res, 400, "city");
    if (source === "react_frontend" && customerAddress.length < 5) return fail(res, 400, "address");
    if (source === "react_frontend" && customerPostcode.length < 3) return fail(res, 400, "postcode");
    const signedInCustomer = await customerFromRequest(req);
    const requestedOrderType = b.order_type === "retail" ? "retail" : b.order_type === "wholesale" ? "wholesale" : "";
    const orderType = signedInCustomer?.account_type === "individual" ? "retail" : (requestedOrderType || "wholesale");
    const customer = {
      customer_id: signedInCustomer?.id || null,
      name, phone,
      email: signedInCustomer?.email || normalizeEmail(c.email || ""),
      city: customerCity,
      address: customerAddress,
      postcode: customerPostcode,
      delivery_note: customerDeliveryNote,
      comment: str(c.comment, 1000),
      customer_tier: normalizeCustomerTier(signedInCustomer?.customer_tier),
      assigned_manager: manager.name,
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
      if (!product && postgresCatalog) {
        const postgresRow = await postgresCatalog.getById(Number(it.id), true);
        if (postgresRow) product = rowToProduct(postgresRow);
      }
      if (!product) {
        try { product = await localStoreProductById(Number(it.id)); } catch (e) { console.error("Local upstream product lookup failed:", e.message); }
      }
      if (product && product.active === false) product = null;
      const row = product ? null : db.prepare(`SELECT * FROM products WHERE id=? AND ${CATALOG_VISIBLE_SQL}`).get(Number(it.id));
      if (!product && !row) return fail(res, 400, "item_unavailable");
      const sizes = product ? product.sizes : JSON.parse(row.sizes || "[]");
      const images = product ? product.images : JSON.parse(row.images || "[]");
      const id = product ? product.id : row.id;
      const slug = product ? product.slug : row.slug;
      const name = product ? product.name : row.name;
      const gender = product ? product.gender : row.gender;
      const category = product ? product.category : row.category;
      const sourceProduct = product || rowToProduct(row);
      const productColorOptions = productColors(sourceProduct);
      const requestedColor = str(it.color || it.variant || "", 120);
      const requestedSize = str(it.size || it.selected_size || "", 120);
      const color = requestedColor || productColorOptions[0] || "";
      const retailEnabled = product ? product.retail_enabled !== false : Number(row.retail_enabled) !== 0;
      const availableQop = product ? product.available_qop : row.available_qop;
      const retailStock = Number(product ? product.retail_stock : row.retail_stock) || 0;
      const rawQty = Number(it.qty);
      if (!Number.isInteger(rawQty) || rawQty < 1) return fail(res, 400, "invalid_qty");
      const requestedUnitType = str(it.unit_type || it.unit || "", 20).toLowerCase();
      const wholesaleUnitType = ORDER_PACKAGE_ALIASES[requestedUnitType] || (ORDER_PACKAGE_UNITS.has(requestedUnitType) ? requestedUnitType : "qop");
      const packagePieces = wholesaleUnitType === "pachka" ? packPieces(sizes, gender, category) : ORDER_BAG_SIZE;
      const pricing = orderType === "retail"
        ? priceForCustomer(sourceProduct, signedInCustomer, "retail")
        : wholesaleUnitType === "pachka"
          ? packPriceForCustomer(sourceProduct, signedInCustomer)
          : priceForCustomer(sourceProduct, signedInCustomer, "wholesale");
      const maxQty = orderType === "retail" ? 99 : Math.max(1, Math.floor((20 * ORDER_BAG_SIZE) / packagePieces));
      if (rawQty > maxQty) return fail(res, 400, "qty_limit");
      const wholesalePieces = rawQty * packagePieces;
      if (orderType === "wholesale" && availableQop != null && wholesalePieces > Number(availableQop) * ORDER_BAG_SIZE) return fail(res, 400, "insufficient_stock");
      if (orderType === "retail" && retailStock > 0 && rawQty > retailStock) return fail(res, 400, "insufficient_stock");
      let size_mix = [];
      let unit_price = pricing.unit;
      let bag_size = packagePieces;
      let price = Math.round(unit_price * bag_size * 100) / 100;
      let unit_type = wholesaleUnitType;
      let stock_adjustment = null;
      const price_pending = !pricing.visible;
      const qty = rawQty;
      if (orderType === "retail") {
        if (!retailEnabled) return fail(res, 400, "retail_unavailable");
        unit_price = pricing.unit;
        bag_size = 1;
        price = Math.round(unit_price * 100) / 100;
        unit_type = "piece";
        if ((row || postgresCatalog) && retailStock > 0) {
          stock_adjustment = { type: "retail", id, qty };
          stockAdjustments.push(stock_adjustment);
        }
      } else {
        size_mix = packageSizeMix(sizes, gender, category, packagePieces);
        if ((row || postgresCatalog) && availableQop != null) {
          stock_adjustment = {
            type: "wholesale",
            id,
            qop: Math.round((wholesalePieces / ORDER_BAG_SIZE) * 1000) / 1000,
          };
          stockAdjustments.push(stock_adjustment);
        }
      }
      items.push({
        id, slug, name, qty, unit_price, bag_size, unit_type, size: requestedSize, color, size_mix, price, image: images[0] || "",
        stock_adjustment,
        price_pending,
        price_source: pricing.source,
        price_label: pricing.label,
        assigned_manager: pricing.assigned_manager,
      });
      total += price * qty;
    }
    const lang = ["en", "ru", "uz"].includes(b.lang) ? b.lang : "en";
    const amount = Math.round(total * 100) / 100;
    let orderId, paymentId, number;
    if (postgresCommerce) {
      let created;
      try {
        created = await postgresCommerce.createCheckout({
          customerId: signedInCustomer?.id || null, customer, items, total: amount, orderType, lang,
          paymentProvider: paymentProvider(paymentMethod), paymentMethod, stockAdjustments,
          managerId: manager.id, managerName: manager.name,
        });
      } catch (error) {
        if (error.message === "insufficient_stock") return fail(res, 409, "insufficient_stock");
        throw error;
      }
      orderId = created.order.id;
      paymentId = created.payment.id;
      number = created.order.number;
    } else {
      db.exec("BEGIN IMMEDIATE");
      try {
        const r = db.prepare(`
          INSERT INTO orders (customer_id, customer, items, total, order_type, lang, manager_id, manager_name)
          VALUES (?,?,?,?,?,?,?,?)
        `).run(
          signedInCustomer?.id || null,
          JSON.stringify(customer),
          JSON.stringify(items),
          amount,
          orderType,
          lang,
          manager.id,
          manager.name
        );
        orderId = r.lastInsertRowid;
        number = "MP-" + new Date().getFullYear() + "-" + String(orderId).padStart(4, "0");
        db.prepare("UPDATE orders SET number=? WHERE id=?").run(number, orderId);
        const payment = db.prepare(`
          INSERT INTO payments (order_id, order_number, provider, method, status, amount, currency, payload)
          VALUES (?,?,?,?,?,?,?,?)
        `).run(orderId, number, paymentProvider(paymentMethod), paymentMethod, "pending", amount, "USD",
          JSON.stringify({ source: "checkout", gateway_connected: false }));
        paymentId = payment.lastInsertRowid;
        for (const adjustment of stockAdjustments) {
          const result = adjustment.type === "retail"
            ? db.prepare("UPDATE products SET retail_stock=retail_stock-? WHERE id=? AND retail_stock>=?")
              .run(adjustment.qty, adjustment.id, adjustment.qty)
            : db.prepare("UPDATE products SET available_qop=available_qop-? WHERE id=? AND available_qop IS NOT NULL AND available_qop>=?")
              .run(adjustment.qop, adjustment.id, adjustment.qop);
          if (!result.changes) throw new Error("insufficient_stock");
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        if (error.message === "insufficient_stock") return fail(res, 409, "insufficient_stock");
        throw error;
      }
    }
    audit("customer", "order.created", { order_id: orderId, number, total: amount, order_type: orderType });
    audit("customer", "payment.created", { order_id: orderId, payment_id: paymentId, method: paymentMethod, amount });
    notifyTelegramOrderLater({
      id: orderId, number, customer, items, total: amount, orderType, paymentMethod, source, lang, manager,
    });
    send(res, 201, {
      id: orderId,
      order_id: orderId,
      number,
      total: amount,
      order_type: orderType,
      manager: { id: manager.id, name: manager.name },
      payment: { method: paymentMethod, status: "pending", amount, currency: "USD" },
    });
  },

  "POST /api/auth/orders/:id/cancel": async (req, res, u, m) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const id = Number(m.id);
    const joined = postgresCommerce ? await postgresCommerce.customerOrderAndPayment(id, customer.id) : null;
    const order = joined || db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(id, customer.id);
    if (!order) return fail(res, 404, "not_found");
    const payment = joined ? { id: joined.payment_id, status: joined.payment_status } : db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(id) || {};
    if (order.status !== "new" || !["pending", "waiting_for_customer", "invoice_sent"].includes(payment.status || "pending")) {
      return fail(res, 409, "cannot_cancel");
    }
    const b = await readJson(req, 4e3);
    let released = { retail: 0, qop: 0 };
    if (postgresCommerce) {
      try {
        const cancelled = await postgresCommerce.cancelOrder(id, customer.id, str(b.reason, 500));
        released = cancelled.released || released;
      }
      catch (error) {
        if (error.message === "cannot_cancel") return fail(res, 409, "cannot_cancel");
        if (error.message === "not_found") return fail(res, 404, "not_found");
        throw error;
      }
    } else {
      db.exec("BEGIN IMMEDIATE");
      try {
        const lockedOrder = db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(id, customer.id);
        const lockedPayment = db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(id) || {};
        if (!lockedOrder) throw new Error("not_found");
        if (lockedOrder.status !== "new"
          || !["pending", "waiting_for_customer", "invoice_sent"].includes(lockedPayment.status || "pending")) {
          throw new Error("cannot_cancel");
        }
        released = restoreSqliteStock(parseOrderItems(lockedOrder.items));
        const payload = {
          cancelled_by: "customer",
          reason: str(b.reason, 500),
          cancelled_at: new Date().toISOString(),
        };
        db.prepare("UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(id);
        if (lockedPayment.id) {
          db.prepare("UPDATE payments SET status='cancelled', payload=?, updated_at=datetime('now') WHERE id=?")
            .run(JSON.stringify(payload), lockedPayment.id);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        if (error.message === "cannot_cancel") return fail(res, 409, "cannot_cancel");
        if (error.message === "not_found") return fail(res, 404, "not_found");
        throw error;
      }
    }
    audit("customer", "order.cancelled", { id, number: order.number, reason: str(b.reason, 120) });
    send(res, 200, {
      order_id: id,
      status: "cancelled",
      payment_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      stock_released_qop: released.qop,
      stock_released_retail: released.retail,
    });
  },

  "POST /api/auth/orders/:id/payment-proof": async (req, res, u, m) => {
    const customer = await customerFromRequest(req);
    if (!customer) return fail(res, 401, "unauthorized");
    const id = Number(m.id);
    const joined = postgresCommerce ? await postgresCommerce.customerOrderAndPayment(id, customer.id) : null;
    const order = joined || db.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").get(id, customer.id);
    if (!order) return fail(res, 404, "not_found");
    if (["cancelled", "done"].includes(order.status)) return fail(res, 409, "order_closed");
    const payment = joined ? {
      id: joined.payment_id, method: joined.payment_method, amount: joined.payment_amount,
      payload: joined.payment_payload, status: joined.payment_status,
    } : db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(id);
    if (!payment) return fail(res, 404, "payment_not_found");
    if (!transitionAllowed(PAYMENT_STATUS_TRANSITIONS, payment.status || "pending", "submitted")) {
      return fail(res, 409, "invalid_payment_transition");
    }
    const b = await readJson(req, 8e3);
    const method = PAYMENT_METHODS.includes(b.method) ? b.method : payment.method || "manager";
    const reference = str(b.reference, 120);
    const note = str(b.note, 1000);
    const amount = Number(b.amount);
    if (!reference && !note) return fail(res, 400, "proof");
    const submittedAt = new Date().toISOString();
    let payload = {};
    if (payment.payload && typeof payment.payload === "object") payload = payment.payload;
    else try { payload = JSON.parse(payment.payload || "{}"); } catch {}
    payload.submission = {
      method,
      amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : payment.amount,
      reference,
      note,
      submitted_at: submittedAt,
    };
    if (postgresCommerce) {
      const updated = await postgresCommerce.submitPaymentProof(
        payment.id, method, reference, payload, payment.status || "pending"
      );
      if (!updated) return fail(res, 409, "state_changed");
    } else {
      const updated = db.prepare(`
        UPDATE payments
        SET method=?, status='submitted', reference=COALESCE(NULLIF(?,''), reference), payload=?, updated_at=datetime('now')
        WHERE id=? AND status=?
      `).run(method, reference, JSON.stringify(payload), payment.id, payment.status || "pending");
      if (!updated.changes) return fail(res, 409, "state_changed");
    }
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
    const signedInCustomer = await customerFromRequest(req);
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
    const support = postgresCommerce ? await postgresCommerce.createSupport({
      customerId: signedInCustomer?.id || null,
      name, phone, email, topic, message, lang,
    }) : null;
    const r = support ? null : db.prepare(`
      INSERT INTO support_requests (customer_id, name, phone, email, topic, message, lang)
      VALUES (?,?,?,?,?,?,?)
    `).run(signedInCustomer?.id || null, name, phone, email, topic, message, lang);
    const number = support?.number || ("MS-" + new Date().getFullYear() + "-" + String(r.lastInsertRowid).padStart(4, "0"));
    if (!support) db.prepare("UPDATE support_requests SET number=? WHERE id=?").run(number, r.lastInsertRowid);
    audit("customer", "support.created", { id: support?.id || r.lastInsertRowid, number, topic });
    send(res, 201, { number, status: "new" });
  },

  /* ----- auth ----- */

  "POST /api/login": async (req, res) => {
    if (!rateLimit("login:" + ipOf(req), 8, 15 * 60e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 4e3);
    const loginOk = str(b.login, 60).toLowerCase() === String(getSetting("admin_user") || "admin").toLowerCase();
    const passOk = verifyPassword(String(b.password || ""), getSetting("pass_hash"));
    if (loginOk && passOk) {
      const token = createSession();
      audit("admin", "auth.login", { ip: ipOf(req) });
      return send(res, 200, { ok: true, role: "admin" }, { "Set-Cookie": sessionCookie(req, token, 30 * 24 * 3600) });
    }
    const manager = db.prepare("SELECT * FROM managers WHERE lower(login)=lower(?) AND active=1").get(str(b.login, 60));
    if (!manager || !verifyPassword(String(b.password || ""), manager.password_hash)) {
      return fail(res, 401, "wrong_credentials");
    }
    const token = createManagerSession(manager.id);
    audit(`manager:${manager.id}`, "auth.login", { ip: ipOf(req) });
    send(res, 200, { ok: true, role: "manager", manager: { id: manager.id, name: manager.name } }, {
      "Set-Cookie": sessionCookie(req, token, 30 * 24 * 3600),
    });
  },

  "POST /api/logout": (req, res) => {
    const token = parseCookies(req).sid;
    const staff = staffFromRequest(req);
    if (token) {
      db.prepare("DELETE FROM sessions WHERE token IN (?,?)").run(sha256(token), token);
      db.prepare("DELETE FROM manager_sessions WHERE token IN (?,?)").run(sha256(token), token);
    }
    audit(staff?.role === "manager" ? `manager:${staff.manager.id}` : "admin", "auth.logout", { ip: ipOf(req) });
    send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "x", 0) });
  },

  "GET /api/me": (req, res) => {
    const staff = staffFromRequest(req);
    send(res, 200, {
      admin: staff?.role === "admin",
      role: staff?.role || "",
      manager: staff?.role === "manager" ? { id: staff.manager.id, name: staff.manager.name, login: staff.manager.login } : null,
    });
  },

  /* ----- admin ----- */

  "GET /api/admin/managers": (req, res) => {
    send(res, 200, db.prepare(`
      SELECT id, name, login, telegram_chat_id, telegram_thread_id, active, created_at, updated_at
      FROM managers
      ORDER BY active DESC, name COLLATE NOCASE, id
    `).all());
  },

  "POST /api/admin/managers": async (req, res) => {
    const b = await readJson(req, 8e3);
    const name = str(b.name, 80);
    const login = str(b.login, 60).toLowerCase();
    const password = String(b.password || "");
    const telegramChatId = str(b.telegram_chat_id, 80);
    const telegramThreadId = str(b.telegram_thread_id, 30);
    const active = b.active === false || b.active === 0 ? 0 : 1;
    if (name.length < 2) return fail(res, 400, "name");
    if (!/^[a-z0-9._-]{3,60}$/i.test(login)) return fail(res, 400, "login");
    if (password.length < 8 || password.length > 100) return fail(res, 400, "password");
    if (!telegramChatId) return fail(res, 400, "telegram_chat_id");
    if (db.prepare("SELECT 1 FROM managers WHERE lower(login)=lower(?)").get(login)) return fail(res, 409, "login_exists");
    const result = db.prepare(`
      INSERT INTO managers (name, login, password_hash, telegram_chat_id, telegram_thread_id, active)
      VALUES (?,?,?,?,?,?)
    `).run(name, login, hashPassword(password), telegramChatId, telegramThreadId, active);
    audit("admin", "manager.created", { id: result.lastInsertRowid, name, login });
    const manager = db.prepare(`
      SELECT id, name, login, telegram_chat_id, telegram_thread_id, active, created_at, updated_at
      FROM managers WHERE id=?
    `).get(result.lastInsertRowid);
    send(res, 201, manager);
  },

  "PUT /api/admin/managers/:id": async (req, res, u, m) => {
    const id = Number(m.id);
    const existing = db.prepare("SELECT * FROM managers WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    const b = await readJson(req, 8e3);
    const name = str(b.name ?? existing.name, 80);
    const login = str(b.login ?? existing.login, 60).toLowerCase();
    const password = String(b.password || "");
    const telegramChatId = str(b.telegram_chat_id ?? existing.telegram_chat_id, 80);
    const telegramThreadId = str(b.telegram_thread_id ?? existing.telegram_thread_id, 30);
    const active = b.active === false || b.active === 0 ? 0 : 1;
    if (name.length < 2) return fail(res, 400, "name");
    if (!/^[a-z0-9._-]{3,60}$/i.test(login)) return fail(res, 400, "login");
    if (password && (password.length < 8 || password.length > 100)) return fail(res, 400, "password");
    if (!telegramChatId) return fail(res, 400, "telegram_chat_id");
    if (db.prepare("SELECT 1 FROM managers WHERE lower(login)=lower(?) AND id<>?").get(login, id)) {
      return fail(res, 409, "login_exists");
    }
    if (password) {
      db.prepare(`
        UPDATE managers
        SET name=?, login=?, password_hash=?, telegram_chat_id=?, telegram_thread_id=?, active=?, updated_at=datetime('now')
        WHERE id=?
      `).run(name, login, hashPassword(password), telegramChatId, telegramThreadId, active, id);
    } else {
      db.prepare(`
        UPDATE managers
        SET name=?, login=?, telegram_chat_id=?, telegram_thread_id=?, active=?, updated_at=datetime('now')
        WHERE id=?
      `).run(name, login, telegramChatId, telegramThreadId, active, id);
    }
    if (password || !active) db.prepare("DELETE FROM manager_sessions WHERE manager_id=?").run(id);
    audit("admin", "manager.updated", { id, name, login, active });
    send(res, 200, db.prepare(`
      SELECT id, name, login, telegram_chat_id, telegram_thread_id, active, created_at, updated_at
      FROM managers WHERE id=?
    `).get(id));
  },

  "GET /api/admin/customers": async (req, res, u) => {
    let rows = postgresCommerce ? await postgresCommerce.adminCustomers() : db.prepare(`
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
    const existing = postgresCommerce ? await postgresCommerce.customerById(id) : db.prepare("SELECT approval_status FROM customers WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    const updated = postgresCommerce ? await postgresCommerce.updateCustomerApproval(id, b.approval_status) :
      (db.prepare("UPDATE customers SET approval_status=?, updated_at=datetime('now') WHERE id=?").run(b.approval_status, id),
       db.prepare("SELECT * FROM customers WHERE id=?").get(id));
    audit("admin", "customer.approval_changed", { id, from: existing.approval_status, to: b.approval_status });
    send(res, 200, publicCustomer(updated));
  },

  "PUT /api/admin/customers/:id/commercial": async (req, res, u, m) => {
    const b = await readJson(req, 8e3);
    const id = Number(m.id);
    const existing = postgresCommerce ? await postgresCommerce.customerById(id) : db.prepare("SELECT * FROM customers WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    const tier = normalizeCustomerTier(b.customer_tier);
    const manager = str(b.assigned_manager, 80);
    const discount = Math.max(0, Math.min(90, Number(b.price_discount) || 0));
    const updated = postgresCommerce ? await postgresCommerce.updateCustomerCommercial(id, tier, manager, discount) :
      (db.prepare(`
      UPDATE customers
      SET customer_tier=?, assigned_manager=?, price_discount=?, updated_at=datetime('now')
      WHERE id=?
    `).run(tier, manager, discount, id), db.prepare("SELECT * FROM customers WHERE id=?").get(id));
    audit("admin", "customer.commercial_changed", {
      id,
      from_tier: existing.customer_tier || "regular",
      to_tier: tier,
      manager,
      discount,
    });
    send(res, 200, publicCustomer(updated));
  },

  "GET /api/admin/reviews": async (req, res) => {
    const rows = postgresCommerce ? await postgresCommerce.adminReviews() : db.prepare(`
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
    const existing = postgresCommerce ? await postgresCommerce.reviewById(id) : db.prepare("SELECT * FROM reviews WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    if (postgresCommerce) await postgresCommerce.updateReviewStatus(id, b.status);
    else db.prepare("UPDATE reviews SET status=?, updated_at=datetime('now') WHERE id=?").run(b.status, id);
    audit("admin", "review.moderated", { id, from: existing.status, to: b.status });
    send(res, 200, { ok: true });
  },

  "GET /api/admin/chat": async (req, res) => {
    const rows = postgresCommerce ? await postgresCommerce.adminChat() : db.prepare(`
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
    const existing = postgresCommerce ? await postgresCommerce.chatSession(id) : db.prepare("SELECT status FROM chat_sessions WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    if (postgresCommerce) await postgresCommerce.updateChatStatus(id, b.status);
    else db.prepare("UPDATE chat_sessions SET status=?, updated_at=datetime('now') WHERE id=?").run(b.status, id);
    audit("admin", "chat.status_changed", { id, from: existing.status, to: b.status });
    send(res, 200, { ok: true });
  },

  "GET /api/admin/products": async (req, res, u) => {
    const q = u.searchParams;
    const paging = paginationFrom(q, { defaultLimit: 100, maxLimit: 250 });
    if (CATALOG_SOURCE_ENABLED) {
      try {
        let products = await adminProductsForCatalog(q.get("refresh") === "1");
        if (CATALOG_PANELS.includes(q.get("panel"))) products = products.filter((p) => p.catalog_panel === q.get("panel"));
        const term = str(q.get("q") || "", 100);
        if (term) products = smartSearchProducts(products, term, products.length);
        const total = products.length;
        return sendPage(res, products.slice(paging.offset, paging.offset + paging.limit), { ...paging, total }, q);
      } catch (e) {
        catalogCache.error = e.message;
      }
    }
    if (postgresCatalog) {
      const result = await postgresCatalog.list({
        filters: { catalog_panel: CATALOG_PANELS.includes(q.get("panel")) ? q.get("panel") : "" },
        search: str(q.get("q") || "", 100),
        limit: paging.limit,
        offset: paging.offset,
      });
      const rows = result.rows.map((row) => rowToProduct(row));
      return sendPage(res, rows, { ...paging, total: result.total }, q);
    }
    let where = " FROM products WHERE 1=1";
    const args = [];
    if (CATALOG_PANELS.includes(q.get("panel"))) { where += " AND catalog_panel=?"; args.push(q.get("panel")); }
    const term = str(q.get("q") || "", 100);
    if (term) {
      const like = `%${term.toLowerCase()}%`;
      where += " AND (LOWER(name) LIKE ? OR LOWER(model_no) LIKE ? OR LOWER(variant) LIKE ? OR LOWER(slug) LIKE ?)";
      args.push(like, like, like, like);
    }
    const total = db.prepare("SELECT COUNT(*) AS c" + where).get(...args).c;
    const rows = db.prepare("SELECT *" + where + " ORDER BY sort DESC, id DESC LIMIT ? OFFSET ?")
      .all(...args, paging.limit, paging.offset)
      .map((r) => rowToProduct(r));
    sendPage(res, rows, { ...paging, total }, q);
  },

  "GET /api/admin/catalog-panels": async (req, res) => {
    const products = await adminProductsForCatalog();
    send(res, 200, CATALOG_PANELS.map((id, index) => {
      const rows = products.filter((product) => product.catalog_panel === id);
      const cover = rows.find((product) => product.images?.[0] && !/\.(mp4|webm)(?:[?#]|$)/i.test(product.images[0]));
      return {
        id,
        number: String(index + 5).padStart(2, "0"),
        total: rows.length,
        active: rows.filter((product) => product.active !== false).length,
        image: cover?.images?.[0] || "",
      };
    }));
  },

  "POST /api/admin/products/describe": async (req, res) => {
    const b = await readJson(req, 32e3);
    try {
      const result = await openAiProductDescriptions(b);
      audit("admin", "product.description_generated", {
        image_count: Array.isArray(b.images) ? Math.min(b.images.length, 3) : 1,
        model: OPENAI_MODEL,
      });
      send(res, 200, result);
    } catch (e) {
      const code = String(e.message || "description_failed").split(":")[0];
      const clientErrors = new Set([
        "openai_not_configured", "image_required", "image_not_local",
        "image_invalid", "image_not_found", "image_too_large",
      ]);
      fail(res, clientErrors.has(code) ? 400 : 502, code);
    }
  },

  "POST /api/admin/products": async (req, res) => {
    const b = await readJson(req);
    let v;
    try { v = validateProduct(b); } catch (e) { return fail(res, 400, "invalid_" + e.message); }
    const slug = await uniqueCatalogSlug(slugify(str(b.slug, 80) || v.name));
    if (postgresCatalog) {
      if (postgresCommerce) await postgresCommerce.ensureFractionalStockSchema();
      const created = await postgresCatalog.create(slug, v);
      audit("admin", "product.created", { id: created.id, slug, catalog_db: "postgres" });
      return send(res, 201, rowToProduct(created));
    }
    const cols = Object.keys(v);
    const r = db.prepare(
      `INSERT INTO products (slug,${cols.join(",")}) VALUES (?${",?".repeat(cols.length)})`
    ).run(slug, ...cols.map((c) => v[c]));
    audit("admin", "product.created", { id: r.lastInsertRowid, slug });
    send(res, 201, rowToProduct(db.prepare("SELECT * FROM products WHERE id=?").get(r.lastInsertRowid)));
  },

  "PUT /api/admin/products/:id": async (req, res, u, m) => {
    const id = Number(m.id);
    const existing = postgresCatalog
      ? await postgresCatalog.getById(id)
      : db.prepare("SELECT * FROM products WHERE id=?").get(id);
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
    const slug = await uniqueCatalogSlug(slugify(str(b.slug, 80) || v.name), id);
    if (postgresCatalog) {
      if (postgresCommerce) await postgresCommerce.ensureFractionalStockSchema();
      const updated = await postgresCatalog.update(id, slug, v);
      audit("admin", "product.updated", { id, slug, catalog_db: "postgres" });
      return send(res, 200, rowToProduct(updated));
    }
    const cols = Object.keys(v);
    db.prepare(`UPDATE products SET slug=?, ${cols.map((c) => c + "=?").join(",")} WHERE id=?`)
      .run(slug, ...cols.map((c) => v[c]), id);
    audit("admin", "product.updated", { id, slug });
    send(res, 200, rowToProduct(db.prepare("SELECT * FROM products WHERE id=?").get(id)));
  },

  "DELETE /api/admin/products/:id": async (req, res, u, m) => {
    const id = Number(m.id);
    const existing = postgresCatalog
      ? await postgresCatalog.getById(id)
      : db.prepare("SELECT id FROM products WHERE id=?").get(id);
    if (!existing && CATALOG_SOURCE_ENABLED) {
      setCatalogProductActive(id, false);
      audit("admin", "catalog_product.hidden", { id });
      return send(res, 200, { ok: true });
    }
    if (postgresCatalog) await postgresCatalog.delete(id);
    else db.prepare("DELETE FROM products WHERE id=?").run(id);
    audit("admin", "product.deleted", { id });
    send(res, 200, { ok: true });
  },

  "POST /api/admin/upload": async (req, res) => {
    const uploadLimitMb = 64;
    let buf;
    try {
      buf = await readBody(req, uploadLimitMb * 1024 * 1024);
    } catch (e) {
      return fail(res, e.message === "too_large" ? 413 : 400, e.message || "upload_failed");
    }
    if (buf.length < 100) return fail(res, 400, "empty");
    const media = detectUploadMedia(buf);
    if (!media) return fail(res, 400, "format_not_allowed");
    const prefix = media.kind === "video" ? "v" : media.kind === "font" ? "f" : "p";
    const finalBase = prefix + Date.now().toString(36) + "-" + crypto.randomBytes(4).toString("hex");
    const originalName = `${finalBase}.${media.ext}`;
    const originalPath = path.join(UPLOAD_ORIGINAL_DIR, originalName);
    fs.writeFileSync(originalPath, buf);
    const optimized = await optimizeUploadedMedia({
      originalPath,
      finalBase,
      ext: media.ext,
      kind: media.kind,
      originalBytes: buf.length,
    });
    audit("admin", "media.uploaded", {
      name: optimized.name,
      kind: optimized.kind,
      bytes: optimized.bytes,
      original_bytes: optimized.originalBytes,
      optimized: optimized.optimized,
      saved_bytes: optimized.savedBytes,
    });
    send(res, 201, {
      url: "/uploads/" + optimized.name,
      original_url: "/uploads/originals/" + originalName,
      kind: optimized.kind,
      optimized: optimized.optimized,
      bytes: optimized.bytes,
      original_bytes: optimized.originalBytes,
      saved_bytes: optimized.savedBytes,
      optimizer: optimized.reason || "ok",
    });
  },

  "GET /api/admin/orders": async (req, res) => {
    const staff = staffFromRequest(req);
    const managerId = staff?.role === "manager" ? staff.manager.id : null;
    const sourceRows = postgresCommerce
      ? await postgresCommerce.adminOrders(500, managerId)
      : managerId
        ? db.prepare("SELECT * FROM orders WHERE manager_id=? ORDER BY id DESC LIMIT 500").all(managerId)
        : db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500").all();
    const rows = sourceRows.map((r) => ({
      id: r.id, number: r.number, status: r.status, order_type: r.order_type || "wholesale", tracking_number: r.tracking_number || "",
      total: r.total, lang: r.lang, customer_id: r.customer_id || null,
      manager_id: r.manager_id || null, manager_name: r.manager_name || "",
      customer: typeof r.customer === "string" ? JSON.parse(r.customer) : r.customer,
      items: typeof r.items === "string" ? JSON.parse(r.items) : r.items, created_at: r.created_at,
      payment: postgresCommerce ? r.payment : db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(r.id) || null,
    }));
    send(res, 200, rows);
  },

  "GET /api/admin/support": async (req, res) => {
    const rows = postgresCommerce ? await postgresCommerce.adminSupport() : db.prepare("SELECT * FROM support_requests ORDER BY id DESC LIMIT 500").all();
    send(res, 200, rows);
  },

  "PUT /api/admin/support/:id": async (req, res, u, m) => {
    const b = await readJson(req, 4e3);
    if (!SUPPORT_STATUSES.includes(b.status)) return fail(res, 400, "status");
    const id = Number(m.id);
    const existing = postgresCommerce ? await postgresCommerce.supportById(id) : db.prepare("SELECT status FROM support_requests WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    if (postgresCommerce) await postgresCommerce.updateSupportStatus(id, b.status);
    else db.prepare("UPDATE support_requests SET status=?, updated_at=datetime('now') WHERE id=?").run(b.status, id);
    audit("admin", "support.status_changed", { id, from: existing.status, to: b.status });
    send(res, 200, { ok: true });
  },

  "PUT /api/admin/orders/:id": async (req, res, u, m) => {
    const b = await readJson(req, 4e3);
    if (!ORDER_STATUSES.includes(b.status)) return fail(res, 400, "status");
    const id = Number(m.id);
    const staff = staffFromRequest(req);
    const existing = postgresCommerce ? await postgresCommerce.orderById(id) : db.prepare("SELECT status, manager_id FROM orders WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    if (staff?.role === "manager" && Number(existing.manager_id) !== Number(staff.manager.id)) {
      return fail(res, 403, "forbidden");
    }
    if (!transitionAllowed(ORDER_STATUS_TRANSITIONS, existing.status, b.status)) {
      return fail(res, 409, "invalid_order_transition");
    }
    let released = { retail: 0, qop: 0 };
    if (postgresCommerce) {
      try {
        const updated = await postgresCommerce.updateOrderStatus(
          id, b.status, str(b.tracking_number, 80), existing.status
        );
        released = updated?.released || released;
      } catch (error) {
        if (["state_changed", "invalid_payment_state"].includes(error.message)) {
          return fail(res, 409, error.message);
        }
        throw error;
      }
    } else {
      db.exec("BEGIN IMMEDIATE");
      try {
        const lockedOrder = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
        if (!lockedOrder) throw new Error("not_found");
        if (lockedOrder.status !== existing.status) throw new Error("state_changed");
        if (b.status === "cancelled" && lockedOrder.status !== "cancelled") {
          const payment = db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(id);
          const paymentStatus = payment?.status || "pending";
          if (!ORDER_CANCELLABLE_PAYMENT_STATUSES.has(paymentStatus)) throw new Error("invalid_payment_state");
          released = restoreSqliteStock(parseOrderItems(lockedOrder.items));
          if (payment && !["cancelled", "refunded"].includes(paymentStatus)) {
            db.prepare("UPDATE payments SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(payment.id);
          }
        }
        db.prepare(`
          UPDATE orders
          SET status=?, tracking_number=COALESCE(NULLIF(?,''), tracking_number), updated_at=datetime('now')
          WHERE id=?
        `).run(b.status, str(b.tracking_number, 80), id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        if (["state_changed", "invalid_payment_state"].includes(error.message)) {
          return fail(res, 409, error.message);
        }
        if (error.message === "not_found") return fail(res, 404, "not_found");
        throw error;
      }
    }
    audit(staff?.role === "manager" ? `manager:${staff.manager.id}` : "admin", "order.status_changed", {
      id, from: existing.status, to: b.status, stock_released: released,
    });
    send(res, 200, { ok: true, stock_released: released });
  },

  "PUT /api/admin/payments/:id": async (req, res, u, m) => {
    const b = await readJson(req, 8e3);
    if (!PAYMENT_STATUSES.includes(b.status)) return fail(res, 400, "status");
    const id = Number(m.id);
    const existing = postgresCommerce ? await postgresCommerce.paymentById(id) : db.prepare("SELECT * FROM payments WHERE id=?").get(id);
    if (!existing) return fail(res, 404, "not_found");
    if (!transitionAllowed(PAYMENT_STATUS_TRANSITIONS, existing.status, b.status)) {
      return fail(res, 409, "invalid_payment_transition");
    }
    const order = postgresCommerce
      ? await postgresCommerce.orderById(existing.order_id)
      : db.prepare("SELECT status FROM orders WHERE id=?").get(existing.order_id);
    if (!order) return fail(res, 404, "order_not_found");
    if (order.status === "cancelled" && !["cancelled", "refunded"].includes(b.status)) {
      return fail(res, 409, "invalid_order_payment_state");
    }
    if (["shipped", "done"].includes(order.status) && b.status === "cancelled") {
      return fail(res, 409, "invalid_order_payment_state");
    }
    const reference = "reference" in b ? str(b.reference, 120) : existing.reference;
    if (postgresCommerce) {
      const updated = await postgresCommerce.updatePaymentStatus(id, b.status, reference, existing.status);
      if (!updated) return fail(res, 409, "state_changed");
    } else {
      const result = db.prepare(`
        UPDATE payments SET status=?, reference=?, updated_at=datetime('now')
        WHERE id=? AND status=?
      `).run(b.status, reference, id, existing.status);
      if (!result.changes) return fail(res, 409, "state_changed");
    }
    audit("admin", "payment.status_changed", { id, order_id: existing.order_id, from: existing.status, to: b.status });
    send(res, 200, { ok: true });
  },

  "GET /api/admin/dictionaries": (req, res) => send(res, 200, dictAll()),

  "PUT /api/admin/dictionaries": async (req, res) => {
    const b = await readJson(req, 128e3);
    const touched = [];
    for (const k of DICT_KINDS) if (Array.isArray(b[k])) { dictReplace(k, b[k]); touched.push(k); }
    audit("admin", "dictionaries.updated", { kinds: touched });
    send(res, 200, dictAll());
  },

  "POST /api/admin/dictionaries/rename": async (req, res) => {
    const b = await readJson(req, 8e3);
    const kind = str(b.kind, 20);
    const from = str(b.from, 200).trim();
    const to = str(b.to, 200).trim();
    if (!DICT_KINDS.includes(kind) || !from || !to || from === to) return fail(res, 400, "bad_request");

    let touched = 0;
    if (kind === "sizes") {
      const list = to.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12);
      if (!list.length) return fail(res, 400, "bad_request");
      const moq = packPieces(list, "", "");
      const upd = db.prepare("UPDATE products SET sizes=?, wholesale_moq=? WHERE id=?");
      const payload = JSON.stringify(list);
      for (const r of db.prepare("SELECT id, sizes FROM products").all()) {
        if (sizeRunOf(r.sizes) !== from) continue;
        upd.run(payload, moq, r.id);
        touched += 1;
      }
    } else {
      const col = DICT_COLUMN[kind];
      touched = db.prepare(`UPDATE products SET ${col}=? WHERE TRIM(COALESCE(${col},'')) = ?`).run(to, from).changes;
    }

    /* если новое имя уже есть в справочнике — старую строку просто убираем, иначе ловим unique */
    const exists = db.prepare("SELECT 1 FROM dictionaries WHERE kind=? AND value=?").get(kind, to);
    if (exists) db.prepare("DELETE FROM dictionaries WHERE kind=? AND value=?").run(kind, from);
    else db.prepare("UPDATE dictionaries SET value=? WHERE kind=? AND value=?").run(to, kind, from);

    audit("admin", "dictionaries.renamed", { kind, from, to, products: touched });
    send(res, 200, { ...dictAll(), renamed: touched });
  },

  "GET /api/admin/settings": (req, res) =>
    send(res, 200, { ...allSettings(), admin_user: getSetting("admin_user") || "admin" }),

  "PUT /api/admin/settings": async (req, res) => {
    const b = await readJson(req, 256e3);
    for (const k of PUBLIC_SETTING_KEYS) {
      if (!(k in b)) continue;
      const raw = str(b[k], k === "site_config" ? 200000 : 300);
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

function serveFile(res, absPath, cache, req, statusCode = 200) {
  let st;
  try { st = fs.statSync(absPath); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(absPath).toLowerCase();
  const lastMod = st.mtime.toUTCString();
  if (statusCode === 200 && req && req.headers["if-modified-since"] === lastMod) {
    res.writeHead(304, { ...SECURITY_HEADERS, "Cache-Control": cache, "Last-Modified": lastMod });
    res.end();
    return true;
  }
  const contentType = MIME[ext] || "application/octet-stream";
  const type = contentType.split(";", 1)[0].toLowerCase();
  if (req?.method !== "HEAD" && COMPRESSIBLE_TYPES.has(type)) {
    const compressed = compressBuffer(fs.readFileSync(absPath), req, contentType);
    const headers = {
      ...SECURITY_HEADERS,
      "Content-Type": contentType,
      "Content-Length": compressed.body.length,
      "Cache-Control": cache,
      "Last-Modified": lastMod,
    };
    if (compressed.encoding) {
      headers["Content-Encoding"] = compressed.encoding;
      headers.Vary = "Accept-Encoding";
    }
    res.writeHead(statusCode, headers);
    res.end(compressed.body);
    return true;
  }
  const stream = fs.createReadStream(absPath);
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Content-Type": contentType,
    "Content-Length": st.size,
    "Cache-Control": cache,
    "Last-Modified": lastMod,
  });
  if (req?.method === "HEAD") { res.end(); return true; }
  stream.pipe(res);
  return true;
}

function serveBrandedNotFound(req, res) {
  return serveFile(res, path.join(PUBLIC_DIR, "404.html"), "no-store", req, 404)
    || fail(res, 404, "not_found");
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

async function proxyLocalStoreUpload(req, res, pathname) {
  if (!LOCAL_STORE_UPLOAD_BASE || !["GET", "HEAD"].includes(req.method)) return false;
  if (!pathname.startsWith("/uploads/") || pathname.includes("..") || pathname.includes("\\")) return false;
  const target = new URL(pathname, LOCAL_STORE_UPLOAD_BASE);
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const upstream = await fetch(target, { method: "GET", headers });
  if (!upstream.ok) return false;
  const responseHeaders = {
    ...SECURITY_HEADERS,
    ...corsHeaders(req),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=604800",
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
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

/* The LUXE storefront is the new presentation layer. The legacy preview stays
   available at /preview and can still be restored explicitly for diagnostics. */
const LUXE_STOREFRONT_ENABLED = process.env.LUXE_STOREFRONT_ENABLED !== "0";
const storefrontPage = (luxePage, legacyPage = "local-preview.html") =>
  LUXE_STOREFRONT_ENABLED ? luxePage : legacyPage;
const PAGE_ALIASES = {
  "/": storefrontPage("index.html"),
  "/preview": "local-preview.html",
  "/shop": storefrontPage("shop.html"),
  "/support": "support.html",
  "/signin": storefrontPage("signin.html"),
  "/signup": storefrontPage("signin.html"),
  "/account": storefrontPage("signin.html"),
  "/checkout": storefrontPage("shop.html"),
  "/terms": "terms.html",
  "/ordering": "ordering.html",
};
const VIEWS_DIR = path.join(ROOT, "views");

const server = http.createServer(async (req, res) => {
  res._milanaReq = req;
  let u;
  try { u = new URL(req.url, "http://x"); } catch { return fail(res, 400, "bad_url"); }
  const pathname = u.pathname;

  try {
    if (pathname === "/health") {
      Object.entries(corsHeaders(req)).forEach(([key, value]) => res.setHeader(key, value));
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (localStoreReadProxyAllowed(req.method, "/api/health")) return await proxyLocalStoreRead({ method: req.method, headers: req.headers, url: "/api/health" }, res);
      if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "method_not_allowed");
      return healthResponse(req, res);
    }

    /* API */
    if (pathname.startsWith("/api/")) {
      Object.entries(corsHeaders(req)).forEach(([key, value]) => res.setHeader(key, value));
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (localStoreReadProxyAllowed(req.method, pathname)) return await proxyLocalStoreRead(req, res);
      const route = matchRoute(req.method, pathname);
      if (!route) return fail(res, 404, "not_found");
      const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      const cookieAuthPath = pathname.startsWith("/api/admin/") || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/products/") || pathname.startsWith("/api/reviews") || pathname.startsWith("/api/chat") || pathname === "/api/logout" || pathname === "/api/login";
      if (unsafe && cookieAuthPath && !trustedRequestOrigin(req)) return fail(res, 403, "bad_origin");
      if (pathname.startsWith("/api/admin/")) {
        const staff = staffFromRequest(req);
        if (!staff) return fail(res, 401, "unauthorized");
        const managerOrderAccess = (req.method === "GET" && pathname === "/api/admin/orders")
          || (req.method === "PUT" && /^\/api\/admin\/orders\/\d+$/.test(pathname));
        if (staff.role === "manager" && !managerOrderAccess) return fail(res, 403, "forbidden");
      }
      return await route.handler(req, res, u, route.params);
    }

    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "method_not_allowed");

    if (pathname === "/robots.txt") {
      const body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /account\nDisallow: /checkout\nDisallow: /signin\nDisallow: /signup\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
      return sendText(req, res, 200, body, "text/plain; charset=utf-8", "public, max-age=3600");
    }

    if (pathname === "/sitemap.xml") {
      return sendText(req, res, 200, await sitemapXml(), "application/xml; charset=utf-8", "public, max-age=3600");
    }

    /* uploads (Range-aware so video can stream / seek) */
    if (pathname.startsWith("/uploads/")) {
      const uploadRel = decodeURIComponent(pathname.slice("/uploads/".length));
      if (!uploadRel || uploadRel.includes("..") || uploadRel.includes("\\")) return fail(res, 403, "forbidden");
      const uploadPath = path.normalize(path.join(UPLOAD_DIR, uploadRel));
      if (!uploadPath.startsWith(UPLOAD_DIR + path.sep)) return fail(res, 403, "forbidden");
      if (serveUpload(req, res, uploadPath)) return;
      if (await proxyLocalStoreUpload(req, res, pathname)) return;
      return fail(res, 404, "not_found");
    }

    if (pathname.startsWith("/storage/")) {
      Object.entries(corsHeaders(req)).forEach(([key, value]) => res.setHeader(key, value));
      if (await proxyCatalogStorage(req, res, pathname)) return;
      return fail(res, 404, "not_found");
    }

    const mapTile = pathname.match(/^\/map-tiles\/(\d{1,2})\/(\d+)\/(\d+)\.png$/);
    if (mapTile) return await serveMapTile(req, res, Number(mapTile[1]), Number(mapTile[2]), Number(mapTile[3]));

    /* admin: the panel HTML is served only to an authenticated session —
       everyone else gets the login page. The file itself lives outside public/. */
    if (pathname === "/admin" || pathname === "/admin/") {
      const staff = staffFromRequest(req);
      const file = staff?.role === "admin"
        ? "admin-app.html"
        : staff?.role === "manager"
          ? "manager-app.html"
          : "admin-login.html";
      return serveFile(res, path.join(VIEWS_DIR, file), "no-store") || fail(res, 404, "not_found");
    }

    /* pretty product url /p/:slug */
    if (/^\/p\/[a-z0-9-]+$/.test(pathname)) {
      const slug = decodeURIComponent(pathname.slice(3));
      const product = await activeProductBySlug(slug);
      if (!product) return serveBrandedNotFound(req, res);
      const templatePath = path.join(PUBLIC_DIR, storefrontPage("product.html"));
      let template;
      try { template = fs.readFileSync(templatePath, "utf8"); }
      catch { return serveBrandedNotFound(req, res); }
      return sendText(req, res, 200, renderProductDocument(template, product), "text/html; charset=utf-8", "no-store");
    }

    /* pages + static */
    const alias = PAGE_ALIASES[pathname];
    const rel = alias || pathname.slice(1);
    const abs = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!abs.startsWith(PUBLIC_DIR + path.sep) && abs !== PUBLIC_DIR) return fail(res, 403, "forbidden");
    const ext = path.extname(abs).toLowerCase();
    /* HTML stays no-store so deploys land immediately. Versioned CSS/JS and
       media can cache longer, which keeps repeat mobile/tablet visits snappy. */
    const cache = ext === ".html" || ext === "" ? "no-store"
      : ext === ".json" ? "no-cache"
      : [".css", ".js", ".woff2", ".woff", ".ttf", ".otf", ".svg", ".ico", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm"].includes(ext) ? "public, max-age=604800, stale-while-revalidate=86400"
      : "public, max-age=86400";
    if (serveFile(res, abs, cache, req)) return;

    if (String(req.headers.accept || "").includes("text/html") || !path.extname(pathname)) {
      return serveBrandedNotFound(req, res);
    }
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
  server.close(async () => {
    try { await postgresCommerce?.close(); } catch {}
    try { await postgresCatalog?.close(); } catch {}
    try { db.close(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function startServer() {
  if (postgresCatalog) {
    const health = await postgresCatalog.health();
    console.log(`  PostgreSQL catalog connected (${health.products} products).`);
  }
  if (postgresCommerce) {
    await postgresCommerce.ensureDefaultPromo();
    const health = await postgresCommerce.health();
    console.log(`  PostgreSQL commerce connected (${health.customers} customers, ${health.orders} orders).`);
  }
  server.listen(PORT, HOST, () => {
    console.log("\n  MILANA PREMIUM");
    console.log("  Site:  http://localhost:" + PORT);
    console.log("  Preview: http://localhost:" + PORT + "/preview");
    console.log("  Shop:  http://localhost:" + PORT + "/shop");
    console.log("  Admin: http://localhost:" + PORT + "/admin\n");
  });
}

startServer().catch(async (error) => {
  console.error("Server startup failed:", error.message);
  try { await postgresCommerce?.close(); } catch {}
  try { await postgresCatalog?.close(); } catch {}
  try { db.close(); } catch {}
  process.exit(1);
});
