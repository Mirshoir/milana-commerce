'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  bagSize,
  buildOrderPayload,
  canCustomerCancelOrder,
  checkoutKey,
  normalizeCancelOrderRequest,
  normalizeClientOrderId,
  normalizeOrderStatus,
  normalizeOrderTracking,
  normalizeRequest,
  normalizePaymentStatus,
  orderNumberFromId,
  paymentExpiresAt,
  paymentInstructions,
  paymentLabel,
  paymentReference,
  providerFor,
  qtyPerSize,
} = require('../checkout');
const {
  buildSupportPayload,
  normalizeSupportRequest,
  normalizeSupportStatus,
  normalizeSupportUpdate,
} = require('../support');
const { normalizeProductUpdate } = require('../product');
const {
  normalizePaymentSubmission,
  normalizePaymentWebhook,
  paymentWebhookEventKey,
  paymentWebhookSignature,
  verifyPaymentWebhookSignature,
} = require('../payment');
const { normalizeAckRequest, normalizeClaimRequest } = require('../erp');

test('normalizes checkout and calculates one-qop total server-side', () => {
  const request = normalizeRequest({
    customer: {
      name: 'Ali',
      phone: '+998 90 123 45 67',
      city: 'Andijon',
    },
    payment_method: 'payme',
    client_order_id: 'co_2026_checkout',
    items: [{ product_id: '5287', slug: 'catalog-item', qty: 2 }],
    lang: 'uz',
  });
  const payload = buildOrderPayload({
    orderId: 'order-1',
    orderNumber: 'MP-2026-ABCD',
    customerId: 'customer-1',
    checkoutKey: 'checkout-key-1',
    nowIso: '2026-06-27T00:00:00.000Z',
    request,
    products: [
      {
        id: '5287',
        slug: 'catalog-item',
        name: 'Milana Model',
        gender: 'women',
        category: 'homewear',
        price: 4.5,
        fabric: 'Suprem',
        description: 'Milana order snapshot',
        available_qop: 3,
        sizes: ['44', '46', '48', '50', '52', '54'],
        images: ['/uploads/model.jpg'],
        active: true,
      },
    ],
  });

  assert.equal(bagSize, 60);
  assert.equal(qtyPerSize, 10);
  assert.equal(payload.order.items[0].unit_price, 4.5);
  assert.equal(payload.order.items[0].gender, 'women');
  assert.equal(payload.order.items[0].category, 'homewear');
  assert.equal(payload.order.items[0].fabric, 'Suprem');
  assert.equal(payload.order.items[0].description, 'Milana order snapshot');
  assert.deepEqual(payload.order.items[0].images, ['/uploads/model.jpg']);
  assert.deepEqual(payload.order.items[0].sizes, ['44', '46', '48', '50', '52', '54']);
  assert.equal(payload.order.client_order_id, 'co_2026_checkout');
  assert.equal(payload.order.checkout_key, 'checkout-key-1');
  assert.equal(payload.receipt.order_id, 'order-1');
  assert.equal(payload.receipt.client_order_id, 'co_2026_checkout');
  assert.equal(payload.order.items[0].price, 270);
  assert.equal(payload.order.items[0].line_total, 540);
  assert.equal(payload.order.total, 540);
  assert.equal(payload.payment.amount, 540);
  assert.equal(payload.order.activity.length, 1);
  assert.equal(payload.order.activity[0].type, 'order_created');
  assert.equal(payload.order.activity[0].actor, 'customer');
  assert.equal(payload.payment.provider, 'payme');
  assert.equal(payload.payment.label, 'Payme');
  assert.equal(payload.payment.reference, 'MP2026ABCD');
  assert.equal(payload.payment.expires_at, '2026-06-29T00:00:00.000Z');
  assert.match(payload.payment.instructions, /Payme/);
  assert.equal(payload.receipt.payment_method, 'payme');
  assert.equal(payload.receipt.payment_label, 'Payme');
  assert.equal(payload.receipt.payment_reference, 'MP2026ABCD');
  assert.equal(payload.receipt.payment_expires_at, '2026-06-29T00:00:00.000Z');
  assert.match(payload.receipt.payment_instructions, /Payme/);
  assert.deepEqual(payload.order.items[0].size_mix, [
    { size: '44', qty: 10 },
    { size: '46', qty: 10 },
    { size: '48', qty: 10 },
    { size: '50', qty: 10 },
    { size: '52', qty: 10 },
    { size: '54', qty: 10 },
  ]);
});

