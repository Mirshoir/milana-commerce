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
const Duration publicConfigCacheAge = Duration(minutes: 10);

enum CatalogLoadSource { fresh, cache, empty }

class CatalogLoadInfo {
  const CatalogLoadInfo({required this.source, this.cachedAt, this.error = ''});

  final CatalogLoadSource source;
  final DateTime? cachedAt;
  final String error;

  bool get fromCache => source == CatalogLoadSource.cache;
  bool get isFresh => source == CatalogLoadSource.fresh;
}

class PublicCatalogConfig {
  const PublicCatalogConfig({this.garmentMeasurements = false});

  final bool garmentMeasurements;

  factory PublicCatalogConfig.fromSettings(Map<String, dynamic> settings) {
    dynamic siteConfig = settings['site_config'];
    if (siteConfig is String && siteConfig.trim().isNotEmpty) {
      try {
        siteConfig = jsonDecode(siteConfig);
      } catch (_) {
        siteConfig = const <String, dynamic>{};
      }
    }
    final config = siteConfig is Map
        ? Map<String, dynamic>.from(siteConfig)
        : const <String, dynamic>{};
    final rawProduct = config['product'];
    final product = rawProduct is Map
        ? Map<String, dynamic>.from(rawProduct)
        : const <String, dynamic>{};
    final rawGarmentMeasurements = product['garmentMeasurements'];
    return PublicCatalogConfig(
      garmentMeasurements:
          rawGarmentMeasurements == true ||
          rawGarmentMeasurements == 1 ||
          '$rawGarmentMeasurements'.toLowerCase() == 'true',
    );
  }
}

class CatalogRepository {
  CatalogRepository({
    required this.firebaseEnabled,
    CatalogCacheStore? cache,
    http.Client? client,
    DateTime Function()? now,
    this.baseUrl = apiBaseUrl,
    this.cacheMaxAge = maxCatalogCacheAge,
  }) : _cache = cache ?? CatalogCacheStore(),
       _client = client ?? http.Client(),
       _now = now ?? DateTime.now;

  final bool firebaseEnabled;
  final CatalogCacheStore _cache;
  final http.Client _client;
  final DateTime Function() _now;
  final String baseUrl;
  final Duration cacheMaxAge;
  Future<List<Product>>? _inFlightLoad;
  Future<PublicCatalogConfig>? _inFlightConfigLoad;
  PublicCatalogConfig? _cachedPublicConfig;
  DateTime? _publicConfigCachedAt;
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
    final uri = Uri.parse('$baseUrl/api/products?limit=2500');
    final response = await _get(uri, operation: 'Catalog');
    return _decodeProducts(jsonDecode(response.body));
  }

  Future<List<Product>> searchProducts(String query, {int limit = 100}) async {
    final normalized = query.trim();
    if (normalized.length < 2) return const <Product>[];
    final uri = Uri.parse('$baseUrl/api/search/smart').replace(
      queryParameters: {'q': normalized, 'limit': '${limit.clamp(1, 250)}'},
    );
    final response = await _get(uri, operation: 'Search');
    return _decodeProducts(jsonDecode(response.body));
  }

  Future<Product> loadProductDetails(String slug) async {
    final normalized = slug.trim();
    if (normalized.isEmpty) throw ArgumentError.value(slug, 'slug');
    final uri = Uri.parse(
      '$baseUrl/api/products/${Uri.encodeComponent(normalized)}',
    );
    final response = await _get(uri, operation: 'Product detail');
    final decoded = jsonDecode(response.body);
    if (decoded is! Map) throw const FormatException('Invalid product detail');
    return _normalizeApiProduct(
      Product.fromJson(Map<String, dynamic>.from(decoded)),
    );
  }

  Future<List<Product>> loadRecommendations(
    String slug, {
    int limit = 12,
  }) async {
    final normalized = slug.trim();
    if (normalized.isEmpty) return const <Product>[];
    final uri = Uri.parse('$baseUrl/api/recommendations').replace(
      queryParameters: {'slug': normalized, 'limit': '${limit.clamp(1, 30)}'},
    );
    final response = await _get(uri, operation: 'Recommendations');
    return _decodeProducts(jsonDecode(response.body));
  }

  Future<PublicCatalogConfig> loadPublicConfig() async {
    final cached = _cachedPublicConfig;
    final cachedAt = _publicConfigCachedAt;
    if (cached != null &&
        cachedAt != null &&
        _now().difference(cachedAt) < publicConfigCacheAge) {
      return cached;
    }
    final activeLoad = _inFlightConfigLoad;
    if (activeLoad != null) return activeLoad;

    late final Future<PublicCatalogConfig> nextLoad;
    nextLoad = _loadPublicConfig().whenComplete(() {
      if (identical(_inFlightConfigLoad, nextLoad)) {
        _inFlightConfigLoad = null;
      }
    });
    _inFlightConfigLoad = nextLoad;
    return nextLoad;
  }

  Future<PublicCatalogConfig> _loadPublicConfig() async {
    final response = await _get(
      Uri.parse('$baseUrl/api/settings'),
      operation: 'Public settings',
    );
    final decoded = jsonDecode(response.body);
    if (decoded is! Map) return const PublicCatalogConfig();
    final config = PublicCatalogConfig.fromSettings(
      Map<String, dynamic>.from(decoded),
    );
    _cachedPublicConfig = config;
    _publicConfigCachedAt = _now();
    return config;
  }

  Future<http.Response> _get(Uri uri, {required String operation}) async {
    final response = await _client
        .get(uri, headers: const {'Accept': 'application/json'})
        .timeout(
          const Duration(seconds: 15),
          onTimeout: () => throw TimeoutException('$operation timed out'),
        );
    if (response.statusCode != 200) {
      throw Exception('$operation failed: ${response.statusCode}');
    }
    return response;
  }

  List<Product> _decodeProducts(dynamic decoded) {
    dynamic rows = decoded;
    if (decoded is Map) {
      rows = decoded['products'] ?? decoded['items'];
    }
    if (rows is! List) return const <Product>[];
    return rows
        .whereType<Map>()
        .map(
          (row) => _normalizeApiProduct(
            Product.fromJson(Map<String, dynamic>.from(row)),
          ),
        )
        .where((product) => product.active)
        .toList(growable: false);
  }

  Product _normalizeApiProduct(Product product) {
    final images = product.images.map((image) {
      if (image.startsWith('http')) return image;
      if (image.startsWith('/')) return '$baseUrl$image';
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
