import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:http/http.dart' as http;

import '../models/checkout_manager.dart';
import '../models/order.dart';
import '../models/support_ticket.dart';
import 'catalog_repository.dart';

const _defaultOrderApiTimeout = Duration(seconds: 20);

typedef FirebaseOrderHistoryProvider =
    Stream<List<Map<String, dynamic>>> Function(String customerId);
typedef FirebaseSupportHistoryProvider =
    Stream<List<Map<String, dynamic>>> Function(String customerId);
typedef FirebaseLifecycleMutation =
    Future<Map<String, dynamic>> Function(
      String callableName,
      Map<String, dynamic> data,
    );
typedef FirebaseWebsiteApiCaller =
    Future<dynamic> Function(String callableName, Map<String, dynamic>? data);

class WebsiteSessionRequiredException implements Exception {
  const WebsiteSessionRequiredException();

  @override
  String toString() =>
      'A website session is required to change this website order. '
      'Sign in again and retry.';
}

class OrderRepository {
  OrderRepository({
    required this.firebaseEnabled,
    http.Client? client,
    String? baseUrl,
    this.websiteSessionTokenProvider,
    this.firebaseOrderHistoryProvider,
    this.firebaseSupportHistoryProvider,
    this.firebaseLifecycleMutation,
    this.firebaseWebsiteApiCaller,
    this.onWebsiteSessionInvalidated,
    bool? useFirebaseApiProxy,
    this.requestTimeout = _defaultOrderApiTimeout,
  }) : _client = client ?? http.Client(),
       _baseUrl = (baseUrl ?? apiBaseUrl).replaceAll(RegExp(r'/+$'), ''),
       _useFirebaseApiProxy = firebaseEnabled && (useFirebaseApiProxy ?? true);

  final bool firebaseEnabled;
  final http.Client _client;
  final String _baseUrl;
  final String? Function()? websiteSessionTokenProvider;
  final FirebaseOrderHistoryProvider? firebaseOrderHistoryProvider;
  final FirebaseSupportHistoryProvider? firebaseSupportHistoryProvider;
  final FirebaseLifecycleMutation? firebaseLifecycleMutation;
  final FirebaseWebsiteApiCaller? firebaseWebsiteApiCaller;
  final Future<void> Function()? onWebsiteSessionInvalidated;
  final bool _useFirebaseApiProxy;
  final Duration requestTimeout;

  String? get _websiteSessionToken {
    final token = websiteSessionTokenProvider?.call()?.trim();
    return token == null || token.isEmpty ? null : token;
  }

  Map<String, String> _apiHeaders({
    bool json = false,
    String? websiteToken,
    String? idempotencyKey,
  }) {
    final headers = {
      'accept': 'application/json',
      if (json) 'content-type': 'application/json',
      if (websiteToken != null) 'authorization': 'Bearer $websiteToken',
    };
    final requestKey = idempotencyKey?.trim() ?? '';
    if (requestKey.isNotEmpty) {
      headers['x-idempotency-key'] = requestKey;
    }
    return headers;
  }

  Future<OrderReceipt> placeOrder(CheckoutRequest request) async {
    final requestWithId = _ensureClientOrderId(request);
    if (_useFirebaseApiProxy) {
      return _placeFirebaseApiOrder(requestWithId);
    }
    return _placeApiOrder(requestWithId);
  }

  CheckoutRequest _ensureClientOrderId(CheckoutRequest request) {
    if (request.clientOrderId.trim().isNotEmpty) return request;
    return CheckoutRequest(
      name: request.name,
      phone: request.phone,
      city: request.city,
      address: request.address,
      country: request.country,
      comment: request.comment,
      paymentMethod: request.paymentMethod,
      managerId: request.managerId,
      customerEmail: request.customerEmail,
      customerId: request.customerId,
      clientOrderId: createClientOrderId(),
      languageCode: request.languageCode,
      marketType: request.marketType,
      items: request.items,
    );
  }

  Future<List<CheckoutManager>> loadManagers() async {
    if (_useFirebaseApiProxy) {
      try {
        final data = await _callFirebaseWebsiteApi('listCheckoutManagers');
        return _parseManagers(data);
      } catch (error) {
        // The manager list is public. Keep checkout usable when a callable is
        // unavailable, misconfigured, or slow in a production build.
        return _loadManagersFromPublicApi();
      }
    }
    return _loadManagersFromPublicApi();
  }

