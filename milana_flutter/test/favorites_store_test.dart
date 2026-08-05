import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/services/favorites_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('favorites store persists saved product ids sorted', () async {
    SharedPreferences.setMockInitialValues({});
    final store = FavoritesStore();

    await store.save({'f-2219', 'kj-13018'});

    expect(await store.load(), {'f-2219', 'kj-13018'});
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getStringList('milana_saved_product_ids'), [
      'f-2219',
      'kj-13018',
    ]);
  });

  test('favorites remain isolated by account scope', () async {
    SharedPreferences.setMockInitialValues({});
    final store = FavoritesStore();

    await store.save({'a-product'}, scope: 'buyer-a');
    await store.save({'b-product'}, scope: 'buyer-b');

    expect(await store.load(scope: 'buyer-a'), {'a-product'});
    expect(await store.load(scope: 'buyer-b'), {'b-product'});
    expect(await store.load(), isEmpty);
  });

  test('favorites scope can be erased for account deletion', () async {
    SharedPreferences.setMockInitialValues({});
    final store = FavoritesStore();
    await store.save({'saved-product'}, scope: 'delete-me');

    await store.clear(scope: 'delete-me');

    expect(await store.load(scope: 'delete-me'), isEmpty);
  });
}
