import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/cart_item.dart';
import 'package:milana_flutter/src/models/product.dart';
import 'package:milana_flutter/src/services/cart_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

const moqOrderUnits = [
  ProductOrderUnit(
    unitType: packUnitType,
    label: 'Qadoq',
    pieces: 6,
    perSize: 1,
    minQty: 3,
  ),
  ProductOrderUnit(
    unitType: bagUnitType,
    label: 'Qop',
    pieces: 60,
    perSize: 10,
  ),
];

void main() {
  const product = Product(
    id: 'moq-product',
    slug: 'moq-product',
    name: 'MOQ product',
    gender: 'women',
    category: 'pajamas',
    price: 5,
    sizes: ['44', '46', '48', '50', '52', '54'],
    images: [],
    availableQop: 1,
    orderUnits: moqOrderUnits,
  );

  test('first cart addition starts at the product MOQ', () async {
    SharedPreferences.setMockInitialValues({});
    final cart = CartController();
    addTearDown(cart.dispose);
    while (!cart.ready) {
      await Future<void>.delayed(Duration.zero);
    }

    cart.add(product, unitType: packUnitType);
    expect(cart.quantityOf(product, unitType: packUnitType), 3);

    cart.setQuantity(product, 1, unitType: packUnitType);
    expect(cart.quantityOf(product, unitType: packUnitType), 3);
  });

  test('stock below MOQ is not presented as orderable', () async {
    const lowStock = Product(
      id: 'low-stock-moq',
      slug: 'low-stock-moq',
      name: 'Low stock MOQ',
      gender: 'women',
      category: 'pajamas',
      price: 5,
      sizes: ['44', '46', '48', '50', '52', '54'],
      images: [],
      availableQop: .2,
      orderUnits: moqOrderUnits,
    );
    final cart = CartController();
    addTearDown(cart.dispose);
    while (!cart.ready) {
      await Future<void>.delayed(Duration.zero);
    }

    expect(cart.quantityLimit(lowStock, unitType: packUnitType), 0);
    expect(cart.canAdd(lowStock, unitType: packUnitType), isFalse);
  });
}
