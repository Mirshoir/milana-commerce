import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/order.dart';
import 'package:milana_flutter/src/services/order_presentation.dart';

void main() {
  OrderSummary order({
    String status = 'new',
    String paymentStatus = 'pending',
    int itemCount = 2,
    String paymentReference = '',
    String paymentSubmissionReference = '',
    String deliveryCarrier = '',
    String trackingNumber = '',
    List<OrderLineItem> items = const [],
  }) {
    return OrderSummary(
      provenance: BackendProvenance.website,
      id: 'order-1',
      number: 'MP-2026-ABCD',
      total: 540,
      status: status,
      paymentStatus: paymentStatus,
      paymentMethod: 'payme',
      paymentLabel: 'Payme',
      paymentInstructions: 'Payme link',
      createdAt: DateTime.utc(2026, 6, 27),
      itemCount: itemCount,
      paymentReference: paymentReference,
      paymentSubmissionReference: paymentSubmissionReference,
      deliveryCarrier: deliveryCarrier,
      trackingNumber: trackingNumber,
      items: items,
    );
  }

  test('orderProgressStep follows order and payment status', () {
    expect(orderProgressStep(order()), 0);
    expect(orderProgressStep(order(paymentStatus: 'paid')), 1);
    expect(orderProgressStep(order(status: 'confirmed')), 1);
    expect(orderProgressStep(order(status: 'shipped')), 2);
    expect(orderProgressStep(order(status: 'delivered')), 3);
  });

  test('orderTrackingSummary converts qop count to clothes count', () {
    expect(
      orderTrackingSummary(order(itemCount: 3), languageCode: 'uz'),
      '3 ta buyurtma to‘plami · 180 dona',
    );
    expect(orderClothesCount(order(itemCount: 4)), 240);
  });

  test('order item presentation summarizes model and size mix', () {
    const item = OrderLineItem(
      id: '5287',
      slug: 'f-2219',
      name: 'F-2219',
      modelNo: 'F-2219',
      variant: 'V-100',
      qty: 2,
      unitPrice: 4.5,
      bagSize: 60,
      bagPrice: 270,
      lineTotal: 540,
      sizeMix: [
        OrderSizeMix(size: '44', qty: 10),
        OrderSizeMix(size: '46', qty: 10),
      ],
    );

    expect(
      orderLineItemSubtitle(item, languageCode: 'uz'),
      'F-2219 / V-100 · 2 qop · 120 dona',
    );
    expect(orderSizeMixSummary(item), '44: 10 · 46: 10');
  });

  test('canCustomerCancelOrder only allows early unpaid orders', () {
    expect(canCustomerCancelOrder(order()), isTrue);
    expect(
      canCustomerCancelOrder(order(paymentStatus: 'waiting_for_customer')),
      isTrue,
    );
    expect(canCustomerCancelOrder(order(paymentStatus: 'submitted')), isFalse);
    expect(canCustomerCancelOrder(order(paymentStatus: 'paid')), isFalse);
    expect(canCustomerCancelOrder(order(status: 'confirmed')), isFalse);
    expect(canCustomerCancelOrder(order(status: 'shipped')), isFalse);
    expect(canCustomerCancelOrder(order(status: 'cancelled')), isFalse);
  });

  test('orderNextAction gives customer-facing next steps', () {
    expect(
      orderNextAction(order(), languageCode: 'uz'),
      contains('To‘lov kutilmoqda'),
    );
    expect(
      orderNextAction(order(paymentStatus: 'submitted'), languageCode: 'uz'),
      contains('Tekshirilmoqda'),
    );
    expect(
      orderNextAction(order(paymentStatus: 'paid'), languageCode: 'uz'),
      contains('To‘langan'),
    );
    expect(
      orderNextAction(order(status: 'shipped'), languageCode: 'uz'),
      contains('Yuborildi'),
    );
    expect(
      orderNextAction(order(status: 'delivered'), languageCode: 'uz'),
      contains('Yetkazildi'),
    );
  });

  test('customerOrderShareText builds copyable order status details', () {
    final text = customerOrderShareText(
      order(
        status: 'shipped',
        paymentStatus: 'submitted',
        itemCount: 3,
        paymentReference: 'MP2026ABCD',
        paymentSubmissionReference: 'TRX-123',
        deliveryCarrier: 'Cargo',
        trackingNumber: 'CRG-123',
        items: const [
          OrderLineItem(
            id: '5287',
            slug: 'f-2219',
            name: 'F-2219',
            qty: 2,
            unitPrice: 4.5,
            bagSize: 60,
            bagPrice: 270,
            lineTotal: 540,
          ),
        ],
      ),
      languageCode: 'uz',
    );

    expect(text, contains('Buyurtma ma’lumoti'));
    expect(text, contains('Raqam: MP-2026-ABCD'));
    expect(text, contains(r'Jami: $540.00'));
    expect(text, contains('Tarkibi: 2 Qop · jami 120 dona'));
    expect(text, contains(r'- F-2219: 2 qop, $540.00'));
    expect(text, contains('To‘lov referecensiya: MP2026ABCD'));
    expect(text, contains('Yuborilgan hujjat: TRX-123'));
    expect(text, contains('Yetkazib beruvchi: Cargo'));
    expect(text, contains('Keyingi qadam: Yuborildi'));
  });

  test('payment amount helpers parse and validate expected order total', () {
    expect(parsePaymentAmount('540.00'), 540);
    expect(parsePaymentAmount('540,00'), 540);
    expect(parsePaymentAmount(' 540.01 '), 540.01);
    expect(parsePaymentAmount(''), isNull);
    expect(parsePaymentAmount('abc'), isNull);

    expect(paymentAmountValidationMessage('540', 540, languageCode: 'uz'), isNull);
    expect(
      paymentAmountValidationMessage('540.009', 540, languageCode: 'uz'),
      isNull,
    );
    expect(
      paymentAmountValidationMessage('', 540, languageCode: 'uz'),
      'To‘lov summasini kiriting',
    );
    expect(
      paymentAmountValidationMessage('-1', 540, languageCode: 'uz'),
      'To‘lov summasini kiriting',
    );
    expect(
      paymentAmountValidationMessage('500', 540, languageCode: 'uz'),
      r'Summada farq bor. Kutilgan summa: 540.00',
    );
  });

  test(
    'payment proof detail validation requires reference or note for electronic methods',
    () {
      expect(paymentMethodNeedsProofDetail('bank'), isTrue);
      expect(paymentMethodNeedsProofDetail('payme'), isTrue);
      expect(paymentMethodNeedsProofDetail('cash'), isFalse);
      expect(paymentMethodNeedsProofDetail('manager'), isFalse);

      expect(
        paymentProofDetailValidationMessage(
          method: 'payme',
          reference: '',
          note: '',
          languageCode: 'uz',
        ),
        'Reference yoki izohni kiriting (kamida 8 belgi)',
      );
      expect(
        paymentProofDetailValidationMessage(
          method: 'payme',
          reference: 'TRX-123',
          note: '',
          languageCode: 'uz',
        ),
        isNull,
      );
      expect(
        paymentProofDetailValidationMessage(
          method: 'bank',
          reference: '',
          note: 'Bankdan yuborildi',
          languageCode: 'uz',
        ),
        isNull,
      );
      expect(
        paymentProofDetailValidationMessage(
          method: 'cash',
          reference: '',
          note: '',
          languageCode: 'uz',
        ),
        isNull,
      );
    },
  );
}
