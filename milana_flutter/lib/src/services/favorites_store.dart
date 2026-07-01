import 'package:shared_preferences/shared_preferences.dart';

class FavoritesStore {
  static const _key = 'milana_saved_product_ids';

  Future<Set<String>> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return (prefs.getStringList(_key) ?? const <String>[]).toSet();
    } catch (_) {
      return const <String>{};
    }
  }

  Future<void> save(Set<String> ids) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final values = ids.toList()..sort();
      await prefs.setStringList(_key, values);
    } catch (_) {
      return;
    }
  }
}
