import 'dart:convert';

import 'package:http/http.dart' as http;

import 'catalog_repository.dart';

const _websiteSessionTimeout = Duration(seconds: 20);

class WebsiteSession {
  const WebsiteSession({
    required this.token,
    required this.customerId,
    required this.email,
  });

  final String token;
  final String customerId;
  final String email;
}

class WebsiteSessionException implements Exception {
  const WebsiteSessionException(this.code, {this.statusCode});

  final String code;
  final int? statusCode;

  @override
  String toString() => code;
}

class WebsiteSessionService {
  WebsiteSessionService({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      _baseUrl = (baseUrl ?? apiBaseUrl).replaceAll(RegExp(r'/+$'), '');

  final http.Client _client;
  final String _baseUrl;

  Future<WebsiteSession> exchangeFirebaseToken({
    required String idToken,
    required String name,
    required String city,
    required String address,
  }) async {
    final response = await _client
        .post(
          Uri.parse('$_baseUrl/api/auth/firebase'),
          headers: const {
            'accept': 'application/json',
            'content-type': 'application/json',
          },
          body: jsonEncode({
            'idToken': idToken,
            'name': name,
            'city': city,
            'address': address,
          }),
        )
        .timeout(_websiteSessionTimeout);
    final body = _decodeObject(response.body);
    if (response.statusCode != 200) {
      throw WebsiteSessionException(
        '${body['error'] ?? 'website-session-failed'}',
        statusCode: response.statusCode,
      );
    }
    final token = '${body['session_token'] ?? ''}'.trim();
    final customer = body['customer'] is Map
        ? Map<String, dynamic>.from(body['customer'] as Map)
        : const <String, dynamic>{};
    if (!RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(token)) {
      throw const WebsiteSessionException('invalid-website-session');
    }
    return WebsiteSession(
      token: token,
      customerId: '${customer['id'] ?? ''}',
      email: '${customer['email'] ?? ''}',
    );
  }

  Future<void> updateProfile({
    required String sessionToken,
    required String name,
    required String phone,
    required String city,
    required String address,
  }) async {
    final response = await _client
        .put(
          Uri.parse('$_baseUrl/api/auth/profile'),
          headers: {
            'accept': 'application/json',
            'authorization': 'Bearer $sessionToken',
            'content-type': 'application/json',
          },
          body: jsonEncode({
            'name': name,
            'phone': phone,
            'city': city,
            'address': address,
          }),
        )
        .timeout(_websiteSessionTimeout);
    if (response.statusCode != 200) {
      final body = _decodeObject(response.body);
      throw WebsiteSessionException(
        '${body['error'] ?? 'website-profile-sync-failed'}',
        statusCode: response.statusCode,
      );
    }
  }

  Future<void> signOut(String sessionToken) async {
    final response = await _client
        .post(
          Uri.parse('$_baseUrl/api/auth/logout'),
          headers: {
            'accept': 'application/json',
            'authorization': 'Bearer $sessionToken',
          },
        )
        .timeout(_websiteSessionTimeout);
    if (response.statusCode != 200) {
      throw WebsiteSessionException(
        'website-sign-out-failed',
        statusCode: response.statusCode,
      );
    }
  }

  Map<String, dynamic> _decodeObject(String source) {
    try {
      final decoded = jsonDecode(source);
      return decoded is Map
          ? Map<String, dynamic>.from(decoded)
          : <String, dynamic>{};
    } on FormatException {
      return <String, dynamic>{};
    }
  }

  void close() => _client.close();
}
