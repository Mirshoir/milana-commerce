import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';

import 'src/app.dart';
import 'src/firebase/firebase_emulators.dart';
import 'src/firebase/firebase_options.dart';
import 'src/services/auth_service.dart';
import 'src/services/catalog_repository.dart';
import 'src/services/order_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final firebaseReady = MilanaFirebaseOptions.isConfigured;
  if (firebaseReady) {
    await Firebase.initializeApp(
      options: MilanaFirebaseOptions.currentPlatform,
    );
    await MilanaFirebaseEmulators.connect();
  }

  final catalog = CatalogRepository(firebaseEnabled: firebaseReady);
  final orders = OrderRepository(firebaseEnabled: firebaseReady);
  final auth = AuthService(firebaseEnabled: firebaseReady);

  runApp(MilanaApp(catalog: catalog, orders: orders, auth: auth));
}
