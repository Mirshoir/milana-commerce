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
}
