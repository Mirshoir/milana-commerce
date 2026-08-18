import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/cart_item.dart';
import '../models/product.dart';

const _analyticsConsentKey = 'milana_analytics_consent';

class AnalyticsService extends ChangeNotifier {
  AnalyticsService({
    required this.firebaseEnabled,
    FirebaseAnalytics? analytics,
  }) : _analytics = firebaseEnabled ? analytics : null;

  final bool firebaseEnabled;
  FirebaseAnalytics? _analytics;
  bool _consentGranted = false;
  bool _ready = false;

  bool get consentGranted => _consentGranted;
  bool get ready => _ready;
  bool get canRecord => firebaseEnabled && _consentGranted;

  Future<void> initialize() async {
    var consent = false;
    try {
      final prefs = await SharedPreferences.getInstance();
      consent = prefs.getBool(_analyticsConsentKey) ?? false;
    } catch (_) {
      consent = false;
    }
    _consentGranted = consent;
    _ready = true;
    await _setCollectionEnabled(consent);
    notifyListeners();
  }

  Future<void> setConsent(bool granted) async {
    _consentGranted = granted;
    _ready = true;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_analyticsConsentKey, granted);
    } catch (_) {
      // The SDK state remains authoritative for this session.
    }
    await _setCollectionEnabled(granted);
  }

  Future<void> _setCollectionEnabled(bool enabled) async {
    final analytics =
        _analytics ??
        (firebaseEnabled && enabled
            ? (_analytics = FirebaseAnalytics.instance)
            : null);
    if (analytics == null) return;
    try {
      await analytics.setAnalyticsCollectionEnabled(enabled);
    } catch (_) {
      // Measurement must never interrupt commerce flows.
    }
  }

  Future<void> logViewItem(Product product) => _record(
    (analytics) => analytics.logViewItem(
      currency: 'USD',
      value: product.price,
      items: [_item(product)],
    ),
  );

  Future<void> logSearch(String term, {required int resultCount}) => _record(
    (analytics) => analytics.logSearch(
      searchTerm: term,
      parameters: {'result_count': resultCount},
    ),
  );

  Future<void> logAddToCart(CartItem item) => _record(
    (analytics) => analytics.logAddToCart(
      currency: 'USD',
      value: item.lineTotal,
      items: [_item(item.product, quantity: item.pieceCount)],
      parameters: {'order_unit': item.orderUnit.unitType},
    ),
  );

  Future<void> logAddToWishlist(Product product) => _record(
    (analytics) => analytics.logAddToWishlist(
      currency: 'USD',
      value: product.price,
      items: [_item(product)],
    ),
  );

  Future<void> logBeginCheckout(List<CartItem> items) => _record(
    (analytics) => analytics.logBeginCheckout(
      currency: 'USD',
      value: _total(items),
      items: items
          .map((item) => _item(item.product, quantity: item.pieceCount))
          .toList(growable: false),
    ),
  );

  Future<void> logWholesaleOrderSubmitted({
    required String orderNumber,
    required List<CartItem> items,
  }) => _record(
    (analytics) => analytics.logEvent(
      name: 'wholesale_order_submit',
      parameters: {
        'transaction_id': orderNumber,
        'currency': 'USD',
        'value': _total(items),
        'item_count': items.fold<int>(0, (sum, item) => sum + item.pieceCount),
      },
    ),
  );

  Future<void> logDistributorLead() => _record(
    (analytics) => analytics.logGenerateLead(
      parameters: const {'lead_source': 'distributor_application'},
    ),
  );

  Future<void> logLogin(String method) =>
      _record((analytics) => analytics.logLogin(loginMethod: method));

  Future<void> logSignUp(String method) =>
      _record((analytics) => analytics.logSignUp(signUpMethod: method));

  Future<void> logAssistantEngagement() => _record(
    (analytics) => analytics.logEvent(
      name: 'assistant_engagement',
      parameters: const {'assistant': 'milana_ai'},
    ),
  );

  Future<void> _record(
    Future<void> Function(FirebaseAnalytics analytics) operation,
  ) async {
    final analytics = _analytics;
    if (!canRecord || analytics == null) return;
    try {
      await operation(analytics);
    } catch (error) {
      if (kDebugMode) {
        debugPrint('Analytics event skipped: ${error.runtimeType}');
      }
    }
  }

  AnalyticsEventItem _item(Product product, {int quantity = 1}) {
    return AnalyticsEventItem(
      itemId: product.id,
      itemName: product.name,
      itemBrand: 'Milana Premium',
      itemCategory: product.category,
      itemCategory2: product.gender,
      itemVariant: product.variant,
      price: product.price,
      quantity: quantity,
    );
  }

  double _total(List<CartItem> items) =>
      items.fold<double>(0, (sum, item) => sum + item.lineTotal);
}

class AnalyticsScope extends InheritedNotifier<AnalyticsService> {
  const AnalyticsScope({
    super.key,
    required AnalyticsService service,
    required super.child,
  }) : super(notifier: service);

  static AnalyticsService? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AnalyticsScope>()?.notifier;
}

extension AnalyticsContext on BuildContext {
  AnalyticsService? get analytics => AnalyticsScope.maybeOf(this);
}
