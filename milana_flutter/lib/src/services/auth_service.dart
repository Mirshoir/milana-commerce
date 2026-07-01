import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/foundation.dart';

import '../models/cart_item.dart';
import 'auth_forms.dart';

class Customer {
  const Customer({
    required this.id,
    required this.email,
    required this.name,
    required this.phone,
    this.city = '',
    this.address = '',
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
  final Set<String> savedProductIds;
  final List<String> recentProductIds;
  final List<CartItem> cartItems;
}

class AuthService extends ChangeNotifier {
  AuthService({required this.firebaseEnabled}) {
    if (firebaseEnabled) {
      _authSub = fb.FirebaseAuth.instance.authStateChanges().listen(
        _watchFirebaseCustomer,
      );
    }
  }

  final bool firebaseEnabled;
  Customer? _customer;
  StreamSubscription<fb.User?>? _authSub;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _profileSub;

  Customer? get customer => _customer;
  bool get signedIn => _customer != null;

  void _watchFirebaseCustomer(fb.User? user) {
    _profileSub?.cancel();
    _profileSub = null;
    if (user == null) {
      _customer = null;
      notifyListeners();
      return;
    }
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
            savedProductIds: _savedProductIds(data['saved_product_ids']),
            recentProductIds: _orderedProductIds(data['recent_product_ids']),
            cartItems: _cartItems(data['cart_items']),
          );
          notifyListeners();
        });
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
    _customer = Customer(
      id: 'local-${normalizedEmail.hashCode}',
      email: normalizedEmail,
      name: normalizedEmail.split('@').first,
      phone: '',
    );
    notifyListeners();
  }

  Future<void> signUp({
    required String name,
    required String phone,
    required String email,
    required String password,
    String city = '',
    String address = '',
  }) async {
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
      await cred.user?.updateDisplayName(name);
      await cred.user?.sendEmailVerification();
      await FirebaseFirestore.instance
          .collection('customers')
          .doc(cred.user!.uid)
          .set({
            'email': normalizedEmail,
            'name': name,
            'phone': normalizedPhone,
            'city': normalizedCity,
            'address': normalizedAddress,
            'status': 'active',
            'created_at': DateTime.now().toUtc().toIso8601String(),
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          }, SetOptions(merge: true));
      _customer = Customer(
        id: cred.user!.uid,
        email: normalizedEmail,
        name: name,
        phone: normalizedPhone,
        city: normalizedCity,
        address: normalizedAddress,
      );
      notifyListeners();
      return;
    }
    _customer = Customer(
      id: 'local-${normalizedEmail.hashCode}',
      email: normalizedEmail,
      name: name,
      phone: normalizedPhone,
      city: normalizedCity,
      address: normalizedAddress,
    );
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
    }
  }

  Future<void> updateProfile({
    required String name,
    required String phone,
    String city = '',
    String address = '',
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
            'status': 'active',
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          }, SetOptions(merge: true));
      return;
    }
    _customer = Customer(
      id: current.id,
      email: current.email,
      name: name,
      phone: normalizedPhone,
      city: normalizedCity,
      address: normalizedAddress,
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
      savedProductIds: current.savedProductIds,
      recentProductIds: current.recentProductIds,
      cartItems: List.unmodifiable(compactItems),
    );
    notifyListeners();
  }

  Future<void> signOut() async {
    if (firebaseEnabled) {
      await fb.FirebaseAuth.instance.signOut();
    }
    _customer = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _profileSub?.cancel();
    super.dispose();
  }
}
