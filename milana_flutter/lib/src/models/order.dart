import 'dart:math';

import '../localization/app_localization.dart';
import 'backend_provenance.dart';
import 'cart_item.dart';
import 'product.dart';

export 'backend_provenance.dart';

String paymentReferenceFromOrderNumber(String number) =>
    number.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '').toUpperCase();

String orderReceiptShareText(
  OrderReceipt receipt, {
  String languageCode = defaultLanguageCode,
}) {
  final lines = [
    localizedText('order.share.title', languageCode: languageCode),
    '${localizedText('order.share.number', languageCode: languageCode)}: ${receipt.number}',
    '${localizedText('order.share.total', languageCode: languageCode)}: \$${receipt.total.toStringAsFixed(2)}',
    '${localizedText('order.share.payment_label', languageCode: languageCode)}: ${receipt.paymentLabel}',
    if (receipt.paymentReference.isNotEmpty)
      '${localizedText('order.share.payment_reference', languageCode: languageCode)}: ${receipt.paymentReference}',
    if (receipt.paymentExpiresAt != null)
      '${localizedText('order.share.payment_expires_at', languageCode: languageCode)}: ${receipt.paymentExpiresAt!.toUtc().toIso8601String()}',
    '${localizedText('order.share.status', languageCode: languageCode)}: ${receipt.paymentStatus}',
    'Menejer: ${receipt.supportPhone}',
  ];
  return lines.join('\n');
}

String createClientOrderId() {
  final timestamp = DateTime.now().toUtc().microsecondsSinceEpoch.toRadixString(
    36,
  );
  final suffix = Random().nextInt(0x7fffffff).toRadixString(36);
  return 'co_${timestamp}_$suffix';
}

const internalCheckoutMarketType = 'internal';
const exportCheckoutMarketType = 'export';

String normalizeCheckoutMarketType(String value) =>
    value.trim().toLowerCase() == exportCheckoutMarketType
    ? exportCheckoutMarketType
    : internalCheckoutMarketType;

class CheckoutRequest {
  const CheckoutRequest({
    required this.name,
    required this.phone,
    required this.city,
    required this.address,
    required this.comment,
    required this.paymentMethod,
    required this.managerId,
    required this.items,
    this.customerEmail = '',
    this.customerId,
    this.clientOrderId = '',
    this.country = '',
    this.languageCode = defaultLanguageCode,
    this.marketType = internalCheckoutMarketType,
  });

  final String name;
  final String phone;
  final String city;
  final String address;
  final String country;
  final String comment;
  final String paymentMethod;
  final int managerId;
  final String customerEmail;
  final String? customerId;
  final String clientOrderId;
  final String languageCode;
  final String marketType;
  final List<CartItem> items;

  double get total => items.fold(0, (sum, item) => sum + item.lineTotal);

  Map<String, dynamic> toBackendJson() => {
    'source': 'flutter',
    'market_type': normalizeCheckoutMarketType(marketType),
    'order_type': 'wholesale',
    'manager_id': managerId,
    'customer': {
      'name': name,
      'phone': phone,
      'email': customerEmail,
      'city': city,
      'address': address,
      'country': country,
      'comment': comment,
      'payment_method': paymentMethod,
    },
    'payment': {'method': paymentMethod},
    'client_order_id': clientOrderId,
    'items': items
        .map(
          (item) => {
            'id': int.tryParse(item.product.id) ?? item.product.id,
            'qty': item.quantity,
            'unit_type': item.orderUnit.unitType,
          },
        )
        .toList(),
    'lang': normalizeLanguageCode(languageCode),
  };

