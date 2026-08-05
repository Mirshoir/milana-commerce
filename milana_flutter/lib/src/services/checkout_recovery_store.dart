import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/order.dart';
import 'customer_storage_coordinator.dart';

class CheckoutRecoveryState {
  const CheckoutRecoveryState({this.pendingClientOrderId, this.receipt});

  final String? pendingClientOrderId;
  final OrderReceipt? receipt;
}

class CheckoutRecoveryStore {
  static const _key = 'milana_checkout_recovery_v1';

  String _storageKey(String? scope) {
    final normalized = (scope ?? 'guest').trim().replaceAll(
      RegExp(r'[^a-zA-Z0-9_-]'),
      '_',
    );
    if (normalized.isEmpty || normalized == 'guest') return _key;
    return '${_key}__$normalized';
  }

  Future<CheckoutRecoveryState> load({String? scope}) async {
    await CustomerStorageCoordinator.ensureMigrated();
    final key = _storageKey(scope);
    return CustomerStorageCoordinator.readAfterWrites(key, () async {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(key);
      if (raw == null || raw.isEmpty) return const CheckoutRecoveryState();
      try {
        final decoded = jsonDecode(raw);
        if (decoded is! Map) return const CheckoutRecoveryState();
        final data = Map<String, dynamic>.from(decoded);
        final pending = '${data['pending_client_order_id'] ?? ''}'.trim();
        final receiptData = data['receipt'];
        return CheckoutRecoveryState(
          pendingClientOrderId: pending.isEmpty ? null : pending,
          receipt: receiptData is Map
              ? OrderReceipt.fromJson(Map<String, dynamic>.from(receiptData))
              : null,
        );
      } catch (_) {
        return const CheckoutRecoveryState();
      }
    });
  }

  Future<void> savePending(String clientOrderId, {String? scope}) async {
    final normalized = clientOrderId.trim();
    if (normalized.isEmpty) {
      throw ArgumentError.value(clientOrderId, 'clientOrderId');
    }
    await _write({'pending_client_order_id': normalized}, scope: scope);
  }

  Future<void> saveReceipt(OrderReceipt receipt, {String? scope}) =>
      _write({'receipt': receipt.toJson()}, scope: scope);

  Future<void> _write(Map<String, dynamic> data, {String? scope}) async {
    await CustomerStorageCoordinator.ensureMigrated();
    final key = _storageKey(scope);
    final payload = jsonEncode(data);
    await CustomerStorageCoordinator.serializeWrite(key, () async {
      final prefs = await SharedPreferences.getInstance();
      final saved = await prefs.setString(key, payload);
      if (!saved) throw StateError('checkout-recovery-write-failed');
    });
  }

  Future<void> clear({String? scope}) async {
    await CustomerStorageCoordinator.ensureMigrated();
    final key = _storageKey(scope);
    await CustomerStorageCoordinator.serializeWrite(key, () async {
      final prefs = await SharedPreferences.getInstance();
      final removed = await prefs.remove(key);
      if (!removed && prefs.containsKey(key)) {
        throw StateError('checkout-recovery-clear-failed');
      }
    });
  }
}
