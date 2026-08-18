import '../models/product.dart';

enum CatalogSort { featured, priceLow, priceHigh, name }

enum PriceBand { all, under5, from5To7, over7 }

enum AvailabilityFilter { all, inStock, preorder }

enum CurationFilter { all, newArrival, bestseller, sale }

class CatalogFilterOptions {
  const CatalogFilterOptions({
    this.query = '',
    this.gender = 'all',
    this.category = 'all',
    this.size = 'all',
    this.priceBand = PriceBand.all,
    this.availability = AvailabilityFilter.all,
    this.curation = CurationFilter.all,
    this.sort = CatalogSort.featured,
    this.savedOnly = false,
    this.savedProductIds = const <String>{},
    this.languageCode = 'ru',
    this.preserveInputOrder = false,
  });

  final String query;
  final String gender;
  final String category;
  final String size;
  final PriceBand priceBand;
  final AvailabilityFilter availability;
  final CurationFilter curation;
  final CatalogSort sort;
  final bool savedOnly;
  final Set<String> savedProductIds;
  final String languageCode;
  final bool preserveInputOrder;
}

List<Product> filterCatalog(
  List<Product> products,
  CatalogFilterOptions options,
) {
  final query = options.query.trim();
  final ranked = products
      .map((product) => (product: product, score: _smartScore(product, query)))
      .where((row) {
        final product = row.product;
        return (options.gender == 'all' || product.gender == options.gender) &&
            (options.category == 'all' ||
                product.category == options.category) &&
            (options.size == 'all' || product.sizes.contains(options.size)) &&
            _matchesPriceBand(product.price, options.priceBand) &&
            _matchesAvailability(product, options.availability) &&
            _matchesCuration(product, options.curation) &&
            (!options.savedOnly ||
                options.savedProductIds.contains(product.id)) &&
            (query.isEmpty || row.score > 0);
      })
      .toList();

  switch (options.sort) {
    case CatalogSort.priceLow:
      ranked.sort((a, b) => a.product.price.compareTo(b.product.price));
    case CatalogSort.priceHigh:
      ranked.sort((a, b) => b.product.price.compareTo(a.product.price));
    case CatalogSort.name:
      ranked.sort(
        (a, b) => a.product
            .nameFor(options.languageCode)
            .compareTo(b.product.nameFor(options.languageCode)),
      );
    case CatalogSort.featured:
      if (options.preserveInputOrder) break;
      ranked.sort((a, b) {
        final byScore = b.score.compareTo(a.score);
        if (byScore != 0) return byScore;
        return a.product
            .nameFor(options.languageCode)
            .compareTo(b.product.nameFor(options.languageCode));
      });
  }
  return ranked.map((row) => row.product).toList();
}

const _smartSynonyms = {
  'ayol': 'women',
  'ayollar': 'women',
  'women': 'women',
  'woman': 'women',
  'female': 'women',
  'erkak': 'men',
  'erkaklar': 'men',
  'men': 'men',
  'man': 'men',
  'male': 'men',
  'bola': 'kids',
  'bolalar': 'kids',
  'kids': 'kids',
  'children': 'kids',
  'child': 'kids',
  'pijama': 'pajamas',
  'pajama': 'pajamas',
  'pajamas': 'pajamas',
  'halat': 'robes',
  'xalat': 'robes',
  'robe': 'robes',
  'robes': 'robes',
  'uy': 'homewear',
  'home': 'homewear',
  'homewear': 'homewear',
  'lounge': 'loungewear',
  'loungewear': 'loungewear',
  'komplekt': 'loungewear',
  'set': 'loungewear',
  'женщина': 'women',
  'женщины': 'women',
  'женский': 'women',
  'мужчина': 'men',
  'мужчины': 'men',
  'мужской': 'men',
  'дети': 'kids',
  'детский': 'kids',
  'ребенок': 'kids',
  'пижама': 'pajamas',
  'пижамы': 'pajamas',
  'халат': 'robes',
  'халаты': 'robes',
  'домашняя': 'homewear',
  'домашнее': 'homewear',
  'paxta': 'cotton',
  'cotton': 'cotton',
  'suprem': 'suprem',
};

const _taxonomyTokens = <String>{
  'women',
  'men',
  'kids',
  'pajamas',
  'robes',
  'homewear',
  'loungewear',
};

