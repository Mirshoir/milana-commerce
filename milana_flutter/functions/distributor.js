'use strict';

const crypto = require('node:crypto');

const allowedApplicationStatuses = new Set([
  'submitted',
  'under_review',
  'information_requested',
  'approved',
  'rejected',
  'suspended',
]);

function text(value, max, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim() : fallback;
  if (normalized.length > max) throw new Error('invalid-text');
  return normalized;
}

function requiredText(value, max) {
  const normalized = text(value, max);
  if (!normalized) throw new Error('missing-text');
  return normalized;
}

function normalizeDistributorApplication(data = {}) {
  const clientApplicationId = requiredText(data.client_application_id, 100);
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(clientApplicationId)) {
    throw new Error('invalid-client-application-id');
  }
  if (data.legal_accepted !== true) throw new Error('legal-consent-required');
  const email = requiredText(data.email, 120).toLowerCase();
  if (!email.includes('@')) throw new Error('invalid-email');
  const website = text(data.website, 300);
  if (website && !/^https?:\/\//i.test(website)) throw new Error('invalid-website');
  return {
    clientApplicationId,
    contactName: requiredText(data.contact_name, 80),
    companyName: requiredText(data.company_name, 160),
    phone: requiredText(data.phone, 25),
    email,
    country: requiredText(data.country, 80),
    city: text(data.city, 80),
    website,
    expectedMonthlyVolume: requiredText(data.expected_monthly_volume, 40),
    salesChannels: requiredText(data.sales_channels, 500),
    requestedTerritories: requiredText(data.requested_territories, 500),
    message: text(data.message, 2000),
    lang: text(data.lang, 5, 'ru') || 'ru',
  };
}

function distributorApplicationKey({ customerId, phone, clientApplicationId }) {
  const owner = customerId || String(phone || '').replace(/[^\d+]/g, '');
  if (!owner) throw new Error('missing-owner');
  return crypto
    .createHash('sha256')
    .update(`${owner}:${clientApplicationId}`)
    .digest('hex');
}

function normalizeApplicationStatus(value) {
  const status = text(value, 40);
  if (!allowedApplicationStatuses.has(status)) {
    throw new Error('invalid-application-status');
  }
  return status;
}

function buildDistributorApplication({
  request,
  customerId,
  applicationNumber,
  nowIso,
}) {
  return {
    number: applicationNumber,
    customer_id: customerId,
    client_application_id: request.clientApplicationId,
    contact_name: request.contactName,
    company_name: request.companyName,
    phone: request.phone,
    email: request.email,
    country: request.country,
    city: request.city,
    website: request.website,
    expected_monthly_volume: request.expectedMonthlyVolume,
    sales_channels: request.salesChannels,
    requested_territories: request.requestedTerritories,
    message: request.message,
    lang: request.lang,
    source: 'flutter',
    status: 'submitted',
    assigned_manager_id: null,
    manager_message: '',
    legal_accepted_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

module.exports = {
  allowedApplicationStatuses,
  buildDistributorApplication,
  distributorApplicationKey,
  normalizeApplicationStatus,
  normalizeDistributorApplication,
};
