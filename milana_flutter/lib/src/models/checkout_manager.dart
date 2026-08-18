class CheckoutManager {
  const CheckoutManager({
    required this.id,
    required this.name,
    this.department = '',
  });

  factory CheckoutManager.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    final id = rawId is num ? rawId.toInt() : int.tryParse('$rawId') ?? 0;
    return CheckoutManager(
      id: id,
      name: '${json['name'] ?? ''}'.trim(),
      department: '${json['department'] ?? ''}'.trim().toLowerCase(),
    );
  }

  final int id;
  final String name;
  final String department;

  bool get isValid => id > 0 && name.isNotEmpty;
}

const uzbekistanCheckoutCountry = 'uzbekistan';
const otherCheckoutCountry = 'other';

List<CheckoutManager> checkoutManagersForCountry(
  List<CheckoutManager> managers,
  String? country,
) {
  final allowedNames = switch (country) {
    uzbekistanCheckoutCountry => const {'marjona', 'shaxrizoda'},
    otherCheckoutCountry => const {'jasurbek', 'oybek', "muhammadma'ruf"},
    _ => const <String>{},
  };
  return managers
      .where((manager) => allowedNames.contains(_normalizedName(manager.name)))
      .toList(growable: false);
}

String checkoutMarketForCountry(String? country) =>
    country == otherCheckoutCountry ? 'export' : 'internal';

String checkoutCountryFromProfile(String value) {
  final normalized = value.trim().toLowerCase();
  if (normalized.isEmpty) return '';
  if (normalized == 'uz' ||
      normalized.contains('uzbek') ||
      normalized.contains('o‘zbekiston') ||
      normalized.contains("o'zbekiston") ||
      normalized.contains('узбекистан')) {
    return uzbekistanCheckoutCountry;
  }
  return otherCheckoutCountry;
}

String _normalizedName(String value) => value
    .trim()
    .toLowerCase()
    .replaceAll(RegExp(r'[’‘`ʻ]'), "'")
    .replaceAll(RegExp(r'\s+'), ' ');

bool isCheckoutManagerSelected(
  int? selectedId,
  List<CheckoutManager> managers,
) {
  return selectedId != null &&
      managers.any((manager) => manager.id == selectedId);
}
