"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  PostgresCatalog,
  PRODUCT_COLUMNS,
  PRODUCT_REQUIRED_COLUMNS,
} = require("../lib/postgres-catalog");

const ROOT = path.resolve(__dirname, "..");
const ADMIN_PRODUCT_FIELDS = [
  "size_chart", "color", "country", "material", "season", "composition",
];

function catalogWithPool(query, options = {}) {
  const catalog = Object.create(PostgresCatalog.prototype);
  catalog.pool = { query };
  catalog.engagementEnabled = options.engagementEnabled !== false;
  catalog.productSchemaPromise = null;
  return catalog;
}

test("PostgreSQL schema declares and upgrades every admin-visible product field", () => {
  const schema = fs.readFileSync(path.join(ROOT, "postgres", "schema.sql"), "utf8");
  for (const column of [
    ...ADMIN_PRODUCT_FIELDS,
    "product_type", "preorder", "copy_manual", "name_en", "name_uz", "views",
  ]) {
    assert.ok(PRODUCT_REQUIRED_COLUMNS.includes(column), `${column} is required at runtime`);
    assert.match(schema, new RegExp(`\\b${column}\\s+`), `${column} is declared`);
    assert.match(
      schema,
      new RegExp(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${column}\\s+`),
      `${column} has a backward-compatible upgrade`,
    );
  }
  for (const column of ADMIN_PRODUCT_FIELDS) {
    assert.ok(PRODUCT_COLUMNS.has(column), `${column} is writable`);
  }
  assert.match(schema, /retail_stock INTEGER DEFAULT 0/);
  assert.match(schema, /ALTER TABLE products ALTER COLUMN retail_stock DROP NOT NULL/);
});

test("PostgresCatalog upgrades, saves, and reloads all admin product fields", async () => {
  const queries = [];
  let stored = null;
  const initiallyMissing = new Set([
    ...ADMIN_PRODUCT_FIELDS,
    "product_type", "preorder", "copy_manual",
  ]);
  const query = async (sql, params = []) => {
    queries.push({ sql, params: [...params] });
    if (sql.includes("FROM information_schema.columns")) {
      return {
        rows: PRODUCT_REQUIRED_COLUMNS
          .filter((column) => !initiallyMissing.has(column))
          .map((column_name) => ({
            column_name,
            is_nullable: column_name === "retail_stock" ? "NO" : "YES",
          })),
      };
    }
    if (sql.startsWith("ALTER TABLE products")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("INSERT INTO products")) {
      const columns = sql.match(/INSERT INTO products \(([^)]+)\)/)[1]
        .split(",")
        .map((column) => column.replaceAll("\"", "").trim());
      stored = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
      stored.id = 91;
      return { rows: [stored], rowCount: 1 };
    }
    if (sql.includes("SELECT products.*") && sql.includes("WHERE products.id=")) {
      return { rows: stored ? [stored] : [], rowCount: stored ? 1 : 0 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const catalog = catalogWithPool(query);
  const values = {
    name: "Capri",
    category: "loungewear",
    product_type: "capri",
    price: 14,
    retail_stock: null,
    size_chart: "48 | 96 | 72 | 22",
    color: "Burgundy",
    country: "Uzbekistan",
    material: "Suprem",
    season: "Demi-season",
    composition: "100% cotton",
    copy_manual: 1,
    preorder: 1,
  };

  const created = await catalog.create("qa-capri", values);
  const reloaded = await catalog.getById(created.id);

  assert.deepEqual(reloaded, created);
  for (const field of ADMIN_PRODUCT_FIELDS) assert.equal(reloaded[field], values[field]);
  assert.equal(reloaded.product_type, "capri");
  assert.equal(reloaded.preorder, true);
  assert.equal(reloaded.copy_manual, true);
  assert.equal(reloaded.retail_stock, null);

  const alter = queries.find(({ sql }) => sql.startsWith("ALTER TABLE products"))?.sql || "";
  for (const column of initiallyMissing) {
    assert.match(alter, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"\\s+`));
  }
  assert.match(alter, /ALTER COLUMN "retail_stock" DROP NOT NULL/);
  assert.equal(
    queries.filter(({ sql }) => sql.includes("FROM information_schema.columns")).length,
    1,
    "schema upgrade is cached for later reads",
  );
});

