import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:milana_flutter/src/services/website_session_service.dart';

void main() {
  const validToken =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  test('exchanges a verified Firebase token for a website session', () async {
    final service = WebsiteSessionService(
      baseUrl: 'https://milanapremium.uz/',
      client: MockClient((request) async {
        expect(request.method, 'POST');
        expect(
          request.url.toString(),
          'https://milanapremium.uz/api/auth/firebase',
        );
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['idToken'], 'firebase-id-token');
        expect(body['name'], 'Ali');
        return http.Response(
          jsonEncode({
            'session_token': validToken,
            'customer': {'id': 17, 'email': 'ali@example.com'},
          }),
          200,
        );
      }),
    );
    addTearDown(service.close);

    final session = await service.exchangeFirebaseToken(
      idToken: 'firebase-id-token',
      name: 'Ali',
      city: 'Andijon',
      address: 'Qoratut 605',
    );

    expect(session.token, validToken);
    expect(session.customerId, '17');
    expect(session.email, 'ali@example.com');
  });

  test('surfaces email verification and malformed-session failures', () async {
    final verificationService = WebsiteSessionService(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({'error': 'firebase_email_not_verified'}),
          401,
        ),
      ),
    );
    addTearDown(verificationService.close);

    await expectLater(
      verificationService.exchangeFirebaseToken(
        idToken: 'firebase-id-token',
        name: 'Ali',
        city: '',
        address: '',
      ),
      throwsA(
        isA<WebsiteSessionException>().having(
          (error) => error.code,
          'code',
          'firebase_email_not_verified',
        ),
      ),
    );

    final malformedService = WebsiteSessionService(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({'session_token': 'short', 'customer': {}}),
          200,
        ),
      ),
    );
    addTearDown(malformedService.close);
    await expectLater(
      malformedService.exchangeFirebaseToken(
        idToken: 'firebase-id-token',
        name: 'Ali',
        city: '',
        address: '',
      ),
      throwsA(
        isA<WebsiteSessionException>().having(
          (error) => error.code,
          'code',
          'invalid-website-session',
        ),
      ),
    );
  });

  test('updates the commerce profile with the website bearer token', () async {
    final service = WebsiteSessionService(
      client: MockClient((request) async {
        expect(request.method, 'PUT');
        expect(request.url.path, '/api/auth/profile');
        expect(request.headers['authorization'], 'Bearer $validToken');
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['phone'], '+998 90 123 45 67');
        return http.Response(jsonEncode({'ok': true}), 200);
      }),
    );
    addTearDown(service.close);

    await service.updateProfile(
      sessionToken: validToken,
      name: 'Ali',
      phone: '+998 90 123 45 67',
      city: 'Andijon',
      address: 'Qoratut 605',
    );
  });
}
