import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../models/distributor.dart';

const _distributorFunctionRegion = 'asia-southeast1';

class DistributorRepository {
  DistributorRepository({
    required this.firebaseEnabled,
    this.firestoreOverride,
    this.functionsOverride,
  });

  final bool firebaseEnabled;
  final FirebaseFirestore? firestoreOverride;
  final FirebaseFunctions? functionsOverride;

  FirebaseFirestore get firestore =>
      firestoreOverride ?? FirebaseFirestore.instance;
  FirebaseFunctions get functions =>
      functionsOverride ??
      FirebaseFunctions.instanceFor(region: _distributorFunctionRegion);

  Future<DistributorApplicationReceipt> submitApplication(
    DistributorApplicationRequest request,
  ) async {
    if (!firebaseEnabled) {
      return DistributorApplicationReceipt(
        id: request.clientApplicationId,
        number:
            'LOCAL-${request.clientApplicationId.substring(0, 6).toUpperCase()}',
        status: DistributorApplicationStatus.submitted,
      );
    }
    final result = await functions
        .httpsCallable('submitDistributorApplication')
        .call<Map<String, dynamic>>(request.toFunctionJson())
        .timeout(const Duration(seconds: 30));
    return DistributorApplicationReceipt.fromMap(
      Map<String, dynamic>.from(result.data),
    );
  }

  Stream<List<DistributorApplication>> applicationsFor(String customerId) {
    if (!firebaseEnabled || customerId.isEmpty) {
      return Stream.value(const <DistributorApplication>[]);
    }
    return firestore
        .collection('distributor_applications')
        .where('customer_id', isEqualTo: customerId)
        .orderBy('created_at', descending: true)
        .limit(10)
        .snapshots()
        .map(
          (snapshot) => snapshot.docs
              .map(
                (doc) => DistributorApplication.fromMap(doc.data(), id: doc.id),
              )
              .toList(growable: false),
        );
  }

  Stream<List<AccountNotification>> notificationsFor(String customerId) {
    if (!firebaseEnabled || customerId.isEmpty) {
      return Stream.value(const <AccountNotification>[]);
    }
    return firestore
        .collection('customer_notifications')
        .where('customer_id', isEqualTo: customerId)
        .orderBy('created_at', descending: true)
        .limit(100)
        .snapshots()
        .map(
          (snapshot) => snapshot.docs
              .map((doc) => AccountNotification.fromMap(doc.data(), id: doc.id))
              .toList(growable: false),
        );
  }

  Stream<NotificationPreferences> notificationPreferencesFor(
    String customerId,
  ) {
    if (!firebaseEnabled || customerId.isEmpty) {
      return Stream.value(const NotificationPreferences());
    }
    return firestore
        .collection('notification_preferences')
        .doc(customerId)
        .snapshots()
        .map(
          (snapshot) => NotificationPreferences.fromMap(
            snapshot.data() ?? const <String, dynamic>{},
          ),
        );
  }

  Future<void> saveNotificationPreferences(
    NotificationPreferences preferences,
  ) async {
    if (!firebaseEnabled) return;
    await functions
        .httpsCallable('updateNotificationPreferences')
        .call<void>(preferences.toFunctionJson())
        .timeout(const Duration(seconds: 20));
  }

  Future<void> markNotificationRead(String notificationId) async {
    if (!firebaseEnabled || notificationId.isEmpty) return;
    await functions
        .httpsCallable('markNotificationRead')
        .call<void>({'notification_id': notificationId})
        .timeout(const Duration(seconds: 20));
  }

  Future<void> registerDeviceToken({
    required String token,
    required String platform,
    required String languageCode,
  }) async {
    if (!firebaseEnabled || token.isEmpty) return;
    await functions
        .httpsCallable('registerNotificationDevice')
        .call<void>({
          'token': token,
          'platform': platform,
          'lang': languageCode,
        })
        .timeout(const Duration(seconds: 20));
  }
}
