import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/models/order.dart';
import 'package:milana_flutter/src/models/support_ticket.dart';
import 'package:milana_flutter/src/services/account_overview.dart';

void main() {
  OrderSummary order({
    String status = 'new',
    String paymentStatus = 'pending',
    int itemCount = 1,
    double total = 270,
    DateTime? createdAt,
  }) {
    return OrderSummary(
      id: 'order-$status-$paymentStatus',
      number: 'MP-2026-ABCD',
      total: total,
      status: status,
      paymentStatus: paymentStatus,
      paymentMethod: 'payme',
      paymentLabel: 'Payme',
      paymentInstructions: 'Payme link',
      createdAt: createdAt,
      itemCount: itemCount,
    );
  }

  SupportTicketSummary ticket(String status) {
    return SupportTicketSummary(
      number: 'MS-2026-ABCD',
      topic: 'payment',
      message: 'To‘lov haqida',
      status: status,
      createdAt: DateTime.utc(2026, 6, 27),
    );
  }

  test('buildAccountOverview summarizes customer activity', () {
    final overview = buildAccountOverview(
      orders: [
        order(
          status: 'new',
          paymentStatus: 'pending',
          itemCount: 2,
          total: 540,
          createdAt: DateTime.utc(2026, 6, 27),
        ),
        order(
          status: 'shipped',
          paymentStatus: 'paid',
          itemCount: 3,
          total: 810,
          createdAt: DateTime.utc(2026, 6, 28),
        ),
        order(
          status: 'delivered',
          paymentStatus: 'paid',
          itemCount: 1,
          total: 270,
          createdAt: DateTime.utc(2026, 6, 20),
        ),
        order(status: 'cancelled', paymentStatus: 'cancelled', itemCount: 5),
      ],
      supportTickets: [ticket('new'), ticket('resolved'), ticket('open')],
    );

    expect(overview.totalOrders, 4);
    expect(overview.activeOrders, 2);
    expect(overview.pendingPaymentOrders, 1);
    expect(overview.totalQop, 6);
    expect(overview.activeQop, 5);
    expect(overview.activeClothes, 300);
    expect(overview.confirmedSpend, 1080);
    expect(overview.openSupportTickets, 2);
    expect(overview.latestOrderAt, DateTime.utc(2026, 6, 28));
    expect(overview.hasActivity, true);
  });

  test('isClosedOrder recognizes terminal order states', () {
    expect(isClosedOrder(order(status: 'delivered')), true);
    expect(isClosedOrder(order(status: 'cancelled')), true);
    expect(isClosedOrder(order(status: 'failed')), true);
    expect(isClosedOrder(order(status: 'shipped')), false);
  });
}
