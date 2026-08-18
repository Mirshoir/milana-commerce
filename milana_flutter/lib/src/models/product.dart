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
    final unitType = switch (rawType) {
      'qadoq' || 'pack' => 'pachka',
      'bag' => 'qop',
      _ => rawType,
    };
    return ProductOrderUnit(
      unitType: unitType,
      label: '${json['label'] ?? (unitType == 'pachka' ? 'Qadoq' : 'Qop')}',
      pieces: (_asInt(json['pieces']) ?? 0).clamp(1, 1000).toInt(),
      perSize: (_asInt(json['per_size']) ?? 1).clamp(1, 1000).toInt(),
      minQty: (_asInt(json['min_qty']) ?? 1).clamp(1, 1000).toInt(),
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

class ProductAvailability {
  const ProductAvailability({
    this.status = '',
    this.tracked = false,
    this.available = false,
    this.remainingQop,
    this.remainingUnits,
  });

  factory ProductAvailability.fromJson(dynamic value) {
    if (value is! Map) return const ProductAvailability();
    final json = Map<String, dynamic>.from(value);
    return ProductAvailability(
      status: '${json['status'] ?? ''}'.trim().toLowerCase(),
      tracked: _asBool(json['tracked'], fallback: false),
      available: _asBool(json['available'], fallback: false),
      remainingQop: _asDouble(json['remaining_qop']),
      remainingUnits: _asInt(json['remaining_units']),
    );
  }

  final String status;
  final bool tracked;
  final bool available;
  final double? remainingQop;
  final int? remainingUnits;

  Map<String, dynamic> toJson() => {
    'status': status,
    'tracked': tracked,
    'available': available,
    if (remainingQop != null) 'remaining_qop': remainingQop,
    if (remainingUnits != null) 'remaining_units': remainingUnits,
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
    this.rating = 0,
    this.reviews = 0,
    this.active = true,
    this.availableQop,
    this.preorder = false,
    this.copyManual = false,
    this.inStock = true,
    this.canOrderWholesale = true,
    this.orderUnits = const <ProductOrderUnit>[],
    this.localizedNames = const <String, String>{},
    this.localizedFabrics = const <String, String>{},
    this.localizedMaterials = const <String, String>{},
    this.localizedCompositions = const <String, String>{},
    this.localizedDescriptions = const <String, String>{},
    this.localizedCare = const <String, String>{},
    this.localizedSeasons = const <String, String>{},
    this.localizedCollections = const <String, String>{},
    this.sizeChart = '',
    this.color = '',
    this.country = '',
    this.likeCount = 0,
    this.views = 0,
    this.colors = const <String>[],
    this.sourceCategory = '',
    this.catalogPanel = '',
    this.oldPrice,
    this.wholesalePrice,
    this.wholesaleMoq,
    this.retailEnabled = false,
    this.retailPrice,
    this.retailStock,
    this.canOrderRetail = false,
    this.priceVisible = true,
    this.priceLabel = '',
    this.priceSource = '',
    this.priceDiscount = 0,
    this.assignedManager = '',
    this.sortOrder = 0,
    this.createdAt = '',
    this.wholesaleAvailability = const ProductAvailability(),
    this.retailAvailability = const ProductAvailability(),
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
  final bool copyManual;
  final bool inStock;
  final bool canOrderWholesale;
  final List<ProductOrderUnit> orderUnits;
  final Map<String, String> localizedNames;
  final Map<String, String> localizedFabrics;
  final Map<String, String> localizedMaterials;
  final Map<String, String> localizedCompositions;
  final Map<String, String> localizedDescriptions;
  final Map<String, String> localizedCare;
  final Map<String, String> localizedSeasons;
  final Map<String, String> localizedCollections;
  final String sizeChart;
  final String color;
  final String country;
  final int likeCount;
  final int views;
  final List<String> colors;
  final String sourceCategory;
  final String catalogPanel;
  final double? oldPrice;
  final double? wholesalePrice;
  final int? wholesaleMoq;
  final bool retailEnabled;
  final double? retailPrice;
  final int? retailStock;
  final bool canOrderRetail;
  final bool priceVisible;
  final String priceLabel;
  final String priceSource;
  final double priceDiscount;
  final String assignedManager;
  final int sortOrder;
  final String createdAt;
  final ProductAvailability wholesaleAvailability;
  final ProductAvailability retailAvailability;

  String nameFor(String languageCode) {
    final translated = _localizedValue(localizedNames, languageCode);
    if (translated.isNotEmpty) return translated;
    if (languageCode == 'ru' || !_containsCyrillic(name)) return name;

    // Older catalog rows only have a Russian title, but do contain a translated
    // description. Use its concise product-type clause instead of leaking a
    // Russian title into the English or Uzbek interface.
    final description = _localizedValue(localizedDescriptions, languageCode);
    final generated = _shortNameFromDescription(description);
    if (generated.isNotEmpty) {
      return modelNo.isEmpty ? generated : '$generated · $modelNo';
    }
    return modelNo.isEmpty ? name : modelNo;
  }

  /// Product descriptions are maintained by the website and are the
  /// authoritative detail copy. Short catalog names remain available for
  /// navigation and search results.
  String detailTitleFor(String languageCode) {
    final websiteCopy = descriptionFor(languageCode).trim();
    if (websiteCopy.length >= 2 &&
        websiteCopy.length <= 160 &&
        !websiteCopy.contains('\n')) {
      return websiteCopy;
    }
    return nameFor(languageCode);
  }

  String fabricFor(String languageCode) =>
      _localizedValue(localizedFabrics, languageCode, fallback: fabric);

  String materialFor(String languageCode) =>
      _localizedValue(localizedMaterials, languageCode, fallback: material);

  String compositionFor(String languageCode) => _localizedValue(
    localizedCompositions,
    languageCode,
    fallback: composition,
  );

  String descriptionFor(String languageCode) => _localizedValue(
    localizedDescriptions,
    languageCode,
    fallback: description,
  );

  String careFor(String languageCode) =>
      _localizedValue(localizedCare, languageCode);

  String seasonFor(String languageCode) =>
      _localizedValue(localizedSeasons, languageCode, fallback: season);

  String collectionFor(String languageCode) =>
      _localizedValue(localizedCollections, languageCode, fallback: collection);

  Iterable<String> get allLocalizedSearchText sync* {
    yield* localizedNames.values;
    yield* localizedFabrics.values;
    yield* localizedMaterials.values;
    yield* localizedCompositions.values;
    yield* localizedDescriptions.values;
    yield* localizedCare.values;
    yield* localizedSeasons.values;
    yield* localizedCollections.values;
  }

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
      if (raw.contains('tunic') || raw.contains('туник')) return 'tunic';
      if (raw.contains('saroch') || raw.contains('сороч')) return 'sarochka';
      if (raw.contains('set') ||
          raw.contains('комплект') ||
          raw.contains('двойк')) {
        return 'set';
      }
      if (raw.contains('trouser') ||
          raw.contains('pants') ||
          raw.contains('брюк') ||
          raw.contains('штан')) {
        return 'trousers';
      }
      if (raw.contains('tshirt') ||
          raw.contains('t-shirt') ||
          raw.contains('футбол')) {
        return 'tshirt';
      }
      if (raw.contains('hoodie') || raw.contains('худи')) return 'hoodie';
      if (raw.contains('shirt') || raw.contains('рубаш')) return 'shirt';
      return raw.isEmpty ? 'homewear' : raw;
    }

    final idValue = json['id'] ?? json['doc_id'] ?? json['slug'];
    final availableQop = _asDouble(json['available_qop']);
    final active = asBool(json['active'], fallback: true);
    final preorder = asBool(json['preorder'], fallback: false);
    final copyManual = asBool(json['copy_manual'], fallback: false);
    final inStock = asBool(
      json['in_stock'],
      fallback: availableQop == null || availableQop > 0,
    );
    final canOrderWholesale = asBool(
      json['can_order_wholesale'],
      fallback: active && (availableQop == null || availableQop > 0),
    );
    final wholesalePrice = _asDouble(json['wholesale_price']);
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
    final localizedNames = _readLocalizedField(json, const ['name']);
    final localizedFabrics = _readLocalizedField(json, const ['fabric']);
    final localizedMaterials = _readLocalizedField(json, const ['material']);
    final localizedCompositions = _readLocalizedField(json, const [
      'composition',
    ]);
    final localizedDescriptions = _readLocalizedField(json, const [
      'desc',
      'description',
    ]);
    final localizedCare = _readLocalizedField(json, const ['care']);
    final localizedSeasons = _readLocalizedField(json, const ['season']);
    final localizedCollections = _readLocalizedField(json, const [
      'collection',
    ]);
    final canonicalName = _canonicalValue(json, const ['name'], localizedNames);
    return Product(
      id: '$idValue',
      slug: '${json['slug'] ?? idValue}',
      name: canonicalName.isEmpty
          ? '${json['model_no'] ?? 'Milana'}'
          : canonicalName,
      gender: '${json['gender'] ?? 'women'}'.trim().toLowerCase(),
      category: productType(),
      price: _asDouble(json['price']) ?? 0,
      sizes: asList(json['sizes']),
      images: asList(json['images']),
      modelNo: '${json['model_no'] ?? ''}',
      variant: '${json['variant'] ?? ''}',
      fabric: _canonicalValue(json, const ['fabric'], localizedFabrics),
      material: _canonicalValue(json, const ['material'], localizedMaterials),
      composition: _canonicalValue(json, const [
        'composition',
      ], localizedCompositions),
      description: _canonicalValue(json, const [
        'desc',
        'description',
      ], localizedDescriptions),
      season: _canonicalValue(json, const ['season'], localizedSeasons),
      tag: '${json['tag'] ?? ''}'.trim().toLowerCase(),
      collection: _canonicalValue(json, const [
        'collection',
      ], localizedCollections),
      rating: _asDouble(json['rating']) ?? 0,
      reviews: _asInt(json['reviews']) ?? 0,
      active: active,
      availableQop: availableQop,
      preorder: preorder,
      copyManual: copyManual,
      inStock: inStock,
      canOrderWholesale: canOrderWholesale,
      orderUnits: orderUnits,
      localizedNames: localizedNames,
      localizedFabrics: localizedFabrics,
      localizedMaterials: localizedMaterials,
      localizedCompositions: localizedCompositions,
      localizedDescriptions: localizedDescriptions,
      localizedCare: localizedCare,
      localizedSeasons: localizedSeasons,
      localizedCollections: localizedCollections,
      sizeChart: '${json['size_chart'] ?? ''}'.trim(),
      color: '${json['color'] ?? ''}'.trim(),
      country: '${json['country'] ?? ''}'.trim(),
      likeCount: _asInt(json['like_count']) ?? 0,
      views: _asInt(json['views']) ?? 0,
      colors: asList(json['colors']),
      sourceCategory: '${json['category'] ?? ''}'.trim(),
      catalogPanel: '${json['catalog_panel'] ?? ''}'.trim(),
      oldPrice: _asDouble(json['old_price']),
      wholesalePrice: wholesalePrice,
      wholesaleMoq: _asInt(json['wholesale_moq']),
      retailEnabled: asBool(json['retail_enabled'], fallback: false),
      retailPrice: _asDouble(json['retail_price']),
      retailStock: _asInt(json['retail_stock']),
      canOrderRetail: asBool(json['can_order_retail'], fallback: false),
      priceVisible: asBool(json['price_visible'], fallback: true),
      priceLabel: '${json['price_label'] ?? ''}'.trim(),
      priceSource: '${json['price_source'] ?? ''}'.trim(),
      priceDiscount: _asDouble(json['price_discount']) ?? 0,
      assignedManager: '${json['assigned_manager'] ?? ''}'.trim(),
      sortOrder: _asInt(json['sort']) ?? 0,
      createdAt: '${json['created_at'] ?? ''}'.trim(),
      wholesaleAvailability: ProductAvailability.fromJson(
        json['availability_wholesale'],
      ),
      retailAvailability: ProductAvailability.fromJson(
        json['availability_retail'],
      ),
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
      copyManual: copyManual,
      inStock: inStock,
      canOrderWholesale: canOrderWholesale,
      orderUnits: orderUnits,
      localizedNames: localizedNames,
      localizedFabrics: localizedFabrics,
      localizedMaterials: localizedMaterials,
      localizedCompositions: localizedCompositions,
      localizedDescriptions: localizedDescriptions,
      localizedCare: localizedCare,
      localizedSeasons: localizedSeasons,
      localizedCollections: localizedCollections,
      sizeChart: sizeChart,
      color: color,
      country: country,
      likeCount: likeCount,
      views: views,
      colors: colors,
      sourceCategory: sourceCategory,
      catalogPanel: catalogPanel,
      oldPrice: oldPrice,
      wholesalePrice: wholesalePrice,
      wholesaleMoq: wholesaleMoq,
      retailEnabled: retailEnabled,
      retailPrice: retailPrice,
      retailStock: retailStock,
      canOrderRetail: canOrderRetail,
      priceVisible: priceVisible,
      priceLabel: priceLabel,
      priceSource: priceSource,
      priceDiscount: priceDiscount,
      assignedManager: assignedManager,
      sortOrder: sortOrder,
      createdAt: createdAt,
      wholesaleAvailability: wholesaleAvailability,
      retailAvailability: retailAvailability,
    );
  }

  Map<String, dynamic> toFirestore() => toJson();

  Map<String, dynamic> toJson() => {
    'id': id,
    'slug': slug,
    'name': name,
    'gender': gender,
    'category': sourceCategory.isEmpty ? category : sourceCategory,
    'product_type': category,
    if (catalogPanel.isNotEmpty) 'catalog_panel': catalogPanel,
    'price': price,
    if (oldPrice != null) 'old_price': oldPrice,
    if (wholesalePrice != null) 'wholesale_price': wholesalePrice,
    if (wholesaleMoq != null) 'wholesale_moq': wholesaleMoq,
    'retail_enabled': retailEnabled,
    if (retailPrice != null) 'retail_price': retailPrice,
    if (retailStock != null) 'retail_stock': retailStock,
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
    'size_chart': sizeChart,
    'color': color,
    'country': country,
    'like_count': likeCount,
    'views': views,
    'colors': colors,
    'active': active,
    if (availableQop != null) 'available_qop': availableQop,
    'preorder': preorder,
    'copy_manual': copyManual,
    'in_stock': inStock,
    'can_order_wholesale': canOrderWholesale,
    'can_order_retail': canOrderRetail,
    'price_visible': priceVisible,
    'price_label': priceLabel,
    'price_source': priceSource,
    'price_discount': priceDiscount,
    'assigned_manager': assignedManager,
    'sort': sortOrder,
    'created_at': createdAt,
    'availability_wholesale': wholesaleAvailability.toJson(),
    'availability_retail': retailAvailability.toJson(),
    'order_units': orderUnits.map((unit) => unit.toJson()).toList(),
    if (localizedNames.isNotEmpty) 'name_i18n': localizedNames,
    if (localizedFabrics.isNotEmpty) 'fabric_i18n': localizedFabrics,
    if (localizedMaterials.isNotEmpty) 'material_i18n': localizedMaterials,
    if (localizedCompositions.isNotEmpty)
      'composition_i18n': localizedCompositions,
    if (localizedDescriptions.isNotEmpty)
      'description_i18n': localizedDescriptions,
    if (localizedCare.isNotEmpty) 'care_i18n': localizedCare,
    if (localizedSeasons.isNotEmpty) 'season_i18n': localizedSeasons,
    if (localizedCollections.isNotEmpty)
      'collection_i18n': localizedCollections,
  };
}

