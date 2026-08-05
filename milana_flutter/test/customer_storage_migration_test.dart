import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/services/cart_store.dart';
import 'package:milana_flutter/src/services/favorites_store.dart';
import 'package:milana_flutter/src/services/recent_products_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test(
    'ambiguous legacy account data is cleared before guest access',
    () async {
      SharedPreferences.setMockInitialValues({
        'milana_cart_items': '[{"legacy":"account-a"}]',
        'milana_saved_product_ids': ['account-a-favorite'],
        'milana_recent_product_ids': ['account-a-recent'],
      });

      expect(await CartStore().load(), isEmpty);
      expect(await FavoritesStore().load(), isEmpty);
      expect(await RecentProductsStore().load(), isEmpty);

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getInt('milana_customer_storage_version'), 2);
      expect(prefs.containsKey('milana_cart_items'), isFalse);
      expect(prefs.containsKey('milana_saved_product_ids'), isFalse);
      expect(prefs.containsKey('milana_recent_product_ids'), isFalse);
    },
  );

  test('a queued clear wins over an earlier save for the same scope', () async {
    SharedPreferences.setMockInitialValues({});
    final store = FavoritesStore();

    final save = store.save({'sensitive-product'}, scope: 'account-a');
    final clear = store.clear(scope: 'account-a');
    await Future.wait([save, clear]);

    expect(await store.load(scope: 'account-a'), isEmpty);
  });
}