String _smartNormalize(String value) {
  return value
      .toLowerCase()
      .replaceAll(RegExp(r"['’`ʻ]"), '')
      .runes
      .map((rune) => _isSearchRune(rune) ? String.fromCharCode(rune) : ' ')
      .join()
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

bool _isSearchRune(int rune) {
  final isAsciiLetter = rune >= 0x61 && rune <= 0x7a;
  final isDigit = rune >= 0x30 && rune <= 0x39;
  final isLatinExtended = rune >= 0x00c0 && rune <= 0x024f;
  final isCyrillic = rune >= 0x0400 && rune <= 0x052f;
  return isAsciiLetter ||
      isDigit ||
      isLatinExtended ||
      isCyrillic ||
      rune == 0x24 ||
      rune == 0x2e;
}

List<String> _smartTokens(String query) {
  final seen = <String>{};
  final tokens = _smartNormalize(query)
      .split(RegExp(r'\s+'))
      .where((token) => token.length > 1)
      .expand((token) => [token, _smartSynonyms[token]].whereType<String>())
      .where((token) => seen.add(token))
      .toList();
  return tokens;
}

String _productText(Product product) {
  return _smartNormalize(
    [
      product.name,
      product.slug,
      product.modelNo,
      product.variant,
      product.gender,
      product.category,
      product.fabric,
      product.material,
      product.composition,
      product.description,
      product.season,
      product.tag,
      product.collection,
      ...product.allLocalizedSearchText,
      product.sizes.join(' '),
    ].where((value) => value.trim().isNotEmpty).join(' '),
  );
}

int _smartScore(Product product, String query) {
  final tokens = _smartTokens(query);
  if (tokens.isEmpty) return _featureScore(product);
  final text = _productText(product);
  final model = _smartNormalize(
    [
      product.modelNo,
      product.variant,
      product.name,
    ].where((value) => value.trim().isNotEmpty).join(' '),
  );
  return tokens.fold(0, (sum, token) {
    final taxonomyMatch = product.gender == token || product.category == token;
    final textMatch = _taxonomyTokens.contains(token)
        ? taxonomyMatch
        : text.contains(token);
    if (!textMatch) return sum;
    var score = sum + 8;
    if (model.contains(token)) score += 18;
    if (taxonomyMatch) score += 12;
    if (product.sizes.any((size) => _smartNormalize(size) == token)) {
      score += 10;
    }
    return score;
  });
}

int _featureScore(Product product) {
  final tagScore = switch (product.tag) {
    'new' => 40,
    'bestseller' => 32,
    'sale' => 24,
    _ => 0,
  };
  final stockScore = product.canOrderWholesale && product.inStock ? 10 : 0;
  return tagScore + stockScore + product.rating.round();
}

List<String> availableSizes(List<Product> products) {
  final sizes = {
    for (final product in products)
      for (final size in product.sizes)
        if (size.trim().isNotEmpty) size.trim(),
  }.toList();
  sizes.sort((a, b) {
    final left = int.tryParse(a);
    final right = int.tryParse(b);
    if (left != null && right != null) return left.compareTo(right);
    if (left != null) return -1;
    if (right != null) return 1;
    return a.compareTo(b);
  });
  return sizes;
}

bool _matchesPriceBand(double price, PriceBand band) {
  return switch (band) {
    PriceBand.all => true,
    PriceBand.under5 => price > 0 && price < 5,
    PriceBand.from5To7 => price >= 5 && price <= 7,
    PriceBand.over7 => price > 7,
  };
}

bool _matchesAvailability(Product product, AvailabilityFilter filter) {
  return switch (filter) {
    AvailabilityFilter.all => true,
    AvailabilityFilter.inStock =>
      product.inStock && product.canOrderWholesale && !product.preorder,
    AvailabilityFilter.preorder => product.preorder,
  };
}

bool _matchesCuration(Product product, CurationFilter filter) {
  return switch (filter) {
    CurationFilter.all => true,
    CurationFilter.newArrival => product.tag == 'new',
    CurationFilter.bestseller => product.tag == 'bestseller',
    CurationFilter.sale => product.tag == 'sale',
  };
}

CatalogSort catalogSortFromString(String value) {
  return switch (value) {
    'price_low' => CatalogSort.priceLow,
    'price_high' => CatalogSort.priceHigh,
    'name' => CatalogSort.name,
    _ => CatalogSort.featured,
  };
}

String catalogSortToString(CatalogSort value) {
  return switch (value) {
    CatalogSort.priceLow => 'price_low',
    CatalogSort.priceHigh => 'price_high',
    CatalogSort.name => 'name',
    CatalogSort.featured => 'featured',
  };
}
