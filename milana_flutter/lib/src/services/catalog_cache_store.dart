import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/product.dart';

class CatalogCacheStore {
  static const _key = 'milana_catalog_products';
  static const _timestampKey = 'milana_catalog_cached_at';

  Future<List<Product>> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return const <Product>[];
      final rows = jsonDecode(raw);
      if (rows is! List) return const <Product>[];
      return rows
          .whereType<Map>()
          .map((row) => Product.fromJson(Map<String, dynamic>.from(row)))
          .where((product) => product.active)
          .toList();
    } catch (_) {
      return const <Product>[];
    }
  }

  Future<DateTime?> cachedAt() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_timestampKey);
      if (raw == null || raw.isEmpty) return null;
      return DateTime.tryParse(raw);
    } catch (_) {
      return null;
    }
  }

  Future<void> save(List<Product> products) async {
    final active = products.where((product) => product.active).toList();
    if (active.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final payload = jsonEncode(
        active.map((product) => product.toJson()).toList(),
      );
      await prefs.setString(_key, payload);
      await prefs.setString(
        _timestampKey,
        DateTime.now().toUtc().toIso8601String(),
      );
    } catch (_) {
      return;
    }
  }

  Future<void> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
      await prefs.remove(_timestampKey);
    } catch (_) {
      return;
    }
  }
}
