import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/app.dart';

void main() {
  test('tabIndexFromFragment maps PWA shortcut fragments', () {
    expect(tabIndexFromFragment(''), 0);
    expect(tabIndexFromFragment('catalog'), 0);
    expect(tabIndexFromFragment('cart'), 1);
    expect(tabIndexFromFragment('savat'), 1);
    expect(tabIndexFromFragment('support'), 2);
    expect(tabIndexFromFragment('yordam'), 2);
    expect(tabIndexFromFragment('account'), 3);
    expect(tabIndexFromFragment('akkaunt'), 3);
  });

  test('tabIndexFromFragment ignores casing and surrounding whitespace', () {
    expect(tabIndexFromFragment(' CART '), 1);
    expect(tabIndexFromFragment('Support'), 2);
    expect(tabIndexFromFragment(' PROFILE '), 3);
  });

  test('tabIndexFromLaunchUri prefers manifest query params', () {
    expect(tabIndexFromLaunchUri(Uri.parse('https://milana.uz/?tab=cart')), 1);
    expect(
      tabIndexFromLaunchUri(Uri.parse('https://milana.uz/?view=support')),
      2,
    );
    expect(
      tabIndexFromLaunchUri(Uri.parse('https://milana.uz/?tab=account')),
      3,
    );
    expect(
      tabIndexFromLaunchUri(Uri.parse('https://milana.uz/?tab=cart#account')),
      1,
    );
  });

  test('tabIndexFromLaunchUri keeps hash fallback for old shortcuts', () {
    expect(tabIndexFromLaunchUri(Uri.parse('https://milana.uz/#cart')), 1);
    expect(tabIndexFromLaunchUri(Uri.parse('https://milana.uz/#support')), 2);
    expect(tabIndexFromLaunchUri(Uri.parse('https://milana.uz/#account')), 3);
  });
}