  Future<List<CheckoutManager>> _loadManagersFromPublicApi() async {
    final response = await _client
        .get(
          Uri.parse('$_baseUrl/api/managers'),
          headers: const {'accept': 'application/json'},
        )
        .timeout(requestTimeout);
    if (response.statusCode != 200) {
      throw Exception('Managers failed: ${response.statusCode}');
    }
    return _parseManagers(jsonDecode(response.body));
  }

  List<CheckoutManager> _parseManagers(dynamic body) {
    if (body is! List) {
      throw const FormatException('Managers response must be a list.');
    }
    return body
        .whereType<Map>()
        .map((row) => CheckoutManager.fromJson(Map<String, dynamic>.from(row)))
        .where((manager) => manager.isValid)
        .toList(growable: false);
  }

  Future<String> createSupportTicket(SupportTicket ticket) async {
    final websiteToken = _websiteSessionToken;
    if (websiteToken != null) {
      if (_useFirebaseApiProxy) {
        return _createWebsiteProxySupport(ticket, websiteToken);
      }
      return _createApiSupport(ticket, websiteToken: websiteToken);
    }
    if (firebaseEnabled) {
      return _createFirebaseSupport(ticket);
    }
    return _createApiSupport(ticket);
  }

  Future<PaymentSubmissionReceipt> submitPaymentProof(
    PaymentSubmission submission,
  ) async {
    switch (submission.provenance) {
      case BackendProvenance.website:
        final websiteToken = _websiteSessionToken;
        if (websiteToken == null) {
          throw const WebsiteSessionRequiredException();
        }
        final data = await _websiteMutation(
          path:
              '/api/auth/orders/${Uri.encodeComponent(submission.orderId)}/payment-proof',
          callableName: 'submitWebsitePaymentProof',
          data: submission.toFunctionJson(),
          websiteToken: websiteToken,
        );
        return PaymentSubmissionReceipt(
          provenance: BackendProvenance.website,
          orderId: '${data['order_id'] ?? submission.orderId}',
          paymentStatus: '${data['payment_status'] ?? 'submitted'}',
          submittedAt: DateTime.tryParse('${data['submitted_at'] ?? ''}'),
        );
      case BackendProvenance.firebaseLegacy:
        if (!firebaseEnabled) {
          throw UnsupportedError(
            'Payment submission for a legacy order requires Firebase mode.',
          );
        }
        final data = await _firebaseMutation(
          'submitPaymentProof',
          submission.toFunctionJson(),
        );
        return PaymentSubmissionReceipt(
          provenance: BackendProvenance.firebaseLegacy,
          orderId: '${data['order_id'] ?? submission.orderId}',
          paymentStatus: '${data['payment_status'] ?? 'submitted'}',
          submittedAt: DateTime.tryParse('${data['submitted_at'] ?? ''}'),
        );
    }
  }

  Future<CancelOrderReceipt> cancelOrder(CancelOrderRequest request) async {
    switch (request.provenance) {
      case BackendProvenance.website:
        final websiteToken = _websiteSessionToken;
        if (websiteToken == null) {
          throw const WebsiteSessionRequiredException();
        }
        final data = await _websiteMutation(
          path:
              '/api/auth/orders/${Uri.encodeComponent(request.orderId)}/cancel',
          callableName: 'cancelWebsiteOrder',
          data: request.toFunctionJson(),
          websiteToken: websiteToken,
        );
        return CancelOrderReceipt(
          provenance: BackendProvenance.website,
          orderId: '${data['order_id'] ?? request.orderId}',
          status: '${data['status'] ?? 'cancelled'}',
          paymentStatus: '${data['payment_status'] ?? 'cancelled'}',
          cancelledAt: DateTime.tryParse('${data['cancelled_at'] ?? ''}'),
          stockReleasedQop: (data['stock_released_qop'] as num?)?.toInt() ?? 0,
        );
      case BackendProvenance.firebaseLegacy:
        if (!firebaseEnabled) {
          throw UnsupportedError(
            'Order cancellation for a legacy order requires Firebase mode.',
          );
        }
        final data = await _firebaseMutation(
          'cancelOrder',
          request.toFunctionJson(),
        );
        return CancelOrderReceipt(
          provenance: BackendProvenance.firebaseLegacy,
          orderId: '${data['order_id'] ?? request.orderId}',
          status: '${data['status'] ?? 'cancelled'}',
          paymentStatus: '${data['payment_status'] ?? 'cancelled'}',
          cancelledAt: DateTime.tryParse('${data['cancelled_at'] ?? ''}'),
          stockReleasedQop: (data['stock_released_qop'] as num?)?.toInt() ?? 0,
        );
    }
  }

