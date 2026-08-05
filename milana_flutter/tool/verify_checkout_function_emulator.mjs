#!/usr/bin/env node
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const projectId = process.env.FIREBASE_PROJECT_ID || 'milana-local';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'asia-southeast1';
const paymentWebhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || 'local-payment-webhook-secret';
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const adminApp = getApps()[0] || initializeApp({ projectId });
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])),
      },
    };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFields(value.mapValue.fields || {});
  return undefined;
}

function fromFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function fields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
}

async function signUp(label) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${label}-${runId}@example.test`,
      password: 'strong-pass-2026',
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth signUp failed ${response.status}: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken, email: body.email };
}

async function signIn(email) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'strong-pass-2026',
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth signIn failed ${response.status}: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken, email: body.email };
}

async function signUpAdmin(label) {
  const user = await signUp(label);
  await adminAuth.setCustomUserClaims(user.uid, { admin: true });
  return signIn(user.email);
}

async function adminWriteProduct(product) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents:batchWrite`,
    {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: `projects/${projectId}/databases/(default)/documents/products/${encodeURIComponent(product.slug)}`,
              fields: fields(product),
            },
          },
        ],
      }),
    },
  );
  const body = await response.text();
  if (!response.ok) throw new Error(`Product write failed ${response.status}: ${body}`);
}

