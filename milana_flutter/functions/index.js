'use strict';

const { randomUUID } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const {
  activityEntry,
  buildOrderPayload,
  canCustomerCancelOrder,
  checkoutKey,
  normalizeCancelOrderRequest,
  normalizeOrderStatus,
  normalizeOrderTracking,
  orderNumberFromId,
  normalizePaymentStatus,
  normalizeRequest,
} = require('./checkout');
const {
  buildSupportPayload,
  normalizeSupportRequest,
  normalizeSupportUpdate,
} = require('./support');
const { normalizeProductUpdate } = require('./product');
const {
  normalizePaymentSubmission,
  normalizePaymentWebhook,
  paymentWebhookEventKey,
  verifyPaymentWebhookSignature,
} = require('./payment');
const { normalizeAckRequest, normalizeClaimRequest } = require('./erp');
const { requestPublicApi } = require('./public_api');
const {
  forwardWebsiteRequest,
  websitePublicApiError,
} = require('./website_account');
const {
  accountDeletionFeedbackDocument,
  erpEventAnonymizationPatch,
  normalizeAccountDeletionRequest,
  orderAnonymizationPatch,
  paymentAnonymizationPatch,
  supportAnonymizationPatch,
} = require('./account');
const {
  buildDistributorApplication,
  distributorApplicationKey,
  normalizeApplicationStatus,
  normalizeDistributorApplication,
} = require('./distributor');
const {
  customerNotification,
  deviceTokenId,
  normalizeDeviceRegistration,
  normalizeNotificationPreferences,
} = require('./notification');

const app = initializeApp();
const auth = getAuth(app);
const db = getFirestore(app);
const messaging = getMessaging(app);
const region = 'asia-southeast1';
const accountDeletionBatchSize = 400;
const paymentWebhookSecret = defineSecret('PAYMENT_WEBHOOK_SECRET');

const notificationPreferenceByType = Object.freeze({
  application_submitted: 'application_updates',
  application_status: 'application_updates',
  order_status: 'order_updates',
  support_status: 'company_news',
});

async function sendCustomerPush({
  customerId,
  type,
  title,
  message,
  entityId = '',
  action = '',
}) {
  if (!customerId) return;
  try {
    const preferenceKey = notificationPreferenceByType[type];
    if (preferenceKey) {
      const preferences = await db
        .collection('notification_preferences')
        .doc(customerId)
        .get();
      if (preferences.exists && preferences.data()[preferenceKey] === false) {
        return;
      }
    }
    const devices = await db
      .collection('notification_devices')
      .where('customer_id', '==', customerId)
      .limit(100)
      .get();
    const activeDevices = devices.docs.filter(
      (document) => document.data().active !== false && document.data().token,
    );
    if (activeDevices.length === 0) return;
    const response = await messaging.sendEachForMulticast({
      tokens: activeDevices.map((document) => document.data().token),
      notification: { title, body: message },
      data: {
        type,
        entity_id: String(entityId),
        action: String(action),
      },
    });
    const invalidTokenCodes = new Set([
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
    ]);
    const cleanup = db.batch();
    let cleanupCount = 0;
    response.responses.forEach((result, index) => {
      if (!result.success && invalidTokenCodes.has(result.error?.code)) {
        cleanup.delete(activeDevices[index].ref);
        cleanupCount += 1;
      }
    });
    if (cleanupCount > 0) await cleanup.commit();
  } catch (error) {
    console.error('Customer push delivery failed.', {
      customerId,
      type,
      error: error?.code || error?.message || 'unknown',
    });
  }
}

async function anonymizeOwnedDocuments({
  collection,
  ownerField,
  ownerId,
  nowIso,
  patchFor,
}) {
  let updated = 0;
  while (true) {
    const snapshot = await db
      .collection(collection)
      .where(ownerField, '==', ownerId)
      .limit(accountDeletionBatchSize)
      .get();
    if (snapshot.empty) return updated;

    const batch = db.batch();
    const deleteField = FieldValue.delete();
    for (const document of snapshot.docs) {
      batch.update(
        document.ref,
        patchFor(document.data(), { deleteField, nowIso }),
      );
    }
    await batch.commit();
    updated += snapshot.size;
  }
}

async function deleteOwnedDocuments({ collection, ownerField, ownerId }) {
  let deleted = 0;
  while (true) {
    const snapshot = await db
      .collection(collection)
      .where(ownerField, '==', ownerId)
      .limit(accountDeletionBatchSize)
      .get();
    if (snapshot.empty) return deleted;
    const batch = db.batch();
    for (const document of snapshot.docs) batch.delete(document.ref);
    await batch.commit();
    deleted += snapshot.size;
  }
}

exports.listCheckoutManagers = onCall({ region }, async () => {
  let result;
  try {
    result = await requestPublicApi({ path: '/api/managers' });
  } catch (error) {
    throw new HttpsError('unavailable', 'Managers are temporarily unavailable.');
  }
  if (!result.ok || !Array.isArray(result.body)) {
    throw websitePublicApiError(result, 'Managers are temporarily unavailable.');
  }
  return result.body;
});