  Stream<List<OrderSummary>> customerOrders(String customerId) {
    if (customerId.isEmpty) return Stream.value(const []);
    final websiteToken = _websiteSessionToken;
    final websiteFuture = websiteToken == null
        ? null
        : _loadWebsiteOrders(websiteToken);
    if (!firebaseEnabled) {
      return websiteFuture == null
          ? Stream.value(const [])
          : Stream.fromFuture(
              websiteFuture.then(
                (orders) => mergeOrderHistories(orders, const []),
              ),
            );
    }
    final firebaseStream = _firebaseOrders(customerId);
    if (websiteFuture == null) {
      return firebaseStream.map(
        (orders) => mergeOrderHistories(const [], orders),
      );
    }
    return firebaseStream.asyncMap(
      (legacyOrders) async =>
          mergeOrderHistories(await websiteFuture, legacyOrders),
    );
  }

  Stream<List<SupportTicketSummary>> customerSupportTickets(String customerId) {
    if (customerId.isEmpty) return Stream.value(const []);
    final websiteToken = _websiteSessionToken;
    final websiteFuture = websiteToken == null
        ? null
        : _loadWebsiteSupport(websiteToken);
    if (!firebaseEnabled) {
      return websiteFuture == null
          ? Stream.value(const [])
          : Stream.fromFuture(
              websiteFuture.then(
                (tickets) => mergeSupportHistories(tickets, const []),
              ),
            );
    }
    final firebaseStream = _firebaseSupportTickets(customerId);
    if (websiteFuture == null) {
      return firebaseStream.map(
        (tickets) => mergeSupportHistories(const [], tickets),
      );
    }
    return firebaseStream.asyncMap(
      (legacyTickets) async =>
          mergeSupportHistories(await websiteFuture, legacyTickets),
    );
  }

  Stream<List<OrderSummary>> _firebaseOrders(String customerId) {
    final provider = firebaseOrderHistoryProvider;
    if (provider != null) {
      return provider(customerId).map(
        (rows) => rows
            .map(
              (row) => OrderSummary.fromMap(
                row,
                provenance: BackendProvenance.firebaseLegacy,
              ),
            )
            .toList(growable: false),
      );
    }
    return FirebaseFirestore.instance
        .collection('orders')
        .where('customer_id', isEqualTo: customerId)
        .orderBy('created_at', descending: true)
        .limit(50)
        .snapshots()
        .map((snap) {
          return snap.docs
              .map(
                (doc) => OrderSummary.fromMap({
                  ...doc.data(),
                  'id': doc.id,
                }, provenance: BackendProvenance.firebaseLegacy),
              )
              .toList(growable: false);
        });
  }

  Stream<List<SupportTicketSummary>> _firebaseSupportTickets(
    String customerId,
  ) {
    final provider = firebaseSupportHistoryProvider;
    if (provider != null) {
      return provider(customerId).map(
        (rows) => rows
            .map(
              (row) => SupportTicketSummary.fromMap(
                row,
                provenance: BackendProvenance.firebaseLegacy,
              ),
            )
            .toList(growable: false),
      );
    }
    return FirebaseFirestore.instance
        .collection('support_requests')
        .where('customer_id', isEqualTo: customerId)
        .orderBy('created_at', descending: true)
        .limit(50)
        .snapshots()
        .map((snap) {
          return snap.docs
              .map(
                (doc) => SupportTicketSummary.fromMap({
                  ...doc.data(),
                  'id': doc.id,
                }, provenance: BackendProvenance.firebaseLegacy),
              )
              .toList(growable: false);
        });
  }

