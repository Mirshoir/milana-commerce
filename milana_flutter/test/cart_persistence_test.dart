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

  test('cart controller restores signed-in Firebase profile cart', () async {
    SharedPreferences.setMockInitialValues({});
    final auth = AuthService(firebaseEnabled: false);
    await auth.signUp(
      name: 'Test Buyer',
      phone: '+998 90 123 45 67',
      email: 'buyer@example.test',
      password: 'strong-pass',
    );
    await auth.updateCart([const CartItem(product: product, quantity: 3)]);

    final controller = CartController(store: CartStore(), auth: auth);
    await settleCart();

    expect(controller.ready, isTrue);
    expect(controller.items, hasLength(1));
    expect(controller.count, 3);
    expect(controller.total, 810);
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
}