test('rejects checkout qop quantities above available stock', () => {
  const request = normalizeRequest({
    customer: { name: 'Ali', phone: '+998 90 123 45 67' },
    payment_method: 'manager',
    items: [{ slug: 'catalog-item', qty: 2 }],
  });

  assert.throws(
    () =>
      buildOrderPayload({
        orderId: 'order-1',
        orderNumber: 'MP-2026-ABCD',
        customerId: 'customer-1',
        checkoutKey: 'checkout-key-1',
        nowIso: '2026-06-27T00:00:00.000Z',
        request,
        products: [
          {
            id: '5287',
            slug: 'catalog-item',
            name: 'Milana Model',
            gender: 'women',
            category: 'homewear',
            price: 4.5,
            available_qop: 1,
            active: true,
          },
        ],
      }),
    /insufficient-stock/,
  );
});

test('builds stable payment references and expiry windows', () => {
  assert.equal(paymentReference('MP-2026-abcd'), 'MP2026ABCD');
  assert.equal(paymentReference(''), '');
  assert.equal(
    paymentExpiresAt('2026-06-27T12:30:00.000Z'),
    '2026-06-29T12:30:00.000Z',
  );
  assert.throws(() => paymentExpiresAt('not-a-date'), /invalid-created-at/);
});

test('builds payment-safe order numbers from deterministic checkout ids', () => {
  const date = new Date('2026-06-27T00:00:00.000Z');
  assert.equal(orderNumberFromId('checkout_abcdef123456', date), 'MP-2026-ABCDEF12');
  assert.equal(orderNumberFromId('randomDoc7890', date), 'MP-2026-RANDOMDO');
  assert.notEqual(
    paymentReference(orderNumberFromId('checkout_abcdef123456', date)),
    paymentReference(orderNumberFromId('checkout_123456abcdef', date)),
  );
});

test('normalizes client order ids and builds private checkout keys', () => {
  assert.equal(normalizeClientOrderId('co_2026_checkout'), 'co_2026_checkout');
  assert.equal(normalizeClientOrderId(''), '');
  assert.throws(() => normalizeClientOrderId('short'), /invalid-client-order-id/);
  assert.throws(
    () => normalizeClientOrderId('bad space checkout'),
    /invalid-client-order-id/,
  );
  assert.equal(
    checkoutKey({
      customerId: 'customer-1',
      phone: '+998 90 123 45 67',
      clientOrderId: 'co_2026_checkout',
    }).length,
    64,
  );
  assert.equal(
    checkoutKey({
      customerId: '',
      phone: '+998 90 123 45 67',
      clientOrderId: 'co_2026_checkout',
    }),
    checkoutKey({
      customerId: '',
      phone: '+998901234567',
      clientOrderId: 'co_2026_checkout',
    }),
  );
  assert.equal(
    checkoutKey({ customerId: 'customer-1', phone: '+998', clientOrderId: '' }),
    '',
  );
});

test('manual payment methods use manual provider', () => {
  assert.equal(providerFor('manager'), 'manual');
  assert.equal(providerFor('bank'), 'manual');
  assert.equal(providerFor('cash'), 'manual');
  assert.equal(paymentLabel('bank'), 'Bank o‘tkazmasi');
  assert.match(paymentInstructions('cash'), /\+998501551010/);
});

test('validates payment status updates', () => {
  assert.equal(normalizePaymentStatus('paid'), 'paid');
  assert.equal(normalizePaymentStatus('waiting_for_customer'), 'waiting_for_customer');
  assert.throws(() => normalizePaymentStatus('done'), /invalid-payment-status/);
});

test('normalizes customer payment submissions', () => {
  assert.deepEqual(
    normalizePaymentSubmission({
      order_id: 'order-1',
      method: 'bank',
      amount: 540.126,
      reference: 'TRX-123',
      note: 'Paid by bank transfer.',
    }),
    {
      orderId: 'order-1',
      method: 'bank',
      amount: 540.13,
      reference: 'TRX-123',
      note: 'Paid by bank transfer.',
    },
  );
  assert.throws(() => normalizePaymentSubmission({ method: 'bank' }), /missing-text/);
  assert.throws(
    () => normalizePaymentSubmission({ order_id: 'order-1', amount: -1 }),
    /invalid-amount/,
  );
  assert.throws(
    () => normalizePaymentSubmission({ order_id: 'order-1', method: 'crypto' }),
    /invalid-payment-method/,
  );
});

