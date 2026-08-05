import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/services/recent_products_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test(
    'recent products store preserves order and removes duplicates',
    () async {
      SharedPreferences.setMockInitialValues({});
      final store = RecentProductsStore();

      await store.save(['f-2219', 'kj-13018', 'f-2219', 'pj-1045']);

      expect(await store.load(), ['f-2219', 'kj-13018', 'pj-1045']);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getStringList('milana_recent_product_ids'), [
        'f-2219',
        'kj-13018',
        'pj-1045',
      ]);
    },
  );

  test('recent products store caps saved products', () async {
    SharedPreferences.setMockInitialValues({});
    final store = RecentProductsStore();

    await store.save(List.generate(25, (index) => 'product-$index'));

    final rows = await store.load();
    expect(rows, hasLength(RecentProductsStore.maxItems));
    expect(rows.first, 'product-0');
    expect(rows.last, 'product-19');
  });

  test('recent products remain isolated by account scope', () async {
    SharedPreferences.setMockInitialValues({});
    final store = RecentProductsStore();

    await store.save(['a-product'], scope: 'buyer-a');
    await store.save(['b-product'], scope: 'buyer-b');

    expect(await store.load(scope: 'buyer-a'), ['a-product']);
    expect(await store.load(scope: 'buyer-b'), ['b-product']);
    expect(await store.load(), isEmpty);
  });

  test('recent scope can be erased for account deletion', () async {
    SharedPreferences.setMockInitialValues({});
    final store = RecentProductsStore();
    await store.save(['recent-product'], scope: 'delete-me');

    await store.clear(scope: 'delete-me');

    expect(await store.load(scope: 'delete-me'), isEmpty);
  });
}
