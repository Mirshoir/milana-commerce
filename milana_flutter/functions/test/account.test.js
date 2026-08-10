'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  accountDeletionFeedbackDocument,
  erpEventAnonymizationPatch,
  normalizeAccountDeletionRequest,
  orderAnonymizationPatch,
  paymentAnonymizationPatch,
  retainedActivityMessage,
  supportAnonymizationPatch,
} = require('../account');

const nowIso = '2026-08-04T08:00:00.000Z';
const deleteField = Symbol('delete-field');
const options = { deleteField, nowIso };
const validDeletionRequest = {
  confirmation: 'DELETE',
  reason_code: 'missing_features',
  reason_detail: '  Better stock filters would help.  ',
  locale: 'en',
};

test('requires the exact DELETE account-deletion confirmation', () => {
  assert.deepEqual(normalizeAccountDeletionRequest(validDeletionRequest), {
    confirmation: 'DELETE',
    reasonCode: 'missing_features',
    reasonDetail: 'Better stock filters would help.',
    locale: 'en',
  });
  for (const confirmation of ['delete', ' DELETE', 'DELETE ', '', null, 42]) {
    assert.throws(
      () =>
        normalizeAccountDeletionRequest({
          ...validDeletionRequest,
          confirmation,
        }),
      /invalid-deletion-confirmation/,
    );
  }
  assert.throws(
    () => normalizeAccountDeletionRequest(null),
    /invalid-deletion-confirmation/,
  );
});

test('requires a structured deletion reason and useful other feedback', () => {
  for (const reason_code of ['', 'unknown', null, 42]) {
    assert.throws(
      () =>
        normalizeAccountDeletionRequest({
          ...validDeletionRequest,
          reason_code,
        }),
      /invalid-deletion-reason/,
    );
  }
  assert.throws(
    () =>
      normalizeAccountDeletionRequest({
        ...validDeletionRequest,
        reason_code: 'other',
        reason_detail: ' ',
      }),
    /invalid-deletion-reason-detail/,
  );
  assert.equal(
    normalizeAccountDeletionRequest({
      ...validDeletionRequest,
      reason_code: 'prefer_not_to_say',
      reason_detail: '',
    }).reasonCode,
    'prefer_not_to_say',
  );
});

test('builds anonymous deletion feedback without a customer identifier', () => {
  const normalized = normalizeAccountDeletionRequest(validDeletionRequest);
  const feedback = accountDeletionFeedbackDocument(normalized, { nowIso });
  assert.deepEqual(feedback, {
    reason_code: 'missing_features',
    reason_detail: 'Better stock filters would help.',
    locale: 'en',
    source: 'customer_self_service',
    schema_version: 1,
    created_at: nowIso,
  });
  assert.equal(Object.hasOwn(feedback, 'customer_id'), false);
});

test('anonymizes order identity and free text while retaining transaction data', () => {
  const patch = orderAnonymizationPatch(
    {
      activity: [
        {
          type: 'order_cancelled',
          title: 'Cancelled',
          message: 'Call private phone +998 90 123 45 67',
          actor: 'customer',
          created_at: '2026-08-01T08:00:00.000Z',
          private_extension: 'must not survive',
        },
      ],
      cancellation: { reason: 'Private free text' },
      delivery: {
        carrier: 'DHL',
        tracking_number: 'PERSONAL-SHIPMENT-ID',
        tracking_url: 'https://carrier.test/PERSONAL-SHIPMENT-ID',
        note: 'Deliver to private address',
      },
      payment: {
        submission: {
          customer_id: 'customer-1',
          reference: 'TRANSACTION-123',
          note: 'Private payment note',
        },
      },
      items: [{ slug: 'model-1', qty: 2 }],
      total: 540,
    },
    options,
  );

  assert.equal(patch.customer_id, null);
  assert.equal(patch.customer, deleteField);
  assert.equal(patch.client_order_id, deleteField);
  assert.equal(patch.checkout_key, deleteField);
  assert.equal(patch['payment.submission.customer_id'], deleteField);
  assert.equal(patch['payment.submission.note'], deleteField);
  assert.equal(patch['cancellation.reason'], deleteField);
  assert.equal(patch['delivery.tracking_number'], deleteField);
  assert.equal(patch['delivery.tracking_url'], deleteField);
  assert.equal(patch['delivery.note'], deleteField);
  assert.deepEqual(patch.activity, [
    {
      type: 'order_cancelled',
      title: 'Cancelled',
      message: retainedActivityMessage,
      actor: 'deleted_customer',
      created_at: '2026-08-01T08:00:00.000Z',
    },
  ]);
  assert.equal(patch.account_deleted_at, nowIso);
  assert.equal(patch.updated_at, nowIso);
  assert.equal(Object.hasOwn(patch, 'items'), false);
  assert.equal(Object.hasOwn(patch, 'total'), false);
  assert.equal(JSON.stringify(patch).includes('+998'), false);
  assert.equal(JSON.stringify(patch).includes('Private'), false);
});

test('does not create nested deletion paths for absent order maps', () => {
  const patch = orderAnonymizationPatch({}, options);
  assert.equal(Object.hasOwn(patch, 'payment.submission.note'), false);
  assert.equal(Object.hasOwn(patch, 'cancellation.reason'), false);
  assert.equal(Object.hasOwn(patch, 'delivery.note'), false);
});

test('removes support-request PII without replacing operational fields', () => {
  const patch = supportAnonymizationPatch(
    {
      topic: 'delivery',
      status: 'resolved',
      name: 'Ali',
      phone: '+998 90 123 45 67',
      email: 'ali@example.test',
      message: 'Private address',
    },
    options,
  );

  for (const field of [
    'name',
    'phone',
    'email',
    'message',
    'reply',
    'internal_note',
  ]) {
    assert.equal(patch[field], deleteField);
  }
  assert.equal(patch.customer_id, null);
  assert.equal(Object.hasOwn(patch, 'topic'), false);
  assert.equal(Object.hasOwn(patch, 'status'), false);
});

test('removes payment identity while retaining the financial transaction', () => {
  const patch = paymentAnonymizationPatch(
    {
      amount: 540,
      currency: 'USD',
      reference: 'MP2026ABCD',
      provider_payment_id: 'provider-1',
      customer_submission: {
        customer_id: 'customer-1',
        note: 'Private note',
      },
      cancellation: { reason: 'Private reason' },
    },
    options,
  );

  assert.equal(patch.customer_id, null);
  assert.equal(patch['customer_submission.customer_id'], deleteField);
  assert.equal(patch['customer_submission.note'], deleteField);
  assert.equal(patch.admin_note, deleteField);
  assert.equal(patch['cancellation.reason'], deleteField);
  assert.equal(Object.hasOwn(patch, 'amount'), false);
  assert.equal(Object.hasOwn(patch, 'currency'), false);
  assert.equal(Object.hasOwn(patch, 'reference'), false);
  assert.equal(Object.hasOwn(patch, 'provider_payment_id'), false);
});

test('disconnects matching ERP events from the deleted account', () => {
  assert.deepEqual(erpEventAnonymizationPatch({}, options), {
    'payload.customer_id': null,
    account_deleted_at: nowIso,
    updated_at: nowIso,
  });
});

test('anonymization patches require deletion primitives and a timestamp', () => {
  assert.throws(
    () => orderAnonymizationPatch({}, { nowIso }),
    /missing-delete-field/,
  );
  assert.throws(
    () => paymentAnonymizationPatch({}, { deleteField }),
    /missing-deletion-timestamp/,
  );
});