exports.submitDistributorApplication = onCall({ region }, async (request) => {
  let normalized;
  try {
    normalized = normalizeDistributorApplication(request.data || {});
  } catch (_) {
    throw new HttpsError(
      'invalid-argument',
      'Distributor application information is invalid.',
    );
  }

  const customerId = request.auth?.uid || null;
  const applicationKey = distributorApplicationKey({
    customerId,
    phone: normalized.phone,
    clientApplicationId: normalized.clientApplicationId,
  });
  const applicationRef = db
    .collection('distributor_applications')
    .doc(`application_${applicationKey}`);
  const rateLimitKey = distributorApplicationKey({
    customerId: null,
    phone: normalized.phone,
    clientApplicationId: 'distributor_daily_limit',
  });
  const rateLimitRef = db
    .collection('distributor_rate_limits')
    .doc(rateLimitKey);
  const nowIso = new Date().toISOString();
  const applicationNumber = `MD-${new Date().getUTCFullYear()}-${applicationKey
    .slice(0, 6)
    .toUpperCase()}`;

  let receipt;
  let pushPayload = null;
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(applicationRef);
    if (existing.exists) {
      const data = existing.data();
      receipt = {
        application_id: applicationRef.id,
        number: data.number,
        status: data.status,
      };
      return;
    }
    const rateLimit = await tx.get(rateLimitRef);
    const previousRate = rateLimit.data() || {};
    const windowStartedAt = Date.parse(previousRate.window_started_at || '');
    const withinWindow =
      Number.isFinite(windowStartedAt) && Date.now() - windowStartedAt < 86400000;
    const submissionCount = withinWindow
      ? Number(previousRate.submission_count || 0)
      : 0;
    if (submissionCount >= 5) {
      throw new HttpsError(
        'resource-exhausted',
        'Too many distributor applications. Please contact sales directly.',
      );
    }
    tx.set(rateLimitRef, {
      submission_count: submissionCount + 1,
      window_started_at: withinWindow
        ? previousRate.window_started_at
        : nowIso,
      updated_at: nowIso,
    });
    const application = buildDistributorApplication({
      request: normalized,
      customerId,
      applicationNumber,
      nowIso,
    });
    tx.create(applicationRef, application);
    if (customerId) {
      pushPayload = {
        customerId,
        type: 'application_submitted',
        title: 'Distributor application received',
        message: `${applicationNumber} is ready for manager review.`,
        entityId: applicationRef.id,
        action: 'partnership',
      };
      const notificationRef = db.collection('customer_notifications').doc();
      tx.create(
        notificationRef,
        customerNotification({
          ...pushPayload,
          nowIso,
        }),
      );
    }
    receipt = {
      application_id: applicationRef.id,
      number: applicationNumber,
      status: 'submitted',
    };
  });
  if (pushPayload) await sendCustomerPush(pushPayload);
  return receipt;
});

exports.updateDistributorApplicationStatus = onCall(
  { region },
  async (request) => {
    if (
      request.auth?.token?.admin !== true &&
      request.auth?.token?.manager !== true
    ) {
      throw new HttpsError(
        'permission-denied',
        'Only sales managers can update distributor applications.',
      );
    }
    const applicationId = String(request.data?.application_id || '').trim();
    if (!/^application_[a-f0-9]{64}$/.test(applicationId)) {
      throw new HttpsError('invalid-argument', 'Application id is invalid.');
    }
    let status;
    try {
      status = normalizeApplicationStatus(request.data?.status);
    } catch (_) {
      throw new HttpsError('invalid-argument', 'Application status is invalid.');
    }
    const managerMessage = String(request.data?.manager_message || '')
      .trim()
      .slice(0, 2000);
    const assignedManagerId = String(
      request.data?.assigned_manager_id || request.auth.uid || '',
    )
      .trim()
      .slice(0, 160);
    const applicationRef = db
      .collection('distributor_applications')
      .doc(applicationId);
    const application = await applicationRef.get();
    if (!application.exists) {
      throw new HttpsError('not-found', 'Distributor application was not found.');
    }
    const current = application.data();
    const nowIso = new Date().toISOString();
    const batch = db.batch();
    batch.update(applicationRef, {
      status,
      manager_message: managerMessage,
      assigned_manager_id: assignedManagerId,
      reviewed_at: nowIso,
      updated_at: nowIso,
    });
    let pushPayload = null;
    if (current.customer_id) {
      pushPayload = {
        customerId: current.customer_id,
        type: 'application_status',
        title: 'Partnership application updated',
        message: managerMessage || `${current.number} is now ${status}.`,
        entityId: applicationId,
        action: 'partnership',
      };
      batch.create(
        db.collection('customer_notifications').doc(),
        customerNotification({
          ...pushPayload,
          nowIso,
        }),
      );
    }
    await batch.commit();
    if (pushPayload) await sendCustomerPush(pushPayload);
    return { application_id: applicationId, status, updated_at: nowIso };
  },
);

