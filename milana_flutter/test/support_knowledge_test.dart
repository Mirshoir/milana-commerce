import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/services/support_knowledge.dart';

void main() {
  test('Milana support FAQ includes core wholesale business facts', () {
    expect(milanaSupportFaqs.length, greaterThanOrEqualTo(10));

    final minimum = milanaSupportFaqs.firstWhere(
      (faq) => faq.id == 'minimum-order',
    );
    final bag = milanaSupportFaqs.firstWhere((faq) => faq.id == 'bag-size');
    final price = milanaSupportFaqs.firstWhere((faq) => faq.id == 'price');

    expect(minimum.answer, contains('Qadoq odatda 6 ta'));
    expect(minimum.answer, contains('standart qop esa 60 ta'));
    expect(bag.answer, contains('6 ta o‘lcham'));
    expect(bag.answer, contains('10 tadan'));
    expect(price.answer, contains('Tanlangan qadoq yoki qop narxi'));
    expect(price.answer, contains('dona soniga ko‘paytirib'));
  });

  test('filterSupportFaqs searches questions answers and keywords', () {
    expect(
      filterSupportFaqs(milanaSupportFaqs, 'cargo').map((faq) => faq.id),
      contains('delivery'),
    );
    expect(
      filterSupportFaqs(milanaSupportFaqs, 'qoratut').map((faq) => faq.id),
      contains('address'),
    );
    expect(
      filterSupportFaqs(milanaSupportFaqs, 'payme').map((faq) => faq.id),
      contains('payment'),
    );
  });

  test('filterSupportFaqs limits rows and returns empty for unknown query', () {
    expect(filterSupportFaqs(milanaSupportFaqs, '', limit: 3), hasLength(3));
    expect(filterSupportFaqs(milanaSupportFaqs, 'not-a-milana-topic'), isEmpty);
  });
}
