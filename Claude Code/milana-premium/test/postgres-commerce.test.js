"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PostgresCommerce } = require("../lib/postgres-commerce");
const {
  checkoutDriversShareTransaction,
  checkoutProductSnapshot,
} = require("../lib/checkout-integrity");

const ROOT = path.resolve(__dirname, "..");

test("PostgreSQL schema includes durable checkout idempotency storage", () => {
  const schema = fs.readFileSync(path.join(ROOT, "postgres", "schema.sql"), "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS checkout_idempotency/);
  assert.match(schema, /idempotency_key TEXT PRIMARY KEY/);
  assert.match(schema, /request_hash TEXT NOT NULL/);
  assert.match(schema, /response JSONB NOT NULL/);
  assert.match(schema, /order_id INTEGER NOT NULL REFERENCES orders\(id\) ON DELETE CASCADE/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS telegram_order_outbox/);
  assert.match(schema, /order_id INTEGER PRIMARY KEY REFERENCES orders\(id\) ON DELETE CASCADE/);
  assert.match(schema, /payload JSONB NOT NULL/);
  assert.match(schema, /idx_telegram_order_outbox_due/);
});

test("checkout database compatibility requires one transactional owner", () => {
  assert.equal(checkoutDriversShareTransaction("sqlite", "sqlite"), true);
  assert.equal(checkoutDriversShareTransaction("postgres", "postgres"), true);
  assert.equal(checkoutDriversShareTransaction("postgres", "sqlite"), false);
  assert.equal(checkoutDriversShareTransaction("sqlite", "postgres"), false);
});

test("PostgresCommerce claims Telegram outbox rows safely and updates only its lease", async () => {
  const calls = [];
  const commerce = Object.create(PostgresCommerce.prototype);
  commerce.ensureTelegramOutboxSchema = async () => {};
  commerce.pool = {
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params: [...params] });
      if (sql.includes("RETURNING outbox.*")) {
        return {
          rows: [{
            order_id: 9,
            attempts: 2,
            lock_token: params[3],
            chat_id: "-1009",
            thread_id: "7",
            payload: { number: "MP-9" },
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  const claimed = await commerce.claimTelegramOutbox({
    limit: 4,
    nowMs: 10_000,
    staleBeforeMs: 5_000,
    lockToken: "worker-lease",
  });
  assert.equal(claimed[0].order_id, 9);
  assert.match(calls[0].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[0].sql, /status='sending'/);
  assert.deepEqual(calls[0].params, [10_000, 5_000, 4, "worker-lease"]);

  await commerce.markTelegramOutboxSent(9, "worker-lease", 101);
  assert.match(calls[1].sql, /WHERE order_id=\$1 AND status='sending' AND lock_token=\$2/);
  assert.deepEqual(calls[1].params, [9, "worker-lease", "101"]);

  await commerce.markTelegramOutboxRetry(9, "worker-lease", "telegram_503", 20_000);
  assert.match(calls[2].sql, /SET status='retry'/);
  assert.match(calls[2].sql, /WHERE order_id=\$1 AND status='sending' AND lock_token=\$2/);
  assert.deepEqual(calls[2].params, [9, "worker-lease", "telegram_503", 20_000]);
});

test("PostgresCommerce profile updates persist business fields and reset changed phone verification", async () => {
  let phoneVerified = true;
  const calls = [];
  const commerce = Object.create(PostgresCommerce.prototype);
  commerce.pool = {
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params: [...params] });
      if (params[9]) phoneVerified = false;
      return {
        rows: [{
          id: params[10],
          name: params[0],
          phone: params[1],
          city: params[2],
          address: params[3],
          company_name: params[4],
          tax_id: params[5],
          legal_address: params[6],
          contact_person: params[7],
          expected_volume: params[8],
          phone_verified: phoneVerified,
        }],
      };
    },
  };

  const unchangedPhone = await commerce.updateCustomerProfile(17, {
    name: "Milana Partner",
    phone: "+998 90 100 20 30",
    city: "Andijon",
    address: "Qoratut 605",
    company_name: "Milana Retail LLC",
    tax_id: "309000111",
    legal_address: "Andijon, Qoratut 605",
    contact_person: "Dilnoza",
    expected_volume: "500 units/month",
    phoneChanged: false,
  });
  assert.equal(unchangedPhone.phone_verified, true);
  assert.equal(unchangedPhone.company_name, "Milana Retail LLC");
  assert.equal(unchangedPhone.expected_volume, "500 units/month");

  const changedPhone = await commerce.updateCustomerProfile(17, {
    name: "Milana Partner",
    phone: "+998 90 100 20 31",
    city: "",
    address: "",
    company_name: "",
    tax_id: "",
    legal_address: "",
    contact_person: "",
    expected_volume: "",
    phoneChanged: true,
  });
  assert.equal(changedPhone.phone_verified, false);
  assert.equal(changedPhone.company_name, "", "empty business fields must clear existing values");
  assert.equal(changedPhone.tax_id, "");

  for (const { sql } of calls) {
    assert.match(sql, /company_name=\$5, tax_id=\$6, legal_address=\$7/);
    assert.match(sql, /contact_person=\$8, expected_volume=\$9/);
    assert.match(sql, /phone_verified=CASE WHEN \$10::boolean THEN false ELSE phone_verified END/);
    assert.match(sql, /WHERE id=\$11 RETURNING \*/);
  }
  assert.deepEqual(calls[0].params, [
    "Milana Partner",
    "+998 90 100 20 30",
    "Andijon",
    "Qoratut 605",
    "Milana Retail LLC",
    "309000111",
    "Andijon, Qoratut 605",
    "Dilnoza",
    "500 units/month",
    false,
    17,
  ]);
});

test("PostgresCommerce social upserts preserve managed fields and bind phone verification to the incoming phone", async () => {
  const calls = [];
  const commerce = Object.create(PostgresCommerce.prototype);
  commerce.pool = {
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params: [...params] });
      return {
        rows: [{
          email: params[0],
          account_type: "individual",
          approval_status: "rejected",
          phone: params[2],
          phone_verified: params[14],
        }],
      };
    },
  };

  const customer = await commerce.upsertCustomer({
    email: "managed@example.com",
    name: "Managed Customer",
    phone: "+998903333333",
    account_type: "business",
    approval_status: "active",
    phone_verified: true,
    provider: "apple",
    provider_uid: "apple-user-1",
    preserve_managed_fields: true,
  });

  assert.equal(customer.account_type, "individual");
  assert.equal(customer.approval_status, "rejected");
  assert.equal(customer.phone, "+998903333333");
  assert.equal(customer.phone_verified, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[18], true);
  assert.match(
    calls[0].sql,
    /account_type=CASE WHEN \$19::boolean THEN customers\.account_type ELSE COALESCE\(NULLIF\(EXCLUDED\.account_type,''\), customers\.account_type\) END/,
  );
  assert.match(
    calls[0].sql,
    /approval_status=CASE WHEN \$19::boolean THEN customers\.approval_status ELSE COALESCE\(NULLIF\(EXCLUDED\.approval_status,''\), customers\.approval_status\) END/,
  );
  assert.match(
    calls[0].sql,
    /WHEN customers\.phone IS DISTINCT FROM EXCLUDED\.phone THEN EXCLUDED\.phone_verified/,
  );
  assert.match(
    calls[0].sql,
    /WHEN NULLIF\(EXCLUDED\.phone,''\) IS NULL THEN customers\.phone_verified/,
  );
});

