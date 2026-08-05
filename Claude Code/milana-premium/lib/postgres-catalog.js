"use strict";

const { Pool } = require("pg");

const PRODUCT_COLUMNS = new Set([
  "name", "model_no", "variant", "gender", "category", "catalog_panel", "product_type", "price", "old_price",
  "tag", "collection", "rating", "reviews", "wholesale_price", "wholesale_moq",
  "retail_enabled", "retail_price", "retail_stock", "available_qop", "sizes",
  "images", "desc_en", "desc_ru", "desc_uz", "fabric_en", "fabric_ru",
  "fabric_uz", "size_chart", "color", "country", "material", "season",
  "composition", "copy_manual", "preorder", "active", "sort",
]);

const PRODUCT_RUNTIME_COLUMN_DEFINITIONS = Object.freeze({
  model_no: "TEXT NOT NULL DEFAULT ''",
  variant: "TEXT NOT NULL DEFAULT ''",
  gender: "TEXT NOT NULL DEFAULT 'unisex'",
  catalog_panel: "TEXT NOT NULL DEFAULT ''",
  product_type: "TEXT NOT NULL DEFAULT ''",
  name_en: "TEXT NOT NULL DEFAULT ''",
  name_uz: "TEXT NOT NULL DEFAULT ''",
  desc_en: "TEXT NOT NULL DEFAULT ''",
  desc_ru: "TEXT NOT NULL DEFAULT ''",
  desc_uz: "TEXT NOT NULL DEFAULT ''",
  fabric_en: "TEXT NOT NULL DEFAULT ''",
  fabric_ru: "TEXT NOT NULL DEFAULT ''",
  fabric_uz: "TEXT NOT NULL DEFAULT ''",
  size_chart: "TEXT NOT NULL DEFAULT ''",
  color: "TEXT NOT NULL DEFAULT ''",
  country: "TEXT NOT NULL DEFAULT ''",
  material: "TEXT NOT NULL DEFAULT ''",
  season: "TEXT NOT NULL DEFAULT ''",
  composition: "TEXT NOT NULL DEFAULT ''",
  copy_manual: "BOOLEAN NOT NULL DEFAULT false",
  old_price: "NUMERIC(12, 2)",
  sizes: "JSONB NOT NULL DEFAULT '[]'::jsonb",
  images: "JSONB NOT NULL DEFAULT '[]'::jsonb",
  tag: "TEXT NOT NULL DEFAULT ''",
  collection: "TEXT NOT NULL DEFAULT ''",
  rating: "NUMERIC(3, 2) NOT NULL DEFAULT 0",
  reviews: "INTEGER NOT NULL DEFAULT 0",
  wholesale_price: "NUMERIC(12, 2) NOT NULL DEFAULT 0",
  wholesale_moq: "INTEGER NOT NULL DEFAULT 6",
  retail_enabled: "BOOLEAN NOT NULL DEFAULT true",
  retail_price: "NUMERIC(12, 2) NOT NULL DEFAULT 0",
  retail_stock: "INTEGER DEFAULT 0",
  available_qop: "NUMERIC(12, 3)",
  like_count: "INTEGER NOT NULL DEFAULT 0",
  views: "INTEGER NOT NULL DEFAULT 0",
  preorder: "BOOLEAN NOT NULL DEFAULT false",
  active: "BOOLEAN NOT NULL DEFAULT true",
  sort: "INTEGER NOT NULL DEFAULT 0",
  created_at: "TIMESTAMPTZ NOT NULL DEFAULT now()",
  updated_at: "TIMESTAMPTZ NOT NULL DEFAULT now()",
});

const PRODUCT_REQUIRED_COLUMNS = Object.freeze([
  "id", "slug", "name", "category", "price",
  ...Object.keys(PRODUCT_RUNTIME_COLUMN_DEFINITIONS),
]);

const PRODUCT_SELECT_WITH_ENGAGEMENT = `
  SELECT products.*,
    COALESCE((
      SELECT COUNT(*)::int
      FROM reviews public_reviews
      WHERE public_reviews.product_id=products.id
        AND public_reviews.product_slug=products.slug
        AND public_reviews.status='approved'
        AND public_reviews.verified_purchase=true
    ), 0) AS public_review_count,
    COALESCE((
      SELECT AVG(public_reviews.rating)
      FROM reviews public_reviews
      WHERE public_reviews.product_id=products.id
        AND public_reviews.product_slug=products.slug
        AND public_reviews.status='approved'
        AND public_reviews.verified_purchase=true
    ), 0) AS public_rating,
    COALESCE((
      SELECT COUNT(*)::int
      FROM likes public_likes
      WHERE public_likes.product_id=products.id
    ), 0) AS public_like_count
  FROM products
`;