  Future<OrderReceipt> _placeApiOrder(CheckoutRequest request) async {
    final websiteToken = _websiteSessionToken;
    final idempotencyKey = request.clientOrderId.trim();
    final response = await _client
        .post(
          Uri.parse('$_baseUrl/api/orders'),
          headers: _apiHeaders(
            json: true,
            websiteToken: websiteToken,
            idempotencyKey: idempotencyKey,
          ),
          body: jsonEncode(request.toBackendJson()),
        )
        .timeout(requestTimeout);
    final body = await _decodeWebsiteApiResponse(
      response,
      expectedStatus: 201,
      sessionBound: websiteToken != null,
    );
    return _orderReceiptFromApi(body, request);
  }

  Future<OrderReceipt> _placeFirebaseApiOrder(CheckoutRequest request) async {
    final token = _websiteSessionToken;
    final data = request.toBackendJson();
    if (token != null) data['_website_session_token'] = token;
    final result = await _callFirebaseWebsiteApi(
      'placeWebsiteOrder',
      data: data,
      sessionBound: token != null,
    );
    if (result is! Map) {
      throw const FormatException('Order response must be an object.');
    }
    return _orderReceiptFromApi(Map<String, dynamic>.from(result), request);
  }

  OrderReceipt _orderReceiptFromApi(
    Map<String, dynamic> body,
    CheckoutRequest request,
  ) {
    final payment = body['payment'] is Map
        ? Map<String, dynamic>.from(body['payment'] as Map)
        : const <String, dynamic>{};
    final number = '${body['number'] ?? ''}'.trim();
    if (number.isEmpty) {
      throw const FormatException('Order response has no order number.');
    }
    return OrderReceipt(
      provenance: BackendProvenance.website,
      orderId: '${body['id'] ?? body['order_id'] ?? ''}',
      number: number,
      total: (body['total'] as num?)?.toDouble() ?? request.total,
      paymentStatus: '${payment['status'] ?? 'pending'}',
      paymentMethod: '${payment['method'] ?? 'manager'}',
      paymentLabel: '${payment['label'] ?? 'Menejer orqali'}',
      paymentInstructions:
          '${payment['instructions'] ?? 'Menejerimiz +998501551010 orqali narx, mavjudlik va to‘lovni tasdiqlaydi.'}',
      paymentReference: '${payment['reference'] ?? ''}',
      paymentExpiresAt: DateTime.tryParse('${payment['expires_at'] ?? ''}'),
      clientOrderId: '${body['client_order_id'] ?? request.clientOrderId}',
      supportPhone: '${payment['support_phone'] ?? '+998501551010'}',
    );
  }

  Future<String> _createFirebaseSupport(SupportTicket ticket) async {
    final callable = FirebaseFunctions.instanceFor(
      region: 'asia-southeast1',
    ).httpsCallable('createSupportTicket');
    final result = await callable
        .call<Map<String, dynamic>>(ticket.toFunctionJson())
        .timeout(requestTimeout);
    final data = Map<String, dynamic>.from(result.data);
    return '${data['number']}';
  }

  Future<String> _createApiSupport(
    SupportTicket ticket, {
    String? websiteToken,
  }) async {
    final response = await _client
        .post(
          Uri.parse('$_baseUrl/api/support'),
          headers: _apiHeaders(
            json: true,
            websiteToken: websiteToken,
            idempotencyKey: '${ticket.name}-${ticket.topic}-${ticket.phone}',
          ),
          body: jsonEncode(ticket.toBackendJson()),
        )
        .timeout(requestTimeout);
    final body = await _decodeWebsiteApiResponse(
      response,
      expectedStatus: 201,
      sessionBound: websiteToken != null,
    );
    return '${body['number']}';
  }

  Future<String> _createWebsiteProxySupport(
    SupportTicket ticket,
    String websiteToken,
  ) async {
    final result = await _callFirebaseWebsiteApi(
      'createWebsiteSupport',
      data: {...ticket.toBackendJson(), '_website_session_token': websiteToken},
      sessionBound: true,
    );
    if (result is! Map) {
      throw const FormatException('Support response must be an object.');
    }
    final body = Map<String, dynamic>.from(result);
    return '${body['number'] ?? ''}';
  }

