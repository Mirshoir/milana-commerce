#!/usr/bin/env node
const projectId = process.env.FIREBASE_PROJECT_ID || 'milana-local';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

async function createDoc(collection, id, data, token, expectedStatus = 200) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${collection}?documentId=${encodeURIComponent(id)}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fields: fields(data) }),
    },
  );
  const body = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`Create ${collection}/${id} expected ${expectedStatus}, got ${response.status}: ${body}`);
  }
}

async function patchDoc(collection, id, data, token, expectedStatus = 200) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fields: fields(data) }),
    },
  );
  const body = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`Patch ${collection}/${id} expected ${expectedStatus}, got ${response.status}: ${body}`);
  }
}

async function adminWriteDoc(collection, id, data) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents:batchWrite`,
    {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: `projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,
              fields: fields(data),
            },
          },
        ],
      }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Admin write ${collection}/${id} failed ${response.status}: ${body}`);
  }
}

async function readDoc(collection, id, token, expectedStatus = 200) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const body = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`Read ${collection}/${id} expected ${expectedStatus}, got ${response.status}: ${body}`);
  }
}

async function queryCustomerDocs(collection, customerId, token, expectedStatus = 200) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'customer_id' },
              op: 'EQUAL',
              value: { stringValue: customerId },
            },
          },
          orderBy: [
            {
              field: { fieldPath: 'created_at' },
              direction: 'DESCENDING',
            },
          ],
          limit: 10,
        },
      }),
    },
  );
  const body = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`Query ${collection} expected ${expectedStatus}, got ${response.status}: ${body}`);
  }
  if (expectedStatus !== 200) return [];
  return JSON.parse(body)
    .map((row) => row.document?.name || '')
    .filter(Boolean);
}

function orderDoc(customer) {
  return {
    number: `MP-TEST-${runId}`,
    customer_id: customer.uid,
    customer: {
      name: 'Test Buyer',
      phone: '+998 90 123 45 67',
      email: customer.email,
      city: 'Andijon',
      address: 'Qoratut 605',
      comment: 'Emulator rules test',
    },
    items: [
      {
        id: 'emulator-product',
        slug: 'emulator-product',
        name: 'Rules Test Product',
        qty: 1,
        unit_price: 4.5,
        bag_size: 60,
        price: 270,
        image: '/uploads/catalog-01-staple-model-catalog-p005-c001.jpg',
        size_mix: ['44', '46', '48', '50', '52', '54'].map((size) => ({ size, qty: 10 })),
      },
    ],
    total: 270,
    status: 'new',
    lang: 'uz',
    payment: {
      method: 'manager',
      provider: 'manual',
      status: 'pending',
      amount: 270,
      currency: 'USD',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function customerDoc(customer) {
  return {
    email: customer.email,
    name: 'Test Buyer',
    phone: '+998 90 123 45 67',
    city: 'Andijon',
    address: 'Qoratut 605',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function cartItem(index = 1) {
  return {
    product_id: `cart-product-${runId}-${index}`,
    slug: `cart-product-${runId}-${index}`,
    name: `Cart Product ${index}`,
    gender: 'women',
    category: 'homewear',
    unit_price: 4.5,
    quantity: 1,
    sizes: ['44', '46', '48', '50', '52', '54'],
    images: ['/uploads/catalog-01-staple-model-catalog-p005-c001.jpg'],
    model_no: `CP-${index}`,
    variant: '',
    fabric: 'Cotton',
    description: '',
  };
}

function supportDoc(customer) {
  return {
    number: `MS-TEST-${runId}`,
    customer_id: customer.uid,
    name: 'Test Buyer',
    phone: '+998 90 123 45 67',
    email: customer.email,
    topic: 'payment',
    message: 'Please confirm payment details for one qop.',
    status: 'new',
    lang: 'uz',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function paymentDoc(customer, orderId) {
  return {
    order_id: orderId,
    order_number: `MP-TEST-${runId}`,
    customer_id: customer.uid,
    method: 'manager',
    provider: 'manual',
    status: 'pending',
    amount: 270,
    currency: 'USD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function paymentWebhookEventDoc(orderId) {
  return {
    provider: 'payme',
    event_id: `event-${runId}`,
    provider_payment_id: `provider-${runId}`,
    order_id: orderId,
    reference: `MPTEST${runId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`,
    status: 'paid',
    amount: 270,
    currency: 'USD',
    received_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
  };
}

const owner = await signUp('owner');
const stranger = await signUp('stranger');
const orderId = `order-${runId}`;
const supportId = `support-${runId}`;
const paymentId = `payment-${runId}`;
const paymentWebhookEventId = `payment-webhook-${runId}`;
const ownerProfile = customerDoc(owner);

await createDoc('customers', owner.uid, ownerProfile, owner.token);
await readDoc('customers', owner.uid, owner.token);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  saved_product_ids: [`product-a-${runId}`, `product-b-${runId}`],
}, owner.token);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  recent_product_ids: [`recent-a-${runId}`, `recent-b-${runId}`],
}, owner.token);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  cart_items: [cartItem(1), cartItem(2)],
}, owner.token);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  email: stranger.email,
}, owner.token, 403);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  status: 'admin',
}, owner.token, 403);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  unexpected_admin_field: true,
}, owner.token, 403);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  city: 'A'.repeat(81),
}, owner.token, 403);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  address: 'A'.repeat(201),
}, owner.token, 403);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  saved_product_ids: Array.from({ length: 501 }, (_, index) => `product-${index}`),
}, owner.token, 403);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  recent_product_ids: Array.from({ length: 101 }, (_, index) => `recent-${index}`),
}, owner.token, 403);
await patchDoc('customers', owner.uid, {
  ...ownerProfile,
  cart_items: Array.from({ length: 101 }, (_, index) => cartItem(index)),
}, owner.token, 403);
await readDoc('customers', owner.uid, stranger.token, 403);
await createDoc('customers', `bad-customer-${runId}`, customerDoc(owner), stranger.token, 403);

await createDoc('orders', `client-order-${runId}`, orderDoc(owner), owner.token, 403);
await adminWriteDoc('orders', orderId, orderDoc(owner));
await readDoc('orders', orderId, owner.token);
await readDoc('orders', orderId, stranger.token, 403);
const ownerOrderNames = await queryCustomerDocs('orders', owner.uid, owner.token);
if (!ownerOrderNames.some((name) => name.endsWith(`/orders/${orderId}`))) {
  throw new Error(`Owner order query did not include ${orderId}: ${JSON.stringify(ownerOrderNames)}`);
}
await queryCustomerDocs('orders', owner.uid, stranger.token, 403);

await createDoc('payments', `client-payment-${runId}`, paymentDoc(owner, orderId), owner.token, 403);
await adminWriteDoc('payments', paymentId, paymentDoc(owner, orderId));
await readDoc('payments', paymentId, owner.token, 403);
await createDoc('payments', `bad-payment-${runId}`, paymentDoc(owner, orderId), stranger.token, 403);

await createDoc(
  'payment_webhook_events',
  `client-webhook-${runId}`,
  paymentWebhookEventDoc(orderId),
  owner.token,
  403,
);
await adminWriteDoc('payment_webhook_events', paymentWebhookEventId, paymentWebhookEventDoc(orderId));
await readDoc('payment_webhook_events', paymentWebhookEventId, owner.token, 403);

await createDoc('support_requests', `client-support-${runId}`, supportDoc(owner), owner.token, 403);
await adminWriteDoc('support_requests', supportId, supportDoc(owner));
await readDoc('support_requests', supportId, owner.token);
await readDoc('support_requests', supportId, stranger.token, 403);
const ownerSupportNames = await queryCustomerDocs('support_requests', owner.uid, owner.token);
if (!ownerSupportNames.some((name) => name.endsWith(`/support_requests/${supportId}`))) {
  throw new Error(`Owner support query did not include ${supportId}: ${JSON.stringify(ownerSupportNames)}`);
}
await queryCustomerDocs('support_requests', owner.uid, stranger.token, 403);

await createDoc('orders', `bad-order-${runId}`, orderDoc(owner), stranger.token, 403);

console.log(JSON.stringify({
  ok: true,
  owner: owner.uid,
  stranger: stranger.uid,
  orderId,
  supportId,
  paymentId,
  paymentWebhookEventId,
  checks: [
    'owner_can_create_customer_profile',
    'owner_can_read_customer_profile',
    'owner_can_update_saved_products',
    'owner_can_update_recent_products',
    'owner_can_update_profile_cart',
    'owner_cannot_save_city_over_80_chars',
    'owner_cannot_save_address_over_200_chars',
    'owner_cannot_save_more_than_500_products',
    'owner_cannot_save_more_than_100_recent_products',
    'owner_cannot_save_more_than_100_cart_items',
    'stranger_cannot_read_customer_profile',
    'stranger_cannot_create_customer_profile_for_owner',
    'backend_created_order_can_be_read_by_owner',
    'owner_can_read_order',
    'owner_can_query_latest_orders',
    'stranger_cannot_query_owner_orders',
    'owner_cannot_create_order_directly',
    'stranger_cannot_read_order',
    'owner_cannot_create_payment_directly',
    'owner_cannot_read_payment',
    'stranger_cannot_create_payment_for_owner',
    'owner_cannot_create_payment_webhook_event',
    'owner_cannot_read_payment_webhook_event',
    'owner_cannot_create_support_directly',
    'backend_created_support_can_be_read_by_owner',
    'owner_can_read_support',
    'owner_can_query_latest_support',
    'stranger_cannot_query_owner_support',
    'stranger_cannot_read_support',
  ],
}, null, 2));
