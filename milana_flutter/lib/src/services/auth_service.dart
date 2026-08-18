import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../localization/app_localization.dart';
import '../models/cart_item.dart';
import 'auth_forms.dart';
import 'cart_store.dart';
import 'checkout_recovery_store.dart';
import 'favorites_store.dart';
import 'legal_links.dart';
import 'recent_products_store.dart';
import 'website_session_service.dart';

const _firebaseOperationTimeout = Duration(seconds: 30);
const _googleClientId = String.fromEnvironment('GOOGLE_CLIENT_ID');
const _googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

const Set<String> accountDeletionReasonCodes = {
  'no_longer_needed',
  'missing_features',
  'difficult_to_use',
  'technical_problems',
  'privacy_concerns',
  'created_by_mistake',
  'prefer_not_to_say',
  'other',
};

enum CommerceAccountState {
  inactive,
  emailVerificationRequired,
  syncing,
  ready,
  unavailable,
}

class Customer {
  const Customer({
    required this.id,
    required this.email,
    required this.name,
    required this.phone,
    this.city = '',
    this.address = '',
    this.companyName = '',
    this.country = '',
    this.savedProductIds = const <String>{},
    this.recentProductIds = const <String>[],
    this.cartItems = const <CartItem>[],
  });

  final String id;
  final String email;
  final String name;
  final String phone;
  final String city;
  final String address;
  final String companyName;
  final String country;
  final Set<String> savedProductIds;
  final List<String> recentProductIds;
  final List<CartItem> cartItems;
}

class AuthService extends ChangeNotifier {
  static Future<void>? _googleSignInInit;

  AuthService({
    required this.firebaseEnabled,
    bool? enableLocalAuth,
    WebsiteSessionService? websiteSessions,
  }) : _localAuthEnabled = enableLocalAuth ?? !kReleaseMode,
       _websiteSessions = websiteSessions ?? WebsiteSessionService(),
       _ownsWebsiteSessions = websiteSessions == null {
    if (firebaseEnabled) {
      _authSub = fb.FirebaseAuth.instance.authStateChanges().listen(
        _watchFirebaseCustomer,
      );
    }
  }

  final bool firebaseEnabled;
  final bool _localAuthEnabled;
  final WebsiteSessionService _websiteSessions;
  final bool _ownsWebsiteSessions;
  Customer? _customer;
  StreamSubscription<fb.User?>? _authSub;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _profileSub;
  CommerceAccountState _commerceAccountState = CommerceAccountState.inactive;
  String? _websiteSessionToken;
  String _commerceAccountError = '';
  bool _emailVerified = false;
  bool _profileReady = false;
  int _websiteSessionGeneration = 0;
  int _websiteProfileSyncRevision = 0;
  Future<void> _websiteProfileSyncTail = Future<void>.value();
  String? _lastDeletedCustomerId;

  Customer? get customer => _customer;
  bool get signedIn => _customer != null;
  bool get localDemoEnabled => !firebaseEnabled && _localAuthEnabled;
  bool get emailVerified => !firebaseEnabled || _emailVerified;
  bool get profileReady => !firebaseEnabled || _profileReady;
  CommerceAccountState get commerceAccountState => _commerceAccountState;
  bool get commerceAccountReady =>
      _commerceAccountState == CommerceAccountState.ready &&
      _websiteSessionToken != null;
  String? get websiteSessionToken => _websiteSessionToken;
  String get commerceAccountError => _commerceAccountError;
  String? get lastDeletedCustomerId => _lastDeletedCustomerId;

  Future<void> _initializeGoogleSignIn() async {
    if (_googleSignInInit != null) {
      await _googleSignInInit;
      return;
    }
    try {
      if (_googleClientId.isEmpty && _googleServerClientId.isEmpty) {
        if (kIsWeb) {
          throw Exception('google-client-id-missing');
        }
      }
      _googleSignInInit = GoogleSignIn.instance.initialize(
        clientId: _googleClientId.isEmpty ? null : _googleClientId,
        serverClientId: _googleServerClientId.isEmpty
            ? null
            : _googleServerClientId,
      );
      await _googleSignInInit;
    } catch (_) {
      _googleSignInInit = null;
      rethrow;
    }
  }

