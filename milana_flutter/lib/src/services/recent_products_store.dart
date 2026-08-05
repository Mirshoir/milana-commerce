import 'package:shared_preferences/shared_preferences.dart';

import 'customer_storage_coordinator.dart';

class RecentProductsStore {
  static const _key = 'milana_recent_product_ids';
  static const maxItems = 20;

  String _storageKey(String? scope) {
    final normalized = (scope ?? 'guest').trim().replaceAll(
      RegExp(r'[^a-zA-Z0-9_-]'),
      '_',
    );
    if (normalized.isEmpty || normalized == 'guest') return _key;
    return '${_key}__$normalized';
  }

  Future<List<String>> load({String? scope}) async {
    try {
      await CustomerStorageCoordinator.ensureMigrated();
      final key = _storageKey(scope);
      return CustomerStorageCoordinator.readAfterWrites(key, () async {
        final prefs = await SharedPreferences.getInstance();
        return (prefs.getStringList(key) ?? const <String>[])
            .map((id) => id.trim())
            .where((id) => id.isNotEmpty)
            .take(maxItems)
            .toList();
      });
    } catch (_) {
      return const <String>[];
    }
  }

  Future<void> save(List<String> ids, {String? scope}) async {
    try {
      await CustomerStorageCoordinator.ensureMigrated();
      final key = _storageKey(scope);
      final seen = <String>{};
      final values = ids
          .map((id) => id.trim())
          .where((id) => id.isNotEmpty && seen.add(id))
          .take(maxItems)
          .toList();
      await CustomerStorageCoordinator.serializeWrite(key, () async {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setStringList(key, values);
      });
    } catch (_) {
      return;
    }
  }

  Future<void> clear({String? scope}) async {
    try {
      await CustomerStorageCoordinator.ensureMigrated();
      final key = _storageKey(scope);
      await CustomerStorageCoordinator.serializeWrite(key, () async {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(key);
      });
    } catch (_) {
      return;
    }
  }
}
