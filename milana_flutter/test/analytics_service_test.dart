import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/services/analytics_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('analytics is opt-in and persists the customer choice', () async {
    SharedPreferences.setMockInitialValues({});
    final analytics = AnalyticsService(firebaseEnabled: false);

    await analytics.initialize();
    expect(analytics.ready, isTrue);
    expect(analytics.consentGranted, isFalse);
    expect(analytics.canRecord, isFalse);

    await analytics.setConsent(true);
    expect(analytics.consentGranted, isTrue);
    expect(analytics.canRecord, isFalse);
    expect(
      (await SharedPreferences.getInstance()).getBool(
        'milana_analytics_consent',
      ),
      isTrue,
    );
  });
}
