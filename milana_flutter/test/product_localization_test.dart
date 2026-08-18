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

  test('uses administrator-reviewed website copy for detail title', () {
    final product = Product.fromJson({
      'id': 11,
      'model_no': 'PM-7007',
      'name_i18n': {
        'uz': 'Katak yoqali erkaklar pijama kalta yeng',
        'ru': 'Мужская пижама в клетку',
        'en': "Plaid collared men's pajama set",
      },
      'desc': {
        'uz': 'Erkaklar uchun katak naqshli va kalta yengli pijama.',
        'ru': 'Мужская пижама в клетку с коротким рукавом.',
        'en': "Men's plaid pajamas with short sleeves.",
      },
      'copy_manual': true,
    });

    expect(
      product.detailTitleFor('uz'),
      'Erkaklar uchun katak naqshli va kalta yengli pijama.',
    );
    expect(product.nameFor('uz'), 'Katak yoqali erkaklar pijama kalta yeng');
  });

  test('uses website descriptions for every product with a safe fallback', () {
    final websiteProduct = Product.fromJson({
      'id': 12,
      'name_i18n': {'uz': 'Qora xalat'},
      'desc': {'uz': 'Suratdagi mahsulot turi: xalat.'},
      'copy_manual': false,
    });
    final oversized = Product.fromJson({
      'id': 13,
      'name_i18n': {'uz': 'Qora tunika'},
      'desc': {'uz': List.filled(161, 'a').join()},
      'copy_manual': true,
    });

    expect(
      websiteProduct.detailTitleFor('uz'),
      'Suratdagi mahsulot turi: xalat.',
    );
    expect(oversized.detailTitleFor('uz'), 'Qora tunika');
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
      'care': {
        'uz': '30°C da yuving',
        'ru': 'Стирать при 30°C',
        'en': 'Wash at 30°C',
      },
      'size_chart': 'https://example.test/size-chart.webp',
      'color': 'Blue',
      'country': 'Uzbekistan',
      'like_count': 14,
      'views': 210,
      'colors': ['Blue', 'White'],
      'copy_manual': true,
      'category': 'Пижамы',
      'catalog_panel': 'pajamas',
      'old_price': 8.5,
      'wholesale_price': 7.5,
      'wholesale_moq': 6,
      'retail_enabled': true,
      'retail_price': 9,
      'retail_stock': 120,
      'can_order_retail': true,
      'price_visible': true,
      'price_label': 'public',
      'price_source': 'public_catalog',
      'price_discount': 1,
      'assigned_manager': 'manager-1',
      'sort': 42,
      'created_at': '2026-08-18 10:00:00',
      'availability_wholesale': {
        'status': 'in_stock',
        'tracked': true,
        'available': true,
        'remaining_qop': 2.5,
      },
      'availability_retail': {
        'status': 'in_stock',
        'tracked': true,
        'available': true,
        'remaining_units': 120,
      },
    });

    final restored = Product.fromJson(original.toJson());

    expect(restored.descriptionFor('uz'), 'Yumshoq pijama');
    expect(restored.descriptionFor('en'), 'Soft pajamas');
    expect(restored.materialFor('ru'), 'Хлопок');
    expect(restored.careFor('uz'), '30°C da yuving');
    expect(restored.sizeChart, 'https://example.test/size-chart.webp');
    expect(restored.color, 'Blue');
    expect(restored.country, 'Uzbekistan');
    expect(restored.likeCount, 14);
    expect(restored.views, 210);
    expect(restored.colors, ['Blue', 'White']);
    expect(restored.copyManual, isTrue);
    expect(restored.sourceCategory, 'Пижамы');
    expect(restored.catalogPanel, 'pajamas');
    expect(restored.oldPrice, 8.5);
    expect(restored.wholesalePrice, 7.5);
    expect(restored.wholesaleMoq, 6);
    expect(restored.retailEnabled, isTrue);
    expect(restored.retailPrice, 9);
    expect(restored.retailStock, 120);
    expect(restored.canOrderRetail, isTrue);
    expect(restored.priceVisible, isTrue);
    expect(restored.priceLabel, 'public');
    expect(restored.priceSource, 'public_catalog');
    expect(restored.priceDiscount, 1);
    expect(restored.assignedManager, 'manager-1');
    expect(restored.sortOrder, 42);
    expect(restored.createdAt, '2026-08-18 10:00:00');
    expect(restored.wholesaleAvailability.remainingQop, 2.5);
    expect(restored.retailAvailability.remainingUnits, 120);
  });

  test('does not invent ratings absent from the website response', () {
    final product = Product.fromJson({'id': 99, 'name': 'Pijama'});

    expect(product.rating, 0);
    expect(product.reviews, 0);
  });
}