const _productLanguageCodes = <String>['uz', 'ru', 'en'];

Map<String, String> _readLocalizedField(
  Map<String, dynamic> json,
  List<String> fieldNames,
) {
  final result = <String, String>{};
  for (final field in fieldNames) {
    for (final source in [
      json['${field}_i18n'],
      json['${field}_localized'],
      json[field],
    ]) {
      if (source is! Map) continue;
      for (final languageCode in _productLanguageCodes) {
        final value = '${source[languageCode] ?? ''}'.trim();
        if (value.isNotEmpty) result.putIfAbsent(languageCode, () => value);
      }
    }
    for (final languageCode in _productLanguageCodes) {
      final value = '${json['${field}_$languageCode'] ?? ''}'.trim();
      if (value.isNotEmpty) result.putIfAbsent(languageCode, () => value);
    }
  }
  return Map<String, String>.unmodifiable(result);
}

String _canonicalValue(
  Map<String, dynamic> json,
  List<String> fieldNames,
  Map<String, String> localized,
) {
  for (final field in fieldNames) {
    final value = json[field];
    if (value is! Map) {
      final text = '${value ?? ''}'.trim();
      if (text.isNotEmpty && text != 'null') return text;
    }
  }
  for (final languageCode in const ['ru', 'uz', 'en']) {
    final value = localized[languageCode]?.trim() ?? '';
    if (value.isNotEmpty) return value;
  }
  return '';
}