  Map<String, dynamic> toFunctionJson() => {
    'source': 'flutter',
    'market_type': normalizeCheckoutMarketType(marketType),
    'order_type': 'wholesale',
    'manager_id': managerId,
    'customer': {
      'name': name,
      'phone': phone,
      'email': customerEmail,
      'city': city,
      'address': address,
      'country': country,
      'comment': comment,
    },
    'payment_method': paymentMethod,
    'client_order_id': clientOrderId,
    'items': items
        .map(
          (item) => {
            'product_id': item.product.id,
            'slug': item.product.slug,
            'qty': item.quantity,
            'unit_type': item.orderUnit.unitType,
          },
        )
        .toList(),
    'lang': normalizeLanguageCode(languageCode),
  };

  Map<String, dynamic> toFirestore(String number) => {
    'number': number,
    'market_type': normalizeCheckoutMarketType(marketType),
    'order_type': 'wholesale',
    'customer_id': customerId,
    'client_order_id': clientOrderId,
    'manager_id': managerId,
    'customer': {
      'name': name,
      'phone': phone,
      'email': customerEmail,
      'city': city,
      'address': address,
      'country': country,
      'comment': comment,
    },
    'items': items.map((item) => item.toOrderJson()).toList(),
    'total': double.parse(total.toStringAsFixed(2)),
    'status': 'new',
    'lang': normalizeLanguageCode(languageCode),
    'payment': {
      'method': paymentMethod,
      'provider':
          paymentMethod == 'click' ||
              paymentMethod == 'payme' ||
              paymentMethod == 'card'
          ? paymentMethod
          : 'manual',
      'status': 'pending',
      'amount': double.parse(total.toStringAsFixed(2)),
      'currency': 'USD',
      'reference': paymentReferenceFromOrderNumber(number),
    },
    'created_at': DateTime.now().toUtc().toIso8601String(),
    'updated_at': DateTime.now().toUtc().toIso8601String(),
  };
}

class OrderReceipt {
  const OrderReceipt({
    required this.provenance,
    this.orderId = '',
    required this.number,
    required this.total,
    required this.paymentStatus,
    this.paymentMethod = 'manager',
    this.paymentLabel = 'Menejer orqali',
    this.paymentInstructions = '',
    this.paymentReference = '',
    this.paymentExpiresAt,
    this.clientOrderId = '',
    this.supportPhone = '+998501551010',
    this.languageCode = defaultLanguageCode,
  });

  final BackendProvenance provenance;
  final String orderId;
  final String number;
  final double total;
  final String paymentStatus;
  final String paymentMethod;
  final String paymentLabel;
  final String paymentInstructions;
  final String paymentReference;
  final DateTime? paymentExpiresAt;
  final String clientOrderId;
  final String supportPhone;
  final String languageCode;

  factory OrderReceipt.fromJson(Map<String, dynamic> json) {
    final provenanceName = '${json['provenance'] ?? ''}';
    final provenance = BackendProvenance.values.firstWhere(
      (value) => value.name == provenanceName,
      orElse: () => BackendProvenance.website,
    );
    final number = '${json['number'] ?? ''}'.trim();
    final total = _asDouble(json['total']);
    final language = normalizeLanguageCode(
      '${json['language_code'] ?? json['language'] ?? json['lang'] ?? defaultLanguageCode}',
    );
    if (number.isEmpty || total == null || !total.isFinite || total < 0) {
      throw const FormatException('Stored order receipt is invalid.');
    }
    return OrderReceipt(
      provenance: provenance,
      orderId: '${json['order_id'] ?? ''}',
      number: number,
      total: total,
      paymentStatus: '${json['payment_status'] ?? 'pending'}',
      paymentMethod: '${json['payment_method'] ?? 'manager'}',
      paymentLabel:
          '${json['payment_label'] ?? localizedText('checkout.payment_manager', languageCode: language)}',
      paymentInstructions: '${json['payment_instructions'] ?? ''}',
      languageCode: language,
      paymentReference: '${json['payment_reference'] ?? ''}',
      paymentExpiresAt: DateTime.tryParse(
        '${json['payment_expires_at'] ?? ''}',
      ),
      clientOrderId: '${json['client_order_id'] ?? ''}',
      supportPhone: '${json['support_phone'] ?? '+998501551010'}',
    );
  }

