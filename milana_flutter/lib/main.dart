import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/semantics.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'src/app.dart';
import 'src/firebase/firebase_emulators.dart';
import 'src/firebase/firebase_options.dart';
import 'src/services/auth_service.dart';
import 'src/services/analytics_service.dart';
import 'src/services/catalog_repository.dart';
import 'src/services/order_repository.dart';

SemanticsHandle? _webSemanticsHandle;

void main() {
  runZonedGuarded(_bootstrap, (error, stackTrace) {
    debugPrint('Unhandled Milana application error: ${error.runtimeType}');
    debugPrintStack(stackTrace: stackTrace);
  });
}

Future<void> _bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Product photos dominate catalog memory. Keep decoded images bounded so a
  // fast fling cannot retain enough full-resolution frames for iOS to kill the
  // process under memory pressure.
  PaintingBinding.instance.imageCache
    ..maximumSize = 160
    ..maximumSizeBytes = 64 << 20;
  if (kIsWeb) {
    // Flutter web normally waits for a user gesture before exposing its
    // semantics tree. Keep it enabled so keyboard and assistive-technology
    // users can navigate the storefront immediately.
    _webSemanticsHandle ??= SemanticsBinding.instance.ensureSemantics();
  }
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
  };
  PlatformDispatcher.instance.onError = (error, stackTrace) {
    debugPrint('Unhandled Milana platform error: ${error.runtimeType}');
    debugPrintStack(stackTrace: stackTrace);
    return true;
  };
  ErrorWidget.builder = (details) => const ColoredBox(
    color: milanaIvory,
    child: Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Text(
          'Bu bo‘lim vaqtincha ochilmadi. Qayta urinib ko‘ring.',
          textAlign: TextAlign.center,
          style: TextStyle(color: milanaInk, fontWeight: FontWeight.w700),
        ),
      ),
    ),
  );
  await Future.wait([
    initializeDateFormatting('uz'),
    initializeDateFormatting('ru'),
    initializeDateFormatting('en'),
  ]);

  final firebaseReady = MilanaFirebaseOptions.isConfigured;
  if (kReleaseMode && !firebaseReady) {
    runApp(const MilanaBootstrapErrorApp());
    return;
  }
  if (firebaseReady) {
    try {
      await Firebase.initializeApp(
        options: MilanaFirebaseOptions.currentPlatform,
      );
      await MilanaFirebaseEmulators.connect();
    } catch (error, stackTrace) {
      debugPrint('Firebase bootstrap failed: ${error.runtimeType}');
      debugPrintStack(stackTrace: stackTrace);
      runApp(const MilanaBootstrapErrorApp());
      return;
    }
  }

  final catalog = CatalogRepository(firebaseEnabled: firebaseReady);
  final analytics = AnalyticsService(firebaseEnabled: firebaseReady);
  await analytics.initialize();
  final auth = AuthService(firebaseEnabled: firebaseReady);
  final orders = OrderRepository(
    firebaseEnabled: firebaseReady,
    websiteSessionTokenProvider: () => auth.websiteSessionToken,
    onWebsiteSessionInvalidated: auth.invalidateWebsiteSession,
  );

  runApp(
    MilanaApp(
      catalog: catalog,
      orders: orders,
      auth: auth,
      analytics: analytics,
    ),
  );
}

class MilanaBootstrapErrorApp extends StatelessWidget {
  const MilanaBootstrapErrorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: milanaIvory,
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: const BoxDecoration(
                        color: milanaBlush,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.cloud_off_outlined,
                        color: milanaBurgundy,
                        size: 34,
                      ),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Milana Premium vaqtincha ochilmadi',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: milanaInk,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Internet aloqasini tekshirib, ilovani qayta oching. Muammo davom etsa: +998 50 155 10 10',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: milanaInk.withValues(alpha: .68),
                        height: 1.45,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
