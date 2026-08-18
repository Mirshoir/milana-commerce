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
    'tunic' => _productTypeValue('tunic', languageCode),
    'sarochka' => _productTypeValue('sarochka', languageCode),
    'set' => _productTypeValue('set', languageCode),
    'tracksuit' => _productTypeValue('tracksuit', languageCode),
    'hoodie' => _productTypeValue('hoodie', languageCode),
    'dress' => _productTypeValue('dress', languageCode),
    'shirt' => _productTypeValue('shirt', languageCode),
    'polo' => _productTypeValue('polo', languageCode),
    'trousers' => _productTypeValue('trousers', languageCode),
    'tshirt' => _productTypeValue('tshirt', languageCode),
    'capri' => _productTypeValue('capri', languageCode),
    'shorts' => _productTypeValue('shorts', languageCode),
    'top' => _productTypeValue('top', languageCode),
    'clothing' => _productTypeValue('clothing', languageCode),
    _ => localizedText('catalog.category.default', languageCode: languageCode),
  };
}

String websiteCatalogLabel(
  Product product, {
  String languageCode = defaultLanguageCode,
}) {
  final language = normalizeLanguageCode(languageCode);
  final panel = _normalizeWebsiteValue(product.catalogPanel);
  final panelValue = _websitePanelValues[language]?[panel];
  if (panelValue != null && panelValue.isNotEmpty) return panelValue;

  final category = _normalizeWebsiteValue(product.sourceCategory);
  final categoryType = _websiteCategoryAliases[category];
  if (categoryType != null) {
    return categoryLabel(categoryType, languageCode: languageCode);
  }
  return categoryLabel(product.category, languageCode: languageCode);
}

String websiteProductFieldValue(
  String kind,
  String value, {
  String languageCode = defaultLanguageCode,
}) {
  final language = normalizeLanguageCode(languageCode);
  final raw = value.trim();
  if (raw.isEmpty) return '';
  final alias = _websiteFieldAliases[kind]?[_normalizeWebsiteValue(raw)];
  if (alias != null) {
    return _websiteFieldValues[language]?[alias] ?? raw;
  }
  if (kind != 'composition') return raw;
  var translated = raw;
  for (final fiber in _websiteFiberPatterns.entries) {
    translated = translated.replaceAll(
      fiber.value,
      _websiteFieldValues[language]?[fiber.key] ?? fiber.key,
    );
  }
  return translated;
}

String websiteMaterialValue(
  Product product, {
  String languageCode = defaultLanguageCode,
}) {
  final material = product.materialFor(languageCode);
  if (material.isNotEmpty) {
    return websiteProductFieldValue(
      'material',
      material,
      languageCode: languageCode,
    );
  }
  return product.fabricFor(languageCode);
}

String _productTypeValue(String type, String languageCode) {
  final language = normalizeLanguageCode(languageCode);
  return _websiteProductTypeValues[language]?[type] ?? type;
}

