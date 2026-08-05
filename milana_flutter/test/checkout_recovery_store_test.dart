import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/order.dart';
import 'package:milana_flutter/src/services/checkout_recovery_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  const receipt = OrderReceipt(
    provenance: BackendProvenance.website,
    orderId: '91',
    number: 'MP-2026-0091',
    total: 315,
    paymentStatus: 'pending',
    paymentReference: 'MP20260091',
    clientOrderId: 'co_test_91',
  );

  test('pending checkout id survives a restart and stays scoped', () async {
    SharedPreferences.setMockInitialValues({});
    final store = CheckoutRecoveryStore();

    await store.savePending('co_pending', scope: 'buyer-a');

    expect(
      (await CheckoutRecoveryStore().load(
        scope: 'buyer-a',
      )).pendingClientOrderId,
      'co_pending',
    );
    expect(
      (await CheckoutRecoveryStore().load(
        scope: 'buyer-b',
      )).pendingClientOrderId,
      isNull,
    );
  });

  test('successful receipt replaces the pending checkout id', () async {
    SharedPreferences.setMockInitialValues({});
    final store = CheckoutRecoveryStore();
    await store.savePending('co_pending', scope: 'buyer-a');

    await store.saveReceipt(receipt, scope: 'buyer-a');
    final recovered = await CheckoutRecoveryStore().load(scope: 'buyer-a');

    expect(recovered.pendingClientOrderId, isNull);
    expect(recovered.receipt?.number, receipt.number);
    expect(recovered.receipt?.paymentReference, receipt.paymentReference);
    expect(recovered.receipt?.provenance, BackendProvenance.website);
  });

  test('clearing recovery removes only the selected account', () async {
    SharedPreferences.setMockInitialValues({});
    final store = CheckoutRecoveryStore();
    await store.saveReceipt(receipt, scope: 'buyer-a');
    await store.savePending('co_b', scope: 'buyer-b');

    await store.clear(scope: 'buyer-a');

    expect((await store.load(scope: 'buyer-a')).receipt, isNull);
    expect((await store.load(scope: 'buyer-b')).pendingClientOrderId, 'co_b');
  });
}
