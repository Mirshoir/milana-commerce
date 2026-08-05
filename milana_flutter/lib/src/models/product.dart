class ProductOrderUnit {
  const ProductOrderUnit({
    required this.unitType,
    required this.label,
    required this.pieces,
    required this.perSize,
    this.minQty = 1,
  });

  factory ProductOrderUnit.fromJson(Map<String, dynamic> json) {
    final rawType = '${json['unit_type'] ?? json['type'] ?? ''}'
        .trim()
        .toLowerCase();
    final unitType = rawType == 'qadoq' ? 'pachka' : rawType;
    return ProductOrderUnit(
      unitType: unitType,
      label: '${json['label'] ?? (unitType == 'pachka' ? 'Qadoq' : 'Qop')}',
      pieces: ((json['pieces'] as num?)?.toInt() ?? 0).clamp(1, 1000).toInt(),
      perSize: ((json['per_size'] as num?)?.toInt() ?? 1)
          .clamp(1, 1000)
          .toInt(),
      minQty: ((json['min_qty'] as num?)?.toInt() ?? 1).clamp(1, 1000).toInt(),
    );
  }

  final String unitType;
  final String label;
  final int pieces;
  final int perSize;
  final int minQty;

  bool get isPack => unitType == 'pachka';
  bool get isBag => unitType == 'qop';

  Map<String, dynamic> toJson() => {
    'unit_type': unitType,
    'label': label,
    'pieces': pieces,
    'per_size': perSize,
    'min_qty': minQty,
  };
}

class Product {
  const Product({
    required this.id,
    required this.slug,
    required this.name,
    required this.gender,
    required this.category,
    required this.price,
    required this.sizes,
    required this.images,
    this.modelNo = '',
    this.variant = '',
    this.fabric = '',
    this.material = '',
    this.composition = '',
    this.description = '',
    this.season = '',
    this.tag = '',
    this.collection = '',
    this.rating = 4.8,
    this.reviews = 0,
    this.active = true,
    this.availableQop,
    this.preorder = false,
    this.inStock = true,
    this.canOrderWholesale = true,
    this.orderUnits = const <ProductOrderUnit>[],
  });

  final String id;
  final String slug;
  final String name;
  final String gender;
  final String category;
  final double price;
  final List<String> sizes;
  final List<String> images;
  final String modelNo;
  final String variant;
  final String fabric;
  final String material;
  final String composition;
  final String description;
  final String season;
  final String tag;
  final String collection;
  final double rating;
  final int reviews;
  final bool active;
  final double? availableQop;
  final bool preorder;
  final bool inStock;
  final bool canOrderWholesale;
  final List<ProductOrderUnit> orderUnits;

  List<ProductOrderUnit> get effectiveOrderUnits {
    final packPieces = sizes.isEmpty ? 6 : sizes.length;
    final fallback = <ProductOrderUnit>[
      ProductOrderUnit(
        unitType: 'pachka',
        label: 'Qadoq',
        pieces: packPieces,
        perSize: 1,
      ),
      ProductOrderUnit(
        unitType: 'qop',
        label: 'Qop',
        pieces: 60,
        perSize: (60 ~/ packPieces).clamp(1, 60).toInt(),
      ),
    ];
    final byType = <String, ProductOrderUnit>{
      for (final unit in fallback) unit.unitType: unit,
      for (final unit in orderUnits)
        if (unit.unitType == 'pachka' || unit.unitType == 'qop')
          unit.unitType: unit,
    };
    return [byType['pachka']!, byType['qop']!];
  }

  ProductOrderUnit orderUnitFor(String unitType) {
    final normalized = unitType == 'qadoq' ? 'pachka' : unitType;
    return effectiveOrderUnits.firstWhere(
      (unit) => unit.unitType == normalized,
      orElse: () => effectiveOrderUnits.last,
    );
  }

