"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { Client } = require("pg");
const { PRODUCT_REQUIRED_COLUMNS } = require("../lib/postgres-catalog");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const sqlitePath = process.env.SQLITE_DB || path.join(DATA_DIR, "milana.db");
const TABLES = [
  "products", "customers", "promo_codes", "orders", "payments", "telegram_order_outbox",
  "support_requests", "subscribers", "settings", "sessions",
  "customer_sessions", "customer_coupons", "phone_otps", "email_otps",
  "likes", "reviews", "chat_sessions", "chat_messages",
  "catalog_product_overrides", "audit_events",
];

function sqliteTableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

const PRODUCT_SAMPLE_COLUMNS = [
  "id", "slug", "model_no", "variant", "name", "product_type",
  "size_chart", "color", "country", "material", "season", "composition",
  "desc_en", "desc_ru", "desc_uz", "fabric_en", "fabric_ru", "fabric_uz",
  "copy_manual", "preorder", "images", "active",
];
const PRODUCT_SAMPLE_BOOLEAN_COLUMNS = new Set(["copy_manual", "preorder", "active"]);

function normalizedProductSampleValue(column, value) {
  if (column === "id") return Number(value);
  if (column === "images") {
    if (Array.isArray(value)) return JSON.stringify(value);
    try { return JSON.stringify(JSON.parse(value || "[]")); } catch { return "[]"; }
  }
  if (PRODUCT_SAMPLE_BOOLEAN_COLUMNS.has(column)) return Boolean(value);
  return value == null ? "" : String(value);
}

async function main() {
  if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite database not found: ${sqlitePath}`);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const postgres = new Client({ connectionString: process.env.DATABASE_URL });
  await postgres.connect();
  const checks = [];
  let ok = true;
  try {
    for (const table of TABLES) {
      if (!sqliteTableExists(sqlite, table)) {
        checks.push({ table, skipped: "missing_in_sqlite" });
        continue;
      }
      const sqliteColumns = sqlite.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
      const pgColumnResult = await postgres.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema=current_schema() AND table_name=$1
         ORDER BY ordinal_position`,
        [table],
      );
      const pgColumns = new Set(pgColumnResult.rows.map((row) => row.column_name));
      const missingColumns = sqliteColumns.filter((column) => !pgColumns.has(column));
      const missingRequiredColumns = table === "products"
        ? PRODUCT_REQUIRED_COLUMNS.filter((column) => !pgColumns.has(column))
        : [];
      const sqliteCount = Number(sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c);
      const pgCount = Number((await postgres.query(`SELECT COUNT(*)::bigint AS c FROM "${table}"`)).rows[0].c);
      const tableOk = missingColumns.length === 0
        && missingRequiredColumns.length === 0
        && sqliteCount === pgCount;
      ok = ok && tableOk;
      checks.push({
        table,
        ok: tableOk,
        sqlite: sqliteCount,
        postgres: pgCount,
        missingColumns,
        missingRequiredColumns,
      });
    }

    if (sqliteTableExists(sqlite, "products")) {
      const sqliteProducts = sqlite.prepare(`
        SELECT COUNT(*) total,
               SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) active,
               SUM(CASE WHEN images IS NOT NULL AND images NOT IN ('', '[]') THEN 1 ELSE 0 END) with_images
        FROM products
      `).get();
      const pgProducts = (await postgres.query(`
        SELECT COUNT(*)::bigint total,
               COUNT(*) FILTER (WHERE active)::bigint active,
               COUNT(*) FILTER (WHERE jsonb_array_length(images)>0)::bigint with_images
        FROM products
      `)).rows[0];
      const productSummary = {
        sqlite: Object.fromEntries(Object.entries(sqliteProducts).map(([key, value]) => [key, Number(value || 0)])),
        postgres: Object.fromEntries(Object.entries(pgProducts).map(([key, value]) => [key, Number(value || 0)])),
      };
      productSummary.ok = JSON.stringify(productSummary.sqlite) === JSON.stringify(productSummary.postgres);
      ok = ok && productSummary.ok;
      checks.push({ productSummary });

      const sqliteProductColumns = new Set(
        sqlite.prepare("PRAGMA table_info(products)").all().map((row) => row.name),
      );
      const postgresProductColumns = new Set((await postgres.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='products'
      `)).rows.map((row) => row.column_name));
      const sampleColumns = PRODUCT_SAMPLE_COLUMNS.filter((column) => (
        sqliteProductColumns.has(column) && postgresProductColumns.has(column)
      ));
      const sampleProjection = sampleColumns.map((column) => `"${column}"`).join(", ");
      const edgeRows = [
        ...sqlite.prepare(`SELECT ${sampleProjection} FROM products ORDER BY id LIMIT 10`).all(),
        ...sqlite.prepare(`SELECT ${sampleProjection} FROM products ORDER BY id DESC LIMIT 10`).all(),
      ];
      const samples = [...new Map(edgeRows.map((row) => [Number(row.id), row])).values()];
      const ids = samples.map((row) => Number(row.id));
      const pgSampleRows = ids.length
        ? (await postgres.query(
            `SELECT ${sampleProjection} FROM products WHERE id=ANY($1::int[])`,
            [ids],
          )).rows
        : [];
      const pgById = new Map(pgSampleRows.map((row) => [Number(row.id), row]));
      const sampleMismatches = samples.filter((sqliteRow) => {
        const pgRow = pgById.get(Number(sqliteRow.id));
        if (!pgRow) return true;
        return sampleColumns.some((column) => (
          normalizedProductSampleValue(column, pgRow[column])
          !== normalizedProductSampleValue(column, sqliteRow[column])
        ));
      }).map((row) => Number(row.id));
      const productSamples = {
        ok: sampleMismatches.length === 0,
        checked: samples.length,
        columns: sampleColumns,
        mismatchIds: sampleMismatches,
      };
      ok = ok && productSamples.ok;
      checks.push({ productSamples });
    }

    const result = { ok, sqlite: sqlitePath, checks };
    console.log(JSON.stringify(result, null, 2));
    if (!ok) process.exitCode = 2;
  } finally {
    sqlite.close();
    await postgres.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