function productValue(column, value) {
  if (column === "sizes" || column === "images") {
    if (typeof value === "string") {
      try { return JSON.stringify(JSON.parse(value)); } catch { return "[]"; }
    }
    return JSON.stringify(Array.isArray(value) ? value : []);
  }
  if (column === "active" || column === "retail_enabled" || column === "copy_manual" || column === "preorder") return Boolean(value);
  return value;
}

class PostgresCatalog {
  constructor(options = {}) {
    if (!options.connectionString) throw new Error("DATABASE_URL is required for the PostgreSQL catalog.");
    this.pool = new Pool({
      connectionString: options.connectionString,
      max: Math.max(2, Math.min(50, Number(options.max) || 10)),
      min: Math.max(0, Math.min(10, Number(options.min) || 0)),
      idleTimeoutMillis: Math.max(1_000, Number(options.idleTimeoutMillis) || 30_000),
      connectionTimeoutMillis: Math.max(1_000, Number(options.connectionTimeoutMillis) || 5_000),
      statement_timeout: Math.max(1_000, Number(options.statementTimeoutMillis) || 15_000),
      application_name: options.applicationName || "milana-storefront",
    });
    this.pool.on("error", (error) => console.error("PostgreSQL pool error:", error.message));
    this.engagementEnabled = options.engagementEnabled === true;
    this.productSchemaPromise = null;
  }

  async ensureProductSchema() {
    if (!this.productSchemaPromise) {
      this.productSchemaPromise = (async () => {
        const result = await this.pool.query(`
          SELECT column_name, is_nullable
          FROM information_schema.columns
          WHERE table_schema=current_schema() AND table_name='products'
        `);
        const present = new Set(result.rows.map((row) => row.column_name));
        const missing = Object.entries(PRODUCT_RUNTIME_COLUMN_DEFINITIONS)
          .filter(([column]) => !present.has(column));
        const alterations = missing
          .map(([column, definition]) => `ADD COLUMN IF NOT EXISTS "${column}" ${definition}`);
        const retailStock = result.rows.find((row) => row.column_name === "retail_stock");
        if (retailStock?.is_nullable === "NO") {
          alterations.push('ALTER COLUMN "retail_stock" DROP NOT NULL');
        }
        if (alterations.length) {
          await this.pool.query(`ALTER TABLE products\n${alterations.join(",\n")}`);
        }
      })().catch((error) => {
          this.productSchemaPromise = null;
          throw error;
        });
    }
    await this.productSchemaPromise;
  }

  async ensureCopyManualSchema() {
    await this.ensureProductSchema();
  }

  async ensurePreorderSchema() {
    await this.ensureProductSchema();
  }

  async health() {
    await this.ensureProductSchema();
    const result = await this.pool.query("SELECT COUNT(*)::bigint AS products FROM products");
    return { ok: true, products: Number(result.rows[0].products) };
  }

