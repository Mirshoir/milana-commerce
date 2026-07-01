'use strict';

const allowedAckStatuses = new Set(['processed', 'failed']);

function text(value, max, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim() : fallback;
  if (normalized.length > max) {
    throw new Error('invalid-text');
  }
  return normalized;
}

function normalizeLimit(value) {
  const limit = Number(value ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('invalid-limit');
  }
  return limit;
}

function normalizeLeaseSeconds(value) {
  const seconds = Number(value ?? 300);
  if (!Number.isInteger(seconds) || seconds < 30 || seconds > 3600) {
    throw new Error('invalid-lease-seconds');
  }
  return seconds;
}

function normalizeClaimRequest(data = {}) {
  return {
    limit: normalizeLimit(data.limit),
    leaseSeconds: normalizeLeaseSeconds(data.lease_seconds),
    worker: text(data.worker, 80, 'erp-bridge') || 'erp-bridge',
  };
}

function normalizeAckRequest(data = {}) {
  const eventId = text(data.event_id, 120);
  const status = text(data.status, 30);
  if (!eventId) {
    throw new Error('missing-event-id');
  }
  if (!allowedAckStatuses.has(status)) {
    throw new Error('invalid-ack-status');
  }
  return {
    eventId,
    status,
    worker: text(data.worker, 80, 'erp-bridge') || 'erp-bridge',
    externalId: text(data.external_id, 160),
    error: text(data.error, 1000),
  };
}

module.exports = {
  normalizeAckRequest,
  normalizeClaimRequest,
};
