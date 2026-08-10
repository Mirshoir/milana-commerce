import '../localization/app_localization.dart';

String normalizeEmail(String value) => value.trim().toLowerCase();

String phoneDigits(String value) => value.replaceAll(RegExp(r'\D'), '');

String normalizePhoneNumber(String value) =>
    value.trim().replaceAll(RegExp(r'\s+'), ' ');

String normalizeProfileText(
  String value, {
  required int max,
  required String label,
  String languageCode = defaultLanguageCode,
}) {
  final normalized = value.trim();
  if (normalized.length > max) {
    throw ArgumentError(
      localizedText(
        'validation.long',
        languageCode: languageCode,
        args: {'label': label},
      ),
    );
  }
  return normalized;
}

String? validateEmail(
  String? value, {
  String languageCode = defaultLanguageCode,
}) {
  final email = normalizeEmail(value ?? '');
  if (email.isEmpty) {
    return localizedText(
      'validation.email.required',
      languageCode: languageCode,
    );
  }
  final pattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
  if (!pattern.hasMatch(email)) {
    return localizedText(
      'validation.email.invalid',
      languageCode: languageCode,
    );
  }
  return null;
}

String? validatePassword(
  String? value, {
  bool signUp = false,
  String languageCode = defaultLanguageCode,
}) {
  final password = value ?? '';
  if (password.isEmpty) {
    return localizedText(
      'validation.password.required',
      languageCode: languageCode,
    );
  }
  if (signUp && password.length < 8) {
    return localizedText(
      'validation.password.short',
      languageCode: languageCode,
    );
  }
  return null;
}

String? validateRequiredText(
  String? value,
  String label, {
  String languageCode = defaultLanguageCode,
}) {
  if ((value ?? '').trim().isEmpty) {
    return localizedText(
      'validation.required',
      languageCode: languageCode,
      args: {'label': label},
    );
  }
  return null;
}

String? validatePhone(
  String? value, {
  String languageCode = defaultLanguageCode,
}) {
  final phone = normalizePhoneNumber(value ?? '');
  if (phone.isEmpty) {
    return localizedText(
      'validation.phone.required',
      languageCode: languageCode,
    );
  }
  if (!RegExp(r'^[0-9+()\-\s]+$').hasMatch(phone)) {
    return localizedText(
      'validation.phone.invalid',
      languageCode: languageCode,
    );
  }
  final digits = phoneDigits(phone);
  if (digits.length < 9 || digits.length > 15) {
    return localizedText(
      'validation.phone.invalid',
      languageCode: languageCode,
    );
  }
  return null;
}

String authErrorMessage(
  Object error, {
  String languageCode = defaultLanguageCode,
}) {
  if (error is ArgumentError && error.message != null) {
    final message = '${error.message}';
    if (message.isNotEmpty) return message;
  }
  final text = error.toString();
  if (text.contains('auth-backend-unavailable')) {
    return localizedText('auth.error.auth_backend', languageCode: languageCode);
  }
  if (text.contains('user-not-found') || text.contains('invalid-credential')) {
    return localizedText(
      'auth.error.wrong_credentials',
      languageCode: languageCode,
    );
  }
  if (text.contains('wrong-password')) {
    return localizedText(
      'auth.error.wrong_credentials',
      languageCode: languageCode,
    );
  }
  if (text.contains('email-already-in-use')) {
    return localizedText('auth.error.email_exists', languageCode: languageCode);
  }
  if (text.contains('google-signin-failed')) {
    return localizedText(
      'auth.error.google_failed',
      languageCode: languageCode,
    );
  }
  if (text.contains('google-client-id-missing')) {
    return localizedText(
      'auth.error.google_client_id',
      languageCode: languageCode,
    );
  }
  if (text.contains('apple-signin-cancelled')) {
    return localizedText(
      'auth.error.apple_cancelled',
      languageCode: languageCode,
    );
  }
  if (text.contains('apple-signin-failed')) {
    return localizedText('auth.error.apple_failed', languageCode: languageCode);
  }
  if (text.contains('GoogleSignInExceptionCode.canceled') ||
      text.contains('GoogleSignInExceptionCode.interrupted') ||
      text.contains('popup-closed-by-user') ||
      text.contains('canceled') ||
      text.contains('interrupted')) {
    return localizedText(
      'auth.error.google_cancelled',
      languageCode: languageCode,
    );
  }
  if (text.contains('weak-password')) {
    return localizedText(
      'auth.error.weak_password',
      languageCode: languageCode,
    );
  }
  if (text.contains('invalid-email')) {
    return localizedText(
      'validation.email.invalid',
      languageCode: languageCode,
    );
  }
  if (text.contains('requires-recent-login')) {
    return localizedText('auth.error.recent_login', languageCode: languageCode);
  }
  if (text.contains('unauthenticated')) {
    return localizedText(
      'auth.error.unauthenticated',
      languageCode: languageCode,
    );
  }
  if (text.contains('unavailable') || text.contains('deadline-exceeded')) {
    return localizedText('auth.error.default', languageCode: languageCode);
  }
  return text;
}