  Future<List<OrderSummary>> _loadWebsiteOrders(String websiteToken) async {
    dynamic body;
    if (_useFirebaseApiProxy) {
      body = await _callFirebaseWebsiteApi(
        'listWebsiteCustomerOrders',
        data: {'website_session_token': websiteToken},
        sessionBound: true,
      );
    } else {
      final response = await _client
          .get(
            Uri.parse('$_baseUrl/api/auth/orders'),
            headers: _apiHeaders(websiteToken: websiteToken),
          )
          .timeout(requestTimeout);
      body = await _decodeWebsiteApiResponse(
        response,
        expectedStatus: 200,
        sessionBound: true,
      );
    }
    if (body is! Map || body['orders'] is! List) {
      throw const FormatException('Orders response must contain a list.');
    }
    return (body['orders'] as List)
        .whereType<Map>()
        .map(
          (row) => OrderSummary.fromMap(
            Map<String, dynamic>.from(row),
            provenance: BackendProvenance.website,
          ),
        )
        .toList(growable: false);
  }

  Future<List<SupportTicketSummary>> _loadWebsiteSupport(
    String websiteToken,
  ) async {
    dynamic body;
    if (_useFirebaseApiProxy) {
      body = await _callFirebaseWebsiteApi(
        'listWebsiteCustomerSupport',
        data: {'website_session_token': websiteToken},
        sessionBound: true,
      );
    } else {
      final response = await _client
          .get(
            Uri.parse('$_baseUrl/api/auth/support'),
            headers: _apiHeaders(websiteToken: websiteToken),
          )
          .timeout(requestTimeout);
      body = await _decodeWebsiteApiResponse(
        response,
        expectedStatus: 200,
        sessionBound: true,
      );
    }
    if (body is! Map || body['support'] is! List) {
      throw const FormatException('Support response must contain a list.');
    }
    return (body['support'] as List)
        .whereType<Map>()
        .map(
          (row) => SupportTicketSummary.fromMap(
            Map<String, dynamic>.from(row),
            provenance: BackendProvenance.website,
          ),
        )
        .toList(growable: false);
  }

