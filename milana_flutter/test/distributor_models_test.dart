import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/distributor.dart';

void main() {
  test('distributor application request maps callable fields', () {
    const request = DistributorApplicationRequest(
      clientApplicationId: 'flutter_123456789',
      contactName: 'Aziza Karimova',
      companyName: 'Atlas Trade',
      phone: '+998901234567',
      email: 'sales@example.com',
      country: 'Uzbekistan',
      city: 'Tashkent',
      expectedMonthlyVolume: '5000_20000',
      salesChannels: 'Retail',
      requestedTerritories: 'Tashkent',
      message: 'New collection',
      legalAccepted: true,
      languageCode: 'uz',
    );

    final data = request.toFunctionJson();
    expect(data['client_application_id'], 'flutter_123456789');
    expect(data['expected_monthly_volume'], '5000_20000');
    expect(data['legal_accepted'], isTrue);
    expect(data['lang'], 'uz');
  });

  test('application and notification records tolerate server data', () {
    final application = DistributorApplication.fromMap({
      'number': 'MD-2026-ABC123',
      'company_name': 'Atlas Trade',
      'contact_name': 'Aziza',
      'country': 'Uzbekistan',
      'status': 'under_review',
      'created_at': '2026-08-08T10:00:00.000Z',
      'manager_message': 'Review in progress',
    }, id: 'application-id');
    expect(application.status, DistributorApplicationStatus.underReview);
    expect(application.createdAt, isNotNull);

    final notification = AccountNotification.fromMap({
      'type': 'application_status',
      'title': 'Application updated',
      'message': 'Review in progress',
      'read': false,
      'created_at': '2026-08-08T10:00:00.000Z',
    }, id: 'notification-id');
    expect(notification.read, isFalse);
    expect(notification.type, 'application_status');
  });

  test('website-parity application defaults legacy compatibility fields', () {
    const request = DistributorApplicationRequest(
      clientApplicationId: 'flutter_123456790',
      contactName: 'Aziza Karimova',
      companyName: 'Atlas Trade',
      phone: '+998901234567',
      email: 'sales@example.com',
      country: 'Uzbekistan',
      city: 'Tashkent',
      legalAccepted: true,
    );

    final data = request.toFunctionJson();
    expect(data['website'], '');
    expect(data['expected_monthly_volume'], '');
    expect(data['sales_channels'], '');
    expect(data['requested_territories'], '');
    expect(data['message'], '');
  });

  test('notification preferences default conservatively', () {
    final preferences = NotificationPreferences.fromMap(const {});
    expect(preferences.orderUpdates, isTrue);
    expect(preferences.applicationUpdates, isTrue);
    expect(preferences.companyNews, isFalse);
  });
}