  async list({ activeOnly = false, filters = {}, search = "", sort = "default", limit = 48, offset = 0 } = {}) {
    await this.ensureProductSchema();
    const values = [];
    const where = [];
    const add = (value) => { values.push(value); return `$${values.length}`; };
    if (activeOnly) where.push("active=true");
    if (filters.gender) where.push(`gender=${add(filters.gender)}`);
    if (filters.category) where.push(`category=${add(filters.category)}`);
    if (filters.product_type) where.push(`product_type=${add(filters.product_type)}`);
    if (filters.catalog_panel) where.push(`catalog_panel=${add(filters.catalog_panel)}`);
    if (filters.tag) where.push(`tag=${add(filters.tag)}`);
    if (filters.collection) where.push(`collection=${add(filters.collection)}`);
    if (search) {
      const term = `%${String(search).toLowerCase()}%`;
      const p = add(term);
      const searchable = [
        "name", "model_no", "variant", "slug", "category", "catalog_panel", "product_type",
        "color", "country", "material", "composition", "season", "collection",
      ];
      where.push(`(${searchable.map((field) => `lower(${field}) LIKE ${p}`).join(" OR ")})`);
    }
    const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const order = {
      new: "created_at DESC, id DESC",
      "price-asc": "price ASC, id DESC",
      "price-desc": "price DESC, id DESC",
      popular: this.engagementEnabled
        ? "public_review_count DESC, public_rating DESC, id DESC"
        : "sort DESC, id DESC",
      default: "sort DESC, id DESC",
    }[sort] || "sort DESC, id DESC";
    const countResult = await this.pool.query(`SELECT COUNT(*)::bigint AS total FROM products${clause}`, values);
    const limitParam = add(limit);
    const offsetParam = add(offset);
    const select = this.engagementEnabled
      ? PRODUCT_SELECT_WITH_ENGAGEMENT
      : "SELECT products.* FROM products";
    const rows = await this.pool.query(
      `${select}${clause} ORDER BY ${order} LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    );
    return { rows: rows.rows, total: Number(countResult.rows[0].total) };
  }

  async getBySlug(slug, activeOnly = false) {
    await this.ensureProductSchema();
    const select = this.engagementEnabled
      ? PRODUCT_SELECT_WITH_ENGAGEMENT
      : "SELECT products.* FROM products";
    const result = await this.pool.query(
      `${select} WHERE products.slug=$1${activeOnly ? " AND products.active=true" : ""} LIMIT 1`,
      [slug],
    );
    return result.rows[0] || null;
  }

  async getById(id, activeOnly = false) {
    await this.ensureProductSchema();
    const select = this.engagementEnabled
      ? PRODUCT_SELECT_WITH_ENGAGEMENT
      : "SELECT products.* FROM products";
    const result = await this.pool.query(
      `${select} WHERE products.id=$1${activeOnly ? " AND products.active=true" : ""} LIMIT 1`,
      [id],
    );
    return result.rows[0] || null;
  }

  async slugExists(slug, ignoreId = 0) {
    await this.ensureProductSchema();
    const result = await this.pool.query("SELECT 1 FROM products WHERE slug=$1 AND id<>$2 LIMIT 1", [slug, ignoreId]);
    return result.rowCount > 0;
  }

  async create(slug, values) {
    await this.ensureProductSchema();
    const columns = Object.keys(values).filter((column) => PRODUCT_COLUMNS.has(column));
    const params = [slug, ...columns.map((column) => productValue(column, values[column]))];
    const names = ["slug", ...columns].map((column) => `"${column}"`).join(",");
    const placeholders = params.map((_, index) => `$${index + 1}`).join(",");
    const result = await this.pool.query(`INSERT INTO products (${names}) VALUES (${placeholders}) RETURNING *`, params);
    return result.rows[0] ? await this.getById(result.rows[0].id) : null;
  }

  async update(id, slug, values) {
    await this.ensureProductSchema();
    const columns = Object.keys(values).filter((column) => PRODUCT_COLUMNS.has(column));
    const params = [slug, ...columns.map((column) => productValue(column, values[column])), id];
    const sets = ["slug=$1", ...columns.map((column, index) => `"${column}"=$${index + 2}`)];
    sets.push("updated_at=now()");
    const result = await this.pool.query(
      `UPDATE products SET ${sets.join(",")} WHERE id=$${params.length} RETURNING *`,
      params,
    );
    return result.rows[0] ? await this.getById(result.rows[0].id) : null;
  }

  async delete(id) {
    const result = await this.pool.query("DELETE FROM products WHERE id=$1", [id]);
    return result.rowCount > 0;
  }

  async updateStock(adjustment) {
    await this.ensureProductSchema();
    if (adjustment.type === "retail") {
      await this.pool.query("UPDATE products SET retail_stock=GREATEST(0, retail_stock-$1), updated_at=now() WHERE id=$2", [adjustment.qty, adjustment.id]);
      return;
    }
    await this.pool.query(
      "UPDATE products SET available_qop=GREATEST(0, available_qop-$1), updated_at=now() WHERE id=$2 AND available_qop IS NOT NULL",
      [adjustment.qop, adjustment.id],
    );
  }

  async variantsByModel(model, limit = 24) {
    await this.ensureProductSchema();
    const result = await this.pool.query(`
      SELECT id, slug, variant, color, images, active, preorder
      FROM products
      WHERE lower(btrim(model_no))=lower(btrim($1)) AND active=true
      ORDER BY btrim(variant), id
      LIMIT $2
    `, [model, Math.max(1, Math.min(100, Number(limit) || 24))]);
    return result.rows;
  }

  async incrementViews(id) {
    await this.ensureProductSchema();
    const result = await this.pool.query(`
      UPDATE products
      SET views=COALESCE(views, 0)+1, updated_at=now()
      WHERE id=$1
      RETURNING views
    `, [id]);
    return result.rows[0] ? Number(result.rows[0].views) : null;
  }

  async setLikeCount(id, count) {
    await this.ensureProductSchema();
    await this.pool.query("UPDATE products SET like_count=$1, updated_at=now() WHERE id=$2", [count, id]);
  }

  async renameCategory(from, to) {
    return await this.renameField("category", from, to);
  }

  async renameField(field, from, to) {
    const allowed = new Set([
      "gender", "category", "catalog_panel", "product_type", "tag", "country",
      "color", "material", "composition", "season", "collection",
    ]);
    if (!allowed.has(field)) throw new Error("Unsupported product reference field");
    await this.ensureProductSchema();
    const result = await this.pool.query(
      `UPDATE products SET "${field}"=$1, updated_at=now() WHERE btrim("${field}")=$2`,
      [to, from],
    );
    return result.rowCount;
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = {
  PostgresCatalog,
  PRODUCT_COLUMNS,
  PRODUCT_REQUIRED_COLUMNS,
  PRODUCT_RUNTIME_COLUMN_DEFINITIONS,
};
