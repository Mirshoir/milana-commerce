import 'package:url_launcher/url_launcher.dart';

const String privacyPolicyUrl = String.fromEnvironment(
  'PRIVACY_POLICY_URL',
  defaultValue: 'https://milanapremium.uz/privacy',
);

const String termsOfServiceUrl = String.fromEnvironment(
  'TERMS_OF_SERVICE_URL',
  defaultValue: 'https://milanapremium.uz/terms',
);

const String accountDeletionUrl = String.fromEnvironment(
  'ACCOUNT_DELETION_URL',
  defaultValue: 'https://milanapremium.uz/delete-account',
);

const String supportUrl = String.fromEnvironment(
  'SUPPORT_URL',
  defaultValue: 'https://milanapremium.uz/support',
);

const String legalConsentVersion = '2026-08-04';

bool isSecurePublicUrl(String value) {
  final uri = Uri.tryParse(value);
  return uri != null &&
      uri.scheme == 'https' &&
      uri.host.isNotEmpty &&
      !uri.host.endsWith('.test') &&
      uri.host != 'localhost';
}

Future<void> openPublicUrl(String value) async {
  if (!isSecurePublicUrl(value)) {
    throw const FormatException('Public legal URL is not configured.');
  }
  final opened = await launchUrl(
    Uri.parse(value),
    mode: LaunchMode.externalApplication,
  );
  if (!opened) throw StateError('Could not open public URL.');
}
