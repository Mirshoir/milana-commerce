import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:milana_flutter/src/app.dart';
import 'package:milana_flutter/src/models/cart_item.dart';
import 'package:milana_flutter/src/models/order.dart';
import 'package:milana_flutter/src/models/product.dart';
import 'package:milana_flutter/src/services/auth_service.dart';
import 'package:milana_flutter/src/services/cart_controller.dart';
import 'package:milana_flutter/src/services/cart_store.dart';
import 'package:milana_flutter/src/services/catalog_repository.dart';
import 'package:milana_flutter/src/services/order_repository.dart';

void main() {
  group('ProductSheet purchase experience', () {
    testWidgets('keeps the CTA visible and confirms a successful add', (
      tester,
    ) async {
      _useViewport(tester, const Size(390, 844));
      final addedItems = <CartItem>[];

      await tester.pumpWidget(
        _testApp(
          ProductSheet(
            product: _product,
            relatedProducts: const <Product>[],
            onAdd: (item) {
              addedItems.add(item);
              return true;
            },
            onOpenRelated: (_) {},
            onAddRelated: (_) {},
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      final initialCta = find.widgetWithText(FilledButton, r'$30.00 · savatga');
      expect(initialCta, findsOneWidget);
      expect(tester.getBottomRight(initialCta).dy, lessThanOrEqualTo(844));

      await tester.drag(find.byType(ListView).first, const Offset(0, -520));
      await tester.pump(const Duration(milliseconds: 250));

      expect(initialCta, findsOneWidget);
      expect(tester.getBottomRight(initialCta).dy, lessThanOrEqualTo(844));

      await tester.tap(initialCta);
      await tester.pump(const Duration(milliseconds: 50));

      expect(addedItems, hasLength(1));
      expect(addedItems.single.product.id, _product.id);
      expect(addedItems.single.unitType, packUnitType);
      expect(addedItems.single.quantity, 1);
      expect(find.text('Savatga qo‘shildi'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);

      await tester.pump(const Duration(seconds: 2));
      await tester.pump(const Duration(milliseconds: 1));

      expect(find.text(r'$30.00 · savatga'), findsOneWidget);
      expect(find.text('Savatga qo‘shildi'), findsNothing);
    });

    testWidgets(
      'exposes unit semantics and disables purchase when unavailable',
      (tester) async {
        _useViewport(tester, const Size(390, 844));
        final semantics = tester.ensureSemantics();
        var addCalls = 0;

        await tester.pumpWidget(
          _testApp(
            ProductSheet(
              product: _unavailableProduct,
              relatedProducts: const <Product>[],
              onAdd: (_) {
                addCalls += 1;
                return true;
              },
              onOpenRelated: (_) {},
              onAddRelated: (_) {},
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));

        expect(
          find.bySemanticsLabel(
            RegExp('Qadoq, 6 dona, har o‘lchamdan 1 tadan'),
          ),
          findsOneWidget,
        );
        expect(
          find.bySemanticsLabel(
            RegExp('Qop, 60 dona, har o‘lchamdan 10 tadan'),
          ),
          findsOneWidget,
        );

        final unavailableCta = find.widgetWithText(FilledButton, 'Mavjud emas');
        expect(unavailableCta, findsOneWidget);
        expect(tester.widget<FilledButton>(unavailableCta).onPressed, isNull);
        await tester.tap(unavailableCta, warnIfMissed: false);
        await tester.pump(const Duration(milliseconds: 50));
        expect(addCalls, 0);
        semantics.dispose();
      },
    );
  });

  group('CatalogLoadingView', () {
    testWidgets('announces loading and uses a two-column phone skeleton', (
      tester,
    ) async {
      _useViewport(tester, const Size(390, 844));
      final semantics = tester.ensureSemantics();

      await tester.pumpWidget(_testApp(const CatalogLoadingView()));
      await tester.pump(const Duration(milliseconds: 50));

      final loading = find.bySemanticsLabel('Katalog yuklanmoqda');
      expect(loading, findsOneWidget);
      expect(
        tester.getSemantics(loading),
        isSemantics(label: 'Katalog yuklanmoqda', isLiveRegion: true),
      );
      _expectSkeletonGrid(tester, columns: 2, itemCount: 4);
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });

    testWidgets('uses a four-column skeleton on a desktop viewport', (
      tester,
    ) async {
      _useViewport(tester, const Size(1280, 900));

      await tester.pumpWidget(_testApp(const CatalogLoadingView()));
      await tester.pump(const Duration(milliseconds: 50));

      _expectSkeletonGrid(tester, columns: 4, itemCount: 8);
      expect(find.bySemanticsLabel('Katalog yuklanmoqda'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('AppShell shows branded Uzbek navigation and changes tabs', (
    tester,
  ) async {
    _useViewport(tester, const Size(900, 900));
    final catalog = _MemoryCatalogRepository(
      MockClient((_) async => http.Response('[]', 200)),
    );
    final orders = OrderRepository(
      firebaseEnabled: false,
      baseUrl: 'http://127.0.0.1:1',
      client: MockClient((_) async => http.Response('[]', 200)),
    );
    final auth = AuthService(firebaseEnabled: false);
    final cart = CartController(store: _MemoryCartStore(), auth: auth);
    addTearDown(() {
      cart.dispose();
      auth.dispose();
      orders.close();
      catalog.close();
    });

    await tester.pumpWidget(
      MaterialApp(
        home: AppShell(
          catalog: catalog,
          orders: orders,
          auth: auth,
          cart: cart,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    for (final label in const [
      'Asosiy',
      'Katalog',
      'Savat',
      'Yordam',
      'Akkaunt',
    ]) {
      expect(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text(label),
        ),
        findsOneWidget,
      );
    }
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      0,
    );

    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Katalog'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 250));

    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      1,
    );
    expect(find.byType(CatalogScreen), findsOneWidget);
    expect(find.text('MILANA'), findsOneWidget);
    expect(find.text('PREMIUM'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 50));
  });

  testWidgets('empty cart remains usable at 200 percent text in landscape', (
    tester,
  ) async {
    _useViewport(tester, const Size(640, 360));
    final orders = OrderRepository(
      firebaseEnabled: false,
      client: MockClient((_) async => http.Response('[]', 200)),
    );
    final auth = AuthService(firebaseEnabled: false);
    final cart = CartController(store: _MemoryCartStore(), auth: auth);
    addTearDown(() {
      cart.dispose();
      auth.dispose();
      orders.close();
    });

    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: Scaffold(
          body: CartScreen(
            cart: cart,
            orders: orders,
            auth: auth,
            onOpenCatalog: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Savat bo‘sh'), findsOneWidget);
    expect(find.text('Katalogga o‘tish'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('payment form scrolls above a large keyboard inset', (
    tester,
  ) async {
    _useViewport(tester, const Size(320, 568));
    final orders = OrderRepository(firebaseEnabled: false);
    addTearDown(orders.close);
    const order = OrderSummary(
      provenance: BackendProvenance.website,
      id: '91',
      number: 'MP-2026-0091',
      total: 315,
      status: 'new',
      paymentStatus: 'pending',
      paymentMethod: 'bank',
      paymentLabel: 'Bank o‘tkazmasi',
      paymentInstructions: '',
      createdAt: null,
      itemCount: 1,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(320, 568),
            textScaler: TextScaler.linear(2),
            viewInsets: EdgeInsets.only(bottom: 240),
          ),
          child: Scaffold(
            body: PaymentSubmissionSheet(order: order, orders: orders),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
    await tester.ensureVisible(find.text('Yuborish'));
    await tester.pump();

    expect(find.text('Yuborish'), findsOneWidget);
    expect(find.byType(SingleChildScrollView), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('catalog filter chips keep accessible targets at large text', (
    tester,
  ) async {
    _useViewport(tester, const Size(320, 568));
    final catalog = _MemoryCatalogRepository(
      MockClient((_) async => http.Response('[]', 200)),
      products: const [_product],
    );
    final auth = AuthService(firebaseEnabled: false);
    final cart = CartController(store: _MemoryCartStore(), auth: auth);
    addTearDown(() {
      cart.dispose();
      auth.dispose();
      catalog.close();
    });

    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: Scaffold(
          body: CatalogScreen(
            catalog: catalog,
            cart: cart,
            auth: auth,
            launchRequestId: 0,
            launchMode: CatalogLaunchMode.browse,
            requestedGender: 'all',
            requestedCategory: 'all',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, -700));
    await tester.pump();
    await tester.tap(find.text('FILTERLAR'));
    await tester.pump();

    expect(find.byType(ChoiceChip), findsWidgets);
    expect(
      tester.getSize(find.byType(ChoiceChip).first).height,
      greaterThanOrEqualTo(48),
    );
    expect(tester.takeException(), isNull);
  });
}

const _product = Product(
  id: 'widget-product',
  slug: 'widget-product',
  name: 'Premium uy kiyimi',
  gender: 'women',
  category: 'homewear',
  price: 5,
  sizes: ['44', '46', '48', '50', '52', '54'],
  images: [],
  modelNo: 'MP-101',
  fabric: 'Suprem',
  description: 'Kundalik ulgurji kolleksiya.',
  availableQop: 4,
  orderUnits: [
    ProductOrderUnit(
      unitType: packUnitType,
      label: 'Qadoq',
      pieces: 6,
      perSize: 1,
    ),
    ProductOrderUnit(
      unitType: bagUnitType,
      label: 'Qop',
      pieces: 60,
      perSize: 10,
    ),
  ],
);

const _unavailableProduct = Product(
  id: 'unavailable-widget-product',
  slug: 'unavailable-widget-product',
  name: 'Mavjud emas model',
  gender: 'women',
  category: 'homewear',
  price: 5,
  sizes: ['44', '46', '48', '50', '52', '54'],
  images: [],
  modelNo: 'MP-000',
  availableQop: 0,
  inStock: false,
  canOrderWholesale: false,
  orderUnits: [
    ProductOrderUnit(
      unitType: packUnitType,
      label: 'Qadoq',
      pieces: 6,
      perSize: 1,
    ),
    ProductOrderUnit(
      unitType: bagUnitType,
      label: 'Qop',
      pieces: 60,
      perSize: 10,
    ),
  ],
);

Widget _testApp(Widget child) {
  return MaterialApp(home: Scaffold(body: child));
}

void _useViewport(WidgetTester tester, Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

void _expectSkeletonGrid(
  WidgetTester tester, {
  required int columns,
  required int itemCount,
}) {
  final grid = tester.widget<GridView>(find.byType(GridView));
  final delegate =
      grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount;
  final children = grid.childrenDelegate as SliverChildBuilderDelegate;

  expect(delegate.crossAxisCount, columns);
  expect(children.childCount, itemCount);
}

class _MemoryCatalogRepository extends CatalogRepository {
  _MemoryCatalogRepository(
    http.Client client, {
    this.products = const <Product>[],
  }) : super(firebaseEnabled: false, client: client);

  final List<Product> products;

  @override
  Future<List<Product>> loadProducts() async => products;
}

class _MemoryCartStore extends CartStore {
  List<CartItem> items = const <CartItem>[];

  @override
  Future<List<CartItem>> load({String? scope}) async =>
      List<CartItem>.of(items);

  @override
  Future<void> save(List<CartItem> items, {String? scope}) async {
    this.items = List<CartItem>.of(items);
  }

  @override
  Future<void> clear({String? scope}) async {
    items = const <CartItem>[];
  }
}
