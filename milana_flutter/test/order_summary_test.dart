import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/order.dart';

void main() {
  test('order summary reads qop count and payment metadata', () {
    final order = OrderSummary.fromMap({
      'id': 'order-1',
      'number': 'MP-2026-ABCD',
      'total': 540,
      'status': 'confirmed',
      'created_at': '2026-06-27T12:00:00.000Z',
      'items': [
        {
          'id': '5287',
          'slug': 'f-2219',
          'name': 'F-2219',
          'model_no': 'F-2219',
          'variant': 'V-100',
          'qty': 2,
          'unit_price': 4.5,
          'bag_size': 60,
          'price': 270,
          'line_total': 540,
          'image': '/uploads/f-2219.jpg',
          'images': ['/uploads/f-2219.jpg'],
          'sizes': ['44', '46', '48', '50', '52', '54'],
          'size_mix': [
            {'size': '44', 'qty': 10},
            {'size': '46', 'qty': 10},
          ],
        },
      ],
      'payment': {
        'method': 'payme',
        'label': 'Payme',
        'status': 'paid',
        'instructions': 'Payme link',
        'reference': 'MP2026ABCD',
        'expires_at': '2026-06-29T12:00:00.000Z',
        'submission': {
          'reference': 'TRX-123',
          'note': 'Bank transfer sent.',
          'submitted_at': '2026-06-27T13:00:00.000Z',
        },
      },
      'delivery': {
        'carrier': 'Cargo',
        'tracking_number': 'CRG-123',
        'tracking_url': 'https://cargo.example/CRG-123',
        'note': 'Call before delivery',
      },
      'activity': [
        {
          'type': 'order_created',
          'title': 'Buyurtma yaratildi',
          'message': 'Buyurtma qabul qilindi.',
          'actor': 'customer',
          'created_at': '2026-06-27T12:00:00.000Z',
        },
        {
          'type': 'payment_status',
          'title': 'To‘lov tasdiqlandi',
          'message': 'Menejer tasdiqladi.',
          'actor': 'admin',
          'created_at': '2026-06-27T14:00:00.000Z',
        },
      ],
    });

    expect(order.number, 'MP-2026-ABCD');
    expect(order.id, 'order-1');
    expect(order.itemCount, 2);
    expect(order.items, hasLength(1));
    expect(order.items.first.name, 'F-2219');
    expect(order.items.first.modelNo, 'F-2219');
    expect(order.items.first.variant, 'V-100');
    expect(order.items.first.qty, 2);
    expect(order.items.first.unitPrice, 4.5);
    expect(order.items.first.bagSize, 60);
    expect(order.items.first.bagPrice, 270);
    expect(order.items.first.lineTotal, 540);
    expect(order.items.first.image, '/uploads/f-2219.jpg');
    expect(order.items.first.images, ['/uploads/f-2219.jpg']);
    expect(order.items.first.sizes, ['44', '46', '48', '50', '52', '54']);
    expect(order.items.first.sizeMix, hasLength(2));
    expect(order.items.first.sizeMix.first.size, '44');
    final cartItem = order.items.first.toCartItem();
    expect(cartItem.product.id, '5287');
    expect(cartItem.product.slug, 'f-2219');
    expect(cartItem.product.name, 'F-2219');
    expect(cartItem.product.price, 4.5);
    expect(cartItem.product.images, ['/uploads/f-2219.jpg']);
    expect(cartItem.quantity, 2);
    expect(order.total, 540);
    expect(order.status, 'confirmed');
    expect(order.paymentLabel, 'Payme');
    expect(order.paymentStatus, 'paid');
    expect(order.paymentReference, 'MP2026ABCD');
    expect(order.paymentExpiresAt, DateTime.utc(2026, 6, 29, 12));
    expect(order.paymentSubmissionReference, 'TRX-123');
    expect(order.paymentSubmissionNote, 'Bank transfer sent.');
    expect(order.paymentSubmittedAt, DateTime.utc(2026, 6, 27, 13));
    expect(order.deliveryCarrier, 'Cargo');
    expect(order.trackingNumber, 'CRG-123');
    expect(order.trackingUrl, 'https://cargo.example/CRG-123');
    expect(order.deliveryNote, 'Call before delivery');
    expect(order.activity, hasLength(2));
    expect(order.activity.first.type, 'order_created');
    expect(order.activity.last.title, 'To‘lov tasdiqlandi');
    expect(order.activity.last.createdAt, DateTime.utc(2026, 6, 27, 14));
    expect(order.createdAt, isNotNull);
  });

  test('paymentReferenceFromOrderNumber creates payment-safe codes', () {
    expect(paymentReferenceFromOrderNumber('MP-2026-abcd'), 'MP2026ABCD');
    expect(paymentReferenceFromOrderNumber(''), '');
  });
}
