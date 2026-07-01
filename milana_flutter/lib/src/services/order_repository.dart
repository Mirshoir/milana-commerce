import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:http/http.dart' as http;

import '../models/order.dart';
import '../models/support_ticket.dart';
import 'catalog_repository.dart';

class OrderRepository {
  OrderRepository({required this.firebaseEnabled});

  final bool firebaseEnabled;

  Future<OrderReceipt> placeOrder(CheckoutRequest request) async {
    if (firebaseEnabled) {
      return _placeFirebaseOrder(request);
    }
    return _placeApiOrder(request);
  }

  Future<String> createSupportTicket(SupportTicket ticket) async {
    if (firebaseEnabled) {
      return _createFirebaseSupport(ticket);
    }
    return _createApiSupport(ticket);
  }

  Future<PaymentSubmissionReceipt> submitPaymentProof(
    PaymentSubmission submission,
  ) async {
    if (!firebaseEnabled) {
      throw UnsupportedError('Payment submission requires Firebase mode.');
    }
    final callable = FirebaseFunctions.instanceFor(
      region: 'asia-southeast1',
    ).httpsCallable('submitPaymentProof');
    final result = await callable.call<Map<String, dynamic>>(
      submission.toFunctionJson(),
    );
    final data = Map<String, dynamic>.from(result.data);
    return PaymentSubmissionReceipt(
      orderId: '${data['order_id'] ?? submission.orderId}',
      paymentStatus: '${data['payment_status'] ?? 'submitted'}',
      submittedAt: DateTime.tryParse('${data['submitted_at'] ?? ''}'),
    );
  }

  Future<CancelOrderReceipt> cancelOrder(CancelOrderRequest request) async {
    if (!firebaseEnabled) {
      throw UnsupportedError('Order cancellation requires Firebase mode.');
    }
    final callable = FirebaseFunctions.instanceFor(
      region: 'asia-southeast1',
    ).httpsCallable('cancelOrder');
    final result = await callable.call<Map<String, dynamic>>(
      request.toFunctionJson(),
    );
    final data = Map<String, dynamic>.from(result.data);
    return CancelOrderReceipt(
      orderId: '${data['order_id'] ?? request.orderId}',
      status: '${data['status'] ?? 'cancelled'}',
      paymentStatus: '${data['payment_status'] ?? 'cancelled'}',
      cancelledAt: DateTime.tryParse('${data['cancelled_at'] ?? ''}'),
      stockReleasedQop: (data['stock_released_qop'] as num?)?.toInt() ?? 0,
    );
  }

  Stream<List<OrderSummary>> customerOrders(String customerId) {
    if (!firebaseEnabled || customerId.isEmpty) return Stream.value(const []);
    return FirebaseFirestore.instance
        .collection('orders')
        .where('customer_id', isEqualTo: customerId)
        .orderBy('created_at', descending: true)
        .limit(50)
        .snapshots()
        .map((snap) {
          return snap.docs
              .map((doc) => OrderSummary.fromMap({...doc.data(), 'id': doc.id}))
              .toList();
        });
  }

  Stream<List<SupportTicketSummary>> customerSupportTickets(String customerId) {
    if (!firebaseEnabled || customerId.isEmpty) return Stream.value(const []);
    return FirebaseFirestore.instance
        .collection('support_requests')
        .where('customer_id', isEqualTo: customerId)
        .orderBy('created_at', descending: true)
        .limit(50)
        .snapshots()
        .map((snap) {
          return snap.docs
              .map((doc) => SupportTicketSummary.fromMap(doc.data()))
              .toList();
        });
  }

  Future<OrderReceipt> _placeFirebaseOrder(CheckoutRequest request) async {
    final callable = FirebaseFunctions.instanceFor(
      region: 'asia-southeast1',
    ).httpsCallable('placeOrder');
    final result = await callable.call<Map<String, dynamic>>(
      request.toFunctionJson(),
    );
    final data = Map<String, dynamic>.from(result.data);
    return OrderReceipt(
      orderId: '${data['order_id'] ?? ''}',
      number: '${data['number']}',
      total: (data['total'] as num).toDouble(),
      paymentStatus: '${data['payment_status'] ?? 'pending'}',
      paymentMethod: '${data['payment_method'] ?? 'manager'}',
      paymentLabel: '${data['payment_label'] ?? 'Menejer orqali'}',
      paymentInstructions:
          '${data['payment_instructions'] ?? 'Menejerimiz +998501551010 orqali narx, mavjudlik va to‘lovni tasdiqlaydi.'}',
      paymentReference: '${data['payment_reference'] ?? ''}',
      paymentExpiresAt: DateTime.tryParse(
        '${data['payment_expires_at'] ?? ''}',
      ),
      clientOrderId: '${data['client_order_id'] ?? request.clientOrderId}',
      supportPhone: '${data['support_phone'] ?? '+998501551010'}',
    );
  }

  Future<OrderReceipt> _placeApiOrder(CheckoutRequest request) async {
    final response = await http.post(
      Uri.parse('$apiBaseUrl/api/orders'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(request.toBackendJson()),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 201) {
      throw Exception(body['error'] ?? 'order_failed');
    }
    return OrderReceipt(
      orderId: '${body['id'] ?? body['order_id'] ?? ''}',
      number: '${body['number']}',
      total: (body['total'] as num).toDouble(),
      paymentStatus: '${body['payment']?['status'] ?? 'pending'}',
      paymentMethod: '${body['payment']?['method'] ?? 'manager'}',
      paymentLabel: '${body['payment']?['label'] ?? 'Menejer orqali'}',
      paymentInstructions:
          '${body['payment']?['instructions'] ?? 'Menejerimiz +998501551010 orqali narx, mavjudlik va to‘lovni tasdiqlaydi.'}',
      paymentReference: '${body['payment']?['reference'] ?? ''}',
      paymentExpiresAt: DateTime.tryParse(
        '${body['payment']?['expires_at'] ?? ''}',
      ),
      clientOrderId: '${body['client_order_id'] ?? request.clientOrderId}',
      supportPhone: '${body['payment']?['support_phone'] ?? '+998501551010'}',
    );
  }

  Future<String> _createFirebaseSupport(SupportTicket ticket) async {
    final callable = FirebaseFunctions.instanceFor(
      region: 'asia-southeast1',
    ).httpsCallable('createSupportTicket');
    final result = await callable.call<Map<String, dynamic>>(
      ticket.toFunctionJson(),
    );
    final data = Map<String, dynamic>.from(result.data);
    return '${data['number']}';
  }

  Future<String> _createApiSupport(SupportTicket ticket) async {
    final response = await http.post(
      Uri.parse('$apiBaseUrl/api/support'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(ticket.toBackendJson()),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 201) {
      throw Exception(body['error'] ?? 'support_failed');
    }
    return '${body['number']}';
  }
}
