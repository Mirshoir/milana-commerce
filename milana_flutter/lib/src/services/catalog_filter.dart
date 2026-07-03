import '../models/product.dart';

enum CatalogSort { featured, priceLow, priceHigh, name }

enum PriceBand { all, under5, from5To7, over7 }

class CatalogFilterOptions {
  const CatalogFilterOptions({
    this.query = '',
    this.gender = 'all',
    this.category = 'all',
    this.size = 'all',
    this.priceBand = PriceBand.all,
    this.sort = CatalogSort.featured,
    this.savedOnly = false,
    this.savedProductIds = const <String>{},
  });

  final String query;
  final String gender;
  final String category;
  final String size;
  final PriceBand priceBand;
  final CatalogSort sort;
  final bool savedOnly;
  final Set<String> savedProductIds;
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
      ranked.sort((a, b) => a.product.name.compareTo(b.product.name));
    case CatalogSort.featured:
      ranked.sort((a, b) {
        final byScore = b.score.compareTo(a.score);
        if (byScore != 0) return byScore;
        return a.product.name.compareTo(b.product.name);
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
  'paxta': 'cotton',
  'cotton': 'cotton',
  'suprem': 'suprem',
};

String _smartNormalize(String value) {
  return value
      .toLowerCase()
      .replaceAll(RegExp(r"['’`ʻ]"), '')
      .replaceAll(RegExp(r'[^a-z0-9.$]+'), ' ')
      .trim();
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
      product.description,
      product.sizes.join(' '),
    ].where((value) => value.trim().isNotEmpty).join(' '),
  );
}

int _smartScore(Product product, String query) {
  final tokens = _smartTokens(query);
  if (tokens.isEmpty) return 0;
  final text = _productText(product);
  final model = _smartNormalize(
    [
      product.modelNo,
      product.variant,
      product.name,
    ].where((value) => value.trim().isNotEmpty).join(' '),
  );
  return tokens.fold(0, (sum, token) {
    if (!text.contains(token)) return sum;
    var score = sum + 8;
    if (model.contains(token)) score += 18;
    if (product.gender == token || product.category == token) score += 12;
    if (product.sizes.any((size) => _smartNormalize(size) == token)) {
      score += 10;
    }
    return score;
  });
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
