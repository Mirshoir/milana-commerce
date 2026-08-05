import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import 'models/cart_item.dart';
import 'models/checkout_manager.dart';
import 'models/order.dart';
import 'models/product.dart';
import 'models/support_ticket.dart';
import 'services/assistant_service.dart';
import 'services/auth_service.dart';
import 'services/account_overview.dart';
import 'services/auth_forms.dart';
import 'services/cart_controller.dart';
import 'services/catalog_filter.dart';
import 'services/catalog_paging.dart';
import 'services/catalog_repository.dart';
import 'services/checkout_recovery_store.dart';
import 'services/favorites_store.dart';
import 'services/legal_links.dart';
import 'services/order_repository.dart';
import 'services/order_presentation.dart';
import 'services/product_presentation.dart';
import 'services/recent_products_store.dart';
import 'services/support_knowledge.dart';

final money = NumberFormat.currency(locale: 'en_US', symbol: r'$');
final shortDate = DateFormat('dd MMM yyyy', 'uz');
final shortDateTime = DateFormat('dd MMM HH:mm', 'uz');
const firebaseAssetBaseUrl = String.fromEnvironment('FIREBASE_ASSET_BASE_URL');
const salesPhone = '+998501551010';
const milanaBurgundy = Color(0xff171717);
const milanaInk = Color(0xff171717);
const milanaIvory = Color(0xffffffff);
const milanaBlush = Color(0xfff7f5f3);
const milanaSand = Color(0xffeeeae5);
const milanaMoss = Color(0xff566246);
const milanaMuted = Color(0xff666666);

String resolveImageUrl(String image) {
  final absolute = Uri.tryParse(image);
  if (absolute != null && absolute.hasScheme) {
    if (absolute.scheme == 'https') return absolute.toString();
    if (!kReleaseMode &&
        absolute.scheme == 'http' &&
        (absolute.host == '127.0.0.1' || absolute.host == 'localhost')) {
      return absolute.toString();
    }
    return '';
  }
  if (image.startsWith('/') && firebaseAssetBaseUrl.isNotEmpty) {
    return firebaseAssetBaseUrl.replaceAll(RegExp(r'/+$'), '') + image;
  }
  if (image.startsWith('/')) return Uri.base.resolve(image).toString();
  return image;
}

int packageUiLimit(Product product, {String unitType = bagUnitType}) {
  if (!product.active || !product.canOrderWholesale) return 0;
  final available = product.availableQop;
  if (available == null) return 20;
  final pieces = product.orderUnitFor(unitType).pieces;
  return (available * bagSize / pieces).floor().clamp(0, 20).toInt();
}

int qopUiLimit(Product product) => packageUiLimit(product);

bool isOutOfQop(Product product) => !product.canOrderWholesale;

String qopAvailabilityLabel(Product product) {
  if (product.preorder) return 'Oldindan buyurtma';
  if (!product.canOrderWholesale) return 'Mavjud emas';
  if (product.availableQop == null) return 'Menejer tasdiqlaydi';
  final stock = product.availableQop!;
  final label = stock == stock.roundToDouble()
      ? stock.toInt().toString()
      : stock.toStringAsFixed(1);
  return '$label qop';
}

String productTagLabel(Product product) => switch (product.tag) {
  'new' => 'Yangi',
  'bestseller' => 'Bestseller',
  'sale' => 'Chegirma',
  _ => '',
};

String paymentMethodLabel(String method) {
  switch (method) {
    case 'bank':
      return 'Bank o‘tkazmasi';
    case 'click':
      return 'Click';
    case 'payme':
      return 'Payme';
    case 'card':
      return 'Karta';
    case 'cash':
      return 'Naqd / kelishuv';
    default:
      return 'Menejer orqali';
  }
}

List<Product> relatedProductsFor(Product product, List<Product> products) {
  int score(Product candidate) {
    var value = 0;
    if (candidate.gender == product.gender) value += 6;
    if (candidate.category == product.category) value += 8;
    if (candidate.fabric.isNotEmpty && candidate.fabric == product.fabric) {
      value += 4;
    }
    if (candidate.price > 0 && product.price > 0) {
      final diff = (candidate.price - product.price).abs();
      if (diff <= .5) value += 3;
      if (diff <= 1) value += 2;
    }
    final sharedSizes = candidate.sizes.toSet().intersection(
      product.sizes.toSet(),
    );
    value += sharedSizes.length.clamp(0, 4);
    return value;
  }

  final ranked =
      products
          .where((candidate) => candidate.id != product.id && candidate.active)
          .map((candidate) => (product: candidate, score: score(candidate)))
          .where((row) => row.score > 0)
          .toList()
        ..sort((a, b) {
          final byScore = b.score.compareTo(a.score);
          if (byScore != 0) return byScore;
          return a.product.name.compareTo(b.product.name);
        });

  return ranked.map((row) => row.product).take(8).toList();
}

String paymentInstructions(String method) {
  switch (method) {
    case 'bank':
      return 'Bank rekvizitlari menejer tomonidan yuboriladi. To‘lovdan oldin $salesPhone bilan tasdiqlang.';
    case 'click':
      return 'Click to‘lovi uchun hisob/link menejer tomonidan yuboriladi. To‘lovdan oldin $salesPhone bilan tasdiqlang.';
    case 'payme':
      return 'Payme to‘lovi uchun hisob/link menejer tomonidan yuboriladi. To‘lovdan oldin $salesPhone bilan tasdiqlang.';
    case 'card':
      return 'Karta raqami menejer tomonidan yuboriladi. To‘lovdan oldin $salesPhone bilan tasdiqlang.';
    case 'cash':
      return 'Naqd to‘lov yetkazib berish yoki olib ketish shartiga qarab $salesPhone bilan kelishiladi.';
    default:
      return 'Menejerimiz $salesPhone orqali narx, mavjudlik va to‘lovni tasdiqlaydi.';
  }
}

String paymentStatusLabel(String status) {
  switch (status) {
    case 'paid':
      return 'to‘langan';
    case 'submitted':
      return 'tekshiruvda';
    case 'waiting_for_customer':
      return 'mijozdan kutilmoqda';
    case 'failed':
      return 'muvaffaqiyatsiz';
    case 'cancelled':
      return 'bekor qilingan';
    case 'refunded':
      return 'qaytarilgan';
    default:
      return 'kutilmoqda';
  }
}

String orderStatusLabel(String status) {
  switch (status) {
    case 'confirmed':
      return 'tasdiqlandi';
    case 'packed':
      return 'tayyorlanmoqda';
    case 'shipped':
      return 'yuborildi';
    case 'delivered':
      return 'yetkazildi';
    case 'failed':
      return 'muvaffaqiyatsiz';
    case 'cancelled':
      return 'bekor qilingan';
    default:
      return 'yangi';
  }
}

Color statusColor(String status) {
  switch (status) {
    case 'paid':
    case 'confirmed':
    case 'delivered':
    case 'resolved':
      return const Color(0xff2f7d55);
    case 'submitted':
    case 'packed':
    case 'shipped':
    case 'open':
    case 'waiting_for_customer':
      return milanaMoss;
    case 'failed':
    case 'cancelled':
    case 'closed':
      return const Color(0xffa23b3b);
    default:
      return milanaBurgundy;
  }
}

int tabIndexFromFragment(String fragment) {
  switch (fragment.trim().toLowerCase()) {
    case 'home':
    case 'bosh':
      return 0;
    case 'catalog':
    case 'shop':
    case 'katalog':
    case 'do‘kon':
    case "do'kon":
      return 1;
    case 'cart':
    case 'savat':
      return 2;
    case 'support':
    case 'help':
    case 'yordam':
      return 3;
    case 'account':
    case 'profile':
    case 'akkaunt':
      return 4;
    default:
      return 0;
  }
}

int tabIndexFromLaunchUri(Uri uri) {
  return tabIndexFromFragment(
    uri.queryParameters['tab'] ?? uri.queryParameters['view'] ?? uri.fragment,
  );
}

class MilanaApp extends StatefulWidget {
  const MilanaApp({
    super.key,
    required this.catalog,
    required this.orders,
    required this.auth,
  });

  final CatalogRepository catalog;
  final OrderRepository orders;
  final AuthService auth;

  @override
  State<MilanaApp> createState() => _MilanaAppState();
}

class _MilanaAppState extends State<MilanaApp> {
  late final CartController cart = CartController(auth: widget.auth);

  @override
  void dispose() {
    cart.dispose();
    widget.catalog.close();
    widget.orders.close();
    widget.auth.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Milana Premium',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: milanaBurgundy,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: milanaIvory,
        appBarTheme: const AppBarTheme(
          backgroundColor: milanaIvory,
          foregroundColor: milanaInk,
          centerTitle: false,
          elevation: 0,
          surfaceTintColor: Colors.transparent,
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          shape: const RoundedRectangleBorder(),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
          filled: true,
          fillColor: Colors.white,
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: milanaInk,
            foregroundColor: Colors.white,
            shape: const RoundedRectangleBorder(),
            minimumSize: const Size(48, 48),
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: milanaBlush,
          indicatorColor: milanaBlush,
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) => TextStyle(
              color: states.contains(WidgetState.selected)
                  ? milanaBurgundy
                  : milanaInk.withValues(alpha: .72),
              fontWeight: states.contains(WidgetState.selected)
                  ? FontWeight.w700
                  : FontWeight.w500,
            ),
          ),
        ),
        chipTheme: ChipThemeData(
          backgroundColor: Colors.white,
          selectedColor: milanaBurgundy,
          labelStyle: const TextStyle(color: milanaInk),
          secondaryLabelStyle: const TextStyle(color: Colors.white),
          shape: const RoundedRectangleBorder(),
          side: BorderSide(color: milanaInk.withValues(alpha: .12)),
        ),
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: milanaInk,
          contentTextStyle: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
        ),
        bottomSheetTheme: const BottomSheetThemeData(
          backgroundColor: milanaIvory,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
        ),
      ),
      home: AppShell(
        catalog: widget.catalog,
        orders: widget.orders,
        auth: widget.auth,
        cart: cart,
      ),
    );
  }
}

class AppShell extends StatefulWidget {
  const AppShell({
    super.key,
    required this.catalog,
    required this.orders,
    required this.auth,
    required this.cart,
  });

  final CatalogRepository catalog;
  final OrderRepository orders;
  final AuthService auth;
  final CartController cart;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  late int index;
  late final AssistantService assistant = AssistantService();
  int catalogRequestId = 0;
  CatalogLaunchMode catalogLaunchMode = CatalogLaunchMode.browse;
  String catalogRequestedGender = 'all';
  String catalogRequestedCategory = 'all';
  final visitedTabs = <int>{0};

  @override
  void initState() {
    super.initState();
    index = tabIndexFromLaunchUri(Uri.base);
    visitedTabs.add(index);
  }

  @override
  void dispose() {
    assistant.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomeScreen(
        catalog: widget.catalog,
        cart: widget.cart,
        isActive: index == 0,
        onOpenCatalog: _openCatalog,
        onOpenGender: (gender) => _openCatalogSelection(gender: gender),
        onOpenSearch: () => _openCatalog(CatalogLaunchMode.search),
        onOpenSaved: () => _openCatalog(CatalogLaunchMode.saved),
        onOpenCart: () => _selectTab(2),
        onOpenSupport: () => _selectTab(3),
      ),
      visitedTabs.contains(1)
          ? CatalogScreen(
              catalog: widget.catalog,
              cart: widget.cart,
              auth: widget.auth,
              launchRequestId: catalogRequestId,
              launchMode: catalogLaunchMode,
              requestedGender: catalogRequestedGender,
              requestedCategory: catalogRequestedCategory,
            )
          : const SizedBox.shrink(),
      visitedTabs.contains(2)
          ? CartScreen(
              cart: widget.cart,
              orders: widget.orders,
              auth: widget.auth,
              onOpenCatalog: _openCatalog,
            )
          : const SizedBox.shrink(),
      visitedTabs.contains(3)
          ? SupportScreen(orders: widget.orders, auth: widget.auth)
          : const SizedBox.shrink(),
      visitedTabs.contains(4)
          ? AccountScreen(
              auth: widget.auth,
              orders: widget.orders,
              cart: widget.cart,
            )
          : const SizedBox.shrink(),
    ];
    return AnimatedBuilder(
      animation: Listenable.merge([widget.cart, widget.auth]),
      builder: (context, _) {
        return PopScope(
          canPop: index == 0,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop && index != 0) _selectTab(0);
          },
          child: Scaffold(
            appBar: index == 0
                ? null
                : AppBar(
                    toolbarHeight: MediaQuery.textScalerOf(
                      context,
                    ).scale(56).clamp(56, 80),
                    title: const _BrandLockup(),
                    actions: [
                      IconButton(
                        onPressed: () => _openCatalog(CatalogLaunchMode.search),
                        icon: const Icon(Icons.search),
                        tooltip: 'Qidirish',
                      ),
                      IconButton(
                        onPressed: () => _openCatalog(CatalogLaunchMode.saved),
                        icon: const Icon(Icons.favorite_border),
                        tooltip: 'Saqlanganlar',
                      ),
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: Badge(
                          isLabelVisible: widget.cart.count > 0,
                          label: Text('${widget.cart.count}'),
                          child: IconButton(
                            onPressed: () => _selectTab(2),
                            icon: const Icon(Icons.shopping_bag_outlined),
                            tooltip: 'Savat',
                          ),
                        ),
                      ),
                    ],
                    bottom: const PreferredSize(
                      preferredSize: Size.fromHeight(24),
                      child: _WholesaleTicker(),
                    ),
                  ),
            body: IndexedStack(index: index, children: pages),
            floatingActionButton: FloatingActionButton.small(
              onPressed: _openAssistant,
              tooltip: 'AI yordamchi',
              backgroundColor: milanaInk,
              foregroundColor: Colors.white,
              child: const Icon(Icons.auto_awesome),
            ),
            bottomNavigationBar: NavigationBar(
              selectedIndex: index,
              height: 70,
              onDestinationSelected: (value) {
                HapticFeedback.selectionClick();
                _selectTab(value);
              },
              destinations: [
                const NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home),
                  label: 'Asosiy',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.storefront_outlined),
                  selectedIcon: Icon(Icons.storefront),
                  label: 'Katalog',
                ),
                NavigationDestination(
                  icon: Badge(
                    isLabelVisible: widget.cart.count > 0,
                    label: Text('${widget.cart.count}'),
                    child: const Icon(Icons.shopping_bag_outlined),
                  ),
                  selectedIcon: Badge(
                    isLabelVisible: widget.cart.count > 0,
                    label: Text('${widget.cart.count}'),
                    child: const Icon(Icons.shopping_bag),
                  ),
                  label: 'Savat',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.support_agent_outlined),
                  selectedIcon: Icon(Icons.support_agent),
                  label: 'Yordam',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: 'Akkaunt',
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _selectTab(int value) {
    setState(() {
      index = value;
      visitedTabs.add(value);
    });
  }

  void _openCatalog([CatalogLaunchMode mode = CatalogLaunchMode.browse]) {
    setState(() {
      index = 1;
      visitedTabs.add(1);
      catalogLaunchMode = mode;
      catalogRequestedGender = 'all';
      catalogRequestedCategory = 'all';
      catalogRequestId += 1;
    });
  }

  void _openCatalogSelection({String gender = 'all', String category = 'all'}) {
    setState(() {
      index = 1;
      visitedTabs.add(1);
      catalogLaunchMode = CatalogLaunchMode.browse;
      catalogRequestedGender = gender;
      catalogRequestedCategory = category;
      catalogRequestId += 1;
    });
  }

  void _openAssistant() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => AssistantSheet(
        assistant: assistant,
        onProduct: _openAssistantProduct,
        onAdd: _addAssistantProduct,
      ),
    );
  }

  void _addAssistantProduct(Product product) {
    _addAssistantItem(CartItem(product: product, unitType: packUnitType));
  }

  bool _addAssistantItem(CartItem item) {
    if (!widget.cart.canAdd(
      item.product,
      quantity: item.quantity,
      unitType: item.unitType,
    )) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${item.product.name} hozircha mavjud emas')),
      );
      return false;
    }
    widget.cart.addItem(item);
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            '${item.product.name} · ${item.quantity} ${orderUnitLabel(item.unitType).toLowerCase()} savatga qo‘shildi',
          ),
        ),
      );
    return true;
  }

  void _openAssistantProduct(Product product) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => ProductSheet(
        product: product,
        relatedProducts: const <Product>[],
        onAdd: _addAssistantItem,
        onOpenRelated: _openAssistantProduct,
        onAddRelated: _addAssistantProduct,
      ),
    );
  }
}

enum CatalogLaunchMode { browse, search, saved }

class _WholesaleTicker extends StatelessWidget {
  const _WholesaleTicker();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: 24,
      color: milanaInk,
      alignment: Alignment.center,
      child: const Text(
        'ULGURJI BUYURTMA · 1 QADOQ YOKI 1 QOPDAN',
        maxLines: 1,
        overflow: TextOverflow.fade,
        softWrap: false,
        style: TextStyle(
          color: Colors.white,
          fontSize: 9,
          letterSpacing: 1.4,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _BrandLockup extends StatelessWidget {
  const _BrandLockup();

  @override
  Widget build(BuildContext context) {
    final largeText = MediaQuery.textScalerOf(context).scale(1) > 1.4;
    return Semantics(
      header: true,
      label: 'Milana Premium',
      child: ExcludeSemantics(
        child: largeText
            ? const Text(
                'MILANA PREMIUM',
                maxLines: 1,
                overflow: TextOverflow.fade,
                softWrap: false,
                style: TextStyle(
                  fontSize: 16,
                  letterSpacing: 2.2,
                  fontWeight: FontWeight.w600,
                ),
              )
            : const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'MILANA',
                    style: TextStyle(
                      fontSize: 20,
                      letterSpacing: 3,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    'PREMIUM',
                    style: TextStyle(fontSize: 8, letterSpacing: 4),
                  ),
                ],
              ),
      ),
    );
  }
}

class _StorefrontHomeHeader extends StatelessWidget {
  const _StorefrontHomeHeader({
    required this.cartCount,
    required this.onMenu,
    required this.onSearch,
    required this.onSaved,
    required this.onCart,
  });

