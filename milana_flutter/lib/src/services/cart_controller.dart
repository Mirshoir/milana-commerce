import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/cart_item.dart';
import '../models/product.dart';
import 'auth_service.dart';
import 'cart_store.dart';

class CartController extends ChangeNotifier {
  CartController({CartStore? store, this.auth})
    : _store = store ?? CartStore() {
    _scope = _scopeFor(auth?.customer);
    auth?.addListener(_handleAuthChange);
    _restore();
  }

  final CartStore _store;
  final AuthService? auth;
  final List<CartItem> _items = [];
  bool _ready = false;
  bool _hasPendingLocalChanges = false;
  bool _clearedBeforeReady = false;
  bool _syncingProfile = false;
  bool _syncProfileAgain = false;
  bool _localEditedForScope = false;
  late String _scope;
  int _restoreGeneration = 0;
  int _profileSyncGeneration = 0;
  String? _handledDeletedCustomerId;

  List<CartItem> get items => List.unmodifiable(_items);
  bool get ready => _ready;
  int get count => _items.fold(0, (sum, item) => sum + item.quantity);
  int get pieceCount => _items.fold(0, (sum, item) => sum + item.pieceCount);
  int get packCount => _items
      .where((item) => item.orderUnit.isPack)
      .fold(0, (sum, item) => sum + item.quantity);
  int get bagCount => _items
      .where((item) => item.orderUnit.isBag)
      .fold(0, (sum, item) => sum + item.quantity);
  double get total => _items.fold(0, (sum, item) => sum + item.lineTotal);

  int quantityLimit(Product product, {String unitType = bagUnitType}) {
    if (!product.active || !product.canOrderWholesale) return 0;
    final available = product.availableQop;
    if (available == null) return 20;
    final pieces = product.orderUnitFor(unitType).pieces;
    final availableUnits = (available * bagSize / pieces).floor();
    return availableUnits.clamp(0, 20).toInt();
  }

  int quantityOf(Product product, {String unitType = bagUnitType}) {
    final normalizedUnit = normalizeOrderUnitType(unitType);
    final index = _items.indexWhere(
      (item) =>
          item.product.id == product.id &&
          item.orderUnit.unitType == normalizedUnit,
    );
    return index == -1 ? 0 : _items[index].quantity;
  }

  bool canAdd(
    Product product, {
    int quantity = 1,
    String unitType = bagUnitType,
  }) {
    final limit = quantityLimit(product, unitType: unitType);
    return limit > 0 &&
        quantityOf(product, unitType: unitType) + quantity <= limit;
  }

  Future<void> _restore() async {
    final generation = ++_restoreGeneration;
    final scope = _scope;
    final saved = await _store.load(scope: scope);
    if (generation != _restoreGeneration || scope != _scope) return;
    final restored = _normalizeItems(saved);
    final nextItems = _clearedBeforeReady
        ? _normalizeItems(_items)
        : _hasPendingLocalChanges
        ? _applyPendingItems(restored, _items)
        : restored;
    _items
      ..clear()
      ..addAll(nextItems);
    _ready = true;
    if (_hasPendingLocalChanges) {
      _localEditedForScope = auth?.signedIn ?? false;
      _hasPendingLocalChanges = false;
      _clearedBeforeReady = false;
      unawaited(_store.save(_items, scope: _scope));
    }
    _mergeProfileCart();
    notifyListeners();
  }

  void _persistAndSync() {
    if (!_ready) {
      _hasPendingLocalChanges = true;
      return;
    }
    if (auth?.signedIn ?? false) _localEditedForScope = true;
    unawaited(_store.save(_items, scope: _scope));
    _syncProfileCart();
  }

