const catalogInitialVisibleCount = 24;
const catalogNextVisibleCount = 24;

int effectiveCatalogVisibleCount({required int total, required int requested}) {
  if (total <= 0) return 0;
  if (requested <= 0) {
    return total < catalogInitialVisibleCount
        ? total
        : catalogInitialVisibleCount;
  }
  return requested > total ? total : requested;
}

int nextCatalogVisibleCount({required int total, required int current}) {
  if (total <= 0) return 0;
  final next = current + catalogNextVisibleCount;
  return next > total ? total : next;
}