  Map<String, dynamic> toJson() => {
    'provenance': provenance.name,
    'order_id': orderId,
    'number': number,
    'total': total,
    'payment_status': paymentStatus,
    'payment_method': paymentMethod,
    'payment_label': paymentLabel,
    'payment_instructions': paymentInstructions,
    'payment_reference': paymentReference,
    if (paymentExpiresAt != null)
      'payment_expires_at': paymentExpiresAt!.toUtc().toIso8601String(),
    'client_order_id': clientOrderId,
    'support_phone': supportPhone,
  };
}

class PaymentSubmission {
  const PaymentSubmission({
    required this.provenance,
    required this.orderId,
    required this.method,
    required this.amount,
    required this.reference,
    required this.note,
  });

  final BackendProvenance provenance;
  final String orderId;
  final String method;
  final double? amount;
  final String reference;
  final String note;

  Map<String, dynamic> toFunctionJson() => {
    'order_id': orderId,
    'method': method,
    if (amount != null) 'amount': amount,
    'reference': reference,
    'note': note,
  };
}

class PaymentSubmissionReceipt {
  const PaymentSubmissionReceipt({
    required this.provenance,
    required this.orderId,
    required this.paymentStatus,
    required this.submittedAt,
  });

  final BackendProvenance provenance;
  final String orderId;
  final String paymentStatus;
  final DateTime? submittedAt;
}

class CancelOrderRequest {
  const CancelOrderRequest({
    required this.provenance,
    required this.orderId,
    this.reason = '',
  });

  final BackendProvenance provenance;
  final String orderId;
  final String reason;

  Map<String, dynamic> toFunctionJson() => {
    'order_id': orderId,
    'reason': reason.trim(),
  };
}

class CancelOrderReceipt {
  const CancelOrderReceipt({
    required this.provenance,
    required this.orderId,
    required this.status,
    required this.paymentStatus,
    required this.cancelledAt,
    required this.stockReleasedQop,
  });

  final BackendProvenance provenance;
  final String orderId;
  final String status;
  final String paymentStatus;
  final DateTime? cancelledAt;
  final int stockReleasedQop;
}

class OrderLineItem {
  const OrderLineItem({
    required this.id,
    required this.slug,
    required this.name,
    required this.qty,
    required this.unitPrice,
    required this.bagSize,
    required this.bagPrice,
    required this.lineTotal,
    this.unitType = bagUnitType,
    this.modelNo = '',
    this.variant = '',
    this.gender = 'women',
    this.category = 'homewear',
    this.fabric = '',
    this.description = '',
    this.image = '',
    this.images = const [],
    this.sizes = const [],
    this.sizeMix = const [],
  });

  final String id;
  final String slug;
  final String name;
  final String modelNo;
  final String variant;
  final String gender;
  final String category;
  final String fabric;
  final String description;
  final int qty;
  final double unitPrice;
  final int bagSize;
  final double bagPrice;
  final double lineTotal;
  final String unitType;
  final String image;
  final List<String> images;
  final List<String> sizes;
  final List<OrderSizeMix> sizeMix;

