import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/cart_item.dart';
import 'package:milana_flutter/src/models/product.dart';
import 'package:milana_flutter/src/services/product_presentation.dart';

void main() {
  const product = Product(
    id: 'f-2219',
    slug: 'f-2219',
    name: 'F-2219',
    gender: 'women',
    category: 'homewear',
    price: 4.5,
    sizes: ['44', '46', '48', '50', '52', '54'],
    images: [],
    modelNo: 'F-2219',
    availableQop: 12,
  );

  test('genderLabel and categoryLabel localize product taxonomy', () {
    expect(genderLabel('women'), 'Ayollar');
    expect(genderLabel('men'), 'Erkaklar');
    expect(genderLabel('kids'), 'Bolalar');
    expect(categoryLabel('homewear'), 'Uy kiyimi');
    expect(categoryLabel('loungewear'), 'Lounge to‘plam');
  });

  test('productSpecs exposes model department category and order unit', () {
    final specs = productSpecs(product, const CartItem(product: product));

    expect(specs.map((spec) => spec.label), [
      'Model',
      'Bo‘lim',
      'Kategoriya',
      'Buyurtma turi',
      'Omborda',
    ]);
    expect(specs.map((spec) => spec.value), [
      'F-2219',
      'Ayollar',
      'Uy kiyimi',
      'Qop · 60 dona',
      '12 qop ekvivalenti',
    ]);
  });

  test('productHighlights describe wholesale buying rules', () {
    final highlights = productHighlights(product);

    expect(highlights, hasLength(3));
    expect(highlights.first.title, 'Qadoq yoki qop');
    expect(highlights.first.text, contains('6 donalik qadoq'));
    expect(highlights[1].title, contains('Cargo'));
    expect(highlights[2].text, contains('12'));
  });

  test('productInquiryShareText copies model and qop buying details', () {
    final text = productInquiryShareText(
      product.copyWithDescriptionForTest(fabric: 'Suprem'),
      item: CartItem(
        product: product.copyWithDescriptionForTest(fabric: 'Suprem'),
        quantity: 2,
      ),
    );

    expect(text, contains('Milana Premium model'));
    expect(text, contains('Model: F-2219'));
    expect(text, contains(r'Dona narxi: $4.50'));
    expect(text, contains(r'Qop: 60 ta kiyim · $270.00'));
    expect(text, contains('44×10, 46×10, 48×10, 50×10, 52×10, 54×10'));
    expect(text, contains('Mavjudlik: 12 qop'));
    expect(text, contains('Menejer: +998501551010'));
  });

  test('product presentation follows the selected pack rule', () {
    const pack = CartItem(product: product, unitType: packUnitType);

    expect(
      productSpecs(
        product,
        pack,
      ).firstWhere((spec) => spec.label == 'Buyurtma turi').value,
      'Qadoq · 6 dona',
    );
    expect(productInquiryShareText(product, item: pack), contains('Qadoq: 6'));
  });
}

extension on Product {
  Product copyWithDescriptionForTest({String? fabric}) {
    return Product(
      id: id,
      slug: slug,
      name: name,
      gender: gender,
      category: category,
      price: price,
      sizes: sizes,
      images: images,
      modelNo: modelNo,
      variant: variant,
      fabric: fabric ?? this.fabric,
      description: description,
      rating: rating,
      reviews: reviews,
      active: active,
      availableQop: availableQop,
    );
  }
}
