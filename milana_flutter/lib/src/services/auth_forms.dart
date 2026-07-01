String normalizeEmail(String value) => value.trim().toLowerCase();

String phoneDigits(String value) => value.replaceAll(RegExp(r'\D'), '');

String normalizePhoneNumber(String value) =>
    value.trim().replaceAll(RegExp(r'\s+'), ' ');

String normalizeProfileText(
  String value, {
  required int max,
  required String label,
}) {
  final normalized = value.trim();
  if (normalized.length > max) {
    throw ArgumentError('$label juda uzun');
  }
  return normalized;
}

String? validateEmail(String? value) {
  final email = normalizeEmail(value ?? '');
  if (email.isEmpty) return 'Email kiriting';
  final pattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
  if (!pattern.hasMatch(email)) return 'Email noto‘g‘ri';
  return null;
}

String? validatePassword(String? value, {bool signUp = false}) {
  final password = value ?? '';
  if (password.isEmpty) return 'Parol kiriting';
  if (signUp && password.length < 8) return 'Kamida 8 ta belgi';
  return null;
}

String? validateRequiredText(String? value, String label) {
  if ((value ?? '').trim().isEmpty) return '$label kiriting';
  return null;
}

String? validatePhone(String? value) {
  final phone = normalizePhoneNumber(value ?? '');
  if (phone.isEmpty) return 'Telefon kiriting';
  if (!RegExp(r'^[0-9+()\-\s]+$').hasMatch(phone)) {
    return 'Telefonni tekshiring';
  }
  final digits = phoneDigits(phone);
  if (digits.length < 9 || digits.length > 15) {
    return 'Telefonni tekshiring';
  }
  return null;
}

String authErrorMessage(Object error) {
  final text = error.toString();
  if (text.contains('user-not-found') || text.contains('invalid-credential')) {
    return 'Email yoki parol noto‘g‘ri.';
  }
  if (text.contains('wrong-password')) return 'Parol noto‘g‘ri.';
  if (text.contains('email-already-in-use')) {
    return 'Bu email bilan akkaunt mavjud.';
  }
  if (text.contains('weak-password')) return 'Parol juda oddiy.';
  if (text.contains('invalid-email')) return 'Email noto‘g‘ri.';
  return text;
}
