import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/cart_item.dart';
import 'customer_storage_coordinator.dart';

class CartStore {
  static const _key = 'milana_cart_items';

  String _storageKey(String? scope) {
    final normalized = (scope ?? 'guest').trim().replaceAll(
      RegExp(r'[^a-zA-Z0-9_-]'),
      '_',
    );
    if (normalized.isEmpty || normalized == 'guest') return _key;
    return '${_key}__$normalized';
  }

  Future<List<CartItem>> load({String? scope}) async {
    try {
      await CustomerStorageCoordinator.ensureMigrated();
      final key = _storageKey(scope);
      return CustomerStorageCoordinator.readAfterWrites(key, () async {
        final prefs = await SharedPreferences.getInstance();
        final raw = prefs.getString(key);
        if (raw == null || raw.isEmpty) return const <CartItem>[];
        final rows = jsonDecode(raw);
        if (rows is! List) return const <CartItem>[];
        return rows
            .whereType<Map>()
            .map((row) => CartItem.fromJson(Map<String, dynamic>.from(row)))
            .toList();
      });
    } catch (_) {
      return const <CartItem>[];
    }
  }

  Future<void> save(List<CartItem> items, {String? scope}) async {
    try {
      await CustomerStorageCoordinator.ensureMigrated();
      final key = _storageKey(scope);
      final payload = jsonEncode(items.map((item) => item.toJson()).toList());
      await CustomerStorageCoordinator.serializeWrite(key, () async {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(key, payload);
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
