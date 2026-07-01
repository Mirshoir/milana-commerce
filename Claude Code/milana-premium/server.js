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
const CATALOG_SOURCE_ENABLED = process.env.CATALOG_SOURCE_ENABLED !== "0";
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

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadEnvFile(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    text.split(/\r?\n/).forEach((line) => {
      const clean = line.trim();
      if (!clean || clean.startsWith("#")) return;
      const i = clean.indexOf("=");
      if (i <= 0) return;
      const key = clean.slice(0, i).trim();
      const value = clean.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] == null) process.env[key] = value;
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
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT DEFAULT 'system',
    event TEXT NOT NULL,
    meta TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_products_public ON products(active, gender, category, tag, sort DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
  CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
  CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_support_status_created ON support_requests(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_customers_provider ON customers(provider, provider_uid);
  CREATE INDEX IF NOT EXISTS idx_customer_sessions_created ON customer_sessions(created_at);
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
  if (!orderCols.includes("updated_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN updated_at TEXT DEFAULT ''");
    db.exec("UPDATE orders SET updated_at=COALESCE(NULLIF(created_at,''), datetime('now')) WHERE updated_at=''");
  }
  const customerCols = db.prepare("PRAGMA table_info(customers)").all().map((c) => c.name);
  if (!customerCols.includes("city")) db.exec("ALTER TABLE customers ADD COLUMN city TEXT DEFAULT ''");
  if (!customerCols.includes("address")) db.exec("ALTER TABLE customers ADD COLUMN address TEXT DEFAULT ''");
})();

if (!db.prepare("SELECT COUNT(*) c FROM products").get().c) {
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

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  if (!DEV_CORS_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
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
  const token = parseCookies(req).cid;
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

function upsertCustomer({ email, name = "", phone = "", city = "", address = "", provider = "local", provider_uid = "", password_hash = "" }) {
  const cleanEmail = normalizeEmail(email);
  if (!emailOk(cleanEmail)) throw new Error("email");
  const existing = db.prepare("SELECT * FROM customers WHERE email=?").get(cleanEmail);
  if (existing) {
    db.prepare(`
      UPDATE customers SET
        name=COALESCE(NULLIF(?,''), name),
        phone=COALESCE(NULLIF(?,''), phone),
        city=COALESCE(NULLIF(?,''), city),
        address=COALESCE(NULLIF(?,''), address),
        provider=?,
        provider_uid=COALESCE(NULLIF(?,''), provider_uid),
        password_hash=COALESCE(NULLIF(?,''), password_hash),
        updated_at=datetime('now')
      WHERE id=?
    `).run(str(name, 80), str(phone, 25), str(city, 80), str(address, 300), provider, str(provider_uid, 160), password_hash, existing.id);
    return db.prepare("SELECT * FROM customers WHERE id=?").get(existing.id);
  }
  const r = db.prepare(`
    INSERT INTO customers (email, name, phone, city, address, provider, provider_uid, password_hash)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(cleanEmail, str(name, 80), str(phone, 25), str(city, 80), str(address, 300), provider, str(provider_uid, 160), password_hash);
  return db.prepare("SELECT * FROM customers WHERE id=?").get(r.lastInsertRowid);
}

/* ---------- misc ---------- */
const CATS = ["pajamas", "robes", "homewear", "loungewear"]; // clothing type
const GENDERS = ["women", "men", "kids", "unisex"];
const TAGS = ["", "bestseller", "new", "sale"];
const ORDER_STATUSES = ["new", "processing", "shipped", "done", "cancelled"];
const PAYMENT_METHODS = ["manager", "cash", "bank", "click", "payme", "card"];
const PAYMENT_STATUSES = ["pending", "invoice_sent", "paid", "failed", "refunded", "cancelled"];
const SUPPORT_TOPICS = ["general", "catalog", "price", "delivery", "defect", "payment", "order"];
const SUPPORT_STATUSES = ["new", "open", "waiting", "done", "closed"];
const str = (v, max = 1000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const normalizeEmail = (v) => str(v, 254).toLowerCase();
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && !/[<>"']/.test(v);
const htmlText = (v) => str(v, 5000).replace(/\s+/g, " ").trim();

const CATALOGS = [
  { source_pdf: "01_Staple_Model_Catalog.pdf", gender: "women", category: "loungewear" },
  { source_pdf: "02_Milana_Man_Premium_Collection.pdf", gender: "men", category: "loungewear" },
  { source_pdf: "03_Kindergarten_Set.pdf", gender: "kids", category: "pajamas" },
  { source_pdf: "04_Milana_Products_in_Stock.pdf", gender: "women", category: "loungewear" },
];
const catalogSourceMeta = (source) => CATALOGS.find((c) => c.source_pdf === source) || CATALOGS[3];

let catalogCache = { at: 0, products: [], byId: new Map(), bySlug: new Map(), error: null };

function catalogHeaders() {
  return { apikey: CATALOG_SUPABASE_KEY, Authorization: "Bearer " + CATALOG_SUPABASE_KEY };
}

function catalogImageUrl(row, width = 900, quality = 76) {
  const explicit = str(row.image_url, 1000);
  if (explicit) return explicit;
  const bucket = str(row.image_storage_bucket, 120) || CATALOG_IMAGE_BUCKET;
  const imgPath = str(row.image_storage_path, 1000).replace(/^\/+/, "");
  if (!imgPath) return "";
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
  return {
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
    source: "supabase_catalog",
    source_pdf: row.source_pdf,
    currency: row.currency || "USD",
  };
}

function uniqueSlugFromCatalog(row, name) {
  const base = slugify([name, row.source_pdf, row.page, row.card_index].filter(Boolean).join("-"));
  return "catalog-" + row.id + "-" + base;
}

async function fetchCatalogRows() {
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
  if (!CATALOG_SOURCE_ENABLED || !CATALOG_SUPABASE_URL || !CATALOG_SUPABASE_KEY) return [];
  const now = Date.now();
  if (!force && catalogCache.products.length && now - catalogCache.at < CATALOG_CACHE_MS) return catalogCache.products;
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
  return products;
}

async function catalogProductById(id) {
  const products = await catalogProducts();
  return catalogCache.byId.get(Number(id)) || products.find((p) => p.id === Number(id));
}

async function catalogProductBySlug(slug) {
  const products = await catalogProducts();
  return catalogCache.bySlug.get(slug) || products.find((p) => p.slug === slug);
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
  const p = {
    id: r.id, slug: r.slug, name: r.name,
    model_no: r.model_no || "", variant: r.variant || "", gender: r.gender || "unisex", category: r.category,
    price: r.price, old_price: r.old_price,
    sizes: JSON.parse(r.sizes || "[]"), images: JSON.parse(r.images || "[]"),
    tag: r.tag, rating: r.rating, reviews: r.reviews, active: !!r.active, sort: r.sort,
  };
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
    name, model_no, variant, gender, category: b.category, price, old_price, tag, rating, reviews,
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

/* ========================= API ========================= */

const api = {

  /* ----- public ----- */

  "GET /api/health": (req, res) => {
    const probe = db.prepare("SELECT 1 ok").get();
    send(res, 200, {
      ok: probe?.ok === 1,
      env: NODE_ENV,
      uptime: Math.round(process.uptime()),
      products: db.prepare("SELECT COUNT(*) c FROM products").get().c,
      orders: db.prepare("SELECT COUNT(*) c FROM orders").get().c,
      catalog_source: CATALOG_SOURCE_ENABLED ? "supabase" : "sqlite",
      catalog_cached_products: catalogCache.products.length,
      catalog_error: catalogCache.error,
    });
  },

  "GET /api/settings": (req, res) => send(res, 200, allSettings()),

  "GET /api/auth/config": (req, res) => send(res, 200, {
    provider: FIREBASE_ENABLED ? "firebase" : "local",
    firebase: firebasePublicConfig(),
  }),

  "GET /api/auth/me": (req, res) => send(res, 200, {
    customer: publicCustomer(customerFromRequest(req)),
  }),

  "POST /api/auth/signup": async (req, res) => {
    if (!rateLimit("customer-signup:" + ipOf(req), 10, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 12e3);
    const email = normalizeEmail(b.email);
    const password = String(b.password || "");
    const phone = str(b.phone, 25);
    if (!emailOk(email)) return fail(res, 400, "email");
    if (password.length < 8 || password.length > 100) return fail(res, 400, "password");
    if (phone && !/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    if (db.prepare("SELECT id FROM customers WHERE email=?").get(email)) return fail(res, 409, "email_exists");
    const customer = upsertCustomer({
      email,
      name: str(b.name, 80),
      phone,
      city: str(b.city, 80),
      address: str(b.address, 300),
      provider: "local",
      password_hash: hashPassword(password),
    });
    const token = createCustomerSession(customer.id);
    audit("customer", "auth.signup", { id: customer.id, provider: "local" });
    send(res, 201, { customer: publicCustomer(customer) }, { "Set-Cookie": customerCookie(req, token, 30 * 24 * 3600) });
  },

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
    send(res, 200, { customer: publicCustomer(row) }, { "Set-Cookie": customerCookie(req, token, 30 * 24 * 3600) });
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
    send(res, 200, { customer: publicCustomer(customer) }, { "Set-Cookie": customerCookie(req, token, 30 * 24 * 3600) });
  },

  "POST /api/auth/logout": (req, res) => {
    const token = parseCookies(req).cid;
    if (token) db.prepare("DELETE FROM customer_sessions WHERE token=?").run(sha256(token));
    send(res, 200, { ok: true }, { "Set-Cookie": customerCookie(req, "x", 0) });
  },

  "GET /api/products": async (req, res, u) => {
    const q = u.searchParams;
    if (CATALOG_SOURCE_ENABLED) {
      try {
        let products = await catalogProducts();
        if (CATS.includes(q.get("category"))) products = products.filter((p) => p.category === q.get("category"));
        if (GENDERS.includes(q.get("gender"))) products = products.filter((p) => p.gender === q.get("gender"));
        if (TAGS.includes(q.get("tag")) && q.get("tag")) products = products.filter((p) => p.tag === q.get("tag"));
        const term = str(q.get("q") || "", 60).toLowerCase();
        if (term) {
          products = products.filter((p) => [
            p.name, p.model_no, p.variant, p.desc.en, p.desc.ru, p.desc.uz, p.fabric.en
          ].join(" ").toLowerCase().includes(term));
        }
        const sorts = {
          "new": (a, b) => b.id - a.id,
          "price-asc": (a, b) => a.price - b.price,
          "price-desc": (a, b) => b.price - a.price,
          "popular": (a, b) => b.reviews - a.reviews || b.rating - a.rating,
          "default": (a, b) => b.sort - a.sort || b.id - a.id,
        };
        products = products.slice().sort(sorts[q.get("sort")] || sorts.default);
        const limit = Math.min(1000, Math.max(1, Number(q.get("limit")) || 1000));
        return send(res, 200, products.slice(0, limit).map((p) => ({ ...p, images: p.images.slice(0, 2), desc: undefined })));
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
    if (term) {
      sql += " AND (name LIKE ? OR model_no LIKE ? OR variant LIKE ? OR desc_en LIKE ? OR desc_ru LIKE ? OR desc_uz LIKE ?)";
      const like = "%" + term.replace(/[%_]/g, "") + "%";
      args.push(like, like, like, like, like, like);
    }
    const sorts = {
      "new": "created_at DESC, id DESC",
      "price-asc": "price ASC", "price-desc": "price DESC",
      "popular": "reviews DESC, rating DESC",
      "default": "sort DESC, id DESC",
    };
    sql += " ORDER BY " + (sorts[q.get("sort")] || sorts.default);
    const limit = Math.min(1000, Math.max(1, Number(q.get("limit")) || 200));
    sql += " LIMIT " + limit;
    send(res, 200, db.prepare(sql).all(...args).map((r) => rowToProduct(r, true)));
  },

  "GET /api/products/:slug": async (req, res, u, m) => {
    if (CATALOG_SOURCE_ENABLED) {
      try {
        const product = await catalogProductBySlug(m.slug);
        if (product) {
          const related = (await catalogProducts())
            .filter((p) => p.active && p.category === product.category && p.id !== product.id)
            .sort((a, b) => b.sort - a.sort || b.id - a.id)
            .slice(0, 4)
            .map((p) => ({ ...p, images: p.images.slice(0, 2), desc: undefined }));
          return send(res, 200, { ...product, related });
        }
      } catch (e) {
        catalogCache.error = e.message;
        console.error("Catalog product lookup failed; falling back to SQLite:", e.message);
      }
    }
    const row = db.prepare("SELECT * FROM products WHERE slug=? AND active=1").get(m.slug);
    if (!row) return fail(res, 404, "not_found");
    const related = db.prepare(
      "SELECT * FROM products WHERE active=1 AND category=? AND id!=? ORDER BY sort DESC, id DESC LIMIT 4"
    ).all(row.category, row.id).map((r) => rowToProduct(r, true));
    send(res, 200, { ...rowToProduct(row), related });
  },

  "POST /api/orders": async (req, res) => {
    if (!rateLimit("order:" + ipOf(req), 10, 3600e3)) return fail(res, 429, "rate_limited");
    const b = await readJson(req, 64e3);
    const c = b.customer || {};
    const name = str(c.name, 80), phone = str(c.phone, 25);
    const requestedPayment = str(b.payment?.method || c.payment_method || "manager", 30);
    const paymentMethod = PAYMENT_METHODS.includes(requestedPayment) ? requestedPayment : "manager";
    if (name.length < 2) return fail(res, 400, "name");
    if (!/^[0-9+()\-\s]{5,25}$/.test(phone)) return fail(res, 400, "phone");
    const signedInCustomer = customerFromRequest(req);
    const customer = {
      customer_id: signedInCustomer?.id || null,
      name, phone,
      email: signedInCustomer?.email || normalizeEmail(c.email || ""),
      city: str(c.city, 80), address: str(c.address, 300), comment: str(c.comment, 1000),
    };
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) return fail(res, 400, "items");
    const items = [];
    let total = 0;
    for (const it of b.items) {
      let product = null;
      if (CATALOG_SOURCE_ENABLED) {
        try { product = await catalogProductById(Number(it.id)); } catch (e) { catalogCache.error = e.message; }
      }
      const row = product ? null : db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(Number(it.id));
      if (!product && !row) return fail(res, 400, "item_unavailable");
      const qty = Math.min(20, Math.max(1, Math.round(Number(it.qty) || 1)));
      const sizes = product ? product.sizes : JSON.parse(row.sizes || "[]");
      const images = product ? product.images : JSON.parse(row.images || "[]");
      const id = product ? product.id : row.id;
      const slug = product ? product.slug : row.slug;
      const name = product ? product.name : row.name;
      const gender = product ? product.gender : row.gender;
      const category = product ? product.category : row.category;
      const size_mix = orderSizeMix(sizes, gender, category);
      const unit_price = product ? product.price : row.price;
      const price = Math.round(unit_price * ORDER_BAG_SIZE * 100) / 100;
      items.push({ id, slug, name, qty, unit_price, bag_size: ORDER_BAG_SIZE, size_mix, price, image: images[0] || "" });
      total += price * qty;
    }
    const lang = ["en", "ru", "uz"].includes(b.lang) ? b.lang : "en";
    const r = db.prepare("INSERT INTO orders (customer_id, customer, items, total, lang) VALUES (?,?,?,?,?)")
      .run(signedInCustomer?.id || null, JSON.stringify(customer), JSON.stringify(items), Math.round(total * 100) / 100, lang);
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
    audit("customer", "order.created", { order_id: r.lastInsertRowid, number, total: Math.round(total * 100) / 100 });
    audit("customer", "payment.created", { order_id: r.lastInsertRowid, payment_id: payment.lastInsertRowid, method: paymentMethod, amount });
    send(res, 201, { number, total: amount, payment: { method: paymentMethod, status: "pending", amount, currency: "USD" } });
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

  "GET /api/admin/products": (req, res) => {
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
    if (!existing) return fail(res, 404, "not_found");
    const b = await readJson(req);
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
      id: r.id, number: r.number, status: r.status, total: r.total, lang: r.lang, customer_id: r.customer_id || null,
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
    db.prepare("UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?").run(b.status, id);
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

const PAGE_ALIASES = { "/": "index.html", "/shop": "shop.html", "/support": "support.html", "/signin": "signin.html", "/signup": "signin.html", "/account": "signin.html", "/checkout": "shop.html" };
const VIEWS_DIR = path.join(ROOT, "views");

const server = http.createServer(async (req, res) => {
  let u;
  try { u = new URL(req.url, "http://x"); } catch { return fail(res, 400, "bad_url"); }
  const pathname = u.pathname;

  try {
    /* API */
    if (pathname.startsWith("/api/")) {
      Object.entries(corsHeaders(req)).forEach(([key, value]) => res.setHeader(key, value));
      if (req.method === "OPTIONS") return send(res, 204, "");
      const route = matchRoute(req.method, pathname);
      if (!route) return fail(res, 404, "not_found");
      const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      const cookieAuthPath = pathname.startsWith("/api/admin/") || pathname.startsWith("/api/auth/") || pathname === "/api/logout" || pathname === "/api/login";
      if (unsafe && cookieAuthPath && !sameOrigin(req)) return fail(res, 403, "bad_origin");
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
