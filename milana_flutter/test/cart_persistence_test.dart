import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/cart_item.dart';
import 'package:milana_flutter/src/models/product.dart';
import 'package:milana_flutter/src/services/auth_service.dart';
import 'package:milana_flutter/src/services/cart_controller.dart';
import 'package:milana_flutter/src/services/cart_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  const product = Product(
    id: '5287',
    slug: 'f-2219',
    name: 'F-2219',
    gender: 'women',
    category: 'homewear',
    price: 4.5,
    sizes: ['44', '46', '48', '50', '52', '54'],
    images: ['/uploads/f-2219.jpg'],
  );

  Future<void> settleCart() async {
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }

  test('cart store saves and restores qop items', () async {
    SharedPreferences.setMockInitialValues({});
    final controller = CartController(store: CartStore());
    await settleCart();

    controller.add(product);
    controller.add(product);

    final restored = await CartStore().load();
    expect(restored, hasLength(1));
    expect(restored.first.product.id, '5287');
    expect(restored.first.quantity, 2);
    expect(restored.first.lineTotal, 540);
  });

  test('cart controller restores persisted items on startup', () async {
    SharedPreferences.setMockInitialValues({});
    final first = CartController(store: CartStore());
    await settleCart();
    first.add(product);

    final second = CartController(store: CartStore());
    await settleCart();

    expect(second.ready, isTrue);
    expect(second.items, hasLength(1));
    expect(second.count, 1);
    expect(second.total, 270);
  });

  test(
    'cart controller adds pre-hydration changes on top of persisted quantity',
    () async {
      final store = _DelayedCartStore([
        const CartItem(product: product, quantity: 2),
      ]);
      final controller = CartController(store: store);

      expect(controller.ready, isFalse);
      controller.add(product);
      expect(controller.count, 1);

      store.completeLoad();
      await store.loaded;

      expect(controller.ready, isTrue);
      expect(controller.items, hasLength(1));
      expect(controller.items.single.product.id, product.id);
      expect(controller.items.single.quantity, 3);
      expect(store.persisted.single.quantity, 3);

      controller.dispose();
    },
  );

  test(
    'cart controller clear before hydration discards persisted items',
    () async {
      final store = _DelayedCartStore([
        const CartItem(product: product, quantity: 4),
      ]);
      final controller = CartController(store: store);

      expect(controller.ready, isFalse);
      controller.clear();
      store.completeLoad();
      await store.loaded;

      expect(controller.ready, isTrue);
      expect(controller.items, isEmpty);
      expect(controller.count, 0);
      expect(store.persisted, isEmpty);

      controller.dispose();
    },
  );

  test('cart controller restores signed-in Firebase profile cart', () async {
    SharedPreferences.setMockInitialValues({});
    final auth = AuthService(firebaseEnabled: false);
    await auth.signUp(
      name: 'Test Buyer',
      phone: '+998 90 123 45 67',
      email: 'buyer@example.test',
      password: 'strong-pass',
      legalAccepted: true,
    );
    await auth.updateCart([const CartItem(product: product, quantity: 3)]);

    final controller = CartController(store: CartStore(), auth: auth);
    await settleCart();

    expect(controller.ready, isTrue);
    expect(controller.items, hasLength(1));
    expect(controller.count, 3);
    expect(controller.total, 810);
  });

  test('cart storage is isolated between signed-in customers', () async {
    SharedPreferences.setMockInitialValues({});
    final auth = AuthService(firebaseEnabled: false);
    final controller = CartController(store: CartStore(), auth: auth);
    await settleCart();

    await auth.signIn('buyer-a@example.test', 'strong-pass');
    await settleCart();
    controller.add(product);
    await settleCart();
    expect(controller.count, 1);

    await auth.signOut();
    await settleCart();
    expect(controller.items, isEmpty);

    await auth.signIn('buyer-b@example.test', 'strong-pass');
    await settleCart();
    expect(controller.items, isEmpty);

    await auth.signOut();
    await auth.signIn('buyer-a@example.test', 'strong-pass');
    await settleCart();
    expect(controller.count, 1);

    controller.dispose();
    auth.dispose();
  });

  test('account deletion removes its device-scoped cart', () async {
    SharedPreferences.setMockInitialValues({});
    final auth = AuthService(firebaseEnabled: false);
    final controller = CartController(store: CartStore(), auth: auth);
    await settleCart();
    await auth.signIn('delete-me@example.test', 'strong-pass');
    await settleCart();
    controller.add(product);
    await settleCart();

    await auth.deleteAccount(
      confirmation: 'DELETE',
      reasonCode: 'technical_problems',
    );
    await settleCart();
    await auth.signIn('delete-me@example.test', 'strong-pass');
    await settleCart();

    expect(controller.items, isEmpty);
    controller.dispose();
    auth.dispose();
  });

  test('cart refreshes price and availability from the live catalog', () async {
    SharedPreferences.setMockInitialValues({});
    final controller = CartController(store: CartStore());
    await settleCart();
    controller.add(product);

    controller.refreshProducts([
      product.copyWith(price: 5.25, availableQop: 1.5),
    ]);

    expect(controller.items.single.product.price, 5.25);
    expect(controller.total, 315);

    controller.refreshProducts([product.copyWith(active: false)]);
    expect(controller.items, isEmpty);
    controller.dispose();
  });

  test('adding a refreshed product replaces stale cart pricing', () async {
    SharedPreferences.setMockInitialValues({});
    final controller = CartController(store: CartStore());
    await settleCart();
    controller.add(product);

    controller.add(product.copyWith(price: 5.25, availableQop: 2));

    expect(controller.items.single.quantity, 2);
    expect(controller.items.single.product.price, 5.25);
    expect(controller.total, 630);
    controller.dispose();
  });

  test(
    'cart controller syncs local qop changes to signed-in profile',
    () async {
      SharedPreferences.setMockInitialValues({});
      final auth = AuthService(firebaseEnabled: false);
      await auth.signIn('buyer@example.test', 'strong-pass');
      final controller = CartController(store: CartStore(), auth: auth);
      await settleCart();

      controller.add(product);
      controller.add(product);
      await settleCart();

      expect(auth.customer?.cartItems, hasLength(1));
      expect(auth.customer?.cartItems.first.product.id, '5287');
      expect(auth.customer?.cartItems.first.quantity, 2);
    },
  );

  test('cart controller adds qop items rebuilt from order details', () async {
    SharedPreferences.setMockInitialValues({});
    final controller = CartController(store: CartStore());
    await settleCart();

    final added = controller.addItems([
      const CartItem(product: product, quantity: 2),
    ]);

    expect(added, 1);
    expect(controller.count, 2);
    expect(controller.items.single.product.id, product.id);

    final addedAgain = controller.addItems([
      const CartItem(product: product, quantity: 3),
    ]);

    expect(addedAgain, 1);
    expect(controller.count, 5);
  });

  test(
    'cart keeps Pack and Bag as separate choices and respects stock',
    () async {
      SharedPreferences.setMockInitialValues({});
      const stockedProduct = Product(
        id: 'mixed-unit-product',
        slug: 'mixed-unit-product',
        name: 'Mixed unit product',
        gender: 'women',
        category: 'pajamas',
        price: 5,
        sizes: ['44', '46', '48', '50', '52', '54'],
        images: [],
        availableQop: 1.5,
        orderUnits: [
          ProductOrderUnit(
            unitType: packUnitType,
            label: 'Qadoq',
            pieces: 6,
            perSize: 1,
          ),
          ProductOrderUnit(
            unitType: bagUnitType,
            label: 'Qop',
            pieces: 60,
            perSize: 10,
          ),
        ],
      );
      final controller = CartController(store: CartStore());
      await settleCart();

      expect(
        controller.quantityLimit(stockedProduct, unitType: packUnitType),
        15,
      );
      expect(
        controller.quantityLimit(stockedProduct, unitType: bagUnitType),
        1,
      );

      controller.add(stockedProduct, unitType: packUnitType);
      controller.add(stockedProduct, unitType: bagUnitType);

      expect(controller.items, hasLength(2));
      expect(controller.packCount, 1);
      expect(controller.bagCount, 1);
      expect(controller.pieceCount, 66);
      expect(controller.total, 330);
    },
  );

  test('mixed Pack and Bag lines cannot exceed aggregate stock', () async {
    SharedPreferences.setMockInitialValues({});
    const stockedProduct = Product(
      id: 'one-qop-product',
      slug: 'one-qop-product',
      name: 'One qop product',
      gender: 'women',
      category: 'pajamas',
      price: 5,
      sizes: ['44', '46', '48', '50', '52', '54'],
      images: [],
      availableQop: 1,
      orderUnits: [
        ProductOrderUnit(
          unitType: packUnitType,
          label: 'Qadoq',
          pieces: 6,
          perSize: 1,
        ),
        ProductOrderUnit(
          unitType: bagUnitType,
          label: 'Qop',
          pieces: 60,
          perSize: 10,
        ),
      ],
    );
    final controller = CartController(store: CartStore());
    await settleCart();

    controller.add(stockedProduct, unitType: bagUnitType);

    expect(controller.canAdd(stockedProduct, unitType: packUnitType), isFalse);
    expect(controller.quantityLimit(stockedProduct, unitType: packUnitType), 0);

    controller.add(stockedProduct, unitType: packUnitType);

    expect(controller.items, hasLength(1));
    expect(controller.bagCount, 1);
    expect(controller.packCount, 0);
    expect(controller.pieceCount, 60);
    controller.dispose();
  });

  test(
    'cart refresh clamps mixed units to the latest aggregate stock',
    () async {
      SharedPreferences.setMockInitialValues({});
      const productWithRoom = Product(
        id: 'shrinking-stock',
        slug: 'shrinking-stock',
        name: 'Shrinking stock',
        gender: 'women',
        category: 'pajamas',
        price: 5,
        sizes: ['44', '46', '48', '50', '52', '54'],
        images: [],
        availableQop: 2,
        orderUnits: [
          ProductOrderUnit(
            unitType: packUnitType,
            label: 'Qadoq',
            pieces: 6,
            perSize: 1,
          ),
          ProductOrderUnit(
            unitType: bagUnitType,
            label: 'Qop',
            pieces: 60,
            perSize: 10,
          ),
        ],
      );
      final controller = CartController(store: CartStore());
      await settleCart();
      controller.add(productWithRoom, unitType: bagUnitType);
      controller.addItem(
        const CartItem(
          product: productWithRoom,
          unitType: packUnitType,
          quantity: 10,
        ),
      );

      controller.refreshProducts([productWithRoom.copyWith(availableQop: 1)]);

      expect(controller.items, hasLength(1));
      expect(controller.bagCount, 1);
      expect(controller.packCount, 0);
      expect(controller.pieceCount, 60);
      controller.dispose();
    },
  );
}

class _DelayedCartStore extends CartStore {
  _DelayedCartStore(List<CartItem> persisted)
    : persisted = List<CartItem>.of(persisted);

  final Completer<List<CartItem>> _loadCompleter = Completer<List<CartItem>>();
  final Completer<void> _loadedCompleter = Completer<void>();
  List<CartItem> persisted;

  Future<void> get loaded => _loadedCompleter.future;

  void completeLoad() {
    _loadCompleter.complete(List<CartItem>.of(persisted));
  }

  @override
  Future<List<CartItem>> load({String? scope}) => _loadCompleter.future;

  @override
  Future<void> save(List<CartItem> items, {String? scope}) async {
    persisted = List<CartItem>.of(items);
    if (!_loadedCompleter.isCompleted) _loadedCompleter.complete();
  }

  @override
  Future<void> clear({String? scope}) async {
    persisted = <CartItem>[];
    if (!_loadedCompleter.isCompleted) _loadedCompleter.complete();
  }
}