test("PostgresCatalog preserves product_type and collection filters together", async () => {
  const queries = [];
  const query = async (sql, params = []) => {
    queries.push({ sql, params: [...params] });
    if (sql.includes("FROM information_schema.columns")) {
      return { rows: PRODUCT_REQUIRED_COLUMNS.map((column_name) => ({ column_name })) };
    }
    if (sql.startsWith("SELECT COUNT(*)")) return { rows: [{ total: "1" }] };
    if (sql.includes("SELECT products.*")) {
      return { rows: [{ id: 1, product_type: "capri", collection: "summer" }] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const catalog = catalogWithPool(query);

  const result = await catalog.list({
    filters: { product_type: "capri", collection: "summer" },
    search: "Suprem",
    limit: 10,
    offset: 0,
  });

  assert.equal(result.total, 1);
  const count = queries.find(({ sql }) => sql.startsWith("SELECT COUNT(*)"));
  assert.match(count.sql, /product_type=\$1/);
  assert.match(count.sql, /collection=\$2/);
  assert.match(count.sql, /lower\(material\) LIKE \$3/);
  assert.deepEqual(count.params, ["capri", "summer", "%suprem%"]);
});

test("PostgresCatalog popular sort uses only approved verified review aggregates", async () => {
  const queries = [];
  const query = async (sql, params = []) => {
    queries.push({ sql, params: [...params] });
    if (sql.includes("FROM information_schema.columns")) {
      return {
        rows: PRODUCT_REQUIRED_COLUMNS.map((column_name) => ({
          column_name,
          is_nullable: "YES",
        })),
      };
    }
    if (sql.startsWith("SELECT COUNT(*)")) return { rows: [{ total: "1" }] };
    if (sql.includes("SELECT products.*")) return { rows: [{ id: 1 }] };
    throw new Error(`Unexpected query: ${sql}`);
  };
  const catalog = catalogWithPool(query);

  await catalog.list({ sort: "popular", limit: 10, offset: 0 });

  const rows = queries.find(({ sql }) => sql.includes("SELECT products.*"));
  assert.match(rows.sql, /FROM reviews public_reviews/);
  assert.match(rows.sql, /public_reviews\.status='approved'/);
  assert.match(rows.sql, /public_reviews\.verified_purchase=true/);
  assert.match(rows.sql, /AVG\(public_reviews\.rating\)/);
  assert.match(rows.sql, /FROM likes public_likes/);
  assert.match(rows.sql, /ORDER BY public_review_count DESC, public_rating DESC/);
  assert.doesNotMatch(rows.sql, /ORDER BY reviews DESC, rating DESC/);
});

test("PostgresCatalog reads variants and increments views in PostgreSQL", async () => {
  const queries = [];
  const query = async (sql, params = []) => {
    queries.push({ sql, params: [...params] });
    if (sql.includes("FROM information_schema.columns")) {
      return {
        rows: PRODUCT_REQUIRED_COLUMNS.map((column_name) => ({
          column_name,
          is_nullable: "YES",
        })),
      };
    }
    if (sql.includes("lower(btrim(model_no))")) {
      return {
        rows: [
          { id: 1, slug: "model-v1", variant: "V1", images: ["/one.jpg"], preorder: false },
          { id: 2, slug: "model-v2", variant: "V2", images: ["/two.jpg"], preorder: true },
        ],
      };
    }
    if (sql.includes("SET views=COALESCE(views, 0)+1")) {
      return { rows: [{ views: "12" }], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const catalog = catalogWithPool(query);

  const variants = await catalog.variantsByModel("TJ-2182", 24);
  const views = await catalog.incrementViews(2);

  assert.equal(variants.length, 2);
  assert.equal(variants[0].slug, "model-v1");
  assert.equal(views, 12);
  const variantQuery = queries.find(({ sql }) => sql.includes("lower(btrim(model_no))"));
  assert.match(variantQuery.sql, /AND active=true/);
  assert.deepEqual(variantQuery.params, ["TJ-2182", 24]);
  const viewQuery = queries.find(({ sql }) => sql.includes("SET views=COALESCE"));
  assert.deepEqual(viewQuery.params, [2]);
  assert.match(viewQuery.sql, /RETURNING views/);
});

test("PostgresCatalog mixed mode does not require PostgreSQL engagement tables", async () => {
  const queries = [];
  const query = async (sql, params = []) => {
    queries.push({ sql, params: [...params] });
    if (sql.includes("FROM information_schema.columns")) {
      return {
        rows: PRODUCT_REQUIRED_COLUMNS.map((column_name) => ({
          column_name,
          is_nullable: "YES",
        })),
      };
    }
    if (sql.startsWith("SELECT COUNT(*)")) return { rows: [{ total: "1" }] };
    if (sql.includes("SELECT products.* FROM products")) {
      return { rows: [{ id: 1, slug: "mixed-mode" }] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const catalog = catalogWithPool(query, { engagementEnabled: false });

  await catalog.list({ sort: "popular", limit: 10, offset: 0 });
  await catalog.getById(1, true);

  const productQueries = queries.filter(({ sql }) => sql.includes("SELECT products.* FROM products"));
  assert.equal(productQueries.length, 2);
  for (const { sql } of productQueries) {
    assert.doesNotMatch(sql, /FROM reviews|FROM likes|public_review_count|public_like_count/);
  }
  assert.match(productQueries[0].sql, /ORDER BY sort DESC, id DESC/);
});

test("server bridges PostgreSQL engagement, variants, views, and numeric product IDs", () => {
  const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  assert.match(server, /engagementEnabled:\s*POSTGRES_COMMERCE_ENABLED/);
  assert.match(server, /public_review_count === undefined/);
  assert.match(server, /likes:\s*Number\(r\.public_like_count\)/);
  assert.match(server, /await postgresCatalog\.variantsByModel\(model,\s*24\)/);
  assert.match(server, /await postgresCatalog\.incrementViews\(id\)/);
  assert.match(server, /validRequestedId[\s\S]{0,120}await postgresCatalog\.getById\(requestedId,\s*true\)/);
  assert.match(server, /variants:\s*await modelVariants\(localProduct\)/);
});
