import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/app.dart';
import 'package:milana_flutter/src/models/product.dart';

void main() {
  const base = Product(
    id: 'base',
    slug: 'base',
    name: 'F-2219',
    gender: 'women',
    category: 'homewear',
    price: 4.5,
    sizes: ['44', '46', '48', '50', '52', '54'],
    images: [],
    fabric: 'Suprem',
  );

  test('related products prefer matching gender category fabric and price', () {
    const strong = Product(
      id: 'strong',
      slug: 'strong',
      name: 'F-2220',
      gender: 'women',
      category: 'homewear',
      price: 4.8,
      sizes: ['44', '46', '48', '50', '52', '54'],
      images: [],
      fabric: 'Suprem',
    );
    const weak = Product(
      id: 'weak',
      slug: 'weak',
      name: 'M-1000',
      gender: 'men',
      category: 'pajamas',
      price: 8,
      sizes: ['46', '48'],
      images: [],
      fabric: 'Waffle',
    );

    final related = relatedProductsFor(base, [weak, base, strong]);

    expect(related.first.id, 'strong');
    expect(related, isNot(contains(base)));
  });

  test('related products return at most eight active models', () {
    final rows = List.generate(
      12,
      (index) => Product(
        id: 'model-$index',
        slug: 'model-$index',
        name: 'Model $index',
        gender: 'women',
        category: 'homewear',
        price: 4.5,
        sizes: const ['44', '46', '48'],
        images: const [],
        fabric: 'Suprem',
        active: index != 9,
      ),
    );

    final related = relatedProductsFor(base, rows);

    expect(related, hasLength(8));
    expect(related.map((product) => product.id), isNot(contains('model-9')));
  });
}
