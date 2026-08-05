import 'dart:async';

import 'package:shared_preferences/shared_preferences.dart';

/// Protects account-scoped device data during the upgrade from the historical
/// unscoped keys and serializes writes made by separate store instances.
class CustomerStorageCoordinator {
  static const _versionKey = 'milana_customer_storage_version';
  static const _currentVersion = 2;
  static const _legacyKeys = <String>[
    'milana_cart_items',
    'milana_saved_product_ids',
    'milana_recent_product_ids',
  ];

  static Future<void> _migrationTail = Future<void>.value();
  static final Map<String, Future<void>> _writeTails = {};

  static Future<void> ensureMigrated() {
    final operation = _migrationTail.catchError((_) {}).then((_) async {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getInt(_versionKey) == _currentVersion) return;

      // Data written before account scoping cannot be attributed safely. A
      // one-time clear is preferable to exposing one customer's data to a
      // guest or another signed-in account.
      for (final key in _legacyKeys) {
        await prefs.remove(key);
      }
      await prefs.setInt(_versionKey, _currentVersion);
    });
    _migrationTail = operation;
    return operation;
  }

  static Future<T> readAfterWrites<T>(
    String key,
    Future<T> Function() read,
  ) async {
    final pending = _writeTails[key];
    if (pending != null) await pending.catchError((_) {});
    return read();
  }

  static Future<void> serializeWrite(
    String key,
    Future<void> Function() write,
  ) {
    final previous = _writeTails[key] ?? Future<void>.value();
    late final Future<void> operation;
    operation = previous.catchError((_) {}).then((_) => write());
    _writeTails[key] = operation;
    return operation.whenComplete(() {
      if (identical(_writeTails[key], operation)) _writeTails.remove(key);
    });
  }
}
