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
const { DatabaseSync } = require("node:sqlite");

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
  const env = {
    ...process.env,
    SEED_FALLBACK_CATALOG: "1",
    TELEGRAM_ORDER_CHAT_ID: "-1000000000000",
    TELEGRAM_DEFAULT_MANAGER_PASSWORD: "test-manager-password",
    ...extraEnv,
    DATA_DIR: dataDir,
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_ENV: "test",
  };
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

async function startCatalogStub(t) {
  const port = await freePort();
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits += 1;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([{
      id: 999999,
      source_pdf: "external.pdf",
      page: 1,
      card_index: 1,
      model_code: "EXT-999",
      product_code: "OLD-CATALOG",
      material_type: "External",
      price: 99,
      currency: "USD",
      image_url: "/assets/external.jpg",
      extraction_status: "ok",
      combined_text: "External Catalog Product 44 46 48",
    }]));
  });
  await new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { base: `http://127.0.0.1:${port}`, hits: () => hits };
}

async function startSmtpStub(t) {
  const port = await freePort();
  const messages = [];
  const server = net.createServer((socket) => {
    let buffer = "";
    let dataMode = false;
    let data = "";
    socket.write("220 local.smtp ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (dataMode) {
          if (line === ".") {
            messages.push(data);
            data = "";
            dataMode = false;
            socket.write("250 queued\r\n");
          } else {
            data += line + "\n";
          }
          continue;
        }
        if (/^EHLO\b/i.test(line)) socket.write("250-local.smtp\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (/^AUTH\b/i.test(line)) socket.write("235 authenticated\r\n");
        else if (/^MAIL FROM:/i.test(line)) socket.write("250 ok\r\n");
        else if (/^RCPT TO:/i.test(line)) socket.write("250 ok\r\n");
        else if (/^DATA$/i.test(line)) { dataMode = true; socket.write("354 go ahead\r\n"); }
        else if (/^QUIT$/i.test(line)) { socket.write("221 bye\r\n"); socket.end(); }
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { port, messages };
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
  const managers = await (await fetch(app.base + "/api/managers")).json();
  const managerId = managers[0].id;
  const orderRes = await json(app.base + "/api/orders", {
    manager_id: managerId,
    customer: {
      name: "Telegram Buyer",
      phone: "+998 90 777 88 99",
      city: "Andijon",
      address: "Qoratut 605",
      postcode: "170100",
      delivery_note: "Entrance from the main road",
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
  assert.match(msg.body.text, /Pochta indeksi: 170100/);
  assert.match(msg.body.text, /Yetkazish izohi: Entrance from the main road/);
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

test("external catalog source stays disconnected", async (t) => {
  const catalog = await startCatalogStub(t);
  const app = await startServer(t, {
    CATALOG_SOURCE_ENABLED: "1",
    CATALOG_API_BASE: catalog.base,
  });

  const health = await (await fetch(app.base + "/api/health")).json();
  assert.equal(health.catalog_source, "sqlite");
  const products = await (await fetch(app.base + "/api/products?limit=1000")).json();
  assert.equal(products.some((product) => product.name === "External Catalog Product" || product.model_no === "EXT-999"), false);
  assert.equal(catalog.hits(), 0);
});

test("rate limits trust forwarded IPs only from configured proxies", async (t) => {
  const trusted = await startServer(t);
  for (let i = 0; i < 5; i++) {
    const response = await json(trusted.base + "/api/newsletter", {
      email: `trusted-${i}@example.com`,
    }, { headers: { "X-Forwarded-For": "203.0.113.10" } });
    assert.equal(response.status, 201);
  }
  const limited = await json(trusted.base + "/api/newsletter", {
    email: "trusted-limited@example.com",
  }, { headers: { "X-Forwarded-For": "203.0.113.10" } });
  assert.equal(limited.status, 429);
  const otherClient = await json(trusted.base + "/api/newsletter", {
    email: "trusted-other@example.com",
  }, { headers: { "X-Forwarded-For": "203.0.113.11" } });
  assert.equal(otherClient.status, 201);
  const prependedSpoof = await json(trusted.base + "/api/newsletter", {
    email: "trusted-prepended-spoof@example.com",
  }, { headers: { "X-Forwarded-For": "198.51.100.200, 203.0.113.10" } });
  assert.equal(prependedSpoof.status, 429);

  const untrusted = await startServer(t, { TRUSTED_PROXY_IPS: "172.16.10.2" });
  for (let i = 0; i < 5; i++) {
    const response = await json(untrusted.base + "/api/newsletter", {
      email: `untrusted-${i}@example.com`,
    }, { headers: { "X-Forwarded-For": `198.51.100.${i + 1}` } });
    assert.equal(response.status, 201);
  }
  const spoofed = await json(untrusted.base + "/api/newsletter", {
    email: "untrusted-limited@example.com",
  }, { headers: { "X-Forwarded-For": "198.51.100.99" } });
  assert.equal(spoofed.status, 429);
});

test("password recovery code can be sent through SMTP", async (t) => {
  const smtp = await startSmtpStub(t);
  const app = await startServer(t, {
    EMAIL_SEND_IN_DEV: "1",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtp.port),
    SMTP_STARTTLS: "0",
    SMTP_USER: "passwordMilanapremium@gmail.com",
    SMTP_PASS: "test-app-password",
    SMTP_FROM_EMAIL: "Milana Premium <passwordMilanapremium@gmail.com>",
  });

  const otp = await json(app.base + "/api/auth/email-otp/start", { email: "buyer@example.com", lang: "uz" });
  assert.equal(otp.status, 200);
  assert.equal((await otp.json()).dev_code, undefined);
  assert.equal(smtp.messages.length, 1);
  assert.match(smtp.messages[0], /From: Milana Premium <passwordMilanapremium@gmail.com>/);
  assert.match(smtp.messages[0], /To: buyer@example.com/);
  assert.match(smtp.messages[0], /Milana Premium tasdiqlash kodi/);
});

test("public API, order placement, newsletter, and admin protections work", async (t) => {
  const app = await startServer(t);
  const sqlite = new DatabaseSync(path.join(app.dataDir, "milana.db"));
  t.after(() => sqlite.close());
  sqlite.prepare(`
    INSERT INTO settings (key,value) VALUES ('pack_markup','25')
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run();

  const health = await (await fetch(app.base + "/api/health")).json();
  assert.equal(health.ok, true);
  assert.ok(health.products > 0);

  const products = await (await fetch(app.base + "/api/products?limit=1")).json();
  assert.equal(products.length, 1);
  const product = products[0];
  const managers = await (await fetch(app.base + "/api/managers")).json();
  assert.equal(managers.length, 1);
  const managerId = managers[0].id;
  const selectedColor = product.colors?.[0] || "catalog color";
  assert.equal(product.price_visible, true);
  assert.equal(product.price > 0, true);
  sqlite.prepare("UPDATE products SET available_qop=10, retail_stock=10 WHERE id=?").run(product.id);

  const smartSearch = await (await fetch(app.base + "/api/search/smart?q=" + encodeURIComponent(product.model_no || product.name))).json();
  assert.equal(smartSearch.products.length > 0, true);
  assert.equal(smartSearch.products[0].slug, product.slug);

  const recommendations = await (await fetch(app.base + "/api/recommendations?slug=" + encodeURIComponent(product.slug))).json();
  assert.ok(Array.isArray(recommendations.products));

  const orderRes = await json(app.base + "/api/orders", {
    manager_id: managerId,
    customer: { name: "Test Customer", phone: "+998 90 123 45 67", city: "Tashkent" },
    payment: { method: "bank" },
    items: [{ id: product.id, qty: 2, unit_type: "qop", size: product.sizes[0] || "", color: selectedColor }],
    lang: "en",
  });
  assert.equal(orderRes.status, 201);
  const order = await orderRes.json();
  assert.match(order.number, /^MP-\d{4}-\d{4}$/);
  assert.equal(order.total, Math.round(product.price * 60 * 2 * 100) / 100);
  assert.equal(order.payment.method, "bank");
  assert.equal(order.payment.status, "pending");
  assert.equal(order.payment.amount, order.total);

  const pachkaOrderRes = await json(app.base + "/api/orders", {
    manager_id: managerId,
    customer: { name: "Pachka Buyer", phone: "+998 90 222 44 66", city: "Tashkent" },
    payment: { method: "manager" },
    items: [{ id: product.id, qty: 1, unit_type: "pachka", size: product.sizes[0] || "" }],
    lang: "uz",
  });
  assert.equal(pachkaOrderRes.status, 201);
  const pachkaOrder = await pachkaOrderRes.json();
  const pachkaPieces = product.order_units.find((unit) => unit.unit_type === "pachka").pieces;
  const pachkaUnitPrice = product.retail_price > product.price
    ? product.retail_price
    : Math.round(product.price * 1.25 * 100) / 100;
  assert.equal(pachkaOrder.total, Math.round(pachkaUnitPrice * pachkaPieces * 100) / 100);
  assert.equal(sqlite.prepare("SELECT available_qop FROM products WHERE id=?").get(product.id).available_qop, 7.9);

  const missingReactDelivery = await json(app.base + "/api/orders", {
    manager_id: managerId,
    source: "react_frontend",
    customer: { name: "React Buyer", phone: "+998 90 222 44 66", city: "Tashkent" },
    items: [{ id: product.id, qty: 1, unit_type: "pachka" }],
    lang: "uz",
  });
  assert.equal(missingReactDelivery.status, 400);
  assert.equal((await missingReactDelivery.json()).error, "address");

  const missingReactPostcode = await json(app.base + "/api/orders", {
    manager_id: managerId,
    source: "react_frontend",
    customer: { name: "React Buyer", phone: "+998 90 222 44 66", city: "Tashkent", address: "Amir Temur 12" },
    items: [{ id: product.id, qty: 1, unit_type: "pachka" }],
    lang: "uz",
  });
  assert.equal(missingReactPostcode.status, 400);
  assert.equal((await missingReactPostcode.json()).error, "postcode");

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
  const recoverCode = (await recoverOtp.json()).dev_code;
  const recoverWrongCode = await json(app.base + "/api/auth/recover", {
    email: "buyer@example.com",
    password: "new-strong-pass-2026",
    email_code: "000000",
  });
  assert.equal(recoverWrongCode.status, 401);

  const recover = await json(app.base + "/api/auth/recover", {
    email: "buyer@example.com",
    password: "new-strong-pass-2026",
    email_code: recoverCode,
  });
  assert.equal(recover.status, 200);
  const recoveryCookie = recover.headers.get("set-cookie").split(";")[0];
  assert.match(recoveryCookie, /^cid=/);
  const reusedRecoveryCode = await json(app.base + "/api/auth/recover", {
    email: "buyer@example.com",
    password: "another-strong-pass-2026",
    email_code: recoverCode,
  });
  assert.equal(reusedRecoveryCode.status, 401);
  assert.equal((await reusedRecoveryCode.json()).error, "otp_expired");

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

  const passwordlessOtp = await json(app.base + "/api/auth/email-otp/start", { email: "buyer@example.com" });
  const passwordlessCode = (await passwordlessOtp.json()).dev_code;
  const passwordless = await json(app.base + "/api/auth/passwordless", {
    email: "buyer@example.com",
    code: passwordlessCode,
  });
  assert.equal(passwordless.status, 200);
  const reusedPasswordless = await json(app.base + "/api/auth/passwordless", {
    email: "buyer@example.com",
    code: passwordlessCode,
  });
  assert.equal(reusedPasswordless.status, 401);
  assert.equal((await reusedPasswordless.json()).error, "otp_expired");

  sqlite.prepare("UPDATE customers SET provider='firebase' WHERE email='buyer@example.com'").run();
  const firebaseRecoveryOtp = await json(app.base + "/api/auth/email-otp/start", { email: "buyer@example.com" });
  const firebaseRecovery = await json(app.base + "/api/auth/recover", {
    email: "buyer@example.com",
    password: "must-not-replace-firebase",
    email_code: (await firebaseRecoveryOtp.json()).dev_code,
  });
  assert.equal(firebaseRecovery.status, 409);
  assert.deepEqual(await firebaseRecovery.json(), {
    error: "federated_password_reset_required",
    provider: "firebase",
  });
  sqlite.prepare("UPDATE customers SET provider='local' WHERE email='buyer@example.com'").run();

  const likeRes = await json(app.base + "/api/products/" + product.id + "/like", {}, {
    headers: { Cookie: newCustomerCookie, Origin: app.base },
  });
  assert.equal(likeRes.status, 200);
  assert.equal((await likeRes.json()).liked, true);
  const likes = await fetch(app.base + "/api/auth/likes", { headers: { Cookie: newCustomerCookie } });
  assert.equal(likes.status, 200);
  assert.equal((await likes.json()).likes.length, 1);

  const customerOrderRes = await json(app.base + "/api/orders", {
    manager_id: managerId,
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
    manager_id: managerId,
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
  const cancelledBody = await cancelOrder.json();
  assert.equal(cancelledBody.status, "cancelled");
  assert.equal(cancelledBody.stock_released_retail, 1);
  assert.equal(sqlite.prepare("SELECT retail_stock FROM products WHERE id=?").get(product.id).retail_stock, 9);
  const repeatedCustomerCancel = await json(app.base + "/api/auth/orders/" + cancellableOrder.id + "/cancel", {
    reason: "Duplicate retry",
  }, { headers: { Authorization: "Bearer " + newCustomerToken, Origin: app.base } });
  assert.equal(repeatedCustomerCancel.status, 409);
  assert.equal(sqlite.prepare("SELECT retail_stock FROM products WHERE id=?").get(product.id).retail_stock, 9);

  const tooManyQop = await json(app.base + "/api/orders", {
    manager_id: managerId,
    customer: { name: "Limit Buyer", phone: "+998 90 000 00 00" },
    items: [{ id: product.id, qty: 21 }],
  });
  assert.equal(tooManyQop.status, 400);

  const invalidReviewRating = await json(app.base + "/api/reviews", {
    product_id: product.id,
    product_slug: product.slug,
    rating: 0,
    comment: "Invalid rating",
  }, { headers: { Cookie: newCustomerCookie, Origin: app.base } });
  assert.equal(invalidReviewRating.status, 400);
  assert.equal((await invalidReviewRating.json()).error, "rating");

  const emptyReview = await json(app.base + "/api/reviews", {
    product_id: product.id,
    product_slug: product.slug,
    rating: 5,
    comment: "   ",
  }, { headers: { Cookie: newCustomerCookie, Origin: app.base } });
  assert.equal(emptyReview.status, 400);
  assert.equal((await emptyReview.json()).error, "comment");

  const mismatchedReview = await json(app.base + "/api/reviews", {
    product_id: product.id,
    product_slug: "wrong-product-slug",
    rating: 5,
    comment: "Wrong product binding",
  }, { headers: { Cookie: newCustomerCookie, Origin: app.base } });
  assert.equal(mismatchedReview.status, 409);
  assert.equal((await mismatchedReview.json()).error, "product_mismatch");

  const reviewRes = await json(app.base + "/api/reviews", {
    product_id: product.id,
    product_slug: product.slug,
    rating: 5,
    comment: "Verified buyer review",
  }, { headers: { Cookie: newCustomerCookie, Origin: app.base } });
  assert.equal(reviewRes.status, 201);
  const duplicateReview = await json(app.base + "/api/reviews", {
    product_id: product.id,
    product_slug: product.slug,
    rating: 4,
    comment: "Duplicate review",
  }, { headers: { Cookie: newCustomerCookie, Origin: app.base } });
  assert.equal(duplicateReview.status, 409);
  assert.equal((await duplicateReview.json()).error, "duplicate_review");

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
  const businessCookie = businessSignup.headers.get("set-cookie").split(";")[0];
  const businessCustomer = (await businessSignup.json()).customer;
  assert.equal(businessCustomer.account_type, "business");
  assert.equal(businessCustomer.approval_status, "active");
  const unverifiedReview = await json(app.base + "/api/reviews", {
    product_id: product.id,
    product_slug: product.slug,
    rating: 5,
    comment: "No matching purchase",
  }, { headers: { Cookie: businessCookie, Origin: app.base } });
  assert.equal(unverifiedReview.status, 403);
  assert.equal((await unverifiedReview.json()).error, "verified_purchase_required");

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
  assert.match(chat.session_id, /^\d+\.[a-f0-9]{64}$/);
  const numericChatId = chat.session_id.split(".")[0];

  const englishChat = await json(app.base + "/api/chat/message", {
    session_id: chat.session_id,
    message: "What is the wholesale price?",
    lang: "en",
  }, { headers: { Origin: app.base } });
  assert.equal(englishChat.status, 200);
  assert.match((await englishChat.json()).reply, /pack or bag/i);

  const russianChat = await json(app.base + "/api/chat/message", {
    session_id: chat.session_id,
    message: "Какая цена?",
    lang: "ru",
  }, { headers: { Origin: app.base } });
  assert.equal(russianChat.status, 200);
  assert.match((await russianChat.json()).reply, /упаковке или мешку/i);

  const hijackAttempt = await json(app.base + "/api/chat/message", {
    session_id: numericChatId,
    message: "Append to another visitor session",
    lang: "en",
  }, { headers: { Origin: app.base } });
  assert.equal(hijackAttempt.status, 200);
  const isolatedChat = await hijackAttempt.json();
  assert.notEqual(isolatedChat.session_id.split(".")[0], numericChatId);

  const hijackEscalation = await json(app.base + "/api/chat/escalate", {
    session_id: numericChatId,
    name: "Chat Attacker",
    phone: "+998 90 000 11 22",
    message: "Must not alter the original session",
  }, { headers: { Origin: app.base } });
  assert.equal(hijackEscalation.status, 403);
  assert.equal((await hijackEscalation.json()).error, "chat_session_forbidden");

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

  const adminHtmlResponse = await fetch(app.base + "/admin", { headers: { Cookie: cookie } });
  assert.equal(adminHtmlResponse.status, 200);
  const adminHtml = await adminHtmlResponse.text();
  assert.doesNotMatch(adminHtml, /id="edit-ai-fill"/);
  assert.doesNotMatch(adminHtml, /id="edit-ai-msg"/);
  assert.match(adminHtml, /id="f-desc-ru"/);
  assert.match(adminHtml, /id="f-desc-uz"/);
  assert.match(adminHtml, /id="f-desc-en"/);
  const adminScriptResponse = await fetch(app.base + "/js/admin.js");
  assert.equal(adminScriptResponse.status, 200);
  const adminScript = await adminScriptResponse.text();
  assert.doesNotMatch(adminScript, /\/api\/admin\/products\/describe/);
  assert.doesNotMatch(adminScript, /generatePhotoDescription/);
  assert.match(adminScript, /desc:\s*\{\s*ru:\s*\$\("#f-desc-ru"\)\.value,\s*uz:\s*\$\("#f-desc-uz"\)\.value,\s*en:\s*\$\("#f-desc-en"\)\.value\s*\}/);
  const removedDescriptionGenerator = await json(
    app.base + "/api/admin/products/describe",
    { images: ["/assets/img/hero.jpg"] },
    { headers: { Cookie: cookie, Origin: app.base } },
  );
  assert.equal(removedDescriptionGenerator.status, 404);

  const woff = Buffer.alloc(128);
  woff.write("wOFF", 0, "latin1");
  woff.writeUInt32BE(0x00010000, 4);
  woff.writeUInt32BE(woff.length, 8);
  woff.writeUInt16BE(1, 12);
  const fontUpload = await fetch(app.base + "/api/admin/upload", {
    method: "POST",
    headers: { Cookie: cookie, Origin: app.base, "Content-Type": "font/woff" },
    body: woff,
  });
  assert.equal(fontUpload.status, 201);
  const uploadedFont = await fontUpload.json();
  assert.equal(uploadedFont.kind, "font");
  assert.match(uploadedFont.url, /^\/uploads\/f[a-z0-9-]+\.woff$/);
  const servedFont = await fetch(app.base + uploadedFont.url);
  assert.equal(servedFont.status, 200);
  assert.match(servedFont.headers.get("content-type"), /^font\/woff/);

  const manualDescription = {
    en: "MANUAL-EN: Soft lounge set with a relaxed silhouette.",
    ru: "MANUAL-RU: Мягкий комплект свободного силуэта.",
    uz: "MANUAL-UZ: Erkin bichimli yumshoq to‘plam.",
  };
  const manualFabric = {
    en: "MANUAL-FABRIC-EN: Cotton jersey",
    ru: "MANUAL-FABRIC-RU: Хлопковый трикотаж",
    uz: "MANUAL-FABRIC-UZ: Paxta trikotaj",
  };
  const galleryProductPayload = {
    name: "Gallery Product",
    model_no: "GP-2026",
    variant: "black-print",
    gender: "women",
    category: "loungewear",
    price: 7,
    wholesale_price: 7,
    wholesale_moq: 8,
    retail_enabled: true,
    retail_price: 7,
    retail_stock: 0,
    available_qop: 10,
    sizes: ["44", "46", "48", "50", "52", "54"],
    images: ["/assets/img/hero.jpg", "/assets/img/about.jpg", "/assets/img/factory-1.jpg", "/assets/img/factory-2.jpg"],
    colors: ["black + print"],
    desc: manualDescription,
    fabric: manualFabric,
    active: true,
    sort: 2000,
  };
  const adminProductRes = await json(
    app.base + "/api/admin/products",
    galleryProductPayload,
    { headers: { Cookie: cookie, Origin: app.base } },
  );
  assert.equal(adminProductRes.status, 201);
  const adminProduct = await adminProductRes.json();
  assert.equal(adminProduct.copy_manual, true);
  assert.deepEqual(adminProduct.desc, manualDescription);
  assert.deepEqual(adminProduct.fabric, manualFabric);
  assert.equal(adminProduct.wholesale_moq, 6);
  const storedProduct = sqlite.prepare(`
    SELECT wholesale_moq, copy_manual, desc_en, desc_ru, desc_uz, fabric_en, fabric_ru, fabric_uz
    FROM products WHERE id=?
  `).get(adminProduct.id);
  assert.equal(storedProduct.wholesale_moq, 6);
  assert.equal(storedProduct.copy_manual, 1);
  assert.deepEqual(
    { en: storedProduct.desc_en, ru: storedProduct.desc_ru, uz: storedProduct.desc_uz },
    manualDescription,
  );
  assert.deepEqual(
    { en: storedProduct.fabric_en, ru: storedProduct.fabric_ru, uz: storedProduct.fabric_uz },
    manualFabric,
  );
  const adminProductsAfterCreate = await (
    await fetch(app.base + "/api/admin/products?limit=250", { headers: { Cookie: cookie } })
  ).json();
  const reloadedAdminProduct = adminProductsAfterCreate.find((row) => row.id === adminProduct.id);
  assert.deepEqual(reloadedAdminProduct.desc, manualDescription);
  assert.deepEqual(reloadedAdminProduct.fabric, manualFabric);
  const publicProductsAfterCreate = await (await fetch(app.base + "/api/products?limit=1000")).json();
  const publicAdminProduct = publicProductsAfterCreate.find((row) => row.id === adminProduct.id);
  assert.ok(publicAdminProduct);
  assert.equal(publicAdminProduct.wholesale_moq, 6);
  assert.deepEqual(publicAdminProduct.order_units.map((unit) => [unit.unit_type, unit.pieces, unit.per_size]), [
    ["pachka", 6, 1],
    ["qop", 60, 10],
  ]);
  assert.deepEqual(publicAdminProduct.images, adminProduct.images);
  assert.deepEqual(publicAdminProduct.colors, ["black-print"]);
  assert.deepEqual(publicAdminProduct.desc, manualDescription);
  assert.deepEqual(publicAdminProduct.fabric, manualFabric);

  const editedDescription = {
    en: "EDITED-EN: Updated product description saved by an administrator.",
    ru: "EDITED-RU: Обновлённое описание, сохранённое администратором.",
    uz: "EDITED-UZ: Administrator saqlagan yangilangan mahsulot tavsifi.",
  };
  const editedFabric = {
    en: "EDITED-FABRIC-EN: Brushed cotton",
    ru: "EDITED-FABRIC-RU: Хлопок с мягкой обработкой",
    uz: "EDITED-FABRIC-UZ: Yumshoq ishlov berilgan paxta",
  };
  const updateProductRes = await json(
    app.base + "/api/admin/products/" + adminProduct.id,
    { ...galleryProductPayload, slug: adminProduct.slug, desc: editedDescription, fabric: editedFabric, sort: 2001 },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } },
  );
  assert.equal(updateProductRes.status, 200);
  const updatedAdminProduct = await updateProductRes.json();
  assert.deepEqual(updatedAdminProduct.desc, editedDescription);
  assert.deepEqual(updatedAdminProduct.fabric, editedFabric);
  const storedUpdatedProduct = sqlite.prepare(`
    SELECT copy_manual, desc_en, desc_ru, desc_uz, fabric_en, fabric_ru, fabric_uz
    FROM products WHERE id=?
  `).get(adminProduct.id);
  assert.equal(storedUpdatedProduct.copy_manual, 1);
  assert.deepEqual(
    { en: storedUpdatedProduct.desc_en, ru: storedUpdatedProduct.desc_ru, uz: storedUpdatedProduct.desc_uz },
    editedDescription,
  );
  assert.deepEqual(
    { en: storedUpdatedProduct.fabric_en, ru: storedUpdatedProduct.fabric_ru, uz: storedUpdatedProduct.fabric_uz },
    editedFabric,
  );
  const publicUpdatedProduct = await (await fetch(app.base + "/api/products/" + adminProduct.slug)).json();
  assert.deepEqual(publicUpdatedProduct.desc, editedDescription);
  assert.deepEqual(publicUpdatedProduct.fabric, editedFabric);

  sqlite.prepare(`
    UPDATE products
    SET copy_manual=0, desc_en='LEGACY-EN', desc_ru='LEGACY-RU', desc_uz='LEGACY-UZ'
    WHERE id=?
  `).run(adminProduct.id);
  const legacyFallbackProduct = await (await fetch(app.base + "/api/products/" + adminProduct.slug)).json();
  assert.doesNotMatch(legacyFallbackProduct.desc.en, /LEGACY-EN/);
  assert.doesNotMatch(legacyFallbackProduct.desc.ru, /LEGACY-RU/);
  assert.doesNotMatch(legacyFallbackProduct.desc.uz, /LEGACY-UZ/);
  sqlite.prepare(`
    UPDATE products
    SET copy_manual=1, desc_en=?, desc_ru=?, desc_uz=?
    WHERE id=?
  `).run(editedDescription.en, editedDescription.ru, editedDescription.uz, adminProduct.id);

  const seoResponse = await fetch(app.base + "/p/" + adminProduct.slug, {
    headers: { Accept: "text/html" },
  });
  assert.equal(seoResponse.status, 200);
  const seoHtml = await seoResponse.text();
  assert.match(seoHtml, /<title>[^<]*GP-2026[^<]*black-print[^<]*MILANA PREMIUM<\/title>/);
  const jsonLdMatch = seoHtml.match(/<script id="product-jsonld" type="application\/ld\+json">([^<]+)<\/script>/);
  assert.ok(jsonLdMatch);
  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert.match(jsonLd.sku, /GP-2026/);
  assert.match(jsonLd.sku, /black-print/);
  assert.notEqual(jsonLd.category, adminProduct.catalog_panel);
  assert.equal(jsonLd.offers.availability, "https://schema.org/InStock");
  sqlite.prepare("UPDATE products SET available_qop=0 WHERE id=?").run(adminProduct.id);
  const outOfStockHtml = await (await fetch(app.base + "/p/" + adminProduct.slug)).text();
  const outOfStockJsonLd = JSON.parse(
    outOfStockHtml.match(/<script id="product-jsonld" type="application\/ld\+json">([^<]+)<\/script>/)[1]
  );
  assert.equal(outOfStockJsonLd.offers.availability, "https://schema.org/OutOfStock");

  sqlite.prepare("UPDATE products SET active=0 WHERE id=?").run(adminProduct.id);
  const productsAfterHide = await (await fetch(app.base + "/api/products?limit=1000")).json();
  assert.equal(productsAfterHide.some((row) => row.id === adminProduct.id), false);
  assert.equal((await fetch(app.base + "/api/products/" + adminProduct.slug)).status, 404);
  const hiddenOrder = await json(app.base + "/api/orders", {
    manager_id: managerId,
    customer: { name: "Hidden Buyer", phone: "+998 90 444 55 66" },
    items: [{ id: adminProduct.id, qty: 1, unit_type: "qop" }],
  });
  assert.equal(hiddenOrder.status, 400);
  assert.equal((await hiddenOrder.json()).error, "item_unavailable");
  const hiddenPage = await fetch(app.base + "/p/" + adminProduct.slug, {
    headers: { Accept: "text/html" },
  });
  assert.equal(hiddenPage.status, 404);
  assert.match(hiddenPage.headers.get("content-type"), /^text\/html/);
  assert.match(await hiddenPage.text(), /Страница не найдена/);
  const unknownPage = await fetch(app.base + "/missing-branded-page", {
    headers: { Accept: "text/html" },
  });
  assert.equal(unknownPage.status, 404);
  assert.match(await unknownPage.text(), /MILANA PREMIUM/);

  const adminOrders = await fetch(app.base + "/api/admin/orders", { headers: { Cookie: cookie } });
  assert.equal(adminOrders.status, 200);
  const orders = await adminOrders.json();
  assert.equal(orders.length, 4);
  const adminOrder = orders.find((row) => row.number === order.number);
  assert.ok(adminOrder);
  assert.equal(adminOrder.order_type, "wholesale");
  assert.equal(adminOrder.payment.method, "bank");
  assert.equal(adminOrder.payment.status, "pending");
  assert.equal(adminOrder.payment.amount, order.total);
  assert.equal(adminOrder.items[0].bag_size, 60);
  assert.equal(adminOrder.items[0].unit_type, "qop");
  assert.equal(adminOrder.items[0].color, selectedColor);
  assert.equal(adminOrder.items[0].unit_price, product.price);
  assert.equal(adminOrder.items[0].price, Math.round(product.price * 60 * 100) / 100);
  const expectedSizes = [...product.sizes, "44", "46", "48", "50", "52", "54"]
    .filter((size, idx, arr) => arr.indexOf(size) === idx)
    .slice(0, 6);
  assert.deepEqual(adminOrder.items[0].size_mix, expectedSizes.map((size) => ({ size, qty: 10 })));
  const adminPachkaOrder = orders.find((row) => row.number === pachkaOrder.number);
  assert.ok(adminPachkaOrder);
  assert.equal(adminPachkaOrder.items[0].unit_type, "pachka");
  assert.equal(adminPachkaOrder.items[0].bag_size, 6);
  assert.equal(adminPachkaOrder.items[0].unit_price, pachkaUnitPrice);
  assert.equal(adminPachkaOrder.items[0].price, Math.round(pachkaUnitPrice * 6 * 100) / 100);
  assert.equal(adminPachkaOrder.items[0].size_mix.reduce((sum, row) => sum + row.qty, 0), 6);

  const blocked = await json(
    app.base + "/api/admin/orders/" + adminOrder.id,
    { status: "done" },
    { method: "PUT", headers: { Cookie: cookie, Origin: "https://evil.example" } }
  );
  assert.equal(blocked.status, 403);

  const cancelPachka = await json(
    app.base + "/api/admin/orders/" + adminPachkaOrder.id,
    { status: "cancelled" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(cancelPachka.status, 200);
  assert.equal((await cancelPachka.json()).stock_released.qop, 0.1);
  assert.equal(sqlite.prepare("SELECT available_qop FROM products WHERE id=?").get(product.id).available_qop, 8);
  const repeatPachkaCancel = await json(
    app.base + "/api/admin/orders/" + adminPachkaOrder.id,
    { status: "cancelled" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(repeatPachkaCancel.status, 200);
  assert.equal((await repeatPachkaCancel.json()).stock_released.qop, 0);
  assert.equal(sqlite.prepare("SELECT available_qop FROM products WHERE id=?").get(product.id).available_qop, 8);

  const invalidOrderTransition = await json(
    app.base + "/api/admin/orders/" + adminOrder.id,
    { status: "done" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(invalidOrderTransition.status, 409);
  assert.equal((await invalidOrderTransition.json()).error, "invalid_order_transition");
  for (const status of ["processing", "shipped", "done"]) {
    const transition = await json(
      app.base + "/api/admin/orders/" + adminOrder.id,
      { status },
      { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
    );
    assert.equal(transition.status, 200);
  }

  const proofOrder = orders.find((row) => row.number === customerOrder.number);
  assert.ok(proofOrder);
  const requestMorePaymentInfo = await json(
    app.base + "/api/admin/payments/" + proofOrder.payment.id,
    { status: "waiting_for_customer" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(requestMorePaymentInfo.status, 200);
  const resubmitPayment = await json(
    app.base + "/api/admin/payments/" + proofOrder.payment.id,
    { status: "submitted" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(resubmitPayment.status, 200);

  const paymentAllowed = await json(
    app.base + "/api/admin/payments/" + adminOrder.payment.id,
    { status: "paid", reference: "BANK-TEST-1" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(paymentAllowed.status, 200);
  const invalidPaymentTransition = await json(
    app.base + "/api/admin/payments/" + adminOrder.payment.id,
    { status: "pending" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(invalidPaymentTransition.status, 409);
  assert.equal((await invalidPaymentTransition.json()).error, "invalid_payment_transition");
  const refundPayment = await json(
    app.base + "/api/admin/payments/" + adminOrder.payment.id,
    { status: "refunded" },
    { method: "PUT", headers: { Cookie: cookie, Origin: app.base } }
  );
  assert.equal(refundPayment.status, 200);

  const managerLogin = await json(app.base + "/api/login", {
    login: "manager",
    password: "test-manager-password",
  }, { headers: { Origin: app.base } });
  assert.equal(managerLogin.status, 200);
  const managerCookie = managerLogin.headers.get("set-cookie").split(";")[0];
  const adminManagers = await fetch(app.base + "/api/admin/managers", { headers: { Cookie: cookie } });
  const managerRecord = (await adminManagers.json()).find((row) => row.id === managerId);
  assert.ok(managerRecord);
  const rotateManagerPassword = await json(app.base + "/api/admin/managers/" + managerId, {
    ...managerRecord,
    password: "rotated-manager-password",
    active: true,
  }, { method: "PUT", headers: { Cookie: cookie, Origin: app.base } });
  assert.equal(rotateManagerPassword.status, 200);
  const revokedManagerSession = await fetch(app.base + "/api/admin/orders", {
    headers: { Cookie: managerCookie },
  });
  assert.equal(revokedManagerSession.status, 401);
  const rotatedManagerLogin = await json(app.base + "/api/login", {
    login: "manager",
    password: "rotated-manager-password",
  }, { headers: { Origin: app.base } });
  assert.equal(rotatedManagerLogin.status, 200);
  assert.equal((await rotatedManagerLogin.json()).role, "manager");
  assert.equal((await (await fetch(app.base + "/api/managers")).json()).some((row) => row.id === managerId), true);

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
  sqlite.prepare(`
    INSERT INTO reviews
      (product_id, product_slug, customer_id, rating, comment, verified_purchase, status)
    VALUES (?,?,?,?,?,0,'approved')
  `).run(product.id, product.slug, businessCustomer.id, 5, "Legacy unverified review");
  const publicReviews = await fetch(app.base + "/api/products/" + product.slug + "/reviews?product_id=" + product.id);
  assert.equal(publicReviews.status, 200);
  const publicReviewBody = await publicReviews.json();
  assert.equal(publicReviewBody.summary.count, 1);
  assert.equal(publicReviewBody.summary.rating, 5);
  assert.equal(publicReviewBody.reviews.length, 1);
  const ratedProduct = await (await fetch(app.base + "/api/products/" + product.slug)).json();
  assert.equal(ratedProduct.reviews, 1);
  assert.equal(ratedProduct.rating, 5);

  const adminChat = await fetch(app.base + "/api/admin/chat", { headers: { Cookie: cookie } });
  assert.equal(adminChat.status, 200);
  assert.equal((await adminChat.json()).length, 3);

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