String _normalizeWebsiteValue(String value) => value
    .toLowerCase()
    .replaceAll(RegExp(r'[’‘`ʻ]'), "'")
    .replaceAll(RegExp(r'[-_]+'), ' ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

const _websiteProductTypeValues = <String, Map<String, String>>{
  'en': {
    'tunic': 'Tunic',
    'sarochka': 'Sarochka',
    'set': 'Set',
    'tracksuit': 'Tracksuit',
    'hoodie': 'Hoodie',
    'dress': 'Dress',
    'shirt': 'Shirt',
    'polo': 'Polo',
    'trousers': 'Trousers',
    'tshirt': 'T-shirt',
    'capri': 'Capri',
    'shorts': 'Shorts',
    'top': 'Top',
    'clothing': 'Clothing',
  },
  'ru': {
    'tunic': 'Туника',
    'sarochka': 'Сорочка',
    'set': 'Комплект',
    'tracksuit': 'Спортивный костюм',
    'hoodie': 'Худи',
    'dress': 'Платье',
    'shirt': 'Рубашка',
    'polo': 'Поло',
    'trousers': 'Штаны',
    'tshirt': 'Футболка',
    'capri': 'Бриджи',
    'shorts': 'Шорты',
    'top': 'Майка',
    'clothing': 'Одежда',
  },
  'uz': {
    'tunic': 'Tunika',
    'sarochka': 'Sarochka',
    'set': 'To‘plam',
    'tracksuit': 'Sport kostyumi',
    'hoodie': 'Xudi',
    'dress': 'Ko‘ylak',
    'shirt': 'Ko‘ylak',
    'polo': 'Polo',
    'trousers': 'Shim',
    'tshirt': 'Futbolka',
    'capri': 'Kapri',
    'shorts': 'Shorti',
    'top': 'Mayka',
    'clothing': 'Kiyim',
  },
};

const _websitePanelValues = <String, Map<String, String>>{
  'en': {
    'pajamas': 'Pajamas',
    'robes': 'Robes',
    'men': 'Men',
    'tunics': 'Tunics',
    'trousers': 'Trousers',
    'nightgowns': 'Sarochka',
    'sets': 'Two-piece sets',
    'clothing sets': 'Clothing set',
    'tshirts': 'T-shirts',
    'kids': 'Kids',
  },
  'ru': {
    'pajamas': 'Пижамы',
    'robes': 'Халаты',
    'men': 'Мужское',
    'tunics': 'Туники',
    'trousers': 'Штаны',
    'nightgowns': 'Сорочки',
    'sets': 'Двойки',
    'clothing sets': 'Комплект одежды',
    'tshirts': 'Футболки',
    'kids': 'Детское',
  },
  'uz': {
    'pajamas': 'Pijamalar',
    'robes': 'Xalatlar',
    'men': 'Erkaklar',
    'tunics': 'Tunikalar',
    'trousers': 'Shimlar',
    'nightgowns': 'Sarochka',
    'sets': 'Ikki qismli to‘plam',
    'clothing sets': 'Kiyim to‘plami',
    'tshirts': 'Futbolkalar',
    'kids': 'Bolalar',
  },
};

const _websiteCategoryAliases = <String, String>{
  'pajama': 'pajamas',
  'pajamas': 'pajamas',
  'пижама': 'pajamas',
  'пижамы': 'pajamas',
  'pijama': 'pajamas',
  'pijamalar': 'pajamas',
  'robe': 'robes',
  'robes': 'robes',
  'халат': 'robes',
  'халаты': 'robes',
  'xalat': 'robes',
  'xalatlar': 'robes',
  'туника': 'tunic',
  'туники': 'tunic',
  'сорочка': 'sarochka',
  'сорочки': 'sarochka',
  'комплект': 'set',
  'комплекты': 'set',
  'двойка': 'set',
  'брюки': 'trousers',
  'штаны': 'trousers',
  'футболка': 'tshirt',
  'футболки': 'tshirt',
  'худи': 'hoodie',
  'рубашка': 'shirt',
};

const _websiteFieldValues = <String, Map<String, String>>{
  'en': {
    'country.uzbekistan': 'Uzbekistan',
    'season.all': 'All-season',
    'season.summer': 'Summer',
    'season.demi': 'Demi-season',
    'season.winter': 'Winter',
    'material.bamboo': 'Bamboo fabric',
    'material.cotton': 'Cotton fabric',
    'material.viscose': 'Viscose fabric',
    'material.silk': 'Silk fabric',
    'material.satin': 'Satin fabric',
    'material.muslin': 'Muslin',
    'material.modal': 'Modal fabric',
    'material.velour': 'Velour',
    'material.brushedKnit': 'Brushed knit',
    'material.suprem': 'Suprem',
    'material.ribKnit': 'Rib knit',
    'material.staple': 'Staple',
    'material.twoThread': 'Two-thread knit',
    'material.threeThread': 'Three-thread knit',
    'material.knit': 'Knit',
    'material.polyester': 'Polyester fabric',
    'fiber.cotton': 'Cotton',
    'fiber.polyester': 'Polyester',
    'fiber.elastane': 'Elastane',
    'fiber.viscose': 'Viscose',
    'fiber.spandex': 'Spandex',
    'color.burgundy': 'Burgundy',
    'color.black': 'Black',
    'color.white': 'White',
    'color.red': 'Red',
    'color.blue': 'Blue',
    'color.green': 'Green',
    'color.grey': 'Grey',
    'color.beige': 'Beige',
    'color.brown': 'Brown',
    'color.pink': 'Pink',
    'color.purple': 'Purple',
    'color.yellow': 'Yellow',
  },
  'ru': {
    'country.uzbekistan': 'Узбекистан',
    'season.all': 'Всесезон',
    'season.summer': 'Лето',
    'season.demi': 'Демисезон',
    'season.winter': 'Зима',
    'material.bamboo': 'Бамбуковая ткань',
    'material.cotton': 'Хлопковая ткань',
    'material.viscose': 'Вискозная ткань',
    'material.silk': 'Шёлковая ткань',
    'material.satin': 'Атласная ткань',
    'material.muslin': 'Муслин',
    'material.modal': 'Ткань модал',
    'material.velour': 'Велюр',
    'material.brushedKnit': 'Трикотаж с начёсом',
    'material.suprem': 'Супрем',
    'material.ribKnit': 'Трикотаж рибана',
    'material.staple': 'Штапель',
    'material.twoThread': 'Двухниточный трикотаж',
    'material.threeThread': 'Трёхниточный трикотаж',
    'material.knit': 'Трикотаж',
    'material.polyester': 'Полиэстеровая ткань',
    'fiber.cotton': 'Хлопок',
    'fiber.polyester': 'Полиэстер',
    'fiber.elastane': 'Эластан',
    'fiber.viscose': 'Вискоза',
    'fiber.spandex': 'Спандекс',
    'color.burgundy': 'Бордовый',
    'color.black': 'Чёрный',
    'color.white': 'Белый',
    'color.red': 'Красный',
    'color.blue': 'Синий',
    'color.green': 'Зелёный',
    'color.grey': 'Серый',
    'color.beige': 'Бежевый',
    'color.brown': 'Коричневый',
    'color.pink': 'Розовый',
    'color.purple': 'Фиолетовый',
    'color.yellow': 'Жёлтый',
  },
  'uz': {
    'country.uzbekistan': 'O‘zbekiston',
    'season.all': 'Barcha mavsum',
    'season.summer': 'Yoz',
    'season.demi': 'Mavsum oralig‘i',
    'season.winter': 'Qish',
    'material.bamboo': 'Bambuk mato',
    'material.cotton': 'Paxta mato',
    'material.viscose': 'Viskoza mato',
    'material.silk': 'Ipak mato',
    'material.satin': 'Atlas mato',
    'material.muslin': 'Muslin',
    'material.modal': 'Modal mato',
    'material.velour': 'Velur',
    'material.brushedKnit': 'Tukli trikotaj',
    'material.suprem': 'Suprem',
    'material.ribKnit': 'Ribana trikotaj',
    'material.staple': 'Shtapel',
    'material.twoThread': 'Ikki ipli trikotaj',
    'material.threeThread': 'Uch ipli trikotaj',
    'material.knit': 'Trikotaj',
    'material.polyester': 'Poliester mato',
    'fiber.cotton': 'Paxta',
    'fiber.polyester': 'Poliester',
    'fiber.elastane': 'Elastan',
    'fiber.viscose': 'Viskoza',
    'fiber.spandex': 'Spandeks',
    'color.burgundy': 'Bordo',
    'color.black': 'Qora',
    'color.white': 'Oq',
    'color.red': 'Qizil',
    'color.blue': 'Ko‘k',
    'color.green': 'Yashil',
    'color.grey': 'Kulrang',
    'color.beige': 'Bej',
    'color.brown': 'Jigarrang',
    'color.pink': 'Pushti',
    'color.purple': 'Binafsha',
    'color.yellow': 'Sariq',
  },
};

const _websiteFieldAliases = <String, Map<String, String>>{
  'country': {
    'uzbekistan': 'country.uzbekistan',
    'узбекистан': 'country.uzbekistan',
    "o'zbekiston": 'country.uzbekistan',
  },
  'season': {
    'all season': 'season.all',
    'всесезон': 'season.all',
    'всесезонный': 'season.all',
    'barcha mavsum': 'season.all',
    'summer': 'season.summer',
    'лето': 'season.summer',
    'летний': 'season.summer',
    'yoz': 'season.summer',
    'demi season': 'season.demi',
    'демисезон': 'season.demi',
    'демисезонный': 'season.demi',
    "mavsum oralig'i": 'season.demi',
    'winter': 'season.winter',
    'зима': 'season.winter',
    'зимний': 'season.winter',
    'qish': 'season.winter',
  },
  'material': {
    'бамбуковая ткань': 'material.bamboo',
    'bamboo': 'material.bamboo',
    'хлопковая ткань': 'material.cotton',
    'cotton fabric': 'material.cotton',
    'вискозная ткань': 'material.viscose',
    'viscose fabric': 'material.viscose',
    'шёлковая ткань': 'material.silk',
    'шелковая ткань': 'material.silk',
    'silk fabric': 'material.silk',
    'атласная ткань': 'material.satin',
    'satin': 'material.satin',
    'муслин': 'material.muslin',
    'muslin': 'material.muslin',
    'ткань модал': 'material.modal',
    'modal': 'material.modal',
    'велюр': 'material.velour',
    'velour': 'material.velour',
    'трикотаж с начёсом': 'material.brushedKnit',
    'трикотаж с начесом': 'material.brushedKnit',
    'brushed knit': 'material.brushedKnit',
    'супрем': 'material.suprem',
    'трикотаж супрем': 'material.suprem',
    'suprem': 'material.suprem',
    'трикотаж лапша': 'material.ribKnit',
    'ажурная рибана': 'material.ribKnit',
    'rib knit': 'material.ribKnit',
    'штапель': 'material.staple',
    'staple': 'material.staple',
    'двухнитка': 'material.twoThread',
    'двухниточный трикотаж': 'material.twoThread',
    'two thread knit': 'material.twoThread',
    'трёхнитка': 'material.threeThread',
    'трехнитка': 'material.threeThread',
    'трёхниточный трикотаж': 'material.threeThread',
    'трехниточный трикотаж': 'material.threeThread',
    'three thread knit': 'material.threeThread',
    'трикотаж': 'material.knit',
    'knit': 'material.knit',
    'полиэстеровая ткань': 'material.polyester',
    'polyester fabric': 'material.polyester',
  },
  'color': {
    'burgundy': 'color.burgundy',
    'бордовый': 'color.burgundy',
    'bordo': 'color.burgundy',
    'black': 'color.black',
    'чёрный': 'color.black',
    'черный': 'color.black',
    'qora': 'color.black',
    'white': 'color.white',
    'белый': 'color.white',
    'oq': 'color.white',
    'red': 'color.red',
    'красный': 'color.red',
    'qizil': 'color.red',
    'blue': 'color.blue',
    'синий': 'color.blue',
    'голубой': 'color.blue',
    "ko'k": 'color.blue',
    'green': 'color.green',
    'зелёный': 'color.green',
    'зеленый': 'color.green',
    'yashil': 'color.green',
    'grey': 'color.grey',
    'gray': 'color.grey',
    'серый': 'color.grey',
    'kulrang': 'color.grey',
    'beige': 'color.beige',
    'бежевый': 'color.beige',
    'brown': 'color.brown',
    'коричневый': 'color.brown',
    'jigarrang': 'color.brown',
    'pink': 'color.pink',
    'розовый': 'color.pink',
    'pushti': 'color.pink',
    'purple': 'color.purple',
    'фиолетовый': 'color.purple',
    'binafsha': 'color.purple',
    'yellow': 'color.yellow',
    'жёлтый': 'color.yellow',
    'желтый': 'color.yellow',
    'sariq': 'color.yellow',
  },
};

final _websiteFiberPatterns = <String, RegExp>{
  'fiber.cotton': RegExp(
    r'хлопок|cotton|paxta',
    caseSensitive: false,
    unicode: true,
  ),
  'fiber.polyester': RegExp(
    r'полиэстер|polyester',
    caseSensitive: false,
    unicode: true,
  ),
  'fiber.elastane': RegExp(
    r'эластан|elastane|elastan',
    caseSensitive: false,
    unicode: true,
  ),
  'fiber.viscose': RegExp(
    r'вискоза|viscose|viskoza',
    caseSensitive: false,
    unicode: true,
  ),
  'fiber.spandex': RegExp(
    r'спандекс|spandex',
    caseSensitive: false,
    unicode: true,
  ),
};

List<ProductSpec> productSpecs(
  Product product,
  CartItem item, {
  String languageCode = defaultLanguageCode,
}) {
  return [
    ProductSpec(
      label: localizedText('product.spec.model', languageCode: languageCode),
      value: product.modelNo.isEmpty
          ? product.nameFor(languageCode)
          : product.modelNo,
    ),
    ProductSpec(
      label: localizedText('product.spec.gender', languageCode: languageCode),
      value: genderLabel(product.gender, languageCode: languageCode),
    ),
    ProductSpec(
      label: localizedText('product.spec.category', languageCode: languageCode),
      value: websiteCatalogLabel(product, languageCode: languageCode),
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
    if (product.color.isNotEmpty)
      ProductSpec(
        label: localizedText('product.spec.color', languageCode: languageCode),
        value: websiteProductFieldValue(
          'color',
          product.color,
          languageCode: languageCode,
        ),
      ),
    if (product.country.isNotEmpty)
      ProductSpec(
        label: localizedText(
          'product.spec.country',
          languageCode: languageCode,
        ),
        value: websiteProductFieldValue(
          'country',
          product.country,
          languageCode: languageCode,
        ),
      ),
    if (websiteMaterialValue(product, languageCode: languageCode).isNotEmpty)
      ProductSpec(
        label: localizedText(
          'product.spec.material',
          languageCode: languageCode,
        ),
        value: websiteMaterialValue(product, languageCode: languageCode),
      ),
    if (product.compositionFor(languageCode).isNotEmpty)
      ProductSpec(
        label: localizedText(
          'product.spec.composition',
          languageCode: languageCode,
        ),
        value: websiteProductFieldValue(
          'composition',
          product.compositionFor(languageCode),
          languageCode: languageCode,
        ),
      ),
    if (product.seasonFor(languageCode).isNotEmpty)
      ProductSpec(
        label: localizedText('product.spec.season', languageCode: languageCode),
        value: websiteProductFieldValue(
          'season',
          product.seasonFor(languageCode),
          languageCode: languageCode,
        ),
      ),
    if (product.sizes.isNotEmpty)
      ProductSpec(
        label: localizedText('product.spec.sizes', languageCode: languageCode),
        value: product.sizes.join(' · '),
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
    '${localizedText('product.share.model', languageCode: languageCode)}: ${product.detailTitleFor(languageCode)}',
    '${localizedText('product.share.gender', languageCode: languageCode)}: '
        '${genderLabel(product.gender, languageCode: languageCode)}',
    '${localizedText('product.share.category', languageCode: languageCode)}: '
        '${websiteCatalogLabel(product, languageCode: languageCode)}',
    if (websiteMaterialValue(product, languageCode: languageCode).isNotEmpty)
      '${localizedText('product.spec.material', languageCode: languageCode)}: ${websiteMaterialValue(product, languageCode: languageCode)}',
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
