import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/services/catalog_paging.dart';

void main() {
  test('effectiveCatalogVisibleCount starts with a bounded first page', () {
    expect(
      effectiveCatalogVisibleCount(total: 300, requested: 0),
      catalogInitialVisibleCount,
    );
    expect(effectiveCatalogVisibleCount(total: 12, requested: 0), 12);
    expect(effectiveCatalogVisibleCount(total: 0, requested: 0), 0);
  });

  test('nextCatalogVisibleCount grows in batches and stops at total', () {
    expect(
      nextCatalogVisibleCount(total: 300, current: catalogInitialVisibleCount),
      catalogInitialVisibleCount + catalogNextVisibleCount,
    );
    expect(nextCatalogVisibleCount(total: 30, current: 24), 30);
    expect(nextCatalogVisibleCount(total: 0, current: 24), 0);
  });
}
