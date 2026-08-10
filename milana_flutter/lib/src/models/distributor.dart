import '../localization/app_localization.dart';

enum DistributorApplicationStatus {
  submitted,
  underReview,
  informationRequested,
  approved,
  rejected,
  suspended,
  unknown,
}

DistributorApplicationStatus distributorApplicationStatusFromString(
  String value,
) {
  return switch (value.trim().toLowerCase()) {
    'submitted' => DistributorApplicationStatus.submitted,
    'under_review' => DistributorApplicationStatus.underReview,
    'information_requested' =>
      DistributorApplicationStatus.informationRequested,
    'approved' => DistributorApplicationStatus.approved,
    'rejected' => DistributorApplicationStatus.rejected,
    'suspended' => DistributorApplicationStatus.suspended,
    _ => DistributorApplicationStatus.unknown,
  };
}

String distributorApplicationStatusValue(DistributorApplicationStatus status) {
  return switch (status) {
    DistributorApplicationStatus.submitted => 'submitted',
    DistributorApplicationStatus.underReview => 'under_review',
    DistributorApplicationStatus.informationRequested =>
      'information_requested',
    DistributorApplicationStatus.approved => 'approved',
    DistributorApplicationStatus.rejected => 'rejected',
    DistributorApplicationStatus.suspended => 'suspended',
    DistributorApplicationStatus.unknown => 'unknown',
  };
}

class DistributorApplicationRequest {
  const DistributorApplicationRequest({
    required this.clientApplicationId,
    required this.contactName,
    required this.companyName,
    required this.phone,
    required this.email,
    required this.country,
    required this.city,
    required this.expectedMonthlyVolume,
    required this.salesChannels,
    required this.requestedTerritories,
    required this.message,
    required this.legalAccepted,
    this.website = '',
    this.languageCode = defaultLanguageCode,
  });

  final String clientApplicationId;
  final String contactName;
  final String companyName;
  final String phone;
  final String email;
  final String country;
  final String city;
  final String website;
  final String expectedMonthlyVolume;
  final String salesChannels;
  final String requestedTerritories;
  final String message;
  final bool legalAccepted;
  final String languageCode;

  Map<String, dynamic> toFunctionJson() => {
    'client_application_id': clientApplicationId,
    'contact_name': contactName,
    'company_name': companyName,
    'phone': phone,
    'email': email,
    'country': country,
    'city': city,
    'website': website,
    'expected_monthly_volume': expectedMonthlyVolume,
    'sales_channels': salesChannels,
    'requested_territories': requestedTerritories,
    'message': message,
    'legal_accepted': legalAccepted,
    'lang': normalizeLanguageCode(languageCode),
  };
}

class DistributorApplicationReceipt {
  const DistributorApplicationReceipt({
    required this.id,
    required this.number,
    required this.status,
  });

  final String id;
  final String number;
  final DistributorApplicationStatus status;

  factory DistributorApplicationReceipt.fromMap(Map<String, dynamic> data) {
    return DistributorApplicationReceipt(
      id: '${data['application_id'] ?? data['id'] ?? ''}',
      number: '${data['number'] ?? ''}',
      status: distributorApplicationStatusFromString('${data['status'] ?? ''}'),
    );
  }
}

class DistributorApplication {
  const DistributorApplication({
    required this.id,
    required this.number,
    required this.companyName,
    required this.contactName,
    required this.country,
    required this.status,
    required this.createdAt,
    this.updatedAt,
    this.managerMessage = '',
  });

  final String id;
  final String number;
  final String companyName;
  final String contactName;
  final String country;
  final DistributorApplicationStatus status;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String managerMessage;

  factory DistributorApplication.fromMap(
    Map<String, dynamic> data, {
    String id = '',
  }) {
    return DistributorApplication(
      id: id.isEmpty ? '${data['id'] ?? data['application_id'] ?? ''}' : id,
      number: '${data['number'] ?? ''}',
      companyName: '${data['company_name'] ?? ''}',
      contactName: '${data['contact_name'] ?? ''}',
      country: '${data['country'] ?? ''}',
      status: distributorApplicationStatusFromString('${data['status'] ?? ''}'),
      createdAt: DateTime.tryParse('${data['created_at'] ?? ''}'),
      updatedAt: DateTime.tryParse('${data['updated_at'] ?? ''}'),
      managerMessage: '${data['manager_message'] ?? ''}',
    );
  }
}

class NotificationPreferences {
  const NotificationPreferences({
    this.orderUpdates = true,
    this.applicationUpdates = true,
    this.newCollections = true,
    this.restocks = true,
    this.distributorOffers = true,
    this.companyNews = false,
  });

  final bool orderUpdates;
  final bool applicationUpdates;
  final bool newCollections;
  final bool restocks;
  final bool distributorOffers;
  final bool companyNews;

  factory NotificationPreferences.fromMap(Map<String, dynamic> data) {
    bool value(String key, bool fallback) =>
        data[key] is bool ? data[key] as bool : fallback;
    return NotificationPreferences(
      orderUpdates: value('order_updates', true),
      applicationUpdates: value('application_updates', true),
      newCollections: value('new_collections', true),
      restocks: value('restocks', true),
      distributorOffers: value('distributor_offers', true),
      companyNews: value('company_news', false),
    );
  }

  NotificationPreferences copyWith({
    bool? orderUpdates,
    bool? applicationUpdates,
    bool? newCollections,
    bool? restocks,
    bool? distributorOffers,
    bool? companyNews,
  }) {
    return NotificationPreferences(
      orderUpdates: orderUpdates ?? this.orderUpdates,
      applicationUpdates: applicationUpdates ?? this.applicationUpdates,
      newCollections: newCollections ?? this.newCollections,
      restocks: restocks ?? this.restocks,
      distributorOffers: distributorOffers ?? this.distributorOffers,
      companyNews: companyNews ?? this.companyNews,
    );
  }

  Map<String, dynamic> toFunctionJson() => {
    'order_updates': orderUpdates,
    'application_updates': applicationUpdates,
    'new_collections': newCollections,
    'restocks': restocks,
    'distributor_offers': distributorOffers,
    'company_news': companyNews,
  };
}

class AccountNotification {
  const AccountNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    required this.createdAt,
    required this.read,
    this.action = '',
    this.entityId = '',
  });

  final String id;
  final String type;
  final String title;
  final String message;
  final DateTime? createdAt;
  final bool read;
  final String action;
  final String entityId;

  factory AccountNotification.fromMap(
    Map<String, dynamic> data, {
    required String id,
  }) {
    return AccountNotification(
      id: id,
      type: '${data['type'] ?? 'general'}',
      title: '${data['title'] ?? ''}',
      message: '${data['message'] ?? ''}',
      createdAt: DateTime.tryParse('${data['created_at'] ?? ''}'),
      read: data['read'] == true,
      action: '${data['action'] ?? ''}',
      entityId: '${data['entity_id'] ?? ''}',
    );
  }
}
