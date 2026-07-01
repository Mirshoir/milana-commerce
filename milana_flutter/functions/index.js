'use strict';

const admin = require('firebase-admin');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
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

admin.initializeApp();

const db = admin.firestore();
const region = 'asia-southeast1';

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

exports.paymentWebhook = onRequest({ region }, async (req, res) => {
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
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || '';
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
});

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
      tx.update(doc.ref, {
        status: 'processing',
        attempts,
        lease_owner: normalized.worker,
        lease_until: leaseUntil,
        claimed_at: nowIso,
        updated_at: nowIso,
      });
      claimed.push({
        ...erpEventReceipt(doc),
        attempts,
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
    const update = {
      status: normalized.status,
      ack_worker: normalized.worker,
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
