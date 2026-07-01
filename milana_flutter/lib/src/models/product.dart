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
    this.description = '',
    this.rating = 4.8,
    this.reviews = 0,
    this.active = true,
    this.availableQop,
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
  final String description;
  final double rating;
  final int reviews;
  final bool active;
  final int? availableQop;

  factory Product.fromJson(Map<String, dynamic> json) {
    List<String> asList(dynamic value) {
      if (value is List) {
        return value.map((e) => '$e').where((e) => e.isNotEmpty).toList();
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

    final idValue = json['id'] ?? json['doc_id'] ?? json['slug'];
    return Product(
      id: '$idValue',
      slug: '${json['slug'] ?? idValue}',
      name: '${json['name'] ?? json['model_no'] ?? 'Milana'}',
      gender: '${json['gender'] ?? 'women'}',
      category: '${json['category'] ?? 'homewear'}',
      price: (json['price'] as num?)?.toDouble() ?? 0,
      sizes: asList(json['sizes']),
      images: asList(json['images']),
      modelNo: '${json['model_no'] ?? ''}',
      variant: '${json['variant'] ?? ''}',
      fabric: localized(
        json['fabric_uz'] ?? json['fabric_en'] ?? json['fabric'],
      ),
      description: localized(
        json['desc_uz'] ??
            json['desc_en'] ??
            json['desc'] ??
            json['description'],
      ),
      rating: (json['rating'] as num?)?.toDouble() ?? 4.8,
      reviews: (json['reviews'] as num?)?.toInt() ?? 0,
      active: json['active'] != false && json['active'] != 0,
      availableQop: (json['available_qop'] as num?)?.toInt(),
    );
  }

  Map<String, dynamic> toFirestore() => {
    'slug': slug,
    'name': name,
    'gender': gender,
    'category': category,
    'price': price,
    'sizes': sizes,
    'images': images,
    'model_no': modelNo,
    'variant': variant,
    'fabric_uz': fabric,
    'desc_uz': description,
    'rating': rating,
    'reviews': reviews,
    'active': active,
    if (availableQop != null) 'available_qop': availableQop,
  };

  Map<String, dynamic> toJson() => {
    'id': id,
    'slug': slug,
    'name': name,
    'gender': gender,
    'category': category,
    'price': price,
    'sizes': sizes,
    'images': images,
    'model_no': modelNo,
    'variant': variant,
    'fabric': fabric,
    'description': description,
    'rating': rating,
    'reviews': reviews,
    'active': active,
    if (availableQop != null) 'available_qop': availableQop,
  };
}
