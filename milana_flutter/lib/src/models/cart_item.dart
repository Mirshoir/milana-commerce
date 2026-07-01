import 'product.dart';

const int bagSize = 60;
const int sizeCount = 6;
const int qtyPerSize = 10;

class CartItem {
  const CartItem({required this.product, this.quantity = 1});

  factory CartItem.fromJson(Map<String, dynamic> json) {
    final productJson = json['product'];
    if (productJson is! Map) {
      throw const FormatException('Cart item product is missing.');
    }
    final qty = (json['quantity'] as num?)?.toInt() ?? 1;
    return CartItem(
      product: Product.fromJson(Map<String, dynamic>.from(productJson)),
      quantity: qty.clamp(1, 20),
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
        'category': json['category'] ?? 'homewear',
        'price': json['unit_price'],
        'sizes': json['sizes'],
        'images': json['images'],
        'model_no': json['model_no'],
        'variant': json['variant'],
        'fabric': json['fabric'],
        'description': json['description'],
        'available_qop': json['available_qop'],
      }),
      quantity: qty.clamp(1, 20),
    );
  }

  final Product product;
  final int quantity;

  double get bagPrice => product.price * bagSize;
  double get lineTotal => bagPrice * quantity;

  CartItem copyWith({int? quantity}) =>
      CartItem(product: product, quantity: quantity ?? this.quantity);

  List<String> get mixSizes {
    final defaults = product.gender == 'men'
        ? ['46', '48', '50', '52', '54', '56']
        : product.gender == 'kids' || product.category == 'pajamas'
        ? ['28', '30', '32', '34', '36', '38']
        : ['44', '46', '48', '50', '52', '54'];
    final seen = <String>{};
    return [
      ...product.sizes,
      ...defaults,
    ].where((size) => seen.add(size)).take(sizeCount).toList();
  }

  Map<String, dynamic> toOrderJson() => {
    'id': int.tryParse(product.id) ?? product.id,
    'slug': product.slug,
    'name': product.name,
    'qty': quantity,
    'unit_price': product.price,
    'bag_size': bagSize,
    'price': bagPrice,
    'image': product.images.isEmpty ? '' : product.images.first,
    'size_mix': mixSizes
        .map((size) => {'size': size, 'qty': qtyPerSize})
        .toList(),
  };

  Map<String, dynamic> toJson() => {
    'product': product.toJson(),
    'quantity': quantity,
  };

  Map<String, dynamic> toProfileJson() => {
    'product_id': product.id,
    'slug': product.slug,
    'name': product.name,
    'gender': product.gender,
    'category': product.category,
    'unit_price': product.price,
    'quantity': quantity.clamp(1, 20),
    'sizes': product.sizes.take(sizeCount).toList(),
    'images': product.images.take(2).toList(),
    'model_no': product.modelNo,
    'variant': product.variant,
    'fabric': product.fabric,
    'description': product.description,
    if (product.availableQop != null) 'available_qop': product.availableQop,
  };
}
