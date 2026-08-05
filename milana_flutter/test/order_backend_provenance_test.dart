import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:milana_flutter/src/models/order.dart';
import 'package:milana_flutter/src/services/order_repository.dart';

void main() {
  const session =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  test(
    'mixed histories retain identical backend IDs, deduplicate per backend, and sort newest first',
    () async {
      final repository = OrderRepository(
        firebaseEnabled: true,
        useFirebaseApiProxy: false,
        baseUrl: 'https://milanapremium.uz',
        websiteSessionTokenProvider: () => session,
        firebaseOrderHistoryProvider: (customerId) {
          expect(customerId, 'firebase-uid');
          return Stream.value([
            {
              'id': 'shared-id',
              'number': 'FIREBASE-SHARED',
              'status': 'new',
              'created_at': '2026-08-03T00:00:00.000Z',
            },
            {
              'id': 'legacy-only',
              'number': 'FIREBASE-OLD',
              'status': 'new',
              'created_at': '2026-08-01T00:00:00.000Z',
            },
            {
              'id': 'legacy-only',
              'number': 'FIREBASE-NEW',
              'status': 'confirmed',
              'created_at': '2026-08-05T00:00:00.000Z',
            },
          ]);
        },
        firebaseSupportHistoryProvider: (customerId) {
          expect(customerId, 'firebase-uid');
          return Stream.value([
            {
              'id': 'shared-ticket',
              'number': 'FIREBASE-SHARED',
              'topic': 'general',
              'message': 'Legacy copy',
              'status': 'open',
              'created_at': '2026-08-03T00:00:00.000Z',
            },
            {
              'id': 'legacy-ticket',
              'number': 'FIREBASE-OLD',
              'topic': 'general',
              'message': 'Old duplicate',
              'status': 'open',
              'created_at': '2026-08-01T00:00:00.000Z',
            },
            {
              'id': 'legacy-ticket',
              'number': 'FIREBASE-NEW',
              'topic': 'general',
              'message': 'Newest duplicate',
              'status': 'resolved',
              'created_at': '2026-08-05T00:00:00.000Z',
            },
          ]);
        },
        client: MockClient((request) async {
          expect(request.headers['authorization'], 'Bearer $session');
          if (request.url.path == '/api/auth/orders') {
            return http.Response(
              jsonEncode({
                'orders': [
                  {
                    'id': 'shared-id',
                    'number': 'WEBSITE-SHARED',
                    'status': 'new',
                    'created_at': '2026-08-04T00:00:00.000Z',
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
                  'id': 'shared-ticket',
                  'number': 'WEBSITE-SHARED',
                  'topic': 'delivery',
                  'message': 'Website copy',
                  'status': 'open',
                  'created_at': '2026-08-04T00:00:00.000Z',
                },
              ],
            }),
            200,
          );
        }),
      );
      addTearDown(repository.close);

      final orders = await repository.customerOrders('firebase-uid').first;
      final tickets = await repository
          .customerSupportTickets('firebase-uid')
          .first;

      expect(orders, hasLength(3));
      expect(orders.map((order) => order.number), [
        'FIREBASE-NEW',
        'WEBSITE-SHARED',
        'FIREBASE-SHARED',
      ]);
      expect(
        orders
            .where((order) => order.id == 'shared-id')
            .map((order) => order.provenance),
        [BackendProvenance.website, BackendProvenance.firebaseLegacy],
      );
      expect(orders.first.status, 'confirmed');

      expect(tickets, hasLength(3));
      expect(tickets.map((ticket) => ticket.number), [
        'FIREBASE-NEW',
        'WEBSITE-SHARED',
        'FIREBASE-SHARED',
      ]);
      expect(
        tickets
            .where((ticket) => ticket.id == 'shared-ticket')
            .map((ticket) => ticket.provenance),
        [BackendProvenance.website, BackendProvenance.firebaseLegacy],
      );
      expect(tickets.first.status, 'resolved');
    },
  );

  test(
    'legacy lifecycle requests ignore an active website session and stay on Firebase',
    () async {
      final firebaseCalls = <String>[];
      final repository = OrderRepository(
        firebaseEnabled: true,
        useFirebaseApiProxy: false,
        baseUrl: 'https://milanapremium.uz',
        websiteSessionTokenProvider: () => session,
        firebaseLifecycleMutation: (callableName, data) async {
          firebaseCalls.add(callableName);
          expect(data['order_id'], 'same-id');
          return callableName == 'cancelOrder'
              ? {
                  'order_id': 'same-id',
                  'status': 'cancelled',
                  'payment_status': 'cancelled',
                }
              : {'order_id': 'same-id', 'payment_status': 'submitted'};
        },
        client: MockClient((request) async {
          fail('Legacy lifecycle request was incorrectly sent to the website.');
        }),
      );
      addTearDown(repository.close);

      final payment = await repository.submitPaymentProof(
        const PaymentSubmission(
          provenance: BackendProvenance.firebaseLegacy,
          orderId: 'same-id',
          method: 'bank',
          amount: 270,
          reference: 'TRX-1',
          note: '',
        ),
      );
      final cancellation = await repository.cancelOrder(
        const CancelOrderRequest(
          provenance: BackendProvenance.firebaseLegacy,
          orderId: 'same-id',
        ),
      );

      expect(firebaseCalls, ['submitPaymentProof', 'cancelOrder']);
      expect(payment.provenance, BackendProvenance.firebaseLegacy);
      expect(cancellation.provenance, BackendProvenance.firebaseLegacy);
    },
  );

  test(
    'website lifecycle requests use only the captured website session',
    () async {
      final paths = <String>[];
      final repository = OrderRepository(
        firebaseEnabled: true,
        useFirebaseApiProxy: false,
        baseUrl: 'https://milanapremium.uz',
        websiteSessionTokenProvider: () => session,
        firebaseLifecycleMutation: (callableName, data) async {
          fail('Website lifecycle request was incorrectly sent to Firebase.');
        },
        client: MockClient((request) async {
          paths.add(request.url.path);
          expect(request.headers['authorization'], 'Bearer $session');
          if (request.url.path.endsWith('/payment-proof')) {
            return http.Response(
              jsonEncode({
                'order_id': 'same-id',
                'payment_status': 'submitted',
              }),
              200,
            );
          }
          return http.Response(
            jsonEncode({
              'order_id': 'same-id',
              'status': 'cancelled',
              'payment_status': 'cancelled',
            }),
            200,
          );
        }),
      );
      addTearDown(repository.close);

      final payment = await repository.submitPaymentProof(
        const PaymentSubmission(
          provenance: BackendProvenance.website,
          orderId: 'same-id',
          method: 'bank',
          amount: 270,
          reference: 'TRX-1',
          note: '',
        ),
      );
      final cancellation = await repository.cancelOrder(
        const CancelOrderRequest(
          provenance: BackendProvenance.website,
          orderId: 'same-id',
        ),
      );

      expect(paths, [
        '/api/auth/orders/same-id/payment-proof',
        '/api/auth/orders/same-id/cancel',
      ]);
      expect(payment.provenance, BackendProvenance.website);
      expect(cancellation.provenance, BackendProvenance.website);
    },
  );

  test(
    'losing the website session fails website mutation but does not reroute it to Firebase',
    () async {
      String? currentSession = session;
      var firebaseCalls = 0;
      final repository = OrderRepository(
        firebaseEnabled: true,
        useFirebaseApiProxy: false,
        baseUrl: 'https://milanapremium.uz',
        websiteSessionTokenProvider: () => currentSession,
        firebaseLifecycleMutation: (callableName, data) async {
          firebaseCalls += 1;
          return {
            'order_id': '${data['order_id']}',
            'payment_status': 'submitted',
          };
        },
        client: MockClient((request) async {
          fail('A website request must not be made without a session.');
        }),
      );
      addTearDown(repository.close);
      currentSession = null;

      await expectLater(
        repository.submitPaymentProof(
          const PaymentSubmission(
            provenance: BackendProvenance.website,
            orderId: 'same-id',
            method: 'bank',
            amount: 270,
            reference: 'TRX-1',
            note: '',
          ),
        ),
        throwsA(isA<WebsiteSessionRequiredException>()),
      );
      await expectLater(
        repository.cancelOrder(
          const CancelOrderRequest(
            provenance: BackendProvenance.website,
            orderId: 'same-id',
          ),
        ),
        throwsA(isA<WebsiteSessionRequiredException>()),
      );

      final legacyReceipt = await repository.submitPaymentProof(
        const PaymentSubmission(
          provenance: BackendProvenance.firebaseLegacy,
          orderId: 'same-id',
          method: 'bank',
          amount: 270,
          reference: 'TRX-1',
          note: '',
        ),
      );
      expect(firebaseCalls, 1);
      expect(legacyReceipt.provenance, BackendProvenance.firebaseLegacy);
    },
  );
}
