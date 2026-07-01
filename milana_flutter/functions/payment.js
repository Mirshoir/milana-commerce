'use strict';

const crypto = require('node:crypto');

const allowedSubmissionMethods = new Set([
  'manager',
  'bank',
  'click',
  'payme',
  'card',
  'cash',
]);
const allowedWebhookProviders = new Set([
  'click',
  'payme',
  'card',
  'bank',
  'erp',
  'manual',
]);
const webhookStatusAliases = {
  authorized: 'submitted',
  processing: 'submitted',
  completed: 'paid',
  complete: 'paid',
  success: 'paid',
  succeeded: 'paid',
  paid: 'paid',
  failed: 'failed',
  fail: 'failed',
  declined: 'failed',
  rejected: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  refunded: 'refunded',
};

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
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    throw new Error('invalid-amount');
  }
  return Number(amount.toFixed(2));
}

function normalizePaymentSubmission(data = {}) {
  const method = text(data.method, 30, 'manager') || 'manager';
  if (!allowedSubmissionMethods.has(method)) {
    throw new Error('invalid-payment-method');
  }
  const amount = data.amount === undefined || data.amount === null || data.amount === ''
    ? null
    : money(data.amount);
  return {
    orderId: requiredText(data.order_id, 120),
    method,
    amount,
    reference: text(data.reference, 120),
    note: text(data.note, 1000),
  };
}

function normalizeProvider(value) {
  const provider = text(value, 40).toLowerCase();
  if (!allowedWebhookProviders.has(provider)) {
    throw new Error('invalid-provider');
  }
  return provider;
}

function normalizeWebhookStatus(value) {
  const status = webhookStatusAliases[text(value, 40).toLowerCase()] || '';
  if (!status) {
    throw new Error('invalid-payment-status');
  }
  return status;
}

function normalizePaymentWebhook(data = {}) {
  const provider = normalizeProvider(data.provider);
  const eventId =
    text(data.event_id, 120) ||
    text(data.transaction_id, 120) ||
    text(data.provider_payment_id, 120);
  if (!eventId) {
    throw new Error('missing-event-id');
  }
  const orderId = text(data.order_id, 120);
  const reference = text(data.reference, 120);
  if (!orderId && !reference) {
    throw new Error('missing-order-reference');
  }
  const amount = data.amount === undefined || data.amount === null || data.amount === ''
    ? null
    : money(data.amount);
  return {
    provider,
    eventId,
    orderId,
    reference,
    status: normalizeWebhookStatus(data.status),
    amount,
    currency: text(data.currency, 10).toUpperCase(),
    providerPaymentId: text(data.provider_payment_id, 120) || eventId,
    paidAt: text(data.paid_at, 80),
    note: text(data.note, 500),
  };
}

function paymentWebhookEventKey(provider, eventId) {
  return crypto
    .createHash('sha256')
    .update(`${provider}:${eventId}`)
    .digest('hex');
}

function paymentWebhookSignature(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function verifyPaymentWebhookSignature({ rawBody, signature, secret }) {
  if (!secret) {
    throw new Error('missing-webhook-secret');
  }
  const received = text(signature, 200).replace(/^sha256=/i, '');
  if (!received || !/^[a-f0-9]{64}$/i.test(received)) {
    return false;
  }
  const expected = paymentWebhookSignature(rawBody, secret);
  return crypto.timingSafeEqual(
    Buffer.from(received, 'hex'),
    Buffer.from(expected, 'hex'),
  );
}

module.exports = {
  normalizePaymentSubmission,
  normalizePaymentWebhook,
  paymentWebhookEventKey,
  paymentWebhookSignature,
  verifyPaymentWebhookSignature,
};