  Future<Map<String, dynamic>> _firebaseMutation(
    String callableName,
    Map<String, dynamic> data,
  ) async {
    final mutation = firebaseLifecycleMutation;
    if (mutation != null) return mutation(callableName, data);
    final callable = FirebaseFunctions.instanceFor(
      region: 'asia-southeast1',
    ).httpsCallable(callableName);
    final result = await callable.call<dynamic>(data).timeout(requestTimeout);
    if (result.data is! Map) {
      throw const FormatException('Response must be an object.');
    }
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> _websiteMutation({
    required String path,
    required String callableName,
    required Map<String, dynamic> data,
    required String websiteToken,
  }) async {
    if (_useFirebaseApiProxy) {
      final result = await _callFirebaseWebsiteApi(
        callableName,
        data: {...data, 'website_session_token': websiteToken},
        sessionBound: true,
      );
      if (result is! Map) {
        throw const FormatException('Response must be an object.');
      }
      return Map<String, dynamic>.from(result);
    }
    final response = await _client
        .post(
          Uri.parse('$_baseUrl$path'),
          headers: _apiHeaders(json: true, websiteToken: websiteToken),
          body: jsonEncode(data),
        )
        .timeout(requestTimeout);
    return _decodeWebsiteApiResponse(
      response,
      expectedStatus: 200,
      sessionBound: true,
    );
  }

  Future<dynamic> _callFirebaseWebsiteApi(
    String callableName, {
    Map<String, dynamic>? data,
    bool sessionBound = false,
  }) async {
    try {
      final caller = firebaseWebsiteApiCaller;
      if (caller != null) {
        return await caller(callableName, data).timeout(requestTimeout);
      }
      final callable = FirebaseFunctions.instanceFor(
        region: 'asia-southeast1',
      ).httpsCallable(callableName);
      final call = data == null
          ? callable.call<dynamic>()
          : callable.call<dynamic>(data);
      final result = await call.timeout(requestTimeout);
      return result.data;
    } on FirebaseFunctionsException catch (error) {
      if (sessionBound && _isWebsiteAuthFailure(error.code)) {
        await _invalidateWebsiteSession();
        throw const WebsiteSessionRequiredException();
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> _decodeWebsiteApiResponse(
    http.Response response, {
    required int expectedStatus,
    required bool sessionBound,
  }) async {
    if (sessionBound && _isWebsiteAuthFailure('${response.statusCode}')) {
      await _invalidateWebsiteSession();
      throw const WebsiteSessionRequiredException();
    }
    return _decodeApiResponse(response, expectedStatus: expectedStatus);
  }

  bool _isWebsiteAuthFailure(String code) =>
      code == '401' ||
      code == '403' ||
      code == 'unauthenticated' ||
      code == 'permission-denied';

  Future<void> _invalidateWebsiteSession() async {
    try {
      await onWebsiteSessionInvalidated?.call();
    } catch (_) {
      // The original authentication failure remains the actionable error.
    }
  }

  Map<String, dynamic> _decodeApiResponse(
    http.Response response, {
    required int expectedStatus,
  }) {
    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      decoded = const <String, dynamic>{};
    }
    final body = decoded is Map
        ? Map<String, dynamic>.from(decoded)
        : <String, dynamic>{};
    if (response.statusCode != expectedStatus) {
      throw Exception(body['error'] ?? 'request_failed');
    }
    return body;
  }

  void close() => _client.close();
}

List<OrderSummary> mergeOrderHistories(
  Iterable<OrderSummary> websiteOrders,
  Iterable<OrderSummary> firebaseLegacyOrders,
) {
  final identified = <String, OrderSummary>{};
  final unidentified = <OrderSummary>[];
  for (final order in [...websiteOrders, ...firebaseLegacyOrders]) {
    final key = _historyIdentity(
      order.provenance,
      id: order.id,
      number: order.number,
    );
    if (key == null) {
      unidentified.add(order);
      continue;
    }
    final existing = identified[key];
    if (existing == null || _isNewer(order.createdAt, existing.createdAt)) {
      identified[key] = order;
    }
  }
  final merged = <OrderSummary>[...identified.values, ...unidentified]
    ..sort(_compareOrders);
  return List.unmodifiable(merged);
}

List<SupportTicketSummary> mergeSupportHistories(
  Iterable<SupportTicketSummary> websiteTickets,
  Iterable<SupportTicketSummary> firebaseLegacyTickets,
) {
  final identified = <String, SupportTicketSummary>{};
  final unidentified = <SupportTicketSummary>[];
  for (final ticket in [...websiteTickets, ...firebaseLegacyTickets]) {
    final key = _historyIdentity(
      ticket.provenance,
      id: ticket.id,
      number: ticket.number,
    );
    if (key == null) {
      unidentified.add(ticket);
      continue;
    }
    final existing = identified[key];
    if (existing == null || _isNewer(ticket.createdAt, existing.createdAt)) {
      identified[key] = ticket;
    }
  }
  final merged = <SupportTicketSummary>[...identified.values, ...unidentified]
    ..sort(_compareSupportTickets);
  return List.unmodifiable(merged);
}

String? _historyIdentity(
  BackendProvenance provenance, {
  required String id,
  required String number,
}) {
  final normalizedId = id.trim();
  if (normalizedId.isNotEmpty) {
    return '${provenance.name}:id:$normalizedId';
  }
  final normalizedNumber = number.trim();
  if (normalizedNumber.isNotEmpty) {
    return '${provenance.name}:number:$normalizedNumber';
  }
  return null;
}

bool _isNewer(DateTime? candidate, DateTime? current) {
  if (candidate == null) return false;
  if (current == null) return true;
  return candidate.isAfter(current);
}

int _compareOrders(OrderSummary left, OrderSummary right) {
  final timestamp = _compareNewestFirst(left.createdAt, right.createdAt);
  if (timestamp != 0) return timestamp;
  final provenance = left.provenance.index.compareTo(right.provenance.index);
  if (provenance != 0) return provenance;
  final id = left.id.compareTo(right.id);
  if (id != 0) return id;
  return left.number.compareTo(right.number);
}

int _compareSupportTickets(
  SupportTicketSummary left,
  SupportTicketSummary right,
) {
  final timestamp = _compareNewestFirst(left.createdAt, right.createdAt);
  if (timestamp != 0) return timestamp;
  final provenance = left.provenance.index.compareTo(right.provenance.index);
  if (provenance != 0) return provenance;
  final id = left.id.compareTo(right.id);
  if (id != 0) return id;
  return left.number.compareTo(right.number);
}

int _compareNewestFirst(DateTime? left, DateTime? right) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right.compareTo(left);
}
