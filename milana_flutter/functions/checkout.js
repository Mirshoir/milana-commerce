'use strict';

const crypto = require('node:crypto');

const bagSize = 60;
const sizeCount = 6;
const qtyPerSize = 10;
const allowedPaymentMethods = new Set([
  'manager',
  'bank',
  'click',
  'payme',
  'card',
  'cash',
]);
const allowedPaymentStatuses = new Set([
  'pending',
  'waiting_for_customer',
  'submitted',
  'paid',
  'failed',
  'cancelled',
  'refunded',
]);
const allowedOrderStatuses = new Set([
  'new',
  'confirmed',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'failed',
]);
const customerCancellablePaymentStatuses = new Set([
  'pending',
  'waiting_for_customer',
]);

function text(value, max, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim() : fallback;
  if (normalized.length > max) {
    throw new Error('invalid-text');
  }
  return normalized;
}

function requiredText(value, max) {
  const normalized = text(value, max);
  if (!normalized) {
    throw new Error('missing-text');
  }
  return normalized;
}

function money(value) {
  return Number(Number(value).toFixed(2));
}

function availableQop(product) {
  const value = Number(product?.available_qop);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function productStockKey(product, fallback) {
  return String(product?.id || product?.slug || fallback);
}

function activityEntry({ type, title, message, actor = 'system', createdAt }) {
  return {
    type: text(type, 40),
    title: text(title, 120),
    message: text(message, 500),
    actor: text(actor, 40, 'system') || 'system',
    created_at: createdAt,
  };
}

function providerFor(method) {
  return method === 'click' || method === 'payme' || method === 'card'
    ? method
    : 'manual';
}

function paymentLabel(method) {
  return {
    manager: 'Menejer orqali',
    bank: 'Bank o‘tkazmasi',
    click: 'Click',
    payme: 'Payme',
    card: 'Karta',
    cash: 'Naqd / kelishuv',
  }[method] || 'Menejer orqali';
}

function paymentInstructions(method) {
  const supportPhone = '+998501551010';
  const managerText = `Menejerimiz ${supportPhone} orqali narx, mavjudlik va to‘lovni tasdiqlaydi.`;
  return {
    manager: managerText,
    bank: `Bank rekvizitlari menejer tomonidan yuboriladi. To‘lovdan oldin ${supportPhone} bilan tasdiqlang.`,
    click: `Click to‘lovi uchun hisob/link menejer tomonidan yuboriladi. To‘lovdan oldin ${supportPhone} bilan tasdiqlang.`,
    payme: `Payme to‘lovi uchun hisob/link menejer tomonidan yuboriladi. To‘lovdan oldin ${supportPhone} bilan tasdiqlang.`,
    card: `Karta raqami menejer tomonidan yuboriladi. To‘lovdan oldin ${supportPhone} bilan tasdiqlang.`,
    cash: `Naqd to‘lov yetkazib berish yoki olib ketish shartiga qarab ${supportPhone} bilan kelishiladi.`,
  }[method] || managerText;
}

function paymentReference(orderNumber) {
  return String(orderNumber || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function paymentExpiresAt(nowIso) {
  const createdAt = new Date(nowIso);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error('invalid-created-at');
  }
  return new Date(createdAt.getTime() + 48 * 60 * 60 * 1000).toISOString();
}

function orderNumberFromId(orderId, now = new Date()) {
  const year = now.getUTCFullYear();
  const cleaned = String(orderId || '')
    .replace(/^checkout_/i, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  const suffix = cleaned.slice(0, 8) || crypto.randomBytes(4).toString('hex').toUpperCase();
  return `MP-${year}-${suffix}`;
}

function normalizeClientOrderId(value) {
  const normalized = text(value, 80);
  if (!normalized) return '';
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(normalized)) {
    throw new Error('invalid-client-order-id');
  }
  return normalized;
}

function checkoutKey({ customerId, phone, clientOrderId }) {
  if (!clientOrderId) return '';
  const owner = customerId || String(phone || '').replace(/[^\d+]/g, '');
  if (!owner) return '';
  return crypto
    .createHash('sha256')
    .update(`${owner}:${clientOrderId}`)
    .digest('hex');
}

function normalizePaymentStatus(status) {
  const normalized = text(status, 30);
  if (!allowedPaymentStatuses.has(normalized)) {
    throw new Error('invalid-payment-status');
  }
  return normalized;
}

function normalizeOrderStatus(status) {
  const normalized = text(status, 30);
  if (!allowedOrderStatuses.has(normalized)) {
    throw new Error('invalid-order-status');
  }
  return normalized;
}

function normalizeOrderTracking(data = {}) {
  return {
    carrier: text(data.carrier, 80),
    trackingNumber: text(data.tracking_number, 120),
    trackingUrl: text(data.tracking_url, 300),
    note: text(data.note, 500),
  };
}

function normalizeCancelOrderRequest(data = {}) {
  return {
    orderId: requiredText(data.order_id, 120),
    reason: text(data.reason, 500),
  };
}

function canCustomerCancelOrder(order = {}) {
  const payment = order.payment && typeof order.payment === 'object'
    ? order.payment
    : {};
  return (
    order.status === 'new' &&
    customerCancellablePaymentStatuses.has(payment.status || 'pending')
  );
}

function defaultSizes(gender, category) {
  if (gender === 'men') return ['46', '48', '50', '52', '54', '56'];
  if (gender === 'kids' || category === 'pajamas') {
    return ['28', '30', '32', '34', '36', '38'];
  }
  return ['44', '46', '48', '50', '52', '54'];
}

function sizeMix(product) {
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  const seen = new Set();
  return [...sizes, ...defaultSizes(product.gender, product.category)]
    .map((size) => String(size))
    .filter((size) => size && !seen.has(size) && seen.add(size))
    .slice(0, sizeCount)
    .map((size) => ({ size, qty: qtyPerSize }));
}

function normalizeRequest(data) {
  const customer = data && typeof data.customer === 'object' ? data.customer : {};
  const paymentMethod = text(data?.payment_method, 30, 'manager') || 'manager';
  if (!allowedPaymentMethods.has(paymentMethod)) {
    throw new Error('invalid-payment-method');
  }
  if (!Array.isArray(data?.items) || data.items.length === 0 || data.items.length > 50) {
    throw new Error('invalid-items');
  }
  return {
    customer: {
      name: requiredText(customer.name, 80),
      phone: requiredText(customer.phone, 25),
      email: text(customer.email, 120),
      city: text(customer.city, 80),
      address: text(customer.address, 200),
      comment: text(customer.comment, 1000),
    },
    paymentMethod,
    clientOrderId: normalizeClientOrderId(data?.client_order_id),
    lang: text(data.lang, 5, 'uz') || 'uz',
    items: data.items.map((item) => {
      const qty = Number(item.qty);
      const slug = text(item.slug, 200);
      const productId = text(item.product_id, 80);
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
        throw new Error('invalid-qty');
      }
      if (!slug && !productId) {
        throw new Error('missing-product');
      }
      return { slug, productId, qty };
    }),
  };
}

function buildOrderPayload({ orderId, orderNumber, request, products, customerId, checkoutKey, nowIso }) {
  const qopDemand = new Map();
  const items = request.items.map((item, index) => {
    const product = products[index];
    if (!product || product.active === false || product.price <= 0) {
      throw new Error('inactive-product');
    }
    const stock = availableQop(product);
    if (stock !== null) {
      const stockKey = productStockKey(product, index);
      const requested = (qopDemand.get(stockKey) || 0) + item.qty;
      if (requested > stock) {
        throw new Error('insufficient-stock');
      }
      qopDemand.set(stockKey, requested);
    }
    const unitPrice = money(product.price);
    const bagPrice = money(unitPrice * bagSize);
    const lineTotal = money(bagPrice * item.qty);
    return {
      id: String(product.id || item.productId || product.slug || item.slug),
      slug: String(product.slug || item.slug),
      name: String(product.name || product.model_no || 'Milana'),
      model_no: String(product.model_no || ''),
      variant: String(product.variant || ''),
      gender: String(product.gender || 'women'),
      category: String(product.category || 'homewear'),
      fabric: String(product.fabric || product.fabric_uz || product.fabric_en || ''),
      description: String(product.description || product.desc_uz || product.desc_en || product.desc || ''),
      qty: item.qty,
      unit_price: unitPrice,
      bag_size: bagSize,
      price: bagPrice,
      line_total: lineTotal,
      image: Array.isArray(product.images) && product.images.length > 0 ? String(product.images[0]) : '',
      images: Array.isArray(product.images) ? product.images.map((image) => String(image)).slice(0, 2) : [],
      sizes: Array.isArray(product.sizes) ? product.sizes.map((size) => String(size)).slice(0, sizeCount) : [],
      size_mix: sizeMix(product),
    };
  });
  const total = money(items.reduce((sum, item) => sum + item.line_total, 0));
  const reference = paymentReference(orderNumber);
  const expiresAt = paymentExpiresAt(nowIso);
  const payment = {
    order_id: orderId,
    order_number: orderNumber,
    customer_id: customerId,
    reference,
    method: request.paymentMethod,
    provider: providerFor(request.paymentMethod),
    label: paymentLabel(request.paymentMethod),
    status: 'pending',
    amount: total,
    currency: 'USD',
    instructions: paymentInstructions(request.paymentMethod),
    support_phone: '+998501551010',
    expires_at: expiresAt,
    created_at: nowIso,
    updated_at: nowIso,
  };
  const order = {
    number: orderNumber,
    customer_id: customerId,
    client_order_id: request.clientOrderId,
    checkout_key: checkoutKey,
    customer: request.customer,
    items,
    total,
    status: 'new',
    lang: request.lang,
    payment: {
      method: payment.method,
      provider: payment.provider,
      label: payment.label,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      instructions: payment.instructions,
      support_phone: payment.support_phone,
      reference: payment.reference,
      expires_at: payment.expires_at,
    },
    activity: [
      activityEntry({
        type: 'order_created',
        title: 'Buyurtma yaratildi',
        message: 'Buyurtma qabul qilindi va menejer tasdig‘ini kutmoqda.',
        actor: customerId ? 'customer' : 'guest',
        createdAt: nowIso,
      }),
    ],
    created_at: nowIso,
    updated_at: nowIso,
  };
  return {
    order,
    payment,
    receipt: {
      order_id: orderId,
      number: orderNumber,
      total,
      client_order_id: request.clientOrderId,
      payment_status: 'pending',
      payment_method: payment.method,
      payment_provider: payment.provider,
      payment_label: payment.label,
      payment_instructions: payment.instructions,
      payment_reference: payment.reference,
      payment_expires_at: payment.expires_at,
      support_phone: payment.support_phone,
    },
  };
}

module.exports = {
  bagSize,
  qtyPerSize,
  allowedOrderStatuses,
  allowedPaymentStatuses,
  normalizeRequest,
  normalizePaymentStatus,
  normalizeOrderStatus,
  normalizeOrderTracking,
  normalizeCancelOrderRequest,
  canCustomerCancelOrder,
  activityEntry,
  buildOrderPayload,
  checkoutKey,
  providerFor,
  normalizeClientOrderId,
  orderNumberFromId,
  paymentInstructions,
  paymentLabel,
  paymentExpiresAt,
  paymentReference,
  sizeMix,
};
