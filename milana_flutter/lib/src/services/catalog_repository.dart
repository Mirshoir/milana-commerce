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
const int catalogNetworkPageSize = 96;

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
  Future<List<Product>>? _inFlightLoadMore;
  List<Product> _loadedProducts = const <Product>[];
  int _nextOffset = 0;
  int _totalProducts = 0;
  bool _hasMore = false;
  CatalogLoadInfo _lastLoadInfo = const CatalogLoadInfo(
    source: CatalogLoadSource.empty,
  );

  CatalogLoadInfo get lastLoadInfo => _lastLoadInfo;
  bool get hasMore => _hasMore;
  int get totalProducts => _totalProducts;

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
      final page = await _loadFreshProducts();
      final products = page.products;
      if (products.isNotEmpty) {
        _loadedProducts = List<Product>.unmodifiable(products);
        _nextOffset = page.nextOffset;
        _totalProducts = page.total;
        _hasMore = page.hasMore;
        await _saveCache(products);
        _lastLoadInfo = const CatalogLoadInfo(source: CatalogLoadSource.fresh);
        return products;
      }
    } catch (_) {
      final cached = await _loadCacheSnapshot(error: 'fresh-unavailable');
      if (cached.products.isNotEmpty) {
        _loadedProducts = List<Product>.unmodifiable(cached.products);
        _nextOffset = cached.products.length;
        _totalProducts = cached.products.length;
        _hasMore = false;
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
      _loadedProducts = List<Product>.unmodifiable(cached.products);
      _nextOffset = cached.products.length;
      _totalProducts = cached.products.length;
      _hasMore = false;
      _lastLoadInfo = CatalogLoadInfo(
        source: CatalogLoadSource.cache,
        cachedAt: cached.cachedAt,
        error: cached.error,
      );
      return cached.products;
    }
    _lastLoadInfo = const CatalogLoadInfo(source: CatalogLoadSource.empty);
    _loadedProducts = const <Product>[];
    _nextOffset = 0;
    _totalProducts = 0;
    _hasMore = false;
    return const <Product>[];
  }

  Future<List<Product>> loadMoreProducts() {
    if (!_hasMore) return Future<List<Product>>.value(_loadedProducts);
    final activeLoad = _inFlightLoadMore;
    if (activeLoad != null) return activeLoad;

    late final Future<List<Product>> nextLoad;
    nextLoad = _loadMoreProducts().whenComplete(() {
      if (identical(_inFlightLoadMore, nextLoad)) _inFlightLoadMore = null;
    });
    _inFlightLoadMore = nextLoad;
    return nextLoad;
  }

  Future<List<Product>> _loadMoreProducts() async {
    final page = await _loadApiProducts(offset: _nextOffset);
    final byId = <String, Product>{
      for (final product in _loadedProducts) product.id: product,
      for (final product in page.products) product.id: product,
    };
    _loadedProducts = List<Product>.unmodifiable(byId.values);
    _nextOffset = page.nextOffset;
    _totalProducts = page.total;
    _hasMore = page.hasMore;
    await _saveCache(_loadedProducts);
    _lastLoadInfo = const CatalogLoadInfo(source: CatalogLoadSource.fresh);
    return _loadedProducts;
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

  Future<_CatalogPage> _loadFreshProducts() async {
    // The website commerce API is the single catalog authority, independent of
    // the database driver used by a particular deployment.
    // Firebase remains enabled for mobile identity and account sync only.
    return _loadApiProducts();
  }

  Future<_CatalogPage> _loadApiProducts({int offset = 0}) async {
    final uri = Uri.parse('$apiBaseUrl/api/products').replace(
      queryParameters: {
        'limit': '$catalogNetworkPageSize',
        'offset': '$offset',
        'meta': '1',
      },
    );
    final response = await _client
        .get(uri)
        .timeout(
          const Duration(seconds: 15),
          onTimeout: () => throw TimeoutException('Catalog request timed out'),
        );
    if (response.statusCode != 200) {
      throw Exception('Catalog failed: ${response.statusCode}');
    }
    final decoded = jsonDecode(response.body);
    final List<dynamic> rawRows;
    final Map<String, dynamic> meta;
    if (decoded is Map<String, dynamic>) {
      rawRows = decoded['items'] is List
          ? decoded['items'] as List<dynamic>
          : const <dynamic>[];
      meta = decoded['meta'] is Map
          ? Map<String, dynamic>.from(decoded['meta'] as Map)
          : const <String, dynamic>{};
    } else if (decoded is List) {
      rawRows = decoded;
      meta = const <String, dynamic>{};
    } else {
      throw const FormatException('Catalog response is not a product page');
    }
    final products = rawRows
        .map((row) => Map<String, dynamic>.from(row as Map))
        .map((row) => _normalizeApiProduct(Product.fromJson(row)))
        .toList();
    final total = _nonNegativeInt(meta['total']) ?? (offset + products.length);
    final nextOffset =
        _nonNegativeInt(meta['next_offset']) ?? (offset + products.length);
    final hasMore =
        meta['has_more'] == true ||
        (meta.isEmpty && products.length == catalogNetworkPageSize);
    return _CatalogPage(
      products: products,
      total: total < offset + products.length
          ? offset + products.length
          : total,
      nextOffset: nextOffset <= offset && products.isNotEmpty
          ? offset + products.length
          : nextOffset,
      hasMore: hasMore,
    );
  }

  int? _nonNegativeInt(dynamic value) {
    final parsed = value is num ? value.toInt() : int.tryParse('$value');
    return parsed != null && parsed >= 0 ? parsed : null;
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

class _CatalogPage {
  const _CatalogPage({
    required this.products,
    required this.total,
    required this.nextOffset,
    required this.hasMore,
  });

  final List<Product> products;
  final int total;
  final int nextOffset;
  final bool hasMore;
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
