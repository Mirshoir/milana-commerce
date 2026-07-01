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
  final query = options.query.trim().toLowerCase();
  final filtered = products.where((product) {
    final text =
        '${product.name} ${product.modelNo} ${product.variant} '
                '${product.fabric} ${product.description} '
                '${product.gender} ${product.category} ${product.sizes.join(' ')}'
            .toLowerCase();
    return (options.gender == 'all' || product.gender == options.gender) &&
        (options.category == 'all' || product.category == options.category) &&
        (options.size == 'all' || product.sizes.contains(options.size)) &&
        _matchesPriceBand(product.price, options.priceBand) &&
        (!options.savedOnly || options.savedProductIds.contains(product.id)) &&
        (query.isEmpty || text.contains(query));
  }).toList();

  switch (options.sort) {
    case CatalogSort.priceLow:
      filtered.sort((a, b) => a.price.compareTo(b.price));
    case CatalogSort.priceHigh:
      filtered.sort((a, b) => b.price.compareTo(a.price));
    case CatalogSort.name:
      filtered.sort((a, b) => a.name.compareTo(b.name));
    case CatalogSort.featured:
      break;
  }
  return filtered;
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
