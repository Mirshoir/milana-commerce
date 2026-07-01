import '../models/cart_item.dart';
import '../models/order.dart';

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

int orderClothesCount(OrderSummary order) => order.itemCount * bagSize;

bool canCustomerCancelOrder(OrderSummary order) {
  return order.id.isNotEmpty &&
      order.status == 'new' &&
      const {'pending', 'waiting_for_customer'}.contains(order.paymentStatus);
}

String orderNextAction(OrderSummary order) {
  if (order.status == 'cancelled') {
    return 'Buyurtma bekor qilingan. Savol bo‘lsa menejer bilan bog‘laning.';
  }
  if (order.status == 'delivered') {
    return 'Buyurtma yetkazilgan. Brak bo‘lsa darhol menejerga yozing.';
  }
  if (order.status == 'shipped') {
    return 'Cargo raqami bo‘yicha yetkazib berishni kuzatib boring.';
  }
  if (order.paymentStatus == 'pending' ||
      order.paymentStatus == 'waiting_for_customer') {
    return 'Menejer to‘lov va mavjudlikni tasdiqlaydi.';
  }
  if (order.paymentStatus == 'submitted') {
    return 'To‘lov tekshirilmoqda. Tasdiqdan keyin qop tayyorlanadi.';
  }
  if (order.paymentStatus == 'paid') {
    return 'To‘lov tasdiqlandi. Buyurtma qadoqlashga tayyor.';
  }
  return 'Menejer buyurtma tafsilotlarini tasdiqlaydi.';
}

String orderTrackingSummary(OrderSummary order) {
  final clothes = orderClothesCount(order);
  return '${order.itemCount} qop · $clothes ta kiyim';
}

String orderSizeMixSummary(OrderLineItem item) {
  if (item.sizeMix.isEmpty) return '${item.bagSize} ta';
  return item.sizeMix.map((row) => '${row.size}: ${row.qty}').join(' · ');
}

String orderLineItemSubtitle(OrderLineItem item) {
  final model = [
    item.modelNo,
    item.variant,
  ].where((value) => value.trim().isNotEmpty).join(' / ');
  final parts = [
    if (model.isNotEmpty) model,
    '${item.qty} qop',
    '${item.qty * item.bagSize} ta kiyim',
  ];
  return parts.join(' · ');
}

String customerOrderShareText(OrderSummary order) {
  final lines = [
    'Milana Premium buyurtma',
    'Raqam: ${order.number}',
    'Jami: \$${order.total.toStringAsFixed(2)}',
    'Tarkib: ${orderTrackingSummary(order)}',
    ...order.items.map(
      (item) =>
          '- ${item.name}: ${item.qty} qop, \$${item.lineTotal.toStringAsFixed(2)}',
    ),
    'Buyurtma holati: ${order.status}',
    'To‘lov holati: ${order.paymentStatus}',
    if (order.paymentReference.isNotEmpty)
      'To‘lov reference: ${order.paymentReference}',
    if (order.paymentSubmissionReference.isNotEmpty)
      'Yuborilgan to‘lov: ${order.paymentSubmissionReference}',
    if (order.trackingNumber.isNotEmpty)
      'Cargo raqami: ${order.trackingNumber}',
    if (order.deliveryCarrier.isNotEmpty)
      'Yetkazib berish: ${order.deliveryCarrier}',
    'Keyingi qadam: ${orderNextAction(order)}',
  ];
  return lines.join('\n');
}

double? parsePaymentAmount(String value) {
  final normalized = value.trim().replaceAll(',', '.');
  if (normalized.isEmpty) return null;
  return double.tryParse(normalized);
}

String? paymentAmountValidationMessage(String value, double expectedTotal) {
  final parsed = parsePaymentAmount(value);
  if (parsed == null || parsed <= 0) return 'Summani kiriting';
  if ((parsed - expectedTotal).abs() > 0.01) {
    return 'Summa buyurtma jami bilan mos emas: \$${expectedTotal.toStringAsFixed(2)}';
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
}) {
  if (!paymentMethodNeedsProofDetail(method)) return null;
  final hasReference = reference.trim().length >= 4;
  final hasNote = note.trim().length >= 8;
  if (hasReference || hasNote) return null;
  return 'Reference yoki izoh kiriting';
}
