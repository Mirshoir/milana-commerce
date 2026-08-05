import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

class MilanaFirebaseOptions {
  static const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const webApiKey = String.fromEnvironment('FIREBASE_WEB_API_KEY');
  static const androidApiKey = String.fromEnvironment(
    'FIREBASE_ANDROID_API_KEY',
  );
  static const iosApiKey = String.fromEnvironment('FIREBASE_IOS_API_KEY');
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

  static String get currentApiKey {
    if (kIsWeb) return webApiKey.isNotEmpty ? webApiKey : apiKey;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return androidApiKey.isNotEmpty ? androidApiKey : apiKey;
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
        return iosApiKey.isNotEmpty ? iosApiKey : apiKey;
      default:
        return apiKey;
    }
  }

  static List<String> get configurationProblems {
    final missing = <String>[];
    if (currentApiKey.isEmpty) missing.add('platform Firebase API key');
    if (currentAppId.isEmpty) missing.add('platform Firebase app ID');
    if (messagingSenderId.isEmpty) missing.add('FIREBASE_MESSAGING_SENDER_ID');
    if (projectId.isEmpty) missing.add('FIREBASE_PROJECT_ID');
    if (storageBucket.isEmpty) missing.add('FIREBASE_STORAGE_BUCKET');
    if (kIsWeb && authDomain.isEmpty) missing.add('FIREBASE_AUTH_DOMAIN');
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      if (iosBundleId != 'uz.milana.milanaFlutter') {
        missing.add('FIREBASE_IOS_BUNDLE_ID');
      }
    }
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      if (androidPackageName != 'uz.milana.milana_flutter') {
        missing.add('FIREBASE_ANDROID_PACKAGE');
      }
    }
    return List.unmodifiable(missing);
  }

  static bool get isConfigured => configurationProblems.isEmpty;

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return FirebaseOptions(
        apiKey: currentApiKey,
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
          apiKey: currentApiKey,
          appId: iosAppId.isNotEmpty ? iosAppId : appId,
          messagingSenderId: messagingSenderId,
          projectId: projectId,
          storageBucket: storageBucket,
          iosBundleId: iosBundleId,
        );
      case TargetPlatform.android:
        return FirebaseOptions(
          apiKey: currentApiKey,
          appId: androidAppId.isNotEmpty ? androidAppId : appId,
          messagingSenderId: messagingSenderId,
          projectId: projectId,
          storageBucket: storageBucket,
        );
      default:
        return FirebaseOptions(
          apiKey: currentApiKey,
          appId: appId,
          messagingSenderId: messagingSenderId,
          projectId: projectId,
          authDomain: authDomain,
          storageBucket: storageBucket,
        );
    }
  }
}
