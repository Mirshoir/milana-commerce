import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:milana_flutter/src/app.dart';
import 'package:milana_flutter/src/models/order.dart';
import 'package:milana_flutter/src/models/support_ticket.dart';
import 'package:milana_flutter/src/services/auth_service.dart';
import 'package:milana_flutter/src/services/cart_controller.dart';
import 'package:milana_flutter/src/services/cart_store.dart';
import 'package:milana_flutter/src/services/order_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('account reuses one order and support stream per revision', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final auth = AuthService(firebaseEnabled: false);
    await auth.signIn('buyer@example.test', 'strong-pass');
    final orders = _CountingOrderRepository();
    final cart = CartController(store: CartStore(), auth: auth);
    addTearDown(auth.dispose);
    addTearDown(orders.close);
    addTearDown(cart.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: AccountScreen(auth: auth, orders: orders, cart: cart),
      ),
    );
    await tester.pumpAndSettle();

    expect(orders.orderStreamCalls, 1);
    expect(orders.supportStreamCalls, 1);

    await auth.updateSavedProducts({'5287'});
    await tester.pumpAndSettle();

    expect(orders.orderStreamCalls, 1);
    expect(orders.supportStreamCalls, 1);
  });
}

class _CountingOrderRepository extends OrderRepository {
  _CountingOrderRepository() : super(firebaseEnabled: false);

  int orderStreamCalls = 0;
  int supportStreamCalls = 0;

  @override
  Stream<List<OrderSummary>> customerOrders(String customerId) {
    orderStreamCalls += 1;
    return Stream.value(const <OrderSummary>[]);
  }

  @override
  Stream<List<SupportTicketSummary>> customerSupportTickets(String customerId) {
    supportStreamCalls += 1;
    return Stream.value(const <SupportTicketSummary>[]);
  }
}
