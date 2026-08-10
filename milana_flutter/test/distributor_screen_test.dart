import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/features/distributor/distributor_screen.dart';
import 'package:milana_flutter/src/localization/app_localization.dart';
import 'package:milana_flutter/src/services/auth_service.dart';
import 'package:milana_flutter/src/services/distributor_repository.dart';

void main() {
  testWidgets('partnership screen presents proof and opens an application', (
    tester,
  ) async {
    final auth = AuthService(firebaseEnabled: false);
    addTearDown(auth.dispose);
    final language = LanguageController(languageCode: 'uz');
    addTearDown(language.dispose);

    await tester.pumpWidget(
      AppLanguageScope(
        notifier: language,
        child: MaterialApp(
          home: Scaffold(
            body: DistributorScreen(
              repository: DistributorRepository(firebaseEnabled: false),
              auth: auth,
              onOpenSupport: () {},
              onOpenNotifications: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('25+'), findsOneWidget);
    expect(find.text('500K'), findsOneWidget);
    expect(find.text('20+'), findsOneWidget);
    expect(find.text('Distributor bo‘lish'), findsWidgets);

    await tester.tap(find.text('Distributor bo‘lish').first);
    await tester.pumpAndSettle();

    expect(find.text('Distributor arizasi'), findsOneWidget);
    expect(find.text('Kontakt shaxs'), findsOneWidget);
    expect(find.text('Kompaniya nomi'), findsOneWidget);
  });
}
