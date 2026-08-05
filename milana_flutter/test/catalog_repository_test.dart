import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:milana_flutter/src/models/cart_item.dart';
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
    'category': 'legacy-category',
    'product_type': 'pajamas',
    'price': 4.5,
    'sizes': ['44', '46', '48', '50', '52', '54'],
    'images': ['/uploads/f-2219.jpg'],
    'model_no': 'F-2219',
    'fabric': {'uz': 'Suprem'},
    'material': {'uz': 'Paxta'},
    'composition': {'uz': '100% paxta'},
    'season': 'all-season',
    'tag': 'bestseller',
    'preorder': false,
    'in_stock': true,
    'can_order_wholesale': true,
    'order_units': [
      {
        'unit_type': 'pachka',
        'label': 'Qadoq',
        'pieces': 6,
        'per_size': 1,
        'min_qty': 1,
      },
      {
        'unit_type': 'qop',
        'label': 'Qop',
        'pieces': 60,
        'per_size': 10,
        'min_qty': 1,
      },
    ],
    'active': true,
    'available_qop': 9,
  };

  test('catalog repository caches successful API products', () async {
    SharedPreferences.setMockInitialValues({});
    final cache = CatalogCacheStore();
    Uri? requestedUri;
    final repo = CatalogRepository(
      firebaseEnabled: true,
      cache: cache,
      client: MockClient((request) async {
        requestedUri = request.url;
        return http.Response(jsonEncode([productRow('5287')]), 200);
      }),
    );

    final products = await repo.loadProducts();
    final cached = await cache.load();

    expect(products, hasLength(1));
    expect(products.first.name, 'F-2219');
    expect(products.first.availableQop, 9);
    expect(products.first.category, 'pajamas');
    expect(products.first.material, 'Paxta');
    expect(products.first.composition, '100% paxta');
    expect(products.first.tag, 'bestseller');
    expect(products.first.orderUnitFor(packUnitType).pieces, 6);
    expect(products.first.orderUnitFor(bagUnitType).pieces, 60);
    expect(products.first.images.first, startsWith(apiBaseUrl));
    expect(requestedUri?.path, '/api/products');
    expect(requestedUri?.queryParameters['limit'], '2500');
    expect(repo.lastLoadInfo.isFresh, isTrue);
    expect(repo.lastLoadInfo.fromCache, isFalse);
    expect(cached, hasLength(1));
    expect(await cache.cachedAt(), isNotNull);
  });

  test('concurrent catalog loads share one in-flight HTTP request', () async {
    SharedPreferences.setMockInitialValues({});
    final response = Completer<http.Response>();
    var requestCount = 0;
    final repo = CatalogRepository(
      firebaseEnabled: false,
      client: MockClient((_) {
        requestCount += 1;
        return response.future;
      }),
    );

    final firstLoad = repo.loadProducts();
    final secondLoad = repo.loadProducts();
    await Future<void>.delayed(Duration.zero);

    expect(requestCount, 1);

    response.complete(http.Response(jsonEncode([productRow('5287')]), 200));
    final results = await Future.wait([firstLoad, secondLoad]);

    expect(results, hasLength(2));
    expect(results[0].single.id, '5287');
    expect(results[1].single.id, '5287');
    expect(requestCount, 1);
    expect(repo.lastLoadInfo.isFresh, isTrue);
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

  test('catalog repository refuses expired catalog snapshots', () async {
    final old = DateTime.utc(2026, 7, 1);
    SharedPreferences.setMockInitialValues({
      'milana_catalog_products': jsonEncode([productRow('5287')]),
      'milana_catalog_cached_at': old.toIso8601String(),
    });
    final repo = CatalogRepository(
      firebaseEnabled: false,
      now: () => DateTime.utc(2026, 8, 4),
      client: MockClient((_) async => http.Response('unavailable', 503)),
    );

    await expectLater(repo.loadProducts(), throwsException);
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
