import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/services/auth_forms.dart';
import 'package:milana_flutter/src/services/auth_service.dart';

void main() {
  test('normalizeEmail trims and lowercases addresses', () {
    expect(normalizeEmail('  Buyer@Example.COM '), 'buyer@example.com');
  });

  test('auth form validators reject invalid values', () {
    expect(validateEmail(''), 'Email kiriting');
    expect(validateEmail('buyer'), 'Email noto‘g‘ri');
    expect(validateEmail('buyer@example.com'), isNull);
    expect(validatePassword('', signUp: false), 'Parol kiriting');
    expect(validatePassword('short', signUp: true), 'Kamida 8 ta belgi');
    expect(validatePassword('strong-pass', signUp: true), isNull);
    expect(validateRequiredText(' ', 'Ism'), 'Ism kiriting');
    expect(validatePhone(''), 'Telefon kiriting');
    expect(validatePhone('12345'), 'Telefonni tekshiring');
    expect(validatePhone('+998 90 123 45 67'), isNull);
    expect(validatePhone('+1 (212) 555-0199'), isNull);
    expect(validatePhone('+998 90 phone'), 'Telefonni tekshiring');
  });

  test('phone helpers normalize whitespace and expose digits', () {
    expect(
      normalizePhoneNumber('  +998   90  123 45 67  '),
      '+998 90 123 45 67',
    );
    expect(phoneDigits('+998 90 123 45 67'), '998901234567');
  });

  test('profile text helper trims and rejects overly long values', () {
    expect(
      normalizeProfileText('  Andijon  ', max: 80, label: 'Shahar'),
      'Andijon',
    );
    expect(
      () => normalizeProfileText('x' * 81, max: 80, label: 'Shahar'),
      throwsA(isA<ArgumentError>()),
    );
  });

  test('authErrorMessage maps Firebase-like errors to customer text', () {
    expect(
      authErrorMessage(Exception('user-not-found')),
      contains('noto‘g‘ri'),
    );
    expect(
      authErrorMessage(Exception('email-already-in-use')),
      contains('akkaunt mavjud'),
    );
    expect(authErrorMessage(Exception('weak-password')), contains('oddiy'));
  });

  test('local auth normalizes emails and accepts password reset', () async {
    final auth = AuthService(firebaseEnabled: false);
    await auth.signUp(
      name: 'Buyer',
      phone: ' +998   90 123 45 67 ',
      city: ' Andijon ',
      address: ' Qoratut 605 ',
      email: ' Buyer@Example.COM ',
      password: 'strong-pass',
    );
    expect(auth.customer?.email, 'buyer@example.com');
    expect(auth.customer?.phone, '+998 90 123 45 67');
    expect(auth.customer?.city, 'Andijon');
    expect(auth.customer?.address, 'Qoratut 605');

    await auth.updateProfile(
      name: 'Buyer Updated',
      phone: '+998 91 222 33 44',
      city: ' Tashkent ',
      address: ' Chilonzor 7 ',
    );
    expect(auth.customer?.name, 'Buyer Updated');
    expect(auth.customer?.phone, '+998 91 222 33 44');
    expect(auth.customer?.city, 'Tashkent');
    expect(auth.customer?.address, 'Chilonzor 7');

    await auth.signOut();
    await auth.signIn(' Buyer@Example.COM ', 'strong-pass');
    expect(auth.customer?.email, 'buyer@example.com');

    await auth.sendPasswordReset(' Buyer@Example.COM ');
    await expectLater(
      auth.sendPasswordReset('bad-email'),
      throwsA(isA<ArgumentError>()),
    );
  });
}
