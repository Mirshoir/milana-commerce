"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const STORE_FILE = path.join(DATA_DIR, "store.json");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 5411;
const WEBSITE_API_BASE = (process.env.WEBSITE_API_BASE || "https://milanapremium.uz").replace(/\/+$/, "");
const UPSTREAM_TIMEOUT_MS = Math.max(3000, Number(process.env.UPSTREAM_TIMEOUT_MS) || 15000);
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || [
  "http://localhost:5411",
  "http://127.0.0.1:5411",
  "https://localhost",
  "capacitor://localhost",
].join(",")).split(",").map((value) => value.trim()).filter(Boolean));

if (process.env.NODE_ENV === "production" && !WEBSITE_API_BASE.startsWith("https://")) {
  throw new Error("WEBSITE_API_BASE must use HTTPS in production");
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const PRODUCT_SEED = [];

function cleanString(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function loadStore() {
  try {
    const loaded = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    return normalizeStore(loaded);
  } catch {
    return normalizeStore({});
  }
}

function normalizeStore(store) {
  const products = Array.isArray(store.products) ? store.products : PRODUCT_SEED;
  return {
    products,
    orders: Array.isArray(store.orders) ? store.orders : [],
    profiles: store.profiles && typeof store.profiles === "object" ? store.profiles : {},
    wishlists: store.wishlists && typeof store.wishlists === "object" ? store.wishlists : {},
    order_refs: store.order_refs && typeof store.order_refs === "object" ? store.order_refs : {},
  };
}

let store = loadStore();
saveStore();

function saveStore() {
  const tmp = STORE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const i = part.indexOf("=");
        return i === -1 ? [part, ""] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
      }),
  );
}

function sessionId(req, headers) {
  const cookies = parseCookies(req);
  const existing = cleanString(cookies.mp_sid, 80);
  if (/^[A-Za-z0-9_-]{24,80}$/.test(existing)) return existing;
  const next = crypto.randomBytes(24).toString("base64url");
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  headers["Set-Cookie"] = `mp_sid=${encodeURIComponent(next)}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}`;
  return next;
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...headers,
  });
  res.end(payload);
}

function fail(res, status, error, headers = {}) {
  sendJson(res, status, { error }, headers);
}

function websiteUrl(pathname, search = "") {
  return WEBSITE_API_BASE + pathname + (search || "");
}

