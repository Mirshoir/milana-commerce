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
    expect(genderLabel('women', languageCode: 'uz'), 'Ayollar');
    expect(genderLabel('men', languageCode: 'uz'), 'Erkaklar');
    expect(genderLabel('kids', languageCode: 'uz'), 'Bolalar');
    expect(categoryLabel('homewear', languageCode: 'uz'), 'Uy kiyimi');
    expect(categoryLabel('loungewear', languageCode: 'uz'), 'Uyda kiyinadigan');
  });

  test('productSpecs exposes model department category and order unit', () {
    final specs = productSpecs(
      product,
      const CartItem(product: product),
      languageCode: 'uz',
    );

    expect(specs.map((spec) => spec.label), [
      'Model',
      'Jins',
      'Kategoriya',
      'Buyurtma formati',
      'O‘lcham qatori',
      'Mavjud',
    ]);
    expect(specs.map((spec) => spec.value), [
      'F-2219',
      'Ayollar',
      'Uy kiyimi',
      'Qop · 60 dona',
      '44 · 46 · 48 · 50 · 52 · 54',
      '12 qop',
    ]);
  });

  test('PM-7007 presentation matches every website-owned field', () {
    final websiteProduct = Product.fromJson({
      'id': 11,
      'slug': 'pm-7007-v3766',
      'model_no': 'PM-7007',
      'name_i18n': {
        'uz': 'Katak yoqali erkaklar pijama kalta yeng',
        'ru': 'Пижама',
        'en': "Plaid collared men's pajama set, short sleeve",
      },
      'desc': {
        'uz': 'Erkaklar uchun katak naqshli va kalta yengli pijama.',
        'ru': 'Мужская пижама в клетку с коротким рукавом.',
        'en': "Men's plaid pajamas with short sleeves.",
      },
      'gender': 'men',
      'category': 'Пижамы',
      'catalog_panel': 'men',
      'product_type': 'pajamas',
      'price': 7.8,
      'material': 'Супрем',
      'composition': '100% Хлопок',
      'season': 'Демисезонный',
      'country': 'Узбекистан',
      'sizes': ['48', '50', '52', '54', '56', '58'],
      'available_qop': 2.7,
    });

    expect(
      websiteProduct.detailTitleFor('uz'),
      'Erkaklar uchun katak naqshli va kalta yengli pijama.',
    );
    expect(
      websiteProduct.detailTitleFor('ru'),
      'Мужская пижама в клетку с коротким рукавом.',
    );
    expect(
      websiteProduct.detailTitleFor('en'),
      "Men's plaid pajamas with short sleeves.",
    );

    final specs = productSpecs(
      websiteProduct,
      CartItem(product: websiteProduct, unitType: packUnitType),
      languageCode: 'uz',
    );
    final values = {for (final spec in specs) spec.label: spec.value};

    expect(values['Kategoriya'], 'Erkaklar');
    expect(values['Matoga oid'], 'Suprem');
    expect(values['Kompozitsiya'], '100% Paxta');
    expect(values['Mavsum'], 'Mavsum oralig‘i');
    expect(values['Mamlakat'], 'O‘zbekiston');
    expect(values['O‘lcham qatori'], '48 · 50 · 52 · 54 · 56 · 58');
  });

  test('productHighlights describe wholesale buying rules', () {
    final highlights = productHighlights(product, languageCode: 'uz');

    expect(highlights, hasLength(3));
    expect(highlights.first.title, 'Menejer tasdig‘i');
    expect(
      highlights.first.text,
      'Qadoqdan boshlang yoki to‘liq qop tanlang. Narx, qoldiq va jo‘natishni menejer yakuniy tasdiqlaydi.',
    );
    expect(highlights[1].title, 'To‘lov va Cargo');
    expect(highlights[1].text, 'Yetkazib berish xarajatini mijoz to‘laydi.');
    expect(highlights[2].title, 'Narx tasdiqlandi');
    expect(highlights[2].text, 'Qoldiq: 12 dona');
  });

  test('productInquiryShareText copies model and qop buying details', () {
    final text = productInquiryShareText(
      product.copyWithDescriptionForTest(fabric: 'Suprem'),
      item: CartItem(
        product: product.copyWithDescriptionForTest(fabric: 'Suprem'),
        quantity: 2,
      ),
      languageCode: 'uz',
    );

    expect(text, contains('Model ma’lumoti'));
    expect(text, contains('Model: F-2219'));
    expect(text, contains(r'Bitta dona narxi: $4.50'));
    expect(text, contains(r'O‘lchov: 60 dona · $270.00'));
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
        languageCode: 'uz',
      ).firstWhere((spec) => spec.label == 'Buyurtma formati').value,
      'Qadoq · 6 dona',
    );
    expect(
      productInquiryShareText(product, item: pack, languageCode: 'uz'),
      contains(r'O‘lchov: 6 dona · $27.00'),
    );
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
