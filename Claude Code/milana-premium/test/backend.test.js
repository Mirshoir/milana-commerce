/* Backend smoke tests for the zero-dependency MILANA server. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

async function freePort() {
  return await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function waitFor(url, timeoutMs = 10000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      last = new Error("HTTP " + r.status);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw last || new Error("Timed out waiting for " + url);
}

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "milana-backend-"));
  const port = await freePort();
  const env = { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: "127.0.0.1", NODE_ENV: "test" };
  const child = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  let exited = false;
  const exitPromise = new Promise((resolve) => child.once("exit", () => { exited = true; resolve(); }));
  child.stdout.on("data", (b) => { logs += b.toString(); });
  child.stderr.on("data", (b) => { logs += b.toString(); });
  t.after(async () => {
    if (!child.killed) child.kill("SIGTERM");
    if (!exited) await exitPromise;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  await waitFor(base + "/api/health");
  return { base, dataDir, logs: () => logs };
}

async function json(url, body, opts = {}) {
  return await fetch(url, {
    method: opts.method || "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: JSON.stringify(body),
  });
}

test("public API, order placement, newsletter, and admin protections work", async (t) => {
  const app = await startServer(t);

  const health = await (await fetch(app.base + "/api/health")).json();
  assert.equal(health.ok, true);
  assert.ok(health.products > 0);

  const products = await (await fetch(app.base + "/api/products?limit=1")).json();
  assert.equal(products.length, 1);
  const product = products[0];

  const orderRes = await json(app.base + "/api/orders", {
    customer: { name: "Test Customer", phone: "+998 90 123 45 67", city: "Tashkent" },
    payment: { method: "bank" },
    items: [{ id: product.id, qty: 2, size: product.sizes[0] || "" }],
    lang: "en",
  });
  assert.equal(orderRes.status, 201);
  const order = await orderRes.json();
  assert.match(order.number, /^MP-\d{4}-\d{4}$/);
  assert.equal(order.total, Math.round(product.price * 60 * 2 * 100) / 100);
  assert.equal(order.payment.method, "bank");
  assert.equal(order.payment.status, "pending");
  assert.equal(order.payment.amount, order.total);

  const sub1 = await json(app.base + "/api/newsletter", { email: "CLIENT@example.com", lang: "ru" });
  assert.equal(sub1.status, 201);
  const sub2 = await json(app.base + "/api/newsletter", { email: "client@example.com", lang: "ru" });
  assert.equal(sub2.status, 200);
  assert.equal((await sub2.json()).duplicate, true);

  const authConfig = await (await fetch(app.base + "/api/auth/config")).json();
  assert.equal(authConfig.provider, "local");

  const signup = await json(app.base + "/api/auth/signup", {
    name: "Wholesale Buyer",
    phone: "+998 91 222 33 44",
    city: "Andijon",
    address: "Qoratut 605",
    email: "buyer@example.com",
    password: "strong-pass-2026",
  });
  assert.equal(signup.status, 201);
  const customerCookie = signup.headers.get("set-cookie").split(";")[0];
  assert.match(customerCookie, /^cid=/);
  const signedUpCustomer = (await signup.json()).customer;
  assert.equal(signedUpCustomer.email, "buyer@example.com");
  assert.equal(signedUpCustomer.city, "Andijon");
  assert.equal(signedUpCustomer.address, "Qoratut 605");

  const customerMe = await fetch(app.base + "/api/auth/me", { headers: { Cookie: customerCookie } });
  assert.equal(customerMe.status, 200);
  const meCustomer = (await customerMe.json()).customer;
  assert.equal(meCustomer.email, "buyer@example.com");
  assert.equal(meCustomer.city, "Andijon");
  assert.equal(meCustomer.address, "Qoratut 605");

  const signin = await json(app.base + "/api/auth/signin", {
    email: "buyer@example.com",
    password: "strong-pass-2026",
  });
  assert.equal(signin.status, 200);

  const recoverWrongPhone = await json(app.base + "/api/auth/recover", {
    email: "buyer@example.com",
    phone: "+998 90 000 00 00",
    password: "new-strong-pass-2026",
  });
  assert.equal(recoverWrongPhone.status, 401);

  const recover = await json(app.base + "/api/auth/recover", {
    email: "buyer@example.com",
    phone: "+998912223344",
    password: "new-strong-pass-2026",
  });
  assert.equal(recover.status, 200);
  const recoveryCookie = recover.headers.get("set-cookie").split(";")[0];
  assert.match(recoveryCookie, /^cid=/);

  const oldPasswordSignin = await json(app.base + "/api/auth/signin", {
    email: "buyer@example.com",
    password: "strong-pass-2026",
  });
  assert.equal(oldPasswordSignin.status, 401);

  const newPasswordSignin = await json(app.base + "/api/auth/signin", {
    email: "buyer@example.com",
    password: "new-strong-pass-2026",
  });
  assert.equal(newPasswordSignin.status, 200);
  const newCustomerCookie = newPasswordSignin.headers.get("set-cookie").split(";")[0];

  const customerOrderRes = await json(app.base + "/api/orders", {
    customer: { name: "Wholesale Buyer", phone: "+998 91 222 33 44", city: "Andijon" },
    payment: { method: "manager" },
    items: [{ id: product.id, qty: 1 }],
    lang: "en",
  }, { headers: { Cookie: newCustomerCookie } });
  assert.equal(customerOrderRes.status, 201);
  const customerOrder = await customerOrderRes.json();

  const customerOrdersRes = await fetch(app.base + "/api/auth/orders", { headers: { Cookie: newCustomerCookie } });
  assert.equal(customerOrdersRes.status, 200);
  const customerOrders = (await customerOrdersRes.json()).orders;
  assert.equal(customerOrders.length, 1);
  assert.equal(customerOrders[0].number, customerOrder.number);
  assert.equal(customerOrders[0].items[0].name, product.name);

  const supportRes = await json(app.base + "/api/support", {
    name: "Support Customer",
    phone: "+998 90 333 44 55",
    email: "support@example.com",
    topic: "delivery",
    message: "Please explain cargo delivery for one bag.",
    lang: "en",
  });
  assert.equal(supportRes.status, 201);
  const supportTicket = await supportRes.json();
  assert.match(supportTicket.number, /^MS-\d{4}-\d{4}$/);

  const passwordFile = fs.readFileSync(path.join(app.dataDir, "ADMIN-PASSWORD.txt"), "utf8");
  const password = passwordFile.match(/Password:\s*(\S+)/)?.[1];
  assert.ok(password, "first-run admin password should be written");

  const login = await json(app.base + "/api/login", { login: "admin", password }, { headers: { Origin: app.base } });
  assert.equal(login.status, 200, app.logs());
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(cookie, /^sid=/);

  const adminOrders = await fetch(app.base + "/api/admin/orders", { headers: { Cookie: cookie } });
  assert.equal(adminOrders.status, 200);
  const orders = await adminOrders.json();
  assert.equal(orders.length, 2);
  const adminOrder = orders.find((row) => row.number === order.number);
  assert.ok(adminOrder);
  assert.equal(adminOrder.payment.method, "bank");
  assert.equal(adminOrder.payment.status, "pending");
  assert.equal(adminOrder.payment.amount, order.total);
  assert.equal(adminOrder.items[0].bag_size, 60);
  assert.equal(adminOrder.items[0].unit_price, product.price);
  assert.equal(adminOrder.items[0].price, Math.round(product.price * 60 * 100) / 100);
  const expectedSizes = [...product.sizes, "44", "46", "48", "50", "52", "54"]
    .filter((size, idx, arr) => arr.indexOf(size) === idx)
    .slice(0, 6);
  assert.deepEqual(adminOrder.items[0].size_mix, expectedSizes.map((size) => ({ size, qty: 10 })));

  const blocked = await json(
    app.base + "/api/admin/orders/" + adminOrder.id,
    { status: "done" },
    { method: "PUT", headers: { Cookie: cookie, Origin: "https://evil.example" } }
  );
  assert.equal(blocked.status, 403);

  const allowed = await json(
    app.base + "/api/admin/orders/" + adminOrder.id,
    { status: "done" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(allowed.status, 200);

  const paymentAllowed = await json(
    app.base + "/api/admin/payments/" + adminOrder.payment.id,
    { status: "paid", reference: "BANK-TEST-1" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(paymentAllowed.status, 200);

  const subscribers = await fetch(app.base + "/api/admin/subscribers", { headers: { Cookie: cookie } });
  assert.equal(subscribers.status, 200);
  const rows = await subscribers.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "client@example.com");

  const supportRows = await fetch(app.base + "/api/admin/support", { headers: { Cookie: cookie } });
  assert.equal(supportRows.status, 200);
  const supportList = await supportRows.json();
  assert.equal(supportList.length, 1);
  assert.equal(supportList[0].number, supportTicket.number);

  const supportDone = await json(
    app.base + "/api/admin/support/" + supportList[0].id,
    { status: "done" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(supportDone.status, 200);
});