async function callPlaceOrder(token, payload, expectError = false) {
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/placeOrder`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await jsonResponse(response, 'placeOrder');
  if (expectError) {
    if (!body.error) {
      throw new Error(`placeOrder should have failed: ${JSON.stringify(body)}`);
    }
    return body.error;
  }
  if (!response.ok || body.error) {
    throw new Error(`placeOrder failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callCreateSupportTicket(token, payload) {
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/createSupportTicket`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await jsonResponse(response, 'createSupportTicket');
  if (!response.ok || body.error) {
    throw new Error(`createSupportTicket failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callUpdatePaymentStatus(token, payload, expectError = false) {
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/updatePaymentStatus`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await jsonResponse(response, 'updatePaymentStatus');
  if (expectError) {
    if (!body.error) {
      throw new Error(`updatePaymentStatus should have failed: ${JSON.stringify(body)}`);
    }
    return body.error;
  }
  if (!response.ok || body.error) {
    throw new Error(`updatePaymentStatus failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callSubmitPaymentProof(token, payload, expectError = false) {
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/submitPaymentProof`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await jsonResponse(response, 'submitPaymentProof');
  if (expectError) {
    if (!body.error) {
      throw new Error(`submitPaymentProof should have failed: ${JSON.stringify(body)}`);
    }
    return body.error;
  }
  if (!response.ok || body.error) {
    throw new Error(`submitPaymentProof failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callCancelOrder(token, payload, expectError = false) {
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/cancelOrder`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await jsonResponse(response, 'cancelOrder');
  if (expectError) {
    if (!body.error) {
      throw new Error(`cancelOrder should have failed: ${JSON.stringify(body)}`);
    }
    return body.error;
  }
  if (!response.ok || body.error) {
    throw new Error(`cancelOrder failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callUpdateOrderStatus(token, payload, expectError = false) {
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/updateOrderStatus`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await jsonResponse(response, 'updateOrderStatus');
  if (expectError) {
    if (!body.error) {
      throw new Error(`updateOrderStatus should have failed: ${JSON.stringify(body)}`);
    }
    return body.error;
  }
  if (!response.ok || body.error) {
    throw new Error(`updateOrderStatus failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callUpdateSupportStatus(token, payload, expectError = false) {
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/updateSupportStatus`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await jsonResponse(response, 'updateSupportStatus');
  if (expectError) {
    if (!body.error) {
      throw new Error(`updateSupportStatus should have failed: ${JSON.stringify(body)}`);
    }
    return body.error;
  }
  if (!response.ok || body.error) {
    throw new Error(`updateSupportStatus failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callUpdateProductAvailability(token, payload, expectError = false) {
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/updateProductAvailability`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await jsonResponse(response, 'updateProductAvailability');
  if (expectError) {
    if (!body.error) {
      throw new Error(`updateProductAvailability should have failed: ${JSON.stringify(body)}`);
    }
    return body.error;
  }
  if (!response.ok || body.error) {
    throw new Error(`updateProductAvailability failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callClaimErpEvents(token, payload, expectError = false) {
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/claimErpEvents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await jsonResponse(response, 'claimErpEvents');
  if (expectError) {
    if (!body.error) {
      throw new Error(`claimErpEvents should have failed: ${JSON.stringify(body)}`);
    }
    return body.error;
  }
  if (!response.ok || body.error) {
    throw new Error(`claimErpEvents failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callAckErpEvent(token, payload, expectError = false) {
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/ackErpEvent`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await jsonResponse(response, 'ackErpEvent');
  if (expectError) {
    if (!body.error) {
      throw new Error(`ackErpEvent should have failed: ${JSON.stringify(body)}`);
    }
    return body.error;
  }
  if (!response.ok || body.error) {
    throw new Error(`ackErpEvent failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callPaymentWebhook(payload, expectStatus = 200) {
  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', paymentWebhookSecret)
    .update(rawBody)
    .digest('hex');
  const response = await fetch(`http://${functionsHost}/${projectId}/${region}/paymentWebhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-milana-signature': `sha256=${signature}`,
    },
    body: rawBody,
  });
  const body = await jsonResponse(response, 'paymentWebhook');
  if (response.status !== expectStatus) {
    throw new Error(`paymentWebhook expected ${expectStatus}, got ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function jsonResponse(response, functionName) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${functionName} returned non-JSON response ${response.status}. ` +
        `Functions emulator may not have loaded callables. Body: ${text.slice(0, 500)}`,
    );
  }
}

async function readDoc(collection, id, token, expectedStatus = 200) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const text = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`Read ${collection}/${id} expected ${expectedStatus}, got ${response.status}: ${text}`);
  }
  if (expectedStatus !== 200) return null;
  return fromFields(JSON.parse(text).fields || {});
}

async function erpEventsFor(entityId) {
  const snap = await adminDb
    .collection('erp_events')
    .where('entity_id', '==', entityId)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function expectErpEvent(events, type) {
  if (!events.some((event) => event.type === type && event.status === 'pending')) {
    throw new Error(`Missing ERP event ${type}: ${JSON.stringify(events)}`);
  }
}

const customer = await signUp('checkout-owner');
const stranger = await signUp('checkout-stranger');
const adminUser = await signUpAdmin('checkout-admin');
const product = {
  id: `checkout-product-${runId}`,
  slug: `checkout-product-${runId}`,
  name: 'Checkout Function Test',
  model_no: 'TEST-1',
  variant: 'A',
  gender: 'women',
  category: 'homewear',
  price: 4.5,
  sizes: ['44', '46', '48', '50', '52', '54'],
  images: ['/uploads/test-product.jpg'],
  active: true,
};

await adminWriteProduct(product);
const customerProductUpdateError = await callUpdateProductAvailability(
  customer.token,
  { slug: product.slug, price: 4.75, available_qop: 7 },
  true,
);
if (customerProductUpdateError.status !== 'PERMISSION_DENIED') {
  throw new Error(`Unexpected product update error: ${JSON.stringify(customerProductUpdateError)}`);
}
const productUpdate = await callUpdateProductAvailability(adminUser.token, {
  slug: product.slug,
  price: 4.75,
  available_qop: 7,
  sizes: ['44', '46', '48', '50', '52', '54'],
});
if (productUpdate.update?.price !== 4.75 || productUpdate.update?.available_qop !== 7) {
  throw new Error(`Unexpected product update receipt: ${JSON.stringify(productUpdate)}`);
}
const updatedProduct = await readDoc('products', product.slug, customer.token);
if (updatedProduct.price !== 4.75 || updatedProduct.available_qop !== 7) {
  throw new Error(`Product update mismatch: ${JSON.stringify(updatedProduct)}`);
}
expectErpEvent(await erpEventsFor(product.slug), 'product.updated');
await callUpdateProductAvailability(adminUser.token, {
  slug: product.slug,
  price: 4.5,
  available_qop: 7,
});
const checkoutPayload = {
  customer: {
    name: 'Function Buyer',
    phone: '+998 90 123 45 67',
    email: customer.email,
    city: 'Andijon',
    address: 'Qoratut 605',
    comment: 'Function emulator checkout',
  },
  payment_method: 'click',
  client_order_id: `co_${runId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
  items: [{ product_id: product.id, slug: product.slug, qty: 2 }],
  lang: 'uz',
};
const receipt = await callPlaceOrder(customer.token, checkoutPayload);
const duplicateReceipt = await callPlaceOrder(customer.token, checkoutPayload);

if (!receipt.order_id || !receipt.number || receipt.total !== 540 || receipt.payment_status !== 'pending') {
  throw new Error(`Unexpected receipt: ${JSON.stringify(receipt)}`);
}
if (
  duplicateReceipt.order_id !== receipt.order_id ||
  duplicateReceipt.number !== receipt.number ||
  duplicateReceipt.payment_reference !== receipt.payment_reference
) {
  throw new Error(`Checkout idempotency failed: ${JSON.stringify({ receipt, duplicateReceipt })}`);
}
if (!receipt.payment_reference || !receipt.payment_expires_at) {
  throw new Error(`Missing payment reference metadata: ${JSON.stringify(receipt)}`);
}
const orderCreatedEvents = await erpEventsFor(receipt.order_id);
expectErpEvent(orderCreatedEvents, 'order.created');
await readDoc('erp_events', orderCreatedEvents[0].id, customer.token, 403);
const reservedProduct = await readDoc('products', product.slug, customer.token);
if (reservedProduct.available_qop !== 5) {
  throw new Error(`Product stock reservation mismatch: ${JSON.stringify(reservedProduct)}`);
}
const stockError = await callPlaceOrder(
  customer.token,
  {
    ...checkoutPayload,
    client_order_id: `co_stock_${runId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    items: [{ product_id: product.id, slug: product.slug, qty: 6 }],
  },
  true,
);
if (stockError.status !== 'FAILED_PRECONDITION') {
  throw new Error(`Unexpected stock error: ${JSON.stringify(stockError)}`);
}
const productAfterFailedStock = await readDoc('products', product.slug, customer.token);
if (productAfterFailedStock.available_qop !== 5) {
  throw new Error(`Failed stock reservation changed product: ${JSON.stringify(productAfterFailedStock)}`);
}

const paymentCancelReceipt = await callPlaceOrder(customer.token, {
  ...checkoutPayload,
  client_order_id: `co_cancel_payment_${runId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
  items: [{ product_id: product.id, slug: product.slug, qty: 1 }],
});
const productAfterPaymentCancelReservation = await readDoc('products', product.slug, customer.token);
if (productAfterPaymentCancelReservation.available_qop !== 4) {
  throw new Error(`Payment-cancel reservation mismatch: ${JSON.stringify(productAfterPaymentCancelReservation)}`);
}
await callUpdatePaymentStatus(adminUser.token, {
  order_id: paymentCancelReceipt.order_id,
  status: 'cancelled',
  note: 'Cancelled before fulfillment.',
});
const productAfterPaymentCancel = await readDoc('products', product.slug, customer.token);
if (productAfterPaymentCancel.available_qop !== 5) {
  throw new Error(`Payment-cancel stock release mismatch: ${JSON.stringify(productAfterPaymentCancel)}`);
}
const paymentCancelledOrder = await readDoc('orders', paymentCancelReceipt.order_id, customer.token);
if (
  !paymentCancelledOrder.stock_released_at ||
  !paymentCancelledOrder.activity?.some((entry) => entry.type === 'stock_released')
) {
  throw new Error(`Payment-cancel stock activity missing: ${JSON.stringify(paymentCancelledOrder)}`);
}
const paymentCancelEvents = await erpEventsFor(paymentCancelReceipt.order_id);
expectErpEvent(paymentCancelEvents, 'order.created');
expectErpEvent(paymentCancelEvents, 'payment.status_updated');
await callUpdatePaymentStatus(adminUser.token, {
  order_id: paymentCancelReceipt.order_id,
  status: 'cancelled',
  note: 'Repeated cancellation should not release again.',
});
const productAfterDuplicatePaymentCancel = await readDoc('products', product.slug, customer.token);
if (productAfterDuplicatePaymentCancel.available_qop !== 5) {
  throw new Error(`Duplicate payment-cancel released stock twice: ${JSON.stringify(productAfterDuplicatePaymentCancel)}`);
}

const orderCancelReceipt = await callPlaceOrder(customer.token, {
  ...checkoutPayload,
  client_order_id: `co_cancel_order_${runId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
  items: [{ product_id: product.id, slug: product.slug, qty: 1 }],
});
const productAfterOrderCancelReservation = await readDoc('products', product.slug, customer.token);
if (productAfterOrderCancelReservation.available_qop !== 4) {
  throw new Error(`Order-cancel reservation mismatch: ${JSON.stringify(productAfterOrderCancelReservation)}`);
}
await callUpdateOrderStatus(adminUser.token, {
  order_id: orderCancelReceipt.order_id,
  status: 'cancelled',
  tracking: { note: 'Cancelled before packing.' },
});
const productAfterOrderCancel = await readDoc('products', product.slug, customer.token);
if (productAfterOrderCancel.available_qop !== 5) {
  throw new Error(`Order-cancel stock release mismatch: ${JSON.stringify(productAfterOrderCancel)}`);
}
const orderCancelledOrder = await readDoc('orders', orderCancelReceipt.order_id, customer.token);
if (
  !orderCancelledOrder.stock_released_at ||
  !orderCancelledOrder.activity?.some((entry) => entry.type === 'stock_released')
) {
  throw new Error(`Order-cancel stock activity missing: ${JSON.stringify(orderCancelledOrder)}`);
}
const orderCancelEvents = await erpEventsFor(orderCancelReceipt.order_id);
expectErpEvent(orderCancelEvents, 'order.created');
expectErpEvent(orderCancelEvents, 'order.status_updated');
await callUpdateOrderStatus(adminUser.token, {
  order_id: orderCancelReceipt.order_id,
  status: 'cancelled',
  tracking: { note: 'Repeated cancellation should not release again.' },
});
const productAfterDuplicateOrderCancel = await readDoc('products', product.slug, customer.token);
if (productAfterDuplicateOrderCancel.available_qop !== 5) {
  throw new Error(`Duplicate order-cancel released stock twice: ${JSON.stringify(productAfterDuplicateOrderCancel)}`);
}

const customerCancelReceipt = await callPlaceOrder(customer.token, {
  ...checkoutPayload,
  client_order_id: `co_customer_cancel_${runId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
  items: [{ product_id: product.id, slug: product.slug, qty: 1 }],
});
const productAfterCustomerCancelReservation = await readDoc('products', product.slug, customer.token);
if (productAfterCustomerCancelReservation.available_qop !== 4) {
  throw new Error(`Customer-cancel reservation mismatch: ${JSON.stringify(productAfterCustomerCancelReservation)}`);
}
const strangerCancelError = await callCancelOrder(
  stranger.token,
  { order_id: customerCancelReceipt.order_id, reason: 'Not my order.' },
  true,
);
if (strangerCancelError.status !== 'PERMISSION_DENIED') {
  throw new Error(`Unexpected stranger cancel error: ${JSON.stringify(strangerCancelError)}`);
}
const customerCancel = await callCancelOrder(customer.token, {
  order_id: customerCancelReceipt.order_id,
  reason: 'Wrong model selected.',
});
if (
  customerCancel.status !== 'cancelled' ||
  customerCancel.payment_status !== 'cancelled' ||
  customerCancel.stock_released_qop !== 1
) {
  throw new Error(`Unexpected customer cancel receipt: ${JSON.stringify(customerCancel)}`);
}
const productAfterCustomerCancel = await readDoc('products', product.slug, customer.token);
if (productAfterCustomerCancel.available_qop !== 5) {
  throw new Error(`Customer-cancel stock release mismatch: ${JSON.stringify(productAfterCustomerCancel)}`);
}
const customerCancelledOrder = await readDoc('orders', customerCancelReceipt.order_id, customer.token);
const customerCancelledPayment = await adminDb
  .collection('payments')
  .doc(customerCancelReceipt.order_id)
  .get();
if (
  customerCancelledOrder.status !== 'cancelled' ||
  customerCancelledOrder.payment?.status !== 'cancelled' ||
  customerCancelledOrder.cancellation?.reason !== 'Wrong model selected.' ||
  customerCancelledPayment.data()?.status !== 'cancelled'
) {
  throw new Error(`Customer-cancel state mismatch: ${JSON.stringify({
    order: customerCancelledOrder,
    payment: customerCancelledPayment.data(),
  })}`);
}
if (
  !customerCancelledOrder.activity?.some((entry) => entry.type === 'order_cancelled') ||
  !customerCancelledOrder.activity?.some((entry) => entry.type === 'stock_released')
) {
  throw new Error(`Customer-cancel activity missing: ${JSON.stringify(customerCancelledOrder.activity)}`);
}
const customerCancelEvents = await erpEventsFor(customerCancelReceipt.order_id);
expectErpEvent(customerCancelEvents, 'order.created');
expectErpEvent(customerCancelEvents, 'order.cancelled');
const duplicateCustomerCancelError = await callCancelOrder(
  customer.token,
  { order_id: customerCancelReceipt.order_id, reason: 'Already cancelled.' },
  true,
);
if (duplicateCustomerCancelError.status !== 'FAILED_PRECONDITION') {
  throw new Error(`Unexpected duplicate customer cancel error: ${JSON.stringify(duplicateCustomerCancelError)}`);
}

const order = await readDoc('orders', receipt.order_id, customer.token);
await readDoc('orders', receipt.order_id, stranger.token, 403);
await readDoc('payments', receipt.order_id, customer.token, 403);

if (order.customer_id !== customer.uid) throw new Error(`Order owner mismatch: ${order.customer_id}`);
if (order.total !== 540) throw new Error(`Order total mismatch: ${order.total}`);
if (order.client_order_id !== checkoutPayload.client_order_id || !order.checkout_key) {
  throw new Error(`Order idempotency metadata mismatch: ${JSON.stringify(order)}`);
}
if (order.payment?.provider !== 'click') throw new Error(`Payment provider mismatch: ${JSON.stringify(order.payment)}`);
if (order.payment?.label !== 'Click' || !order.payment?.instructions?.includes('Click')) {
  throw new Error(`Payment details mismatch: ${JSON.stringify(order.payment)}`);
}
if (order.payment?.reference !== receipt.payment_reference || order.payment?.expires_at !== receipt.payment_expires_at) {
  throw new Error(`Payment reference mismatch: ${JSON.stringify(order.payment)}`);
}
if (!Array.isArray(order.items) || order.items[0]?.price !== 270 || order.items[0]?.line_total !== 540) {
  throw new Error(`Order item pricing mismatch: ${JSON.stringify(order.items)}`);
}
if (!Array.isArray(order.items[0].size_mix) || order.items[0].size_mix.length !== 6) {
  throw new Error(`Size mix mismatch: ${JSON.stringify(order.items[0].size_mix)}`);
}
if (!Array.isArray(order.activity) || order.activity[0]?.type !== 'order_created') {
  throw new Error(`Initial order activity mismatch: ${JSON.stringify(order.activity)}`);
}

const customerPaymentUpdateError = await callUpdatePaymentStatus(
  customer.token,
  { order_id: receipt.order_id, status: 'paid' },
  true,
);
if (customerPaymentUpdateError.status !== 'PERMISSION_DENIED') {
  throw new Error(`Unexpected payment update error: ${JSON.stringify(customerPaymentUpdateError)}`);
}
const strangerPaymentProofError = await callSubmitPaymentProof(
  stranger.token,
  {
    order_id: receipt.order_id,
    method: 'click',
    amount: receipt.total,
    reference: `STRANGER-${runId}`,
  },
  true,
);
if (strangerPaymentProofError.status !== 'PERMISSION_DENIED') {
  throw new Error(`Unexpected stranger payment proof error: ${JSON.stringify(strangerPaymentProofError)}`);
}
const paymentProof = await callSubmitPaymentProof(customer.token, {
  order_id: receipt.order_id,
  method: 'click',
  amount: receipt.total,
  reference: `CLICK-${runId}`,
  note: 'Paid in callable emulator verification.',
});
if (paymentProof.payment_status !== 'submitted') {
  throw new Error(`Unexpected payment proof receipt: ${JSON.stringify(paymentProof)}`);
}
const submittedCancelError = await callCancelOrder(
  customer.token,
  { order_id: receipt.order_id, reason: 'Cancel after proof.' },
  true,
);
if (submittedCancelError.status !== 'FAILED_PRECONDITION') {
  throw new Error(`Unexpected submitted-payment cancel error: ${JSON.stringify(submittedCancelError)}`);
}
const submittedOrder = await readDoc('orders', receipt.order_id, customer.token);
if (
  submittedOrder.payment?.status !== 'submitted' ||
  submittedOrder.payment?.submission?.reference !== `CLICK-${runId}` ||
  submittedOrder.payment?.submission?.amount !== receipt.total
) {
  throw new Error(`Submitted payment mismatch: ${JSON.stringify(submittedOrder.payment)}`);
}
if (!submittedOrder.activity?.some((entry) => entry.type === 'payment_submitted')) {
  throw new Error(`Payment submission activity missing: ${JSON.stringify(submittedOrder.activity)}`);
}
expectErpEvent(await erpEventsFor(receipt.order_id), 'payment.proof_submitted');
const paymentUpdate = await callUpdatePaymentStatus(adminUser.token, {
  order_id: receipt.order_id,
  status: 'paid',
  note: 'Paid in function emulator verification',
});
if (paymentUpdate.payment_status !== 'paid') {
  throw new Error(`Unexpected payment update receipt: ${JSON.stringify(paymentUpdate)}`);
}
const paidOrder = await readDoc('orders', receipt.order_id, customer.token);
if (paidOrder.payment?.status !== 'paid' || paidOrder.status !== 'confirmed') {
  throw new Error(`Paid order mismatch: ${JSON.stringify(paidOrder)}`);
}
if (!paidOrder.activity?.some((entry) => entry.type === 'payment_status' && entry.title === 'To‘lov tasdiqlandi')) {
  throw new Error(`Payment status activity missing: ${JSON.stringify(paidOrder.activity)}`);
}
expectErpEvent(await erpEventsFor(receipt.order_id), 'payment.status_updated');

const webhookReceipt = await callPlaceOrder(customer.token, {
  ...checkoutPayload,
  payment_method: 'payme',
  client_order_id: `co_webhook_${runId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
  items: [{ product_id: product.id, slug: product.slug, qty: 1 }],
});
const webhookPayload = {
  provider: 'payme',
  event_id: `evt-${runId}`,
  reference: webhookReceipt.payment_reference,
  status: 'success',
  amount: webhookReceipt.total,
  currency: 'USD',
  provider_payment_id: `payme-${runId}`,
  note: 'Provider webhook confirmed payment.',
};
const webhookUpdate = await callPaymentWebhook(webhookPayload);
if (
  webhookUpdate.ok !== true ||
  webhookUpdate.payment_status !== 'paid' ||
  webhookUpdate.duplicate !== false
) {
  throw new Error(`Payment webhook receipt mismatch: ${JSON.stringify(webhookUpdate)}`);
}
const webhookDuplicate = await callPaymentWebhook(webhookPayload);
if (webhookDuplicate.ok !== true || webhookDuplicate.duplicate !== true) {
  throw new Error(`Payment webhook duplicate mismatch: ${JSON.stringify(webhookDuplicate)}`);
}
const webhookOrder = await readDoc('orders', webhookReceipt.order_id, customer.token);
if (webhookOrder.payment?.status !== 'paid' || webhookOrder.status !== 'confirmed') {
  throw new Error(`Webhook-paid order mismatch: ${JSON.stringify(webhookOrder)}`);
}
if (
  !webhookOrder.activity?.some(
    (entry) => entry.type === 'payment_status' && entry.actor === 'payment_webhook',
  )
) {
  throw new Error(`Webhook payment activity missing: ${JSON.stringify(webhookOrder.activity)}`);
}
const webhookEvents = await erpEventsFor(webhookReceipt.order_id);
expectErpEvent(webhookEvents, 'order.created');
expectErpEvent(webhookEvents, 'payment.status_updated');
const webhookEventId = crypto
  .createHash('sha256')
  .update(`payme:${webhookPayload.event_id}`)
  .digest('hex');
await readDoc('payment_webhook_events', webhookEventId, customer.token, 403);

const customerOrderUpdateError = await callUpdateOrderStatus(
  customer.token,
  { order_id: receipt.order_id, status: 'shipped' },
  true,
);
if (customerOrderUpdateError.status !== 'PERMISSION_DENIED') {
  throw new Error(`Unexpected order update error: ${JSON.stringify(customerOrderUpdateError)}`);
}
const orderUpdate = await callUpdateOrderStatus(adminUser.token, {
  order_id: receipt.order_id,
  status: 'shipped',
  tracking: {
    carrier: 'Cargo',
    tracking_number: `CRG-${runId}`,
    tracking_url: `https://cargo.example/${runId}`,
    note: 'Function emulator shipment',
  },
});
if (orderUpdate.status !== 'shipped') {
  throw new Error(`Unexpected order update receipt: ${JSON.stringify(orderUpdate)}`);
}
const shippedOrder = await readDoc('orders', receipt.order_id, customer.token);
if (
  shippedOrder.status !== 'shipped' ||
  shippedOrder.delivery?.carrier !== 'Cargo' ||
  shippedOrder.delivery?.tracking_number !== `CRG-${runId}` ||
  !shippedOrder.shipped_at
) {
  throw new Error(`Shipped order mismatch: ${JSON.stringify(shippedOrder)}`);
}
if (!shippedOrder.activity?.some((entry) => entry.type === 'order_status' && entry.title === 'Buyurtma yuborildi')) {
  throw new Error(`Order status activity missing: ${JSON.stringify(shippedOrder.activity)}`);
}
expectErpEvent(await erpEventsFor(receipt.order_id), 'order.status_updated');

const supportReceipt = await callCreateSupportTicket(customer.token, {
  name: 'Function Buyer',
  phone: '+998 90 123 45 67',
  email: customer.email,
  topic: 'payment',
  message: 'Please confirm payment details for two qop.',
  lang: 'uz',
});

if (!supportReceipt.ticket_id || !supportReceipt.number || supportReceipt.status !== 'new') {
  throw new Error(`Unexpected support receipt: ${JSON.stringify(supportReceipt)}`);
}

const support = await readDoc('support_requests', supportReceipt.ticket_id, customer.token);
await readDoc('support_requests', supportReceipt.ticket_id, stranger.token, 403);

if (support.customer_id !== customer.uid) throw new Error(`Support owner mismatch: ${support.customer_id}`);
if (support.topic !== 'payment') throw new Error(`Support topic mismatch: ${support.topic}`);
const customerSupportUpdateError = await callUpdateSupportStatus(
  customer.token,
  { ticket_id: supportReceipt.ticket_id, status: 'resolved', reply: 'Customer cannot resolve this.' },
  true,
);
if (customerSupportUpdateError.status !== 'PERMISSION_DENIED') {
  throw new Error(`Unexpected support update error: ${JSON.stringify(customerSupportUpdateError)}`);
}
const supportUpdate = await callUpdateSupportStatus(adminUser.token, {
  ticket_id: supportReceipt.ticket_id,
  status: 'resolved',
  reply: 'Menejer to‘lov ma’lumotlarini yuboradi.',
  internal_note: 'Resolved in function emulator verification.',
});
if (supportUpdate.status !== 'resolved') {
  throw new Error(`Unexpected support update receipt: ${JSON.stringify(supportUpdate)}`);
}
const resolvedSupport = await readDoc('support_requests', supportReceipt.ticket_id, customer.token);
if (
  resolvedSupport.status !== 'resolved' ||
  resolvedSupport.reply !== 'Menejer to‘lov ma’lumotlarini yuboradi.' ||
  !resolvedSupport.replied_at ||
  !resolvedSupport.resolved_at
) {
  throw new Error(`Resolved support mismatch: ${JSON.stringify(resolvedSupport)}`);
}
const supportEvents = await erpEventsFor(supportReceipt.ticket_id);
expectErpEvent(supportEvents, 'support.created');
expectErpEvent(supportEvents, 'support.status_updated');

const customerClaimError = await callClaimErpEvents(
  customer.token,
  { limit: 1, worker: 'customer' },
  true,
);
if (customerClaimError.status !== 'PERMISSION_DENIED') {
  throw new Error(`Unexpected customer ERP claim error: ${JSON.stringify(customerClaimError)}`);
}
const claimed = await callClaimErpEvents(adminUser.token, {
  limit: 2,
  lease_seconds: 120,
  worker: 'milana-erp-test',
});
if (claimed.claimed !== 2 || claimed.events.length !== 2 || !claimed.events[0].lease_until) {
  throw new Error(`ERP claim mismatch: ${JSON.stringify(claimed)}`);
}
const claimedDoc = await adminDb.collection('erp_events').doc(claimed.events[0].id).get();
if (
  claimedDoc.data()?.status !== 'processing' ||
  claimedDoc.data()?.lease_owner !== 'milana-erp-test'
) {
  throw new Error(`ERP claimed doc mismatch: ${JSON.stringify(claimedDoc.data())}`);
}
const ackProcessed = await callAckErpEvent(adminUser.token, {
  event_id: claimed.events[0].id,
  status: 'processed',
  worker: 'milana-erp-test',
  external_id: `ERP-${runId}`,
});
if (ackProcessed.status !== 'processed') {
  throw new Error(`ERP processed ack mismatch: ${JSON.stringify(ackProcessed)}`);
}
const processedDoc = await adminDb.collection('erp_events').doc(claimed.events[0].id).get();
if (
  processedDoc.data()?.status !== 'processed' ||
  processedDoc.data()?.external_id !== `ERP-${runId}`
) {
  throw new Error(`ERP processed doc mismatch: ${JSON.stringify(processedDoc.data())}`);
}
const ackFailed = await callAckErpEvent(adminUser.token, {
  event_id: claimed.events[1].id,
  status: 'failed',
  worker: 'milana-erp-test',
  error: 'ERP test failure',
});
if (ackFailed.status !== 'failed') {
  throw new Error(`ERP failed ack mismatch: ${JSON.stringify(ackFailed)}`);
}
const failedDoc = await adminDb.collection('erp_events').doc(claimed.events[1].id).get();
if (
  failedDoc.data()?.status !== 'failed' ||
  failedDoc.data()?.last_error !== 'ERP test failure'
) {
  throw new Error(`ERP failed doc mismatch: ${JSON.stringify(failedDoc.data())}`);
}
const expiredLeaseRef = adminDb.collection('erp_events').doc(`expired-lease-${runId}`);
const activeLeaseRef = adminDb.collection('erp_events').doc(`active-lease-${runId}`);
await expiredLeaseRef.set({
  type: 'test.expired_lease',
  entity_type: 'test',
  entity_id: `expired-${runId}`,
  actor: 'test',
  payload: { run_id: runId },
  status: 'processing',
  attempts: 1,
  lease_owner: 'stalled-worker',
  lease_until: '2000-01-01T00:00:00.000Z',
  created_at: '2000-01-01T00:00:00.000Z',
  updated_at: '2000-01-01T00:00:00.000Z',
});
await activeLeaseRef.set({
  type: 'test.active_lease',
  entity_type: 'test',
  entity_id: `active-${runId}`,
  actor: 'test',
  payload: { run_id: runId },
  status: 'processing',
  attempts: 1,
  lease_owner: 'active-worker',
  lease_until: '2999-01-01T00:00:00.000Z',
  created_at: '2000-01-01T00:00:01.000Z',
  updated_at: '2000-01-01T00:00:01.000Z',
});
const reclaimed = await callClaimErpEvents(adminUser.token, {
  limit: 100,
  lease_seconds: 120,
  worker: 'milana-erp-reclaimer',
});
const reclaimedIds = new Set(reclaimed.events.map((event) => event.id));
if (!reclaimedIds.has(expiredLeaseRef.id)) {
  throw new Error(`Expired ERP lease was not reclaimed: ${JSON.stringify(reclaimed)}`);
}
if (reclaimedIds.has(activeLeaseRef.id)) {
  throw new Error(`Active ERP lease was reclaimed too early: ${JSON.stringify(reclaimed)}`);
}
const reclaimedDoc = await expiredLeaseRef.get();
if (
  reclaimedDoc.data()?.status !== 'processing' ||
  reclaimedDoc.data()?.lease_owner !== 'milana-erp-reclaimer' ||
  reclaimedDoc.data()?.attempts !== 2
) {
  throw new Error(`Reclaimed ERP lease mismatch: ${JSON.stringify(reclaimedDoc.data())}`);
}
const duplicateAckError = await callAckErpEvent(
  adminUser.token,
  { event_id: claimed.events[0].id, status: 'processed' },
  true,
);
if (duplicateAckError.status !== 'FAILED_PRECONDITION') {
  throw new Error(`Unexpected duplicate ERP ack error: ${JSON.stringify(duplicateAckError)}`);
}

console.log(JSON.stringify({
  ok: true,
  orderId: receipt.order_id,
  orderNumber: receipt.number,
  supportId: supportReceipt.ticket_id,
  supportNumber: supportReceipt.number,
  customerId: customer.uid,
  total: receipt.total,
  checks: [
    'callable_place_order_created_receipt',
    'customer_cannot_update_product_availability',
    'admin_can_update_product_availability',
    'erp_event_product_updated',
    'customer_can_read_updated_active_product',
    'duplicate_checkout_returns_original_receipt',
    'erp_event_order_created',
    'customer_cannot_read_erp_event',
    'checkout_decrements_available_qop_once',
    'checkout_rejects_over_available_qop',
    'payment_cancel_releases_reserved_qop_once',
    'order_cancel_releases_reserved_qop_once',
    'stranger_cannot_cancel_customer_order',
    'customer_can_cancel_unpaid_order',
    'customer_cancel_releases_reserved_qop_once',
    'erp_event_order_cancelled',
    'customer_cannot_cancel_after_payment_proof',
    'erp_event_stock_relevant_cancellations',
    'server_calculated_qop_total',
    'owner_can_read_created_order',
    'stranger_cannot_read_created_order',
    'customer_cannot_read_payment_doc',
    'size_mix_has_6_sizes_10_each',
    'order_activity_has_created_event',
    'customer_cannot_update_payment_status',
    'stranger_cannot_submit_payment_proof',
    'owner_can_submit_payment_proof',
    'owner_can_read_submitted_payment_on_order',
    'order_activity_has_payment_submission_event',
    'submitted_order_cannot_be_cancelled_by_customer',
    'erp_event_payment_proof_submitted',
    'admin_can_update_payment_status',
    'owner_can_read_updated_payment_status_on_order',
    'order_activity_has_payment_status_event',
    'erp_event_payment_status_updated',
    'signed_payment_webhook_marks_order_paid',
    'duplicate_payment_webhook_is_idempotent',
    'customer_cannot_read_payment_webhook_event',
    'customer_cannot_update_order_status',
    'admin_can_update_order_status',
    'owner_can_read_order_shipping_tracking',
    'order_activity_has_shipping_event',
    'erp_event_order_status_updated',
    'callable_support_created_ticket',
    'erp_event_support_created',
    'owner_can_read_created_support',
    'stranger_cannot_read_created_support',
    'customer_cannot_update_support_status',
    'admin_can_update_support_status',
    'owner_can_read_support_manager_reply',
    'erp_event_support_status_updated',
    'customer_cannot_claim_erp_events',
    'admin_can_claim_erp_events',
    'admin_can_ack_erp_event_processed',
    'admin_can_ack_erp_event_failed',
    'expired_erp_processing_lease_is_reclaimed',
    'active_erp_processing_lease_is_not_reclaimed',
    'processed_erp_event_cannot_be_acked_twice',
  ],
}, null, 2));