test('normalizes signed payment webhooks for provider callbacks', () => {
  const webhook = normalizePaymentWebhook({
    provider: 'Payme',
    event_id: 'evt-123',
    reference: 'MP2026ABCD',
    status: 'success',
    amount: 540,
    currency: 'usd',
    provider_payment_id: 'payme-456',
    note: 'Provider confirmed.',
  });

  assert.equal(webhook.provider, 'payme');
  assert.equal(webhook.eventId, 'evt-123');
  assert.equal(webhook.reference, 'MP2026ABCD');
  assert.equal(webhook.status, 'paid');
  assert.equal(webhook.currency, 'USD');
  assert.equal(webhook.providerPaymentId, 'payme-456');
  assert.equal(paymentWebhookEventKey('payme', 'evt-123').length, 64);

  const rawBody = Buffer.from(JSON.stringify({ event_id: 'evt-123' }));
  const signature = paymentWebhookSignature(rawBody, 'secret-123');
  assert.equal(
    verifyPaymentWebhookSignature({
      rawBody,
      signature: `sha256=${signature}`,
      secret: 'secret-123',
    }),
    true,
  );
  assert.equal(
    verifyPaymentWebhookSignature({
      rawBody,
      signature,
      secret: 'wrong-secret',
    }),
    false,
  );
  assert.throws(
    () => normalizePaymentWebhook({ provider: 'payme', status: 'paid' }),
    /missing-event-id/,
  );
});

test('validates order status updates and tracking metadata', () => {
  assert.equal(normalizeOrderStatus('packed'), 'packed');
  assert.equal(normalizeOrderStatus('shipped'), 'shipped');
  assert.equal(normalizeOrderStatus('delivered'), 'delivered');
  assert.throws(() => normalizeOrderStatus('sent'), /invalid-order-status/);
  assert.deepEqual(
    normalizeOrderTracking({
      carrier: 'Cargo',
      tracking_number: 'CRG-123',
      tracking_url: 'https://cargo.example/CRG-123',
      note: 'Call before delivery',
    }),
    {
      carrier: 'Cargo',
      trackingNumber: 'CRG-123',
      trackingUrl: 'https://cargo.example/CRG-123',
      note: 'Call before delivery',
    },
  );
  assert.throws(
    () => normalizeOrderTracking({ tracking_url: 'x'.repeat(301) }),
    /invalid-text/,
  );
});

test('validates customer order cancellation requests and allowed states', () => {
  assert.deepEqual(
    normalizeCancelOrderRequest({
      order_id: 'order-1',
      reason: 'Wrong model selected.',
    }),
    {
      orderId: 'order-1',
      reason: 'Wrong model selected.',
    },
  );
  assert.throws(() => normalizeCancelOrderRequest({ reason: 'No id' }), /missing-text/);
  assert.throws(
    () =>
      normalizeCancelOrderRequest({
        order_id: 'order-1',
        reason: 'x'.repeat(501),
      }),
    /invalid-text/,
  );

  assert.equal(
    canCustomerCancelOrder({
      status: 'new',
      payment: { status: 'pending' },
    }),
    true,
  );
  assert.equal(
    canCustomerCancelOrder({
      status: 'new',
      payment: { status: 'waiting_for_customer' },
    }),
    true,
  );
  assert.equal(
    canCustomerCancelOrder({
      status: 'new',
      payment: { status: 'submitted' },
    }),
    false,
  );
  assert.equal(
    canCustomerCancelOrder({
      status: 'confirmed',
      payment: { status: 'pending' },
    }),
    false,
  );
});

test('rejects client supplied invalid quantities and payment methods', () => {
  assert.throws(
    () =>
      normalizeRequest({
        customer: { name: 'Ali', phone: '+998901234567' },
        payment_method: 'unknown',
        items: [{ slug: 'x', qty: 1 }],
      }),
    /invalid-payment-method/,
  );
  assert.throws(
    () =>
      normalizeRequest({
        customer: { name: 'Ali', phone: '+998901234567' },
        payment_method: 'manager',
        items: [{ slug: 'x', qty: 0 }],
      }),
    /invalid-qty/,
  );
});

