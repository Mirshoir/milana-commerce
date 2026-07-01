import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/cart_item.dart';

class CartStore {
  static const _key = 'milana_cart_items';

  Future<List<CartItem>> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return const <CartItem>[];
      final rows = jsonDecode(raw);
      if (rows is! List) return const <CartItem>[];
      return rows
          .whereType<Map>()
          .map((row) => CartItem.fromJson(Map<String, dynamic>.from(row)))
          .toList();
    } catch (_) {
      return const <CartItem>[];
    }
  }

  Future<void> save(List<CartItem> items) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final payload = jsonEncode(items.map((item) => item.toJson()).toList());
      await prefs.setString(_key, payload);
    } catch (_) {
      return;
    }
  }

  Future<void> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
    } catch (_) {
      return;
    }
  }
}