exports.updateNotificationPreferences = onCall({ region }, async (request) => {
  const customerId = request.auth?.uid;
  if (!customerId) {
    throw new HttpsError('unauthenticated', 'Sign in to update notifications.');
  }
  const preferences = normalizeNotificationPreferences(request.data || {});
  await db.collection('notification_preferences').doc(customerId).set(
    {
      customer_id: customerId,
      ...preferences,
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );
  return preferences;
});

exports.registerNotificationDevice = onCall({ region }, async (request) => {
  const customerId = request.auth?.uid;
  if (!customerId) {
    throw new HttpsError('unauthenticated', 'Sign in to enable notifications.');
  }
  let registration;
  try {
    registration = normalizeDeviceRegistration(request.data || {});
  } catch (_) {
    throw new HttpsError('invalid-argument', 'Device registration is invalid.');
  }
  const nowIso = new Date().toISOString();
  await db
    .collection('notification_devices')
    .doc(deviceTokenId(registration.token))
    .set({
      customer_id: customerId,
      token: registration.token,
      platform: registration.platform,
      lang: registration.lang,
      active: true,
      updated_at: nowIso,
      created_at: nowIso,
    });
  return { registered: true };
});

exports.markNotificationRead = onCall({ region }, async (request) => {
  const customerId = request.auth?.uid;
  if (!customerId) {
    throw new HttpsError('unauthenticated', 'Sign in to update notifications.');
  }
  const notificationId = String(request.data?.notification_id || '').trim();
  if (!/^[a-zA-Z0-9]{10,80}$/.test(notificationId)) {
    throw new HttpsError('invalid-argument', 'Notification id is invalid.');
  }
  const notificationRef = db
    .collection('customer_notifications')
    .doc(notificationId);
  await db.runTransaction(async (tx) => {
    const notification = await tx.get(notificationRef);
    if (!notification.exists) {
      throw new HttpsError('not-found', 'Notification was not found.');
    }
    if (notification.data().customer_id !== customerId) {
      throw new HttpsError('permission-denied', 'Notification is not owned.');
    }
    tx.update(notificationRef, {
      read: true,
      read_at: new Date().toISOString(),
    });
  });
  return { notification_id: notificationId, read: true };
});

exports.placeWebsiteOrder = onCall({ region }, async (request) => {
  const data =
    request.data && typeof request.data === 'object' && !Array.isArray(request.data)
      ? request.data
      : {};
  return forwardWebsiteRequest({
    request,
    path: '/api/orders',
    method: 'POST',
    data: { ...data, source: 'flutter' },
    fallback: 'Order could not be submitted.',
    optionalSession: true,
  });
});

exports.listWebsiteCustomerOrders = onCall({ region }, async (request) =>
  forwardWebsiteRequest({
    request,
    path: '/api/auth/orders',
    fallback: 'Orders are temporarily unavailable.',
  }));

exports.listWebsiteCustomerSupport = onCall({ region }, async (request) =>
  forwardWebsiteRequest({
    request,
    path: '/api/auth/support',
    fallback: 'Support history is temporarily unavailable.',
  }));

exports.createWebsiteSupport = onCall({ region }, async (request) => {
  return forwardWebsiteRequest({
    request,
    path: '/api/support',
    method: 'POST',
    data: { ...(request.data || {}), source: 'flutter' },
    fallback: 'Support request could not be submitted.',
  });
});

function websiteOrderId(request) {
  const orderId = String(request?.data?.order_id || '').trim();
  if (!/^\d+$/.test(orderId)) {
    throw new HttpsError('invalid-argument', 'Order id is invalid.');
  }
  return orderId;
}

exports.submitWebsitePaymentProof = onCall({ region }, async (request) => {
  const orderId = websiteOrderId(request);
  const { order_id: ignoredOrderId, ...data } = request.data || {};
  return forwardWebsiteRequest({
    request,
    path: `/api/auth/orders/${orderId}/payment-proof`,
    method: 'POST',
    data,
    fallback: 'Payment proof could not be submitted.',
  });
});

exports.cancelWebsiteOrder = onCall({ region }, async (request) => {
  const orderId = websiteOrderId(request);
  const { order_id: ignoredOrderId, ...data } = request.data || {};
  return forwardWebsiteRequest({
    request,
    path: `/api/auth/orders/${orderId}/cancel`,
    method: 'POST',
    data,
    fallback: 'Order could not be cancelled.',
  });
});

exports.deleteCustomerAccount = onCall({ region }, async (request) => {
  const customerId = request.auth?.uid;
  if (!customerId) {
    throw new HttpsError('unauthenticated', 'Sign in to delete your account.');
  }
  let normalizedDeletion;
  try {
    normalizedDeletion = normalizeAccountDeletionRequest(request.data);
  } catch (error) {
    const confirmationInvalid =
      error?.message === 'invalid-deletion-confirmation';
    throw new HttpsError(
      'invalid-argument',
      confirmationInvalid
        ? 'Type DELETE exactly to confirm account deletion.'
        : 'Select a valid account deletion reason.',
    );
  }

  const nowIso = new Date().toISOString();
  let anonymized;
  try {
    const orders = await anonymizeOwnedDocuments({
      collection: 'orders',
      ownerField: 'customer_id',
      ownerId: customerId,
      nowIso,
      patchFor: orderAnonymizationPatch,
    });
    const supportRequests = await anonymizeOwnedDocuments({
      collection: 'support_requests',
      ownerField: 'customer_id',
      ownerId: customerId,
      nowIso,
      patchFor: supportAnonymizationPatch,
    });
    const payments = await anonymizeOwnedDocuments({
      collection: 'payments',
      ownerField: 'customer_id',
      ownerId: customerId,
      nowIso,
      patchFor: paymentAnonymizationPatch,
    });
    const erpEvents = await anonymizeOwnedDocuments({
      collection: 'erp_events',
      ownerField: 'payload.customer_id',
      ownerId: customerId,
      nowIso,
      patchFor: erpEventAnonymizationPatch,
    });
    const distributorApplications = await anonymizeOwnedDocuments({
      collection: 'distributor_applications',
      ownerField: 'customer_id',
      ownerId: customerId,
      nowIso,
      patchFor: (_data, { deleteField }) => ({
        customer_id: null,
        contact_name: 'Deleted applicant',
        company_name: 'Deleted company',
        phone: deleteField,
        email: deleteField,
        country: deleteField,
        city: deleteField,
        website: deleteField,
        sales_channels: deleteField,
        requested_territories: deleteField,
        message: deleteField,
        manager_message: deleteField,
        legal_accepted_at: deleteField,
        anonymized_at: nowIso,
        updated_at: nowIso,
      }),
    });
    const notifications = await deleteOwnedDocuments({
      collection: 'customer_notifications',
      ownerField: 'customer_id',
      ownerId: customerId,
    });
    const notificationDevices = await deleteOwnedDocuments({
      collection: 'notification_devices',
      ownerField: 'customer_id',
      ownerId: customerId,
    });
    const deletionFeedback = accountDeletionFeedbackDocument(
      normalizedDeletion,
      { nowIso },
    );
    const finalBatch = db.batch();
    finalBatch.delete(
      db.collection('notification_preferences').doc(customerId),
    );
    finalBatch.delete(db.collection('customers').doc(customerId));
    finalBatch.delete(
      db.collection('customers').doc(customerId).collection('state').doc('saved'),
    );
    finalBatch.delete(
      db.collection('customers').doc(customerId).collection('state').doc('recent'),
    );
    finalBatch.delete(
      db.collection('customers').doc(customerId).collection('state').doc('cart'),
    );
    finalBatch.set(
      db.collection('account_deletion_feedback').doc(),
      deletionFeedback,
    );
    await finalBatch.commit();
    anonymized = {
      orders,
      support_requests: supportRequests,
      payments,
      erp_events: erpEvents,
      distributor_applications: distributorApplications,
      customer_notifications: notifications,
      notification_devices: notificationDevices,
    };
  } catch (error) {
    throw new HttpsError(
      'internal',
      'Account data could not be deleted. Please try again.',
    );
  }

  try {
    await auth.deleteUser(customerId);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') {
      throw new HttpsError(
        'internal',
        'Account authentication could not be deleted. Please try again.',
      );
    }
  }

  return { deleted: true, anonymized };
});

async function productRefFor({ slug, productId }) {
  if (slug) {
    const bySlug = db.collection('products').doc(slug);
    const snap = await bySlug.get();
    if (snap.exists) return bySlug;
  }
  if (productId) {
    const byId = await db
      .collection('products')
      .where('id', '==', productId)
      .limit(1)
      .get();
    if (!byId.empty) return byId.docs[0].ref;
  }
  throw new HttpsError('not-found', 'Product is not available.');
}

