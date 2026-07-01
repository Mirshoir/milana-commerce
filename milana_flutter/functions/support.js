'use strict';

const allowedTopics = new Set([
  'general',
  'catalog',
  'price',
  'delivery',
  'payment',
  'defect',
]);
const allowedSupportStatuses = new Set([
  'new',
  'open',
  'waiting_for_customer',
  'resolved',
  'closed',
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

function normalizeSupportRequest(data) {
  const topic = text(data?.topic, 40, 'general') || 'general';
  if (!allowedTopics.has(topic)) {
    throw new Error('invalid-topic');
  }
  return {
    name: requiredText(data?.name, 80),
    phone: requiredText(data?.phone, 25),
    email: text(data?.email, 120),
    topic,
    message: requiredText(data?.message, 3000),
    lang: text(data?.lang, 5, 'uz') || 'uz',
  };
}

function normalizeSupportStatus(status) {
  const normalized = text(status, 40);
  if (!allowedSupportStatuses.has(normalized)) {
    throw new Error('invalid-support-status');
  }
  return normalized;
}

function normalizeSupportUpdate(data = {}) {
  return {
    status: normalizeSupportStatus(data.status),
    reply: text(data.reply, 3000),
    internalNote: text(data.internal_note, 1000),
  };
}

function buildSupportPayload({ ticketId, ticketNumber, request, customerId, nowIso }) {
  return {
    ticket: {
      number: ticketNumber,
      customer_id: customerId,
      name: request.name,
      phone: request.phone,
      email: request.email,
      topic: request.topic,
      message: request.message,
      status: 'new',
      lang: request.lang,
      created_at: nowIso,
      updated_at: nowIso,
    },
    receipt: {
      ticket_id: ticketId,
      number: ticketNumber,
      status: 'new',
    },
  };
}

module.exports = {
  allowedSupportStatuses,
  normalizeSupportRequest,
  normalizeSupportStatus,
  normalizeSupportUpdate,
  buildSupportPayload,
};
