import 'package:shared_preferences/shared_preferences.dart';

import 'customer_storage_coordinator.dart';

class FavoritesStore {
  static const _key = 'milana_saved_product_ids';

  String _storageKey(String? scope) {
    final normalized = (scope ?? 'guest').trim().replaceAll(
      RegExp(r'[^a-zA-Z0-9_-]'),
      '_',
    );
    if (normalized.isEmpty || normalized == 'guest') return _key;
    return '${_key}__$normalized';
  }

  Future<Set<String>> load({String? scope}) async {
    try {
      await CustomerStorageCoordinator.ensureMigrated();
      final key = _storageKey(scope);
      return CustomerStorageCoordinator.readAfterWrites(key, () async {
        final prefs = await SharedPreferences.getInstance();
        return (prefs.getStringList(key) ?? const <String>[]).toSet();
      });
    } catch (_) {
      return const <String>{};
    }
  }

  Future<void> save(Set<String> ids, {String? scope}) async {
    try {
      await CustomerStorageCoordinator.ensureMigrated();
      final key = _storageKey(scope);
      final values = ids.toList()..sort();
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
