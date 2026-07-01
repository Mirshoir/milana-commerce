import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:milana_flutter/src/models/product.dart';
import 'package:milana_flutter/src/services/catalog_cache_store.dart';
import 'package:milana_flutter/src/services/catalog_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  Map<String, dynamic> productRow(String id) => {
    'id': id,
    'slug': 'f-2219',
    'name': 'F-2219',
    'gender': 'women',
    'category': 'homewear',
    'price': 4.5,
    'sizes': ['44', '46', '48', '50', '52', '54'],
    'images': ['/uploads/f-2219.jpg'],
    'model_no': 'F-2219',
    'fabric': {'uz': 'Suprem'},
    'active': true,
    'available_qop': 9,
  };

  test('catalog repository caches successful API products', () async {
    SharedPreferences.setMockInitialValues({});
    final cache = CatalogCacheStore();
    final repo = CatalogRepository(
      firebaseEnabled: false,
      cache: cache,
      client: MockClient(
        (_) async => http.Response(jsonEncode([productRow('5287')]), 200),
      ),
    );

    final products = await repo.loadProducts();
    final cached = await cache.load();

    expect(products, hasLength(1));
    expect(products.first.name, 'F-2219');
    expect(products.first.availableQop, 9);
    expect(products.first.images.first, startsWith(apiBaseUrl));
    expect(repo.lastLoadInfo.isFresh, isTrue);
    expect(repo.lastLoadInfo.fromCache, isFalse);
    expect(cached, hasLength(1));
    expect(await cache.cachedAt(), isNotNull);
  });

  test(
    'catalog repository falls back to cached products on API failure',
    () async {
      SharedPreferences.setMockInitialValues({});
      final cache = CatalogCacheStore();
      final seedRepo = CatalogRepository(
        firebaseEnabled: false,
        cache: cache,
        client: MockClient(
          (_) async => http.Response(jsonEncode([productRow('5287')]), 200),
        ),
      );
      await seedRepo.loadProducts();

      final repo = CatalogRepository(
        firebaseEnabled: false,
        cache: cache,
        client: MockClient((_) async => http.Response('unavailable', 503)),
      );

      final products = await repo.loadProducts();

      expect(products, hasLength(1));
      expect(products.first.id, '5287');
      expect(products.first.name, 'F-2219');
      expect(repo.lastLoadInfo.fromCache, isTrue);
      expect(repo.lastLoadInfo.cachedAt, isNotNull);
      expect(repo.lastLoadInfo.error, 'fresh-unavailable');
    },
  );

  test('catalog repository ignores cache failures when API succeeds', () async {
    final repo = CatalogRepository(
      firebaseEnabled: false,
      cache: _ThrowingCatalogCacheStore(),
      client: MockClient(
        (_) async => http.Response(jsonEncode([productRow('5287')]), 200),
      ),
    );

    final products = await repo.loadProducts();

    expect(products, hasLength(1));
    expect(products.first.id, '5287');
    expect(repo.lastLoadInfo.isFresh, isTrue);
  });

  test(
    'catalog repository reports empty source when no products are available',
    () async {
      SharedPreferences.setMockInitialValues({});
      final repo = CatalogRepository(
        firebaseEnabled: false,
        client: MockClient((_) async => http.Response('[]', 200)),
      );

      final products = await repo.loadProducts();

      expect(products, isEmpty);
      expect(repo.lastLoadInfo.source, CatalogLoadSource.empty);
    },
  );
}

class _ThrowingCatalogCacheStore extends CatalogCacheStore {
  @override
  Future<List<Product>> load() async => throw StateError('cache unavailable');

  @override
  Future<void> save(List<Product> products) async =>
      throw StateError('cache unavailable');
}