function availableQop(product) {
  const value = Number(product?.available_qop);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function orderActivity({ type, title, message, actor, nowIso }) {
  return activityEntry({
    type,
    title,
    message,
    actor,
    createdAt: nowIso,
  });
}

function appendActivity(existing, entry) {
  return appendActivities(existing, [entry]);
}

function appendActivities(existing, entries) {
  const current = Array.isArray(existing) ? existing : [];
  return [...current, ...entries].slice(-30);
}

function paymentStatusTitle(status) {
  return {
    waiting_for_customer: 'To‘lov ma’lumoti kutilmoqda',
    submitted: 'To‘lov tekshiruvda',
    paid: 'To‘lov tasdiqlandi',
    failed: 'To‘lov rad etildi',
    cancelled: 'To‘lov bekor qilindi',
    refunded: 'To‘lov qaytarildi',
  }[status] || 'To‘lov holati yangilandi';
}

function orderStatusTitle(status) {
  return {
    confirmed: 'Buyurtma tasdiqlandi',
    packed: 'Buyurtma qadoqlandi',
    shipped: 'Buyurtma yuborildi',
    delivered: 'Buyurtma yetkazildi',
    cancelled: 'Buyurtma bekor qilindi',
    failed: 'Buyurtma bajarilmadi',
  }[status] || 'Buyurtma holati yangilandi';
}

function shouldReleaseStock(status) {
  return status === 'cancelled' || status === 'failed';
}

function reservedQopBySlug(order) {
  const bySlug = new Map();
  const items = Array.isArray(order?.items) ? order.items : [];
  for (const item of items) {
    const slug = typeof item?.slug === 'string' ? item.slug.trim() : '';
    const qty = Number(item?.qty);
    if (!slug || !Number.isInteger(qty) || qty < 1) continue;
    bySlug.set(slug, (bySlug.get(slug) || 0) + qty);
  }
  return bySlug;
}

async function releaseReservedStockIfNeeded({ tx, order, nowIso }) {
  if (order.stock_released_at) return { released: false, qop: 0 };
  const bySlug = reservedQopBySlug(order);
  if (bySlug.size === 0) return { released: false, qop: 0 };

  const rows = [...bySlug.entries()].map(([slug, qty]) => ({
    qty,
    ref: db.collection('products').doc(slug),
  }));
  const snaps = await Promise.all(rows.map((row) => tx.get(row.ref)));
  let releasedQop = 0;
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const current = availableQop(snap.data());
    if (current === null) return;
    const qty = rows[index].qty;
    releasedQop += qty;
    tx.update(rows[index].ref, {
      available_qop: current + qty,
      updated_at: nowIso,
    });
  });
  return { released: true, qop: releasedQop };
}

