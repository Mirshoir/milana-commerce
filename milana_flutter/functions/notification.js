'use strict';

const crypto = require('node:crypto');

function text(value, max, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim() : fallback;
  if (normalized.length > max) throw new Error('invalid-text');
  return normalized;
}

function normalizeNotificationPreferences(data = {}) {
  const bool = (key, fallback) =>
    typeof data[key] === 'boolean' ? data[key] : fallback;
  return {
    order_updates: bool('order_updates', true),
    application_updates: bool('application_updates', true),
    new_collections: bool('new_collections', true),
    restocks: bool('restocks', true),
    distributor_offers: bool('distributor_offers', true),
    company_news: bool('company_news', false),
  };
}

function normalizeDeviceRegistration(data = {}) {
  const token = text(data.token, 4096);
  if (token.length < 20) throw new Error('invalid-device-token');
  const platform = text(data.platform, 20);
  if (!new Set(['android', 'ios', 'web', 'unknown']).has(platform)) {
    throw new Error('invalid-platform');
  }
  return {
    token,
    platform,
    lang: text(data.lang, 5, 'ru') || 'ru',
  };
}

function deviceTokenId(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function customerNotification({
  customerId,
  type,
  title,
  message,
  entityId = '',
  action = '',
  nowIso,
}) {
  return {
    customer_id: customerId,
    type: text(type, 60, 'general') || 'general',
    title: text(title, 160),
    message: text(message, 1000),
    entity_id: text(entityId, 160),
    action: text(action, 120),
    read: false,
    created_at: nowIso,
    read_at: null,
  };
}

module.exports = {
  customerNotification,
  deviceTokenId,
  normalizeDeviceRegistration,
  normalizeNotificationPreferences,
};