  final int cartCount;
  final VoidCallback onMenu;
  final VoidCallback onSearch;
  final VoidCallback onSaved;
  final VoidCallback onCart;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          const _WholesaleTicker(),
          SizedBox(
            height: 62,
            child: Row(
              children: [
                IconButton(
                  onPressed: onMenu,
                  color: Colors.white,
                  icon: const Icon(Icons.menu),
                  tooltip: 'Menyu',
                ),
                const Expanded(
                  child: Text(
                    'MILANA PREMIUM',
                    maxLines: 1,
                    overflow: TextOverflow.fade,
                    softWrap: false,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      letterSpacing: 4,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: onSaved,
                  color: Colors.white,
                  icon: const Icon(Icons.favorite_border, size: 21),
                  tooltip: 'Saqlanganlar',
                ),
                IconButton(
                  onPressed: onSearch,
                  color: Colors.white,
                  icon: const Icon(Icons.search, size: 22),
                  tooltip: 'Qidirish',
                ),
                Badge(
                  isLabelVisible: cartCount > 0,
                  label: Text('$cartCount'),
                  child: IconButton(
                    onPressed: onCart,
                    color: Colors.white,
                    icon: const Icon(Icons.shopping_bag_outlined, size: 21),
                    tooltip: 'Savat',
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.catalog,
    required this.cart,
    required this.isActive,
    required this.onOpenCatalog,
    required this.onOpenGender,
    required this.onOpenSearch,
    required this.onOpenSaved,
    required this.onOpenCart,
    required this.onOpenSupport,
  });

  final CatalogRepository catalog;
  final CartController cart;
  final bool isActive;
  final VoidCallback onOpenCatalog;
  final ValueChanged<String> onOpenGender;
  final VoidCallback onOpenSearch;
  final VoidCallback onOpenSaved;
  final VoidCallback onOpenCart;
  final VoidCallback onOpenSupport;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<List<Product>> productsFuture;
  String refreshedCartCatalog = '';

  @override
  void initState() {
    super.initState();
    productsFuture = widget.catalog.loadProducts();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Product>>(
      future: productsFuture,
      builder: (context, snap) {
        final products = snap.data ?? const <Product>[];
        final loading = snap.connectionState != ConnectionState.done;
        if (!loading && products.isNotEmpty) {
          final catalogRevision = Object.hashAll(
            products.map(
              (product) => Object.hash(
                product.id,
                product.price,
                product.availableQop,
                product.active,
                product.canOrderWholesale,
                Object.hashAll(
                  product.orderUnits.map(
                    (unit) =>
                        Object.hash(unit.unitType, unit.pieces, unit.minQty),
                  ),
                ),
              ),
            ),
          ).toString();
          if (catalogRevision != refreshedCartCatalog) {
            refreshedCartCatalog = catalogRevision;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) widget.cart.refreshProducts(products);
            });
          }
        }
        final women = _byGender(products, 'women');
        final men = _byGender(products, 'men');
        final kids = _byGender(products, 'kids');
        final heroProducts =
            [
              ...products.where(
                (product) =>
                    product.images.isNotEmpty && product.gender == 'women',
              ),
              ...products.where(
                (product) =>
                    product.images.isNotEmpty &&
                    (product.tag == 'new' || product.tag == 'bestseller'),
              ),
              ...products.where((product) => product.images.isNotEmpty),
            ].fold<List<Product>>(<Product>[], (result, product) {
              if (result.any((item) => item.id == product.id) ||
                  result.length >= 3) {
                return result;
              }
              return [...result, product];
            });
        final taggedBestsellers = products
            .where((product) => product.tag == 'bestseller')
            .take(8)
            .toList();
        final bestProducts = taggedBestsellers.isNotEmpty
            ? taggedBestsellers
            : products.take(8).toList();
        final lounge = products
            .where((product) => product.category == 'loungewear')
            .take(8)
            .toList();
        return RefreshIndicator(
          onRefresh: () async {
            final next = widget.catalog.loadProducts();
            setState(() => productsFuture = next);
            await next;
          },
          child: ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              Stack(
                children: [
                  HomeHero(
                    products: heroProducts,
                    loading: loading,
                    autoPlay: widget.isActive,
                    onCatalog: widget.onOpenCatalog,
                    onSupport: widget.onOpenSupport,
                    onOpenProduct: (product) => _openProduct(product, products),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 0,
                    child: _StorefrontHomeHeader(
                      cartCount: widget.cart.count,
                      onMenu: _openMenu,
                      onSearch: widget.onOpenSearch,
                      onSaved: widget.onOpenSaved,
                      onCart: widget.onOpenCart,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              HomeStatStrip(totalProducts: products.length),
              if (snap.hasError && products.isEmpty) ...[
                const SizedBox(height: 18),
                _EmptyState(
                  icon: Icons.cloud_off_outlined,
                  title: 'Katalog ochilmadi',
                  message:
                      'Internet aloqasini tekshirib, qayta urinib ko‘ring.',
                  action: FilledButton(
                    onPressed: () => setState(
                      () => productsFuture = widget.catalog.loadProducts(),
                    ),
                    child: const Text('Qayta urinish'),
                  ),
                ),
              ],
              if (bestProducts.isNotEmpty) ...[
                const SizedBox(height: 42),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: SectionHeader(title: 'BAHOR—YOZ 26', trailing: '→'),
                ),
                const SizedBox(height: 14),
                FeaturedProductsRail(
                  products: bestProducts,
                  badgeIcon: Icons.workspace_premium_outlined,
                  badgeLabel: 'Top',
                  onOpen: (product) => _openProduct(product, products),
                  onAdd: _add,
                ),
              ],
              if (!snap.hasError || products.isNotEmpty) ...[
                const SizedBox(height: 48),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: SectionHeader(
                    title: 'BUTUN OILA UCHUN KIYIM',
                    trailing: '',
                  ),
                ),
                const SizedBox(height: 18),
                HomeCategoryGrid(
                  women: women.length,
                  men: men.length,
                  kids: kids.length,
                  womenProduct: women.isEmpty ? null : women.first,
                  menProduct: men.isEmpty ? null : men.first,
                  kidsProduct: kids.isEmpty ? null : kids.first,
                  onOpenGender: widget.onOpenGender,
                ),
              ],
              if (lounge.isNotEmpty) ...[
                const SizedBox(height: 48),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: SectionHeader(
                    title: 'UY UCHUN KOLLEKSIYA',
                    trailing: '→',
                  ),
                ),
                const SizedBox(height: 14),
                FeaturedProductsRail(
                  products: lounge,
                  badgeIcon: Icons.layers_outlined,
                  badgeLabel: 'Set',
                  onOpen: (product) => _openProduct(product, products),
                  onAdd: _add,
                ),
              ],
              const SizedBox(height: 42),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: HomeWholesaleBand(onSupport: widget.onOpenSupport),
              ),
            ],
          ),
        );
      },
    );
  }

  void _openMenu() {
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'MILANA PREMIUM',
              style: TextStyle(letterSpacing: 3, fontSize: 18),
            ),
            const SizedBox(height: 22),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('KATALOG'),
              trailing: const Icon(Icons.arrow_forward),
              onTap: () {
                Navigator.pop(context);
                widget.onOpenCatalog();
              },
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('SAQLANGANLAR'),
              trailing: const Icon(Icons.favorite_border),
              onTap: () {
                Navigator.pop(context);
                widget.onOpenSaved();
              },
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('YORDAM'),
              trailing: const Icon(Icons.support_agent_outlined),
              onTap: () {
                Navigator.pop(context);
                widget.onOpenSupport();
              },
            ),
          ],
        ),
      ),
    );
  }

  List<Product> _byGender(List<Product> products, String gender) =>
      products.where((product) => product.gender == gender).toList();

  void _add(Product product) {
    _addItem(CartItem(product: product, unitType: packUnitType));
  }

  bool _addItem(CartItem item) {
    if (!widget.cart.canAdd(
      item.product,
      quantity: item.quantity,
      unitType: item.unitType,
    )) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${item.product.name} hozircha mavjud emas')),
      );
      return false;
    }
    widget.cart.addItem(item);
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            '${item.product.name} · ${item.quantity} ${orderUnitLabel(item.unitType).toLowerCase()} savatga qo‘shildi',
          ),
        ),
      );
    return true;
  }

  void _openProduct(Product product, List<Product> products) {
    final related = relatedProductsFor(product, products);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => ProductSheet(
        product: product,
        relatedProducts: related,
        onAdd: _addItem,
        onOpenRelated: (relatedProduct) =>
            _openProduct(relatedProduct, products),
        onAddRelated: _add,
      ),
    );
  }
}

class HomeHero extends StatefulWidget {
  const HomeHero({
    super.key,
    required this.products,
    required this.loading,
    required this.autoPlay,
    required this.onCatalog,
    required this.onSupport,
    required this.onOpenProduct,
  });

  final List<Product> products;
  final bool loading;
  final bool autoPlay;
  final VoidCallback onCatalog;
  final VoidCallback onSupport;
  final ValueChanged<Product> onOpenProduct;

  @override
  State<HomeHero> createState() => _HomeHeroState();
}

class _HomeHeroState extends State<HomeHero> {
  final PageController controller = PageController();
  Timer? timer;
  int index = 0;
  bool reduceMotion = false;
  bool userPaused = false;

  int get pageCount => widget.products.isEmpty ? 1 : widget.products.length + 1;

  @override
  void initState() {
    super.initState();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final media = MediaQuery.of(context);
    final nextReduceMotion =
        media.disableAnimations || media.accessibleNavigation;
    if (nextReduceMotion == reduceMotion && timer != null) return;
    reduceMotion = nextReduceMotion;
    _startTimer();
  }

  @override
  void didUpdateWidget(covariant HomeHero oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.autoPlay) {
      timer?.cancel();
      timer = null;
    } else if (!oldWidget.autoPlay ||
        oldWidget.products.length != widget.products.length) {
      index = 0;
      _startTimer();
    }
  }

  void _startTimer() {
    timer?.cancel();
    timer = null;
    if (!widget.autoPlay || reduceMotion || userPaused || pageCount < 2) return;
    timer = Timer.periodic(const Duration(seconds: 6), (_) {
      if (!mounted || !controller.hasClients) return;
      final next = (index + 1) % pageCount;
      controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _togglePlayback() {
    setState(() => userPaused = !userPaused);
    _startTimer();
  }

  @override
  void dispose() {
    timer?.cancel();
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final products = widget.products;
    return SizedBox(
      height: 640,
      child: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            controller: controller,
            itemCount: pageCount,
            onPageChanged: (value) => setState(() => index = value),
            itemBuilder: (context, pageIndex) {
              final product = pageIndex == 0 || products.isEmpty
                  ? null
                  : products[pageIndex - 1];
              return Stack(
                fit: StackFit.expand,
                children: [
                  if (product == null)
                    Image.asset(
                      'assets/hero-poster.jpg',
                      fit: BoxFit.cover,
                      alignment: Alignment.center,
                    )
                  else
                    ProductImage(product: product),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(alpha: .42),
                          Colors.black.withValues(alpha: .04),
                          Colors.black.withValues(alpha: .68),
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 18,
                    right: 18,
                    bottom: 38,
                    child: _HomeHeroCopy(
                      product: product,
                      loading: widget.loading,
                      onCatalog: widget.onCatalog,
                      onSupport: widget.onSupport,
                      onOpenProduct: product == null
                          ? null
                          : () => widget.onOpenProduct(product),
                    ),
                  ),
                ],
              );
            },
          ),
          if (pageCount > 1)
            Positioned(
              bottom: 18,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  pageCount,
                  (dotIndex) => AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    width: dotIndex == index ? 9 : 6,
                    height: 6,
                    margin: const EdgeInsets.only(left: 5),
                    decoration: BoxDecoration(
                      color: dotIndex == index
                          ? Colors.white
                          : Colors.white.withValues(alpha: .48),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
            ),
          if (pageCount > 1 && !reduceMotion)
            Positioned(
              top: 88,
              right: 12,
              child: IconButton.filledTonal(
                onPressed: _togglePlayback,
                icon: Icon(userPaused ? Icons.play_arrow : Icons.pause),
                tooltip: userPaused
                    ? 'Slaydlarni davom ettirish'
                    : 'Slaydlarni to‘xtatish',
                style: IconButton.styleFrom(
                  backgroundColor: Colors.white.withValues(alpha: .9),
                  foregroundColor: milanaInk,
                  fixedSize: const Size(48, 48),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _HomeHeroCopy extends StatelessWidget {
  const _HomeHeroCopy({
    required this.product,
    required this.loading,
    required this.onCatalog,
    required this.onSupport,
    required this.onOpenProduct,
  });

  final Product? product;
  final bool loading;
  final VoidCallback onCatalog;
  final VoidCallback onSupport;
  final VoidCallback? onOpenProduct;

  @override
  Widget build(BuildContext context) {
    final title = product == null
        ? 'YUMSHOQLIK,\nANIQ O‘LCHAMDA.'
        : 'KUN BO‘YI\nQULAYLIK.';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          loading
              ? 'KOLLEKSIYA YANGILANMOQDA'
              : 'KIYIM-KECHAK FABRIKASI · O‘ZBEKISTON',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 10,
            letterSpacing: 2.5,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          title,
          style: Theme.of(context).textTheme.displayMedium?.copyWith(
            color: Colors.white,
            fontFamily: 'MilanaDisplay',
            fontWeight: FontWeight.w300,
            letterSpacing: 1.2,
            height: .98,
          ),
        ),
        const SizedBox(height: 22),
        Row(
          children: [
            SizedBox(
              width: 160,
              child: OutlinedButton(
                onPressed: onOpenProduct ?? onCatalog,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: Colors.white),
                  shape: const RoundedRectangleBorder(),
                  minimumSize: const Size(160, 48),
                ),
                child: Text(
                  onOpenProduct == null ? 'Katalog' : 'Modelni ko‘rish',
                  style: const TextStyle(letterSpacing: 1.5, fontSize: 11),
                ),
              ),
            ),
            const SizedBox(width: 10),
            IconButton.filledTonal(
              onPressed: onSupport,
              icon: const Icon(Icons.support_agent_outlined),
              tooltip: 'Yordam',
              style: IconButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: milanaInk,
                fixedSize: const Size(52, 52),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class HomeStatStrip extends StatelessWidget {
  const HomeStatStrip({super.key, required this.totalProducts});

  final int totalProducts;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          const HomeStatTile(
            value: '1 QADOQ YOKI 1 QOPDAN',
            label: 'Qadoq — 6 dona, qop — 60 dona',
          ),
          const HomeStatTile(
            value: 'POCHTA YOKI CARGO',
            label: 'Yetkazib berish xarajatini mijoz to‘laydi',
          ),
          HomeStatTile(
            value: 'MENEJER YORDAMI',
            label: '$totalProducts model · narx va mavjudlik tasdiqlanadi',
          ),
        ],
      ),
    );
  }
}

class HomeStatTile extends StatelessWidget {
  const HomeStatTile({super.key, required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 20),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: milanaInk.withValues(alpha: .12)),
        ),
      ),
      child: Column(
        children: [
          Text(
            value,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: milanaInk.withValues(alpha: .56),
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class HomeCategoryGrid extends StatelessWidget {
  const HomeCategoryGrid({
    super.key,
    required this.women,
    required this.men,
    required this.kids,
    required this.womenProduct,
    required this.menProduct,
    required this.kidsProduct,
    required this.onOpenGender,
  });

  final int women;
  final int men;
  final int kids;
  final Product? womenProduct;
  final Product? menProduct;
  final Product? kidsProduct;
  final ValueChanged<String> onOpenGender;

  @override
  Widget build(BuildContext context) {
    final categories = [
      (
        title: 'AYOLLARGA',
        subtitle: 'Xalatlar va pijamalar',
        count: women,
        product: womenProduct,
        gender: 'women',
      ),
      (
        title: 'ERKAKLARGA',
        subtitle: 'Erkaklar kolleksiyasi',
        count: men,
        product: menProduct,
        gender: 'men',
      ),
      (
        title: 'BOLALARGA',
        subtitle: 'Bolalar kiyimlari',
        count: kids,
        product: kidsProduct,
        gender: 'kids',
      ),
    ];
    final tiles = categories
        .map(
          (category) => HomeCategoryTile(
            title: category.title,
            subtitle: category.subtitle,
            count: category.count,
            product: category.product,
            onTap: () => onOpenGender(category.gender),
          ),
        )
        .toList();
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 760) {
          return Column(children: tiles);
        }
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var index = 0; index < tiles.length; index++) ...[
                if (index > 0) const SizedBox(width: 12),
                Expanded(child: tiles[index]),
              ],
            ],
          ),
        );
      },
    );
  }
}

