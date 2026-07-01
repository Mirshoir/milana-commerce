import 'package:shared_preferences/shared_preferences.dart';

class RecentProductsStore {
  static const _key = 'milana_recent_product_ids';
  static const maxItems = 20;

  Future<List<String>> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return (prefs.getStringList(_key) ?? const <String>[])
          .map((id) => id.trim())
          .where((id) => id.isNotEmpty)
          .take(maxItems)
          .toList();
    } catch (_) {
      return const <String>[];
    }
  }

  Future<void> save(List<String> ids) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final seen = <String>{};
      final values = ids
          .map((id) => id.trim())
          .where((id) => id.isNotEmpty && seen.add(id))
          .take(maxItems)
          .toList();
      await prefs.setStringList(_key, values);
    } catch (_) {
      return;
    }
  }
}
