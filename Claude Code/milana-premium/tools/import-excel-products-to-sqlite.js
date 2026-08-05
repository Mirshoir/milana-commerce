#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] || fallback : fallback;
}

const dbPath = arg("--db", path.join(__dirname, "..", "data", "milana.db"));
const inputPath = arg("--input", "");
const replaceActive = args.includes("--replace-active");

if (!inputPath) {
  console.error("Usage: node tools/import-excel-products-to-sqlite.js --db /path/milana.db --input /path/products.json [--replace-active]");
  process.exit(2);
}

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const products = Array.isArray(payload.products) ? payload.products : [];
if (!products.length) {
  console.error("No products found in input.");
  process.exit(2);
}

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y",
  ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[а-яёўқғҳ]/g, (ch) => TRANSLIT[ch] ?? "")
    .replace(/['’`ʻ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function uniqueSlug(db, base, ignoreId = 0) {
  let slug = base;
  let n = 2;
  while (db.prepare("SELECT id FROM products WHERE slug=? AND id!=?").get(slug, ignoreId)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

function existingImages(row) {
  try {
    const parsed = JSON.parse(row?.images || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanDescription(value) {
  return String(value || "")
    .replace(/\s*Photos will be uploaded manually\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

const db = new DatabaseSync(dbPath);

const columns = [
  "model_no", "variant", "gender", "category", "name",
  "desc_en", "desc_ru", "desc_uz",
  "fabric_en", "fabric_ru", "fabric_uz",
  "price", "old_price", "sizes", "images", "tag", "rating", "reviews",
  "wholesale_price", "wholesale_moq", "retail_enabled", "retail_price", "retail_stock",
  "available_qop", "active", "sort",
];

const selectByModel = db.prepare("SELECT id, images FROM products WHERE lower(model_no)=lower(?) LIMIT 1");
const insertProduct = db.prepare(`
  INSERT INTO products (slug, ${columns.join(", ")})
  VALUES (?${", ?".repeat(columns.length)})
`);
const updateProduct = db.prepare(`
  UPDATE products
  SET slug=?, ${columns.map((column) => `${column}=?`).join(", ")}
  WHERE id=?
`);

let inserted = 0;
let updated = 0;
let deactivated = 0;
const skipped = [];

function rowValues(product, images) {
  return [
    String(product.model_no || "").trim(),
    String(product.variant || "").trim(),
    product.gender || "unisex",
    product.category || "loungewear",
    String(product.name || product.model_no || "Milana product").trim(),
    cleanDescription(product.desc_en),
    cleanDescription(product.desc_ru),
    cleanDescription(product.desc_uz),
    String(product.fabric_en || ""),
    String(product.fabric_ru || ""),
    String(product.fabric_uz || ""),
    Number(product.price || product.wholesale_price || 0),
    product.old_price == null ? null : Number(product.old_price),
    JSON.stringify(Array.isArray(product.sizes) ? product.sizes : []),
    JSON.stringify(images),
    product.tag || "",
    Number(product.rating || 0),
    Math.max(0, Math.round(Number(product.reviews || 0))),
    Number(product.wholesale_price || product.price || 0),
    6,
    product.retail_enabled === 0 ? 0 : 1,
    Number(product.retail_price || product.price || 0),
    Math.max(0, Math.round(Number(product.retail_stock || 0))),
    product.available_qop == null ? null : Math.max(0, Math.round(Number(product.available_qop || 0))),
    product.active === 0 ? 0 : 1,
    Math.max(-1_000_000, Math.min(1_000_000, Math.round(Number(product.sort || 0)))),
  ];
}

try {
  db.exec("PRAGMA busy_timeout = 10000; BEGIN IMMEDIATE; CREATE TEMP TABLE import_models (model_no TEXT PRIMARY KEY);");
  const insertImportModel = db.prepare("INSERT OR IGNORE INTO import_models (model_no) VALUES (?)");

  for (const product of products) {
    const model = String(product.model_no || "").trim();
    const price = Number(product.price || product.wholesale_price || 0);
    if (!model || !product.name || !(price > 0)) {
      skipped.push({ model_no: model, reason: "missing_required_field" });
      continue;
    }

    insertImportModel.run(model);
    const existing = selectByModel.get(model);
    const images = existingImages(existing);
    const safeImages = images.length ? images : (Array.isArray(product.images) ? product.images : []);
    const slug = uniqueSlug(db, slugify(`${model} ${product.name}`), existing?.id || 0);
    const values = rowValues(product, safeImages);

    if (existing) {
      updateProduct.run(slug, ...values, existing.id);
      updated += 1;
    } else {
      insertProduct.run(slug, ...values);
      inserted += 1;
    }
  }

  if (replaceActive) {
    const result = db.prepare(`
      UPDATE products
      SET active=0
      WHERE COALESCE(model_no, '') NOT IN (SELECT model_no FROM import_models)
        AND active != 0
    `).run();
    deactivated = Number(result.changes || 0);
  }

  db.exec("COMMIT;");
} catch (error) {
  try { db.exec("ROLLBACK;"); } catch {}
  db.close();
  throw error;
}

const summary = {
  ok: true,
  db: dbPath,
  input: inputPath,
  requested: products.length,
  inserted,
  updated,
  deactivated,
  skipped,
  active_products: db.prepare("SELECT COUNT(*) c FROM products WHERE active=1").get().c,
  total_products: db.prepare("SELECT COUNT(*) c FROM products").get().c,
};

db.close();
console.log(JSON.stringify(summary, null, 2));
