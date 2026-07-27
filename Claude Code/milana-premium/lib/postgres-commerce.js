"use strict";

const { Pool } = require("pg");

function jsonValue(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

class PostgresCommerce {
  constructor(options = {}) {
    if (!options.pool && !options.connectionString) throw new Error("DATABASE_URL is required for PostgreSQL commerce.");
    this.ownsPool = !options.pool;
    this.pool = options.pool || new Pool({
      connectionString: options.connectionString,
      max: Math.max(2, Math.min(50, Number(options.max) || 10)),
      min: Math.max(0, Math.min(10, Number(options.min) || 0)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: Math.max(1_000, Number(options.statementTimeoutMillis) || 15_000),
      application_name: options.applicationName || "milana-commerce",
    });
    if (this.ownsPool) this.pool.on("error", (error) => console.error("PostgreSQL commerce pool error:", error.message));
  }

  async health() {
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*)::bigint FROM customers) customers,
        (SELECT COUNT(*)::bigint FROM orders) orders,
        (SELECT COUNT(*)::bigint FROM customer_sessions) sessions
    `);
    return Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)]));
  }

  async upsertCustomer(input) {
    const result = await this.pool.query(`
      INSERT INTO customers (
        email, name, phone, city, address, account_type, approval_status,
        company_name, tax_id, legal_address, contact_person, expected_volume,
        business_license_url, terms_accepted_at, phone_verified,
        provider, provider_uid, password_hash
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )
      ON CONFLICT (email) DO UPDATE SET
        name=COALESCE(NULLIF(EXCLUDED.name,''), customers.name),
        phone=COALESCE(NULLIF(EXCLUDED.phone,''), customers.phone),
        city=COALESCE(NULLIF(EXCLUDED.city,''), customers.city),
        address=COALESCE(NULLIF(EXCLUDED.address,''), customers.address),
        account_type=COALESCE(NULLIF(EXCLUDED.account_type,''), customers.account_type),
        approval_status=COALESCE(NULLIF(EXCLUDED.approval_status,''), customers.approval_status),
        company_name=COALESCE(NULLIF(EXCLUDED.company_name,''), customers.company_name),
        tax_id=COALESCE(NULLIF(EXCLUDED.tax_id,''), customers.tax_id),
        legal_address=COALESCE(NULLIF(EXCLUDED.legal_address,''), customers.legal_address),
        contact_person=COALESCE(NULLIF(EXCLUDED.contact_person,''), customers.contact_person),
        expected_volume=COALESCE(NULLIF(EXCLUDED.expected_volume,''), customers.expected_volume),
        business_license_url=COALESCE(NULLIF(EXCLUDED.business_license_url,''), customers.business_license_url),
        terms_accepted_at=COALESCE(NULLIF(EXCLUDED.terms_accepted_at,''), customers.terms_accepted_at),
        phone_verified=(customers.phone_verified OR EXCLUDED.phone_verified),
        provider=EXCLUDED.provider,
        provider_uid=COALESCE(NULLIF(EXCLUDED.provider_uid,''), customers.provider_uid),
        password_hash=COALESCE(NULLIF(EXCLUDED.password_hash,''), customers.password_hash),
        updated_at=now()
      RETURNING *
    `, [
      input.email, input.name || "", input.phone || "", input.city || "", input.address || "",
      input.account_type || "business", input.approval_status || "active", input.company_name || "",
      input.tax_id || "", input.legal_address || "", input.contact_person || "", input.expected_volume || "",
      input.business_license_url || "", input.terms_accepted_at || "", Boolean(input.phone_verified),
      input.provider || "local", input.provider_uid || "", input.password_hash || "",
    ]);
    return result.rows[0];
  }

  async customerByEmail(email) {
    return (await this.pool.query("SELECT * FROM customers WHERE email=$1 LIMIT 1", [email])).rows[0] || null;
  }

  async customerById(id) {
    return (await this.pool.query("SELECT * FROM customers WHERE id=$1 LIMIT 1", [id])).rows[0] || null;
  }

  async createCustomerSession(tokenHash, customerId, createdAt) {
    await this.pool.query("INSERT INTO customer_sessions (token, customer_id, created_at) VALUES ($1,$2,$3)", [tokenHash, customerId, createdAt]);
  }

  async customerFromSession(tokenHash, cutoff) {
    await this.pool.query(
      "DELETE FROM customer_sessions WHERE token=$1 AND created_at < $2",
      [tokenHash, cutoff],
    );
    const result = await this.pool.query(`
      SELECT c.* FROM customer_sessions s
      JOIN customers c ON c.id=s.customer_id
      WHERE s.token=$1 LIMIT 1
    `, [tokenHash]);
    return result.rows[0] || null;
  }

  async deleteCustomerSession(tokenHash) {
    await this.pool.query("DELETE FROM customer_sessions WHERE token=$1", [tokenHash]);
  }

  async deleteCustomerSessions(customerId) {
    await this.pool.query("DELETE FROM customer_sessions WHERE customer_id=$1", [customerId]);
  }

  async updateCustomerProfile(id, profile) {
    return (await this.pool.query(`
      UPDATE customers SET name=$1, phone=$2, city=$3, address=$4, updated_at=now()
      WHERE id=$5 RETURNING *
    `, [profile.name, profile.phone, profile.city, profile.address, id])).rows[0] || null;
  }

  async updateCustomerPassword(id, passwordHash) {
    return (await this.pool.query(`
      UPDATE customers SET password_hash=$1, provider='local', updated_at=now() WHERE id=$2 RETURNING *
    `, [passwordHash, id])).rows[0] || null;
  }

  async upsertOtp(kind, key, codeHash, expiresAt) {
    const table = kind === "phone" ? "phone_otps" : "email_otps";
    const column = kind === "phone" ? "phone" : "email";
    await this.pool.query(`
      INSERT INTO ${table} (${column}, code_hash, expires_at, attempts, verified_at)
      VALUES ($1,$2,$3,0,'')
      ON CONFLICT (${column}) DO UPDATE SET
        code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at,
        attempts=0, verified_at='', created_at=now()
    `, [key, codeHash, expiresAt]);
  }

  async otp(kind, key) {
    const table = kind === "phone" ? "phone_otps" : "email_otps";
    const column = kind === "phone" ? "phone" : "email";
    return (await this.pool.query(`SELECT * FROM ${table} WHERE ${column}=$1 LIMIT 1`, [key])).rows[0] || null;
  }

  async incrementOtp(kind, key) {
    const table = kind === "phone" ? "phone_otps" : "email_otps";
    const column = kind === "phone" ? "phone" : "email";
    await this.pool.query(`UPDATE ${table} SET attempts=attempts+1 WHERE ${column}=$1`, [key]);
  }

  async verifyOtp(kind, key) {
    const table = kind === "phone" ? "phone_otps" : "email_otps";
    const column = kind === "phone" ? "phone" : "email";
    await this.pool.query(`UPDATE ${table} SET verified_at=now()::text WHERE ${column}=$1`, [key]);
  }

  async ensureDefaultPromo() {
    await this.pool.query(`
      INSERT INTO promo_codes
        (code,title,description,discount_type,value,min_total,usage_limit,per_customer_limit,starts_at,expires_at,active)
      VALUES
        ('WELCOME10','Welcome coupon','10% off your next Milana order.','percent',10,0,0,1,now()::text,(now() + interval '365 days')::text,true)
      ON CONFLICT (code) DO NOTHING
    `);
  }

  async promoByCode(code) {
    return (await this.pool.query("SELECT * FROM promo_codes WHERE code=$1 LIMIT 1", [code])).rows[0] || null;
  }

  async couponByCustomerCode(customerId, code) {
    return (await this.pool.query("SELECT * FROM customer_coupons WHERE customer_id=$1 AND code=$2 LIMIT 1", [customerId, code])).rows[0] || null;
  }

  async couponCounts(promoId, customerId) {
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM customer_coupons WHERE promo_id=$1) total,
        (SELECT COUNT(*)::int FROM customer_coupons WHERE customer_id=$2 AND promo_id=$1) customer
    `, [promoId, customerId]);
    return result.rows[0];
  }

  async assignCoupon(customerId, promo, source) {
    const result = await this.pool.query(`
      INSERT INTO customer_coupons
        (customer_id,promo_id,code,title,description,discount_type,value,min_total,status,source,assigned_at,expires_at,metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,now()::text,$10,$11::jsonb)
      ON CONFLICT (customer_id,code) DO UPDATE SET code=EXCLUDED.code
      RETURNING *
    `, [customerId, promo.id || null, promo.code, promo.title || promo.code, promo.description || "",
      promo.discount_type || "percent", Number(promo.value) || 0, Number(promo.min_total) || 0,
      source, promo.expires_at || "", JSON.stringify({ assigned_by: source })]);
    return result.rows[0];
  }

  async couponsForCustomer(customerId) {
    return (await this.pool.query(`
      SELECT * FROM customer_coupons WHERE customer_id=$1
      ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'reserved' THEN 1 WHEN 'used' THEN 2 ELSE 3 END,
        COALESCE(NULLIF(expires_at,''),'9999-12-31') ASC, id DESC
    `, [customerId])).rows;
  }

  async customerOrderSummary(customerId, limit = 6) {
    return (await this.pool.query(`
      SELECT id,number,status,order_type,tracking_number,items,total,lang,created_at,updated_at
      FROM orders WHERE customer_id=$1 ORDER BY id DESC LIMIT $2
    `, [customerId, limit])).rows;
  }

  async customerDashboardTotals(customerId) {
    return (await this.pool.query(`
      SELECT COUNT(*)::int orders_count, COALESCE(SUM(total),0) lifetime_spend
      FROM orders WHERE customer_id=$1 AND status!='cancelled'
    `, [customerId])).rows[0];
  }

  async customerOrders(customerId, limit = 50) {
    return (await this.pool.query(`
      SELECT o.*, p.id payment_id, p.method payment_method, p.provider payment_provider,
        p.status payment_status, p.amount payment_amount, p.currency payment_currency,
        p.reference payment_reference, p.payload payment_payload
      FROM orders o
      LEFT JOIN LATERAL (SELECT * FROM payments WHERE order_id=o.id ORDER BY id DESC LIMIT 1) p ON true
      WHERE o.customer_id=$1 ORDER BY o.id DESC LIMIT $2
    `, [customerId, limit])).rows;
  }

  async createCheckout(input) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const adjustment of input.stockAdjustments || []) {
        let result;
        if (adjustment.type === "retail") {
          result = await client.query(`
            UPDATE products SET retail_stock=CASE WHEN retail_stock=0 THEN 0 ELSE retail_stock-$1 END, updated_at=now()
            WHERE id=$2 AND (retail_stock=0 OR retail_stock >= $1)
          `, [adjustment.qty, adjustment.id]);
        } else {
          result = await client.query(`
            UPDATE products SET available_qop=CASE WHEN available_qop IS NULL THEN NULL ELSE available_qop-$1 END, updated_at=now()
            WHERE id=$2 AND (available_qop IS NULL OR available_qop >= $1)
          `, [adjustment.qop, adjustment.id]);
        }
        if (!result.rowCount) throw new Error("insufficient_stock");
      }
      const order = (await client.query(`
        INSERT INTO orders (customer_id,customer,items,total,order_type,lang,manager_id,manager_name)
        VALUES ($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7,$8) RETURNING *
      `, [
        input.customerId || null,
        JSON.stringify(input.customer),
        JSON.stringify(input.items),
        input.total,
        input.orderType,
        input.lang,
        input.managerId || null,
        input.managerName || "",
      ])).rows[0];
      const number = `MP-${new Date().getFullYear()}-${String(order.id).padStart(4, "0")}`;
      await client.query("UPDATE orders SET number=$1 WHERE id=$2", [number, order.id]);
      const payment = (await client.query(`
        INSERT INTO payments (order_id,order_number,provider,method,status,amount,currency,payload)
        VALUES ($1,$2,$3,$4,'pending',$5,'USD',$6::jsonb) RETURNING *
      `, [order.id, number, input.paymentProvider, input.paymentMethod, input.total,
        JSON.stringify({ source: "checkout", gateway_connected: false })])).rows[0];
      await client.query("COMMIT");
      return { order: { ...order, number }, payment };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async customerOrderAndPayment(orderId, customerId) {
    const result = await this.pool.query(`
      SELECT o.*, p.id payment_id, p.method payment_method, p.provider payment_provider,
        p.status payment_status, p.amount payment_amount, p.currency payment_currency,
        p.reference payment_reference, p.payload payment_payload
      FROM orders o
      LEFT JOIN LATERAL (SELECT * FROM payments WHERE order_id=o.id ORDER BY id DESC LIMIT 1) p ON true
      WHERE o.id=$1 AND o.customer_id=$2 LIMIT 1
    `, [orderId, customerId]);
    return result.rows[0] || null;
  }

  async cancelOrder(orderId, customerId, reason) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query(`
        SELECT o.*, p.id payment_id, p.status payment_status
        FROM orders o LEFT JOIN LATERAL (SELECT * FROM payments WHERE order_id=o.id ORDER BY id DESC LIMIT 1) p ON true
        WHERE o.id=$1 AND o.customer_id=$2 FOR UPDATE OF o
      `, [orderId, customerId])).rows[0];
      if (!row) throw new Error("not_found");
      if (row.status !== "new" || !["pending", "waiting_for_customer", "invoice_sent"].includes(row.payment_status || "pending")) {
        throw new Error("cannot_cancel");
      }
      const payload = { cancelled_by: "customer", reason, cancelled_at: new Date().toISOString() };
      await client.query("UPDATE orders SET status='cancelled',updated_at=now() WHERE id=$1", [orderId]);
      if (row.payment_id) await client.query("UPDATE payments SET status='cancelled',payload=$1::jsonb,updated_at=now() WHERE id=$2", [JSON.stringify(payload), row.payment_id]);
      await client.query("COMMIT");
      return row;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async submitPaymentProof(paymentId, method, reference, payload) {
    return (await this.pool.query(`
      UPDATE payments SET method=$1,status='submitted',reference=COALESCE(NULLIF($2,''),reference),
        payload=$3::jsonb,updated_at=now() WHERE id=$4 RETURNING *
    `, [method, reference, JSON.stringify(payload), paymentId])).rows[0] || null;
  }

  async ordersForCustomer(customerId, limit = 100) {
    return (await this.pool.query("SELECT id,items FROM orders WHERE customer_id=$1 AND status!='cancelled' ORDER BY id DESC LIMIT $2", [customerId, limit])).rows;
  }

  async likesForCustomer(customerId, limit = 100) {
    return (await this.pool.query(`
      SELECT l.product_id,l.product_slug,l.created_at,p.slug,p.name,p.price,p.images
      FROM likes l LEFT JOIN products p ON p.id=l.product_id
      WHERE l.customer_id=$1 ORDER BY l.id DESC LIMIT $2
    `, [customerId, limit])).rows;
  }

  async addLike(customerId, productId, productSlug) {
    await this.pool.query(`
      INSERT INTO likes (customer_id,product_id,product_slug) VALUES ($1,$2,$3)
      ON CONFLICT (customer_id,product_id) DO NOTHING
    `, [customerId, productId, productSlug]);
    return this.likeCount(productId);
  }

  async deleteLike(customerId, productId) {
    await this.pool.query("DELETE FROM likes WHERE customer_id=$1 AND product_id=$2", [customerId, productId]);
    return this.likeCount(productId);
  }

  async likeCount(productId) {
    return Number((await this.pool.query("SELECT COUNT(*)::int count FROM likes WHERE product_id=$1", [productId])).rows[0].count);
  }

  async reviewsForProduct(productId, productSlug, limit = 50) {
    return (await this.pool.query(`
      SELECT r.id,r.rating,r.comment,r.photo_url,r.verified_purchase,r.created_at,
        COALESCE(c.name,'Milana customer') customer_name
      FROM reviews r LEFT JOIN customers c ON c.id=r.customer_id
      WHERE r.status='approved' AND (r.product_slug=$1 OR r.product_id=$2)
      ORDER BY r.id DESC LIMIT $3
    `, [productSlug, productId, limit])).rows;
  }

  async reviewSummary(productId, productSlug) {
    return (await this.pool.query(`
      SELECT COUNT(*)::int count,COALESCE(AVG(rating),0) rating
      FROM reviews WHERE status='approved' AND (product_slug=$1 OR product_id=$2)
    `, [productSlug, productId])).rows[0];
  }

  async createReview(input) {
    return (await this.pool.query(`
      INSERT INTO reviews (product_id,product_slug,customer_id,order_id,rating,comment,photo_url,verified_purchase,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,'pending') RETURNING *
    `, [input.productId || null, input.productSlug, input.customerId, input.orderId, input.rating, input.comment, input.photoUrl])).rows[0];
  }

  async supportForCustomer(customerId, limit = 50) {
    return (await this.pool.query(`
      SELECT id,number,topic,message,status,lang,created_at,updated_at
      FROM support_requests WHERE customer_id=$1 ORDER BY id DESC LIMIT $2
    `, [customerId, limit])).rows;
  }

  async createSupport(input) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query(`
        INSERT INTO support_requests (customer_id,name,phone,email,topic,message,lang)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [input.customerId || null, input.name, input.phone, input.email, input.topic, input.message, input.lang])).rows[0];
      const number = `MS-${new Date().getFullYear()}-${String(row.id).padStart(4, "0")}`;
      await client.query("UPDATE support_requests SET number=$1 WHERE id=$2", [number, row.id]);
      await client.query("COMMIT");
      return { ...row, number };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async chatSession(id) {
    return (await this.pool.query("SELECT * FROM chat_sessions WHERE id=$1", [id])).rows[0] || null;
  }

  async createChatSession(input) {
    return (await this.pool.query(`
      INSERT INTO chat_sessions (customer_id,visitor_name,visitor_phone,visitor_email,status)
      VALUES ($1,$2,$3,$4,'bot') RETURNING *
    `, [input.customerId || null, input.name, input.phone, input.email])).rows[0];
  }

  async addChatMessage(sessionId, senderType, message) {
    await this.pool.query("INSERT INTO chat_messages (session_id,sender_type,message) VALUES ($1,$2,$3)", [sessionId, senderType, message]);
  }

  async escalateChat(sessionId, details = {}) {
    await this.pool.query(`
      UPDATE chat_sessions SET status='escalated',visitor_name=COALESCE(NULLIF($2,''),visitor_name),
        visitor_phone=COALESCE(NULLIF($3,''),visitor_phone),visitor_email=COALESCE(NULLIF($4,''),visitor_email),updated_at=now()
      WHERE id=$1
    `, [sessionId, details.name || "", details.phone || "", details.email || ""]);
  }

  async adminReviews() {
    return (await this.pool.query(`
      SELECT r.*,c.name customer_name,c.email customer_email
      FROM reviews r LEFT JOIN customers c ON c.id=r.customer_id ORDER BY r.id DESC LIMIT 1000
    `)).rows;
  }

  async reviewById(id) {
    return (await this.pool.query("SELECT * FROM reviews WHERE id=$1", [id])).rows[0] || null;
  }

  async updateReviewStatus(id, status) {
    return (await this.pool.query("UPDATE reviews SET status=$1,updated_at=now() WHERE id=$2 RETURNING *", [status, id])).rows[0] || null;
  }

  async adminSupport() {
    return (await this.pool.query("SELECT * FROM support_requests ORDER BY id DESC LIMIT 500")).rows;
  }

  async supportById(id) {
    return (await this.pool.query("SELECT * FROM support_requests WHERE id=$1", [id])).rows[0] || null;
  }

  async updateSupportStatus(id, status) {
    return (await this.pool.query("UPDATE support_requests SET status=$1,updated_at=now() WHERE id=$2 RETURNING *", [status, id])).rows[0] || null;
  }

  async adminChat() {
    const sessions = (await this.pool.query("SELECT * FROM chat_sessions ORDER BY id DESC LIMIT 500")).rows;
    if (!sessions.length) return [];
    const messages = (await this.pool.query("SELECT * FROM chat_messages WHERE session_id=ANY($1::int[]) ORDER BY id ASC", [sessions.map((row) => row.id)])).rows;
    return sessions.map((session) => ({ ...session, messages: messages.filter((message) => message.session_id === session.id) }));
  }

  async orderById(id) {
    return (await this.pool.query("SELECT * FROM orders WHERE id=$1", [id])).rows[0] || null;
  }

  async paymentById(id) {
    return (await this.pool.query("SELECT * FROM payments WHERE id=$1", [id])).rows[0] || null;
  }

  async updateChatStatus(id, status) {
    return (await this.pool.query("UPDATE chat_sessions SET status=$1,updated_at=now() WHERE id=$2 RETURNING *", [status, id])).rows[0] || null;
  }

  async adminCustomers() {
    return (await this.pool.query(`
      SELECT * FROM customers
      ORDER BY CASE approval_status WHEN 'pending_review' THEN 0 WHEN 'info_requested' THEN 1 ELSE 2 END,id DESC LIMIT 1000
    `)).rows;
  }

  async updateCustomerApproval(id, approvalStatus) {
    return (await this.pool.query("UPDATE customers SET approval_status=$1,updated_at=now() WHERE id=$2 RETURNING *", [approvalStatus, id])).rows[0] || null;
  }

  async updateCustomerCommercial(id, tier, manager, discount) {
    return (await this.pool.query(`UPDATE customers SET customer_tier=$1,assigned_manager=$2,price_discount=$3,updated_at=now() WHERE id=$4 RETURNING *`,
      [tier, manager, discount, id])).rows[0] || null;
  }

  async adminOrders(limit = 500, managerId = null) {
    return (await this.pool.query(`
      SELECT o.*, to_jsonb(p.*) payment
      FROM orders o LEFT JOIN LATERAL (SELECT * FROM payments WHERE order_id=o.id ORDER BY id DESC LIMIT 1) p ON true
      WHERE ($2::int IS NULL OR o.manager_id=$2)
      ORDER BY o.id DESC LIMIT $1
    `, [limit, managerId])).rows;
  }

  async updateOrderStatus(id, status, trackingNumber) {
    return (await this.pool.query(`
      UPDATE orders SET status=$1,tracking_number=COALESCE(NULLIF($2,''),tracking_number),updated_at=now() WHERE id=$3 RETURNING *
    `, [status, trackingNumber, id])).rows[0] || null;
  }

  async updatePaymentStatus(id, status, reference) {
    return (await this.pool.query("UPDATE payments SET status=$1,reference=$2,updated_at=now() WHERE id=$3 RETURNING *", [status, reference, id])).rows[0] || null;
  }

  async close() {
    if (this.ownsPool) await this.pool.end();
  }
}

module.exports = { PostgresCommerce, jsonValue };