String _localizedValue(
  Map<String, String> values,
  String languageCode, {
  String fallback = '',
}) {
  final selected = values[languageCode]?.trim() ?? '';
  if (selected.isNotEmpty) return selected;
  if (fallback.trim().isNotEmpty) return fallback.trim();
  for (final code in const ['ru', 'uz', 'en']) {
    final value = values[code]?.trim() ?? '';
    if (value.isNotEmpty) return value;
  }
  return '';
}

bool _containsCyrillic(String value) =>
    RegExp(r'[\u0400-\u052f]').hasMatch(value);

String _shortNameFromDescription(String description) {
  if (description.trim().isEmpty) return '';
  final firstSentence = description.trim().split(RegExp(r'[.!?]')).first;
  final colon = firstSentence.indexOf(':');
  if (colon < 0 || colon == firstSentence.length - 1) return '';
  final candidate = firstSentence.substring(colon + 1).split(';').first.trim();
  if (candidate.length < 2 || candidate.length > 48) return '';
  return '${candidate[0].toUpperCase()}${candidate.substring(1)}';
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

bool _asBool(dynamic value, {required bool fallback}) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  final normalized = '$value'.trim().toLowerCase();
  if (normalized == 'true' || normalized == '1') return true;
  if (normalized == 'false' || normalized == '0') return false;
  return fallback;
}
