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
}
