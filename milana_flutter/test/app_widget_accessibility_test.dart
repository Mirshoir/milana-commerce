import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:milana_flutter/src/app.dart';
import 'package:milana_flutter/src/localization/app_localization.dart';
import 'package:milana_flutter/src/models/cart_item.dart';
import 'package:milana_flutter/src/models/checkout_manager.dart';
import 'package:milana_flutter/src/models/order.dart';
import 'package:milana_flutter/src/models/product.dart';
import 'package:milana_flutter/src/services/auth_service.dart';
import 'package:milana_flutter/src/services/assistant_service.dart';
import 'package:milana_flutter/src/services/analytics_service.dart';
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

      final initialCta = find.widgetWithText(
        FilledButton,
        r'Добавить в корзину · $30.00',
      );
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
      expect(find.text('Добавлено в корзину'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);

      await tester.pump(const Duration(seconds: 2));
      await tester.pump(const Duration(milliseconds: 1));

      expect(find.text(r'Добавить в корзину · $30.00'), findsOneWidget);
      expect(find.text('Добавлено в корзину'), findsNothing);
    });

    testWidgets('exposes unit semantics and disables purchase when unavailable', (
      tester,
    ) async {
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
          RegExp(
            '${orderUnitLabel(packUnitType, languageCode: 'ru')}, 6 шт., по 1 шт.',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            '${orderUnitLabel(bagUnitType, languageCode: 'ru')}, 60 шт., по 10 шт.',
          ),
        ),
        findsOneWidget,
      );

      final unavailableCta = find.widgetWithText(FilledButton, 'Нет в наличии');
      expect(unavailableCta, findsOneWidget);
      expect(tester.widget<FilledButton>(unavailableCta).onPressed, isNull);
      await tester.tap(unavailableCta, warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 50));
      expect(addCalls, 0);
      semantics.dispose();
    });
  });

  group('CatalogLoadingView', () {
    testWidgets('announces loading and uses a two-column phone skeleton', (
      tester,
    ) async {
      _useViewport(tester, const Size(390, 844));
      final semantics = tester.ensureSemantics();

      await tester.pumpWidget(_testApp(const CatalogLoadingView()));
      await tester.pump(const Duration(milliseconds: 50));

      final loading = find.bySemanticsLabel('Загрузка каталога');
      expect(loading, findsOneWidget);
      expect(
        tester.getSemantics(loading),
        isSemantics(label: 'Загрузка каталога', isLiveRegion: true),
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
      expect(find.bySemanticsLabel('Загрузка каталога'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('AI responses expose a working report flow', (tester) async {
    _useViewport(tester, const Size(390, 844));
    final reports = <Map<String, String>>[];
    final language = LanguageController(languageCode: 'en');

    await tester.pumpWidget(
      AppLanguageScope(
        notifier: language,
        child: MaterialApp(
          home: Scaffold(
            body: AssistantSheet(
              assistant: AssistantService(baseUrl: 'https://example.test'),
              onProduct: (_) {},
              onAdd: (_) {},
              onContactSales: () {},
              onReport:
                  ({
                    required response,
                    required reasonCode,
                    required comment,
                  }) async {
                    reports.add({
                      'response': response,
                      'reason': reasonCode,
                      'comment': comment,
                    });
                    return 'MS-TEST';
                  },
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.text('Report response'));
    await tester.pumpAndSettle();
    expect(find.text('Report AI response'), findsOneWidget);

    await tester.tap(find.text('Offensive or unsafe'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Inaccurate or misleading').last);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Additional comment (optional)'),
      'The answer has the wrong delivery price.',
    );
    await tester.tap(find.text('Submit report'));
    await tester.pumpAndSettle();

    expect(reports, hasLength(1));
    expect(reports.single['reason'], 'inaccurate_or_misleading');
    expect(reports.single['response'], contains('Ask about model'));
    expect(
      reports.single['comment'],
      'The answer has the wrong delivery price.',
    );
    expect(find.text('Report submitted. Thank you.'), findsOneWidget);
  });

  testWidgets('AppShell shows branded Uzbek navigation and changes tabs', (
    tester,
  ) async {
    _useViewport(tester, const Size(390, 844));
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
    final languageController = LanguageController(languageCode: 'uz');

    await tester.pumpWidget(
      AppLanguageScope(
        notifier: languageController,
        child: MaterialApp(
          home: AppShell(
            catalog: catalog,
            orders: orders,
            auth: auth,
            cart: cart,
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    for (final label in const [
      'Asosiy',
      'Katalog',
      'Savat',
      'Hamkor',
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
    final homeSafeArea = find.descendant(
      of: find.byType(HomeScreen),
      matching: find.byType(SafeArea),
    );
    expect(homeSafeArea, findsOneWidget);
    expect(tester.widget<SafeArea>(homeSafeArea).top, isTrue);
    expect(find.byIcon(Icons.business_center_outlined), findsOneWidget);

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

  testWidgets('account deletion stays inside collapsed security settings', (
    tester,
  ) async {
    _useViewport(tester, const Size(390, 844));
    var deleteCalls = 0;

    await tester.pumpWidget(
      _testApp(
        ListView(
          padding: const EdgeInsets.all(16),
          children: [
            AccountDashboardCard(
              customer: const Customer(
                id: 'customer-1',
                email: 'buyer@example.test',
                name: 'Buyer',
                phone: '+998 90 123 45 67',
              ),
              onEdit: () {},
              onSignOut: () {},
            ),
            const SizedBox(height: 16),
            AccountSecurityPanel(onDelete: () => deleteCalls += 1),
          ],
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Удалить аккаунт'), findsNothing);
    expect(find.text('Аккаунт и безопасность'), findsOneWidget);

    await tester.tap(find.text('Аккаунт и безопасность'));
    await tester.pumpAndSettle();
    expect(find.text('Удалить аккаунт'), findsOneWidget);

    await tester.tap(find.text('Удалить аккаунт'));
    await tester.pump();
    expect(deleteCalls, 1);
  });

  testWidgets('home header wordmark fits beside actions at phone width', (
    tester,
  ) async {
    _useViewport(tester, const Size(375, 844));
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

    expect(find.text('MILANA PREMIUM'), findsOneWidget);
    expect(find.byType(FittedBox), findsWidgets);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 50));
  });

  testWidgets('MilanaApp falls back to the shell for unknown routes', (
    tester,
  ) async {
    final catalog = _MemoryCatalogRepository(
      MockClient((_) async => http.Response('[]', 200)),
    );
    final orders = OrderRepository(
      firebaseEnabled: false,
      baseUrl: 'http://127.0.0.1:1',
      client: MockClient((_) async => http.Response('[]', 200)),
    );
    final auth = AuthService(firebaseEnabled: false);
    final analytics = AnalyticsService(firebaseEnabled: false);

    await tester.pumpWidget(
      MilanaApp(
        catalog: catalog,
        orders: orders,
        auth: auth,
        analytics: analytics,
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    tester.state<NavigatorState>(find.byType(Navigator)).pushNamed('/catalog');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(tester.takeException(), isNull);
    expect(find.byType(AppShell), findsWidgets);

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

    expect(find.text('Корзина пуста'), findsOneWidget);
    expect(find.text('Перейти в каталог'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('checkout country limits the suggested managers', (tester) async {
    _useViewport(tester, const Size(700, 844));
    const item = CartItem(product: _product, unitType: packUnitType);
    final store = _MemoryCartStore()..items = const <CartItem>[item];
    final auth = AuthService(firebaseEnabled: false, enableLocalAuth: true);
    final cart = CartController(store: store, auth: auth);
    final orders = _CheckoutManagersOrderRepository();
    addTearDown(() {
      cart.dispose();
      auth.dispose();
      orders.close();
    });

    await tester.pumpWidget(
      AppLanguageScope(
        notifier: LanguageController(languageCode: 'uz'),
        child: MaterialApp(
          home: Scaffold(
            body: CartScreen(
              cart: cart,
              orders: orders,
              auth: auth,
              onOpenCatalog: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    var country = find.byKey(const ValueKey('checkout-country--none'));
    await tester.ensureVisible(country.first);
    await tester.tap(country.first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('O‘zbekiston').last);
    await tester.pumpAndSettle();

    var managerField = tester.widget<DropdownButton<int>>(
      find.byType(DropdownButton<int>),
    );
    expect(managerField.items!.map((item) => (item.child as Text).data), [
      'Marjona',
      'Shaxrizoda',
    ]);

    country = find.byKey(const ValueKey('checkout-country--uzbekistan'));
    await tester.ensureVisible(country.first);
    await tester.tap(country.first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Boshqa mamlakat').last);
    await tester.pumpAndSettle();

    managerField = tester.widget<DropdownButton<int>>(
      find.byType(DropdownButton<int>),
    );
    expect(managerField.items!.map((item) => (item.child as Text).data), [
      'Jasurbek',
      'Oybek',
      'Muhammadma’ruf',
    ]);
  });

  testWidgets('cart removal message expires even when undo is available', (
    tester,
  ) async {
    _useViewport(tester, const Size(700, 844));
    const item = CartItem(product: _product, unitType: packUnitType);
    final store = _MemoryCartStore()..items = const <CartItem>[item];
    final auth = AuthService(firebaseEnabled: false);
    final cart = CartController(store: store, auth: auth);
    addTearDown(() {
      cart.dispose();
      auth.dispose();
    });

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CartLine(item: item, cart: cart),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();

    final snackBar = tester.widget<SnackBar>(find.byType(SnackBar));
    expect(snackBar.persist, isFalse);
    expect(snackBar.duration, const Duration(seconds: 4));

    await tester.pump(const Duration(seconds: 4, milliseconds: 1));
    await tester.pumpAndSettle();

    expect(find.byType(SnackBar), findsNothing);
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
    await tester.tap(find.text('Показать фильтры'));
    await tester.pump();

    expect(find.byType(ChoiceChip), findsWidgets);
    expect(
      tester.getSize(find.byType(ChoiceChip).first).height,
      greaterThanOrEqualTo(48),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('product image decoding preserves the source aspect ratio', (
    tester,
  ) async {
    _useViewport(tester, const Size(390, 844));
    await tester.pumpWidget(
      const MaterialApp(
        home: SizedBox(
          width: 240,
          height: 240,
          child: ProductImage(
            product: Product(
              id: 'portrait-image',
              slug: 'portrait-image',
              name: 'Portrait image',
              gender: 'women',
              category: 'pajamas',
              price: 5,
              sizes: ['44'],
              images: ['https://example.test/portrait.webp'],
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final image = tester.widget<CachedNetworkImage>(
      find.byType(CachedNetworkImage),
    );
    expect(image.memCacheWidth, isNotNull);
    expect(image.memCacheHeight, isNull);
    expect(image.maxWidthDiskCache, 1200);
    expect(image.maxHeightDiskCache, isNull);
  });

  testWidgets('full-screen gallery keeps an undistorted foreground', (
    tester,
  ) async {
    _useViewport(tester, const Size(390, 844));
    await tester.pumpWidget(
      const MaterialApp(
        home: ProductGalleryDialog(
          product: Product(
            id: 'gallery-image',
            slug: 'gallery-image',
            name: 'Gallery image',
            gender: 'women',
            category: 'pajamas',
            price: 5,
            sizes: ['44'],
            images: ['https://example.test/portrait.webp'],
          ),
          images: ['https://example.test/portrait.webp'],
          initialIndex: 0,
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(ImageFiltered), findsOneWidget);
    final images = tester
        .widgetList<ProductImage>(find.byType(ProductImage))
        .toList();
    expect(
      images.map((image) => image.fit),
      containsAll([BoxFit.cover, BoxFit.contain]),
    );
  });

  testWidgets('home category images preserve the full model framing', (
    tester,
  ) async {
    _useViewport(tester, const Size(390, 844));
    await tester.pumpWidget(
      _testApp(
        SingleChildScrollView(
          child: HomeCategoryTile(
            title: 'Ayollar',
            subtitle: 'Xalat va pijama',
            count: 691,
            product: _product,
            onTap: () {},
          ),
        ),
      ),
    );

    expect(
      tester.widget<ProductImage>(find.byType(ProductImage)).fit,
      BoxFit.contain,
    );
  });

  testWidgets('rounded category thumbnails fill the circle from the top', (
    tester,
  ) async {
    _useViewport(tester, const Size(390, 844));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CatalogCategoryRail(
            products: const [
              Product(
                id: 'thumbnail',
                slug: 'thumbnail',
                name: 'Thumbnail model',
                gender: 'women',
                category: 'pajamas',
                price: 8,
                sizes: ['44'],
                images: ['https://example.test/model.jpg'],
              ),
            ],
            activeGender: 'all',
            activeCategory: 'all',
            onSelect: (_) {},
          ),
        ),
      ),
    );
    await tester.pump();

    final thumbnail = tester.widget<ProductImage>(
      find.byType(ProductImage).first,
    );
    expect(thumbnail.fit, BoxFit.cover);
    expect(thumbnail.alignment, Alignment.topCenter);
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

class _CheckoutManagersOrderRepository extends OrderRepository {
  _CheckoutManagersOrderRepository() : super(firebaseEnabled: false);

  @override
  Future<List<CheckoutManager>> loadManagers() async => const [
    CheckoutManager(id: 31, name: 'Marjona'),
    CheckoutManager(id: 6, name: 'Shaxrizoda'),
    CheckoutManager(id: 3, name: 'Jasurbek'),
    CheckoutManager(id: 2, name: 'Oybek'),
    CheckoutManager(id: 4, name: 'Muhammadma’ruf'),
    CheckoutManager(id: 1, name: 'General manager'),
  ];
}
