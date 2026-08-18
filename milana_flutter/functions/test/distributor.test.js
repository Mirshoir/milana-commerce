'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDistributorApplication,
  distributorApplicationKey,
  normalizeApplicationStatus,
  normalizeDistributorApplication,
} = require('../distributor');
const {
  customerNotification,
  deviceTokenId,
  normalizeDeviceRegistration,
  normalizeNotificationPreferences,
} = require('../notification');

const validApplication = Object.freeze({
  client_application_id: 'application_123456',
  contact_name: 'Aziza Karimova',
  company_name: 'Atlas Trade LLC',
  phone: '+998 90 123 45 67',
  email: 'SALES@EXAMPLE.COM',
  country: 'Uzbekistan',
  city: 'Tashkent',
  website: 'https://example.com',
  expected_monthly_volume: '5000_20000',
  sales_channels: 'Retail stores and marketplace',
  requested_territories: 'Tashkent and Samarkand',
  message: 'Interested in the new collection.',
  legal_accepted: true,
  lang: 'uz',
});

test('distributor application normalization validates and limits lead data', () => {
  const normalized = normalizeDistributorApplication(validApplication);
  assert.equal(normalized.email, 'sales@example.com');
  assert.equal(normalized.companyName, 'Atlas Trade LLC');
  assert.equal(normalized.lang, 'uz');

  assert.throws(
    () => normalizeDistributorApplication({ ...validApplication, email: 'bad' }),
    /invalid-email/,
  );
  assert.throws(
    () =>
      normalizeDistributorApplication({
        ...validApplication,
        legal_accepted: false,
      }),
    /legal-consent-required/,
  );
  assert.throws(
    () =>
      normalizeDistributorApplication({
        ...validApplication,
        website: 'javascript:alert(1)',
      }),
    /invalid-website/,
  );
});

test('distributor application ids are deterministic and owner-scoped', () => {
  const first = distributorApplicationKey({
    customerId: 'customer-a',
    phone: validApplication.phone,
    clientApplicationId: validApplication.client_application_id,
  });
  const retry = distributorApplicationKey({
    customerId: 'customer-a',
    phone: validApplication.phone,
    clientApplicationId: validApplication.client_application_id,
  });
  const otherOwner = distributorApplicationKey({
    customerId: 'customer-b',
    phone: validApplication.phone,
    clientApplicationId: validApplication.client_application_id,
  });
  assert.equal(first, retry);
  assert.equal(first.length, 64);
  assert.notEqual(first, otherOwner);
});

test('application payload starts in submitted status without manager data', () => {
  const request = normalizeDistributorApplication(validApplication);
  const payload = buildDistributorApplication({
    request,
    customerId: 'customer-a',
    applicationNumber: 'MD-2026-ABC123',
    nowIso: '2026-08-08T10:00:00.000Z',
  });
  assert.equal(payload.status, 'submitted');
  assert.equal(payload.customer_id, 'customer-a');
  assert.equal(payload.assigned_manager_id, null);
  assert.equal(payload.legal_accepted_at, '2026-08-08T10:00:00.000Z');
  assert.equal(normalizeApplicationStatus('approved'), 'approved');
  assert.throws(() => normalizeApplicationStatus('admin_override'));
});

test('notification preferences are explicit and default safely', () => {
  assert.deepEqual(normalizeNotificationPreferences({}), {
    order_updates: true,
    application_updates: true,
    new_collections: true,
    restocks: true,
    distributor_offers: true,
    company_news: false,
  });
  assert.equal(
    normalizeNotificationPreferences({ company_news: true }).company_news,
    true,
  );
});

test('device registration and notification payloads are normalized', () => {
  const token = 'a'.repeat(64);
  const registration = normalizeDeviceRegistration({
    token,
    platform: 'android',
    lang: 'ru',
  });
  assert.equal(registration.platform, 'android');
  assert.equal(deviceTokenId(token).length, 64);
  assert.throws(() => normalizeDeviceRegistration({ token, platform: 'desktop' }));

  const notification = customerNotification({
    customerId: 'customer-a',
    type: 'application_status',
    title: 'Application updated',
    message: 'Your application is under review.',
    entityId: 'application-1',
    action: 'partnership',
    nowIso: '2026-08-08T10:00:00.000Z',
  });
  assert.equal(notification.customer_id, 'customer-a');
  assert.equal(notification.read, false);
  assert.equal(notification.action, 'partnership');
});