async function websiteJson(pathname, { method = "GET", body, req, search = "" } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (req?.headers.cookie) headers.cookie = req.headers.cookie;
  if (req?.headers.authorization) headers.authorization = req.headers.authorization;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(websiteUrl(pathname, search), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw Object.assign(new Error("upstream_timeout"), { status: 504 });
    throw Object.assign(new Error("upstream_unavailable"), { status: 502 });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(data.error || `website_${response.status}`);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return { data, response };
}

function readJson(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        reject(Object.assign(new Error("payload_too_large"), { status: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("invalid_json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function publicProduct(product) {
  const img = cleanString(product.img || product.image || "", 300);
  const detailImg = cleanString(product.detailImg || product.detail_image || img, 300);
  return {
    id: cleanString(product.id || product.slug, 80),
    slug: cleanString(product.slug || product.id, 80),
    name: cleanString(product.name, 120),
    price: Number(product.price) || 0,
    img,
    detailImg,
    images: Array.isArray(product.images) && product.images.length ? product.images : [img].filter(Boolean),
    category: cleanString(product.category, 80),
    gender: cleanString(product.gender || "women", 30),
    rating: Number(product.rating) || 0,
    reviews: Number(product.reviews) || 0,
    colors: Array.isArray(product.colors) ? product.colors : [],
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    defaultColor: cleanString(product.defaultColor || product.colors?.[0]?.name || "", 40),
    defaultSize: cleanString(product.defaultSize || product.sizes?.[0] || "", 20),
    active: product.active !== false,
  };
}

function firstImage(product) {
  if (Array.isArray(product.images) && product.images.length) return cleanString(product.images[0], 500);
  return cleanString(product.img || product.image || "", 500);
}

function categoryLabel(category) {
  return {
    pajamas: "Pajamas",
    robes: "Robes",
    homewear: "Homewear",
    loungewear: "Loungewear",
  }[category] || cleanString(category || "Products", 80);
}

function mobileProduct(product) {
  const image = firstImage(product);
  const sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : ["One Size"];
  const retailPrice = Number(product.retail_price);
  const price = retailPrice > 0 ? retailPrice : Number(product.price) || 0;
  return {
    id: String(product.id || product.slug || ""),
    slug: cleanString(product.slug || product.id, 100),
    name: cleanString(product.name, 160),
    price,
    img: image,
    detailImg: image,
    images: Array.isArray(product.images) && product.images.length ? product.images : [image].filter(Boolean),
    category: categoryLabel(product.category),
    rawCategory: cleanString(product.category, 80),
    gender: cleanString(product.gender || "unisex", 30),
    rating: Number(product.rating) || 4.8,
    reviews: Number(product.reviews) || 0,
    colors: [{ name: "Default", hex: "#C9AE93" }],
    sizes,
    defaultColor: "Default",
    defaultSize: sizes[0],
    active: product.active !== false,
    availableQop: product.available_qop ?? null,
    desc: product.desc && typeof product.desc === "object" ? product.desc : cleanString(product.desc, 2000),
    fabric: product.fabric && typeof product.fabric === "object" ? product.fabric : cleanString(product.fabric, 500),
    orderUnits: Array.isArray(product.order_units) ? product.order_units.slice(0, 10) : [],
  };
}

async function websiteProductById(id, req) {
  const key = encodeURIComponent(cleanString(id, 100));
  const { data } = await websiteJson(`/api/products/${key}`, { req });
  return mobileProduct(data);
}

async function wishlistProducts(ids, req) {
  const products = [];
  for (const id of ids.slice(0, 50)) {
    try {
      products.push(await websiteProductById(id, req));
    } catch {}
  }
  return products;
}

function localProductById(id) {
  const key = cleanString(id, 100).toLowerCase();
  return store.products
    .map(publicProduct)
    .find((product) => product.id.toLowerCase() === key || product.slug.toLowerCase() === key);
}

function profileFor(session) {
  if (!store.profiles[session]) {
    store.profiles[session] = {
      name: "Milana Guest",
      email: "guest@milanapremium.uz",
      phone: "",
      address: "",
      created_at: new Date().toISOString(),
    };
    saveStore();
  }
  return store.profiles[session];
}

function customerFromBody(body, session) {
  const profile = profileFor(session);
  const source = body && typeof body === "object" ? body : {};
  return {
    name: cleanString(source.name || profile.name || "Milana Guest", 80),
    email: cleanString(source.email || profile.email || "", 120),
    phone: cleanString(source.phone || profile.phone || "", 40),
    address: cleanString(source.address || profile.address || "", 300),
    comment: cleanString(source.comment || "", 500),
  };
}

async function handleApi(req, res, url) {
  const headers = {};
  const origin = String(req.headers.origin || "");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers.Vary = "Origin";
  }
  headers["Access-Control-Allow-Headers"] = "content-type, authorization";
  headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS";
  if (req.method === "OPTIONS") return sendJson(res, 204, {}, headers);

  const session = sessionId(req, headers);

  try {
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      let website = { ok: false, error: "unavailable", base: WEBSITE_API_BASE };
      try {
        const health = await websiteJson("/api/health", { req });
        website = { ...health.data, base: WEBSITE_API_BASE };
      } catch (error) {
        website.error = error.message;
      }
      return sendJson(res, 200, {
        ok: website.ok === true,
        uptime: Math.round(process.uptime()),
        website,
        local_sessions: Object.keys(store.profiles).length,
      }, headers);
    }

    if (url.pathname.startsWith("/api/auth/")) {
      const allowed = new Set([
        "/api/auth/config",
        "/api/auth/me",
        "/api/auth/otp/start",
        "/api/auth/otp/verify",
        "/api/auth/email-otp/start",
        "/api/auth/email-otp/verify",
        "/api/auth/signup",
        "/api/auth/signin",
        "/api/auth/firebase",
        "/api/auth/recover",
        "/api/auth/logout",
        "/api/auth/orders",
        "/api/auth/profile",
        "/api/auth/likes",
      ]);
      if (!allowed.has(url.pathname)) return fail(res, 404, "not_found", headers);
      const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readJson(req, 32 * 1024) : undefined;
      const { data, response } = await websiteJson(url.pathname, {
        method: req.method,
        body,
        req,
        search: url.search,
      });
      const authHeaders = { ...headers };
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) authHeaders["Set-Cookie"] = setCookie;
      return sendJson(res, response.status, data, authHeaders);
    }

    if (req.method === "GET" && url.pathname === "/api/products") {
      const upstream = new URLSearchParams(url.searchParams);
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));
      upstream.set("limit", String(limit));
      const { data } = await websiteJson("/api/products", { req, search: `?${upstream}` });
      const products = Array.isArray(data) ? data.map(mobileProduct).filter((product) => product.id) : [];
      return sendJson(res, 200, products, headers);
    }

    const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
    if (req.method === "GET" && productMatch) {
      return sendJson(res, 200, await websiteProductById(decodeURIComponent(productMatch[1]), req), headers);
    }

    if (req.method === "GET" && url.pathname === "/api/profile") {
      const orders = Array.isArray(store.order_refs[session]) ? store.order_refs[session].slice().reverse().slice(0, 20) : [];
      return sendJson(res, 200, { profile: profileFor(session), orders }, headers);
    }

    if (req.method === "PUT" && url.pathname === "/api/profile") {
      const body = await readJson(req, 16 * 1024);
      const profile = profileFor(session);
      store.profiles[session] = {
        ...profile,
        name: cleanString(body.name || profile.name, 80),
        email: cleanString(body.email || profile.email, 120),
        phone: cleanString(body.phone || profile.phone, 40),
        address: cleanString(body.address || profile.address, 300),
        updated_at: new Date().toISOString(),
      };
      saveStore();
      return sendJson(res, 200, { profile: store.profiles[session] }, headers);
    }

    if (req.method === "GET" && url.pathname === "/api/wishlist") {
      const ids = Array.isArray(store.wishlists[session]) ? store.wishlists[session] : [];
      return sendJson(res, 200, { ids, products: await wishlistProducts(ids, req) }, headers);
    }

    if (req.method === "PUT" && url.pathname === "/api/wishlist") {
      const body = await readJson(req, 16 * 1024);
      const ids = Array.isArray(body.ids) ? body.ids.map((id) => cleanString(id, 80)).filter(Boolean) : [];
      store.wishlists[session] = [...new Set(ids)].slice(0, 200);
      saveStore();
      return sendJson(res, 200, { ids: store.wishlists[session] }, headers);
    }

    if (req.method === "GET" && url.pathname === "/api/orders") {
      const orders = Array.isArray(store.order_refs[session]) ? store.order_refs[session].slice().reverse().slice(0, 50) : [];
      return sendJson(res, 200, { orders }, headers);
    }

    if (req.method === "POST" && url.pathname === "/api/orders") {
      const body = await readJson(req, 64 * 1024);
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
        return fail(res, 400, "items", headers);
      }
      const customer = customerFromBody(body.customer || {}, session);
      if (customer.name.length < 2) return fail(res, 400, "name", headers);
      if (!/^[0-9+()\-\s]{5,25}$/.test(customer.phone)) return fail(res, 400, "phone", headers);
      const payload = {
        customer,
        source: cleanString(body.source || "mobile-app", 40),
        order_type: body.order_type === "retail" ? "retail" : "wholesale",
        payment: { method: "manager" },
        items: body.items.map((item) => ({
          id: Number(item.id) || item.id,
          qty: Number(item.qty) || 1,
          unit_type: body.order_type === "retail"
            ? "piece"
            : (["qadoq", "pachka"].includes(String(item.unit_type || "").toLowerCase()) ? "pachka" : "qop"),
          color: cleanString(item.color, 40),
          size: cleanString(item.size, 20),
        })),
      };
      const { data } = await websiteJson("/api/orders", { method: "POST", body: payload, req });
      const order = {
        id: data.id || data.order_id,
        order_id: data.order_id || data.id,
        number: data.number,
        total: data.total,
        currency: data.payment?.currency || "USD",
        status: data.status || "new",
        order_type: data.order_type || payload.order_type,
        payment: data.payment || {},
        created_at: new Date().toISOString(),
      };
      store.order_refs[session] = [...(store.order_refs[session] || []), order].slice(-50);
      store.profiles[session] = {
        ...profileFor(session),
        ...Object.fromEntries(Object.entries(customer).filter(([, value]) => value)),
        updated_at: new Date().toISOString(),
      };
      saveStore();
      return sendJson(res, 201, { ...data, bridged_to: WEBSITE_API_BASE }, headers);
    }

    if (req.method === "POST" && url.pathname === "/api/support") {
      const body = await readJson(req, 24 * 1024);
      const customer = customerFromBody(body, session);
      const message = cleanString(body.message, 3000);
      if (message.length < 8) return fail(res, 400, "message", headers);
      const { data } = await websiteJson("/api/support", {
        method: "POST",
        req,
        body: { ...customer, message, topic: cleanString(body.topic || "general", 40), source: "mobile-app" },
      });
      return sendJson(res, 201, data, headers);
    }

    return fail(res, 404, "not_found", headers);
  } catch (error) {
    return fail(res, error.status || 500, error.message || "server_error", headers);
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
};

