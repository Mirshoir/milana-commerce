import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/product.dart';

void main() {
  test('preserves and selects every catalog language from API maps', () {
    final product = Product.fromJson({
      'id': 1167,
      'name': 'Ананас жёлтый подростковый футболка-шорты',
      'gender': 'kids',
      'product_type': 'set',
      'price': 4.7,
      'images': ['/uploads/product.webp'],
      'desc': {
        'uz': 'Suratdagi mahsulot turi: to‘plam. Rang — sariq.',
        'ru': 'Тип изделия на фото: комплект. Цвет — жёлтый.',
        'en': 'Product type shown in the photo: set. Color — yellow.',
      },
      'fabric': {'uz': 'Paxta', 'ru': 'Хлопок', 'en': 'Cotton'},
    });

    expect(product.nameFor('ru'), contains('Ананас'));
    expect(product.nameFor('uz'), 'To‘plam');
    expect(product.nameFor('en'), 'Set');
    expect(product.descriptionFor('uz'), contains('sariq'));
    expect(product.descriptionFor('ru'), contains('жёлтый'));
    expect(product.descriptionFor('en'), contains('yellow'));
    expect(product.fabricFor('uz'), 'Paxta');
    expect(product.fabricFor('ru'), 'Хлопок');
    expect(product.fabricFor('en'), 'Cotton');
  });

  test('uses explicit localized product names before generated fallback', () {
    final product = Product.fromJson({
      'id': 7,
      'name': {
        'uz': 'Sariq to‘plam',
        'ru': 'Жёлтый комплект',
        'en': 'Yellow set',
      },
      'description': {
        'uz': 'Mahsulot turi: to‘plam.',
        'ru': 'Тип изделия: комплект.',
        'en': 'Product type: set.',
      },
    });

    expect(product.nameFor('uz'), 'Sariq to‘plam');
    expect(product.nameFor('ru'), 'Жёлтый комплект');
    expect(product.nameFor('en'), 'Yellow set');
  });

  test('localized catalog fields survive cache serialization', () {
    final original = Product.fromJson({
      'id': 8,
      'name': 'Пижама',
      'description_i18n': {
        'uz': 'Yumshoq pijama',
        'ru': 'Мягкая пижама',
        'en': 'Soft pajamas',
      },
      'material_i18n': {'uz': 'Paxta', 'ru': 'Хлопок', 'en': 'Cotton'},
    });

    final restored = Product.fromJson(original.toJson());

    expect(restored.descriptionFor('uz'), 'Yumshoq pijama');
    expect(restored.descriptionFor('en'), 'Soft pajamas');
    expect(restored.materialFor('ru'), 'Хлопок');
  });
}
