import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultFirebaseFunctionNames } from '../firebase_function_names.mjs';

test('production verification requires every website account callable', () => {
  const requiredWebsiteCallables = [
    'listWebsiteCustomerOrders',
    'listWebsiteCustomerSupport',
    'createWebsiteSupport',
    'submitWebsitePaymentProof',
    'cancelWebsiteOrder',
  ];

  for (const callable of requiredWebsiteCallables) {
    assert.ok(
      defaultFirebaseFunctionNames.includes(callable),
      `missing production callable ${callable}`,
    );
  }
  assert.equal(
    new Set(defaultFirebaseFunctionNames).size,
    defaultFirebaseFunctionNames.length,
    'default Firebase callable list must not contain duplicates',
  );
});
