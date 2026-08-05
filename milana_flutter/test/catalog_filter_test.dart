import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/product.dart';
import 'package:milana_flutter/src/services/catalog_filter.dart';

void main() {
  Product product({
    required String id,
    required String name,
    required String gender,
    required String category,
    required double price,
    List<String> sizes = const ['44', '46', '48'],
    String fabric = 'Suprem',
    String tag = '',
    bool preorder = false,
    bool inStock = true,
    bool canOrderWholesale = true,
  }) {
    return Product(
      id: id,
      slug: id,
      name: name,
      gender: gender,
      category: category,
      price: price,
      sizes: sizes,
      images: const [],
      modelNo: name,
      fabric: fabric,
      tag: tag,
      preorder: preorder,
      inStock: inStock,
      canOrderWholesale: canOrderWholesale,
    );
  }

  final rows = [
    product(
      id: 'f-2219',
      name: 'F-2219',
      gender: 'women',
      category: 'homewear',
      price: 4.5,
      sizes: const ['44', '46', '48'],
      fabric: 'Suprem',
    ),
    product(
      id: 'pj-1045',
      name: 'PJ-1045',
      gender: 'women',
      category: 'pajamas',
      price: 6.3,
      sizes: const ['50', '52', '54'],
      fabric: 'Waffle',
    ),
    product(
      id: 'm-9001',
      name: 'M-9001',
      gender: 'men',
      category: 'loungewear',
      price: 8.2,
      sizes: const ['46', '48', '50'],
      fabric: 'Cotton',
    ),
  ];

  test('filterCatalog searches model fabric and category text', () {
    expect(
      filterCatalog(
        rows,
        const CatalogFilterOptions(query: 'waffle'),
      ).map((p) => p.id),
      ['pj-1045'],
    );
    expect(
      filterCatalog(
        rows,
        const CatalogFilterOptions(query: 'loungewear'),
      ).map((p) => p.id),
      ['m-9001'],
    );
  });

  test('filterCatalog combines gender category size and price band', () {
    final filtered = filterCatalog(
      rows,
      const CatalogFilterOptions(
        gender: 'women',
        category: 'pajamas',
        size: '52',
        priceBand: PriceBand.from5To7,
      ),
    );

    expect(filtered.map((p) => p.id), ['pj-1045']);
  });

  test('filterCatalog supports saved-only and price sorting', () {
    final filtered = filterCatalog(
      rows,
      const CatalogFilterOptions(
        savedOnly: true,
        savedProductIds: {'f-2219', 'm-9001'},
        sort: CatalogSort.priceHigh,
      ),
    );

    expect(filtered.map((p) => p.id), ['m-9001', 'f-2219']);
  });

  test('availableSizes returns numeric sizes in ascending order', () {
    expect(availableSizes(rows), ['44', '46', '48', '50', '52', '54']);
  });

  test('filterCatalog keeps Cyrillic search terms meaningful', () {
    final russianRows = [
      product(
        id: 'robe',
        name: 'Женский халат',
        gender: 'women',
        category: 'robes',
        price: 7,
      ),
      product(
        id: 'men-pajamas',
        name: 'Мужская пижама',
        gender: 'men',
        category: 'pajamas',
        price: 8,
      ),
    ];

    expect(
      filterCatalog(
        russianRows,
        const CatalogFilterOptions(query: 'халат'),
      ).map((row) => row.id),
      ['robe'],
    );
    expect(
      filterCatalog(
        russianRows,
        const CatalogFilterOptions(query: 'мужчины'),
      ).map((row) => row.id),
      ['men-pajamas'],
    );
  });

  test('filterCatalog supports website curation and availability fields', () {
    final websiteRows = [
      product(
        id: 'new',
        name: 'New arrival',
        gender: 'women',
        category: 'robes',
        price: 7,
        tag: 'new',
      ),
      product(
        id: 'bestseller',
        name: 'Bestseller',
        gender: 'women',
        category: 'robes',
        price: 7,
        tag: 'bestseller',
      ),
      product(
        id: 'preorder',
        name: 'Preorder',
        gender: 'women',
        category: 'robes',
        price: 7,
        preorder: true,
        inStock: false,
      ),
    ];

    expect(
      filterCatalog(
        websiteRows,
        const CatalogFilterOptions(curation: CurationFilter.bestseller),
      ).map((row) => row.id),
      ['bestseller'],
    );
    expect(
      filterCatalog(
        websiteRows,
        const CatalogFilterOptions(availability: AvailabilityFilter.preorder),
      ).map((row) => row.id),
      ['preorder'],
    );
    expect(
      filterCatalog(
        websiteRows,
        const CatalogFilterOptions(availability: AvailabilityFilter.inStock),
      ).map((row) => row.id),
      containsAll(['new', 'bestseller']),
    );
  });
}