class HomeCategoryTile extends StatelessWidget {
  const HomeCategoryTile({
    super.key,
    required this.title,
    required this.subtitle,
    required this.count,
    required this.product,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final int count;
  final Product? product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Column(
        children: [
          AspectRatio(
            aspectRatio: .95,
            child: product == null
                ? const ProductImagePlaceholder()
                : ProductImage(product: product!),
          ),
          Container(
            width: double.infinity,
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            child: Column(
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    letterSpacing: 2.4,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 7),
                Text(
                  subtitle,
                  style: TextStyle(color: milanaInk.withValues(alpha: .52)),
                ),
                const SizedBox(height: 10),
                Text(
                  'MODELLARNI KO‘RISH · $count',
                  style: const TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.6,
                    decoration: TextDecoration.underline,
                    decorationThickness: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class HomeWholesaleBand extends StatelessWidget {
  const HomeWholesaleBand({super.key, required this.onSupport});

  final VoidCallback onSupport;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: milanaSand,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Buyurtma qanday ishlaydi',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            'Qadoqdan boshlang yoki to‘liq qop tanlang. Narx, qoldiq va jo‘natishni menejer yakuniy tasdiqlaydi.',
            style: TextStyle(color: milanaInk.withValues(alpha: .68)),
          ),
          const SizedBox(height: 16),
          const HomeOrderStep(
            number: '01',
            icon: Icons.checkroom_outlined,
            title: 'Model va format',
            text: 'Qadoq yoki qopni tanlab savatga qo‘shing.',
          ),
          const HomeOrderStep(
            number: '02',
            icon: Icons.support_agent_outlined,
            title: 'Menejer tasdig‘i',
            text: 'Mavjudlik, rang va jami summa tekshiriladi.',
          ),
          const HomeOrderStep(
            number: '03',
            icon: Icons.local_shipping_outlined,
            title: 'To‘lov va Cargo',
            text: 'To‘lovdan so‘ng buyurtma jo‘natiladi.',
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: onSupport,
            icon: const Icon(Icons.call_outlined, size: 18),
            label: const Text('Menejer bilan bog‘lanish'),
          ),
        ],
      ),
    );
  }
}

class HomeOrderStep extends StatelessWidget {
  const HomeOrderStep({
    super.key,
    required this.number,
    required this.icon,
    required this.title,
    required this.text,
  });

  final String number;
  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 34,
            child: Text(
              number,
              style: const TextStyle(
                color: milanaBurgundy,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 20, color: milanaBurgundy),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                Text(
                  text,
                  style: TextStyle(color: milanaInk.withValues(alpha: .68)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class CatalogCategorySelection {
  const CatalogCategorySelection({
    required this.label,
    this.gender = 'all',
    this.category = 'all',
  });

  final String label;
  final String gender;
  final String category;
}

class CatalogCategoryRail extends StatelessWidget {
  const CatalogCategoryRail({
    super.key,
    required this.products,
    required this.activeGender,
    required this.activeCategory,
    required this.onSelect,
  });

  final List<Product> products;
  final String activeGender;
  final String activeCategory;
  final ValueChanged<CatalogCategorySelection> onSelect;

  @override
  Widget build(BuildContext context) {
    final scaledLabelSize = MediaQuery.textScalerOf(context).scale(12);
    final railHeight = (90 + (scaledLabelSize * 1.35))
        .clamp(112.0, 160.0)
        .toDouble();
    const selections = <CatalogCategorySelection>[
      CatalogCategorySelection(label: 'Barchasi'),
      CatalogCategorySelection(label: 'Pijamalar', category: 'pajamas'),
      CatalogCategorySelection(label: 'Xalatlar', category: 'robes'),
      CatalogCategorySelection(label: 'Ayollar', gender: 'women'),
      CatalogCategorySelection(label: 'Erkaklar', gender: 'men'),
      CatalogCategorySelection(label: 'Bolalar', gender: 'kids'),
    ];

    return SizedBox(
      height: railHeight,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: selections.length,
        separatorBuilder: (context, index) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final selection = selections[index];
          final product = _representativeProduct(selection);
          final selected =
              activeGender == selection.gender &&
              activeCategory == selection.category;
          return Semantics(
            button: true,
            selected: selected,
            label: selection.label,
            child: InkWell(
              onTap: () => onSelect(selection),
              borderRadius: BorderRadius.circular(42),
              child: SizedBox(
                width: 78,
                child: Column(
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      width: 74,
                      height: 74,
                      padding: EdgeInsets.all(selected ? 3 : 1),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: selected ? milanaBurgundy : Colors.white,
                        border: Border.all(
                          color: selected
                              ? milanaBurgundy
                              : milanaInk.withValues(alpha: .12),
                        ),
                      ),
                      child: ClipOval(
                        child: product == null
                            ? const ColoredBox(
                                color: milanaSand,
                                child: Icon(Icons.grid_view_outlined),
                              )
                            : ProductImage(product: product),
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      selection.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: selected ? milanaBurgundy : milanaInk,
                        fontSize: 12,
                        fontWeight: selected
                            ? FontWeight.w800
                            : FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Product? _representativeProduct(CatalogCategorySelection selection) {
    for (final product in products) {
      if (product.images.isEmpty) continue;
      final matchesGender =
          selection.gender == 'all' || product.gender == selection.gender;
      final matchesCategory =
          selection.category == 'all' || product.category == selection.category;
      if (matchesGender && matchesCategory) return product;
    }
    return null;
  }
}

class CatalogLoadingView extends StatelessWidget {
  const CatalogLoadingView({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: 'Katalog yuklanmoqda',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final columns = constraints.maxWidth > 1100
              ? 4
              : constraints.maxWidth > 720
              ? 3
              : 2;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
            children: [
              const _CatalogSkeletonBlock(width: 210, height: 32),
              const SizedBox(height: 10),
              const _CatalogSkeletonBlock(width: 140, height: 12),
              const SizedBox(height: 24),
              SizedBox(
                height: 104,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: 6,
                  separatorBuilder: (_, _) => const SizedBox(width: 14),
                  itemBuilder: (_, _) => const Column(
                    children: [
                      _CatalogSkeletonBlock(width: 70, height: 70, radius: 35),
                      SizedBox(height: 8),
                      _CatalogSkeletonBlock(width: 58, height: 8),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const _CatalogSkeletonBlock(height: 48),
              const SizedBox(height: 12),
              const _CatalogSkeletonBlock(height: 46),
              const SizedBox(height: 28),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: columns * 2,
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  mainAxisSpacing: 22,
                  crossAxisSpacing: 10,
                  childAspectRatio: columns > 2 ? .68 : .60,
                ),
                itemBuilder: (_, _) => const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: _CatalogSkeletonBlock()),
                    SizedBox(height: 10),
                    _CatalogSkeletonBlock(width: 118, height: 10),
                    SizedBox(height: 8),
                    _CatalogSkeletonBlock(width: 82, height: 10),
                    SizedBox(height: 7),
                    _CatalogSkeletonBlock(width: 100, height: 8),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CatalogSkeletonBlock extends StatelessWidget {
  const _CatalogSkeletonBlock({
    this.width = double.infinity,
    this.height = double.infinity,
    this.radius = 2,
  });

  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: milanaInk.withValues(alpha: .07),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({
    super.key,
    required this.catalog,
    required this.cart,
    required this.auth,
    required this.launchRequestId,
    required this.launchMode,
    required this.requestedGender,
    required this.requestedCategory,
  });

  final CatalogRepository catalog;
  final CartController cart;
  final AuthService auth;
  final int launchRequestId;
  final CatalogLaunchMode launchMode;
  final String requestedGender;
  final String requestedCategory;

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  late Future<List<Product>> productsFuture;
  String query = '';
  String gender = 'all';
  String category = 'all';
  String size = 'all';
  PriceBand priceBand = PriceBand.all;
  AvailabilityFilter availability = AvailabilityFilter.all;
  CurationFilter curation = CurationFilter.all;
  String sort = 'featured';
  bool savedOnly = false;
  bool filtersExpanded = false;
  int visibleProductCount = catalogInitialVisibleCount;
  final searchController = SearchController();
  final searchFocusNode = FocusNode();
  final scrollController = ScrollController();
  final favoritesStore = FavoritesStore();
  final recentStore = RecentProductsStore();
  final favorites = <String>{};
  final recentIds = <String>[];
  late String localProductScope;
  String? syncedCustomerId;
  Set<String> lastRemoteFavorites = const <String>{};
  bool favoritesDirty = false;
  String? syncedRecentCustomerId;
  List<String> lastRemoteRecent = const <String>[];
  bool recentDirty = false;
  String? handledDeletedCustomerId;

  @override
  void initState() {
    super.initState();
    gender = widget.requestedGender;
    category = widget.requestedCategory;
    savedOnly = widget.launchMode == CatalogLaunchMode.saved;
    localProductScope = _localScopeFor(widget.auth.customer);
    productsFuture = _loadProductsAndRefreshCart();
    _loadFavorites();
    _loadRecentProducts();
    widget.auth.addListener(_handleAuthChange);
  }

  Future<List<Product>> _loadProductsAndRefreshCart() async {
    final products = await widget.catalog.loadProducts();
    widget.cart.refreshProducts(products);
    return products;
  }

  void _reloadCatalog() {
    setState(() => productsFuture = _loadProductsAndRefreshCart());
  }

  @override
  void didUpdateWidget(covariant CatalogScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.launchRequestId == widget.launchRequestId) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() {
        searchController.clear();
        query = '';
        gender = widget.requestedGender;
        category = widget.requestedCategory;
        size = 'all';
        priceBand = PriceBand.all;
        availability = AvailabilityFilter.all;
        curation = CurationFilter.all;
        savedOnly = widget.launchMode == CatalogLaunchMode.saved;
        filtersExpanded = false;
        _resetCatalogWindow();
      });
      if (scrollController.hasClients) scrollController.jumpTo(0);
      if (widget.launchMode == CatalogLaunchMode.search) {
        searchFocusNode.requestFocus();
      } else {
        searchFocusNode.unfocus();
      }
    });
  }

  @override
  void dispose() {
    widget.auth.removeListener(_handleAuthChange);
    searchController.dispose();
    searchFocusNode.dispose();
    scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Product>>(
      future: productsFuture,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const CatalogLoadingView();
        }
        if (snap.hasError) {
          return _EmptyState(
            icon: Icons.cloud_off_outlined,
            title: 'Katalog ochilmadi',
            message: 'Internet aloqasini tekshirib, qayta urinib ko‘ring.',
            action: FilledButton(
              onPressed: _reloadCatalog,
              child: const Text('Qayta urinish'),
            ),
          );
        }
        final allProducts = snap.data ?? const <Product>[];
        final products = _filtered(allProducts);
        final productById = {
          for (final product in allProducts) product.id: product,
        };
        final recentProducts = recentIds
            .map((id) => productById[id])
            .whereType<Product>()
            .where((product) => product.active)
            .take(8)
            .toList(growable: false);
        final showRecent =
            query.isEmpty &&
            _activeFilterCount == 0 &&
            recentProducts.isNotEmpty;
        final visibleCount = effectiveCatalogVisibleCount(
          total: products.length,
          requested: visibleProductCount,
        );
        final visibleProducts = products.take(visibleCount).toList();
        final sizes = availableSizes(allProducts);
        final loadInfo = widget.catalog.lastLoadInfo;
        final viewportWidth = MediaQuery.sizeOf(context).width;
        final contentInset = viewportWidth > 1440
            ? (viewportWidth - 1440) / 2 + 16
            : 16.0;
        return RefreshIndicator(
          onRefresh: () async {
            final next = _loadProductsAndRefreshCart();
            setState(() => productsFuture = next);
            await next;
          },
          child: ListView(
            controller: scrollController,
            padding: EdgeInsets.fromLTRB(contentInset, 8, contentInset, 28),
            children: [
              PremiumCatalogHeader(
                total: allProducts.length,
                visible: products.length,
              ),
              if (loadInfo.fromCache) ...[
                const SizedBox(height: 12),
                CatalogCacheNotice(info: loadInfo, onRefresh: _reloadCatalog),
              ],
              const SizedBox(height: 16),
              CatalogCategoryRail(
                products: allProducts,
                activeGender: gender,
                activeCategory: category,
                onSelect: (selection) => setState(() {
                  gender = selection.gender;
                  category = selection.category;
                  savedOnly = false;
                  _resetCatalogWindow();
                }),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: searchController,
                focusNode: searchFocusNode,
                decoration: const InputDecoration(
                  hintText: 'Barcha mahsulotlardan qidirish…',
                  prefixIcon: Icon(Icons.search, size: 20),
                  filled: false,
                  enabledBorder: UnderlineInputBorder(),
                  focusedBorder: UnderlineInputBorder(
                    borderSide: BorderSide(color: milanaInk, width: 1.5),
                  ),
                ),
                onChanged: (value) => setState(() {
                  query = value.trim().toLowerCase();
                  _resetCatalogWindow();
                }),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () =>
                      setState(() => filtersExpanded = !filtersExpanded),
                  icon: const Icon(Icons.filter_list, size: 18),
                  label: Text(
                    filtersExpanded
                        ? 'FILTERLARNI YOPISH'
                        : _activeFilterCount == 0
                        ? 'FILTERLAR'
                        : 'FILTERLAR · $_activeFilterCount',
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: milanaInk,
                    side: BorderSide(color: milanaInk.withValues(alpha: .3)),
                    shape: const RoundedRectangleBorder(),
                    textStyle: const TextStyle(
                      fontSize: 11,
                      letterSpacing: 1.6,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              if (filtersExpanded) ...[
                const SizedBox(height: 12),
                _Filters(
                  gender: gender,
                  category: category,
                  onGender: (value) => setState(() {
                    gender = value;
                    _resetCatalogWindow();
                  }),
                  onCategory: (value) => setState(() {
                    category = value;
                    _resetCatalogWindow();
                  }),
                ),
                const SizedBox(height: 10),
                DiscoveryFilterPanel(
                  size: size,
                  sizes: sizes,
                  priceBand: priceBand,
                  availability: availability,
                  curation: curation,
                  onSize: (value) => setState(() {
                    size = value;
                    _resetCatalogWindow();
                  }),
                  onPriceBand: (value) => setState(() {
                    priceBand = value;
                    _resetCatalogWindow();
                  }),
                  onAvailability: (value) => setState(() {
                    availability = value;
                    _resetCatalogWindow();
                  }),
                  onCuration: (value) => setState(() {
                    curation = value;
                    _resetCatalogWindow();
                  }),
                  onClear: _clearFilters,
                  hasActiveFilters:
                      query.isNotEmpty ||
                      gender != 'all' ||
                      category != 'all' ||
                      size != 'all' ||
                      priceBand != PriceBand.all ||
                      availability != AvailabilityFilter.all ||
                      curation != CurationFilter.all ||
                      savedOnly,
                ),
              ],
              const SizedBox(height: 10),
              CatalogActionBar(
                savedOnly: savedOnly,
                savedCount: favorites.length,
                sort: sort,
                onSavedOnly: (value) => setState(() {
                  savedOnly = value;
                  _resetCatalogWindow();
                }),
                onSort: (value) => setState(() {
                  sort = value;
                  _resetCatalogWindow();
                }),
              ),
              const SizedBox(height: 18),
              if (showRecent) ...[
                SectionHeader(
                  title: 'YAQINDA KO‘RILGANLAR',
                  trailing: '${recentProducts.length} model',
                ),
                const SizedBox(height: 10),
                RecentlyViewedRail(
                  products: recentProducts,
                  favorites: favorites,
                  onOpen: (product) => _openProduct(product, allProducts),
                  onAdd: _add,
                  onFavorite: _toggleFavorite,
                ),
                const SizedBox(height: 24),
                Divider(color: milanaInk.withValues(alpha: .12)),
                const SizedBox(height: 18),
              ],
              SectionHeader(
                title: 'BARCHA MAHSULOTLAR',
                trailing: products.length == visibleProducts.length
                    ? '${products.length} model'
                    : '${visibleProducts.length}/${products.length} model',
              ),
              const SizedBox(height: 10),
              LayoutBuilder(
                builder: (context, constraints) {
                  final columns = constraints.maxWidth > 1100
                      ? 4
                      : constraints.maxWidth > 720
                      ? 3
                      : 2;
                  return GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: visibleProducts.length,
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: columns,
                      mainAxisSpacing: 22,
                      crossAxisSpacing: 10,
                      childAspectRatio: columns > 2 ? .68 : .60,
                    ),
                    itemBuilder: (context, i) => ProductCard(
                      product: visibleProducts[i],
                      isFavorite: favorites.contains(visibleProducts[i].id),
                      onOpen: () =>
                          _openProduct(visibleProducts[i], allProducts),
                      onAdd: isOutOfQop(visibleProducts[i])
                          ? null
                          : () => _add(visibleProducts[i]),
                      onFavorite: () => _toggleFavorite(visibleProducts[i]),
                    ),
                  );
                },
              ),
              if (products.length > visibleProducts.length) ...[
                const SizedBox(height: 16),
                LoadMoreCatalogButton(
                  visible: visibleProducts.length,
                  total: products.length,
                  onPressed: () => setState(() {
                    visibleProductCount = nextCatalogVisibleCount(
                      total: products.length,
                      current: visibleProductCount,
                    );
                  }),
                ),
              ],
              if (products.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 36),
                  child: _EmptyState(
                    icon: savedOnly
                        ? Icons.favorite_border
                        : Icons.search_off_outlined,
                    title: savedOnly ? 'Saqlanganlar bo‘sh' : 'Model topilmadi',
                    message: savedOnly
                        ? 'Yoqtirgan modellaringizni yurakcha bilan saqlang.'
                        : 'Qidiruv yoki filterlarni o‘zgartirib ko‘ring.',
                    action: query.isNotEmpty || _activeFilterCount > 0
                        ? OutlinedButton.icon(
                            onPressed: _clearFilters,
                            icon: const Icon(Icons.restart_alt),
                            label: const Text('Filterlarni tozalash'),
                          )
                        : null,
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  List<Product> _filtered(List<Product> rows) {
    return filterCatalog(
      rows,
      CatalogFilterOptions(
        query: query,
        gender: gender,
        category: category,
        size: size,
        priceBand: priceBand,
        availability: availability,
        curation: curation,
        savedOnly: savedOnly,
        savedProductIds: favorites,
        sort: catalogSortFromString(sort),
      ),
    );
  }

  void _toggleFavorite(Product product) {
    setState(() {
      if (!favorites.add(product.id)) favorites.remove(product.id);
    });
    favoritesDirty = widget.auth.signedIn;
    unawaited(favoritesStore.save(favorites, scope: localProductScope));
    if (widget.auth.signedIn) {
      unawaited(_syncFavoritesToProfile(Set<String>.of(favorites)));
    }
  }

  Future<void> _loadFavorites() async {
    final scope = localProductScope;
    final saved = await favoritesStore.load(scope: scope);
    if (!mounted || scope != localProductScope) return;
    setState(() {
      favorites
        ..clear()
        ..addAll(saved);
    });
    _mergeCustomerFavorites(widget.auth.customer);
  }

  Future<void> _loadRecentProducts() async {
    final scope = localProductScope;
    final saved = await recentStore.load(scope: scope);
    if (!mounted || scope != localProductScope) return;
    setState(() {
      recentIds
        ..clear()
        ..addAll(saved);
    });
    _mergeCustomerRecent(widget.auth.customer);
  }

  void _handleAuthChange() {
    final deletedCustomerId = widget.auth.lastDeletedCustomerId;
    if (deletedCustomerId != null &&
        deletedCustomerId != handledDeletedCustomerId) {
      handledDeletedCustomerId = deletedCustomerId;
      unawaited(favoritesStore.clear(scope: deletedCustomerId));
      unawaited(recentStore.clear(scope: deletedCustomerId));
    }
    final nextScope = _localScopeFor(widget.auth.customer);
    if (nextScope != localProductScope) {
      setState(() {
        localProductScope = nextScope;
        favorites.clear();
        recentIds.clear();
        syncedCustomerId = null;
        lastRemoteFavorites = const <String>{};
        favoritesDirty = false;
        syncedRecentCustomerId = null;
        lastRemoteRecent = const <String>[];
        recentDirty = false;
      });
      unawaited(_loadFavorites());
      unawaited(_loadRecentProducts());
      return;
    }
    _mergeCustomerFavorites(widget.auth.customer);
    _mergeCustomerRecent(widget.auth.customer);
  }

  String _localScopeFor(Customer? customer) => customer?.id ?? 'guest';

  void _mergeCustomerFavorites(Customer? customer) {
    if (customer == null) {
      syncedCustomerId = null;
      lastRemoteFavorites = const <String>{};
      return;
    }
    if (!widget.auth.profileReady) return;
    final remote = customer.savedProductIds;
    final firstSyncForCustomer = syncedCustomerId != customer.id;
    final hasRemoteChanges = !setEquals(remote, lastRemoteFavorites);
    if (!firstSyncForCustomer && !hasRemoteChanges) return;
    if (favoritesDirty) {
      syncedCustomerId = customer.id;
      lastRemoteFavorites = Set.unmodifiable(remote);
      if (setEquals(remote, favorites)) {
        favoritesDirty = false;
      } else {
        unawaited(_syncFavoritesToProfile(Set<String>.of(favorites)));
      }
      return;
    }
    setState(() {
      favorites
        ..clear()
        ..addAll(remote);
      syncedCustomerId = customer.id;
      lastRemoteFavorites = Set.unmodifiable(remote);
    });
    unawaited(favoritesStore.save(remote, scope: localProductScope));
  }

  void _mergeCustomerRecent(Customer? customer) {
    if (customer == null) {
      syncedRecentCustomerId = null;
      lastRemoteRecent = const <String>[];
      return;
    }
    if (!widget.auth.profileReady) return;
    final remote = customer.recentProductIds;
    final firstSyncForCustomer = syncedRecentCustomerId != customer.id;
    final hasRemoteChanges =
        _recentFingerprint(remote) != _recentFingerprint(lastRemoteRecent);
    if (!firstSyncForCustomer && !hasRemoteChanges) return;
    if (recentDirty) {
      syncedRecentCustomerId = customer.id;
      lastRemoteRecent = List.unmodifiable(remote);
      if (_recentFingerprint(remote) == _recentFingerprint(recentIds)) {
        recentDirty = false;
      } else {
        unawaited(_syncRecentToProfile(List<String>.of(recentIds)));
      }
      return;
    }
    setState(() {
      recentIds
        ..clear()
        ..addAll(remote);
      syncedRecentCustomerId = customer.id;
      lastRemoteRecent = List.unmodifiable(remote);
    });
    unawaited(recentStore.save(remote, scope: localProductScope));
  }

  void _trackRecent(Product product) {
    final next = _mergeRecent([product.id], recentIds);
    setState(() {
      recentIds
        ..clear()
        ..addAll(next);
    });
    recentDirty = widget.auth.signedIn;
    unawaited(recentStore.save(next, scope: localProductScope));
    if (widget.auth.signedIn) {
      unawaited(_syncRecentToProfile(List<String>.of(next)));
    }
  }

  Future<void> _syncFavoritesToProfile(Set<String> snapshot) async {
    for (var attempt = 0; attempt < 2; attempt += 1) {
      try {
        await widget.auth.updateSavedProducts(snapshot);
        return;
      } catch (_) {
        if (attempt > 0) return;
        await Future<void>.delayed(const Duration(seconds: 2));
        if (!mounted ||
            !widget.auth.signedIn ||
            !setEquals(snapshot, favorites)) {
          return;
        }
      }
    }
  }

  Future<void> _syncRecentToProfile(List<String> snapshot) async {
    for (var attempt = 0; attempt < 2; attempt += 1) {
      try {
        await widget.auth.updateRecentProducts(snapshot);
        return;
      } catch (_) {
        if (attempt > 0) return;
        await Future<void>.delayed(const Duration(seconds: 2));
        if (!mounted ||
            !widget.auth.signedIn ||
            _recentFingerprint(snapshot) != _recentFingerprint(recentIds)) {
          return;
        }
      }
    }
  }

  List<String> _mergeRecent(List<String> primary, List<String> secondary) {
    final seen = <String>{};
    return [...primary, ...secondary]
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty && seen.add(id))
        .take(RecentProductsStore.maxItems)
        .toList();
  }

  String _recentFingerprint(List<String> ids) => ids.join('|');

  void _resetCatalogWindow() {
    visibleProductCount = catalogInitialVisibleCount;
  }

  int get _activeFilterCount {
    var count = 0;
    if (gender != 'all') count += 1;
    if (category != 'all') count += 1;
    if (size != 'all') count += 1;
    if (priceBand != PriceBand.all) count += 1;
    if (availability != AvailabilityFilter.all) count += 1;
    if (curation != CurationFilter.all) count += 1;
    if (savedOnly) count += 1;
    return count;
  }

  void _clearFilters() {
    setState(() {
      searchController.clear();
      query = '';
      gender = 'all';
      category = 'all';
      size = 'all';
      priceBand = PriceBand.all;
      availability = AvailabilityFilter.all;
      curation = CurationFilter.all;
      savedOnly = false;
      _resetCatalogWindow();
    });
  }

  void _add(Product product) {
    _addItem(CartItem(product: product, unitType: packUnitType));
  }

  bool _addItem(CartItem item) {
    final product = item.product;
    if (!widget.cart.canAdd(
      product,
      quantity: item.quantity,
      unitType: item.unitType,
    )) {
      final limit = widget.cart.quantityLimit(product, unitType: item.unitType);
      final current = widget.cart.quantityOf(product, unitType: item.unitType);
      final unitLabel = orderUnitLabel(item.unitType).toLowerCase();
      final message = limit < 1
          ? '${product.name} hozircha mavjud emas'
          : '${product.name} uchun maksimal $limit $unitLabel. Savatda $current $unitLabel bor.';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
      return false;
    }
    widget.cart.addItem(item);
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            '${product.name} · ${item.quantity} ${orderUnitLabel(item.unitType).toLowerCase()} savatga qo‘shildi',
          ),
        ),
      );
    return true;
  }

  void _openProduct(Product product, [List<Product> allProducts = const []]) {
    _trackRecent(product);
    final related = relatedProductsFor(product, allProducts);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => ProductSheet(
        product: product,
        relatedProducts: related,
        onAdd: _addItem,
        onOpenRelated: (relatedProduct) =>
            _openProduct(relatedProduct, allProducts),
        onAddRelated: _add,
      ),
    );
  }
}

class PremiumCatalogHeader extends StatelessWidget {
  const PremiumCatalogHeader({
    super.key,
    required this.total,
    required this.visible,
  });

  final int total;
  final int visible;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final compact =
                  constraints.maxWidth < 420 ||
                  MediaQuery.textScalerOf(context).scale(1) > 1.3;
              final breadcrumb = Text(
                'BOSH SAHIFA  /  BARCHA MAHSULOTLAR',
                style: const TextStyle(
                  color: milanaMuted,
                  fontSize: 10,
                  letterSpacing: 1.2,
                ),
              );
              final count = Text(
                '$visible / $total',
                style: const TextStyle(color: milanaMuted, fontSize: 11),
              );
              if (compact) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [breadcrumb, const SizedBox(height: 6), count],
                );
              }
              return Row(children: [breadcrumb, const Spacer(), count]);
            },
          ),
          const SizedBox(height: 24),
          Text(
            'KATALOG',
            style: Theme.of(context).textTheme.displaySmall?.copyWith(
              fontFamily: 'MilanaDisplay',
              fontWeight: FontWeight.w300,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Ayollar, erkaklar va bolalar uchun uy hamda kundalik kiyimlar.',
            style: TextStyle(
              color: milanaInk.withValues(alpha: .58),
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class CatalogCacheNotice extends StatelessWidget {
  const CatalogCacheNotice({
    super.key,
    required this.info,
    required this.onRefresh,
  });

  final CatalogLoadInfo info;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final cachedAt = info.cachedAt;
    final timestamp = cachedAt == null
        ? 'Oxirgi saqlangan katalog'
        : '${shortDateTime.format(cachedAt.toLocal())} dagi katalog';
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: milanaInk.withValues(alpha: .12)),
          bottom: BorderSide(color: milanaInk.withValues(alpha: .12)),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.wifi_off_outlined, size: 17),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'OFFLINE KATALOG · $timestamp',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: milanaInk.withValues(alpha: .62),
                fontSize: 10,
                letterSpacing: .8,
              ),
            ),
          ),
          IconButton(
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh, size: 18),
            tooltip: 'Yangilash',
          ),
        ],
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, required this.trailing});

  final String title;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.fade,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontFamily: 'MilanaDisplay',
              fontWeight: FontWeight.w300,
              letterSpacing: 1.4,
            ),
          ),
        ),
        if (trailing.isNotEmpty) ...[
          const SizedBox(width: 10),
          Text(
            trailing,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: milanaInk.withValues(alpha: .58),
            ),
          ),
        ],
      ],
    );
  }
}