function erpEvent({ type, entityType, entityId, actor, payload, nowIso }) {
  return {
    type,
    entity_type: entityType,
    entity_id: entityId,
    actor,
    payload,
    status: 'pending',
    attempts: 0,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function createErpEvent(tx, event) {
  tx.create(db.collection('erp_events').doc(), event);
}

function erpEventReceipt(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    type: data.type || '',
    entity_type: data.entity_type || '',
    entity_id: data.entity_id || '',
    actor: data.actor || '',
    payload: data.payload || {},
    attempts: data.attempts || 0,
    created_at: data.created_at || '',
  };
}

async function claimableErpEventDocs(tx, { limit, nowIso }) {
  const pending = await tx.get(
    db.collection('erp_events')
      .where('status', '==', 'pending')
      .orderBy('created_at', 'asc')
      .limit(limit),
  );
  if (pending.size >= limit) return pending.docs;

  const expiredProcessing = await tx.get(
    db.collection('erp_events')
      .where('status', '==', 'processing')
      .where('lease_until', '<=', nowIso)
      .orderBy('lease_until', 'asc')
      .limit(limit - pending.size),
  );
  return [...pending.docs, ...expiredProcessing.docs];
}

function orderEventPayload(orderId, order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return {
    order_id: orderId,
    order_number: order.number || '',
    customer_id: order.customer_id || '',
    status: order.status || 'new',
    payment_status: order.payment?.status || 'pending',
    total: order.total || 0,
    item_count: items.reduce((sum, item) => sum + Number(item.qty || 0), 0),
  };
}

function receiptFromOrder(orderId, order) {
  const payment = order.payment || {};
  return {
    order_id: orderId,
    number: order.number,
    total: order.total,
    client_order_id: order.client_order_id || '',
    payment_status: payment.status || 'pending',
    payment_method: payment.method || 'manager',
    payment_provider: payment.provider || 'manual',
    payment_label: payment.label || 'Menejer orqali',
    payment_instructions: payment.instructions || '',
    payment_reference: payment.reference || '',
    payment_expires_at: payment.expires_at || '',
    support_phone: payment.support_phone || '+998501551010',
  };
}

async function orderIdForPaymentWebhook(webhook) {
  if (webhook.orderId) return webhook.orderId;
  const matches = await db
    .collection('payments')
    .where('reference', '==', webhook.reference)
    .limit(2)
    .get();
  if (matches.empty) {
    throw new HttpsError('not-found', 'Payment reference is not available.');
  }
  if (matches.size > 1) {
    throw new HttpsError('failed-precondition', 'Payment reference is not unique.');
  }
  return matches.docs[0].id;
}

async function updatePaymentStatusForOrder({
  orderId,
  status,
  note = '',
  actor = 'admin',
  nowIso = new Date().toISOString(),
  webhook = null,
}) {
  const orderRef = db.collection('orders').doc(orderId);
  const paymentRef = db.collection('payments').doc(orderId);
  const webhookEventRef = webhook
    ? db.collection('payment_webhook_events').doc(
        paymentWebhookEventKey(webhook.provider, webhook.eventId),
      )
    : null;
  let duplicate = false;

  await db.runTransaction(async (tx) => {
    const reads = [tx.get(orderRef), tx.get(paymentRef)];
    if (webhookEventRef) reads.push(tx.get(webhookEventRef));
    const [orderSnap, paymentSnap, webhookEventSnap] = await Promise.all(reads);

    if (webhookEventSnap?.exists) {
      duplicate = true;
      return;
    }
    if (!orderSnap.exists || !paymentSnap.exists) {
      throw new HttpsError('not-found', 'Order payment is not available.');
    }

    const order = orderSnap.data();
    const payment = paymentSnap.data();
    if (
      webhook &&
      webhook.amount !== null &&
      webhook.currency &&
      payment.currency === webhook.currency &&
      Math.abs(Number(payment.amount || 0) - webhook.amount) > 0.01
    ) {
      throw new HttpsError('failed-precondition', 'Payment amount does not match.');
    }

    const activities = [
      orderActivity({
        type: 'payment_status',
        title: paymentStatusTitle(status),
        message:
          note ||
          (webhook
            ? `${webhook.provider} to‘lov xabari orqali ${status} tasdiqlandi.`
            : `Menejer to‘lov holatini ${status} deb belgiladi.`),
        actor,
        nowIso,
      }),
    ];
    let stockRelease = { released: false, qop: 0 };
    if (shouldReleaseStock(status)) {
      stockRelease = await releaseReservedStockIfNeeded({ tx, order, nowIso });
      if (stockRelease.released) {
        activities.push(
          orderActivity({
            type: 'stock_released',
            title: 'Qop zaxirasi qaytarildi',
            message: `${stockRelease.qop} qop katalog zaxirasiga qaytarildi.`,
            actor: 'system',
            nowIso,
          }),
        );
      }
    }

    const orderUpdate = {
      'payment.status': status,
      activity: appendActivities(order.activity, activities),
      updated_at: nowIso,
    };
    if (status === 'paid') orderUpdate.status = 'confirmed';
    if (status === 'cancelled' || status === 'failed') orderUpdate.status = status;
    if (stockRelease.released) orderUpdate.stock_released_at = nowIso;

    const paymentUpdate = {
      status,
      updated_at: nowIso,
    };
    if (note) paymentUpdate.admin_note = note;
    if (webhook) {
      paymentUpdate.provider = webhook.provider;
      paymentUpdate.provider_payment_id = webhook.providerPaymentId;
      paymentUpdate.provider_event_id = webhook.eventId;
      paymentUpdate.provider_status = webhook.status;
      paymentUpdate.provider_updated_at = webhook.paidAt || nowIso;
      if (webhook.amount !== null) paymentUpdate.provider_amount = webhook.amount;
      if (webhook.currency) paymentUpdate.provider_currency = webhook.currency;
    }

    tx.update(orderRef, orderUpdate);
    tx.update(paymentRef, paymentUpdate);
    if (webhookEventRef) {
      tx.create(webhookEventRef, {
        provider: webhook.provider,
        event_id: webhook.eventId,
        provider_payment_id: webhook.providerPaymentId,
        order_id: orderId,
        reference: webhook.reference,
        status,
        amount: webhook.amount,
        currency: webhook.currency,
        received_at: nowIso,
        processed_at: nowIso,
      });
    }
    createErpEvent(
      tx,
      erpEvent({
        type: 'payment.status_updated',
        entityType: 'payment',
        entityId: orderId,
        actor,
        payload: {
          order_id: orderId,
          payment_status: status,
          order_status: orderUpdate.status || order.status || 'new',
          note,
          provider: webhook?.provider || payment.provider || '',
          provider_event_id: webhook?.eventId || '',
          stock_released_qop: stockRelease.released ? stockRelease.qop : 0,
        },
        nowIso,
      }),
    );
  });

  return {
    order_id: orderId,
    payment_status: status,
    duplicate,
    updated_at: nowIso,
  };
}

exports.placeOrder = onCall({ region }, async (request) => {
  let normalized;
  try {
    normalized = normalizeRequest(request.data);
  } catch (error) {
    throw new HttpsError('invalid-argument', 'Checkout information is invalid.');
  }

  const customerId = request.auth?.uid || null;
  const key = checkoutKey({
    customerId,
    phone: normalized.customer.phone,
    clientOrderId: normalized.clientOrderId,
  });
  const orderRef = key
    ? db.collection('orders').doc(`checkout_${key}`)
    : db.collection('orders').doc();
  const orderNumber = orderNumberFromId(orderRef.id);
  const nowIso = new Date().toISOString();
  const productRefs = await Promise.all(normalized.items.map(productRefFor));
  const paymentRef = db.collection('payments').doc(orderRef.id);
  let receipt;
  try {
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(orderRef);
      if (existing.exists) {
        receipt = receiptFromOrder(orderRef.id, existing.data());
        return;
      }

      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      const products = productSnaps.map((snap) => {
        if (!snap.exists) {
          throw new Error('missing-product');
        }
        return snap.data();
      });
      const payload = buildOrderPayload({
        orderId: orderRef.id,
        orderNumber,
        request: normalized,
        products,
        customerId,
        checkoutKey: key,
        nowIso,
      });
      const stockReservations = new Map();
      productSnaps.forEach((snap, index) => {
        const stock = availableQop(products[index]);
        if (stock === null) return;
        const key = snap.ref.path;
        const current = stockReservations.get(key) || {
          ref: snap.ref,
          available: stock,
          requested: 0,
        };
        current.requested += normalized.items[index].qty;
        stockReservations.set(key, current);
      });
      for (const reservation of stockReservations.values()) {
        if (reservation.requested > reservation.available) {
          throw new Error('insufficient-stock');
        }
        tx.update(reservation.ref, {
          available_qop: reservation.available - reservation.requested,
          updated_at: nowIso,
        });
      }
      tx.create(orderRef, payload.order);
      tx.create(paymentRef, payload.payment);
      createErpEvent(
        tx,
        erpEvent({
          type: 'order.created',
          entityType: 'order',
          entityId: orderRef.id,
          actor: customerId ? 'customer' : 'guest',
          payload: orderEventPayload(orderRef.id, payload.order),
          nowIso,
        }),
      );
      receipt = payload.receipt;
    });
  } catch (error) {
    if (error.message === 'insufficient-stock') {
      throw new HttpsError(
        'failed-precondition',
        'Requested qop quantity is not available.',
      );
    }
    throw new HttpsError('failed-precondition', 'Order total could not be calculated.');
  }
  return receipt;
});

