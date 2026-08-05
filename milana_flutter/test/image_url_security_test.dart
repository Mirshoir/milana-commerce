import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/app.dart';

void main() {
  test('catalog images accept HTTPS and reject insecure remote origins', () {
    expect(
      resolveImageUrl('https://milanapremium.uz/uploads/model.jpg'),
      'https://milanapremium.uz/uploads/model.jpg',
    );
    expect(
      resolveImageUrl('http://untrusted.example/uploads/model.jpg'),
      isEmpty,
    );
  });

  test('local HTTP images remain available for development preview', () {
    expect(
      resolveImageUrl('http://127.0.0.1:4173/uploads/model.jpg'),
      'http://127.0.0.1:4173/uploads/model.jpg',
    );
  });
}
