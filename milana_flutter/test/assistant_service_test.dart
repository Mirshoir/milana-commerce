import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:milana_flutter/src/services/assistant_service.dart';

void main() {
  test('assistant parses a valid response', () async {
    final service = AssistantService(
      baseUrl: 'https://milanapremium.uz',
      client: MockClient((request) async {
        expect(request.url.path, '/api/chat/message');
        expect(jsonDecode(request.body)['message'], 'Salom');
        return http.Response(
          jsonEncode({'session_id': 7, 'reply': 'Assalomu alaykum!'}),
          200,
        );
      }),
    );
    addTearDown(service.close);

    final reply = await service.send(message: 'Salom');

    expect(reply.sessionId, 7);
    expect(reply.reply, 'Assalomu alaykum!');
  });

  test('assistant requests time out instead of hanging', () async {
    final service = AssistantService(
      requestTimeout: const Duration(milliseconds: 5),
      client: MockClient((request) => Completer<http.Response>().future),
    );
    addTearDown(service.close);

    await expectLater(
      service.send(message: 'Salom'),
      throwsA(isA<TimeoutException>()),
    );
  });

  test(
    'assistant converts invalid error bodies into a stable failure',
    () async {
      final service = AssistantService(
        client: MockClient(
          (request) async => http.Response('<html>bad</html>', 502),
        ),
      );
      addTearDown(service.close);

      await expectLater(
        service.send(message: 'Salom'),
        throwsA(predicate((error) => '$error'.contains('assistant_failed'))),
      );
    },
  );
}
