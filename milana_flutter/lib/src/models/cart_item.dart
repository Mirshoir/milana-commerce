import 'product.dart';

const int bagSize = 60;
const int sizeCount = 6;
const int qtyPerSize = 10;
const String packUnitType = 'pachka';
const String bagUnitType = 'qop';

String normalizeOrderUnitType(String value) {
  final normalized = value.trim().toLowerCase();
  if (normalized == 'pachka' || normalized == 'qadoq' || normalized == 'pack') {
    return packUnitType;
  }
  return bagUnitType;
}

String orderUnitLabel(String unitType) =>
    normalizeOrderUnitType(unitType) == packUnitType ? 'Qadoq' : 'Qop';

String orderUnitEnglishLabel(String unitType) =>
    normalizeOrderUnitType(unitType) == packUnitType ? 'Pack' : 'Bag';

class CartItem {
  const CartItem({
    required this.product,
    this.quantity = 1,
    this.unitType = bagUnitType,
  });

  factory CartItem.fromJson(Map<String, dynamic> json) {
    final productJson = json['product'];
    if (productJson is! Map) {
      throw const FormatException('Cart item product is missing.');
    }
    final qty = (json['quantity'] as num?)?.toInt() ?? 1;
    return CartItem(
      product: Product.fromJson(Map<String, dynamic>.from(productJson)),
      quantity: qty.clamp(1, 20).toInt(),
      unitType: normalizeOrderUnitType('${json['unit_type'] ?? bagUnitType}'),
    );
  }

  factory CartItem.fromProfileJson(Map<String, dynamic> json) {
    final productJson = json['product'];
    if (productJson is Map) {
      return CartItem.fromJson(json);
    }
    final qty = (json['quantity'] as num?)?.toInt() ?? 1;
    final productId = '${json['product_id'] ?? ''}'.trim();
    if (productId.isEmpty) {
      throw const FormatException('Cart item product id is missing.');
    }
    return CartItem(
      product: Product.fromJson({
        'id': productId,
        'slug': json['slug'] ?? productId,
        'name': json['name'] ?? productId,
        'gender': json['gender'] ?? 'women',
        'product_type': json['category'] ?? 'homewear',
        'price': json['unit_price'],
        'sizes': json['sizes'],
        'images': json['images'],
        'model_no': json['model_no'],
        'variant': json['variant'],
        'fabric': json['fabric'],
        'material': json['material'],
        'composition': json['composition'],
        'description': json['description'],
        'season': json['season'],
        'tag': json['tag'],
        'collection': json['collection'],
        'available_qop': json['available_qop'],
        'preorder': json['preorder'],
        'in_stock': json['in_stock'],
        'can_order_wholesale': json['can_order_wholesale'],
        'order_units': json['order_units'],
      }),
      quantity: qty.clamp(1, 20).toInt(),
      unitType: normalizeOrderUnitType('${json['unit_type'] ?? bagUnitType}'),
    );
  }

  final Product product;
  final int quantity;
  final String unitType;

  ProductOrderUnit get orderUnit => product.orderUnitFor(unitType);
  String get storageKey => '${product.id}:${orderUnit.unitType}';
  int get piecesPerUnit => orderUnit.pieces;
  int get pieceCount => piecesPerUnit * quantity;
  double get packagePrice => product.price * piecesPerUnit;

  // Kept for old callers and persisted carts. New UI uses packagePrice.
  double get bagPrice => packagePrice;
  double get lineTotal => packagePrice * quantity;

  CartItem copyWith({Product? product, int? quantity, String? unitType}) =>
      CartItem(
        product: product ?? this.product,
        quantity: quantity ?? this.quantity,
        unitType: normalizeOrderUnitType(unitType ?? this.unitType),
      );

  List<String> get mixSizes {
    final defaults = product.gender == 'men'
        ? ['46', '48', '50', '52', '54', '56']
        : product.gender == 'kids' || product.category == 'pajamas'
        ? ['28', '30', '32', '34', '36', '38']
        : ['44', '46', '48', '50', '52', '54'];
    final seen = <String>{};
    final packPieces = product.orderUnitFor(packUnitType).pieces;
    return [
      ...product.sizes,
      ...defaults,
    ].where((size) => seen.add(size)).take(packPieces).toList();
  }

  List<Map<String, dynamic>> get sizeMix => mixSizes
      .map((size) => {'size': size, 'qty': orderUnit.perSize})
      .toList(growable: false);

  Map<String, dynamic> toOrderJson() => {
    'id': int.tryParse(product.id) ?? product.id,
    'slug': product.slug,
    'name': product.name,
    'qty': quantity,
    'unit_type': orderUnit.unitType,
    'unit_price': product.price,
    'bag_size': piecesPerUnit,
    'price': packagePrice,
    'image': product.images.isEmpty ? '' : product.images.first,
    'size_mix': sizeMix,
  };

  Map<String, dynamic> toJson() => {
    'product': product.toJson(),
    'quantity': quantity,
    'unit_type': orderUnit.unitType,
  };

  Map<String, dynamic> toProfileJson() => {
    'product_id': product.id,
    'slug': product.slug,
    'name': product.name,
    'gender': product.gender,
    'category': product.category,
    'unit_price': product.price,
    'quantity': quantity.clamp(1, 20),
    'unit_type': orderUnit.unitType,
    'sizes': product.sizes.take(24).toList(),
    'images': product.images.take(2).toList(),
    'model_no': product.modelNo,
    'variant': product.variant,
    'fabric': product.fabric,
    'material': product.material,
    'composition': product.composition,
    'description': product.description,
    'season': product.season,
    'tag': product.tag,
    'collection': product.collection,
    if (product.availableQop != null) 'available_qop': product.availableQop,
    'preorder': product.preorder,
    'in_stock': product.inStock,
    'can_order_wholesale': product.canOrderWholesale,
    'order_units': product.orderUnits.map((unit) => unit.toJson()).toList(),
  };
}
