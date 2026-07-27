"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const sqlitePath = process.env.SQLITE_DB || path.join(DATA_DIR, "milana.db");
const schemaPath = path.join(ROOT, "postgres", "schema.sql");
const dryRun = process.argv.includes("--dry-run");

const TABLES = [
  "products",
  "customers",
  "promo_codes",
  "orders",
  "payments",
  "support_requests",
  "subscribers",
  "settings",
  "sessions",
  "customer_sessions",
  "customer_coupons",
  "phone_otps",
  "email_otps",
  "likes",
  "reviews",
  "chat_sessions",
  "chat_messages",
  "catalog_product_overrides",
  "audit_events",
];

const JSON_COLUMNS = new Set([
  "products.sizes",
  "products.images",
  "orders.customer",
  "orders.items",
  "payments.payload",
  "customer_coupons.metadata",
  "audit_events.meta",
]);

const BOOLEAN_COLUMNS = new Set([
  "products.active",
  "products.retail_enabled",
  "customers.phone_verified",
  "promo_codes.active",
  "reviews.verified_purchase",
  "catalog_product_overrides.active",
]);
const BATCH_ROWS = Math.max(50, Math.min(2000, Number(process.env.MIGRATION_BATCH_ROWS) || 500));

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function columnsFor(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeValue(table, column, value, row = {}) {
  if (JSON_COLUMNS.has(`${table}.${column}`)) {
    return JSON.stringify(parseJson(value, column.endsWith("s") ? [] : {}));
  }
  if (BOOLEAN_COLUMNS.has(`${table}.${column}`)) return Boolean(value);
  if ((column === "created_at" || column === "updated_at") && (value == null || value === "")) {
    return row.created_at || new Date(0).toISOString();
  }
  return value;
}

async function upsertRows(client, table, rows, columns) {
  if (!rows.length) return 0;
  const conflictColumn = ["settings", "sessions", "customer_sessions", "phone_otps", "email_otps", "catalog_product_overrides"].includes(table)
    ? columns[0] : "id";
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const updates = columns
    .filter((column) => column !== conflictColumn)
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(", ");
  const maxRowsPerQuery = Math.max(1, Math.floor(60_000 / Math.max(1, columns.length)));
  for (let start = 0; start < rows.length; start += maxRowsPerQuery) {
    const chunk = rows.slice(start, start + maxRowsPerQuery);
    const values = [];
    const tuples = chunk.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(normalizeValue(table, column, row[column], row));
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    const sql = `
      INSERT INTO "${table}" (${quotedColumns})
      VALUES ${tuples.join(", ")}
      ON CONFLICT ("${conflictColumn}") DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}
    `;
    await client.query(sql, values);
  }
  return rows.length;
}

async function migrateTable(client, sqlite, table, columns) {
  const hasId = columns.includes("id");
  let migrated = 0;
  let lastId = 0;
  while (true) {
    const projection = columns.map((column) => `"${column}"`).join(", ");
    const rows = hasId
      ? sqlite.prepare(`SELECT ${projection} FROM ${table} WHERE id>? ORDER BY id LIMIT ?`).all(lastId, BATCH_ROWS)
      : migrated === 0
        ? sqlite.prepare(`SELECT ${projection} FROM ${table}`).all()
        : [];
    if (!rows.length) break;
    await upsertRows(client, table, rows, columns);
    migrated += rows.length;
    if (hasId) lastId = Number(rows[rows.length - 1].id);
    if (hasId && migrated % (BATCH_ROWS * 10) === 0) {
      console.error(`Migrated ${table}: ${migrated} rows`);
    }
  }
  return migrated;
}

async function resetSequence(client, table) {
  const identityTables = new Set([
    "products",
    "customers",
    "orders",
    "payments",
    "support_requests",
    "subscribers",
    "promo_codes",
    "customer_coupons",
    "likes",
    "reviews",
    "chat_sessions",
    "chat_messages",
    "audit_events",
  ]);
  if (!identityTables.has(table)) return;
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence($1, 'id'),
       COALESCE((SELECT MAX(id) FROM "${table}"), 1),
       EXISTS (SELECT 1 FROM "${table}")
     )`,
    [table],
  );
}

async function main() {
  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite database not found: ${sqlitePath}`);
    process.exit(1);
  }

  const sqlite = new DatabaseSync(sqlitePath);
  const plan = [];
  for (const table of TABLES) {
    if (!tableExists(sqlite, table)) {
      plan.push({ table, rows: 0, skipped: "missing" });
      continue;
    }
    const count = sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
    plan.push({ table, rows: count });
  }

  if (dryRun) {
    sqlite.close();
    console.log(JSON.stringify({ ok: true, dryRun: true, sqlite: sqlitePath, plan }, null, 2));
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    sqlite.close();
    console.error("DATABASE_URL is required unless --dry-run is used.");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(fs.readFileSync(schemaPath, "utf8"));
    await client.query("BEGIN");
    const migrated = [];
    for (const table of TABLES) {
      if (!tableExists(sqlite, table)) {
        migrated.push({ table, rows: 0, skipped: "missing" });
        continue;
      }
      const sqliteColumns = columnsFor(sqlite, table);
      const postgresColumns = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const allowed = new Set(postgresColumns.rows.map((row) => row.column_name));
      const columns = sqliteColumns.filter((column) => allowed.has(column));
      const count = await migrateTable(client, sqlite, table, columns);
      await resetSequence(client, table);
      migrated.push({ table, rows: count });
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, sqlite: sqlitePath, migrated }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    sqlite.close();
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
