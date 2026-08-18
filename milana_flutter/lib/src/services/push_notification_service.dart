import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'distributor_repository.dart';

const _webPushVapidKey = String.fromEnvironment('FIREBASE_WEB_PUSH_VAPID_KEY');

class PushNotificationService extends ChangeNotifier {
  PushNotificationService({
    required this.firebaseEnabled,
    required this.distributors,
    this.messagingOverride,
  });

  final bool firebaseEnabled;
  final DistributorRepository distributors;
  final FirebaseMessaging? messagingOverride;
  StreamSubscription<String>? _tokenRefresh;
  StreamSubscription<RemoteMessage>? _foregroundMessages;
  String? _customerId;
  String _languageCode = 'ru';
  bool _enabled = false;
  String _error = '';
  RemoteMessage? _lastMessage;

  FirebaseMessaging get messaging =>
      messagingOverride ?? FirebaseMessaging.instance;
  bool get enabled => _enabled;
  String get error => _error;
  RemoteMessage? get lastMessage => _lastMessage;

  Future<bool> enable({
    required String customerId,
    required String languageCode,
  }) async {
    if (!firebaseEnabled || customerId.isEmpty) return false;
    _customerId = customerId;
    _languageCode = languageCode;
    try {
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        _enabled = false;
        _error = 'permission-denied';
        notifyListeners();
        return false;
      }
      final token = await messaging.getToken(
        vapidKey: kIsWeb && _webPushVapidKey.isNotEmpty
            ? _webPushVapidKey
            : null,
      );
      if (token == null || token.isEmpty) {
        _enabled = false;
        _error = kIsWeb && _webPushVapidKey.isEmpty
            ? 'web-vapid-key-missing'
            : 'token-unavailable';
        notifyListeners();
        return false;
      }
      await _register(token);
      await _tokenRefresh?.cancel();
      _tokenRefresh = messaging.onTokenRefresh.listen(_register);
      await _foregroundMessages?.cancel();
      _foregroundMessages = FirebaseMessaging.onMessage.listen((message) {
        _lastMessage = message;
        notifyListeners();
      });
      _enabled = true;
      _error = '';
      notifyListeners();
      return true;
    } catch (error) {
      _enabled = false;
      _error = '$error';
      notifyListeners();
      return false;
    }
  }

  Future<void> clearForSignedOutCustomer() async {
    _customerId = null;
    _enabled = false;
    _lastMessage = null;
    await _tokenRefresh?.cancel();
    _tokenRefresh = null;
    await _foregroundMessages?.cancel();
    _foregroundMessages = null;
    if (firebaseEnabled) {
      try {
        await messaging.deleteToken();
      } catch (_) {
        // Token invalidation is best effort after sign-out.
      }
    }
    notifyListeners();
  }

  Future<void> _register(String token) async {
    final customerId = _customerId;
    if (customerId == null || customerId.isEmpty) return;
    await distributors.registerDeviceToken(
      token: token,
      platform: _platformName(),
      languageCode: _languageCode,
    );
  }

  String _platformName() {
    if (kIsWeb) return 'web';
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      _ => 'unknown',
    };
  }

  @override
  void dispose() {
    _tokenRefresh?.cancel();
    _foregroundMessages?.cancel();
    super.dispose();
  }
}