test('normalizes and builds support request payload', () => {
  const request = normalizeSupportRequest({
    name: 'Ali',
    phone: '+998 90 123 45 67',
    email: 'ali@example.test',
    topic: 'delivery',
    message: 'Cargo delivery status kerak.',
    lang: 'uz',
  });
  const payload = buildSupportPayload({
    ticketId: 'support-1',
    ticketNumber: 'MS-2026-ABCD',
    customerId: 'customer-1',
    nowIso: '2026-06-27T00:00:00.000Z',
    request,
  });

  assert.equal(payload.receipt.ticket_id, 'support-1');
  assert.equal(payload.receipt.number, 'MS-2026-ABCD');
  assert.equal(payload.ticket.customer_id, 'customer-1');
  assert.equal(payload.ticket.topic, 'delivery');
  assert.equal(payload.ticket.status, 'new');
});

test('validates support status updates and manager replies', () => {
  assert.equal(normalizeSupportStatus('open'), 'open');
  assert.equal(normalizeSupportStatus('waiting_for_customer'), 'waiting_for_customer');
  assert.equal(normalizeSupportStatus('resolved'), 'resolved');
  assert.throws(() => normalizeSupportStatus('done'), /invalid-support-status/);
  assert.deepEqual(
    normalizeSupportUpdate({
      status: 'resolved',
      reply: 'Brak bo‘yicha menejer siz bilan bog‘lanadi.',
      internal_note: 'Escalated to production manager.',
    }),
    {
      status: 'resolved',
      reply: 'Brak bo‘yicha menejer siz bilan bog‘lanadi.',
      internalNote: 'Escalated to production manager.',
    },
  );
  assert.throws(
    () => normalizeSupportUpdate({ status: 'open', reply: 'x'.repeat(3001) }),
    /invalid-text/,
  );
});

test('validates product availability updates', () => {
  assert.deepEqual(
    normalizeProductUpdate({
      slug: 'f-2219',
      active: true,
      price: 4.567,
      available_qop: 12,
      sizes: ['44', '46', '46', '48'],
    }),
    {
      slug: 'f-2219',
      productId: '',
      update: {
        active: true,
        price: 4.57,
        available_qop: 12,
        sizes: ['44', '46', '48'],
      },
    },
  );
  assert.throws(() => normalizeProductUpdate({ active: true }), /missing-product/);
  assert.throws(
    () => normalizeProductUpdate({ slug: 'f-2219', price: -1 }),
    /invalid-price/,
  );
  assert.throws(
    () => normalizeProductUpdate({ slug: 'f-2219', available_qop: 1.5 }),
    /invalid-available-qop/,
  );
});

test('normalizes ERP event claim and acknowledgement requests', () => {
  assert.deepEqual(
    normalizeClaimRequest({
      limit: 10,
      lease_seconds: 120,
      worker: 'milana-erp',
    }),
    {
      limit: 10,
      leaseSeconds: 120,
      worker: 'milana-erp',
    },
  );
  assert.deepEqual(
    normalizeAckRequest({
      event_id: 'event-1',
      status: 'processed',
      worker: 'milana-erp',
      external_id: 'ERP-42',
    }),
    {
      eventId: 'event-1',
      status: 'processed',
      worker: 'milana-erp',
      externalId: 'ERP-42',
      error: '',
    },
  );
  assert.throws(() => normalizeClaimRequest({ limit: 0 }), /invalid-limit/);
  assert.throws(
    () => normalizeClaimRequest({ lease_seconds: 5 }),
    /invalid-lease-seconds/,
  );
  assert.throws(() => normalizeAckRequest({ status: 'processed' }), /missing-event-id/);
  assert.throws(
    () => normalizeAckRequest({ event_id: 'event-1', status: 'done' }),
    /invalid-ack-status/,
  );
});

test('rejects invalid support request topics and empty messages', () => {
  assert.throws(
    () =>
      normalizeSupportRequest({
        name: 'Ali',
        phone: '+998901234567',
        topic: 'not-real',
        message: 'Hello support',
      }),
    /invalid-topic/,
  );
  assert.throws(
    () =>
      normalizeSupportRequest({
        name: 'Ali',
        phone: '+998901234567',
        topic: 'general',
        message: '',
      }),
    /missing-text/,
  );
});
