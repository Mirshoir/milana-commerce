import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/cart_item.dart';
import 'package:milana_flutter/src/models/product.dart';

void main() {
  test('wholesale bag total and size mix follow Milana rules', () {
    const product = Product(
      id: '1',
      slug: 'f-2219',
      name: 'F-2219',
      gender: 'women',
      category: 'homewear',
      price: 4.5,
      sizes: ['44', '46', '48', '50', '52', '54'],
      images: [],
    );

    const item = CartItem(product: product, quantity: 2);

    expect(item.bagPrice, 270);
    expect(item.lineTotal, 540);
    expect(item.toOrderJson()['bag_size'], 60);
    expect(item.toOrderJson()['size_mix'], [
      {'size': '44', 'qty': 10},
      {'size': '46', 'qty': 10},
      {'size': '48', 'qty': 10},
      {'size': '50', 'qty': 10},
      {'size': '52', 'qty': 10},
      {'size': '54', 'qty': 10},
    ]);
  });

  test('pack pricing and size mix follow website order units', () {
    const product = Product(
      id: '2',
      slug: 'pack-model',
      name: 'Pack model',
      gender: 'women',
      category: 'pajamas',
      price: 5,
      sizes: ['44', '46', '48', '50', '52', '54'],
      images: [],
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

    const item = CartItem(
      product: product,
      quantity: 2,
      unitType: packUnitType,
    );

    expect(item.packagePrice, 30);
    expect(item.pieceCount, 12);
    expect(item.lineTotal, 60);
    expect(item.toOrderJson()['unit_type'], packUnitType);
    expect(item.toOrderJson()['size_mix'], [
      {'size': '44', 'qty': 1},
      {'size': '46', 'qty': 1},
      {'size': '48', 'qty': 1},
      {'size': '50', 'qty': 1},
      {'size': '52', 'qty': 1},
      {'size': '54', 'qty': 1},
    ]);
  });
}
