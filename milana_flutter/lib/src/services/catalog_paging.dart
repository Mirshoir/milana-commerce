const int catalogInitialVisibleCount = 24;
const int catalogNextVisibleCount = 24;

int effectiveCatalogVisibleCount({required int total, required int requested}) {
  if (total <= 0) return 0;
  final desired = requested > 0 ? requested : catalogInitialVisibleCount;
  return desired.clamp(0, total).toInt();
}

int nextCatalogVisibleCount({required int total, required int current}) {
  if (total <= 0) return 0;
  final visible = effectiveCatalogVisibleCount(
    total: total,
    requested: current,
  );
  return (visible + catalogNextVisibleCount).clamp(0, total).toInt();
}
