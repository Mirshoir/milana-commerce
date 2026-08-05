import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/product.dart';
import 'catalog_repository.dart';

const _defaultAssistantTimeout = Duration(seconds: 20);

class AssistantReply {
  const AssistantReply({
    required this.reply,
    this.sessionId,
    this.products = const <Product>[],
  });

  final String reply;
  final int? sessionId;
  final List<Product> products;
}

class AssistantService {
  AssistantService({
    http.Client? client,
    String? baseUrl,
    this.requestTimeout = _defaultAssistantTimeout,
  }) : _client = client ?? http.Client(),
       _baseUrl = (baseUrl ?? apiBaseUrl).replaceAll(RegExp(r'/+$'), '');

  final http.Client _client;
  final String _baseUrl;
  final Duration requestTimeout;

  Future<AssistantReply> send({
    required String message,
    int? sessionId,
    String lang = 'uz',
  }) async {
    final response = await _client
        .post(
          Uri.parse('$_baseUrl/api/chat/message'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode({
            'session_id': sessionId,
            'message': message,
            'lang': lang,
          }),
        )
        .timeout(requestTimeout);
    dynamic body;
    try {
      body = jsonDecode(response.body.isEmpty ? '{}' : response.body);
    } on FormatException {
      body = const <String, dynamic>{};
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = body is Map ? body['error'] : null;
      throw Exception(error ?? 'assistant_failed');
    }
    if (body is! Map<String, dynamic>) {
      throw Exception('assistant_bad_response');
    }
    final rows = body['products'] is List ? body['products'] as List : const [];
    return AssistantReply(
      sessionId: (body['session_id'] as num?)?.toInt(),
      reply: '${body['reply'] ?? 'Rahmat. Menejer tez orada javob beradi.'}'
          .trim(),
      products: rows
          .whereType<Map>()
          .map((row) => Product.fromJson(row.cast<String, dynamic>()))
          .map(_normalizeProductImages)
          .toList(),
    );
  }

  void close() => _client.close();

  Product _normalizeProductImages(Product product) {
    final images = product.images.map((image) {
      if (image.startsWith('http')) return image;
      if (image.startsWith('/')) return '$_baseUrl$image';
      return image;
    }).toList();
    return product.copyWith(images: images);
  }
}
