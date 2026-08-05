'use strict';

const retainedActivityMessage =
  'Customer details were removed after account deletion.';

function normalizeAccountDeletionRequest(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    data.confirmation !== 'DELETE'
  ) {
    throw new Error('invalid-deletion-confirmation');
  }
  return { confirmation: 'DELETE' };
}

function deletionValue(options) {
  if (!options || !Object.hasOwn(options, 'deleteField')) {
    throw new Error('missing-delete-field');
  }
  return options.deleteField;
}

function deletionTimestamp(options) {
  const nowIso = typeof options?.nowIso === 'string' ? options.nowIso : '';
  if (!nowIso) {
    throw new Error('missing-deletion-timestamp');
  }
  return nowIso;
}

function sanitizeOrderActivity(activity) {
  if (!Array.isArray(activity)) return [];
  return activity.map((entry) => {
    const source = entry && typeof entry === 'object' ? entry : {};
    return {
      type: typeof source.type === 'string' ? source.type : '',
      title: typeof source.title === 'string' ? source.title : '',
      message: retainedActivityMessage,
      actor: source.actor === 'customer' ? 'deleted_customer' : source.actor || 'system',
      created_at: source.created_at || '',
    };
  });
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function orderAnonymizationPatch(order = {}, options = {}) {
  const deleteField = deletionValue(options);
  const nowIso = deletionTimestamp(options);
  const patch = {
    customer_id: null,
    customer: deleteField,
    client_order_id: deleteField,
    checkout_key: deleteField,
    account_deleted_at: nowIso,
    updated_at: nowIso,
  };
  if (isRecord(order.payment?.submission)) {
    patch['payment.submission.customer_id'] = deleteField;
    patch['payment.submission.note'] = deleteField;
  }
  if (isRecord(order.cancellation)) {
    patch['cancellation.reason'] = deleteField;
  }
  if (isRecord(order.delivery)) {
    patch['delivery.tracking_number'] = deleteField;
    patch['delivery.tracking_url'] = deleteField;
    patch['delivery.note'] = deleteField;
  }
  if (Array.isArray(order.activity)) {
    patch.activity = sanitizeOrderActivity(order.activity);
  }
  return patch;
}

function supportAnonymizationPatch(_supportRequest = {}, options = {}) {
  const deleteField = deletionValue(options);
  const nowIso = deletionTimestamp(options);
  return {
    customer_id: null,
    name: deleteField,
    phone: deleteField,
    email: deleteField,
    message: deleteField,
    reply: deleteField,
    internal_note: deleteField,
    account_deleted_at: nowIso,
    updated_at: nowIso,
  };
}

function paymentAnonymizationPatch(payment = {}, options = {}) {
  const deleteField = deletionValue(options);
  const nowIso = deletionTimestamp(options);
  const patch = {
    customer_id: null,
    admin_note: deleteField,
    account_deleted_at: nowIso,
    updated_at: nowIso,
  };
  if (isRecord(payment.customer_submission)) {
    patch['customer_submission.customer_id'] = deleteField;
    patch['customer_submission.note'] = deleteField;
  }
  if (isRecord(payment.cancellation)) {
    patch['cancellation.reason'] = deleteField;
  }
  return patch;
}

function erpEventAnonymizationPatch(_event = {}, options = {}) {
  const nowIso = deletionTimestamp(options);
  return {
    'payload.customer_id': null,
    account_deleted_at: nowIso,
    updated_at: nowIso,
  };
}

module.exports = {
  erpEventAnonymizationPatch,
  normalizeAccountDeletionRequest,
  orderAnonymizationPatch,
  paymentAnonymizationPatch,
  retainedActivityMessage,
  sanitizeOrderActivity,
  supportAnonymizationPatch,
};
