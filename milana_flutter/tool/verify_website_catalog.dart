import 'dart:convert';
import 'dart:io';

import 'package:milana_flutter/src/models/product.dart';

const _catalogUrl = 'https://milanapremium.uz/api/products?limit=2500';
const _languages = <String>['uz', 'ru', 'en'];

Future<void> main() async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
  try {
    final request = await client.getUrl(Uri.parse(_catalogUrl));
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    final response = await request.close();
    if (response.statusCode != HttpStatus.ok) {
      throw StateError('Catalog request failed: ${response.statusCode}');
    }
    final decoded = jsonDecode(await utf8.decodeStream(response));
    if (decoded is! List) throw StateError('Catalog response is not a list');

    final failures = <String>[];
    final ids = <String>{};
    final slugs = <String>{};
    for (final value in decoded) {
      if (value is! Map) {
        failures.add('Catalog row is not an object');
        continue;
      }
      final row = Map<String, dynamic>.from(value);
      final product = Product.fromJson(row);
      final label = product.slug.isEmpty ? product.id : product.slug;
      if (!ids.add(product.id)) failures.add('$label: duplicate id');
      if (!slugs.add(product.slug)) failures.add('$label: duplicate slug');
      if (product.catalogPanel != '${row['catalog_panel'] ?? ''}'.trim()) {
        failures.add('$label: catalog_panel was not preserved');
      }
      if (product.sourceCategory != '${row['category'] ?? ''}'.trim()) {
        failures.add('$label: category was not preserved');
      }
      if (product.rating != _number(row['rating'])) {
        failures.add('$label: rating differs from website');
      }
      if (product.price != _number(row['price'])) {
        failures.add('$label: price differs from website');
      }
      if (product.availableQop != _nullableNumber(row['available_qop'])) {
        failures.add('$label: available_qop differs from website');
      }
      for (final language in _languages) {
        final names = row['name_i18n'];
        final descriptions = row['desc'];
        final care = row['care'];
        final expectedName = names is Map
            ? '${names[language] ?? ''}'.trim()
            : '';
        final expectedDescription = descriptions is Map
            ? '${descriptions[language] ?? ''}'.trim()
            : '';
        final expectedCare = care is Map
            ? '${care[language] ?? ''}'.trim()
            : '';
        if (expectedName.isEmpty ||
            expectedDescription.isEmpty ||
            expectedCare.isEmpty) {
          failures.add('$label: missing $language website copy');
          continue;
        }
        if (product.nameFor(language) != expectedName) {
          failures.add('$label: $language name differs from website');
        }
        if (product.descriptionFor(language) != expectedDescription) {
          failures.add('$label: $language description differs from website');
        }
        if (product.careFor(language) != expectedCare) {
          failures.add('$label: $language care differs from website');
        }
      }
      final restored = Product.fromJson(product.toJson());
      if (restored.catalogPanel != product.catalogPanel ||
          restored.sourceCategory != product.sourceCategory ||
          restored.price != product.price ||
          restored.retailPrice != product.retailPrice ||
          restored.wholesalePrice != product.wholesalePrice) {
        failures.add('$label: cache round trip changed website data');
      }
    }

    if (failures.isNotEmpty) {
      stderr.writeln(failures.take(25).join('\n'));
      if (failures.length > 25) {
        stderr.writeln('...and ${failures.length - 25} more');
      }
      exitCode = 1;
      return;
    }
    stdout.writeln(
      'Verified ${decoded.length} website products across '
      '${_languages.length} languages; model and cache mappings match.',
    );
  } finally {
    client.close(force: true);
  }
}

double _number(dynamic value) => _nullableNumber(value) ?? 0;

double? _nullableNumber(dynamic value) {
  if (value is num) return value.toDouble();
  final text = '$value'.trim().replaceAll(',', '.');
  if (text.isEmpty || text == 'null') return null;
  return double.tryParse(text);
}
