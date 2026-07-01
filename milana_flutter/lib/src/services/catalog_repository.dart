import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:http/http.dart' as http;

import '../models/product.dart';
import 'catalog_cache_store.dart';

const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://127.0.0.1:4173',
);

enum CatalogLoadSource { fresh, cache, empty }

class CatalogLoadInfo {
  const CatalogLoadInfo({required this.source, this.cachedAt, this.error = ''});

  final CatalogLoadSource source;
  final DateTime? cachedAt;
  final String error;

  bool get fromCache => source == CatalogLoadSource.cache;
  bool get isFresh => source == CatalogLoadSource.fresh;
}

class CatalogRepository {
  CatalogRepository({
    required this.firebaseEnabled,
    CatalogCacheStore? cache,
    http.Client? client,
  }) : _cache = cache ?? CatalogCacheStore(),
       _client = client ?? http.Client();

  final bool firebaseEnabled;
  final CatalogCacheStore _cache;
  final http.Client _client;
  CatalogLoadInfo _lastLoadInfo = const CatalogLoadInfo(
    source: CatalogLoadSource.empty,
  );

  CatalogLoadInfo get lastLoadInfo => _lastLoadInfo;

  Future<List<Product>> loadProducts() async {
    try {
      final products = await _loadFreshProducts();
      if (products.isNotEmpty) {
        await _saveCache(products);
        _lastLoadInfo = const CatalogLoadInfo(source: CatalogLoadSource.fresh);
        return products;
      }
    } catch (_) {
      final cached = await _loadCacheSnapshot(error: 'fresh-unavailable');
      if (cached.products.isNotEmpty) {
        _lastLoadInfo = CatalogLoadInfo(
          source: CatalogLoadSource.cache,
          cachedAt: cached.cachedAt,
          error: cached.error,
        );
        return cached.products;
      }
      rethrow;
    }
    final cached = await _loadCacheSnapshot(error: 'fresh-empty');
    if (cached.products.isNotEmpty) {
      _lastLoadInfo = CatalogLoadInfo(
        source: CatalogLoadSource.cache,
        cachedAt: cached.cachedAt,
        error: cached.error,
      );
      return cached.products;
    }
    _lastLoadInfo = const CatalogLoadInfo(source: CatalogLoadSource.empty);
    return const <Product>[];
  }

  Future<_CatalogCacheSnapshot> _loadCacheSnapshot({String error = ''}) async {
    try {
      return _CatalogCacheSnapshot(
        products: await _cache.load(),
        cachedAt: await _cache.cachedAt(),
        error: error,
      );
    } catch (_) {
      return _CatalogCacheSnapshot(error: error);
    }
  }

  Future<void> _saveCache(List<Product> products) async {
    try {
      await _cache.save(products);
    } catch (_) {
      // Cache persistence is an enhancement; live catalog data should still load.
    }
  }

  Future<List<Product>> _loadFreshProducts() async {
    if (firebaseEnabled) {
      final fromFirebase = await _loadFirestoreProducts();
      if (fromFirebase.isNotEmpty) return fromFirebase;
    }
    return _loadApiProducts();
  }

  Future<List<Product>> _loadFirestoreProducts() async {
    final snap = await FirebaseFirestore.instance
        .collection('products')
        .where('active', isEqualTo: true)
        .limit(500)
        .get();
    return snap.docs
        .map((doc) => Product.fromJson({...doc.data(), 'doc_id': doc.id}))
        .where((product) => product.active)
        .toList()
      ..sort((a, b) => a.name.compareTo(b.name));
  }

  Future<List<Product>> _loadApiProducts() async {
    final uri = Uri.parse('$apiBaseUrl/api/products?limit=500');
    final response = await _client.get(uri);
    if (response.statusCode != 200) {
      throw Exception('Catalog failed: ${response.statusCode}');
    }
    final rows = (jsonDecode(response.body) as List)
        .cast<Map<String, dynamic>>();
    return rows
        .map((row) => _normalizeApiProduct(Product.fromJson(row)))
        .toList();
  }

  Product _normalizeApiProduct(Product product) {
    final images = product.images.map((image) {
      if (image.startsWith('http')) return image;
      if (image.startsWith('/')) return '$apiBaseUrl$image';
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

class _CatalogCacheSnapshot {
  const _CatalogCacheSnapshot({
    this.products = const <Product>[],
    this.cachedAt,
    this.error = '',
  });

  final List<Product> products;
  final DateTime? cachedAt;
  final String error;
}
