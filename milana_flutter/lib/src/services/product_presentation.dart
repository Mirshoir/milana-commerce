import '../models/cart_item.dart';
import '../models/product.dart';
import '../localization/app_localization.dart';

String genderLabel(String gender, {String languageCode = defaultLanguageCode}) {
  return switch (gender) {
    'men' => localizedText('catalog.gender.men', languageCode: languageCode),
    'kids' => localizedText('catalog.gender.kids', languageCode: languageCode),
    'women' => localizedText(
      'catalog.gender.women',
      languageCode: languageCode,
    ),
    _ => localizedText('catalog.gender.all', languageCode: languageCode),
  };
}

String categoryLabel(
  String category, {
  String languageCode = defaultLanguageCode,
}) {
  return switch (category) {
    'pajamas' => localizedText(
      'catalog.category.pajamas',
      languageCode: languageCode,
    ),
    'robes' => localizedText(
      'catalog.category.robes',
      languageCode: languageCode,
    ),
    'homewear' => localizedText(
      'catalog.category.homewear',
      languageCode: languageCode,
    ),
    'loungewear' => localizedText(
      'catalog.category.loungewear',
      languageCode: languageCode,
    ),
    'family' => localizedText(
      'catalog.category.family',
      languageCode: languageCode,
    ),
    _ => localizedText('catalog.category.default', languageCode: languageCode),
  };
}

List<ProductSpec> productSpecs(
  Product product,
  CartItem item, {
  String languageCode = defaultLanguageCode,
}) {
  return [
    ProductSpec(
      label: localizedText('product.spec.model', languageCode: languageCode),
      value: product.modelNo.isEmpty ? product.name : product.modelNo,
    ),
    ProductSpec(
      label: localizedText('product.spec.gender', languageCode: languageCode),
      value: genderLabel(product.gender, languageCode: languageCode),
    ),
    ProductSpec(
      label: localizedText('product.spec.category', languageCode: languageCode),
      value: categoryLabel(product.category, languageCode: languageCode),
    ),
    ProductSpec(
      label: localizedText(
        'product.spec.order_type',
        languageCode: languageCode,
      ),
      value:
          '${orderUnitLabel(item.unitType, languageCode: languageCode)} · '
          '${localizedText('product.unit', languageCode: languageCode, args: {'count': '${item.piecesPerUnit}'})}',
    ),
    if (product.material.isNotEmpty)
      ProductSpec(
        label: localizedText(
          'product.spec.material',
          languageCode: languageCode,
        ),
        value: product.material,
      ),
    if (product.composition.isNotEmpty)
      ProductSpec(
        label: localizedText(
          'product.spec.composition',
          languageCode: languageCode,
        ),
        value: product.composition,
      ),
    if (product.season.isNotEmpty)
      ProductSpec(
        label: localizedText('product.spec.season', languageCode: languageCode),
        value: product.season,
      ),
    if (product.availableQop != null)
      ProductSpec(
        label: localizedText('product.spec.stock', languageCode: languageCode),
        value:
            '${_stockLabel(product.availableQop!)} ${localizedText('product.unit.bag', languageCode: languageCode)}',
      ),
  ];
}

List<ProductHighlight> productHighlights(
  Product product, {
  String languageCode = defaultLanguageCode,
}) {
  return [
    ProductHighlight(
      title: localizedText(
        'product.highlight.manager',
        languageCode: languageCode,
      ),
      text: localizedText('product.highlight.pack', languageCode: languageCode),
    ),
    ProductHighlight(
      title: localizedText(
        'product.highlight.payment',
        languageCode: languageCode,
      ),
      text: localizedText(
        'product.highlight.delivery_cost',
        languageCode: languageCode,
      ),
    ),
    ProductHighlight(
      title: product.preorder
          ? localizedText(
              'product.highlight.preorder',
              languageCode: languageCode,
            )
          : !product.canOrderWholesale
          ? localizedText(
              'product.highlight.unavailable',
              languageCode: languageCode,
            )
          : product.price > 0
          ? localizedText(
              'product.highlight.price_confirmed',
              languageCode: languageCode,
            )
          : localizedText(
              'product.highlight.with_manager',
              languageCode: languageCode,
            ),
      text: product.availableQop == null
          ? localizedText(
              'product.highlight.pending_confirmation',
              languageCode: languageCode,
            )
          : localizedText(
              'product.highlight.stock',
              languageCode: languageCode,
              args: {'count': _stockLabel(product.availableQop!)},
            ),
    ),
  ];
}

String productInquiryShareText(
  Product product, {
  CartItem? item,
  String managerPhone = '+998501551010',
  String languageCode = defaultLanguageCode,
}) {
  final qopItem = item ?? CartItem(product: product);
  final mix = qopItem.sizeMix
      .map((row) => '${row['size']}×${row['qty']}')
      .join(', ');
  final available = product.availableQop == null
      ? localizedText(
          'product.availability.manager',
          languageCode: languageCode,
        )
      : product.availableQop! <= 0
      ? localizedText(
          'product.availability.out_of_stock',
          languageCode: languageCode,
        )
      : '${_stockLabel(product.availableQop!)} ${localizedText('product.unit.bag', languageCode: languageCode)}';
  final lines = [
    localizedText('product.share.title', languageCode: languageCode),
    '${localizedText('product.share.model', languageCode: languageCode)}: ${product.name}',
    '${localizedText('product.share.gender', languageCode: languageCode)}: '
        '${genderLabel(product.gender, languageCode: languageCode)}',
    '${localizedText('product.share.category', languageCode: languageCode)}: '
        '${categoryLabel(product.category, languageCode: languageCode)}',
    if (product.fabric.isNotEmpty) 'Mato: ${product.fabric}',
    '${localizedText('product.share.price_per_item', languageCode: languageCode)}: \$${product.price.toStringAsFixed(2)}',
    '${localizedText('product.share.unit', languageCode: languageCode)}: ${qopItem.piecesPerUnit} ${localizedText('product.unit.item', languageCode: languageCode)} · \$${qopItem.packagePrice.toStringAsFixed(2)}',
    '${localizedText('product.share.size_mix', languageCode: languageCode)}: $mix',
    '${localizedText('product.share.availability', languageCode: languageCode)}: $available',
    '${localizedText('product.share.manager', languageCode: languageCode)}: $managerPhone',
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
