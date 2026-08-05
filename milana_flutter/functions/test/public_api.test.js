'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PublicApiRequestError,
  requestPublicApi,
} = require('../public_api');

test('aborts a public API request at the configured timeout', async () => {
  await assert.rejects(
    () =>
      requestPublicApi({
        path: '/api/auth/me',
        timeoutMs: 10,
        fetchImpl: async (_url, options) =>
          new Promise((resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(new Error('fetch aborted')),
              { once: true },
            );
          }),
      }),
    (error) =>
      error instanceof PublicApiRequestError &&
      error.code === 'public_api_timeout',
  );
});

test('rejects an oversized streamed public API response', async () => {
  await assert.rejects(
    () =>
      requestPublicApi({
        path: '/api/auth/orders',
        maxResponseBytes: 16,
        fetchImpl: async () =>
          new Response(JSON.stringify({ orders: ['a-response-too-large'] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      }),
    (error) =>
      error instanceof PublicApiRequestError &&
      error.code === 'public_api_response_too_large',
  );
});

test('rejects an oversized declared response before reading its body', async () => {
  let bodyRead = false;
  await assert.rejects(
    () =>
      requestPublicApi({
        path: '/api/auth/orders',
        maxResponseBytes: 16,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => '1024' },
          text: async () => {
            bodyRead = true;
            return '{}';
          },
        }),
      }),
    (error) =>
      error instanceof PublicApiRequestError &&
      error.code === 'public_api_response_too_large',
  );
  assert.equal(bodyRead, false);
});

test('returns parsed JSON within the response-size limit', async () => {
  const result = await requestPublicApi({
    path: '/api/auth/me',
    maxResponseBytes: 256,
    fetchImpl: async () =>
      new Response(JSON.stringify({ customer: { id: 17 } }), { status: 200 }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { customer: { id: 17 } });
});
