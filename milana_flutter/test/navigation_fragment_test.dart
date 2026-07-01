import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/app.dart';

void main() {
  test('tabIndexFromFragment maps PWA shortcut fragments', () {
    expect(tabIndexFromFragment(''), 0);
    expect(tabIndexFromFragment('home'), 0);
    expect(tabIndexFromFragment('catalog'), 1);
    expect(tabIndexFromFragment('shop'), 1);
    expect(tabIndexFromFragment('cart'), 2);
    expect(tabIndexFromFragment('savat'), 2);
    expect(tabIndexFromFragment('support'), 3);
    expect(tabIndexFromFragment('yordam'), 3);
    expect(tabIndexFromFragment('account'), 4);
    expect(tabIndexFromFragment('akkaunt'), 4);
  });

  test('tabIndexFromFragment ignores casing and surrounding whitespace', () {
    expect(tabIndexFromFragment(' CART '), 2);
    expect(tabIndexFromFragment('Support'), 3);
    expect(tabIndexFromFragment(' PROFILE '), 4);
  });

  test('tabIndexFromLaunchUri prefers manifest query params', () {
    expect(
      tabIndexFromLaunchUri(Uri.parse('https://milana.uz/?tab=catalog')),
      1,
    );
    expect(tabIndexFromLaunchUri(Uri.parse('https://milana.uz/?tab=cart')), 2);
    expect(
      tabIndexFromLaunchUri(Uri.parse('https://milana.uz/?view=support')),
      3,
    );
    expect(
      tabIndexFromLaunchUri(Uri.parse('https://milana.uz/?tab=account')),
      4,
    );
    expect(
      tabIndexFromLaunchUri(Uri.parse('https://milana.uz/?tab=cart#account')),
      2,
    );
  });

  test('tabIndexFromLaunchUri keeps hash fallback for old shortcuts', () {
    expect(tabIndexFromLaunchUri(Uri.parse('https://milana.uz/#cart')), 2);
    expect(tabIndexFromLaunchUri(Uri.parse('https://milana.uz/#support')), 3);
    expect(tabIndexFromLaunchUri(Uri.parse('https://milana.uz/#account')), 4);
  });
}
