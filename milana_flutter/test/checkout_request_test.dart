import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/cart_item.dart';
import 'package:milana_flutter/src/models/order.dart';
import 'package:milana_flutter/src/models/product.dart';

void main() {
  const product = Product(
    id: '5287',
    slug: 'catalog-item',
    name: 'Milana Model',
    gender: 'women',
    category: 'homewear',
    price: 4.5,
    sizes: ['44', '46', '48', '50', '52', '54'],
    images: [],
  );

  test('createClientOrderId creates callable-safe unique ids', () {
    final first = createClientOrderId();
    final second = createClientOrderId();

    expect(first, matches(RegExp(r'^co_[a-z0-9]+_[a-z0-9]+$')));
    expect(first.length, greaterThanOrEqualTo(12));
    expect(first, isNot(second));
  });

  test('checkout request sends client order id to Firebase callable', () {
    const request = CheckoutRequest(
      name: 'Ali',
      phone: '+998 90 123 45 67',
      city: 'Andijon',
      address: 'Qoratut 605',
      comment: 'Retry-safe checkout',
      paymentMethod: 'click',
      clientOrderId: 'co_2026_checkout',
      items: [CartItem(product: product, quantity: 2)],
    );

    final json = request.toFunctionJson();

    expect(json['client_order_id'], 'co_2026_checkout');
    expect(json['items'], [
      {'product_id': '5287', 'slug': 'catalog-item', 'qty': 2},
    ]);
  });

  test('payment submission sends order payment proof to callable', () {
    const submission = PaymentSubmission(
      orderId: 'order-1',
      method: 'bank',
      amount: 540,
      reference: 'TRX-123',
      note: 'Bank transfer sent.',
    );

    expect(submission.toFunctionJson(), {
      'order_id': 'order-1',
      'method': 'bank',
      'amount': 540.0,
      'reference': 'TRX-123',
      'note': 'Bank transfer sent.',
    });
  });

  test(
    'cancel order request sends order id and trimmed reason to callable',
    () {
      const request = CancelOrderRequest(
        orderId: 'order-1',
        reason: '  Wrong model selected  ',
      );

      expect(request.toFunctionJson(), {
        'order_id': 'order-1',
        'reason': 'Wrong model selected',
      });
    },
  );

  test('orderReceiptShareText builds copyable customer receipt', () {
    final receipt = OrderReceipt(
      number: 'MP-2026-ABCD',
      total: 540,
      paymentStatus: 'pending',
      paymentMethod: 'payme',
      paymentLabel: 'Payme',
      paymentReference: 'MP2026ABCD',
      paymentExpiresAt: DateTime.utc(2026, 6, 29, 12),
      supportPhone: '+998501551010',
    );

    final text = orderReceiptShareText(receipt);

    expect(text, contains('Milana Premium buyurtma'));
    expect(text, contains('Raqam: MP-2026-ABCD'));
    expect(text, contains(r'Jami: $540.00'));
    expect(text, contains('To‘lov: Payme'));
    expect(text, contains('Reference: MP2026ABCD'));
    expect(text, contains('Menejer: +998501551010'));
  });
}