function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  if (pathname.includes("\0") || pathname.includes("..")) return false;
  const target = path.resolve(ROOT, "." + pathname);
  if (!target.startsWith(ROOT + path.sep)) return false;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return false;
  const ext = path.extname(target).toLowerCase();
  const noCache = [".html", ".js", ".css"].includes(ext);
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": noCache ? "no-cache" : "public, max-age=3600",
    ...securityHeaders(),
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(target).pipe(res);
  return true;
}

async function proxyWebsiteAsset(req, res, url) {
  if (!["/uploads/", "/storage/"].some((prefix) => url.pathname.startsWith(prefix))) return false;
  try {
    const requestHeaders = {};
    if (req.headers.range) requestHeaders.range = req.headers.range;
    const response = await fetch(websiteUrl(url.pathname, url.search), {
      method: req.method,
      headers: requestHeaders,
    });
    if (!response.ok) return false;
    const headers = {
      "Content-Type": response.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      ...securityHeaders(),
    };
    ["content-length", "content-range", "accept-ranges", "etag", "last-modified"].forEach((name) => {
      const value = response.headers.get(name);
      if (value) headers[name.replace(/(^|-)([a-z])/g, (_, dash, letter) => dash + letter.toUpperCase())] = value;
    });
    res.writeHead(response.status, headers);
    if (req.method === "HEAD") return res.end(), true;
    if (!response.body) return res.end(), true;
    const { Readable } = require("node:stream");
    Readable.fromWeb(response.body).pipe(res);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
    return handleApi(req, res, url);
  }
  if (await proxyWebsiteAsset(req, res, url)) return;
  if (serveStatic(req, res, url)) return;
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...securityHeaders() });
  res.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`Milana mobile app listening on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`Using Milana website backend at ${WEBSITE_API_BASE}`);
});
