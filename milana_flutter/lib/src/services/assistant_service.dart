import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/product.dart';
import 'catalog_repository.dart';

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
  AssistantService({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      _baseUrl = (baseUrl ?? apiBaseUrl).replaceAll(RegExp(r'/+$'), '');

  final http.Client _client;
  final String _baseUrl;

  Future<AssistantReply> send({
    required String message,
    int? sessionId,
    String lang = 'uz',
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/api/chat/message'),
      headers: const {'Content-Type': 'application/json'},
      body: jsonEncode({
        'session_id': sessionId,
        'message': message,
        'lang': lang,
      }),
    );
    final body = jsonDecode(response.body.isEmpty ? '{}' : response.body);
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
    return Product(
      id: product.id,
      slug: product.slug,
      name: product.name,
      gender: product.gender,
      category: product.category,
      price: product.price,
      sizes: product.sizes,
      images: images,
      modelNo: product.modelNo,
      variant: product.variant,
      fabric: product.fabric,
      description: product.description,
      rating: product.rating,
      reviews: product.reviews,
      active: product.active,
      availableQop: product.availableQop,
    );
  }
}