exports.createSupportTicket = onCall({ region }, async (request) => {
  let normalized;
  try {
    normalized = normalizeSupportRequest(request.data);
  } catch (error) {
    throw new HttpsError('invalid-argument', 'Support request is invalid.');
  }

  const ticketRef = db.collection('support_requests').doc();
  const ticketNumber = `MS-${new Date().getUTCFullYear()}-${ticketRef.id
    .slice(0, 4)
    .toUpperCase()}`;
  const payload = buildSupportPayload({
    ticketId: ticketRef.id,
    ticketNumber,
    request: normalized,
    customerId: request.auth?.uid || null,
    nowIso: new Date().toISOString(),
  });

  const batch = db.batch();
  batch.create(ticketRef, payload.ticket);
  batch.create(
    db.collection('erp_events').doc(),
    erpEvent({
      type: 'support.created',
      entityType: 'support_request',
      entityId: ticketRef.id,
      actor: request.auth?.uid ? 'customer' : 'guest',
      payload: {
        ticket_id: ticketRef.id,
        ticket_number: ticketNumber,
        customer_id: request.auth?.uid || '',
        topic: payload.ticket.topic,
        status: payload.ticket.status,
      },
      nowIso: payload.ticket.created_at,
    }),
  );
  await batch.commit();
  return payload.receipt;
});

exports.updatePaymentStatus = onCall({ region }, async (request) => {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Only admins can update payments.');
  }

  const orderId =
    typeof request.data?.order_id === 'string' ? request.data.order_id.trim() : '';
  if (!orderId) {
    throw new HttpsError('invalid-argument', 'Order id is required.');
  }

  let status;
  try {
    status = normalizePaymentStatus(request.data?.status);
  } catch (error) {
    throw new HttpsError('invalid-argument', 'Payment status is invalid.');
  }

  const note =
    typeof request.data?.note === 'string'
      ? request.data.note.trim().slice(0, 500)
      : '';
  const receipt = await updatePaymentStatusForOrder({
    orderId,
    status,
    note,
    actor: 'admin',
  });
  delete receipt.duplicate;
  return receipt;
});

async function handlePaymentWebhook(req, res) {
  if (req.method !== 'POST') {
    res.set('allow', 'POST');
    res.status(405).json({ ok: false, error: 'method-not-allowed' });
    return;
  }

  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.from(
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
        'utf8',
      );
  const secret = paymentWebhookSecret.value();
  const signature =
    req.get('x-milana-signature') ||
    req.get('x-payment-signature') ||
    req.get('x-webhook-signature') ||
    '';
  try {
    if (!verifyPaymentWebhookSignature({ rawBody, signature, secret })) {
      res.status(401).json({ ok: false, error: 'invalid-signature' });
      return;
    }
  } catch (error) {
    res.status(503).json({ ok: false, error: 'webhook-secret-not-configured' });
    return;
  }

  let payload;
  try {
    payload =
      req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? req.body
        : JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'invalid-json' });
    return;
  }

  let webhook;
  try {
    webhook = normalizePaymentWebhook(payload);
  } catch (error) {
    res.status(400).json({ ok: false, error: 'invalid-payment-webhook' });
    return;
  }

  try {
    const orderId = await orderIdForPaymentWebhook(webhook);
    const receipt = await updatePaymentStatusForOrder({
      orderId,
      status: webhook.status,
      note: webhook.note,
      actor: 'payment_webhook',
      webhook,
    });
    res.json({
      ok: true,
      order_id: receipt.order_id,
      payment_status: receipt.payment_status,
      duplicate: receipt.duplicate,
      updated_at: receipt.updated_at,
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      const statusCode = {
        'not-found': 404,
        'failed-precondition': 409,
        'invalid-argument': 400,
      }[error.code] || 500;
      res.status(statusCode).json({ ok: false, error: error.code });
      return;
    }
    res.status(500).json({ ok: false, error: 'payment-webhook-failed' });
  }
}

exports.paymentWebhook = onRequest(
  { region, secrets: [paymentWebhookSecret] },
  handlePaymentWebhook,
);

exports.submitPaymentProof = onCall({ region }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to submit payment details.');
  }

  let normalized;
  try {
    normalized = normalizePaymentSubmission(request.data || {});
  } catch (error) {
    throw new HttpsError('invalid-argument', 'Payment submission is invalid.');
  }

  const nowIso = new Date().toISOString();
  const orderRef = db.collection('orders').doc(normalized.orderId);
  const paymentRef = db.collection('payments').doc(normalized.orderId);
  const submission = {
    customer_id: request.auth.uid,
    method: normalized.method,
    reference: normalized.reference,
    note: normalized.note,
    submitted_at: nowIso,
  };
  if (normalized.amount !== null) submission.amount = normalized.amount;

  await db.runTransaction(async (tx) => {
    const [orderSnap, paymentSnap] = await Promise.all([
      tx.get(orderRef),
      tx.get(paymentRef),
    ]);
    if (!orderSnap.exists || !paymentSnap.exists) {
      throw new HttpsError('not-found', 'Order payment is not available.');
    }
    const order = orderSnap.data();
    if (order.customer_id !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Only the order owner can submit payment.');
    }
    const currentStatus = order.payment?.status || 'pending';
    if (currentStatus === 'paid' || currentStatus === 'refunded') {
      throw new HttpsError('failed-precondition', 'Payment is already closed.');
    }

    tx.update(orderRef, {
      'payment.status': 'submitted',
      'payment.submission': submission,
      activity: appendActivity(
        order.activity,
        orderActivity({
          type: 'payment_submitted',
          title: 'To‘lov ma’lumoti yuborildi',
          message: normalized.reference
            ? `Mijoz reference yubordi: ${normalized.reference}`
            : 'Mijoz to‘lov ma’lumotini yubordi.',
          actor: 'customer',
          nowIso,
        }),
      ),
      updated_at: nowIso,
    });
    tx.update(paymentRef, {
      status: 'submitted',
      customer_submission: submission,
      updated_at: nowIso,
    });
    createErpEvent(
      tx,
      erpEvent({
        type: 'payment.proof_submitted',
        entityType: 'payment',
        entityId: normalized.orderId,
        actor: 'customer',
        payload: {
          order_id: normalized.orderId,
          customer_id: request.auth.uid,
          method: normalized.method,
          amount: normalized.amount,
          reference: normalized.reference,
        },
        nowIso,
      }),
    );
  });

  return {
    order_id: normalized.orderId,
    payment_status: 'submitted',
    submitted_at: nowIso,
  };
});

