"use strict";

const { Pool } = require("pg");

const PRODUCT_COLUMNS = new Set([
  "name", "model_no", "variant", "gender", "category", "catalog_panel", "product_type", "price", "old_price",
  "tag", "collection", "rating", "reviews", "wholesale_price", "wholesale_moq",
  "retail_enabled", "retail_price", "retail_stock", "available_qop", "sizes",
  "images", "desc_en", "desc_ru", "desc_uz", "fabric_en", "fabric_ru",
  "fabric_uz", "active", "sort",
]);

function productValue(column, value) {
  if (column === "sizes" || column === "images") {
    if (typeof value === "string") {
      try { return JSON.stringify(JSON.parse(value)); } catch { return "[]"; }
    }
    return JSON.stringify(Array.isArray(value) ? value : []);
  }
  if (column === "active" || column === "retail_enabled") return Boolean(value);
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
  }

  async health() {
    const result = await this.pool.query("SELECT COUNT(*)::bigint AS products FROM products");
    return { ok: true, products: Number(result.rows[0].products) };
  }

  async list({ activeOnly = false, filters = {}, search = "", sort = "default", limit = 48, offset = 0 } = {}) {
    const values = [];
    const where = [];
    const add = (value) => { values.push(value); return `$${values.length}`; };
    if (activeOnly) where.push("active=true");
    if (filters.gender) where.push(`gender=${add(filters.gender)}`);
    if (filters.category) where.push(`category=${add(filters.category)}`);
    if (filters.catalog_panel) where.push(`catalog_panel=${add(filters.catalog_panel)}`);
    if (filters.tag) where.push(`tag=${add(filters.tag)}`);
    if (search) {
      const term = `%${String(search).toLowerCase()}%`;
      const p = add(term);
      where.push(`(lower(name) LIKE ${p} OR lower(model_no) LIKE ${p} OR lower(variant) LIKE ${p} OR lower(slug) LIKE ${p})`);
    }
    const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const order = {
      new: "created_at DESC, id DESC",
      "price-asc": "price ASC, id DESC",
      "price-desc": "price DESC, id DESC",
      popular: "reviews DESC, rating DESC, id DESC",
      default: "sort DESC, id DESC",
    }[sort] || "sort DESC, id DESC";
    const countResult = await this.pool.query(`SELECT COUNT(*)::bigint AS total FROM products${clause}`, values);
    const limitParam = add(limit);
    const offsetParam = add(offset);
    const rows = await this.pool.query(
      `SELECT * FROM products${clause} ORDER BY ${order} LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    );
    return { rows: rows.rows, total: Number(countResult.rows[0].total) };
  }

  async getBySlug(slug, activeOnly = false) {
    const result = await this.pool.query(
      `SELECT * FROM products WHERE slug=$1${activeOnly ? " AND active=true" : ""} LIMIT 1`,
      [slug],
    );
    return result.rows[0] || null;
  }

  async getById(id, activeOnly = false) {
    const result = await this.pool.query(
      `SELECT * FROM products WHERE id=$1${activeOnly ? " AND active=true" : ""} LIMIT 1`,
      [id],
    );
    return result.rows[0] || null;
  }

  async slugExists(slug, ignoreId = 0) {
    const result = await this.pool.query("SELECT 1 FROM products WHERE slug=$1 AND id<>$2 LIMIT 1", [slug, ignoreId]);
    return result.rowCount > 0;
  }

  async create(slug, values) {
    const columns = Object.keys(values).filter((column) => PRODUCT_COLUMNS.has(column));
    const params = [slug, ...columns.map((column) => productValue(column, values[column]))];
    const names = ["slug", ...columns].map((column) => `"${column}"`).join(",");
    const placeholders = params.map((_, index) => `$${index + 1}`).join(",");
    const result = await this.pool.query(`INSERT INTO products (${names}) VALUES (${placeholders}) RETURNING *`, params);
    return result.rows[0];
  }

  async update(id, slug, values) {
    const columns = Object.keys(values).filter((column) => PRODUCT_COLUMNS.has(column));
    const params = [slug, ...columns.map((column) => productValue(column, values[column])), id];
    const sets = ["slug=$1", ...columns.map((column, index) => `"${column}"=$${index + 2}`)];
    sets.push("updated_at=now()");
    const result = await this.pool.query(
      `UPDATE products SET ${sets.join(",")} WHERE id=$${params.length} RETURNING *`,
      params,
    );
    return result.rows[0] || null;
  }

  async delete(id) {
    const result = await this.pool.query("DELETE FROM products WHERE id=$1", [id]);
    return result.rowCount > 0;
  }

  async updateStock(adjustment) {
    if (adjustment.type === "retail") {
      await this.pool.query("UPDATE products SET retail_stock=GREATEST(0, retail_stock-$1), updated_at=now() WHERE id=$2", [adjustment.qty, adjustment.id]);
      return;
    }
    await this.pool.query(
      "UPDATE products SET available_qop=GREATEST(0, available_qop-$1), updated_at=now() WHERE id=$2 AND available_qop IS NOT NULL",
      [adjustment.qop, adjustment.id],
    );
  }

  async setLikeCount(id, count) {
    await this.pool.query("UPDATE products SET like_count=$1, updated_at=now() WHERE id=$2", [count, id]);
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { PostgresCatalog };
