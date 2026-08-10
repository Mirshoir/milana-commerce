import '../models/cart_item.dart';
import '../models/order.dart';
import '../localization/app_localization.dart';

int orderProgressStep(OrderSummary order) {
  return orderProgressStepFor(order.status, order.paymentStatus);
}

int orderProgressStepFor(String status, String paymentStatus) {
  if (status == 'delivered') return 3;
  if (status == 'shipped') return 2;
  if (status == 'confirmed' || status == 'packed' || paymentStatus == 'paid') {
    return 1;
  }
  return 0;
}

int orderClothesCount(OrderSummary order) => order.items.isEmpty
    ? order.itemCount * bagSize
    : order.items.fold(0, (sum, item) => sum + item.qty * item.bagSize);

bool canCustomerCancelOrder(OrderSummary order) {
  return order.id.isNotEmpty &&
      order.status == 'new' &&
      const {'pending', 'waiting_for_customer'}.contains(order.paymentStatus);
}

String orderNextAction(
  OrderSummary order, {
  String languageCode = defaultLanguageCode,
}) {
  if (order.status == 'cancelled') {
    return localizedText(
      'order.next_action.cancelled',
      languageCode: languageCode,
      args: {'number': order.number},
    );
  }
  if (order.status == 'delivered') {
    return localizedText(
      'order.next_action.delivered',
      languageCode: languageCode,
    );
  }
  if (order.status == 'shipped') {
    return localizedText(
      'order.next_action.shipped',
      languageCode: languageCode,
    );
  }
  if (order.paymentStatus == 'pending' ||
      order.paymentStatus == 'waiting_for_customer') {
    return localizedText(
      'order.next_action.pending',
      languageCode: languageCode,
    );
  }
  if (order.paymentStatus == 'submitted') {
    return localizedText(
      'order.next_action.submitted',
      languageCode: languageCode,
    );
  }
  if (order.paymentStatus == 'paid') {
    return localizedText('order.next_action.paid', languageCode: languageCode);
  }
  return localizedText(
    'order.next_action.confirming',
    languageCode: languageCode,
  );
}

String orderTrackingSummary(
  OrderSummary order, {
  String languageCode = defaultLanguageCode,
}) {
  final clothes = orderClothesCount(order);
  if (order.items.isEmpty) {
    return localizedText(
      'order.tracking_summary.package_only',
      languageCode: languageCode,
      args: {'packages': '${order.itemCount}', 'pieces': '$clothes'},
    );
  }
  final packs = order.items
      .where((item) => normalizeOrderUnitType(item.unitType) == packUnitType)
      .fold(0, (sum, item) => sum + item.qty);
  final bags = order.items
      .where((item) => normalizeOrderUnitType(item.unitType) == bagUnitType)
      .fold(0, (sum, item) => sum + item.qty);
  final packages = [
    if (packs > 0)
      '$packs ${localizedText('product.pack.label', languageCode: languageCode)}',
    if (bags > 0)
      '$bags ${localizedText('product.bag.label', languageCode: languageCode)}',
  ].join(' + ');
  return localizedText(
    'order.tracking_summary.packages',
    languageCode: languageCode,
    args: {'summary': packages, 'pieces': '$clothes'},
  );
}

String orderSizeMixSummary(
  OrderLineItem item, {
  String languageCode = defaultLanguageCode,
}) {
  if (item.sizeMix.isEmpty) {
    return localizedText('order.size_mix.default', languageCode: languageCode);
  }
  return item.sizeMix.map((row) => '${row.size}: ${row.qty}').join(' · ');
}

String orderLineItemSubtitle(
  OrderLineItem item, {
  String languageCode = defaultLanguageCode,
}) {
  final model = [
    item.modelNo,
    item.variant,
  ].where((value) => value.trim().isNotEmpty).join(' / ');
  final parts = [
    if (model.isNotEmpty) model,
    '${item.qty} ${orderUnitLabel(item.unitType, languageCode: languageCode).toLowerCase()}',
    localizedText(
      'order.line_item.pieces',
      languageCode: languageCode,
      args: {'count': '${item.qty * item.bagSize}'},
    ),
  ];
  return parts.join(' · ');
}

String customerOrderShareText(
  OrderSummary order, {
  String languageCode = defaultLanguageCode,
}) {
  final lines = [
    localizedText('order.share.title', languageCode: languageCode),
    '${localizedText('order.share.number', languageCode: languageCode)}: ${order.number}',
    '${localizedText('order.share.total', languageCode: languageCode)}: \$${order.total.toStringAsFixed(2)}',
    '${localizedText('order.share.contents', languageCode: languageCode)}: '
        '${orderTrackingSummary(order, languageCode: languageCode)}',
    ...order.items.map(
      (item) =>
          '- ${item.name}: ${item.qty} ${orderUnitLabel(item.unitType, languageCode: languageCode).toLowerCase()}, \$${item.lineTotal.toStringAsFixed(2)}',
    ),
    '${localizedText('order.share.status', languageCode: languageCode)}: ${order.status}',
    '${localizedText('order.share.payment_status', languageCode: languageCode)}: ${order.paymentStatus}',
    if (order.paymentReference.isNotEmpty)
      '${localizedText('order.share.payment_reference', languageCode: languageCode)}: ${order.paymentReference}',
    if (order.paymentSubmissionReference.isNotEmpty)
      '${localizedText('order.share.submitted_reference', languageCode: languageCode)}: ${order.paymentSubmissionReference}',
    if (order.trackingNumber.isNotEmpty)
      '${localizedText('order.share.tracking_number', languageCode: languageCode)}: ${order.trackingNumber}',
    if (order.deliveryCarrier.isNotEmpty)
      '${localizedText('order.share.delivery', languageCode: languageCode)}: ${order.deliveryCarrier}',
    '${localizedText('order.share.next_step', languageCode: languageCode)}: '
        '${orderNextAction(order, languageCode: languageCode)}',
  ];
  return lines.join('\n');
}

double? parsePaymentAmount(String value) {
  final normalized = value.trim().replaceAll(',', '.');
  if (normalized.isEmpty) return null;
  return double.tryParse(normalized);
}

String? paymentAmountValidationMessage(
  String value,
  double expectedTotal, {
  String languageCode = defaultLanguageCode,
}) {
  final parsed = parsePaymentAmount(value);
  if (parsed == null || parsed <= 0) {
    return localizedText(
      'payment.validation.amount.required',
      languageCode: languageCode,
    );
  }
  if ((parsed - expectedTotal).abs() > 0.01) {
    return localizedText(
      'payment.validation.amount.mismatch',
      languageCode: languageCode,
      args: {'expected': expectedTotal.toStringAsFixed(2)},
    );
  }
  return null;
}

bool paymentMethodNeedsProofDetail(String method) {
  return const {'bank', 'click', 'payme', 'card'}.contains(method);
}

String? paymentProofDetailValidationMessage({
  required String method,
  required String reference,
  required String note,
  String languageCode = defaultLanguageCode,
}) {
  if (!paymentMethodNeedsProofDetail(method)) return null;
  final hasReference = reference.trim().length >= 4;
  final hasNote = note.trim().length >= 8;
  if (hasReference || hasNote) return null;
  return localizedText(
    'payment.validation.proof_required',
    languageCode: languageCode,
  );
}
