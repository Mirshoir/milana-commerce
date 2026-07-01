"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));

loadEnvFile(path.join(DATA_DIR, "supabase.env"));

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const TABLE = process.env.SUPABASE_PRODUCTS_TABLE || "milana_products";
const IMAGE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET || "product-images";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in data/supabase.env");
  process.exit(1);
}

const CATALOGS = [
  { source_pdf: "01_Staple_Model_Catalog.pdf", gender: "women", category: "loungewear" },
  { source_pdf: "02_Milana_Man_Premium_Collection.pdf", gender: "men", category: "loungewear" },
  { source_pdf: "03_Kindergarten_Set.pdf", gender: "kids", category: "pajamas" },
  { source_pdf: "04_Milana_Products_in_Stock.pdf", gender: "women", category: "loungewear" },
];

function loadEnvFile(file) {
  try {
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => {
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

const str = (v, max = 1000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const htmlText = (v, max = 5000) => str(v, max).replace(/\s+/g, " ").trim();
const catalogSourceMeta = (source) => CATALOGS.find((c) => c.source_pdf === source) || CATALOGS[3];

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

function encodeStoragePath(p) {
  return String(p).split("/").map(encodeURIComponent).join("/");
}

function imageUrl(row, width = 900, quality = 76) {
  const explicit = str(row.image_url, 1000);
  if (explicit) return explicit;
  const bucket = str(row.image_storage_bucket, 120) || IMAGE_BUCKET;
  const imgPath = str(row.image_storage_path, 1000).replace(/^\/+/, "");
  if (!imgPath) return "";
  const params = new URLSearchParams({ width: String(width), quality: String(quality), resize: "contain" });
  return `${SUPABASE_URL}/storage/v1/render/image/public/${encodeURIComponent(bucket)}/${encodeStoragePath(imgPath)}?${params}`;
}

function parseSizes(text) {
  const found = [];
  const seen = new Set();
  String(text || "").split(/\s+/).forEach((token) => {
    const clean = token.replace(/[^\dA-Za-z]/g, "").toUpperCase();
    const numeric = /^\d{2}$/.test(clean) ? Number(clean) : 0;
    const ok = numeric >= 24 && numeric <= 60 && numeric % 2 === 0;
    if (ok && !seen.has(clean)) {
      seen.add(clean);
      found.push(clean);
    }
  });
  return found.slice(0, 12);
}

function fabric(row) {
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

function category(row) {
  const meta = catalogSourceMeta(row.source_pdf);
  const text = String([row.combined_text, row.native_text, row.ocr_text, row.model_code, row.product_code].filter(Boolean).join(" ")).toLowerCase();
  if (/robe|halat|халат/.test(text)) return "robes";
  if (/pajama|pijama|пижам|sleep|kindergarten|садик|bog/.test(text)) return "pajamas";
  if (/home|waffle|cotton|sweat|hood|футбол|t-?shirt/.test(text)) return "homewear";
  return meta.category;
}

function productName(row) {
  const model = str(row.model_code, 80);
  const code = str(row.product_code, 80);
  if (model && code && model !== code) return `${model} / ${code}`;
  return model || code || `Catalog item ${row.id}`;
}

function mapRow(row) {
  const meta = catalogSourceMeta(row.source_pdf);
  const name = productName(row);
  const text = htmlText(row.combined_text || row.native_text || row.ocr_text || "", 5000);
  const img = imageUrl(row);
  const model = str(row.model_code, 80);
  const code = str(row.product_code, 80);
  const slugBase = slugify([name, row.source_pdf, row.page, row.card_index].filter(Boolean).join("-"));
  return {
    id: Number(row.id),
    slug: "catalog-" + row.id + "-" + slugBase,
    model_no: model,
    variant: code,
    gender: meta.gender,
    category: category(row),
    name,
    desc_en: text,
    desc_ru: text,
    desc_uz: text,
    fabric_en: fabric(row),
    fabric_ru: fabric(row),
    fabric_uz: fabric(row),
    price: Number(row.price) || 0,
    old_price: null,
    sizes: JSON.stringify(parseSizes(text)),
    images: JSON.stringify(img ? [img] : []),
    tag: /\bSALE\b/i.test(String(row.combined_text || row.native_text || row.ocr_text || "")) ? "sale" : "",
    rating: 4.8,
    reviews: 0,
    active: 1,
    sort: 1_000_000 - (Number(row.page) || 0) * 100 - (Number(row.card_index) || 0),
    created_at: row.created_at || new Date().toISOString(),
  };
}

async function fetchRows() {
  const fullSelect = [
    "id", "source_pdf", "page", "card_index", "model_code", "product_code", "material_type",
    "price", "currency", "image_url", "image_storage_bucket", "image_storage_path",
    "extraction_status", "native_text", "ocr_text", "combined_text", "created_at",
  ].join(",");
  let url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(TABLE)}?select=${fullSelect}&price=not.is.null&order=source_pdf.asc,page.asc,card_index.asc&limit=1000`;
  let res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
  });
  if (!res.ok) {
    const fallbackSelect = fullSelect.replace("material_type,", "");
    url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(TABLE)}?select=${fallbackSelect}&price=not.is.null&order=source_pdf.asc,page.asc,card_index.asc&limit=1000`;
    res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
    });
  }
  if (!res.ok) throw new Error(`Supabase import failed: HTTP ${res.status} ${await res.text()}`);
  return await res.json();
}

async function main() {
  const rows = await fetchRows();
  const products = rows
    .filter((row) => row && row.extraction_status !== "admin_hidden")
    .map(mapRow)
    .filter((p) => p.id && p.price > 0 && JSON.parse(p.images).length);

  const db = new DatabaseSync(path.join(DATA_DIR, "milana.db"));
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");

  const seed = require(path.join(ROOT, "seed.js"));
  const seedSlugs = (seed.products || []).map((p) => p.slug);
  const deactivateSeed = db.prepare("UPDATE products SET active=0, sort=-100000 WHERE slug=?");
  seedSlugs.forEach((slug) => deactivateSeed.run(slug));

  const cols = [
    "slug", "model_no", "variant", "gender", "category", "name",
    "desc_en", "desc_ru", "desc_uz", "fabric_en", "fabric_ru", "fabric_uz",
    "price", "old_price", "sizes", "images", "tag", "rating", "reviews", "active", "sort", "created_at",
  ];
  const update = cols.map((c) => `${c}=excluded.${c}`).join(",");
  const stmt = db.prepare(`
    INSERT INTO products (id, ${cols.join(",")})
    VALUES (?${",?".repeat(cols.length)})
    ON CONFLICT(id) DO UPDATE SET ${update}
  `);

  db.exec("BEGIN");
  try {
    for (const p of products) stmt.run(p.id, ...cols.map((c) => p[c]));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  const active = db.prepare("SELECT COUNT(*) c FROM products WHERE active=1").get().c;
  const total = db.prepare("SELECT COUNT(*) c FROM products").get().c;
  db.close();

  console.log(JSON.stringify({
    fetched_rows: rows.length,
    imported_products: products.length,
    active_products: active,
    total_products_in_db: total,
  }, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