  factory OrderLineItem.fromMap(Map<String, dynamic> data) {
    List<String> stringList(dynamic value) {
      if (value is List) {
        return value
            .map((row) => '$row'.trim())
            .where((row) => row.isNotEmpty)
            .toList();
      }
      return const [];
    }

    final qty = _asInt(data['qty']) ?? 0;
    final unitPrice = _asDouble(data['unit_price']) ?? 0;
    final bagSize = _asInt(data['bag_size']) ?? 60;
    final fallbackBagPrice = unitPrice * bagSize;
    final bagPrice = _asDouble(data['price']) ?? fallbackBagPrice;
    final lineTotal = _asDouble(data['line_total']) ?? bagPrice * qty;
    final sizeMix = data['size_mix'] is List
        ? (data['size_mix'] as List)
              .whereType<Map>()
              .map(
                (row) => OrderSizeMix.fromMap(Map<String, dynamic>.from(row)),
              )
              .where((row) => row.size.isNotEmpty && row.qty > 0)
              .toList()
        : const <OrderSizeMix>[];
    final image = '${data['image'] ?? ''}';
    final images = stringList(data['images']);
    final sizes = stringList(data['sizes']);
    return OrderLineItem(
      id: '${data['id'] ?? data['product_id'] ?? ''}',
      slug: '${data['slug'] ?? ''}',
      name: '${data['name'] ?? 'Milana'}',
      modelNo: '${data['model_no'] ?? ''}',
      variant: '${data['variant'] ?? ''}',
      gender: '${data['gender'] ?? 'women'}',
      category: '${data['category'] ?? 'homewear'}',
      fabric:
          '${data['fabric'] ?? data['fabric_uz'] ?? data['fabric_en'] ?? ''}',
      description:
          '${data['description'] ?? data['desc_uz'] ?? data['desc_en'] ?? data['desc'] ?? ''}',
      qty: qty,
      unitPrice: unitPrice,
      bagSize: bagSize,
      bagPrice: bagPrice,
      lineTotal: lineTotal,
      unitType: normalizeOrderUnitType('${data['unit_type'] ?? bagUnitType}'),
      image: image,
      images: images.isEmpty && image.isNotEmpty ? [image] : images,
      sizes: sizes.isEmpty
          ? sizeMix.map((row) => row.size).take(sizeCount).toList()
          : sizes,
      sizeMix: sizeMix,
    );
  }

  CartItem toCartItem() {
    final selectedUnitType = normalizeOrderUnitType(unitType);
    final selectedPerSize = sizeMix.isEmpty
        ? (bagSize / (sizes.isEmpty ? sizeCount : sizes.length)).round().clamp(
            1,
            bagSize,
          )
        : sizeMix.first.qty;
    return CartItem(
      product: Product(
        id: id.isNotEmpty ? id : slug,
        slug: slug.isNotEmpty ? slug : id,
        name: name,
        gender: gender.isNotEmpty ? gender : 'women',
        category: category.isNotEmpty ? category : 'homewear',
        price: unitPrice,
        sizes: sizes,
        images: images,
        modelNo: modelNo,
        variant: variant,
        fabric: fabric,
        description: description,
        orderUnits: [
          ProductOrderUnit(
            unitType: selectedUnitType,
            label: orderUnitLabel(
              selectedUnitType,
              languageCode: defaultLanguageCode,
            ),
            pieces: bagSize,
            perSize: selectedPerSize,
            minQty: 1,
          ),
        ],
      ),
      quantity: qty.clamp(1, 20),
      unitType: selectedUnitType,
    );
  }
}

class OrderSizeMix {
  const OrderSizeMix({required this.size, required this.qty});

  final String size;
  final int qty;

  factory OrderSizeMix.fromMap(Map<String, dynamic> data) {
    return OrderSizeMix(
      size: '${data['size'] ?? ''}',
      qty: _asInt(data['qty']) ?? 0,
    );
  }
}

class OrderSummary {
  const OrderSummary({
    required this.provenance,
    required this.id,
    required this.number,
    required this.total,
    required this.status,
    required this.paymentStatus,
    required this.paymentMethod,
    required this.paymentLabel,
    required this.paymentInstructions,
    required this.createdAt,
    required this.itemCount,
    this.paymentReference = '',
    this.paymentExpiresAt,
    this.deliveryCarrier = '',
    this.trackingNumber = '',
    this.trackingUrl = '',
    this.deliveryNote = '',
    this.paymentSubmissionReference = '',
    this.paymentSubmissionNote = '',
    this.paymentSubmittedAt,
    this.activity = const [],
    this.items = const [],
  });