test("PostgresCommerce atomically replays checkout without reserving stock twice", async () => {
  const state = {
    stock: 1,
    product: {
      id: 41,
      active: true,
      preorder: false,
      retail_enabled: true,
      price: 25,
      wholesale_price: 20,
      retail_price: 25,
      retail_stock: 1,
      available_qop: null,
      gender: "women",
      category: "pajamas",
      sizes: ["44", "46"],
    },
    orders: 0,
    payments: 0,
    outbox: new Map(),
    idempotency: new Map(),
    commits: 0,
    rollbacks: 0,
    releases: 0,
  };
  const client = {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized === "BEGIN") return { rows: [], rowCount: 0 };
      if (normalized === "COMMIT") {
        state.commits += 1;
        return { rows: [], rowCount: 0 };
      }
      if (normalized === "ROLLBACK") {
        state.rollbacks += 1;
        return { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [{}], rowCount: 1 };
      if (normalized.includes("FROM checkout_idempotency") && normalized.includes("FOR UPDATE")) {
        const existing = state.idempotency.get(params[0]);
        return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 };
      }
      if (normalized.includes("FROM products") && normalized.includes("id=ANY") && normalized.includes("FOR UPDATE")) {
        return {
          rows: params[0].includes(state.product.id)
            ? [{ ...state.product, retail_stock: state.stock }]
            : [],
          rowCount: params[0].includes(state.product.id) ? 1 : 0,
        };
      }
      if (normalized.startsWith("UPDATE products") && normalized.includes("retail_stock")) {
        const qty = Number(params[0]);
        if (state.stock !== null && state.stock < qty) return { rows: [], rowCount: 0 };
        if (state.stock !== null) state.stock -= qty;
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith("INSERT INTO orders")) {
        state.orders += 1;
        return {
          rows: [{ id: state.orders, ...params[1], total: params[3], order_type: params[4] }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith("UPDATE orders SET number=")) return { rows: [], rowCount: 1 };
      if (normalized.startsWith("INSERT INTO payments")) {
        state.payments += 1;
        return { rows: [{ id: state.payments }], rowCount: 1 };
      }
      if (normalized.startsWith("INSERT INTO telegram_order_outbox")) {
        if (!state.outbox.has(params[0])) {
          state.outbox.set(params[0], {
            order_id: params[0],
            manager_id: params[1],
            chat_id: params[2],
            thread_id: params[3],
            payload: JSON.parse(params[4]),
          });
        }
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith("INSERT INTO checkout_idempotency")) {
        state.idempotency.set(params[0], {
          request_hash: params[1],
          response: JSON.parse(params[2]),
          order_id: params[3],
        });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${normalized}`);
    },
    release() {
      state.releases += 1;
    },
  };
  const commerce = Object.create(PostgresCommerce.prototype);
  commerce.pool = { connect: async () => client };
  commerce.ensureFractionalStockSchema = async () => {};
  commerce.ensureCheckoutIdempotencySchema = async () => {};
  commerce.ensureTelegramOutboxSchema = async () => {};

  const input = {
    customerId: null,
    customer: { name: "Idempotent customer" },
    items: [{
      id: 41,
      slug: "retail-41",
      name: "Retail item",
      qty: 1,
      unit_price: 25,
      bag_size: 1,
      unit_type: "piece",
      size: "44",
      price: 25,
      checkout_guard: checkoutProductSnapshot(state.product, {
        orderType: "retail",
        unitType: "piece",
        packMarkup: 0,
      }),
    }],
    total: 25,
    orderType: "retail",
    lang: "en",
    paymentProvider: "manual",
    paymentMethod: "manager",
    expectedDiscount: 0,
    packMarkup: 0,
    orderBagSize: 60,
    managerId: 7,
    managerName: "Manager",
    telegramChatId: "-100700",
    telegramThreadId: "42",
    source: "react_frontend",
    idempotencyKey: "checkout-pg-2026-0001",
    idempotencyRequestHash: "same-request-hash",
  };

  const created = await commerce.createCheckout(input);
  assert.equal(created.replay, false);
  assert.equal(created.response.order_id, 1);
  assert.equal(state.orders, 1);
  assert.equal(state.payments, 1);
  assert.equal(state.outbox.size, 1);
  assert.equal(state.outbox.get(1).chat_id, "-100700");
  assert.equal(state.outbox.get(1).thread_id, "42");
  assert.equal(state.outbox.get(1).payload.manager.name, "Manager");
  assert.equal(state.outbox.get(1).payload.source, "react_frontend");
  assert.equal(state.stock, 0);

  const replayed = await commerce.createCheckout(input);
  assert.equal(replayed.replay, true);
  assert.deepEqual(replayed.response, created.response);
  assert.equal(state.orders, 1);
  assert.equal(state.payments, 1);
  assert.equal(state.outbox.size, 1);
  assert.equal(state.stock, 0);

  await assert.rejects(
    commerce.createCheckout({ ...input, idempotencyRequestHash: "different-request-hash" }),
    /idempotency_conflict/,
  );
  assert.equal(state.orders, 1);
  assert.equal(state.payments, 1);
  assert.equal(state.stock, 0);
  assert.equal(state.rollbacks, 1);
  assert.equal(state.releases, 3);

  state.stock = 1;
  state.product.retail_price = 25;
  const priceRaceInput = {
    ...input,
    idempotencyKey: "checkout-pg-price-race-0001",
    idempotencyRequestHash: "price-race-request",
    items: [{
      ...input.items[0],
      checkout_guard: checkoutProductSnapshot(state.product, {
        orderType: "retail",
        unitType: "piece",
        packMarkup: 0,
      }),
    }],
  };
  state.product.retail_price = 30;
  await assert.rejects(commerce.createCheckout(priceRaceInput), /checkout_product_changed/);
  assert.equal(state.orders, 1, "a changed authoritative price must not create an order");
  assert.equal(state.payments, 1);
  assert.equal(state.stock, 1);

  state.product.retail_price = 25;
  state.stock = null;
  const untrackedGuardInput = {
    ...input,
    idempotencyKey: "checkout-pg-untracked-race-0001",
    idempotencyRequestHash: "untracked-race-request",
    items: [{
      ...input.items[0],
      checkout_guard: checkoutProductSnapshot(
        { ...state.product, retail_stock: null },
        { orderType: "retail", unitType: "piece", packMarkup: 0 },
      ),
    }],
  };
  state.stock = 0;
  await assert.rejects(commerce.createCheckout(untrackedGuardInput), /insufficient_stock/);
  assert.equal(state.orders, 1, "untracked-to-sold-out races must not bypass stock");
  assert.equal(state.stock, 0);
});
