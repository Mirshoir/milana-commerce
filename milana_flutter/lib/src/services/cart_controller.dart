import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/cart_item.dart';
import '../models/product.dart';
import 'auth_service.dart';
import 'cart_store.dart';

class CartController extends ChangeNotifier {
  CartController({CartStore? store, this.auth})
    : _store = store ?? CartStore() {
    auth?.addListener(_mergeProfileCart);
    _restore();
  }

  final CartStore _store;
  final AuthService? auth;
  final List<CartItem> _items = [];
  bool _ready = false;
  bool _syncingProfile = false;
  bool _syncProfileAgain = false;

  List<CartItem> get items => List.unmodifiable(_items);
  bool get ready => _ready;
  int get count => _items.fold(0, (sum, item) => sum + item.quantity);
  double get total => _items.fold(0, (sum, item) => sum + item.lineTotal);

  int quantityLimit(Product product) {
    final available = product.availableQop;
    if (available == null) return 20;
    return available.clamp(0, 20).toInt();
  }

  int quantityOf(Product product) {
    final index = _items.indexWhere((item) => item.product.id == product.id);
    return index == -1 ? 0 : _items[index].quantity;
  }

  bool canAdd(Product product, {int quantity = 1}) {
    final limit = quantityLimit(product);
    return limit > 0 && quantityOf(product) + quantity <= limit;
  }

  Future<void> _restore() async {
    final saved = await _store.load();
    _items
      ..clear()
      ..addAll(_normalizeItems(saved));
    _ready = true;
    _mergeProfileCart();
    notifyListeners();
  }

  void _persistAndSync() {
    unawaited(_store.save(_items));
    _syncProfileCart();
  }

  void _syncProfileCart() {
    final activeAuth = auth;
    if (_syncingProfile) {
      _syncProfileAgain = true;
      return;
    }
    if (activeAuth == null || !activeAuth.signedIn) return;
    final remote = activeAuth.customer?.cartItems ?? const <CartItem>[];
    if (_fingerprint(remote) == _fingerprint(_items)) return;
    _syncingProfile = true;
    unawaited(
      activeAuth.updateCart(items).whenComplete(() {
        _syncingProfile = false;
        if (_syncProfileAgain) {
          _syncProfileAgain = false;
          _syncProfileCart();
        }
      }),
    );
  }

  void _mergeProfileCart() {
    if (!_ready || _syncingProfile) return;
    final remote = auth?.customer?.cartItems ?? const <CartItem>[];
    if (remote.isEmpty) {
      _syncProfileCart();
      return;
    }
    final merged = _mergeItems(_items, remote);
    if (_fingerprint(merged) == _fingerprint(_items)) {
      _syncProfileCart();
      return;
    }
    _items
      ..clear()
      ..addAll(merged);
    unawaited(_store.save(_items));
    notifyListeners();
    _syncProfileCart();
  }

  List<CartItem> _mergeItems(List<CartItem> local, List<CartItem> remote) {
    final byId = <String, CartItem>{};
    for (final item in remote) {
      byId[item.product.id] = item;
    }
    for (final item in local) {
      final existing = byId[item.product.id];
      byId[item.product.id] = existing == null
          ? item
          : item.copyWith(
              quantity: item.quantity > existing.quantity
                  ? item.quantity
                  : existing.quantity,
            );
    }
    return _normalizeItems(byId.values).take(100).toList();
  }

  String _fingerprint(List<CartItem> items) {
    final rows =
        items
            .map((item) => '${item.product.id}:${item.quantity.clamp(1, 20)}')
            .toList()
          ..sort();
    return rows.join('|');
  }

  List<CartItem> _normalizeItems(Iterable<CartItem> items) {
    return items
        .where((item) => quantityLimit(item.product) > 0)
        .map(
          (item) => item.copyWith(
            quantity: item.quantity.clamp(1, quantityLimit(item.product)),
          ),
        )
        .toList();
  }

  void add(Product product) {
    final limit = quantityLimit(product);
    if (limit < 1) return;
    final index = _items.indexWhere((item) => item.product.id == product.id);
    if (index == -1) {
      _items.add(CartItem(product: product));
    } else {
      _items[index] = _items[index].copyWith(
        quantity: (_items[index].quantity + 1).clamp(1, limit),
      );
    }
    _persistAndSync();
    notifyListeners();
  }

  void addItem(CartItem item) {
    final limit = quantityLimit(item.product);
    if (limit < 1) return;
    final quantity = item.quantity.clamp(1, limit);
    final index = _items.indexWhere((row) => row.product.id == item.product.id);
    if (index == -1) {
      _items.add(item.copyWith(quantity: quantity));
    } else {
      _items[index] = _items[index].copyWith(
        quantity: (_items[index].quantity + quantity).clamp(1, limit),
      );
    }
    _persistAndSync();
    notifyListeners();
  }

  int addItems(Iterable<CartItem> items) {
    var added = 0;
    for (final item in items) {
      final before = quantityOf(item.product);
      addItem(item);
      if (quantityOf(item.product) > before) added += 1;
    }
    return added;
  }

  void setQuantity(Product product, int quantity) {
    final index = _items.indexWhere((item) => item.product.id == product.id);
    if (index == -1) return;
    final limit = quantityLimit(product);
    if (limit < 1) {
      _items.removeAt(index);
    } else {
      _items[index] = _items[index].copyWith(
        quantity: quantity.clamp(1, limit),
      );
    }
    _persistAndSync();
    notifyListeners();
  }

  void remove(Product product) {
    _items.removeWhere((item) => item.product.id == product.id);
    _persistAndSync();
    notifyListeners();
  }

  void clear() {
    _items.clear();
    unawaited(_store.clear());
    _syncProfileCart();
    notifyListeners();
  }

  @override
  void dispose() {
    auth?.removeListener(_mergeProfileCart);
    super.dispose();
  }
}