  final BackendProvenance provenance;
  final String id;
  final String number;
  final double total;
  final String status;
  final String paymentStatus;
  final String paymentMethod;
  final String paymentLabel;
  final String paymentInstructions;
  final DateTime? createdAt;
  final int itemCount;
  final String paymentReference;
  final DateTime? paymentExpiresAt;
  final String deliveryCarrier;
  final String trackingNumber;
  final String trackingUrl;
  final String deliveryNote;
  final String paymentSubmissionReference;
  final String paymentSubmissionNote;
  final DateTime? paymentSubmittedAt;
  final List<OrderActivity> activity;
  final List<OrderLineItem> items;

  factory OrderSummary.fromMap(
    Map<String, dynamic> data, {
    required BackendProvenance provenance,
  }) {
    final itemRows = data['items'] is List ? data['items'] as List : const [];
    final items = itemRows
        .whereType<Map>()
        .map((row) => OrderLineItem.fromMap(Map<String, dynamic>.from(row)))
        .toList();
    final payment = data['payment'] is Map ? data['payment'] as Map : const {};
    final delivery = data['delivery'] is Map
        ? data['delivery'] as Map
        : const {};
    final submission = payment['submission'] is Map
        ? payment['submission'] as Map
        : const {};
    final activity = data['activity'] is List
        ? (data['activity'] as List)
              .whereType<Map>()
              .map(
                (row) => OrderActivity.fromMap(Map<String, dynamic>.from(row)),
              )
              .toList()
        : const <OrderActivity>[];
    return OrderSummary(
      provenance: provenance,
      id: '${data['id'] ?? data['order_id'] ?? ''}',
      number: '${data['number'] ?? ''}',
      total: _asDouble(data['total']) ?? 0,
      status: '${data['status'] ?? 'new'}',
      paymentStatus: '${payment['status'] ?? 'pending'}',
      paymentMethod: '${payment['method'] ?? 'manager'}',
      paymentLabel: '${payment['label'] ?? 'Menejer orqali'}',
      paymentInstructions: '${payment['instructions'] ?? ''}',
      createdAt: DateTime.tryParse('${data['created_at'] ?? ''}'),
      paymentReference: '${payment['reference'] ?? ''}',
      paymentExpiresAt: DateTime.tryParse('${payment['expires_at'] ?? ''}'),
      deliveryCarrier: '${delivery['carrier'] ?? ''}',
      trackingNumber: '${delivery['tracking_number'] ?? ''}',
      trackingUrl: '${delivery['tracking_url'] ?? ''}',
      deliveryNote: '${delivery['note'] ?? ''}',
      paymentSubmissionReference: '${submission['reference'] ?? ''}',
      paymentSubmissionNote: '${submission['note'] ?? ''}',
      paymentSubmittedAt: DateTime.tryParse(
        '${submission['submitted_at'] ?? ''}',
      ),
      activity: activity,
      items: items,
      itemCount: items.fold<int>(0, (sum, item) => sum + item.qty),
    );
  }
}

double? _asDouble(dynamic value) {
  if (value is num) return value.toDouble();
  final normalized = '$value'.trim().replaceAll(',', '.');
  if (normalized.isEmpty || normalized == 'null') return null;
  return double.tryParse(normalized);
}

int? _asInt(dynamic value) {
  if (value is num) return value.toInt();
  final parsed = _asDouble(value);
  return parsed?.toInt();
}

class OrderActivity {
  const OrderActivity({
    required this.type,
    required this.title,
    required this.message,
    required this.actor,
    required this.createdAt,
  });

  final String type;
  final String title;
  final String message;
  final String actor;
  final DateTime? createdAt;

  factory OrderActivity.fromMap(Map<String, dynamic> data) {
    return OrderActivity(
      type: '${data['type'] ?? ''}',
      title: '${data['title'] ?? ''}',
      message: '${data['message'] ?? ''}',
      actor: '${data['actor'] ?? 'system'}',
      createdAt: DateTime.tryParse('${data['created_at'] ?? ''}'),
    );
  }
}