  void _syncProfileCart() {
    final activeAuth = auth;
    if (_syncingProfile) {
      _syncProfileAgain = true;
      return;
    }
    if (activeAuth == null ||
        !activeAuth.signedIn ||
        !activeAuth.profileReady ||
        activeAuth.customer?.id != _scope) {
      return;
    }
    final remote = activeAuth.customer?.cartItems ?? const <CartItem>[];
    if (_fingerprint(remote) == _fingerprint(_items)) {
      _localEditedForScope = false;
      return;
    }
    final generation = _profileSyncGeneration;
    final scope = _scope;
    final snapshot = List<CartItem>.from(_items);
    _syncingProfile = true;
    unawaited(
      (() async {
        var succeeded = false;
        try {
          await activeAuth.updateCart(snapshot);
          succeeded = true;
        } catch (_) {
          // Keep the local-dirty flag so a later auth/profile event can retry.
        } finally {
          if (generation == _profileSyncGeneration && scope == _scope) {
            _syncingProfile = false;
            if (succeeded) {
              _localEditedForScope =
                  _fingerprint(snapshot) != _fingerprint(_items);
            }
            if (_syncProfileAgain) {
              _syncProfileAgain = false;
              _mergeProfileCart();
            }
          }
        }
      })(),
    );
  }

  void _mergeProfileCart() {
    final activeAuth = auth;
    if (!_ready ||
        activeAuth == null ||
        !activeAuth.signedIn ||
        !activeAuth.profileReady ||
        activeAuth.customer?.id != _scope) {
      return;
    }
    if (_syncingProfile) {
      _syncProfileAgain = true;
      return;
    }
    final remote = _normalizeItems(activeAuth.customer?.cartItems ?? const []);
    if (!activeAuth.firebaseEnabled) {
      if (!_localEditedForScope && _items.isEmpty && remote.isNotEmpty) {
        _items
          ..clear()
          ..addAll(remote);
        unawaited(_store.save(_items, scope: _scope));
        notifyListeners();
      } else if (_fingerprint(remote) != _fingerprint(_items)) {
        _localEditedForScope = true;
        _syncProfileCart();
      }
      return;
    }
    if (_localEditedForScope) {
      _syncProfileCart();
      return;
    }
    if (_fingerprint(remote) == _fingerprint(_items)) return;
    _items
      ..clear()
      ..addAll(remote);
    unawaited(_store.save(_items, scope: _scope));
    notifyListeners();
  }

  List<CartItem> _applyPendingItems(
    List<CartItem> restored,
    List<CartItem> pending,
  ) {
    final byId = <String, CartItem>{
      for (final item in restored) item.storageKey: item,
    };
    for (final item in pending) {
      final existing = byId[item.storageKey];
      final limit = quantityLimit(item.product, unitType: item.unitType);
      byId[item.storageKey] = existing == null
          ? item
          : item.copyWith(
              quantity: (existing.quantity + item.quantity).clamp(1, limit),
            );
    }
    return _normalizeItems(byId.values).take(100).toList();
  }

  String _fingerprint(List<CartItem> items) {
    final rows =
        items
            .map((item) => '${item.storageKey}:${item.quantity.clamp(1, 20)}')
            .toList()
          ..sort();
    return rows.join('|');
  }

  List<CartItem> _normalizeItems(Iterable<CartItem> items) {
    return items
        .where(
          (item) => quantityLimit(item.product, unitType: item.unitType) > 0,
        )
        .map(
          (item) => item.copyWith(
            quantity: item.quantity.clamp(
              1,
              quantityLimit(item.product, unitType: item.unitType),
            ),
          ),
        )
        .toList();
  }

  void _handleAuthChange() {
    final deletedCustomerId = auth?.lastDeletedCustomerId;
    if (deletedCustomerId != null &&
        deletedCustomerId != _handledDeletedCustomerId) {
      _handledDeletedCustomerId = deletedCustomerId;
      unawaited(_store.clear(scope: deletedCustomerId));
    }
    final nextScope = _scopeFor(auth?.customer);
    if (nextScope == _scope) {
      _mergeProfileCart();
      return;
    }
    _scope = nextScope;
    _restoreGeneration += 1;
    _profileSyncGeneration += 1;
    _syncingProfile = false;
    _syncProfileAgain = false;
    _localEditedForScope = false;
    _items.clear();
    _ready = false;
    _hasPendingLocalChanges = false;
    _clearedBeforeReady = false;
    notifyListeners();
    unawaited(_restore());
  }

  String _scopeFor(Customer? customer) => customer?.id ?? 'guest';

