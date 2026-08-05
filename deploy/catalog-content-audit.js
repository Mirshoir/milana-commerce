const { DatabaseSync } = require("node:sqlite");

const dbPath = process.argv[2];
if (!dbPath) throw new Error("Usage: node catalog-content-audit.js <database>");

const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare(`
  SELECT id, slug, name, model_no, variant, gender, category, catalog_panel,
         desc_en, desc_ru, desc_uz, fabric_en, fabric_ru, fabric_uz,
         images, active
  FROM products
  ORDER BY id
`).all();

const text = (value) => String(value || "").trim();
const images = (value) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};
const normalized = (value) => text(value).toLowerCase().replace(/\s+/g, " ");
const generatedPattern = /Wholesale orders|Оптовый заказ|Ulgurji buyurtma|Qadoq|Qop|Model |Модель |Model \S/i;
const visualPattern = /\b(color|print|collar|neckline|sleeve|closure|length|silhouette|pattern|цвет|принт|ворот|горлов|рукав|заст[её]ж|длин|силуэт|rang|naqsh|yoqa|yeng|uzun|bichim)\b/i;

const active = rows.filter((row) => row.active);
const withImages = active.filter((row) => images(row.images).length);
const sameThree = (row, prefix) => {
  const values = ["en", "ru", "uz"].map((lang) => normalized(row[`${prefix}_${lang}`])).filter(Boolean);
  return values.length === 3 && new Set(values).size === 1;
};
const missing = (row, field) => !text(row[field]);
const count = (predicate) => active.filter(predicate).length;
const topValues = (field, limit = 15) => {
  const counts = new Map();
  for (const row of active) {
    const value = text(row[field]) || "(missing)";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, total]) => ({ value, total }));
};

const samples = active
  .filter((row) => images(row.images).length)
  .slice(0, 12)
  .map((row) => ({
    id: row.id,
    name: row.name,
    model_no: row.model_no,
    panel: row.catalog_panel,
    image: images(row.images)[0],
    desc_en: text(row.desc_en),
    desc_ru: text(row.desc_ru),
    desc_uz: text(row.desc_uz),
    fabric_en: text(row.fabric_en),
    fabric_ru: text(row.fabric_ru),
    fabric_uz: text(row.fabric_uz),
  }));

console.log(JSON.stringify({
  totals: {
    all: rows.length,
    active: active.length,
    active_with_images: withImages.length,
    active_without_images: count((row) => !images(row.images).length),
  },
  descriptions: {
    missing_en: count((row) => missing(row, "desc_en")),
    missing_ru: count((row) => missing(row, "desc_ru")),
    missing_uz: count((row) => missing(row, "desc_uz")),
    identical_all_languages: count((row) => sameThree(row, "desc")),
    generated_template_en: count((row) => generatedPattern.test(text(row.desc_en))),
    generated_template_ru: count((row) => generatedPattern.test(text(row.desc_ru))),
    generated_template_uz: count((row) => generatedPattern.test(text(row.desc_uz))),
    visibly_specific_en: count((row) => visualPattern.test(text(row.desc_en))),
  },
  fabric: {
    missing_en: count((row) => missing(row, "fabric_en")),
    missing_ru: count((row) => missing(row, "fabric_ru")),
    missing_uz: count((row) => missing(row, "fabric_uz")),
    identical_all_languages: count((row) => sameThree(row, "fabric")),
    top_en: topValues("fabric_en"),
    top_ru: topValues("fabric_ru"),
    top_uz: topValues("fabric_uz"),
  },
  id_ranges: {
    active_at_or_below_416: count((row) => Number(row.id) <= 416),
    active_above_416: count((row) => Number(row.id) > 416),
  },
  samples,
}, null, 2));
