'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  forwardWebsiteRequest,
  stripWebsiteSessionTokens,
  validatedWebsiteSession,
} = require('../website_account');

const websiteToken =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function firebaseRequest({
  uid = 'firebase-buyer-1',
  email = 'Buyer@Example.com ',
  emailVerified = true,
  data = { website_session_token: websiteToken },
} = {}) {
  return {
    auth: {
      uid,
      token: { email, email_verified: emailVerified },
    },
    data,
  };
}

test('binds an introspected website session to the verified Firebase email', async () => {
  const calls = [];
  const token = await validatedWebsiteSession(firebaseRequest(), {
    requestApi: async (request) => {
      calls.push(request);
      return {
        ok: true,
        status: 200,
        body: {
          customer: { id: 17, email: 'buyer@example.COM' },
        },
      };
    },
  });

  assert.equal(token, websiteToken);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/auth/me');
  assert.equal(calls[0].headers.Authorization, `Bearer ${websiteToken}`);
});

test('rejects unverified Firebase emails before website introspection', async () => {
  let called = false;
  await assert.rejects(
    () =>
      validatedWebsiteSession(firebaseRequest({ emailVerified: false }), {
        requestApi: async () => {
          called = true;
          return { ok: true, status: 200, body: {} };
        },
      }),
    (error) => error.code === 'unauthenticated',
  );
  assert.equal(called, false);
});

test('rejects a website session whose normalized email belongs to another account', async () => {
  await assert.rejects(
    () =>
      validatedWebsiteSession(firebaseRequest(), {
        requestApi: async () => ({
          ok: true,
          status: 200,
          body: { customer: { id: 91, email: 'other@example.com' } },
        }),
      }),
    (error) => error.code === 'permission-denied',
  );
});

test('allows an optional guest request only when no website token is supplied', async () => {
  const token = await validatedWebsiteSession(
    { data: { source: 'flutter' } },
    {
      optional: true,
      requestApi: async () => assert.fail('guest request must not be introspected'),
    },
  );
  assert.equal(token, '');

  await assert.rejects(
    () =>
      validatedWebsiteSession(
        { data: { _website_session_token: websiteToken } },
        { optional: true, requestApi: async () => ({}) },
      ),
    (error) => error.code === 'unauthenticated',
  );
});

test('strips both website token aliases from every forwarded payload level', () => {
  assert.deepEqual(
    stripWebsiteSessionTokens({
      website_session_token: 'top-secret',
      _website_session_token: 'alternate-secret',
      source: 'flutter',
      customer: {
        name: 'Ali',
        website_session_token: 'nested-secret',
      },
      items: [
        { id: 1, _website_session_token: 'array-secret' },
        { id: 2 },
      ],
    }),
    {
      source: 'flutter',
      customer: { name: 'Ali' },
      items: [{ id: 1 }, { id: 2 }],
    },
  );
});

test('authenticated proxy forwarding keeps the website token only in headers', async () => {
  const mutations = [
    { path: '/api/orders', data: { customer: { name: 'Ali' } } },
    { path: '/api/support', data: { message: 'Please help with delivery.' } },
    {
      path: '/api/auth/orders/17/payment-proof',
      data: { reference: 'PAY-17' },
    },
    { path: '/api/auth/orders/17/cancel', data: { reason: 'Duplicate' } },
  ];

  for (const mutation of mutations) {
    const calls = [];
    const request = firebaseRequest({
      data: {
        ...mutation.data,
        website_session_token: websiteToken,
        _website_session_token: websiteToken,
      },
    });
    const response = await forwardWebsiteRequest({
      request,
      path: mutation.path,
      method: 'POST',
      data: request.data,
      fallback: 'request failed',
      requestApi: async (apiRequest) => {
        calls.push(apiRequest);
        if (apiRequest.path === '/api/auth/me') {
          return {
            ok: true,
            status: 200,
            body: { customer: { id: 17, email: 'buyer@example.com' } },
          };
        }
        return { ok: true, status: 200, body: { ok: true } };
      },
    });

    assert.deepEqual(response, { ok: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].path, mutation.path);
    assert.equal(calls[1].headers.Authorization, `Bearer ${websiteToken}`);
    assert.equal(Object.hasOwn(calls[1].data, 'website_session_token'), false);
    assert.equal(Object.hasOwn(calls[1].data, '_website_session_token'), false);
    assert.equal(JSON.stringify(calls[1].data).includes(websiteToken), false);
  }
});