class FeaturedProductsRail extends StatelessWidget {
  const FeaturedProductsRail({
    super.key,
    required this.products,
    required this.onOpen,
    required this.onAdd,
    this.badgeIcon = Icons.bolt,
    this.badgeLabel = 'Yangi',
  });

  final List<Product> products;
  final ValueChanged<Product> onOpen;
  final ValueChanged<Product> onAdd;
  final IconData badgeIcon;
  final String badgeLabel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 330,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: products.length,
        separatorBuilder: (context, index) => const SizedBox(width: 12),
        itemBuilder: (context, index) => FeaturedProductTile(
          product: products[index],
          badgeIcon: badgeIcon,
          badgeLabel: badgeLabel,
          onOpen: () => onOpen(products[index]),
          onAdd: isOutOfQop(products[index])
              ? null
              : () => onAdd(products[index]),
        ),
      ),
    );
  }
}

class FeaturedProductTile extends StatelessWidget {
  const FeaturedProductTile({
    super.key,
    required this.product,
    required this.badgeIcon,
    required this.badgeLabel,
    required this.onOpen,
    required this.onAdd,
  });

  final Product product;
  final IconData badgeIcon;
  final String badgeLabel;
  final VoidCallback onOpen;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 190,
      child: InkWell(
        onTap: onOpen,
        child: Ink(
          color: Colors.white,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Stack(
                  children: [
                    Positioned.fill(child: ProductImage(product: product)),
                    if (onAdd != null)
                      Positioned(
                        right: 10,
                        bottom: 10,
                        child: IconButton.filled(
                          onPressed: onAdd,
                          icon: const Icon(Icons.add_shopping_cart, size: 18),
                          tooltip: 'Savatga qo‘shish',
                          style: IconButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: milanaInk,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 10, bottom: 3),
                child: Text(
                  product.name.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    letterSpacing: 1.1,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Text(
                '${money.format(product.price)} / dona',
                style: Theme.of(context).textTheme.labelLarge,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class DiscoveryFilterPanel extends StatelessWidget {
  const DiscoveryFilterPanel({
    super.key,
    required this.size,
    required this.sizes,
    required this.priceBand,
    required this.availability,
    required this.curation,
    required this.onSize,
    required this.onPriceBand,
    required this.onAvailability,
    required this.onCuration,
    required this.onClear,
    required this.hasActiveFilters,
  });

  final String size;
  final List<String> sizes;
  final PriceBand priceBand;
  final AvailabilityFilter availability;
  final CurationFilter curation;
  final ValueChanged<String> onSize;
  final ValueChanged<PriceBand> onPriceBand;
  final ValueChanged<AvailabilityFilter> onAvailability;
  final ValueChanged<CurationFilter> onCuration;
  final VoidCallback onClear;
  final bool hasActiveFilters;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 12,
          runSpacing: 4,
          children: [
            Text(
              'Tez filterlar',
              style: Theme.of(
                context,
              ).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
            if (hasActiveFilters)
              TextButton.icon(
                onPressed: onClear,
                icon: const Icon(Icons.close, size: 16),
                label: const Text('Tozalash'),
              ),
          ],
        ),
        const SizedBox(height: 6),
        _EnumChips<AvailabilityFilter>(
          value: availability,
          values: const {
            AvailabilityFilter.all: 'Barcha holat',
            AvailabilityFilter.inStock: 'Omborda',
            AvailabilityFilter.preorder: 'Preorder',
          },
          onChanged: onAvailability,
        ),
        const SizedBox(height: 8),
        _EnumChips<CurationFilter>(
          value: curation,
          values: const {
            CurationFilter.all: 'Barcha kolleksiya',
            CurationFilter.newArrival: 'Yangi',
            CurationFilter.bestseller: 'Bestseller',
            CurationFilter.sale: 'Chegirma',
          },
          onChanged: onCuration,
        ),
        const SizedBox(height: 8),
        _EnumChips<PriceBand>(
          value: priceBand,
          values: const {
            PriceBand.all: 'Barcha narx',
            PriceBand.under5: r'< $5',
            PriceBand.from5To7: r'$5-$7',
            PriceBand.over7: r'$7+',
          },
          onChanged: onPriceBand,
        ),
        if (sizes.isNotEmpty) ...[
          const SizedBox(height: 8),
          _Chips(
            value: size,
            values: {
              'all': 'Barcha o‘lcham',
              for (final availableSize in sizes) availableSize: availableSize,
            },
            onChanged: onSize,
          ),
        ],
      ],
    );
  }
}

class CatalogActionBar extends StatelessWidget {
  const CatalogActionBar({
    super.key,
    required this.savedOnly,
    required this.savedCount,
    required this.sort,
    required this.onSavedOnly,
    required this.onSort,
  });

  final bool savedOnly;
  final int savedCount;
  final String sort;
  final ValueChanged<bool> onSavedOnly;
  final ValueChanged<String> onSort;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        FilterChip(
          selected: savedOnly,
          avatar: Icon(
            savedOnly ? Icons.favorite : Icons.favorite_border,
            size: 18,
          ),
          label: Text('Saqlanganlar $savedCount'),
          onSelected: onSavedOnly,
        ),
        PopupMenuButton<String>(
          initialValue: sort,
          tooltip: 'Saralash',
          onSelected: onSort,
          itemBuilder: (context) => const [
            PopupMenuItem(value: 'featured', child: Text('Avval yangilari')),
            PopupMenuItem(value: 'price_low', child: Text('Narx: pastdan')),
            PopupMenuItem(value: 'price_high', child: Text('Narx: yuqoridan')),
            PopupMenuItem(value: 'name', child: Text('Model nomi')),
          ],
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: milanaInk.withValues(alpha: .12)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.tune, size: 18),
                const SizedBox(width: 8),
                Text(
                  _sortLabel(sort),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  String _sortLabel(String value) {
    return switch (value) {
      'price_low' => 'Past narx',
      'price_high' => 'Yuqori narx',
      'name' => 'Model',
      _ => 'Yangi',
    };
  }
}

class _EnumChips<T> extends StatelessWidget {
  const _EnumChips({
    required this.value,
    required this.values,
    required this.onChanged,
  });

  final T value;
  final Map<T, String> values;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: values.entries
            .map(
              (entry) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(entry.value),
                  selected: value == entry.key,
                  onSelected: (_) => onChanged(entry.key),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _Filters extends StatelessWidget {
  const _Filters({
    required this.gender,
    required this.category,
    required this.onGender,
    required this.onCategory,
  });

  final String gender;
  final String category;
  final ValueChanged<String> onGender;
  final ValueChanged<String> onCategory;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _Chips(
          value: gender,
          values: const {
            'all': 'Hammasi',
            'women': 'Ayollar',
            'men': 'Erkaklar',
            'kids': 'Bolalar',
          },
          onChanged: onGender,
        ),
        const SizedBox(height: 8),
        _Chips(
          value: category,
          values: const {
            'all': 'Barchasi',
            'pajamas': 'Pijama',
            'robes': 'Xalat',
            'homewear': 'Uy kiyimi',
            'loungewear': 'Lounge',
          },
          onChanged: onCategory,
        ),
      ],
    );
  }
}

class _Chips extends StatelessWidget {
  const _Chips({
    required this.value,
    required this.values,
    required this.onChanged,
  });

  final String value;
  final Map<String, String> values;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: values.entries
            .map(
              (entry) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(entry.value),
                  selected: value == entry.key,
                  onSelected: (_) => onChanged(entry.key),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _SoftBadge extends StatelessWidget {
  const _SoftBadge({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .94),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: .08),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: milanaBurgundy),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              color: milanaInk,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class LoadMoreCatalogButton extends StatelessWidget {
  const LoadMoreCatalogButton({
    super.key,
    required this.visible,
    required this.total,
    required this.onPressed,
  });

  final int visible;
  final int total;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: FilledButton.tonalIcon(
          onPressed: onPressed,
          icon: const Icon(Icons.keyboard_arrow_down),
          label: Text('Ko‘proq ko‘rsatish · $visible/$total'),
        ),
      ),
    );
  }
}

class ProductCard extends StatelessWidget {
  const ProductCard({
    super.key,
    required this.product,
    required this.isFavorite,
    required this.onOpen,
    required this.onAdd,
    required this.onFavorite,
  });

  final Product product;
  final bool isFavorite;
  final VoidCallback onOpen;
  final VoidCallback? onAdd;
  final VoidCallback onFavorite;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label:
          '${product.name}. ${money.format(product.price)}. Tafsilotlarni ochish',
      child: InkWell(
        onTap: onOpen,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                children: [
                  Positioned.fill(child: ProductImage(product: product)),
                  if (productTagLabel(product).isNotEmpty)
                    Positioned(
                      left: 8,
                      top: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 5,
                        ),
                        color: Colors.white,
                        child: Text(
                          productTagLabel(product).toUpperCase(),
                          style: const TextStyle(
                            fontSize: 9,
                            letterSpacing: 1,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  Positioned(
                    right: 7,
                    top: 7,
                    child: Semantics(
                      button: true,
                      toggled: isFavorite,
                      label: isFavorite
                          ? 'Saqlanganlardan olib tashlash'
                          : 'Saqlash',
                      child: IconButton(
                        onPressed: onFavorite,
                        icon: Icon(
                          isFavorite ? Icons.favorite : Icons.favorite_border,
                          size: 20,
                        ),
                        tooltip: isFavorite
                            ? 'Saqlanganlardan olib tashlash'
                            : 'Saqlash',
                        style: IconButton.styleFrom(
                          backgroundColor: Colors.white.withValues(alpha: .88),
                          foregroundColor: milanaInk,
                          fixedSize: const Size(48, 48),
                        ),
                      ),
                    ),
                  ),
                  if (onAdd != null)
                    Positioned(
                      right: 8,
                      bottom: 8,
                      child: Semantics(
                        button: true,
                        label: '${product.name}, 1 qadoq savatga qo‘shish',
                        child: IconButton.filled(
                          onPressed: onAdd,
                          icon: const Icon(Icons.add_shopping_cart, size: 19),
                          tooltip: '1 qadoq savatga',
                          style: IconButton.styleFrom(
                            backgroundColor: milanaInk,
                            foregroundColor: Colors.white,
                            fixedSize: const Size(48, 48),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 9),
            Text(
              product.name.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11,
                letterSpacing: .8,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              money.format(product.price),
              style: const TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 3),
            Text(
              product.fabric.isEmpty
                  ? qopAvailabilityLabel(product)
                  : product.fabric,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: milanaMuted, fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }
}

class RecentlyViewedRail extends StatelessWidget {
  const RecentlyViewedRail({
    super.key,
    required this.products,
    required this.favorites,
    required this.onOpen,
    required this.onAdd,
    required this.onFavorite,
  });

  final List<Product> products;
  final Set<String> favorites;
  final ValueChanged<Product> onOpen;
  final ValueChanged<Product> onAdd;
  final ValueChanged<Product> onFavorite;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 600;
    final cardWidth = compact ? 196.0 : 224.0;
    return Semantics(
      container: true,
      label: 'Yaqinda ko‘rilgan mahsulotlar',
      child: SizedBox(
        height: compact ? 330 : 375,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: products.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (context, index) {
            final product = products[index];
            return SizedBox(
              width: cardWidth,
              child: ProductCard(
                product: product,
                isFavorite: favorites.contains(product.id),
                onOpen: () => onOpen(product),
                onAdd: isOutOfQop(product) ? null : () => onAdd(product),
                onFavorite: () => onFavorite(product),
              ),
            );
          },
        ),
      ),
    );
  }
}

class ProductImage extends StatelessWidget {
  const ProductImage({
    super.key,
    required this.product,
    this.image,
    this.fit = BoxFit.cover,
  });

  final Product product;
  final String? image;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final imageUrl = image != null && image!.isNotEmpty
        ? resolveImageUrl(image!)
        : product.images.isEmpty
        ? ''
        : resolveImageUrl(product.images.first);
    if (imageUrl.isEmpty) {
      return const ColoredBox(
        color: milanaSand,
        child: Center(child: Icon(Icons.image_not_supported_outlined)),
      );
    }
    return Semantics(
      image: true,
      label: '${product.name} mahsulot rasmi',
      child: CachedNetworkImage(
        imageUrl: imageUrl,
        width: double.infinity,
        fit: fit,
        fadeInDuration: const Duration(milliseconds: 180),
        fadeOutDuration: const Duration(milliseconds: 90),
        memCacheWidth: 900,
        maxWidthDiskCache: 1200,
        placeholder: (context, url) => const ProductImagePlaceholder(),
        errorWidget: (context, url, error) => const ProductImageFallback(),
        imageBuilder: (context, provider) => DecoratedBox(
          decoration: BoxDecoration(
            image: DecorationImage(image: provider, fit: fit),
          ),
        ),
      ),
    );
  }
}

class ProductImagePlaceholder extends StatelessWidget {
  const ProductImagePlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: milanaSand,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Align(
            alignment: Alignment.topLeft,
            child: Container(
              margin: const EdgeInsets.all(10),
              width: 54,
              height: 8,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .65),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
          Center(
            child: Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .82),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.hourglass_empty,
                color: milanaBurgundy,
                size: 20,
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              height: 38,
              margin: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .42),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ProductImageFallback extends StatelessWidget {
  const ProductImageFallback({super.key});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: milanaSand,
      child: Center(
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .78),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(Icons.broken_image_outlined, color: milanaInk),
        ),
      ),
    );
  }
}

class AssistantSheet extends StatefulWidget {
  const AssistantSheet({
    super.key,
    required this.assistant,
    required this.onProduct,
    required this.onAdd,
  });

  final AssistantService assistant;
  final ValueChanged<Product> onProduct;
  final ValueChanged<Product> onAdd;

  @override
  State<AssistantSheet> createState() => _AssistantSheetState();
}

class _AssistantSheetState extends State<AssistantSheet> {
  final controller = TextEditingController();
  final messages = <_AssistantMessage>[
    const _AssistantMessage(
      text:
          'Salom. Model, narx, qop qoidasi yoki yetkazib berish bo‘yicha so‘rashingiz mumkin.',
      fromUser: false,
    ),
  ];
  List<Product> products = const <Product>[];
  int? sessionId;
  bool sending = false;

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      padding: EdgeInsets.only(bottom: inset),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .86,
        minChildSize: .55,
        maxChildSize: .96,
        builder: (context, scrollController) {
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                        color: milanaInk.withValues(alpha: .18),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                      tooltip: 'Yopish',
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: milanaBurgundy,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(
                            Icons.auto_awesome,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Milana AI yordamchi',
                                style: Theme.of(context).textTheme.titleLarge
                                    ?.copyWith(fontWeight: FontWeight.w900),
                              ),
                              Text(
                                'Katalog va ulgurji savollar uchun tez javob.',
                                style: TextStyle(
                                  color: milanaInk.withValues(alpha: .6),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _AssistantQuickChip(
                          label: 'Qop qoidasi',
                          onTap: () => _send('Qop qoidasi qanday?'),
                        ),
                        _AssistantQuickChip(
                          label: 'Yetkazish',
                          onTap: () => _send('Yetkazib berish qancha vaqt?'),
                        ),
                        _AssistantQuickChip(
                          label: 'Erkaklar modeli',
                          onTap: () => _send('Erkaklar uchun paxta model top'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    ...messages.map((message) => _AssistantBubble(message)),
                    if (sending)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 10),
                        child: LinearProgressIndicator(minHeight: 3),
                      ),
                    if (products.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      SectionHeader(
                        title: 'Tavsiya qilingan modellar',
                        trailing: '${products.length} model',
                      ),
                      const SizedBox(height: 10),
                      ...products
                          .take(3)
                          .map(
                            (product) => AssistantProductResult(
                              product: product,
                              onOpen: () {
                                Navigator.of(context).pop();
                                widget.onProduct(product);
                              },
                              onAdd: () => widget.onAdd(product),
                            ),
                          ),
                    ],
                  ],
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: controller,
                          minLines: 1,
                          maxLines: 3,
                          textInputAction: TextInputAction.send,
                          onSubmitted: _send,
                          decoration: const InputDecoration(
                            hintText: 'Savolingizni yozing...',
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Semantics(
                        button: true,
                        label: 'Xabarni yuborish',
                        child: IconButton.filled(
                          onPressed: sending
                              ? null
                              : () => _send(controller.text),
                          icon: const Icon(Icons.send_outlined),
                          tooltip: 'Xabarni yuborish',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _send(String text) async {
    final message = text.trim();
    if (message.length < 2 || sending) return;
    controller.clear();
    setState(() {
      sending = true;
      messages.add(_AssistantMessage(text: message, fromUser: true));
    });
    try {
      final reply = await widget.assistant.send(
        message: message,
        sessionId: sessionId,
        lang: 'uz',
      );
      if (!mounted) return;
      setState(() {
        sessionId = reply.sessionId ?? sessionId;
        products = reply.products;
        messages.add(_AssistantMessage(text: reply.reply, fromUser: false));
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        messages.add(
          const _AssistantMessage(
            text:
                'Hozir AI javob bera olmadi. Menejerga yozing yoki birozdan keyin qayta urinib ko‘ring.',
            fromUser: false,
          ),
        );
      });
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }
}

class _AssistantMessage {
  const _AssistantMessage({required this.text, required this.fromUser});

  final String text;
  final bool fromUser;
}

class _AssistantBubble extends StatelessWidget {
  const _AssistantBubble(this.message);

  final _AssistantMessage message;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: message.fromUser
          ? Alignment.centerRight
          : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * .78,
        ),
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: message.fromUser ? milanaBurgundy : Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: message.fromUser
              ? null
              : Border.all(color: milanaInk.withValues(alpha: .08)),
        ),
        child: Text(
          message.text,
          style: TextStyle(
            color: message.fromUser ? Colors.white : milanaInk,
            height: 1.35,
          ),
        ),
      ),
    );
  }
}

class _AssistantQuickChip extends StatelessWidget {
  const _AssistantQuickChip({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: const Icon(Icons.bolt_outlined, size: 18),
      label: Text(label),
      onPressed: onTap,
    );
  }
}

class AssistantProductResult extends StatelessWidget {
  const AssistantProductResult({
    super.key,
    required this.product,
    required this.onOpen,
    required this.onAdd,
  });

  final Product product;
  final VoidCallback onOpen;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(
                  width: 72,
                  height: 92,
                  child: ProductImage(product: product),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${genderLabel(product.gender)} · ${categoryLabel(product.category)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: milanaInk.withValues(alpha: .6)),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      money.format(product.price),
                      style: const TextStyle(
                        color: milanaBurgundy,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton.filledTonal(
                onPressed: isOutOfQop(product) ? null : onAdd,
                icon: const Icon(Icons.add_shopping_cart_outlined),
                tooltip: 'Savatga',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ProductSheet extends StatefulWidget {
  const ProductSheet({
    super.key,
    required this.product,
    required this.relatedProducts,
    required this.onAdd,
    required this.onOpenRelated,
    required this.onAddRelated,
  });

  final Product product;
  final List<Product> relatedProducts;
  final bool Function(CartItem) onAdd;
  final ValueChanged<Product> onOpenRelated;
  final ValueChanged<Product> onAddRelated;

  @override
  State<ProductSheet> createState() => _ProductSheetState();
}

class _ProductSheetState extends State<ProductSheet> {
  int imageIndex = 0;
  int packageCount = 1;
  String unitType = packUnitType;
  bool addedRecently = false;
  late final PageController imageController;

  @override
  void initState() {
    super.initState();
    imageController = PageController();
  }

  @override
  void dispose() {
    imageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final maxPackages = packageUiLimit(product, unitType: unitType);
    final selectedPackages = packageCount
        .clamp(1, maxPackages < 1 ? 1 : maxPackages)
        .toInt();
    final item = CartItem(
      product: product,
      quantity: selectedPackages,
      unitType: unitType,
    );
    final images = product.images.isEmpty ? const <String>[] : product.images;
    final mix = item.sizeMix
        .map((row) => '${row['size']} × ${row['qty']}')
        .join(', ');
    final specs = productSpecs(product, item);
    final highlights = productHighlights(product);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .94,
      builder: (context, controller) {
        return Column(
          children: [
            Expanded(
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
                children: [
                  Center(
                    child: Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                        color: milanaInk.withValues(alpha: .18),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  AspectRatio(
                    aspectRatio: 4 / 5,
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: PageView.builder(
                              controller: imageController,
                              itemCount: images.isEmpty ? 1 : images.length,
                              onPageChanged: (index) =>
                                  setState(() => imageIndex = index),
                              itemBuilder: (context, index) => GestureDetector(
                                onTap: images.isEmpty
                                    ? null
                                    : () => _openFullScreenGallery(images),
                                child: ProductImage(
                                  product: product,
                                  image: images.isEmpty ? null : images[index],
                                  fit: BoxFit.contain,
                                ),
                              ),
                            ),
                          ),
                        ),
                        if (images.length > 1) ...[
                          Positioned(
                            left: 10,
                            top: 0,
                            bottom: 0,
                            child: Center(
                              child: IconButton.filledTonal(
                                onPressed: imageIndex == 0
                                    ? null
                                    : () => _showImage(imageIndex - 1),
                                icon: const Icon(Icons.chevron_left),
                                tooltip: 'Oldingi rasm',
                              ),
                            ),
                          ),
                          Positioned(
                            right: 10,
                            top: 0,
                            bottom: 0,
                            child: Center(
                              child: IconButton.filledTonal(
                                onPressed: imageIndex == images.length - 1
                                    ? null
                                    : () => _showImage(imageIndex + 1),
                                icon: const Icon(Icons.chevron_right),
                                tooltip: 'Keyingi rasm',
                              ),
                            ),
                          ),
                          Positioned(
                            right: 12,
                            bottom: 12,
                            child: _SoftBadge(
                              icon: Icons.photo_library_outlined,
                              label: '${imageIndex + 1}/${images.length}',
                            ),
                          ),
                        ],
                        Positioned(
                          left: 12,
                          top: 12,
                          child: _SoftBadge(
                            icon: product.availableQop == null
                                ? Icons.verified_outlined
                                : Icons.inventory_2_outlined,
                            label: product.availableQop == null
                                ? 'Premium'
                                : qopAvailabilityLabel(product),
                          ),
                        ),
                        Positioned(
                          right: 12,
                          top: 12,
                          child: _SoftBadge(
                            icon: Icons.attach_money,
                            label: '${money.format(product.price)} dona',
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (images.length > 1) ...[
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 72,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: images.length,
                        separatorBuilder: (context, index) =>
                            const SizedBox(width: 8),
                        itemBuilder: (context, index) {
                          final selected = index == imageIndex;
                          return GestureDetector(
                            onTap: () => _showImage(index),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              width: 56,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: selected
                                      ? milanaBurgundy
                                      : Colors.transparent,
                                  width: 2,
                                ),
                              ),
                              clipBehavior: Clip.antiAlias,
                              child: ProductImage(
                                product: product,
                                image: images[index],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              product.name,
                              style: Theme.of(context).textTheme.headlineSmall
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${genderLabel(product.gender)} · ${categoryLabel(product.category)}',
                              style: TextStyle(
                                color: milanaInk.withValues(alpha: .58),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        money.format(product.price),
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(
                              color: milanaBurgundy,
                              fontWeight: FontWeight.w900,
                            ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Buyurtma formatini tanlang',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  OrderUnitSelector(
                    product: product,
                    value: unitType,
                    onChanged: (value) => setState(() {
                      unitType = value;
                      packageCount = 1;
                    }),
                  ),
                  const SizedBox(height: 10),
                  WholesaleDetailPanel(item: item, mix: mix),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () {
                      Clipboard.setData(
                        ClipboardData(
                          text: productInquiryShareText(product, item: item),
                        ),
                      );
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Model ma’lumoti nusxalandi'),
                        ),
                      );
                    },
                    icon: const Icon(Icons.copy_all_outlined),
                    label: const Text('Model ma’lumotini nusxalash'),
                  ),
                  const SizedBox(height: 14),
                  ProductSpecGrid(specs: specs),
                  const SizedBox(height: 14),
                  if (product.fabric.isNotEmpty)
                    Text(
                      product.fabric,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  if (product.description.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(product.description),
                    ),
                  const SizedBox(height: 14),
                  ProductHighlightList(highlights: highlights),
                  if (widget.relatedProducts.isNotEmpty) ...[
                    const SizedBox(height: 22),
                    SectionHeader(
                      title: 'Mos modellar',
                      trailing: '${widget.relatedProducts.length} model',
                    ),
                    const SizedBox(height: 10),
                    FeaturedProductsRail(
                      products: widget.relatedProducts,
                      badgeIcon: Icons.style_outlined,
                      badgeLabel: 'Mos',
                      onOpen: (related) {
                        Navigator.of(context).pop();
                        widget.onOpenRelated(related);
                      },
                      onAdd: widget.onAddRelated,
                    ),
                  ],
                ],
              ),
            ),
            _ProductPurchaseBar(
              item: item,
              value: selectedPackages,
              max: maxPackages,
              added: addedRecently,
              onChanged: (value) => setState(() => packageCount = value),
              onAdd: () => _addToCart(item),
            ),
          ],
        );
      },
    );
  }

  void _addToCart(CartItem item) {
    if (!widget.onAdd(item)) return;
    setState(() => addedRecently = true);
    unawaited(
      Future<void>.delayed(const Duration(seconds: 2)).then((_) {
        if (mounted) setState(() => addedRecently = false);
      }),
    );
  }

  void _showImage(int index) {
    if (!imageController.hasClients) return;
    imageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _openFullScreenGallery(List<String> images) async {
    final selected = await showDialog<int>(
      context: context,
      barrierColor: Colors.black,
      builder: (context) => ProductGalleryDialog(
        product: widget.product,
        images: images,
        initialIndex: imageIndex,
      ),
    );
    if (selected != null && mounted) _showImage(selected);
  }
}

class _ProductPurchaseBar extends StatelessWidget {
  const _ProductPurchaseBar({
    required this.item,
    required this.value,
    required this.max,
    required this.added,
    required this.onChanged,
    required this.onAdd,
  });

  final CartItem item;
  final int value;
  final int max;
  final bool added;
  final ValueChanged<int> onChanged;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 12,
      shadowColor: Colors.black26,
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Row(
          children: [
            QuantityStepper(
              value: value,
              max: max < 1 ? 1 : max,
              onChanged: onChanged,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.icon(
                onPressed: max < 1 ? null : onAdd,
                icon: Icon(
                  added
                      ? Icons.check_circle_outline
                      : Icons.shopping_bag_outlined,
                ),
                label: Text(
                  max < 1
                      ? 'Mavjud emas'
                      : added
                      ? 'Savatga qo‘shildi'
                      : '${money.format(item.lineTotal)} · savatga',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class OrderUnitSelector extends StatelessWidget {
  const OrderUnitSelector({
    super.key,
    required this.product,
    required this.value,
    required this.onChanged,
  });

  final Product product;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final units = product.effectiveOrderUnits;
    return Row(
      children: [
        for (var index = 0; index < units.length; index++) ...[
          if (index > 0) const SizedBox(width: 8),
          Expanded(
            child: _OrderUnitOption(
              unit: units[index],
              selected: units[index].unitType == value,
              onTap: () => onChanged(units[index].unitType),
            ),
          ),
        ],
      ],
    );
  }
}

class _OrderUnitOption extends StatelessWidget {
  const _OrderUnitOption({
    required this.unit,
    required this.selected,
    required this.onTap,
  });

  final ProductOrderUnit unit;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label:
          '${orderUnitLabel(unit.unitType)}, ${unit.pieces} dona, har o‘lchamdan ${unit.perSize} tadan',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          constraints: const BoxConstraints(minHeight: 86),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: selected ? milanaInk : Colors.white,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: selected ? milanaInk : milanaInk.withValues(alpha: .14),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                orderUnitLabel(unit.unitType),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: selected ? Colors.white : milanaInk,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                '${unit.pieces} dona',
                style: TextStyle(
                  color: selected
                      ? Colors.white.withValues(alpha: .76)
                      : milanaInk.withValues(alpha: .64),
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                'Har o‘lchamdan ${unit.perSize} tadan',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: selected
                      ? Colors.white.withValues(alpha: .84)
                      : milanaMuted,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ProductGalleryDialog extends StatefulWidget {
  const ProductGalleryDialog({
    super.key,
    required this.product,
    required this.images,
    required this.initialIndex,
  });

  final Product product;
  final List<String> images;
  final int initialIndex;

  @override
  State<ProductGalleryDialog> createState() => _ProductGalleryDialogState();
}

class _ProductGalleryDialogState extends State<ProductGalleryDialog> {
  late final PageController controller;
  late int index;

  @override
  void initState() {
    super.initState();
    index = widget.initialIndex;
    controller = PageController(initialPage: index);
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => Navigator.of(context).pop(index),
        child: Stack(
          children: [
            Positioned.fill(
              child: PageView.builder(
                controller: controller,
                itemCount: widget.images.length,
                onPageChanged: (value) => setState(() => index = value),
                itemBuilder: (context, imageIndex) => SafeArea(
                  child: InteractiveViewer(
                    minScale: 1,
                    maxScale: 4,
                    child: SizedBox.expand(
                      child: ProductImage(
                        product: widget.product,
                        image: widget.images[imageIndex],
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    IconButton.filledTonal(
                      onPressed: () => Navigator.of(context).pop(index),
                      icon: const Icon(Icons.close),
                      tooltip: 'Yopish',
                    ),
                    const Spacer(),
                    _SoftBadge(
                      icon: Icons.photo_library_outlined,
                      label: '${index + 1}/${widget.images.length}',
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class WholesaleDetailPanel extends StatelessWidget {
  const WholesaleDetailPanel({
    super.key,
    required this.item,
    required this.mix,
  });

  final CartItem item;
  final String mix;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: milanaSand,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.inventory_2_outlined, color: milanaBurgundy),
              const SizedBox(width: 8),
              Text(
                '${orderUnitLabel(item.unitType)} hisobi',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '1 ${orderUnitLabel(item.unitType).toLowerCase()}: ${item.piecesPerUnit} ta kiyim · har o‘lchamdan ${item.orderUnit.perSize} tadan',
          ),
          Text('Tarkib: $mix'),
          const Divider(height: 22),
          Row(
            children: [
              Expanded(child: Text('1 ${orderUnitLabel(item.unitType)} narxi')),
              Text(
                money.format(item.packagePrice),
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class ProductSpecGrid extends StatelessWidget {
  const ProductSpecGrid({super.key, required this.specs});

  final List<ProductSpec> specs;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth > 520 ? 4 : 2;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: specs.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
            childAspectRatio: columns == 4 ? 1.8 : 2.2,
          ),
          itemBuilder: (context, index) => ProductSpecTile(spec: specs[index]),
        );
      },
    );
  }
}

class ProductSpecTile extends StatelessWidget {
  const ProductSpecTile({super.key, required this.spec});

  final ProductSpec spec;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: milanaInk.withValues(alpha: .1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            spec.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: milanaInk.withValues(alpha: .56),
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            spec.value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class ProductHighlightList extends StatelessWidget {
  const ProductHighlightList({super.key, required this.highlights});

  final List<ProductHighlight> highlights;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: highlights
          .map(
            (highlight) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ProductHighlightRow(highlight: highlight),
            ),
          )
          .toList(),
    );
  }
}

class ProductHighlightRow extends StatelessWidget {
  const ProductHighlightRow({super.key, required this.highlight});

  final ProductHighlight highlight;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: milanaBlush,
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(
            Icons.check_circle_outline,
            color: milanaBurgundy,
            size: 20,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                highlight.title,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 2),
              Text(
                highlight.text,
                style: TextStyle(color: milanaInk.withValues(alpha: .66)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class QuantityStepper extends StatelessWidget {
  const QuantityStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.max = 20,
  });

  final int value;
  final ValueChanged<int> onChanged;
  final int max;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: milanaInk.withValues(alpha: .12)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            onPressed: value <= 1 ? null : () => onChanged(value - 1),
            icon: const Icon(Icons.remove),
            tooltip: 'Kamaytirish',
          ),
          SizedBox(
            width: 32,
            child: Text(
              '$value',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          IconButton(
            onPressed: value >= max ? null : () => onChanged(value + 1),
            icon: const Icon(Icons.add),
            tooltip: 'Ko‘paytirish',
          ),
        ],
      ),
    );
  }
}

class CartScreen extends StatefulWidget {
  const CartScreen({
    super.key,
    required this.cart,
    required this.orders,
    required this.auth,
    required this.onOpenCatalog,
  });

  final CartController cart;
  final OrderRepository orders;
  final AuthService auth;
  final VoidCallback onOpenCatalog;

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final phone = TextEditingController();
  final city = TextEditingController();
  final address = TextEditingController();
  final comment = TextEditingController();
  String payment = 'manager';
  List<CheckoutManager> managers = const [];
  int? managerId;
  bool managersLoading = true;
  String? managersError;
  bool sending = false;
  bool commerceSyncing = false;
  OrderReceipt? receipt;
  String? pendingClientOrderId;
  String _boundCustomerId = '__unbound__';
  final checkoutRecovery = CheckoutRecoveryStore();
  int checkoutRecoveryGeneration = 0;

  @override
  void initState() {
    super.initState();
    _loadManagers();
  }

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    city.dispose();
    address.dispose();
    comment.dispose();
    super.dispose();
  }

  Future<void> _loadManagers() async {
    setState(() {
      managersLoading = true;
      managersError = null;
    });
    try {
      final rows = await widget.orders.loadManagers();
      if (!mounted) return;
      setState(() {
        managers = rows;
        if (!isCheckoutManagerSelected(managerId, rows)) {
          managerId = null;
        }
        managersError = rows.isEmpty ? 'Hozircha faol menejer yo‘q.' : null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        managers = const [];
        managerId = null;
        managersError = 'Menejerlar ro‘yxati ochilmadi.';
      });
    } finally {
      if (mounted) setState(() => managersLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([widget.cart, widget.auth]),
      builder: (context, _) {
        final viewportWidth = MediaQuery.sizeOf(context).width;
        final contentInset = viewportWidth > 792
            ? (viewportWidth - 760) / 2
            : 16.0;
        final customer = widget.auth.customer;
        _bindCheckoutIdentity(customer);
        final commerceBlocked =
            customer != null &&
            widget.auth.firebaseEnabled &&
            !widget.auth.commerceAccountReady;
        if (receipt != null) {
          return _ReceiptView(receipt: receipt!, onContinue: _dismissReceipt);
        }
        if (!widget.cart.ready) {
          return Center(
            child: Semantics(
              liveRegion: true,
              label: 'Savat yuklanmoqda',
              child: const CircularProgressIndicator(),
            ),
          );
        }
        if (widget.cart.items.isEmpty) {
          return _EmptyState(
            icon: Icons.shopping_bag_outlined,
            title: 'Savat bo‘sh',
            message: 'Katalogdan qadoq yoki qop tanlab qo‘shing.',
            action: FilledButton.icon(
              onPressed: widget.onOpenCatalog,
              icon: const Icon(Icons.storefront_outlined),
              label: const Text('Katalogga o‘tish'),
            ),
          );
        }
        if (!widget.auth.firebaseEnabled && !widget.auth.localDemoEnabled) {
          return const _EmptyState(
            icon: Icons.person_off_outlined,
            title: 'Akkaunt xizmati sozlanmoqda',
            message:
                'Katalog va savatdan akkauntsiz foydalanishingiz mumkin. Akkaunt xizmati tez orada ishga tushadi.',
          );
        }
        return ListView(
          padding: EdgeInsets.fromLTRB(contentInset, 16, contentInset, 24),
          children: [
            CartSummaryPanel(
              packageCount: widget.cart.count,
              pieceCount: widget.cart.pieceCount,
              packCount: widget.cart.packCount,
              bagCount: widget.cart.bagCount,
              modelCount: widget.cart.items.length,
              total: widget.cart.total,
            ),
            const SizedBox(height: 14),
            ...widget.cart.items.map(
              (item) => CartLine(item: item, cart: widget.cart),
            ),
            const SizedBox(height: 12),
            _TotalPanel(
              total: widget.cart.total,
              packageCount: widget.cart.count,
              pieceCount: widget.cart.pieceCount,
            ),
            if (commerceBlocked) ...[
              const SizedBox(height: 14),
              CommerceCheckoutNotice(
                state: widget.auth.commerceAccountState,
                busy: commerceSyncing,
                onRetry: _refreshCommerceAccount,
              ),
            ],
            const SizedBox(height: 16),
            Form(
              key: formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Buyurtma ma’lumotlari',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'Ismingiz'),
                    validator: _required,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: phone,
                    decoration: const InputDecoration(labelText: 'Telefon'),
                    keyboardType: TextInputType.phone,
                    validator: validatePhone,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: city,
                    decoration: const InputDecoration(labelText: 'Shahar'),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: address,
                    decoration: const InputDecoration(labelText: 'Manzil'),
                  ),
                  const SizedBox(height: 10),
                  if (managersLoading)
                    const InputDecorator(
                      decoration: InputDecoration(labelText: 'Menejer'),
                      child: LinearProgressIndicator(),
                    )
                  else
                    DropdownButtonFormField<int>(
                      initialValue: managerId,
                      decoration: const InputDecoration(
                        labelText: 'Menejerni tanlang',
                      ),
                      items: managers
                          .map(
                            (manager) => DropdownMenuItem(
                              value: manager.id,
                              child: Text(manager.name),
                            ),
                          )
                          .toList(),
                      onChanged: managers.isEmpty
                          ? null
                          : (value) => setState(() => managerId = value),
                      validator: (value) =>
                          value == null ? 'Menejerni tanlang' : null,
                    ),
                  if (managersError != null) ...[
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            managersError!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ),
                        TextButton(
                          onPressed: managersLoading ? null : _loadManagers,
                          child: const Text('Qayta urinish'),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: payment,
                    decoration: const InputDecoration(
                      labelText: 'To‘lov usuli',
                    ),
                    items: [
                      DropdownMenuItem(
                        value: 'manager',
                        child: Text(paymentMethodLabel('manager')),
                      ),
                      DropdownMenuItem(
                        value: 'bank',
                        child: Text(paymentMethodLabel('bank')),
                      ),
                      DropdownMenuItem(
                        value: 'click',
                        child: Text(paymentMethodLabel('click')),
                      ),
                      DropdownMenuItem(
                        value: 'payme',
                        child: Text(paymentMethodLabel('payme')),
                      ),
                      DropdownMenuItem(
                        value: 'card',
                        child: Text(paymentMethodLabel('card')),
                      ),
                      DropdownMenuItem(
                        value: 'cash',
                        child: Text(paymentMethodLabel('cash')),
                      ),
                    ],
                    onChanged: (value) =>
                        setState(() => payment = value ?? 'manager'),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: comment,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'Izoh'),
                  ),
                  const SizedBox(height: 12),
                  PaymentNotice(
                    title: paymentMethodLabel(payment),
                    message: paymentInstructions(payment),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        'Buyurtmani yuborishda aloqa va yetkazib berish ma’lumotlari Milana Premium’ga uzatiladi.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: milanaInk.withValues(alpha: .64),
                        ),
                      ),
                      TextButton(
                        onPressed: _openCheckoutPrivacy,
                        child: const Text('Maxfiylik'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed:
                        sending ||
                            managersLoading ||
                            managers.isEmpty ||
                            commerceBlocked
                        ? null
                        : _submit,
                    icon: sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.check),
                    label: const Text('Buyurtmani yuborish'),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  String? _required(String? value) =>
      (value ?? '').trim().length < 2 ? 'Majburiy' : null;

  void _bindCheckoutIdentity(Customer? customer) {
    final nextId = customer?.id ?? '';
    if (_boundCustomerId == nextId) return;
    _boundCustomerId = nextId;
    name.text = customer?.name ?? '';
    phone.text = customer?.phone ?? '';
    city.text = customer?.city ?? '';
    address.text = customer?.address ?? '';
    comment.clear();
    payment = 'manager';
    pendingClientOrderId = null;
    receipt = null;
    final generation = ++checkoutRecoveryGeneration;
    unawaited(_restoreCheckoutRecovery(nextId, generation));
  }

  Future<void> _restoreCheckoutRecovery(String scope, int generation) async {
    final recovered = await checkoutRecovery.load(scope: scope);
    if (!mounted ||
        generation != checkoutRecoveryGeneration ||
        _boundCustomerId != scope) {
      return;
    }
    setState(() {
      pendingClientOrderId = recovered.pendingClientOrderId;
      receipt = recovered.receipt;
    });
  }

  Future<void> _dismissReceipt() async {
    final scope = _boundCustomerId;
    setState(() => receipt = null);
    try {
      await checkoutRecovery.clear(scope: scope);
    } catch (_) {
      if (!mounted || _boundCustomerId != scope) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Chek qurilmadan o‘chirilmadi. Keyinroq qayta urinib ko‘ring.',
          ),
        ),
      );
    }
  }

  Future<void> _submit() async {
    if (widget.auth.signedIn &&
        widget.auth.firebaseEnabled &&
        !widget.auth.commerceAccountReady) {
      await _refreshCommerceAccount();
      return;
    }
    if (!formKey.currentState!.validate()) return;
    final selectedManagerId = managerId;
    if (selectedManagerId == null ||
        !isCheckoutManagerSelected(selectedManagerId, managers)) {
      return;
    }
    setState(() => sending = true);
    final initiatingCustomerId = widget.auth.customer?.id;
    try {
      final customer = widget.auth.customer;
      final clientOrderId = pendingClientOrderId ?? createClientOrderId();
      pendingClientOrderId = clientOrderId;
      await checkoutRecovery.savePending(
        clientOrderId,
        scope: _boundCustomerId,
      );
      final result = await widget.orders.placeOrder(
        CheckoutRequest(
          name: name.text.trim(),
          phone: normalizePhoneNumber(phone.text),
          city: city.text.trim(),
          address: address.text.trim(),
          comment: comment.text.trim(),
          paymentMethod: payment,
          managerId: selectedManagerId,
          customerEmail: customer?.email ?? '',
          customerId: customer?.id,
          clientOrderId: clientOrderId,
          items: widget.cart.items,
        ),
      );
      if (!mounted || widget.auth.customer?.id != initiatingCustomerId) return;
      widget.cart.clear();
      pendingClientOrderId = null;
      setState(() => receipt = result);
      try {
        await checkoutRecovery.saveReceipt(result, scope: _boundCustomerId);
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Buyurtma yaratildi, lekin chek qurilmada saqlanmadi.',
              ),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Buyurtma yuborilmadi: $e')));
      }
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Future<void> _refreshCommerceAccount() async {
    if (commerceSyncing) return;
    setState(() => commerceSyncing = true);
    try {
      if (widget.auth.commerceAccountState ==
          CommerceAccountState.emailVerificationRequired) {
        await widget.auth.refreshEmailVerification();
      } else {
        await widget.auth.retryCommerceAccount();
      }
      if (mounted && !widget.auth.commerceAccountReady) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Emailni tasdiqlang, so‘ng “Tekshirish” tugmasini bosing.',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(authErrorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => commerceSyncing = false);
    }
  }

  Future<void> _openCheckoutPrivacy() async {
    try {
      await openPublicUrl(privacyPolicyUrl);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Maxfiylik hujjati hozircha ochilmadi.')),
      );
    }
  }
}

class CommerceCheckoutNotice extends StatelessWidget {
  const CommerceCheckoutNotice({
    super.key,
    required this.state,
    required this.busy,
    required this.onRetry,
  });

  final CommerceAccountState state;
  final bool busy;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final verifying = state == CommerceAccountState.emailVerificationRequired;
    final syncing = state == CommerceAccountState.syncing;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: milanaBlush,
        border: Border.all(color: milanaBurgundy.withValues(alpha: .18)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            verifying ? Icons.mark_email_unread_outlined : Icons.sync_outlined,
            color: milanaBurgundy,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  verifying
                      ? 'Email tasdiqlanishi kerak'
                      : 'Akkaunt buyurtmalar bilan bog‘lanmoqda',
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 4),
                Text(
                  verifying
                      ? 'Tasdiqlangan email buyurtmani profilingizda ko‘rsatadi va uni xavfsiz boshqarish imkonini beradi.'
                      : 'Buyurtma anonim bo‘lib qolmasligi uchun bog‘lanish yakunlanishini kuting.',
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: busy || syncing ? null : onRetry,
                  icon: busy || syncing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh, size: 18),
                  label: Text(
                    verifying ? 'Tasdiqlashni tekshirish' : 'Qayta ulash',
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class CartLine extends StatelessWidget {
  const CartLine({super.key, required this.item, required this.cart});

  final CartItem item;
  final CartController cart;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          children: [
            SizedBox(
              width: 76,
              height: 96,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: ProductImage(product: item.product),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.product.name,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(
                    'Dona: ${money.format(item.product.price)} · 1 ${orderUnitLabel(item.unitType).toLowerCase()}: ${money.format(item.packagePrice)}',
                  ),
                  Text(
                    item.sizeMix
                        .map((row) => '${row['size']}×${row['qty']}')
                        .join(', '),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Row(
                    children: [
                      QuantityStepper(
                        value: item.quantity,
                        max: cart.quantityLimit(
                          item.product,
                          unitType: item.unitType,
                        ),
                        onChanged: (value) => cart.setItemQuantity(item, value),
                      ),
                      const Spacer(),
                      IconButton(
                        onPressed: () {
                          cart.removeItem(item);
                          HapticFeedback.mediumImpact();
                          ScaffoldMessenger.of(context)
                            ..hideCurrentSnackBar()
                            ..showSnackBar(
                              SnackBar(
                                content: Text(
                                  '${item.product.name} o‘chirildi',
                                ),
                                action: SnackBarAction(
                                  label: 'QAYTARISH',
                                  textColor: Colors.white,
                                  onPressed: () {
                                    if (cart.canAdd(
                                      item.product,
                                      quantity: item.quantity,
                                      unitType: item.unitType,
                                    )) {
                                      cart.addItem(item);
                                    }
                                  },
                                ),
                              ),
                            );
                        },
                        icon: const Icon(Icons.delete_outline),
                        color: milanaInk.withValues(alpha: .62),
                        tooltip: 'O‘chirish',
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      Text(
                        '${item.quantity} ${orderUnitLabel(item.unitType).toLowerCase()} · ${item.pieceCount} ta kiyim',
                        style: TextStyle(
                          color: milanaInk.withValues(alpha: .6),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        money.format(item.lineTotal),
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              color: milanaBurgundy,
                              fontWeight: FontWeight.w800,
                            ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class CartSummaryPanel extends StatelessWidget {
  const CartSummaryPanel({
    super.key,
    required this.packageCount,
    required this.pieceCount,
    required this.packCount,
    required this.bagCount,
    required this.modelCount,
    required this.total,
  });

  final int packageCount;
  final int pieceCount;
  final int packCount;
  final int bagCount;
  final int modelCount;
  final double total;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: milanaInk,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.shopping_bag, color: Colors.white, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Buyurtma savati',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$modelCount model · $packageCount birlik · $pieceCount dona\n$packCount qadoq · $bagCount qop',
                  style: TextStyle(color: Colors.white.withValues(alpha: .72)),
                ),
              ],
            ),
          ),
          Text(
            money.format(total),
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _TotalPanel extends StatelessWidget {
  const _TotalPanel({
    required this.total,
    required this.packageCount,
    required this.pieceCount,
  });

  final double total;
  final int packageCount;
  final int pieceCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: milanaSand,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(child: Text('Jami mahsulot narxi')),
              Text(
                money.format(total),
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '$packageCount buyurtma birligi · $pieceCount dona kiyim. Yetkazib berish Cargo bilan kelishiladi.',
            style: TextStyle(color: milanaInk.withValues(alpha: .68)),
          ),
        ],
      ),
    );
  }
}

class PaymentNotice extends StatelessWidget {
  const PaymentNotice({super.key, required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xfffff7e8),
        border: Border.all(color: const Color(0xffe2cfaa)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.payments_outlined, color: Color(0xff6b1f34)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 4),
                Text(message),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReceiptView extends StatelessWidget {
  const _ReceiptView({required this.receipt, required this.onContinue});

  final OrderReceipt receipt;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.check_circle,
                  size: 72,
                  color: Color(0xff2f7d55),
                ),
                const SizedBox(height: 12),
                Text(
                  'Buyurtma qabul qilindi',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 14),
                ReceiptSummaryCard(receipt: receipt),
                const SizedBox(height: 14),
                PaymentNotice(
                  title: receipt.paymentLabel,
                  message: receipt.paymentInstructions.isEmpty
                      ? paymentInstructions(receipt.paymentMethod)
                      : receipt.paymentInstructions,
                ),
                if (receipt.paymentReference.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  PaymentReferencePanel(receipt: receipt),
                ],
                const SizedBox(height: 18),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () {
                        Clipboard.setData(
                          ClipboardData(text: orderReceiptShareText(receipt)),
                        );
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Buyurtma cheki nusxalandi'),
                          ),
                        );
                      },
                      icon: const Icon(Icons.copy_all_outlined),
                      label: const Text('Chekni nusxalash'),
                    ),
                    FilledButton(
                      onPressed: onContinue,
                      child: const Text('Davom etish'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class ReceiptSummaryCard extends StatelessWidget {
  const ReceiptSummaryCard({super.key, required this.receipt});

  final OrderReceipt receipt;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: milanaInk.withValues(alpha: .1)),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: milanaInk.withValues(alpha: .04),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          ReceiptSummaryRow(label: 'Raqam', value: receipt.number),
          const Divider(height: 18),
          ReceiptSummaryRow(label: 'Jami', value: money.format(receipt.total)),
          const Divider(height: 18),
          ReceiptSummaryRow(
            label: 'To‘lov holati',
            value: paymentStatusLabel(receipt.paymentStatus),
          ),
          const Divider(height: 18),
          ReceiptSummaryRow(label: 'Menejer', value: receipt.supportPhone),
        ],
      ),
    );
  }
}

class ReceiptSummaryRow extends StatelessWidget {
  const ReceiptSummaryRow({
    super.key,
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: milanaInk.withValues(alpha: .58),
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        Flexible(
          child: SelectableText(
            value,
            textAlign: TextAlign.end,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ),
      ],
    );
  }
}

class PaymentReferencePanel extends StatelessWidget {
  const PaymentReferencePanel({super.key, required this.receipt});

  final OrderReceipt receipt;

  @override
  Widget build(BuildContext context) {
    final expiresAt = receipt.paymentExpiresAt;
    final expiresText = expiresAt == null
        ? 'Menejer tasdiqlaguncha faol'
        : '${shortDateTime.format(expiresAt.toLocal())} gacha faol';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: milanaInk.withValues(alpha: .12)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'To‘lov reference',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: milanaInk.withValues(alpha: .62),
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: SelectableText(
                  receipt.paymentReference,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: milanaBurgundy,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
              IconButton.filledTonal(
                onPressed: () {
                  Clipboard.setData(
                    ClipboardData(text: receipt.paymentReference),
                  );
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Reference nusxalandi')),
                  );
                },
                icon: const Icon(Icons.copy, size: 18),
                tooltip: 'Nusxalash',
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            expiresText,
            style: TextStyle(color: milanaInk.withValues(alpha: .64)),
          ),
        ],
      ),
    );
  }
}

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key, required this.orders, required this.auth});

  final OrderRepository orders;
  final AuthService auth;

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  final formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final phone = TextEditingController();
  final email = TextEditingController();
  final message = TextEditingController();
  final faqSearch = SearchController();
  String topic = 'general';
  String faqQuery = '';
  bool sending = false;
  bool commerceSyncing = false;
  String _boundCustomerId = '__unbound__';

  @override
  void initState() {
    super.initState();
    _bindSupportIdentity(widget.auth.customer);
    widget.auth.addListener(_handleAuthChanged);
  }

  void _handleAuthChanged() {
    if (!_bindSupportIdentity(widget.auth.customer) || !mounted) return;
    setState(() {});
  }

  bool _bindSupportIdentity(Customer? customer) {
    final nextId = customer?.id ?? '';
    if (_boundCustomerId == nextId) return false;
    _boundCustomerId = nextId;
    name.text = customer?.name ?? '';
    phone.text = customer?.phone ?? '';
    email.text = customer?.email ?? '';
    message.clear();
    topic = 'general';
    return true;
  }

  @override
  void dispose() {
    widget.auth.removeListener(_handleAuthChanged);
    name.dispose();
    phone.dispose();
    email.dispose();
    message.dispose();
    faqSearch.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final customer = widget.auth.customer;
    _bindSupportIdentity(customer);
    final commerceBlocked =
        customer != null &&
        widget.auth.firebaseEnabled &&
        !widget.auth.commerceAccountReady;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Mijozlar qo‘llab-quvvatlovi',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        const Text(
          'Narx, mavjudlik, Cargo, to‘lov yoki brak bo‘yicha savolingizni yuboring. Menejer: +998 50 155 10 10',
        ),
        const SizedBox(height: 16),
        SupportKnowledgePanel(
          query: faqQuery,
          onQueryChanged: (value) => setState(() => faqQuery = value),
          controller: faqSearch,
        ),
        const SizedBox(height: 18),
        if (commerceBlocked) ...[
          CommerceCheckoutNotice(
            state: widget.auth.commerceAccountState,
            busy: commerceSyncing,
            onRetry: _refreshCommerceAccount,
          ),
          const SizedBox(height: 16),
        ],
        Form(
          key: formKey,
          child: Column(
            children: [
              TextFormField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Ism'),
                validator: (v) =>
                    (v ?? '').trim().length < 2 ? 'Majburiy' : null,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: phone,
                decoration: const InputDecoration(labelText: 'Telefon'),
                keyboardType: TextInputType.phone,
                validator: validatePhone,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: email,
                decoration: const InputDecoration(labelText: 'Email'),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: topic,
                decoration: const InputDecoration(labelText: 'Mavzu'),
                items: const [
                  DropdownMenuItem(value: 'general', child: Text('Umumiy')),
                  DropdownMenuItem(value: 'catalog', child: Text('Katalog')),
                  DropdownMenuItem(value: 'price', child: Text('Narx')),
                  DropdownMenuItem(
                    value: 'delivery',
                    child: Text('Yetkazib berish'),
                  ),
                  DropdownMenuItem(value: 'payment', child: Text('To‘lov')),
                  DropdownMenuItem(value: 'defect', child: Text('Brak')),
                ],
                onChanged: (value) =>
                    setState(() => topic = value ?? 'general'),
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: message,
                minLines: 4,
                maxLines: 8,
                decoration: const InputDecoration(labelText: 'Xabar'),
                validator: (v) =>
                    (v ?? '').trim().length < 8 ? 'Xabarni yozing' : null,
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: sending || commerceBlocked ? null : _send,
                  child: const Text('Yuborish'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _send() async {
    if (widget.auth.signedIn &&
        widget.auth.firebaseEnabled &&
        !widget.auth.commerceAccountReady) {
      await _refreshCommerceAccount();
      return;
    }
    if (!formKey.currentState!.validate()) return;
    setState(() => sending = true);
    final initiatingCustomerId = widget.auth.customer?.id;
    try {
      final number = await widget.orders.createSupportTicket(
        SupportTicket(
          name: name.text.trim(),
          phone: normalizePhoneNumber(phone.text),
          email: email.text.trim(),
          topic: topic,
          message: message.text.trim(),
          customerId: widget.auth.customer?.id,
        ),
      );
      if (!mounted || widget.auth.customer?.id != initiatingCustomerId) return;
      message.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Murojaat qabul qilindi: $number')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Yuborilmadi: $e')));
      }
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Future<void> _refreshCommerceAccount() async {
    if (commerceSyncing) return;
    setState(() => commerceSyncing = true);
    try {
      if (widget.auth.commerceAccountState ==
          CommerceAccountState.emailVerificationRequired) {
        await widget.auth.refreshEmailVerification();
      } else {
        await widget.auth.retryCommerceAccount();
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(authErrorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => commerceSyncing = false);
    }
  }
}

class SupportKnowledgePanel extends StatelessWidget {
  const SupportKnowledgePanel({
    super.key,
    required this.query,
    required this.onQueryChanged,
    required this.controller,
  });

  final String query;
  final ValueChanged<String> onQueryChanged;
  final SearchController controller;

  @override
  Widget build(BuildContext context) {
    final faqs = filterSupportFaqs(milanaSupportFaqs, query);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: milanaInk.withValues(alpha: .1)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: milanaBlush,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.help_outline, color: milanaBurgundy),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Tez javoblar',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: () {
                  Clipboard.setData(
                    const ClipboardData(text: milanaSupportPhoneCompact),
                  );
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Telefon nusxalandi')),
                  );
                },
                icon: const Icon(Icons.phone_outlined, size: 18),
                label: const Text('Menejer'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SearchBar(
            controller: controller,
            hintText: 'Savol qidirish',
            leading: const Icon(Icons.search),
            trailing: [
              if (query.trim().isNotEmpty)
                IconButton(
                  onPressed: () {
                    controller.clear();
                    onQueryChanged('');
                  },
                  icon: const Icon(Icons.close),
                  tooltip: 'Tozalash',
                ),
            ],
            onChanged: onQueryChanged,
          ),
          const SizedBox(height: 10),
          if (faqs.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Text('Bu savol bo‘yicha menejerga murojaat yuboring.'),
            )
          else
            ...faqs.map((faq) => SupportFaqTile(faq: faq)),
        ],
      ),
    );
  }
}

class SupportFaqTile extends StatelessWidget {
  const SupportFaqTile({super.key, required this.faq});

  final SupportFaq faq;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(top: 8),
      color: milanaIvory,
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 12),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        collapsedShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
        leading: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(
            Icons.question_answer_outlined,
            color: milanaBurgundy,
            size: 19,
          ),
        ),
        title: Text(
          faq.question,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(faq.topic),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: SelectableText(
              faq.answer,
              style: TextStyle(
                color: milanaInk.withValues(alpha: .72),
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AccountScreen extends StatefulWidget {
  const AccountScreen({
    super.key,
    required this.auth,
    required this.orders,
    required this.cart,
  });

  final AuthService auth;
  final OrderRepository orders;
  final CartController cart;

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final phone = TextEditingController();
  final city = TextEditingController();
  final address = TextEditingController();
  final email = TextEditingController();
  final password = TextEditingController();
  bool signUp = false;
  bool busy = false;
  bool legalAccepted = false;
  int accountRevision = 0;
  String _boundAuthCustomerId = '__unbound__';
  String? _activityCustomerId;
  int _activityRevision = -1;
  Stream<List<OrderSummary>>? _activityOrders;
  Stream<List<SupportTicketSummary>>? _activitySupport;

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    city.dispose();
    address.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.auth,
      builder: (context, _) {
        final customer = widget.auth.customer;
        _bindAuthIdentity(customer);
        if (customer != null) {
          _bindActivityStreams(customer.id);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              AccountDashboardCard(
                customer: customer,
                onEdit: () => _editProfile(customer),
                onSignOut: widget.auth.signOut,
                onDelete: _confirmAccountDeletion,
              ),
              if (widget.auth.firebaseEnabled) ...[
                const SizedBox(height: 12),
                CommerceAccountPanel(
                  state: widget.auth.commerceAccountState,
                  busy: busy,
                  onRefresh: () =>
                      _runCommerceAction(widget.auth.refreshEmailVerification),
                  onResend: () => _runCommerceAction(
                    widget.auth.resendEmailVerification,
                    successMessage: 'Tasdiqlash xati qayta yuborildi.',
                  ),
                  onRetry: () =>
                      _runCommerceAction(widget.auth.retryCommerceAccount),
                ),
              ],
              const SizedBox(height: 12),
              LegalLinksPanel(onOpen: _openLegalUrl),
              const SizedBox(height: 16),
              AccountActivitySection(
                orderStream: _activityOrders!,
                supportStream: _activitySupport!,
                orders: widget.orders,
                cart: widget.cart,
                onRefresh: _refreshAccountActivity,
              ),
            ],
          );
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            AccountAuthForm(
              formKey: formKey,
              signUp: signUp,
              busy: busy,
              name: name,
              phone: phone,
              city: city,
              address: address,
              email: email,
              password: password,
              legalAccepted: legalAccepted,
              onSubmit: _submit,
              onToggleMode: () => setState(() {
                signUp = !signUp;
                legalAccepted = false;
              }),
              onLegalAccepted: (value) => setState(() => legalAccepted = value),
              onOpenLegal: _openLegalUrl,
              onResetPassword: signUp ? null : _resetPassword,
            ),
            const SizedBox(height: 12),
            LegalLinksPanel(onOpen: _openLegalUrl),
            if (widget.auth.localDemoEnabled) ...[
              const SizedBox(height: 12),
              const Text('Dasturchi ko‘rigi uchun lokal demo rejimi yoqilgan.'),
            ],
          ],
        );
      },
    );
  }

  Future<void> _submit() async {
    if (!formKey.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      if (signUp) {
        await widget.auth.signUp(
          name: name.text.trim(),
          phone: normalizePhoneNumber(phone.text),
          city: city.text,
          address: address.text,
          email: normalizeEmail(email.text),
          password: password.text,
          legalAccepted: legalAccepted,
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Akkaunt yaratildi. Email tasdiqlash xati yuborildi.',
              ),
            ),
          );
        }
      } else {
        await widget.auth.signIn(normalizeEmail(email.text), password.text);
      }
      password.clear();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(authErrorMessage(e))));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _bindAuthIdentity(Customer? customer) {
    final nextId = customer?.id ?? '';
    if (_boundAuthCustomerId == nextId) return;
    _boundAuthCustomerId = nextId;
    name.clear();
    phone.clear();
    city.clear();
    address.clear();
    email.clear();
    password.clear();
    legalAccepted = false;
    signUp = false;
    _activityCustomerId = null;
    _activityRevision = -1;
    _activityOrders = null;
    _activitySupport = null;
  }

  void _bindActivityStreams(String customerId) {
    if (_activityCustomerId == customerId &&
        _activityRevision == accountRevision) {
      return;
    }
    _activityCustomerId = customerId;
    _activityRevision = accountRevision;
    _activityOrders = widget.orders.customerOrders(customerId);
    _activitySupport = widget.orders.customerSupportTickets(customerId);
  }

  void _refreshAccountActivity() {
    setState(() {
      accountRevision += 1;
      _activityCustomerId = null;
    });
  }

  Future<void> _openLegalUrl(String url) async {
    try {
      await openPublicUrl(url);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Hujjat havolasi hozircha ochilmadi.')),
      );
    }
  }

  Future<void> _runCommerceAction(
    Future<void> Function() action, {
    String? successMessage,
  }) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
      if (mounted && successMessage != null) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(successMessage)));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(authErrorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _confirmAccountDeletion() async {
    final confirmation = TextEditingController();
    var deleting = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          scrollable: true,
          icon: Icon(
            Icons.warning_amber_rounded,
            color: Theme.of(context).colorScheme.error,
          ),
          title: const Text('Akkauntni o‘chirish'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Profil, saqlangan modellar va sinxronlangan savat o‘chiriladi. Buyurtma va to‘lov yozuvlarini o‘chirish yoki shaxssizlantirish talabi ommaviy o‘chirish sahifasida ko‘rsatilgan tartibda ko‘rib chiqiladi. Qonun talab qilgan tranzaksiya yozuvlari belgilangan muddat saqlanishi mumkin.',
                ),
                const SizedBox(height: 12),
                TextButton.icon(
                  onPressed: deleting
                      ? null
                      : () => _openLegalUrl(accountDeletionUrl),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: const Text('O‘chirish qoidalarini ko‘rish'),
                ),
                TextButton.icon(
                  onPressed: deleting ? null : () => _openLegalUrl(supportUrl),
                  icon: const Icon(Icons.support_agent_outlined, size: 18),
                  label: const Text('Yordam bilan bog‘lanish'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: confirmation,
                  enabled: !deleting,
                  autocorrect: false,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                    labelText: 'Tasdiqlash uchun DELETE deb yozing',
                  ),
                  onChanged: (_) => setDialogState(() {}),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: deleting ? null : () => Navigator.pop(dialogContext),
              child: const Text('Bekor qilish'),
            ),
            FilledButton.icon(
              onPressed:
                  deleting || confirmation.text.trim().toUpperCase() != 'DELETE'
                  ? null
                  : () async {
                      setDialogState(() => deleting = true);
                      try {
                        await widget.auth.deleteAccount(
                          confirmation: confirmation.text,
                        );
                        widget.cart.clear();
                        if (dialogContext.mounted) {
                          Navigator.pop(dialogContext);
                        }
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Akkaunt o‘chirildi.'),
                            ),
                          );
                        }
                      } catch (error) {
                        if (dialogContext.mounted) {
                          ScaffoldMessenger.of(dialogContext).showSnackBar(
                            SnackBar(content: Text(authErrorMessage(error))),
                          );
                        }
                      } finally {
                        if (dialogContext.mounted) {
                          setDialogState(() => deleting = false);
                        }
                      }
                    },
              icon: deleting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.delete_forever_outlined),
              label: const Text('Butunlay o‘chirish'),
              style: FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.error,
              ),
            ),
          ],
        ),
      ),
    );
    confirmation.dispose();
  }

  Future<void> _resetPassword() async {
    final resetEmail = TextEditingController(text: normalizeEmail(email.text));
    var sending = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          scrollable: true,
          title: const Text('Parolni tiklash'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Email manzilingizga parolni tiklash havolasi yuboriladi.',
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: resetEmail,
                decoration: const InputDecoration(labelText: 'Email'),
                keyboardType: TextInputType.emailAddress,
                validator: validateEmail,
                autovalidateMode: AutovalidateMode.onUserInteraction,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: sending ? null : () => Navigator.pop(dialogContext),
              child: const Text('Bekor qilish'),
            ),
            FilledButton.icon(
              onPressed: sending
                  ? null
                  : () async {
                      final validation = validateEmail(resetEmail.text);
                      if (validation != null) {
                        ScaffoldMessenger.of(
                          dialogContext,
                        ).showSnackBar(SnackBar(content: Text(validation)));
                        return;
                      }
                      setDialogState(() => sending = true);
                      try {
                        await widget.auth.sendPasswordReset(resetEmail.text);
                        if (dialogContext.mounted) {
                          Navigator.pop(dialogContext);
                        }
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Parolni tiklash xati yuborildi.'),
                            ),
                          );
                        }
                      } catch (error) {
                        if (dialogContext.mounted) {
                          ScaffoldMessenger.of(dialogContext).showSnackBar(
                            SnackBar(content: Text(authErrorMessage(error))),
                          );
                        }
                      } finally {
                        if (dialogContext.mounted) {
                          setDialogState(() => sending = false);
                        }
                      }
                    },
              icon: sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.mail_outline),
              label: const Text('Yuborish'),
            ),
          ],
        ),
      ),
    );
    resetEmail.dispose();
  }

  Future<void> _editProfile(Customer customer) async {
    final editName = TextEditingController(text: customer.name);
    final editPhone = TextEditingController(text: customer.phone);
    final editCity = TextEditingController(text: customer.city);
    final editAddress = TextEditingController(text: customer.address);
    var saving = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          scrollable: true,
          title: const Text('Profil'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: editName,
                decoration: const InputDecoration(labelText: 'Ism'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: editPhone,
                decoration: const InputDecoration(labelText: 'Telefon'),
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 10),
              TextField(
                controller: editCity,
                decoration: const InputDecoration(labelText: 'Shahar'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: editAddress,
                decoration: const InputDecoration(labelText: 'Manzil'),
                minLines: 2,
                maxLines: 3,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.pop(dialogContext),
              child: const Text('Bekor qilish'),
            ),
            FilledButton(
              onPressed: saving
                  ? null
                  : () async {
                      setDialogState(() => saving = true);
                      try {
                        final nameValidation = validateRequiredText(
                          editName.text,
                          'Ism',
                        );
                        final phoneValidation = validatePhone(editPhone.text);
                        if (nameValidation != null || phoneValidation != null) {
                          ScaffoldMessenger.of(dialogContext).showSnackBar(
                            SnackBar(
                              content: Text(nameValidation ?? phoneValidation!),
                            ),
                          );
                          return;
                        }
                        await widget.auth.updateProfile(
                          name: editName.text.trim(),
                          phone: normalizePhoneNumber(editPhone.text),
                          city: editCity.text,
                          address: editAddress.text,
                        );
                        if (dialogContext.mounted) {
                          Navigator.pop(dialogContext);
                        }
                      } catch (e) {
                        if (dialogContext.mounted) {
                          ScaffoldMessenger.of(dialogContext).showSnackBar(
                            SnackBar(content: Text('Profil saqlanmadi: $e')),
                          );
                        }
                      } finally {
                        if (dialogContext.mounted) {
                          setDialogState(() => saving = false);
                        }
                      }
                    },
              child: const Text('Saqlash'),
            ),
          ],
        ),
      ),
    );
    editName.dispose();
    editPhone.dispose();
    editCity.dispose();
    editAddress.dispose();
  }
}

