import '../models/cart_item.dart';
import '../models/product.dart';

String genderLabel(String gender) {
  return switch (gender) {
    'men' => 'Erkaklar',
    'kids' => 'Bolalar',
    'women' => 'Ayollar',
    _ => 'Hamma uchun',
  };
}

String categoryLabel(String category) {
  return switch (category) {
    'pajamas' => 'Pijama',
    'robes' => 'Xalat',
    'homewear' => 'Uy kiyimi',
    'loungewear' => 'Lounge to‘plam',
    _ => 'Kiyim',
  };
}

List<ProductSpec> productSpecs(Product product, CartItem item) {
  return [
    ProductSpec(
      label: 'Model',
      value: product.modelNo.isEmpty ? product.name : product.modelNo,
    ),
    ProductSpec(label: 'Bo‘lim', value: genderLabel(product.gender)),
    ProductSpec(label: 'Kategoriya', value: categoryLabel(product.category)),
    ProductSpec(
      label: 'Qop tarkibi',
      value: '${item.mixSizes.length} o‘lcham × $qtyPerSize',
    ),
    if (product.availableQop != null)
      ProductSpec(label: 'Mavjud qop', value: '${product.availableQop} qop'),
  ];
}

List<ProductHighlight> productHighlights(Product product) {
  return [
    const ProductHighlight(
      title: 'Optom savdo',
      text: 'Minimal buyurtma: 1 modeldan 1 qop.',
    ),
    const ProductHighlight(
      title: 'Cargo / pochta',
      text: 'Yetkazib berish xarajati mijoz tomonidan to‘lanadi.',
    ),
    ProductHighlight(
      title: product.availableQop == 0
          ? 'Mavjudlik tugagan'
          : product.price > 0
          ? 'Narx tasdiqlanadi'
          : 'Menejer bilan',
      text: product.availableQop == null
          ? 'Mavjudlik va to‘lov menejer orqali yakuniy tasdiqlanadi.'
          : 'ERP bo‘yicha qop soni: ${product.availableQop}. Yakuniy tasdiq menejer orqali.',
    ),
  ];
}

String productInquiryShareText(
  Product product, {
  CartItem? item,
  String managerPhone = '+998501551010',
}) {
  final qopItem = item ?? CartItem(product: product);
  final mix = qopItem.mixSizes.map((size) => '$size×$qtyPerSize').join(', ');
  final available = product.availableQop == null
      ? 'Menejer tasdiqlaydi'
      : product.availableQop! <= 0
      ? 'Mavjud emas'
      : '${product.availableQop} qop';
  final lines = [
    'Milana Premium model',
    'Model: ${product.name}',
    'Bo‘lim: ${genderLabel(product.gender)}',
    'Kategoriya: ${categoryLabel(product.category)}',
    if (product.fabric.isNotEmpty) 'Mato: ${product.fabric}',
    'Dona narxi: \$${product.price.toStringAsFixed(2)}',
    '1 qop: $bagSize ta kiyim · \$${qopItem.bagPrice.toStringAsFixed(2)}',
    'Qop tarkibi: $mix',
    'Mavjudlik: $available',
    'Menejer: $managerPhone',
  ];
  return lines.join('\n');
}

class ProductSpec {
  const ProductSpec({required this.label, required this.value});

  final String label;
  final String value;
}

class ProductHighlight {
  const ProductHighlight({required this.title, required this.text});

  final String title;
  final String text;
}
