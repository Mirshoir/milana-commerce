import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

class MilanaFirebaseOptions {
  static const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const webAppId = String.fromEnvironment('FIREBASE_WEB_APP_ID');
  static const androidAppId = String.fromEnvironment('FIREBASE_ANDROID_APP_ID');
  static const iosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');
  static const messagingSenderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
  );
  static const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const authDomain = String.fromEnvironment('FIREBASE_AUTH_DOMAIN');
  static const storageBucket = String.fromEnvironment(
    'FIREBASE_STORAGE_BUCKET',
  );
  static const iosBundleId = String.fromEnvironment(
    'FIREBASE_IOS_BUNDLE_ID',
    defaultValue: 'uz.milana.milanaFlutter',
  );
  static const androidPackageName = String.fromEnvironment(
    'FIREBASE_ANDROID_PACKAGE',
    defaultValue: 'uz.milana.milana_flutter',
  );

  static String get currentAppId {
    if (kIsWeb) return webAppId.isNotEmpty ? webAppId : appId;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return androidAppId.isNotEmpty ? androidAppId : appId;
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
        return iosAppId.isNotEmpty ? iosAppId : appId;
      default:
        return appId;
    }
  }

  static bool get isConfigured =>
      apiKey.isNotEmpty && currentAppId.isNotEmpty && projectId.isNotEmpty;

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return FirebaseOptions(
        apiKey: apiKey,
        appId: webAppId.isNotEmpty ? webAppId : appId,
        messagingSenderId: messagingSenderId,
        projectId: projectId,
        authDomain: authDomain,
        storageBucket: storageBucket,
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
        return FirebaseOptions(
          apiKey: apiKey,
          appId: iosAppId.isNotEmpty ? iosAppId : appId,
          messagingSenderId: messagingSenderId,
          projectId: projectId,
          storageBucket: storageBucket,
          iosBundleId: iosBundleId,
        );
      case TargetPlatform.android:
        return FirebaseOptions(
          apiKey: apiKey,
          appId: androidAppId.isNotEmpty ? androidAppId : appId,
          messagingSenderId: messagingSenderId,
          projectId: projectId,
          storageBucket: storageBucket,
        );
      default:
        return FirebaseOptions(
          apiKey: apiKey,
          appId: appId,
          messagingSenderId: messagingSenderId,
          projectId: projectId,
          authDomain: authDomain,
          storageBucket: storageBucket,
        );
    }
  }
}
