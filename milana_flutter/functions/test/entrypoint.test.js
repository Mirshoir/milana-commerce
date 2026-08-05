'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('Firebase Functions entrypoint loads with the modular Admin SDK', () => {
  const functions = require('../index');

  const expectedExports = [
    'deleteCustomerAccount',
    'placeOrder',
    'placeWebsiteOrder',
    'paymentWebhook',
  ];
  for (const functionName of expectedExports) {
    assert.equal(typeof functions[functionName], 'function');
  }
});