  factory Product.fromJson(Map<String, dynamic> json) {
    List<String> asList(dynamic value) {
      if (value is List) {
        return value
            .map((e) => '$e'.trim())
            .where((e) => e.isNotEmpty)
            .toList();
      }
      return const [];
    }

    String localized(dynamic value) {
      if (value is Map) {
        for (final key in const ['uz', 'en', 'ru']) {
          final text = '${value[key] ?? ''}'.trim();
          if (text.isNotEmpty) return text;
        }
        return '';
      }
      return '${value ?? ''}'.trim();
    }

    bool asBool(dynamic value, {required bool fallback}) {
      if (value is bool) return value;
      if (value is num) return value != 0;
      final normalized = '$value'.trim().toLowerCase();
      if (normalized == 'true' || normalized == '1') return true;
      if (normalized == 'false' || normalized == '0') return false;
      return fallback;
    }

    String productType() {
      final raw = '${json['product_type'] ?? json['category'] ?? 'homewear'}'
          .trim()
          .toLowerCase();
      if (raw.contains('pajama') ||
          raw.contains('pijama') ||
          raw.contains('pizh')) {
        return 'pajamas';
      }
      if (raw.contains('robe') ||
          raw.contains('xalat') ||
          raw.contains('halat')) {
        return 'robes';
      }
      if (raw.contains('lounge')) return 'loungewear';
      if (raw.contains('family')) return 'family';
      if (raw.contains('home')) return 'homewear';
      return raw.isEmpty ? 'homewear' : raw;
    }

    final idValue = json['id'] ?? json['doc_id'] ?? json['slug'];
    final availableQop = (json['available_qop'] as num?)?.toDouble();
    final active = asBool(json['active'], fallback: true);
    final preorder = asBool(json['preorder'], fallback: false);
    final inStock = asBool(
      json['in_stock'],
      fallback: availableQop == null || availableQop > 0,
    );
    final canOrderWholesale = asBool(
      json['can_order_wholesale'],
      fallback: active && (availableQop == null || availableQop > 0),
    );
    final rawUnits = json['order_units'];
    final orderUnits = rawUnits is List
        ? rawUnits
              .whereType<Map>()
              .map(
                (row) =>
                    ProductOrderUnit.fromJson(Map<String, dynamic>.from(row)),
              )
              .where(
                (unit) => unit.unitType == 'pachka' || unit.unitType == 'qop',
              )
              .toList(growable: false)
        : const <ProductOrderUnit>[];
    return Product(
      id: '$idValue',
      slug: '${json['slug'] ?? idValue}',
      name: localized(json['name']).isEmpty
          ? '${json['model_no'] ?? 'Milana'}'
          : localized(json['name']),
      gender: '${json['gender'] ?? 'women'}'.trim().toLowerCase(),
      category: productType(),
      price: (json['price'] as num?)?.toDouble() ?? 0,
      sizes: asList(json['sizes']),
      images: asList(json['images']),
      modelNo: '${json['model_no'] ?? ''}',
      variant: '${json['variant'] ?? ''}',
      fabric: localized(
        json['fabric_uz'] ?? json['fabric_en'] ?? json['fabric'],
      ),
      material: localized(json['material']),
      composition: localized(json['composition']),
      description: localized(
        json['desc_uz'] ??
            json['desc_en'] ??
            json['desc'] ??
            json['description'],
      ),
      season: localized(json['season']),
      tag: '${json['tag'] ?? ''}'.trim().toLowerCase(),
      collection: localized(json['collection']),
      rating: (json['rating'] as num?)?.toDouble() ?? 4.8,
      reviews: (json['reviews'] as num?)?.toInt() ?? 0,
      active: active,
      availableQop: availableQop,
      preorder: preorder,
      inStock: inStock,
      canOrderWholesale: canOrderWholesale,
      orderUnits: orderUnits,
    );
  }

  Product copyWith({
    List<String>? images,
    double? price,
    bool? active,
    double? availableQop,
  }) {
    return Product(
      id: id,
      slug: slug,
      name: name,
      gender: gender,
      category: category,
      price: price ?? this.price,
      sizes: sizes,
      images: images ?? this.images,
      modelNo: modelNo,
      variant: variant,
      fabric: fabric,
      material: material,
      composition: composition,
      description: description,
      season: season,
      tag: tag,
      collection: collection,
      rating: rating,
      reviews: reviews,
      active: active ?? this.active,
      availableQop: availableQop ?? this.availableQop,
      preorder: preorder,
      inStock: inStock,
      canOrderWholesale: canOrderWholesale,
      orderUnits: orderUnits,
    );
  }

  Map<String, dynamic> toFirestore() => toJson();

  Map<String, dynamic> toJson() => {
    'id': id,
    'slug': slug,
    'name': name,
    'gender': gender,
    'category': category,
    'product_type': category,
    'price': price,
    'sizes': sizes,
    'images': images,
    'model_no': modelNo,
    'variant': variant,
    'fabric': fabric,
    'material': material,
    'composition': composition,
    'description': description,
    'season': season,
    'tag': tag,
    'collection': collection,
    'rating': rating,
    'reviews': reviews,
    'active': active,
    if (availableQop != null) 'available_qop': availableQop,
    'preorder': preorder,
    'in_stock': inStock,
    'can_order_wholesale': canOrderWholesale,
    'order_units': orderUnits.map((unit) => unit.toJson()).toList(),
  };
}
