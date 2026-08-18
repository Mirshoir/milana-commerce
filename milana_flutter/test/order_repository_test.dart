import 'dart:async';
import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:milana_flutter/src/models/cart_item.dart';
import 'package:milana_flutter/src/models/checkout_manager.dart';
import 'package:milana_flutter/src/models/order.dart';
import 'package:milana_flutter/src/models/product.dart';
import 'package:milana_flutter/src/services/order_repository.dart';

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

  test('manager selection requires an ID from the loaded manager list', () {
    const managers = [
      CheckoutManager(id: 1, name: 'General manager'),
      CheckoutManager(id: 2, name: 'Muhammadma’ruf'),
    ];

    expect(isCheckoutManagerSelected(null, managers), isFalse);
    expect(isCheckoutManagerSelected(3, managers), isFalse);
    expect(isCheckoutManagerSelected(2, managers), isTrue);
  });

  test('loads valid checkout managers from the public API', () async {
    final repository = OrderRepository(
      firebaseEnabled: true,
      useFirebaseApiProxy: false,
      baseUrl: 'https://milanapremium.uz/',
      client: MockClient((request) async {
        expect(request.url.toString(), 'https://milanapremium.uz/api/managers');
        expect(request.headers['accept'], 'application/json');
        return http.Response.bytes(
          utf8.encode(
            jsonEncode([
              {'id': 1, 'name': 'General manager'},
              {'id': '2', 'name': 'Muhammadma’ruf'},
              {'id': 0, 'name': 'Invalid'},
              {'id': 3, 'name': ''},
            ]),
          ),
          200,
          headers: const {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );

    final managers = await repository.loadManagers();

    expect(managers, hasLength(2));
    expect(managers[0].id, 1);
    expect(managers[0].name, 'General manager');
    expect(managers[1].id, 2);
    expect(managers[1].name, 'Muhammadma’ruf');
  });

  test(
    'direct-HTTP override still uses the manager-aware public API',
    () async {
      late Map<String, dynamic> sentBody;
      final repository = OrderRepository(
        firebaseEnabled: true,
        useFirebaseApiProxy: false,
        baseUrl: 'https://milanapremium.uz',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.toString(), 'https://milanapremium.uz/api/orders');
          sentBody = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'id': 91,
              'number': 'MP-2026-0091',
              'total': 810,
              'client_order_id': 'co_api_route',
              'payment': {
                'status': 'pending',
                'method': 'manager',
                'label': 'Menejer orqali',
              },
            }),
            201,
          );
        }),
      );

      final receipt = await repository.placeOrder(
        const CheckoutRequest(
          name: 'Ali',
          phone: '+998 90 123 45 67',
          city: 'Andijon',
          address: 'Qoratut 605',
          comment: '',
          paymentMethod: 'manager',
          managerId: 2,
          clientOrderId: 'co_api_route',
          items: [CartItem(product: product, quantity: 3)],
        ),
      );

      expect(sentBody['manager_id'], 2);
      expect(sentBody['source'], 'flutter');
      expect(receipt.orderId, '91');
      expect(receipt.number, 'MP-2026-0091');
      expect(receipt.provenance, BackendProvenance.website);
    },
  );

  test(
    'authenticated website checkout forwards the commerce session',
    () async {
      const session =
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      final repository = OrderRepository(
        firebaseEnabled: true,
        useFirebaseApiProxy: false,
        baseUrl: 'https://milanapremium.uz',
        websiteSessionTokenProvider: () => session,
        client: MockClient((request) async {
          expect(request.headers['authorization'], 'Bearer $session');
          return http.Response(
            jsonEncode({
              'id': 92,
              'number': 'MP-2026-0092',
              'total': 270,
              'payment': {'status': 'pending'},
            }),
            201,
          );
        }),
      );

      final receipt = await repository.placeOrder(
        const CheckoutRequest(
          name: 'Ali',
          phone: '+998 90 123 45 67',
          city: 'Andijon',
          address: 'Qoratut 605',
          comment: '',
          paymentMethod: 'manager',
          managerId: 2,
          items: [CartItem(product: product)],
        ),
      );

      expect(receipt.orderId, '92');
      expect(receipt.provenance, BackendProvenance.website);
    },
  );

  test(
    'loads authenticated order and support history from the website',
    () async {
      const session =
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      final repository = OrderRepository(
        firebaseEnabled: true,
        useFirebaseApiProxy: false,
        baseUrl: 'https://milanapremium.uz',
        websiteSessionTokenProvider: () => session,
        firebaseOrderHistoryProvider: (_) => Stream.value(const []),
        firebaseSupportHistoryProvider: (_) => Stream.value(const []),
        client: MockClient((request) async {
          expect(request.headers['authorization'], 'Bearer $session');
          if (request.url.path == '/api/auth/orders') {
            return http.Response(
              jsonEncode({
                'orders': [
                  {
                    'id': 92,
                    'number': 'MP-2026-0092',
                    'total': 270,
                    'status': 'new',
                    'created_at': '2026-08-04T00:00:00.000Z',
                    'payment': {'status': 'pending', 'method': 'manager'},
                    'items': [
                      {
                        'id': 5287,
                        'slug': 'catalog-item',
                        'name': 'Milana Model',
                        'qty': 1,
                        'unit_price': 4.5,
                        'bag_size': 60,
                        'price': 270,
                        'line_total': 270,
                      },
                    ],
                  },
                ],
              }),
              200,
            );
          }
          expect(request.url.path, '/api/auth/support');
          return http.Response(
            jsonEncode({
              'support': [
                {
                  'number': 'MS-2026-0001',
                  'topic': 'delivery',
                  'message': 'Where is my order?',
                  'status': 'open',
                  'created_at': '2026-08-04T00:00:00.000Z',
                },
              ],
            }),
            200,
          );
        }),
      );

      final orders = await repository.customerOrders('firebase-uid').first;
      final support = await repository
          .customerSupportTickets('firebase-uid')
          .first;

      expect(orders.single.number, 'MP-2026-0092');
      expect(orders.single.provenance, BackendProvenance.website);
      expect(orders.single.itemCount, 1);
      expect(support.single.number, 'MS-2026-0001');
      expect(support.single.provenance, BackendProvenance.website);
    },
  );

  test(
    'Firebase-enabled checkout uses the callable proxy by default on native',
    () async {
      const session =
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      final calls = <String>[];
      final repository = OrderRepository(
        firebaseEnabled: true,
        websiteSessionTokenProvider: () => session,
        firebaseWebsiteApiCaller: (callableName, data) async {
          calls.add(callableName);
          expect(data?['_website_session_token'], session);
          expect(data?['source'], 'flutter');
          expect(data?['market_type'], 'internal');
          expect(data?['order_type'], 'wholesale');
          return {
            'id': 93,
            'number': 'MP-2026-0093',
            'total': 270,
            'payment': {'status': 'pending'},
          };
        },
        client: MockClient((request) async {
          fail('Default Firebase mode must not call the website directly.');
        }),
      );
      addTearDown(repository.close);

      final receipt = await repository.placeOrder(
        const CheckoutRequest(
          name: 'Ali',
          phone: '+998 90 123 45 67',
          city: 'Andijon',
          address: 'Qoratut 605',
          comment: '',
          paymentMethod: 'manager',
          managerId: 2,
          items: [CartItem(product: product)],
        ),
      );

      expect(calls, ['placeWebsiteOrder']);
      expect(receipt.number, 'MP-2026-0093');
    },
  );

  test('direct authenticated 401 invalidates the website session', () async {
    const session =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    var invalidations = 0;
    final repository = OrderRepository(
      firebaseEnabled: true,
      useFirebaseApiProxy: false,
      websiteSessionTokenProvider: () => session,
      onWebsiteSessionInvalidated: () async {
        invalidations += 1;
      },
      client: MockClient((request) async {
        expect(request.headers['authorization'], 'Bearer $session');
        return http.Response(jsonEncode({'error': 'session_expired'}), 401);
      }),
    );
    addTearDown(repository.close);

    await expectLater(
      repository.placeOrder(
        const CheckoutRequest(
          name: 'Ali',
          phone: '+998 90 123 45 67',
          city: 'Andijon',
          address: 'Qoratut 605',
          comment: '',
          paymentMethod: 'manager',
          managerId: 2,
          items: [CartItem(product: product)],
        ),
      ),
      throwsA(isA<WebsiteSessionRequiredException>()),
    );
    expect(invalidations, 1);
  });

  test(
    'callable auth failure invalidates safely and preserves the session error',
    () async {
      const session =
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      var invalidations = 0;
      final repository = OrderRepository(
        firebaseEnabled: true,
        websiteSessionTokenProvider: () => session,
        firebaseWebsiteApiCaller: (callableName, data) async {
          throw _TestFirebaseFunctionsException('permission-denied');
        },
        onWebsiteSessionInvalidated: () async {
          invalidations += 1;
          throw StateError('revocation service unavailable');
        },
      );
      addTearDown(repository.close);

      await expectLater(
        repository.placeOrder(
          const CheckoutRequest(
            name: 'Ali',
            phone: '+998 90 123 45 67',
            city: 'Andijon',
            address: 'Qoratut 605',
            comment: '',
            paymentMethod: 'manager',
            managerId: 2,
            items: [CartItem(product: product)],
          ),
        ),
        throwsA(isA<WebsiteSessionRequiredException>()),
      );
      expect(invalidations, 1);
    },
  );

  test('callable commerce requests time out instead of hanging', () async {
    final repository = OrderRepository(
      firebaseEnabled: true,
      requestTimeout: const Duration(milliseconds: 5),
      firebaseWebsiteApiCaller: (callableName, data) =>
          Completer<dynamic>().future,
    );
    addTearDown(repository.close);

    await expectLater(
      repository.loadManagers(),
      throwsA(isA<TimeoutException>()),
    );
  });
}

class _TestFirebaseFunctionsException extends FirebaseFunctionsException {
  _TestFirebaseFunctionsException(String code)
    : super(code: code, message: 'Test Functions auth failure.');
}
