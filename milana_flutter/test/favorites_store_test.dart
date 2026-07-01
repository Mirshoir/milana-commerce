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
}