exports.cancelOrder = onCall({ region }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to cancel an order.');
  }

  let normalized;
  try {
    normalized = normalizeCancelOrderRequest(request.data || {});
  } catch (error) {
    throw new HttpsError('invalid-argument', 'Cancellation request is invalid.');
  }

  const nowIso = new Date().toISOString();
  const orderRef = db.collection('orders').doc(normalized.orderId);
  const paymentRef = db.collection('payments').doc(normalized.orderId);
  let stockRelease = { released: false, qop: 0 };

  await db.runTransaction(async (tx) => {
    const [orderSnap, paymentSnap] = await Promise.all([
      tx.get(orderRef),
      tx.get(paymentRef),
    ]);
    if (!orderSnap.exists || !paymentSnap.exists) {
      throw new HttpsError('not-found', 'Order is not available.');
    }
    const order = orderSnap.data();
    if (order.customer_id !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Only the order owner can cancel.');
    }
    if (!canCustomerCancelOrder(order)) {
      throw new HttpsError(
        'failed-precondition',
        'This order can no longer be cancelled in the app.',
      );
    }

    stockRelease = await releaseReservedStockIfNeeded({ tx, order, nowIso });
    const activities = [
      orderActivity({
        type: 'order_cancelled',
        title: 'Buyurtma bekor qilindi',
        message: normalized.reason
          ? `Mijoz buyurtmani bekor qildi: ${normalized.reason}`
          : 'Mijoz buyurtmani bekor qildi.',
        actor: 'customer',
        nowIso,
      }),
    ];
    if (stockRelease.released) {
      activities.push(
        orderActivity({
          type: 'stock_released',
          title: 'Qop zaxirasi qaytarildi',
          message: `${stockRelease.qop} qop katalog zaxirasiga qaytarildi.`,
          actor: 'system',
          nowIso,
        }),
      );
    }

    const cancellation = {
      actor: 'customer',
      reason: normalized.reason,
      cancelled_at: nowIso,
    };
    const orderUpdate = {
      status: 'cancelled',
      'payment.status': 'cancelled',
      cancellation,
      activity: appendActivities(order.activity, activities),
      updated_at: nowIso,
    };
    if (stockRelease.released) orderUpdate.stock_released_at = nowIso;

    tx.update(orderRef, orderUpdate);
    tx.update(paymentRef, {
      status: 'cancelled',
      cancellation,
      updated_at: nowIso,
    });
    createErpEvent(
      tx,
      erpEvent({
        type: 'order.cancelled',
        entityType: 'order',
        entityId: normalized.orderId,
        actor: 'customer',
        payload: {
          order_id: normalized.orderId,
          status: 'cancelled',
          payment_status: 'cancelled',
          reason: normalized.reason,
          stock_released_qop: stockRelease.released ? stockRelease.qop : 0,
        },
        nowIso,
      }),
    );
  });

  return {
    order_id: normalized.orderId,
    status: 'cancelled',
    payment_status: 'cancelled',
    stock_released_qop: stockRelease.released ? stockRelease.qop : 0,
    cancelled_at: nowIso,
  };
});

exports.updateOrderStatus = onCall({ region }, async (request) => {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Only admins can update orders.');
  }

  const orderId =
    typeof request.data?.order_id === 'string' ? request.data.order_id.trim() : '';
  if (!orderId) {
    throw new HttpsError('invalid-argument', 'Order id is required.');
  }

  let status;
  let tracking;
  try {
    status = normalizeOrderStatus(request.data?.status);
    tracking = normalizeOrderTracking(request.data?.tracking || {});
  } catch (error) {
    throw new HttpsError('invalid-argument', 'Order status information is invalid.');
  }

  const nowIso = new Date().toISOString();
  const orderRef = db.collection('orders').doc(orderId);
  const update = {
    status,
    updated_at: nowIso,
  };
  if (status === 'shipped' && tracking.carrier) {
    update['delivery.carrier'] = tracking.carrier;
  }
  if (status === 'shipped' && tracking.trackingNumber) {
    update['delivery.tracking_number'] = tracking.trackingNumber;
  }
  if (status === 'shipped' && tracking.trackingUrl) {
    update['delivery.tracking_url'] = tracking.trackingUrl;
  }
  if (tracking.note) {
    update['delivery.note'] = tracking.note;
  }
  if (status === 'shipped') update.shipped_at = nowIso;
  if (status === 'delivered') update.delivered_at = nowIso;

  let pushPayload = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Order is not available.');
    }
    const order = snap.data();
    const activities = [
      orderActivity({
        type: 'order_status',
        title: orderStatusTitle(status),
        message:
          status === 'shipped' && tracking.trackingNumber
            ? `Cargo tracking: ${tracking.trackingNumber}`
            : tracking.note || `Menejer buyurtma holatini ${status} deb belgiladi.`,
        actor: 'admin',
        nowIso,
      }),
    ];
    let stockRelease = { released: false, qop: 0 };
    if (shouldReleaseStock(status)) {
      stockRelease = await releaseReservedStockIfNeeded({ tx, order, nowIso });
      if (stockRelease.released) {
        activities.push(
          orderActivity({
            type: 'stock_released',
            title: 'Qop zaxirasi qaytarildi',
            message: `${stockRelease.qop} qop katalog zaxirasiga qaytarildi.`,
            actor: 'system',
            nowIso,
          }),
        );
      }
    }
    update.activity = appendActivities(order.activity, activities);
    if (stockRelease.released) update.stock_released_at = nowIso;
    tx.update(orderRef, update);
    if (order.customer_id) {
      const message =
        status === 'shipped' && tracking.trackingNumber
          ? `Cargo tracking: ${tracking.trackingNumber}`
          : tracking.note || `Your order is now ${status}.`;
      pushPayload = {
        customerId: order.customer_id,
        type: 'order_status',
        title: orderStatusTitle(status),
        message,
        entityId: orderId,
        action: 'orders',
      };
      tx.create(
        db.collection('customer_notifications').doc(),
        customerNotification({ ...pushPayload, nowIso }),
      );
    }
    createErpEvent(
      tx,
      erpEvent({
        type: 'order.status_updated',
        entityType: 'order',
        entityId: orderId,
        actor: 'admin',
        payload: {
          order_id: orderId,
          status,
          tracking: {
            carrier: tracking.carrier,
            tracking_number: tracking.trackingNumber,
            tracking_url: tracking.trackingUrl,
            note: tracking.note,
          },
          stock_released_qop: stockRelease.released ? stockRelease.qop : 0,
        },
        nowIso,
      }),
    );
  });

  if (pushPayload) await sendCustomerPush(pushPayload);

  return {
    order_id: orderId,
    status,
    updated_at: nowIso,
  };
});

