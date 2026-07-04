/* Backend smoke tests for the zero-dependency MILANA server. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
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

async function startServer(t, extraEnv = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "milana-backend-"));
  const port = await freePort();
  const env = { ...process.env, SEED_FALLBACK_CATALOG: "1", ...extraEnv, DATA_DIR: dataDir, PORT: String(port), HOST: "127.0.0.1", NODE_ENV: "test" };
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

async function startTelegramStub(t) {
  const port = await freePort();
  const messages = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      messages.push({ url: req.url, body: JSON.parse(raw || "{}") });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { message_id: messages.length } }));
    });
  });
  await new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { base: `http://127.0.0.1:${port}`, messages };
}

async function startOpenAIStub(t) {
  const port = await freePort();
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      requests.push({ url: req.url, body: JSON.parse(raw || "{}"), auth: req.headers.authorization || "" });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify({ reply: "AI tavsiyasi tayyor.", product_slugs: [] }) }],
        }],
      }));
    });
  });
  await new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { base: `http://127.0.0.1:${port}`, requests };
}

async function json(url, body, opts = {}) {
  return await fetch(url, {
    method: opts.method || "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: JSON.stringify(body),
  });
}

async function waitForMessages(messages, count = 1, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (messages.length >= count) return messages;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for Telegram notification");
}

test("order placement sends Telegram notification when configured", async (t) => {
  const telegram = await startTelegramStub(t);
  const app = await startServer(t, {
    TELEGRAM_BOT_TOKEN: "123456:test-token",
    TELEGRAM_ORDER_CHAT_ID: "-1001234567890",
    TELEGRAM_API_BASE: telegram.base,
  });

  const products = await (await fetch(app.base + "/api/products?limit=1")).json();
  const product = products[0];
  const orderRes = await json(app.base + "/api/orders", {
    customer: {
      name: "Telegram Buyer",
      phone: "+998 90 777 88 99",
      city: "Andijon",
      address: "Qoratut 605",
      comment: "Call before delivery",
    },
    payment: { method: "manager" },
    items: [{ id: product.id, qty: 1 }],
    lang: "uz",
    source: "flutter",
  });
  assert.equal(orderRes.status, 201);
  const order = await orderRes.json();

  await waitForMessages(telegram.messages);
  const msg = telegram.messages[0];
  assert.equal(msg.url, "/bot123456:test-token/sendMessage");
  assert.equal(msg.body.chat_id, "-1001234567890");
  assert.equal(msg.body.disable_web_page_preview, true);
  assert.match(msg.body.text, new RegExp("Yangi Milana buyurtmasi " + order.number));
  assert.match(msg.body.text, /Manba: flutter · Til: uz/);
  assert.match(msg.body.text, /Telegram Buyer/);
  assert.match(msg.body.text, /To'lov: menejer orqali · kutilmoqda\/qo'lda tasdiqlanadi/);
  assert.match(msg.body.text, /Umumiy summa:/);
});

test("chat assistant uses OpenAI when configured", async (t) => {
  const openai = await startOpenAIStub(t);
  const app = await startServer(t, {
    OPENAI_API_KEY: "sk-test",
    OPENAI_API_BASE: openai.base,
    OPENAI_MODEL: "test-model",
    OPENAI_ASSISTANT_ENABLED: "1",
  });

  const chatRes = await json(app.base + "/api/chat/message", { message: "Kids uchun tavsiya bering", lang: "uz" }, {
    headers: { Origin: app.base },
  });
  assert.equal(chatRes.status, 200);
  const chat = await chatRes.json();
  assert.equal(chat.reply, "AI tavsiyasi tayyor.");
  assert.equal(openai.requests.length, 1);
  assert.equal(openai.requests[0].url, "/responses");
  assert.equal(openai.requests[0].auth, "Bearer sk-test");
  assert.equal(openai.requests[0].body.model, "test-model");
});

test("public API, order placement, newsletter, and admin protections work", async (t) => {
  const app = await startServer(t);

  const health = await (await fetch(app.base + "/api/health")).json();
  assert.equal(health.ok, true);
  assert.ok(health.products > 0);

  const products = await (await fetch(app.base + "/api/products?limit=1")).json();
  assert.equal(products.length, 1);
  const product = products[0];

  const smartSearch = await (await fetch(app.base + "/api/search/smart?q=" + encodeURIComponent(product.model_no || product.name))).json();
  assert.equal(smartSearch.products.length > 0, true);
  assert.equal(smartSearch.products[0].slug, product.slug);

  const recommendations = await (await fetch(app.base + "/api/recommendations?slug=" + encodeURIComponent(product.slug))).json();
  assert.ok(Array.isArray(recommendations.products));

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

  const otp = await json(app.base + "/api/auth/otp/start", { phone: "+998 91 222 33 44" });
  assert.equal(otp.status, 200);
  const otpCode = (await otp.json()).dev_code;
  assert.match(otpCode, /^\d{6}$/);

  const signup = await json(app.base + "/api/auth/signup", {
    account_type: "individual",
    terms: true,
    name: "Retail Buyer",
    phone: "+998 91 222 33 44",
    city: "Andijon",
    address: "Qoratut 605",
    email: "buyer@example.com",
    password: "strong-pass-2026",
    otp_code: otpCode,
  });
  assert.equal(signup.status, 201);
  const customerCookie = signup.headers.get("set-cookie").split(";")[0];
  assert.match(customerCookie, /^cid=/);
  const signupBody = await signup.json();
  assert.match(signupBody.session_token, /^[a-f0-9]{64}$/);
  const signedUpCustomer = signupBody.customer;
  assert.equal(signedUpCustomer.email, "buyer@example.com");
  assert.equal(signedUpCustomer.account_type, "individual");
  assert.equal(signedUpCustomer.approval_status, "active");
  assert.equal(signedUpCustomer.phone_verified, true);
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

  const recoverNoOtp = await json(app.base + "/api/auth/recover", {
    email: "buyer@example.com",
    password: "new-strong-pass-2026",
  });
  assert.equal(recoverNoOtp.status, 400);

  const recoverOtp = await json(app.base + "/api/auth/email-otp/start", { email: "buyer@example.com" });
  assert.equal(recoverOtp.status, 200);
  const recoverWrongCode = await json(app.base + "/api/auth/recover", {
    email: "buyer@example.com",
    password: "new-strong-pass-2026",
    email_code: "000000",
  });
  assert.equal(recoverWrongCode.status, 401);

  const recover = await json(app.base + "/api/auth/recover", {
    email: "buyer@example.com",
    password: "new-strong-pass-2026",
    email_code: (await recoverOtp.json()).dev_code,
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
  const newCustomerToken = (await newPasswordSignin.json()).session_token;
  assert.match(newCustomerToken, /^[a-f0-9]{64}$/);

  const likeRes = await json(app.base + "/api/products/" + product.id + "/like", {}, {
    headers: { Cookie: newCustomerCookie, Origin: app.base },
  });
  assert.equal(likeRes.status, 200);
  assert.equal((await likeRes.json()).liked, true);
  const likes = await fetch(app.base + "/api/auth/likes", { headers: { Cookie: newCustomerCookie } });
  assert.equal(likes.status, 200);
  assert.equal((await likes.json()).likes.length, 1);

  const customerOrderRes = await json(app.base + "/api/orders", {
    customer: { name: "Retail Buyer", phone: "+998 91 222 33 44", city: "Andijon" },
    payment: { method: "manager" },
    items: [{ id: product.id, qty: 1 }],
    lang: "en",
  }, { headers: { Cookie: newCustomerCookie } });
  assert.equal(customerOrderRes.status, 201);
  const customerOrder = await customerOrderRes.json();
  assert.equal(customerOrder.order_type, "retail");

  const customerOrdersRes = await fetch(app.base + "/api/auth/orders", { headers: { Cookie: newCustomerCookie } });
  assert.equal(customerOrdersRes.status, 200);
  const customerOrders = (await customerOrdersRes.json()).orders;
  assert.equal(customerOrders.length, 1);
  assert.equal(customerOrders[0].number, customerOrder.number);
  assert.equal(customerOrders[0].order_type, "retail");
  assert.equal(customerOrders[0].items[0].name, product.name);
  assert.equal(customerOrders[0].payment.status, "pending");

  const paymentProof = await json(app.base + "/api/auth/orders/" + customerOrder.id + "/payment-proof", {
    method: "bank",
    amount: customerOrder.total,
    reference: "TRX-123",
    note: "Paid by bank",
  }, { headers: { Authorization: "Bearer " + newCustomerToken, Origin: app.base } });
  assert.equal(paymentProof.status, 200);
  assert.equal((await paymentProof.json()).payment_status, "submitted");

  const cancelAfterProof = await json(app.base + "/api/auth/orders/" + customerOrder.id + "/cancel", {
    reason: "Changed mind",
  }, { headers: { Authorization: "Bearer " + newCustomerToken, Origin: app.base } });
  assert.equal(cancelAfterProof.status, 409);

  const cancellableOrderRes = await json(app.base + "/api/orders", {
    customer: { name: "Retail Buyer", phone: "+998 91 222 33 44", city: "Andijon" },
    payment: { method: "manager" },
    items: [{ id: product.id, qty: 1 }],
    lang: "en",
  }, { headers: { Authorization: "Bearer " + newCustomerToken } });
  assert.equal(cancellableOrderRes.status, 201);
  const cancellableOrder = await cancellableOrderRes.json();
  const cancelOrder = await json(app.base + "/api/auth/orders/" + cancellableOrder.id + "/cancel", {
    reason: "Duplicate order",
  }, { headers: { Authorization: "Bearer " + newCustomerToken, Origin: app.base } });
  assert.equal(cancelOrder.status, 200);
  assert.equal((await cancelOrder.json()).status, "cancelled");

  const tooManyQop = await json(app.base + "/api/orders", {
    customer: { name: "Limit Buyer", phone: "+998 90 000 00 00" },
    items: [{ id: product.id, qty: 21 }],
  });
  assert.equal(tooManyQop.status, 400);

  const reviewRes = await json(app.base + "/api/reviews", {
    product_id: product.id,
    product_slug: product.slug,
    rating: 5,
    comment: "Verified buyer review",
  }, { headers: { Cookie: newCustomerCookie, Origin: app.base } });
  assert.equal(reviewRes.status, 201);

  const businessOtp = await json(app.base + "/api/auth/otp/start", { phone: "+998 90 555 66 77" });
  assert.equal(businessOtp.status, 200);
  const businessSignup = await json(app.base + "/api/auth/signup", {
    account_type: "business",
    terms: true,
    name: "Wholesale Partner",
    phone: "+998 90 555 66 77",
    email: "business@example.com",
    password: "business-pass-2026",
    otp_code: (await businessOtp.json()).dev_code,
  });
  assert.equal(businessSignup.status, 201);
  const businessCustomer = (await businessSignup.json()).customer;
  assert.equal(businessCustomer.account_type, "business");
  assert.equal(businessCustomer.approval_status, "active");

  const supportRes = await json(app.base + "/api/support", {
    name: "Support Customer",
    phone: "+998 90 333 44 55",
    email: "support@example.com",
    topic: "delivery",
    message: "Please explain cargo delivery for one bag.",
    lang: "en",
  }, { headers: { Authorization: "Bearer " + newCustomerToken } });
  assert.equal(supportRes.status, 201);
  const supportTicket = await supportRes.json();
  assert.match(supportTicket.number, /^MS-\d{4}-\d{4}$/);
  const supportHistory = await fetch(app.base + "/api/auth/support", { headers: { Authorization: "Bearer " + newCustomerToken } });
  assert.equal(supportHistory.status, 200);
  assert.equal((await supportHistory.json()).support[0].number, supportTicket.number);

  const chatRes = await json(app.base + "/api/chat/message", { message: "I want to talk to a manager" }, {
    headers: { Origin: app.base },
  });
  assert.equal(chatRes.status, 200);
  const chat = await chatRes.json();
  assert.ok(chat.session_id);
  assert.match(chat.reply, /Menejer|manager/i);

  const productChatRes = await json(app.base + "/api/chat/message", { message: "Tavsiya qiling " + (product.model_no || product.name), lang: "uz" }, {
    headers: { Origin: app.base },
  });
  assert.equal(productChatRes.status, 200);
  const productChat = await productChatRes.json();
  assert.equal(productChat.products.length > 0, true);
  assert.match(productChat.reply, /Mos keladigan mahsulotlar/);

  assert.equal((await fetch(app.base + "/terms")).status, 200);
  assert.equal((await fetch(app.base + "/ordering")).status, 200);

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
  assert.equal(orders.length, 3);
  const adminOrder = orders.find((row) => row.number === order.number);
  assert.ok(adminOrder);
  assert.equal(adminOrder.order_type, "wholesale");
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

  const adminCustomers = await fetch(app.base + "/api/admin/customers", { headers: { Cookie: cookie } });
  assert.equal(adminCustomers.status, 200);
  const adminCustomerRows = await adminCustomers.json();
  assert.equal(adminCustomerRows.some((row) => row.email === "buyer@example.com" && row.account_type === "individual"), true);

  const adminReviews = await fetch(app.base + "/api/admin/reviews", { headers: { Cookie: cookie } });
  assert.equal(adminReviews.status, 200);
  const reviewRows = await adminReviews.json();
  assert.equal(reviewRows.length, 1);
  const reviewApprove = await json(app.base + "/api/admin/reviews/" + reviewRows[0].id, { status: "approved" }, {
    method: "PUT",
    headers: { Cookie: cookie, Origin: app.base },
  });
  assert.equal(reviewApprove.status, 200);
  const publicReviews = await fetch(app.base + "/api/products/" + product.slug + "/reviews?product_id=" + product.id);
  assert.equal(publicReviews.status, 200);
  assert.equal((await publicReviews.json()).summary.count, 1);

  const adminChat = await fetch(app.base + "/api/admin/chat", { headers: { Cookie: cookie } });
  assert.equal(adminChat.status, 200);
  assert.equal((await adminChat.json()).length, 2);

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
