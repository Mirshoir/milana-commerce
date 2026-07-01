import '../models/cart_item.dart';
import '../models/order.dart';
import '../models/support_ticket.dart';

class AccountOverview {
  const AccountOverview({
    required this.totalOrders,
    required this.activeOrders,
    required this.pendingPaymentOrders,
    required this.totalQop,
    required this.activeQop,
    required this.activeClothes,
    required this.confirmedSpend,
    required this.openSupportTickets,
    this.latestOrderAt,
  });

  final int totalOrders;
  final int activeOrders;
  final int pendingPaymentOrders;
  final int totalQop;
  final int activeQop;
  final int activeClothes;
  final double confirmedSpend;
  final int openSupportTickets;
  final DateTime? latestOrderAt;

  bool get hasActivity => totalOrders > 0 || openSupportTickets > 0;
}

AccountOverview buildAccountOverview({
  required List<OrderSummary> orders,
  required List<SupportTicketSummary> supportTickets,
}) {
  final activeOrders = orders.where((order) => !isClosedOrder(order)).toList();
  final totalQop = orders
      .where((order) => order.status != 'cancelled' && order.status != 'failed')
      .fold<int>(0, (sum, order) => sum + order.itemCount);
  final activeQop = activeOrders.fold<int>(
    0,
    (sum, order) => sum + order.itemCount,
  );
  final paidSpend = orders
      .where((order) => order.paymentStatus == 'paid')
      .fold<double>(0, (sum, order) => sum + order.total);
  final latest = orders
      .map((order) => order.createdAt)
      .whereType<DateTime>()
      .fold<DateTime?>(null, (latest, date) {
        if (latest == null || date.isAfter(latest)) return date;
        return latest;
      });

  return AccountOverview(
    totalOrders: orders.length,
    activeOrders: activeOrders.length,
    pendingPaymentOrders: orders
        .where(
          (order) => const {
            'pending',
            'waiting_for_customer',
            'submitted',
          }.contains(order.paymentStatus),
        )
        .length,
    totalQop: totalQop,
    activeQop: activeQop,
    activeClothes: activeQop * bagSize,
    confirmedSpend: double.parse(paidSpend.toStringAsFixed(2)),
    openSupportTickets: supportTickets
        .where(
          (ticket) => !const {'resolved', 'closed'}.contains(ticket.status),
        )
        .length,
    latestOrderAt: latest,
  );
}

bool isClosedOrder(OrderSummary order) {
  return const {'delivered', 'cancelled', 'failed'}.contains(order.status);
}