exports.updateSupportStatus = onCall({ region }, async (request) => {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Only admins can update support.');
  }

  const ticketId =
    typeof request.data?.ticket_id === 'string' ? request.data.ticket_id.trim() : '';
  if (!ticketId) {
    throw new HttpsError('invalid-argument', 'Ticket id is required.');
  }

  let normalized;
  try {
    normalized = normalizeSupportUpdate(request.data || {});
  } catch (error) {
    throw new HttpsError('invalid-argument', 'Support status information is invalid.');
  }

  const ticketRef = db.collection('support_requests').doc(ticketId);
  const snap = await ticketRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Support request is not available.');
  }

  const nowIso = new Date().toISOString();
  const update = {
    status: normalized.status,
    updated_at: nowIso,
  };
  if (normalized.reply) {
    update.reply = normalized.reply;
    update.replied_at = nowIso;
  }
  if (normalized.internalNote) {
    update.internal_note = normalized.internalNote;
  }
  if (normalized.status === 'resolved' || normalized.status === 'closed') {
    update.resolved_at = nowIso;
  }

  const batch = db.batch();
  batch.update(ticketRef, update);
  let pushPayload = null;
  const ticket = snap.data();
  if (ticket.customer_id) {
    pushPayload = {
      customerId: ticket.customer_id,
      type: 'support_status',
      title: 'Support request updated',
      message:
        normalized.reply || `Your support request is now ${normalized.status}.`,
      entityId: ticketId,
      action: 'support',
    };
    batch.create(
      db.collection('customer_notifications').doc(),
      customerNotification({ ...pushPayload, nowIso }),
    );
  }
  batch.create(
    db.collection('erp_events').doc(),
    erpEvent({
      type: 'support.status_updated',
      entityType: 'support_request',
      entityId: ticketId,
      actor: 'admin',
      payload: {
        ticket_id: ticketId,
        status: normalized.status,
        has_reply: Boolean(normalized.reply),
      },
      nowIso,
    }),
  );
  await batch.commit();
  if (pushPayload) await sendCustomerPush(pushPayload);
  return {
    ticket_id: ticketId,
    status: normalized.status,
    updated_at: nowIso,
  };
});

exports.claimErpEvents = onCall({ region }, async (request) => {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Only admins can claim ERP events.');
  }

  let normalized;
  try {
    normalized = normalizeClaimRequest(request.data || {});
  } catch (error) {
    throw new HttpsError('invalid-argument', 'ERP event claim is invalid.');
  }

  const nowIso = new Date().toISOString();
  const leaseUntil = new Date(
    Date.now() + normalized.leaseSeconds * 1000,
  ).toISOString();
  const claimed = [];

  await db.runTransaction(async (tx) => {
    const docs = await claimableErpEventDocs(tx, {
      limit: normalized.limit,
      nowIso,
    });
    docs.forEach((doc) => {
      const data = doc.data();
      const attempts = Number(data.attempts || 0) + 1;
      const leaseToken = randomUUID();
      tx.update(doc.ref, {
        status: 'processing',
        attempts,
        lease_owner: normalized.worker,
        lease_token: leaseToken,
        lease_until: leaseUntil,
        claimed_at: nowIso,
        updated_at: nowIso,
      });
      claimed.push({
        ...erpEventReceipt(doc),
        attempts,
        lease_token: leaseToken,
        lease_until: leaseUntil,
      });
    });
  });

  return {
    events: claimed,
    claimed: claimed.length,
    lease_until: leaseUntil,
  };
});

exports.ackErpEvent = onCall({ region }, async (request) => {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Only admins can acknowledge ERP events.');
  }

  let normalized;
  try {
    normalized = normalizeAckRequest(request.data || {});
  } catch (error) {
    throw new HttpsError('invalid-argument', 'ERP event acknowledgement is invalid.');
  }

  const nowIso = new Date().toISOString();
  const eventRef = db.collection('erp_events').doc(normalized.eventId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'ERP event is not available.');
    }
    const event = snap.data();
    if (event.status === 'processed') {
      throw new HttpsError('failed-precondition', 'ERP event is already processed.');
    }
    if (event.status !== 'processing') {
      throw new HttpsError(
        'failed-precondition',
        'ERP event does not have an active processing lease.',
      );
    }
    if (
      event.lease_owner !== normalized.worker ||
      event.lease_token !== normalized.leaseToken
    ) {
      throw new HttpsError(
        'failed-precondition',
        'ERP event lease belongs to another worker.',
      );
    }
    if (!event.lease_until || event.lease_until <= nowIso) {
      throw new HttpsError(
        'failed-precondition',
        'ERP event lease has expired.',
      );
    }
    const update = {
      status: normalized.status,
      ack_worker: normalized.worker,
      ack_lease_token: normalized.leaseToken,
      lease_owner: FieldValue.delete(),
      lease_token: FieldValue.delete(),
      lease_until: FieldValue.delete(),
      updated_at: nowIso,
    };
    if (normalized.status === 'processed') {
      update.processed_at = nowIso;
      if (normalized.externalId) update.external_id = normalized.externalId;
    } else {
      update.failed_at = nowIso;
      update.last_error = normalized.error || 'ERP worker marked event failed.';
    }
    tx.update(eventRef, update);
  });

  return {
    event_id: normalized.eventId,
    status: normalized.status,
    updated_at: nowIso,
  };
});

exports.updateProductAvailability = onCall({ region }, async (request) => {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Only admins can update products.');
  }

  let normalized;
  try {
    normalized = normalizeProductUpdate(request.data || {});
  } catch (error) {
    throw new HttpsError('invalid-argument', 'Product update information is invalid.');
  }

  const productRef = await productRefFor(normalized);
  const nowIso = new Date().toISOString();
  const update = {
    ...normalized.update,
    updated_at: nowIso,
  };
  const batch = db.batch();
  batch.update(productRef, update);
  batch.create(
    db.collection('erp_events').doc(),
    erpEvent({
      type: 'product.updated',
      entityType: 'product',
      entityId: productRef.id,
      actor: 'admin',
      payload: {
        product_id: productRef.id,
        update: normalized.update,
      },
      nowIso,
    }),
  );
  await batch.commit();

  return {
    product_id: productRef.id,
    updated_at: nowIso,
    update: normalized.update,
  };
});