  void _watchFirebaseCustomer(fb.User? user) {
    final generation = ++_websiteSessionGeneration;
    _websiteProfileSyncRevision += 1;
    _profileSub?.cancel();
    _profileSub = null;
    final previousWebsiteToken = _websiteSessionToken;
    _websiteSessionToken = null;
    if (previousWebsiteToken != null) {
      unawaited(_revokeWebsiteSession(previousWebsiteToken));
    }
    _commerceAccountError = '';
    if (user == null) {
      _customer = null;
      _emailVerified = false;
      _profileReady = false;
      _commerceAccountState = CommerceAccountState.inactive;
      notifyListeners();
      return;
    }
    _emailVerified = user.emailVerified;
    _profileReady = false;
    _commerceAccountState = user.emailVerified
        ? CommerceAccountState.syncing
        : CommerceAccountState.emailVerificationRequired;
    _customer = Customer(
      id: user.uid,
      email: user.email ?? '',
      name: user.displayName ?? '',
      phone: user.phoneNumber ?? '',
    );
    notifyListeners();
    _profileSub = FirebaseFirestore.instance
        .collection('customers')
        .doc(user.uid)
        .snapshots()
        .listen((profile) {
          final data = profile.data() ?? const {};
          _customer = Customer(
            id: user.uid,
            email: '${data['email'] ?? user.email ?? ''}',
            name: '${data['name'] ?? user.displayName ?? ''}',
            phone: '${data['phone'] ?? user.phoneNumber ?? ''}',
            city: '${data['city'] ?? ''}',
            address: '${data['address'] ?? ''}',
            companyName: '${data['company_name'] ?? ''}',
            country: '${data['country'] ?? ''}',
            savedProductIds: _savedProductIds(data['saved_product_ids']),
            recentProductIds: _orderedProductIds(data['recent_product_ids']),
            cartItems: _cartItems(data['cart_items']),
          );
          _profileReady = true;
          notifyListeners();
          if (commerceAccountReady) {
            _queueWebsiteProfileSync(_customer!);
          }
        });
    unawaited(_repairFirebaseProfile(user));
    if (user.emailVerified) {
      unawaited(_synchronizeWebsiteSession(user, generation: generation));
    }
  }

