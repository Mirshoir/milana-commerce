class CheckoutManager {
  const CheckoutManager({required this.id, required this.name});

  factory CheckoutManager.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    final id = rawId is num ? rawId.toInt() : int.tryParse('$rawId') ?? 0;
    return CheckoutManager(id: id, name: '${json['name'] ?? ''}'.trim());
  }

  final int id;
  final String name;

  bool get isValid => id > 0 && name.isNotEmpty;
}

bool isCheckoutManagerSelected(
  int? selectedId,
  List<CheckoutManager> managers,
) {
  return selectedId != null &&
      managers.any((manager) => manager.id == selectedId);
}
