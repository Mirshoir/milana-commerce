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
    'family' => 'Oilaviy to‘plam',
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
      label: 'Buyurtma turi',
      value: '${orderUnitLabel(item.unitType)} · ${item.piecesPerUnit} dona',
    ),
    if (product.material.isNotEmpty)
      ProductSpec(label: 'Material', value: product.material),
    if (product.composition.isNotEmpty)
      ProductSpec(label: 'Tarkib', value: product.composition),
    if (product.season.isNotEmpty)
      ProductSpec(label: 'Mavsum', value: product.season),
    if (product.availableQop != null)
      ProductSpec(
        label: 'Omborda',
        value: '${_stockLabel(product.availableQop!)} qop ekvivalenti',
      ),
  ];
}

List<ProductHighlight> productHighlights(Product product) {
  return [
    ProductHighlight(
      title: 'Qadoq yoki qop',
      text:
          'Minimal buyurtma ${product.orderUnitFor(packUnitType).pieces} donalik qadoqdan boshlanadi. Qopda 60 dona.',
    ),
    const ProductHighlight(
      title: 'Cargo / pochta',
      text: 'Yetkazib berish xarajati mijoz tomonidan to‘lanadi.',
    ),
    ProductHighlight(
      title: product.preorder
          ? 'Oldindan buyurtma'
          : !product.canOrderWholesale
          ? 'Hozircha mavjud emas'
          : product.price > 0
          ? 'Narx tasdiqlanadi'
          : 'Menejer bilan',
      text: product.availableQop == null
          ? 'Mavjudlik va to‘lov menejer orqali yakuniy tasdiqlanadi.'
          : 'Ombor qoldig‘i: ${_stockLabel(product.availableQop!)} qop ekvivalenti. Yakuniy tasdiq menejer orqali.',
    ),
  ];
}

String productInquiryShareText(
  Product product, {
  CartItem? item,
  String managerPhone = '+998501551010',
}) {
  final qopItem = item ?? CartItem(product: product);
  final mix = qopItem.sizeMix
      .map((row) => '${row['size']}×${row['qty']}')
      .join(', ');
  final available = product.availableQop == null
      ? 'Menejer tasdiqlaydi'
      : product.availableQop! <= 0
      ? 'Mavjud emas'
      : '${_stockLabel(product.availableQop!)} qop';
  final lines = [
    'Milana Premium model',
    'Model: ${product.name}',
    'Bo‘lim: ${genderLabel(product.gender)}',
    'Kategoriya: ${categoryLabel(product.category)}',
    if (product.fabric.isNotEmpty) 'Mato: ${product.fabric}',
    'Dona narxi: \$${product.price.toStringAsFixed(2)}',
    '${orderUnitLabel(qopItem.unitType)}: ${qopItem.piecesPerUnit} ta kiyim · \$${qopItem.packagePrice.toStringAsFixed(2)}',
    'O‘lcham tarkibi: $mix',
    'Mavjudlik: $available',
    'Menejer: $managerPhone',
  ];
  return lines.join('\n');
}

String _stockLabel(double value) {
  return value == value.roundToDouble()
      ? value.toInt().toString()
      : value.toStringAsFixed(1);
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