  Future<void> _repairFirebaseProfile(fb.User user) async {
    try {
      final reference = FirebaseFirestore.instance
          .collection('customers')
          .doc(user.uid);
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final snapshot = await transaction.get(reference);
        if (snapshot.exists) return;
        transaction.set(reference, {
          'email': user.email ?? '',
          'name': user.displayName ?? '',
          'phone': user.phoneNumber ?? '',
          'city': '',
          'address': '',
          'company_name': '',
          'country': '',
          'status': 'active',
          'created_at': DateTime.now().toUtc().toIso8601String(),
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        });
      });
    } catch (_) {
      // Profile writes remain retryable through later account/cart updates.
    }
  }

  Future<void> _synchronizeWebsiteSession(
    fb.User user, {
    required int generation,
    bool forceRefresh = false,
  }) async {
    if (!user.emailVerified) {
      if (generation == _websiteSessionGeneration) {
        _emailVerified = false;
        _commerceAccountState = CommerceAccountState.emailVerificationRequired;
        notifyListeners();
      }
      return;
    }
    if (generation == _websiteSessionGeneration) {
      _emailVerified = true;
      _commerceAccountState = CommerceAccountState.syncing;
      _commerceAccountError = '';
      notifyListeners();
    }
    try {
      final idToken = await user.getIdToken(forceRefresh);
      if (idToken == null || idToken.isEmpty) {
        throw const WebsiteSessionException('firebase-token-unavailable');
      }
      final profile = _customer;
      final session = await _websiteSessions.exchangeFirebaseToken(
        idToken: idToken,
        name: profile?.name ?? user.displayName ?? '',
        city: profile?.city ?? '',
        address: profile?.address ?? '',
      );
      final expectedEmail = normalizeEmail(user.email ?? '');
      final websiteEmail = normalizeEmail(session.email);
      if (session.customerId.trim().isEmpty ||
          expectedEmail.isEmpty ||
          websiteEmail != expectedEmail) {
        await _revokeWebsiteSession(session.token);
        throw const WebsiteSessionException('website-account-mismatch');
      }
      if (generation != _websiteSessionGeneration ||
          fb.FirebaseAuth.instance.currentUser?.uid != user.uid) {
        await _revokeWebsiteSession(session.token);
        return;
      }
      final previousWebsiteToken = _websiteSessionToken;
      _websiteSessionToken = session.token;
      if (previousWebsiteToken != null &&
          previousWebsiteToken != session.token) {
        unawaited(_revokeWebsiteSession(previousWebsiteToken));
      }
      _commerceAccountState = CommerceAccountState.ready;
      _commerceAccountError = '';
      notifyListeners();
      final current = _customer;
      if (current != null) _queueWebsiteProfileSync(current);
    } on WebsiteSessionException catch (error) {
      if (generation != _websiteSessionGeneration) return;
      final failedToken = _websiteSessionToken;
      _websiteSessionToken = null;
      if (failedToken != null) unawaited(_revokeWebsiteSession(failedToken));
      _commerceAccountError = error.code;
      _commerceAccountState = error.code == 'firebase_email_not_verified'
          ? CommerceAccountState.emailVerificationRequired
          : CommerceAccountState.unavailable;
      notifyListeners();
    } catch (error) {
      if (generation != _websiteSessionGeneration) return;
      final failedToken = _websiteSessionToken;
      _websiteSessionToken = null;
      if (failedToken != null) unawaited(_revokeWebsiteSession(failedToken));
      _commerceAccountError = 'website-session-unavailable';
      _commerceAccountState = CommerceAccountState.unavailable;
      notifyListeners();
    }
  }

  Future<void> refreshEmailVerification() async {
    if (!firebaseEnabled) return;
    final current = fb.FirebaseAuth.instance.currentUser;
    if (current == null) return;
    await current.reload();
    final refreshed = fb.FirebaseAuth.instance.currentUser;
    if (refreshed == null) return;
    final generation = ++_websiteSessionGeneration;
    _emailVerified = refreshed.emailVerified;
    if (!refreshed.emailVerified) {
      final previousWebsiteToken = _websiteSessionToken;
      _websiteSessionToken = null;
      if (previousWebsiteToken != null) {
        unawaited(_revokeWebsiteSession(previousWebsiteToken));
      }
      _commerceAccountState = CommerceAccountState.emailVerificationRequired;
      notifyListeners();
      return;
    }
    await _synchronizeWebsiteSession(
      refreshed,
      generation: generation,
      forceRefresh: true,
    );
  }

  Future<void> resendEmailVerification() async {
    if (!firebaseEnabled) return;
    final current = fb.FirebaseAuth.instance.currentUser;
    if (current == null || current.emailVerified) return;
    await current.sendEmailVerification();
  }

  Future<void> retryCommerceAccount() async {
    if (!firebaseEnabled) return;
    final current = fb.FirebaseAuth.instance.currentUser;
    if (current == null) return;
    await current.reload();
    final refreshed = fb.FirebaseAuth.instance.currentUser;
    if (refreshed == null) return;
    final generation = ++_websiteSessionGeneration;
    await _synchronizeWebsiteSession(
      refreshed,
      generation: generation,
      forceRefresh: true,
    );
  }

  void _queueWebsiteProfileSync(Customer customer) {
    final revision = ++_websiteProfileSyncRevision;
    final customerId = customer.id;
    final token = _websiteSessionToken;
    if (token == null) return;
    _websiteProfileSyncTail = _websiteProfileSyncTail.catchError((_) {}).then((
      _,
    ) async {
      if (revision != _websiteProfileSyncRevision ||
          token != _websiteSessionToken ||
          _customer?.id != customerId) {
        return;
      }
      try {
        await _websiteSessions.updateProfile(
          sessionToken: token,
          name: customer.name,
          phone: customer.phone,
          city: customer.city,
          address: customer.address,
        );
      } on WebsiteSessionException catch (error) {
        if (error.statusCode == 401 || error.statusCode == 403) {
          await invalidateWebsiteSession();
        }
      } catch (_) {
        // The next profile edit or session retry will reconcile commerce data.
      }
    });
  }

  Future<void> _revokeWebsiteSession(String token) async {
    try {
      await _websiteSessions.signOut(token);
    } catch (_) {
      // Revocation is best effort when the commerce service is unavailable.
    }
  }

  Future<void> invalidateWebsiteSession() async {
    final token = _websiteSessionToken;
    _websiteSessionGeneration += 1;
    _websiteProfileSyncRevision += 1;
    _websiteSessionToken = null;
    _commerceAccountError = 'website-session-expired';
    _commerceAccountState = _customer == null
        ? CommerceAccountState.inactive
        : CommerceAccountState.unavailable;
    notifyListeners();
    if (token != null) unawaited(_revokeWebsiteSession(token));
  }

  Set<String> _savedProductIds(dynamic value) {
    if (value is! List) return const <String>{};
    return value
        .map((item) => '$item'.trim())
        .where((item) => item.isNotEmpty)
        .take(500)
        .toSet();
  }

  List<String> _orderedProductIds(dynamic value) {
    if (value is! List) return const <String>[];
    final seen = <String>{};
    return value
        .map((item) => '$item'.trim())
        .where((item) => item.isNotEmpty && seen.add(item))
        .take(100)
        .toList();
  }

  List<CartItem> _cartItems(dynamic value) {
    if (value is! List) return const <CartItem>[];
    final items = <CartItem>[];
    for (final row in value.take(100)) {
      if (row is! Map) continue;
      try {
        items.add(CartItem.fromProfileJson(Map<String, dynamic>.from(row)));
      } on FormatException {
        continue;
      }
    }
    return List.unmodifiable(items);
  }

  Future<void> signIn(String email, String password) async {
    final normalizedEmail = normalizeEmail(email);
    if (firebaseEnabled) {
      await fb.FirebaseAuth.instance.signInWithEmailAndPassword(
        email: normalizedEmail,
        password: password,
      );
      return;
    }
    _requireLocalAuth();
    _customer = Customer(
      id: 'local-${normalizedEmail.hashCode}',
      email: normalizedEmail,
      name: normalizedEmail.split('@').first,
      phone: '',
    );
    _profileReady = true;
    notifyListeners();
  }

  Future<void> signInWithGoogle() async {
    if (!firebaseEnabled) {
      _requireLocalAuth();
    }

    // google_sign_in's authenticate() API is intentionally unavailable on
    // web. Firebase Auth provides the supported popup flow there and lets us
    // keep the same branded app button while native platforms continue using
    // GoogleSignIn below.
    if (kIsWeb) {
      final provider = fb.GoogleAuthProvider()
        ..addScope('email')
        ..addScope('profile');
      await fb.FirebaseAuth.instance.signInWithPopup(provider);
      return;
    }

    await _initializeGoogleSignIn();
    final account = await GoogleSignIn.instance.authenticate(
      scopeHint: const ['email', 'profile'],
    );
    final auth = account.authentication;
    if (auth.idToken == null) {
      throw Exception('google-signin-failed');
    }
    final credential = fb.GoogleAuthProvider.credential(
      idToken: auth.idToken,
      accessToken: null,
    );
    await fb.FirebaseAuth.instance.signInWithCredential(credential);
  }

  Future<void> signInWithApple() async {
    if (!firebaseEnabled) {
      _requireLocalAuth();
    }

    final provider = fb.AppleAuthProvider()
      ..addScope('email')
      ..addScope('name');
    try {
      if (kIsWeb) {
        await fb.FirebaseAuth.instance.signInWithPopup(provider);
      } else {
        await fb.FirebaseAuth.instance.signInWithProvider(provider);
      }
    } on fb.FirebaseAuthException catch (error) {
      if (error.code == 'web-context-canceled' ||
          error.code == 'popup-closed-by-user' ||
          error.code == 'canceled-popup-request') {
        throw Exception('apple-signin-cancelled');
      }
      throw Exception('apple-signin-failed:${error.code}');
    }
  }

  Future<void> signUp({
    required String name,
    required String phone,
    required String email,
    required String password,
    String city = '',
    String address = '',
    required bool legalAccepted,
  }) async {
    if (!legalAccepted) {
      throw ArgumentError(
        'Maxfiylik siyosati va foydalanish shartlariga rozilik kerak.',
      );
    }
    final normalizedEmail = normalizeEmail(email);
    final normalizedPhone = normalizePhoneNumber(phone);
    final normalizedCity = normalizeProfileText(city, max: 80, label: 'Shahar');
    final normalizedAddress = normalizeProfileText(
      address,
      max: 200,
      label: 'Manzil',
    );
    if (firebaseEnabled) {
      final cred = await fb.FirebaseAuth.instance
          .createUserWithEmailAndPassword(
            email: normalizedEmail,
            password: password,
          );
      try {
        await cred.user?.updateDisplayName(name);
        await FirebaseFirestore.instance
            .collection('customers')
            .doc(cred.user!.uid)
            .set({
              'email': normalizedEmail,
              'name': name,
              'phone': normalizedPhone,
              'city': normalizedCity,
              'address': normalizedAddress,
              'company_name': '',
              'country': '',
              'status': 'active',
              'legal_consent_version': legalConsentVersion,
              'legal_accepted_at': DateTime.now().toUtc().toIso8601String(),
              'created_at': DateTime.now().toUtc().toIso8601String(),
              'updated_at': DateTime.now().toUtc().toIso8601String(),
            }, SetOptions(merge: true));
        await cred.user?.sendEmailVerification();
      } catch (_) {
        try {
          await cred.user?.delete();
        } catch (_) {
          // The original signup error is more useful to the customer.
        }
        rethrow;
      }
      _customer = Customer(
        id: cred.user!.uid,
        email: normalizedEmail,
        name: name,
        phone: normalizedPhone,
        city: normalizedCity,
        address: normalizedAddress,
      );
      _profileReady = true;
      notifyListeners();
      return;
    }
    _requireLocalAuth();
    _customer = Customer(
      id: 'local-${normalizedEmail.hashCode}',
      email: normalizedEmail,
      name: name,
      phone: normalizedPhone,
      city: normalizedCity,
      address: normalizedAddress,
    );
    _profileReady = true;
    notifyListeners();
  }

  Future<void> sendPasswordReset(String email) async {
    final normalizedEmail = normalizeEmail(email);
    final validation = validateEmail(normalizedEmail);
    if (validation != null) {
      throw ArgumentError(validation);
    }
    if (firebaseEnabled) {
      await fb.FirebaseAuth.instance.sendPasswordResetEmail(
        email: normalizedEmail,
      );
      return;
    }
    _requireLocalAuth();
  }

  Future<void> updateProfile({
    required String name,
    required String phone,
    String city = '',
    String address = '',
    String companyName = '',
    String country = '',
  }) async {
    final current = _customer;
    if (current == null) return;
    final normalizedPhone = normalizePhoneNumber(phone);
    final normalizedCity = normalizeProfileText(city, max: 80, label: 'Shahar');
    final normalizedAddress = normalizeProfileText(
      address,
      max: 200,
      label: 'Manzil',
    );
    final normalizedCompanyName = normalizeProfileText(
      companyName,
      max: 160,
      label: 'Kompaniya',
    );
    final normalizedCountry = normalizeProfileText(
      country,
      max: 80,
      label: 'Mamlakat',
    );
    if (firebaseEnabled) {
      final user = fb.FirebaseAuth.instance.currentUser;
      await user?.updateDisplayName(name);
      await FirebaseFirestore.instance
          .collection('customers')
          .doc(current.id)
          .set({
            'email': current.email,
            'name': name,
            'phone': normalizedPhone,
            'city': normalizedCity,
            'address': normalizedAddress,
            'company_name': normalizedCompanyName,
            'country': normalizedCountry,
            'status': 'active',
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          }, SetOptions(merge: true));
      final updated = Customer(
        id: current.id,
        email: current.email,
        name: name,
        phone: normalizedPhone,
        city: normalizedCity,
        address: normalizedAddress,
        companyName: normalizedCompanyName,
        country: normalizedCountry,
        savedProductIds: current.savedProductIds,
        recentProductIds: current.recentProductIds,
        cartItems: current.cartItems,
      );
      _customer = updated;
      notifyListeners();
      _queueWebsiteProfileSync(updated);
      return;
    }
    _customer = Customer(
      id: current.id,
      email: current.email,
      name: name,
      phone: normalizedPhone,
      city: normalizedCity,
      address: normalizedAddress,
      companyName: normalizedCompanyName,
      country: normalizedCountry,
      savedProductIds: current.savedProductIds,
      recentProductIds: current.recentProductIds,
      cartItems: current.cartItems,
    );
    notifyListeners();
  }

  Future<void> updateSavedProducts(Set<String> productIds) async {
    final current = _customer;
    if (current == null) return;
    final saved = productIds
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet();
    if (firebaseEnabled) {
      await FirebaseFirestore.instance
          .collection('customers')
          .doc(current.id)
          .set({
            'email': current.email,
            'name': current.name,
            'phone': current.phone,
            'city': current.city,
            'address': current.address,
            'status': 'active',
            'saved_product_ids': (saved.toList()..sort()).take(500).toList(),
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          }, SetOptions(merge: true));
      return;
    }
    _customer = Customer(
      id: current.id,
      email: current.email,
      name: current.name,
      phone: current.phone,
      city: current.city,
      address: current.address,
      companyName: current.companyName,
      country: current.country,
      savedProductIds: saved,
      recentProductIds: current.recentProductIds,
      cartItems: current.cartItems,
    );
    notifyListeners();
  }

  Future<void> updateRecentProducts(List<String> productIds) async {
    final current = _customer;
    if (current == null) return;
    final seen = <String>{};
    final recent = productIds
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty && seen.add(id))
        .take(100)
        .toList();
    if (firebaseEnabled) {
      await FirebaseFirestore.instance
          .collection('customers')
          .doc(current.id)
          .set({
            'email': current.email,
            'name': current.name,
            'phone': current.phone,
            'city': current.city,
            'address': current.address,
            'status': 'active',
            'recent_product_ids': recent,
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          }, SetOptions(merge: true));
      return;
    }
    _customer = Customer(
      id: current.id,
      email: current.email,
      name: current.name,
      phone: current.phone,
      city: current.city,
      address: current.address,
      companyName: current.companyName,
      country: current.country,
      savedProductIds: current.savedProductIds,
      recentProductIds: List.unmodifiable(recent),
      cartItems: current.cartItems,
    );
    notifyListeners();
  }

  Future<void> updateCart(List<CartItem> items) async {
    final current = _customer;
    if (current == null) return;
    final compactItems = items.take(100).toList();
    if (firebaseEnabled) {
      await FirebaseFirestore.instance
          .collection('customers')
          .doc(current.id)
          .set({
            'email': current.email,
            'name': current.name,
            'phone': current.phone,
            'city': current.city,
            'address': current.address,
            'status': 'active',
            'cart_items': compactItems
                .map((item) => item.toProfileJson())
                .toList(),
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          }, SetOptions(merge: true));
      return;
    }
    _customer = Customer(
      id: current.id,
      email: current.email,
      name: current.name,
      phone: current.phone,
      city: current.city,
      address: current.address,
      companyName: current.companyName,
      country: current.country,
      savedProductIds: current.savedProductIds,
      recentProductIds: current.recentProductIds,
      cartItems: List.unmodifiable(compactItems),
    );
    notifyListeners();
  }

  Future<void> signOut() async {
    final websiteToken = _websiteSessionToken;
    _websiteSessionGeneration += 1;
    _websiteProfileSyncRevision += 1;
    _websiteSessionToken = null;
    _commerceAccountState = CommerceAccountState.inactive;
    _commerceAccountError = '';
    if (firebaseEnabled) {
      await fb.FirebaseAuth.instance.signOut();
    }
    _customer = null;
    _profileReady = false;
    notifyListeners();
    if (websiteToken != null) {
      unawaited(_revokeWebsiteSession(websiteToken));
    }
  }

  Future<void> deleteAccount({
    required String confirmation,
    required String reasonCode,
    String reasonDetail = '',
    String languageCode = defaultLanguageCode,
  }) async {
    if (confirmation.trim().toUpperCase() != 'DELETE') {
      throw ArgumentError('Tasdiqlash uchun DELETE deb yozing.');
    }
    final normalizedReasonCode = reasonCode.trim();
    final normalizedReasonDetail = reasonDetail.trim();
    if (!accountDeletionReasonCodes.contains(normalizedReasonCode) ||
        normalizedReasonDetail.length > 500 ||
        (normalizedReasonCode == 'other' &&
            normalizedReasonDetail.length < 3)) {
      throw ArgumentError(
        localizedText('delete.reason_invalid', languageCode: languageCode),
      );
    }
    final deletedCustomerId = _customer?.id;
    if (firebaseEnabled) {
      final callable = FirebaseFunctions.instanceFor(
        region: 'asia-southeast1',
      ).httpsCallable('deleteCustomerAccount');
      await callable
          .call<void>({
            'confirmation': 'DELETE',
            'reason_code': normalizedReasonCode,
            'reason_detail': normalizedReasonDetail,
            'locale': normalizeLanguageCode(languageCode),
          })
          .timeout(_firebaseOperationTimeout);
      final websiteToken = _websiteSessionToken;
      _websiteSessionGeneration += 1;
      _websiteProfileSyncRevision += 1;
      _websiteSessionToken = null;
      _commerceAccountState = CommerceAccountState.inactive;
      await fb.FirebaseAuth.instance.signOut();
      if (websiteToken != null) {
        unawaited(_revokeWebsiteSession(websiteToken));
      }
    } else {
      _requireLocalAuth();
    }
    if (deletedCustomerId != null) {
      try {
        await Future.wait([
          CartStore().clear(scope: deletedCustomerId),
          CheckoutRecoveryStore().clear(scope: deletedCustomerId),
          FavoritesStore().clear(scope: deletedCustomerId),
          RecentProductsStore().clear(scope: deletedCustomerId),
        ]);
      } catch (_) {
        // Central listeners retry scoped cleanup after the account disappears.
      }
    }
    _lastDeletedCustomerId = deletedCustomerId;
    _customer = null;
    _profileReady = false;
    notifyListeners();
  }

  void _requireLocalAuth() {
    if (_localAuthEnabled) return;
    throw StateError('auth-backend-unavailable');
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _profileSub?.cancel();
    if (_ownsWebsiteSessions) _websiteSessions.close();
    super.dispose();
  }
}