  void refreshProducts(Iterable<Product> products) {
    if (!_ready || _items.isEmpty) return;
    final latestById = <String, Product>{};
    final latestBySlug = <String, Product>{};
    for (final product in products) {
      latestById[product.id] = product;
      if (product.slug.isNotEmpty) latestBySlug[product.slug] = product;
    }
    final refreshed = <CartItem>[];
    for (final item in _items) {
      final latest =
          latestById[item.product.id] ?? latestBySlug[item.product.slug];
      if (latest == null) continue;
      final limit = quantityLimit(latest, unitType: item.unitType);
      if (limit < 1) continue;
      refreshed.add(
        CartItem(
          product: latest,
          quantity: item.quantity.clamp(1, limit),
          unitType: item.unitType,
        ),
      );
    }
    if (_fullFingerprint(refreshed) == _fullFingerprint(_items)) return;
    _items
      ..clear()
      ..addAll(refreshed);
    _persistAndSync();
    notifyListeners();
  }

  String _fullFingerprint(List<CartItem> items) {
    final rows =
        items
            .map(
              (item) =>
                  '${item.storageKey}:${item.quantity}:${item.product.price}:'
                  '${item.product.availableQop}:${item.product.active}:'
                  '${item.product.canOrderWholesale}:${item.orderUnit.pieces}',
            )
            .toList()
          ..sort();
    return rows.join('|');
  }

  void add(Product product, {String unitType = bagUnitType}) {
    final normalizedUnit = normalizeOrderUnitType(unitType);
    final limit = quantityLimit(product, unitType: normalizedUnit);
    if (limit < 1) return;
    final index = _items.indexWhere(
      (item) =>
          item.product.id == product.id &&
          item.orderUnit.unitType == normalizedUnit,
    );
    if (index == -1) {
      _items.add(CartItem(product: product, unitType: normalizedUnit));
    } else {
      _items[index] = _items[index].copyWith(
        product: product,
        quantity: (_items[index].quantity + 1).clamp(1, limit),
      );
    }
    _persistAndSync();
    notifyListeners();
  }

  void addItem(CartItem item) {
    final limit = quantityLimit(item.product, unitType: item.unitType);
    if (limit < 1) return;
    final quantity = item.quantity.clamp(1, limit);
    final index = _items.indexWhere((row) => row.storageKey == item.storageKey);
    if (index == -1) {
      _items.add(item.copyWith(quantity: quantity));
    } else {
      _items[index] = _items[index].copyWith(
        product: item.product,
        quantity: (_items[index].quantity + quantity).clamp(1, limit),
      );
    }
    _persistAndSync();
    notifyListeners();
  }

  int addItems(Iterable<CartItem> items) {
    var added = 0;
    for (final item in items) {
      final before = quantityOf(item.product, unitType: item.unitType);
      addItem(item);
      if (quantityOf(item.product, unitType: item.unitType) > before) {
        added += 1;
      }
    }
    return added;
  }

  void setQuantity(
    Product product,
    int quantity, {
    String unitType = bagUnitType,
  }) {
    final normalizedUnit = normalizeOrderUnitType(unitType);
    final index = _items.indexWhere(
      (item) =>
          item.product.id == product.id &&
          item.orderUnit.unitType == normalizedUnit,
    );
    if (index == -1) return;
    final limit = quantityLimit(product, unitType: normalizedUnit);
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

  void setItemQuantity(CartItem item, int quantity) {
    setQuantity(item.product, quantity, unitType: item.unitType);
  }

  void remove(Product product, {String? unitType}) {
    final normalizedUnit = unitType == null
        ? null
        : normalizeOrderUnitType(unitType);
    _items.removeWhere(
      (item) =>
          item.product.id == product.id &&
          (normalizedUnit == null || item.orderUnit.unitType == normalizedUnit),
    );
    _persistAndSync();
    notifyListeners();
  }

  void removeItem(CartItem item) {
    remove(item.product, unitType: item.unitType);
  }

  void clear() {
    _items.clear();
    if (auth?.signedIn ?? false) _localEditedForScope = true;
    if (_ready) {
      unawaited(_store.clear(scope: _scope));
    } else {
      _hasPendingLocalChanges = true;
      _clearedBeforeReady = true;
    }
    _syncProfileCart();
    notifyListeners();
  }

  @override
  void dispose() {
    auth?.removeListener(_handleAuthChange);
    super.dispose();
  }
}