class CommerceAccountPanel extends StatelessWidget {
  const CommerceAccountPanel({
    super.key,
    required this.state,
    required this.busy,
    required this.onRefresh,
    required this.onResend,
    required this.onRetry,
  });

  final CommerceAccountState state;
  final bool busy;
  final VoidCallback onRefresh;
  final VoidCallback onResend;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ready = state == CommerceAccountState.ready;
    final verification =
        state == CommerceAccountState.emailVerificationRequired;
    final syncing = state == CommerceAccountState.syncing;
    final title = ready
        ? 'Akkaunt va buyurtmalar bog‘langan'
        : verification
        ? 'Emailni tasdiqlang'
        : syncing
        ? 'Buyurtmalar ulanmoqda'
        : 'Buyurtmalarni qayta ulang';
    final message = ready
        ? 'Yangi buyurtmalar, to‘lov va yetkazib berish holati shu profilda ko‘rinadi.'
        : verification
        ? 'Emaildagi havolani oching. Keyin tasdiqlash holatini tekshiring.'
        : syncing
        ? 'Xavfsiz savdo profilingiz tayyorlanmoqda.'
        : 'Internet aloqasini tekshirib, savdo profiliga qayta ulaning.';
    final color = ready ? const Color(0xff2f7d55) : milanaBurgundy;
    return Semantics(
      liveRegion: syncing,
      label: '$title. $message',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: ready
              ? const Color(0xffeaf5ef)
              : milanaBlush.withValues(alpha: .72),
          border: Border.all(color: color.withValues(alpha: .18)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              ready
                  ? Icons.verified_user_outlined
                  : verification
                  ? Icons.mark_email_unread_outlined
                  : Icons.sync_outlined,
              color: color,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 4),
                  Text(message),
                  if (!ready) ...[
                    const SizedBox(height: 8),
                    if (verification)
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: [
                          TextButton(
                            onPressed: busy ? null : onRefresh,
                            child: const Text('Tekshirish'),
                          ),
                          TextButton(
                            onPressed: busy ? null : onResend,
                            child: const Text('Xatni qayta yuborish'),
                          ),
                        ],
                      )
                    else
                      TextButton.icon(
                        onPressed: busy || syncing ? null : onRetry,
                        icon: busy || syncing
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.refresh, size: 18),
                        label: const Text('Qayta ulash'),
                      ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AccountAuthForm extends StatelessWidget {
  const AccountAuthForm({
    super.key,
    required this.formKey,
    required this.signUp,
    required this.busy,
    required this.name,
    required this.phone,
    required this.city,
    required this.address,
    required this.email,
    required this.password,
    required this.legalAccepted,
    required this.onSubmit,
    required this.onToggleMode,
    required this.onLegalAccepted,
    required this.onOpenLegal,
    required this.onResetPassword,
  });

  final GlobalKey<FormState> formKey;
  final bool signUp;
  final bool busy;
  final TextEditingController name;
  final TextEditingController phone;
  final TextEditingController city;
  final TextEditingController address;
  final TextEditingController email;
  final TextEditingController password;
  final bool legalAccepted;
  final VoidCallback onSubmit;
  final VoidCallback onToggleMode;
  final ValueChanged<bool> onLegalAccepted;
  final ValueChanged<String> onOpenLegal;
  final VoidCallback? onResetPassword;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: milanaInk.withValues(alpha: .08)),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: milanaInk.withValues(alpha: .04),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Form(
        key: formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: milanaBlush,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    signUp
                        ? Icons.person_add_alt_outlined
                        : Icons.lock_open_outlined,
                    color: milanaBurgundy,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    signUp ? 'Ro‘yxatdan o‘tish' : 'Kirish',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (signUp) ...[
              TextFormField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Ism'),
                textInputAction: TextInputAction.next,
                validator: (value) => validateRequiredText(value, 'Ism'),
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: phone,
                decoration: const InputDecoration(labelText: 'Telefon'),
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                validator: validatePhone,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: city,
                decoration: const InputDecoration(labelText: 'Shahar'),
                textInputAction: TextInputAction.next,
                validator: (value) {
                  try {
                    normalizeProfileText(value ?? '', max: 80, label: 'Shahar');
                    return null;
                  } on ArgumentError catch (error) {
                    return '${error.message}';
                  }
                },
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: address,
                decoration: const InputDecoration(labelText: 'Manzil'),
                minLines: 2,
                maxLines: 3,
                textInputAction: TextInputAction.next,
                validator: (value) {
                  try {
                    normalizeProfileText(
                      value ?? '',
                      max: 200,
                      label: 'Manzil',
                    );
                    return null;
                  } on ArgumentError catch (error) {
                    return '${error.message}';
                  }
                },
              ),
              const SizedBox(height: 10),
            ],
            TextFormField(
              controller: email,
              decoration: const InputDecoration(labelText: 'Email'),
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.next,
              validator: validateEmail,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: password,
              decoration: const InputDecoration(labelText: 'Parol'),
              obscureText: true,
              autofillHints: signUp
                  ? const [AutofillHints.newPassword]
                  : const [AutofillHints.password],
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) {
                if (!busy && (!signUp || legalAccepted)) onSubmit();
              },
              validator: (value) => validatePassword(value, signUp: signUp),
            ),
            if (signUp) ...[
              const SizedBox(height: 8),
              CheckboxListTile(
                value: legalAccepted,
                onChanged: busy
                    ? null
                    : (value) => onLegalAccepted(value ?? false),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: const Text(
                  'Maxfiylik siyosati va foydalanish shartlariga roziman',
                ),
              ),
              Wrap(
                spacing: 4,
                children: [
                  TextButton.icon(
                    onPressed: () => onOpenLegal(privacyPolicyUrl),
                    icon: const Icon(Icons.privacy_tip_outlined, size: 17),
                    label: const Text('Maxfiylik siyosati'),
                  ),
                  TextButton.icon(
                    onPressed: () => onOpenLegal(termsOfServiceUrl),
                    icon: const Icon(Icons.description_outlined, size: 17),
                    label: const Text('Foydalanish shartlari'),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: busy || (signUp && !legalAccepted) ? null : onSubmit,
              icon: busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(signUp ? Icons.person_add_alt : Icons.login),
              label: Text(signUp ? 'Akkaunt yaratish' : 'Kirish'),
            ),
            const SizedBox(height: 8),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 4,
              children: [
                TextButton(
                  onPressed: busy ? null : onToggleMode,
                  child: Text(
                    signUp ? 'Menda akkaunt bor' : 'Yangi akkaunt yaratish',
                  ),
                ),
                if (onResetPassword != null)
                  TextButton.icon(
                    onPressed: busy ? null : onResetPassword,
                    icon: const Icon(Icons.help_outline, size: 18),
                    label: const Text('Parolni unutdingizmi?'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class AccountDashboardCard extends StatelessWidget {
  const AccountDashboardCard({
    super.key,
    required this.customer,
    required this.onEdit,
    required this.onSignOut,
    required this.onDelete,
  });

  final Customer customer;
  final VoidCallback onEdit;
  final VoidCallback onSignOut;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final displayName = customer.name.isEmpty ? customer.email : customer.name;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: milanaInk,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.person, color: Colors.white, size: 30),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      customer.email,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: .72),
                      ),
                    ),
                    if (customer.phone.isNotEmpty)
                      Text(
                        customer.phone,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: .72),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              AccountMetric(
                icon: Icons.favorite,
                value: '${customer.savedProductIds.length}',
                label: 'saqlangan',
              ),
              const SizedBox(width: 10),
              const AccountMetric(
                icon: Icons.verified_user_outlined,
                value: 'B2B',
                label: 'optom akkaunt',
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: onEdit,
                icon: const Icon(Icons.edit_outlined),
                label: const Text('Profil'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: BorderSide(color: Colors.white.withValues(alpha: .32)),
                ),
              ),
              FilledButton.icon(
                onPressed: onSignOut,
                icon: const Icon(Icons.logout),
                label: const Text('Chiqish'),
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: milanaInk,
                ),
              ),
              TextButton.icon(
                onPressed: onDelete,
                icon: const Icon(Icons.delete_outline, size: 19),
                label: const Text('Akkauntni o‘chirish'),
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFFFC6C6),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class LegalLinksPanel extends StatelessWidget {
  const LegalLinksPanel({super.key, required this.onOpen});

  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: milanaBlush,
        border: Border.all(color: milanaInk.withValues(alpha: .08)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.shield_outlined,
                  color: milanaBurgundy,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Huquqiy ma’lumotlar',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Ma’lumotlaringiz qanday ishlatilishi, xizmat shartlari va akkauntni o‘chirish tartibi.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: milanaInk.withValues(alpha: .66),
              height: 1.45,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 4,
            runSpacing: 2,
            children: [
              TextButton.icon(
                onPressed: () => onOpen(privacyPolicyUrl),
                icon: const Icon(Icons.privacy_tip_outlined, size: 18),
                label: const Text('Maxfiylik'),
              ),
              TextButton.icon(
                onPressed: () => onOpen(termsOfServiceUrl),
                icon: const Icon(Icons.description_outlined, size: 18),
                label: const Text('Shartlar'),
              ),
              TextButton.icon(
                onPressed: () => onOpen(accountDeletionUrl),
                icon: const Icon(Icons.person_remove_outlined, size: 18),
                label: const Text('Akkauntni o‘chirish'),
              ),
              TextButton.icon(
                onPressed: () => onOpen(supportUrl),
                icon: const Icon(Icons.support_agent_outlined, size: 18),
                label: const Text('Yordam'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class AccountMetric extends StatelessWidget {
  const AccountMetric({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: .7),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AccountActivitySection extends StatelessWidget {
  const AccountActivitySection({
    super.key,
    required this.orderStream,
    required this.supportStream,
    required this.orders,
    required this.cart,
    required this.onRefresh,
  });

  final Stream<List<OrderSummary>> orderStream;
  final Stream<List<SupportTicketSummary>> supportStream;
  final OrderRepository orders;
  final CartController cart;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<OrderSummary>>(
      stream: orderStream,
      builder: (context, orderSnap) {
        return StreamBuilder<List<SupportTicketSummary>>(
          stream: supportStream,
          builder: (context, supportSnap) {
            final orderRows = orderSnap.data ?? const <OrderSummary>[];
            final supportRows =
                supportSnap.data ?? const <SupportTicketSummary>[];
            final ordersLoading =
                orderSnap.connectionState == ConnectionState.waiting &&
                !orderSnap.hasData;
            final supportLoading =
                supportSnap.connectionState == ConnectionState.waiting &&
                !supportSnap.hasData;
            final hasActivityData = orderSnap.hasData || supportSnap.hasData;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!hasActivityData && (ordersLoading || supportLoading))
                  const AccountOverviewLoading()
                else
                  AccountOverviewCard(
                    overview: buildAccountOverview(
                      orders: orderRows,
                      supportTickets: supportRows,
                    ),
                  ),
                if (orderSnap.hasError || supportSnap.hasError) ...[
                  const SizedBox(height: 10),
                  AccountOverviewError(
                    message:
                        'Ayrim akkaunt ma’lumotlari yangilanmadi. Qayta urinib ko‘ring.',
                    onRetry: onRefresh,
                  ),
                ],
                const SizedBox(height: 24),
                Text(
                  'Buyurtmalarim',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                CustomerOrdersList(
                  rows: orderRows,
                  loading: ordersLoading,
                  hasError: orderSnap.hasError,
                  orders: orders,
                  cart: cart,
                  onChanged: onRefresh,
                ),
                const SizedBox(height: 24),
                Text(
                  'Murojaatlarim',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                CustomerSupportTicketsList(
                  rows: supportRows,
                  loading: supportLoading,
                  hasError: supportSnap.hasError,
                  onRetry: onRefresh,
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class AccountOverviewLoading extends StatelessWidget {
  const AccountOverviewLoading({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 122,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: milanaInk.withValues(alpha: .08)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Center(child: CircularProgressIndicator()),
    );
  }
}

class AccountOverviewError extends StatelessWidget {
  const AccountOverviewError({
    super.key,
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: milanaBlush,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: milanaBurgundy),
          const SizedBox(width: 10),
          Expanded(child: Text(message)),
          TextButton(onPressed: onRetry, child: const Text('Qayta urinish')),
        ],
      ),
    );
  }
}

class AccountOverviewCard extends StatelessWidget {
  const AccountOverviewCard({super.key, required this.overview});

  final AccountOverview overview;

  @override
  Widget build(BuildContext context) {
    final latest = overview.latestOrderAt == null
        ? 'hali yo‘q'
        : shortDate.format(overview.latestOrderAt!.toLocal());
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: milanaInk.withValues(alpha: .08)),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: milanaInk.withValues(alpha: .04),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: milanaBlush,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.insights_outlined,
                  color: milanaBurgundy,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Akkaunt holati',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      overview.hasActivity
                          ? 'Oxirgi buyurtma: $latest'
                          : 'Buyurtma va murojaatlar shu yerda ko‘rinadi',
                      style: TextStyle(color: milanaInk.withValues(alpha: .58)),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final twoColumns = constraints.maxWidth >= 360;
              final itemWidth = twoColumns
                  ? (constraints.maxWidth - 10) / 2
                  : constraints.maxWidth;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  SizedBox(
                    width: itemWidth,
                    child: AccountOverviewTile(
                      icon: Icons.inventory_2_outlined,
                      value: '${overview.activePackages} paket',
                      label: 'aktiv buyurtma',
                      detail: '${overview.activePieces} ta kiyim',
                    ),
                  ),
                  SizedBox(
                    width: itemWidth,
                    child: AccountOverviewTile(
                      icon: Icons.payments_outlined,
                      value: money.format(overview.confirmedSpend),
                      label: 'tasdiqlangan to‘lov',
                      detail: '${overview.pendingPaymentOrders} ta tekshiruvda',
                    ),
                  ),
                  SizedBox(
                    width: itemWidth,
                    child: AccountOverviewTile(
                      icon: Icons.receipt_long_outlined,
                      value: '${overview.totalOrders}',
                      label: 'jami buyurtma',
                      detail: '${overview.totalPackages} paket tarixda',
                    ),
                  ),
                  SizedBox(
                    width: itemWidth,
                    child: AccountOverviewTile(
                      icon: Icons.support_agent_outlined,
                      value: '${overview.openSupportTickets}',
                      label: 'ochiq murojaat',
                      detail: 'menejer javobi kuzatiladi',
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class AccountOverviewTile extends StatelessWidget {
  const AccountOverviewTile({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    required this.detail,
  });

  final IconData icon;
  final String value;
  final String label;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 92),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: milanaIvory,
        border: Border.all(color: milanaInk.withValues(alpha: .07)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: milanaBurgundy, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  detail,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: milanaInk.withValues(alpha: .58),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class CustomerOrdersList extends StatelessWidget {
  const CustomerOrdersList({
    super.key,
    required this.rows,
    required this.loading,
    required this.hasError,
    required this.orders,
    required this.cart,
    required this.onChanged,
  });

  final List<OrderSummary> rows;
  final bool loading;
  final bool hasError;
  final OrderRepository orders;
  final CartController cart;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (rows.isEmpty && hasError) {
      return const Text('Buyurtmalar hozircha yangilanmadi.');
    }
    if (rows.isEmpty) return const Text('Hozircha buyurtmalar yo‘q.');
    return Column(
      children: rows
          .map(
            (order) => OrderStatusCard(
              order: order,
              orders: orders,
              cart: cart,
              onChanged: onChanged,
            ),
          )
          .toList(),
    );
  }
}

class OrderStatusCard extends StatefulWidget {
  const OrderStatusCard({
    super.key,
    required this.order,
    required this.orders,
    required this.cart,
    required this.onChanged,
  });

  final OrderSummary order;
  final OrderRepository orders;
  final CartController cart;
  final VoidCallback onChanged;

  @override
  State<OrderStatusCard> createState() => _OrderStatusCardState();
}

class _OrderStatusCardState extends State<OrderStatusCard> {
  bool busy = false;

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final created = order.createdAt == null
        ? ''
        : shortDate.format(order.createdAt!.toLocal());
    final nextAction = orderNextAction(order);
    final canSubmitPayment =
        order.id.isNotEmpty &&
        !const {
          'paid',
          'submitted',
          'cancelled',
          'refunded',
        }.contains(order.paymentStatus);
    final canCancel = canCustomerCancelOrder(order);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    order.number,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Text(
                  money.format(order.total),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: milanaBurgundy,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
            if (created.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                created,
                style: TextStyle(color: milanaInk.withValues(alpha: .58)),
              ),
            ],
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusPill(
                  icon: Icons.receipt_long_outlined,
                  label: orderStatusLabel(order.status),
                  color: statusColor(order.status),
                ),
                StatusPill(
                  icon: Icons.payments_outlined,
                  label:
                      '${order.paymentLabel}: ${paymentStatusLabel(order.paymentStatus)}',
                  color: statusColor(order.paymentStatus),
                ),
              ],
            ),
            const SizedBox(height: 12),
            OrderProgressLine(
              status: order.status,
              paymentStatus: order.paymentStatus,
            ),
            if (order.activity.isNotEmpty) ...[
              const SizedBox(height: 12),
              OrderActivityTimeline(activity: order.activity),
            ],
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: milanaBlush,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.route_outlined,
                    color: milanaBurgundy,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Keyingi qadam',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          nextAction,
                          style: TextStyle(
                            color: milanaInk.withValues(alpha: .7),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (order.trackingNumber.isNotEmpty ||
                order.deliveryCarrier.isNotEmpty) ...[
              DeliveryTrackingPanel(order: order),
              const SizedBox(height: 12),
            ],
            Row(
              children: [
                Expanded(
                  child: Text(
                    orderTrackingSummary(order),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  order.paymentStatus == 'paid'
                      ? 'To‘lov tasdiqlangan'
                      : 'Menejer tasdiqlaydi',
                  style: TextStyle(
                    color: milanaInk.withValues(alpha: .62),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            if (order.paymentStatus == 'submitted' &&
                order.paymentSubmissionReference.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Yuborilgan reference: ${order.paymentSubmissionReference}',
                style: TextStyle(
                  color: milanaInk.withValues(alpha: .64),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                OutlinedButton.icon(
                  onPressed: () => _openOrderDetails(order),
                  icon: const Icon(Icons.list_alt_outlined),
                  label: const Text('Tafsilot'),
                ),
                OutlinedButton.icon(
                  onPressed: () {
                    Clipboard.setData(
                      ClipboardData(text: customerOrderShareText(order)),
                    );
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Buyurtma ma’lumoti nusxalandi'),
                      ),
                    );
                  },
                  icon: const Icon(Icons.copy_all_outlined),
                  label: const Text('Nusxalash'),
                ),
                if (canSubmitPayment)
                  OutlinedButton.icon(
                    onPressed: busy ? null : () => _openPaymentSheet(order),
                    icon: busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.upload_file_outlined),
                    label: const Text('To‘lov ma’lumotini yuborish'),
                  ),
                if (canCancel)
                  OutlinedButton.icon(
                    onPressed: busy ? null : () => _openCancelDialog(order),
                    icon: busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.cancel_outlined),
                    label: const Text('Bekor qilish'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openOrderDetails(OrderSummary order) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => OrderDetailsSheet(order: order, cart: widget.cart),
    );
  }

  Future<void> _openPaymentSheet(OrderSummary order) async {
    setState(() => busy = true);
    try {
      final receipt = await showModalBottomSheet<PaymentSubmissionReceipt>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (context) =>
            PaymentSubmissionSheet(order: order, orders: widget.orders),
      );
      if (mounted && receipt != null) {
        widget.onChanged();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('To‘lov ma’lumoti yuborildi')),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _openCancelDialog(OrderSummary order) async {
    final reasonController = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          scrollable: true,
          title: const Text('Buyurtmani bekor qilish'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${order.number} bekor qilinsinmi? Qop zaxirasi katalogga qaytariladi.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reasonController,
                maxLines: 3,
                maxLength: 300,
                decoration: const InputDecoration(
                  labelText: 'Sabab',
                  hintText: 'Ixtiyoriy',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Qoldirish'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(context).pop(reasonController.text.trim()),
              child: const Text('Bekor qilish'),
            ),
          ],
        );
      },
    );
    reasonController.dispose();
    if (reason == null) return;
    if (!mounted) return;

    setState(() => busy = true);
    try {
      await widget.orders.cancelOrder(
        CancelOrderRequest(
          orderId: order.id,
          provenance: order.provenance,
          reason: reason,
        ),
      );
      if (!mounted) return;
      widget.onChanged();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Buyurtma bekor qilindi')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Bekor qilish amalga oshmadi: $error')),
      );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}

class OrderDetailsSheet extends StatelessWidget {
  const OrderDetailsSheet({super.key, required this.order, required this.cart});

  final OrderSummary order;
  final CartController cart;

  @override
  Widget build(BuildContext context) {
    final created = order.createdAt == null
        ? ''
        : shortDateTime.format(order.createdAt!.toLocal());
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .82,
      minChildSize: .45,
      maxChildSize: .95,
      builder: (context, scrollController) {
        return ListView(
          controller: scrollController,
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: milanaInk.withValues(alpha: .18),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: Text(
                    order.number,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Text(
                  money.format(order.total),
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: milanaBurgundy,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
            if (created.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                created,
                style: TextStyle(color: milanaInk.withValues(alpha: .58)),
              ),
            ],
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusPill(
                  icon: Icons.receipt_long_outlined,
                  label: orderStatusLabel(order.status),
                  color: statusColor(order.status),
                ),
                StatusPill(
                  icon: Icons.payments_outlined,
                  label: paymentStatusLabel(order.paymentStatus),
                  color: statusColor(order.paymentStatus),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              orderTrackingSummary(order),
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 10),
            if (order.items.isEmpty)
              Text(
                'Mahsulot tafsilotlari menejer tomonidan tasdiqlanadi.',
                style: TextStyle(color: milanaInk.withValues(alpha: .65)),
              )
            else
              ...order.items.map((item) => OrderLineItemTile(item: item)),
            const SizedBox(height: 18),
            PaymentNotice(
              title: order.paymentLabel,
              message: order.paymentInstructions.isEmpty
                  ? paymentInstructions(order.paymentMethod)
                  : order.paymentInstructions,
            ),
            if (order.paymentReference.isNotEmpty) ...[
              const SizedBox(height: 12),
              SelectableText('Reference: ${order.paymentReference}'),
            ],
            if (order.items.isNotEmpty) ...[
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: () {
                  final added = cart.addItems(
                    order.items.map((item) => item.toCartItem()),
                  );
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        added > 0
                            ? 'Buyurtma savatga qo‘shildi'
                            : 'Savatdagi buyurtma miqdori allaqachon limitda',
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.shopping_bag_outlined),
                label: const Text('Savatga qo‘shish'),
              ),
            ],
          ],
        );
      },
    );
  }
}

class OrderLineItemTile extends StatelessWidget {
  const OrderLineItemTile({super.key, required this.item});

  final OrderLineItem item;

  @override
  Widget build(BuildContext context) {
    final imageUrl = item.image.isEmpty ? '' : resolveImageUrl(item.image);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: milanaInk.withValues(alpha: .08)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 74,
              height: 92,
              child: imageUrl.isEmpty
                  ? const ProductImageFallback()
                  : CachedNetworkImage(
                      imageUrl: imageUrl,
                      fit: BoxFit.cover,
                      memCacheWidth: 300,
                      maxWidthDiskCache: 500,
                      placeholder: (context, url) =>
                          const ProductImagePlaceholder(),
                      errorWidget: (context, url, error) =>
                          const ProductImageFallback(),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 3),
                Text(
                  orderLineItemSubtitle(item),
                  style: TextStyle(color: milanaInk.withValues(alpha: .64)),
                ),
                const SizedBox(height: 8),
                Text(
                  orderSizeMixSummary(item),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 10,
                  runSpacing: 4,
                  children: [
                    Text('Dona: ${money.format(item.unitPrice)}'),
                    Text(
                      '${orderUnitLabel(item.unitType)}: ${money.format(item.bagPrice)}',
                    ),
                    Text(
                      'Jami: ${money.format(item.lineTotal)}',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class PaymentSubmissionSheet extends StatefulWidget {
  const PaymentSubmissionSheet({
    super.key,
    required this.order,
    required this.orders,
  });

  final OrderSummary order;
  final OrderRepository orders;

  @override
  State<PaymentSubmissionSheet> createState() => _PaymentSubmissionSheetState();
}

class _PaymentSubmissionSheetState extends State<PaymentSubmissionSheet> {
  final formKey = GlobalKey<FormState>();
  late final TextEditingController amount;
  late final TextEditingController reference;
  final note = TextEditingController();
  late String method;
  bool sending = false;

  @override
  void initState() {
    super.initState();
    amount = TextEditingController(text: widget.order.total.toStringAsFixed(2));
    reference = TextEditingController(text: widget.order.paymentReference);
    method = widget.order.paymentMethod;
  }

  @override
  void dispose() {
    amount.dispose();
    reference.dispose();
    note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottom),
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        child: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: milanaInk.withValues(alpha: .18),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'To‘lov ma’lumoti',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 4),
              Text(
                '${widget.order.number} · ${money.format(widget.order.total)}',
                style: TextStyle(color: milanaInk.withValues(alpha: .62)),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: method,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'To‘lov usuli'),
                items: [
                  for (final value in const [
                    'manager',
                    'bank',
                    'click',
                    'payme',
                    'card',
                    'cash',
                  ])
                    DropdownMenuItem(
                      value: value,
                      child: Text(
                        paymentMethodLabel(value),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: (value) =>
                    setState(() => method = value ?? 'manager'),
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: amount,
                decoration: const InputDecoration(labelText: 'To‘langan summa'),
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                validator: (value) => paymentAmountValidationMessage(
                  value ?? '',
                  widget.order.total,
                ),
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: reference,
                decoration: const InputDecoration(
                  labelText: 'Reference / tranzaksiya raqami',
                ),
                validator: (value) => paymentProofDetailValidationMessage(
                  method: method,
                  reference: value ?? '',
                  note: note.text,
                ),
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: note,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Izoh'),
                validator: (value) => paymentProofDetailValidationMessage(
                  method: method,
                  reference: reference.text,
                  note: value ?? '',
                ),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: sending ? null : _submit,
                icon: sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.check),
                label: const Text('Yuborish'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!formKey.currentState!.validate()) return;
    setState(() => sending = true);
    try {
      final receipt = await widget.orders.submitPaymentProof(
        PaymentSubmission(
          orderId: widget.order.id,
          provenance: widget.order.provenance,
          method: method,
          amount: parsePaymentAmount(amount.text),
          reference: reference.text.trim(),
          note: note.text.trim(),
        ),
      );
      if (mounted) Navigator.of(context).pop(receipt);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Yuborilmadi: $error')));
      }
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }
}

class OrderActivityTimeline extends StatelessWidget {
  const OrderActivityTimeline({super.key, required this.activity});

  final List<OrderActivity> activity;

  @override
  Widget build(BuildContext context) {
    final entries = activity.reversed.take(4).toList();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: milanaInk.withValues(alpha: .1)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Buyurtma tarixi',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < entries.length; i++) ...[
            _OrderActivityRow(entry: entries[i]),
            if (i != entries.length - 1) const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

class _OrderActivityRow extends StatelessWidget {
  const _OrderActivityRow({required this.entry});

  final OrderActivity entry;

  @override
  Widget build(BuildContext context) {
    final created = entry.createdAt == null
        ? ''
        : shortDateTime.format(entry.createdAt!.toLocal());
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: _activityColor(entry.type).withValues(alpha: .12),
            shape: BoxShape.circle,
          ),
          child: Icon(
            _activityIcon(entry.type),
            color: _activityColor(entry.type),
            size: 16,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      entry.title,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  if (created.isNotEmpty)
                    Text(
                      created,
                      style: TextStyle(
                        color: milanaMuted,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                ],
              ),
              if (entry.message.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  entry.message,
                  style: TextStyle(color: milanaInk.withValues(alpha: .66)),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  IconData _activityIcon(String type) {
    return switch (type) {
      'payment_submitted' => Icons.upload_file_outlined,
      'payment_status' => Icons.payments_outlined,
      'order_status' => Icons.local_shipping_outlined,
      _ => Icons.receipt_long_outlined,
    };
  }

  Color _activityColor(String type) {
    return switch (type) {
      'payment_submitted' => milanaMoss,
      'payment_status' => milanaBurgundy,
      'order_status' => const Color(0xff7a5a2c),
      _ => milanaInk,
    };
  }
}

class DeliveryTrackingPanel extends StatelessWidget {
  const DeliveryTrackingPanel({super.key, required this.order});

  final OrderSummary order;

  @override
  Widget build(BuildContext context) {
    final carrier = order.deliveryCarrier.isEmpty
        ? 'Cargo'
        : order.deliveryCarrier;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: milanaInk.withValues(alpha: .1)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.local_shipping_outlined, color: milanaBurgundy),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  carrier,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                if (order.trackingNumber.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  SelectableText('Cargo raqami: ${order.trackingNumber}'),
                ],
                if (order.deliveryNote.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(order.deliveryNote),
                ],
              ],
            ),
          ),
          if (order.trackingNumber.isNotEmpty)
            IconButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: order.trackingNumber));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Cargo raqami nusxalandi')),
                );
              },
              icon: const Icon(Icons.copy, size: 18),
              tooltip: 'Nusxalash',
            ),
        ],
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(color: color, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class OrderProgressLine extends StatelessWidget {
  const OrderProgressLine({
    super.key,
    required this.status,
    required this.paymentStatus,
  });

  final String status;
  final String paymentStatus;

  @override
  Widget build(BuildContext context) {
    final current = _stepIndex();
    final steps = const ['Yangi', 'Tasdiq', 'Yuborish', 'Yetkazish'];
    return Row(
      children: [
        for (var i = 0; i < steps.length; i++) ...[
          Expanded(
            child: Column(
              children: [
                Container(
                  height: 5,
                  decoration: BoxDecoration(
                    color: i <= current
                        ? milanaBurgundy
                        : milanaInk.withValues(alpha: .12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  steps[i],
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    color: i <= current ? milanaBurgundy : milanaMuted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          if (i != steps.length - 1) const SizedBox(width: 5),
        ],
      ],
    );
  }

  int _stepIndex() {
    return orderProgressStepFor(status, paymentStatus);
  }
}

class CustomerSupportTicketsList extends StatelessWidget {
  const CustomerSupportTicketsList({
    super.key,
    required this.rows,
    required this.loading,
    required this.hasError,
    required this.onRetry,
  });

  final List<SupportTicketSummary> rows;
  final bool loading;
  final bool hasError;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (rows.isEmpty && hasError) {
      return Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh),
          label: const Text('Murojaatlarni qayta yuklash'),
        ),
      );
    }
    if (rows.isEmpty) return const Text('Hozircha murojaatlar yo‘q.');
    return Column(
      children: rows
          .map((ticket) => SupportTicketCard(ticket: ticket))
          .toList(),
    );
  }
}

class SupportTicketCard extends StatelessWidget {
  const SupportTicketCard({super.key, required this.ticket});

  final SupportTicketSummary ticket;

  @override
  Widget build(BuildContext context) {
    final created = ticket.createdAt == null
        ? ''
        : shortDate.format(ticket.createdAt!.toLocal());
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.support_agent_outlined, color: milanaBurgundy),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    ticket.number,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                StatusPill(
                  icon: Icons.mark_chat_read_outlined,
                  label: _supportStatusLabel(ticket.status),
                  color: statusColor(ticket.status),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${_supportTopicLabel(ticket.topic)}${created.isEmpty ? '' : ' · $created'}',
              style: TextStyle(color: milanaInk.withValues(alpha: .6)),
            ),
            const SizedBox(height: 6),
            Text(ticket.message, maxLines: 3, overflow: TextOverflow.ellipsis),
            if (ticket.reply.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: milanaBlush,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Menejer javobi',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 4),
                    Text(ticket.reply),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

String _supportStatusLabel(String status) {
  switch (status) {
    case 'open':
      return 'Jarayonda';
    case 'waiting_for_customer':
      return 'Javob kutilmoqda';
    case 'resolved':
      return 'Hal qilindi';
    case 'closed':
      return 'Yopildi';
    default:
      return 'Yangi';
  }
}

String _supportTopicLabel(String topic) {
  switch (topic) {
    case 'catalog':
      return 'Katalog';
    case 'price':
      return 'Narx';
    case 'delivery':
      return 'Yetkazib berish';
    case 'payment':
      return 'To‘lov';
    case 'defect':
      return 'Brak';
    default:
      return 'Umumiy';
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final content = Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64),
            const SizedBox(height: 12),
            Text(
              title,
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        if (!constraints.hasBoundedHeight) return content;
        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: content,
          ),
        );
      },
    );
  }
}
