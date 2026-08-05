import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/product.dart';
import 'catalog_cache_store.dart';

const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://milanapremium.uz',
);
const Duration maxCatalogCacheAge = Duration(days: 7);

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
    DateTime Function()? now,
    this.cacheMaxAge = maxCatalogCacheAge,
  }) : _cache = cache ?? CatalogCacheStore(),
       _client = client ?? http.Client(),
       _now = now ?? DateTime.now;

  final bool firebaseEnabled;
  final CatalogCacheStore _cache;
  final http.Client _client;
  final DateTime Function() _now;
  final Duration cacheMaxAge;
  Future<List<Product>>? _inFlightLoad;
  CatalogLoadInfo _lastLoadInfo = const CatalogLoadInfo(
    source: CatalogLoadSource.empty,
  );

  CatalogLoadInfo get lastLoadInfo => _lastLoadInfo;

  Future<List<Product>> loadProducts() {
    final activeLoad = _inFlightLoad;
    if (activeLoad != null) return activeLoad;

    late final Future<List<Product>> nextLoad;
    nextLoad = _loadProducts().whenComplete(() {
      if (identical(_inFlightLoad, nextLoad)) _inFlightLoad = null;
    });
    _inFlightLoad = nextLoad;
    return nextLoad;
  }

  Future<List<Product>> _loadProducts() async {
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
      final cachedAt = await _cache.cachedAt();
      final age = cachedAt == null
          ? null
          : _now().toUtc().difference(cachedAt.toUtc());
      if (cachedAt == null ||
          age == null ||
          age.isNegative ||
          age > cacheMaxAge) {
        return _CatalogCacheSnapshot(
          cachedAt: cachedAt,
          error: 'cache-expired',
        );
      }
      return _CatalogCacheSnapshot(
        products: await _cache.load(),
        cachedAt: cachedAt,
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
    // The website commerce API is the single catalog authority, independent of
    // the database driver used by a particular deployment.
    // Firebase remains enabled for mobile identity and account sync only.
    return _loadApiProducts();
  }

  Future<List<Product>> _loadApiProducts() async {
    final uri = Uri.parse('$apiBaseUrl/api/products?limit=2500');
    final response = await _client
        .get(uri)
        .timeout(
          const Duration(seconds: 15),
          onTimeout: () => throw TimeoutException('Catalog request timed out'),
        );
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
    return product.copyWith(images: images);
  }

  void close() => _client.close();
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
