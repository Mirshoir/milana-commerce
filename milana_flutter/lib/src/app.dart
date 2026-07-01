import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import 'models/cart_item.dart';
import 'models/order.dart';
import 'models/product.dart';
import 'models/support_ticket.dart';
import 'services/auth_service.dart';
import 'services/account_overview.dart';
import 'services/auth_forms.dart';
import 'services/cart_controller.dart';
import 'services/catalog_filter.dart';
import 'services/catalog_paging.dart';
import 'services/catalog_repository.dart';
import 'services/favorites_store.dart';
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
const milanaBurgundy = Color(0xff6b1f34);
const milanaInk = Color(0xff2d2522);
const milanaIvory = Color(0xfffffbf3);
const milanaBlush = Color(0xffffeef2);
const milanaSand = Color(0xffefe4d2);
const milanaMoss = Color(0xff566246);

String resolveImageUrl(String image) {
  if (image.startsWith('http')) return image;
  if (image.startsWith('/') && firebaseAssetBaseUrl.isNotEmpty) {
    return firebaseAssetBaseUrl.replaceAll(RegExp(r'/+$'), '') + image;
  }
  if (image.startsWith('/')) return Uri.base.resolve(image).toString();
  return image;
}

int qopUiLimit(Product product) {
  final available = product.availableQop;
  if (available == null) return 20;
  return available.clamp(0, 20).toInt();
}

bool isOutOfQop(Product product) =>
    product.availableQop != null && product.availableQop! <= 0;

String qopAvailabilityLabel(Product product) {
  if (product.availableQop == null) return '60 ta';
  if (product.availableQop! <= 0) return 'Mavjud emas';
  return '${product.availableQop} qop';
}

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
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
          filled: true,
          fillColor: Colors.white,
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: milanaBurgundy,
            foregroundColor: Colors.white,
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: milanaBlush,
          indicatorColor: Colors.white,
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
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          side: BorderSide(color: milanaInk.withValues(alpha: .12)),
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

  @override
  void initState() {
    super.initState();
    index = tabIndexFromLaunchUri(Uri.base);
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomeScreen(
        catalog: widget.catalog,
        cart: widget.cart,
        onOpenCatalog: () => setState(() => index = 1),
        onOpenSupport: () => setState(() => index = 3),
      ),
      CatalogScreen(
        catalog: widget.catalog,
        cart: widget.cart,
        auth: widget.auth,
      ),
      CartScreen(cart: widget.cart, orders: widget.orders, auth: widget.auth),
      SupportScreen(orders: widget.orders, auth: widget.auth),
      AccountScreen(
        auth: widget.auth,
        orders: widget.orders,
        cart: widget.cart,
      ),
    ];
    return AnimatedBuilder(
      animation: Listenable.merge([widget.cart, widget.auth]),
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(
            title: const _BrandLockup(),
            actions: [
              TextButton.icon(
                onPressed: () => setState(() => index = 2),
                icon: const Icon(Icons.shopping_bag_outlined),
                label: Text('${widget.cart.count}'),
              ),
            ],
          ),
          body: pages[index],
          bottomNavigationBar: NavigationBar(
            selectedIndex: index,
            onDestinationSelected: (value) => setState(() => index = value),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: 'Home',
              ),
              NavigationDestination(
                icon: Icon(Icons.storefront_outlined),
                selectedIcon: Icon(Icons.storefront),
                label: 'Katalog',
              ),
              NavigationDestination(
                icon: Icon(Icons.shopping_bag_outlined),
                selectedIcon: Icon(Icons.shopping_bag),
                label: 'Savat',
              ),
              NavigationDestination(
                icon: Icon(Icons.support_agent_outlined),
                selectedIcon: Icon(Icons.support_agent),
                label: 'Yordam',
              ),
              NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'Akkaunt',
              ),
            ],
          ),
        );
      },
    );
  }
}

class _BrandLockup extends StatelessWidget {
  const _BrandLockup();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'MILANA',
          style: TextStyle(
            fontSize: 24,
            letterSpacing: 2,
            fontWeight: FontWeight.w600,
          ),
        ),
        Text(
          'PREMIUM · MILANA',
          style: TextStyle(fontSize: 10, letterSpacing: 3),
        ),
      ],
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.catalog,
    required this.cart,
    required this.onOpenCatalog,
    required this.onOpenSupport,
  });

  final CatalogRepository catalog;
  final CartController cart;
  final VoidCallback onOpenCatalog;
  final VoidCallback onOpenSupport;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<List<Product>> productsFuture;

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
        final women = _byGender(products, 'women');
        final men = _byGender(products, 'men');
        final kids = _byGender(products, 'kids');
        final heroProduct = products.isNotEmpty ? products.first : null;
        final bestProducts = products.take(8).toList();
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
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            children: [
              HomeHero(
                product: heroProduct,
                loading: loading,
                onCatalog: widget.onOpenCatalog,
                onSupport: widget.onOpenSupport,
              ),
              const SizedBox(height: 14),
              HomeStatStrip(totalProducts: products.length),
              const SizedBox(height: 18),
              SectionHeader(title: 'Shop the edit', trailing: 'Optom'),
              const SizedBox(height: 10),
              HomeCategoryGrid(
                women: women.length,
                men: men.length,
                kids: kids.length,
                onOpenCatalog: widget.onOpenCatalog,
              ),
              if (bestProducts.isNotEmpty) ...[
                const SizedBox(height: 22),
                SectionHeader(
                  title: 'Fresh drops',
                  trailing: '${bestProducts.length} model',
                ),
                const SizedBox(height: 10),
                FeaturedProductsRail(
                  products: bestProducts,
                  badgeIcon: Icons.auto_awesome,
                  badgeLabel: 'Drop',
                  onOpen: (product) => _openProduct(product, products),
                  onAdd: _add,
                ),
              ],
              if (lounge.isNotEmpty) ...[
                const SizedBox(height: 22),
                SectionHeader(
                  title: 'Lounge systems',
                  trailing: '${lounge.length} model',
                ),
                const SizedBox(height: 10),
                FeaturedProductsRail(
                  products: lounge,
                  badgeIcon: Icons.layers_outlined,
                  badgeLabel: 'Set',
                  onOpen: (product) => _openProduct(product, products),
                  onAdd: _add,
                ),
              ],
              const SizedBox(height: 22),
              HomeWholesaleBand(onSupport: widget.onOpenSupport),
              if (snap.hasError && products.isEmpty) ...[
                const SizedBox(height: 22),
                _EmptyState(
                  icon: Icons.cloud_off_outlined,
                  title: 'Katalog ochilmadi',
                  message: '${snap.error}',
                  action: FilledButton(
                    onPressed: () => setState(
                      () => productsFuture = widget.catalog.loadProducts(),
                    ),
                    child: const Text('Qayta urinish'),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  List<Product> _byGender(List<Product> products, String gender) =>
      products.where((product) => product.gender == gender).toList();

  void _add(Product product) {
    if (!widget.cart.canAdd(product)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${product.name} hozircha mavjud emas')),
      );
      return;
    }
    widget.cart.add(product);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${product.name} · 1 qop savatga qo‘shildi')),
    );
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
        onAdd: (qty) {
          for (var i = 0; i < qty; i++) {
            _add(product);
          }
        },
        onOpenRelated: (relatedProduct) =>
            _openProduct(relatedProduct, products),
        onAddRelated: _add,
      ),
    );
  }
}

class HomeHero extends StatelessWidget {
  const HomeHero({
    super.key,
    required this.product,
    required this.loading,
    required this.onCatalog,
    required this.onSupport,
  });

  final Product? product;
  final bool loading;
  final VoidCallback onCatalog;
  final VoidCallback onSupport;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 520,
      decoration: BoxDecoration(
        color: milanaInk,
        borderRadius: BorderRadius.circular(8),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (product != null)
            ProductImage(product: product!)
          else
            const ProductImagePlaceholder(),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: .1),
                  Colors.black.withValues(alpha: .38),
                  Colors.black.withValues(alpha: .72),
                ],
              ),
            ),
          ),
          Positioned(
            left: 18,
            right: 18,
            bottom: 18,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SoftBadge(
                  icon: loading ? Icons.sync : Icons.verified_outlined,
                  label: loading ? 'Yangilanmoqda' : 'Milana Premium',
                ),
                const SizedBox(height: 14),
                Text(
                  'Factory drops for wholesale buyers',
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    height: .98,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Ayollar, erkaklar va bolalar uchun uy kiyimlari. 1 qopdan buyurtma, har qopda 60 ta kiyim.',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Colors.white.withValues(alpha: .86),
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: onCatalog,
                        icon: const Icon(Icons.storefront_outlined),
                        label: const Text('Katalog'),
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
            ),
          ),
        ],
      ),
    );
  }
}

class HomeStatStrip extends StatelessWidget {
  const HomeStatStrip({super.key, required this.totalProducts});

  final int totalProducts;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        HomeStatTile(value: '$totalProducts', label: 'active models'),
        const SizedBox(width: 10),
        const HomeStatTile(value: '60', label: 'pieces per qop'),
        const SizedBox(width: 10),
        const HomeStatTile(value: '08-18', label: 'Mon-Sat'),
      ],
    );
  }
}

class HomeStatTile extends StatelessWidget {
  const HomeStatTile({super.key, required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: milanaInk.withValues(alpha: .08)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w900,
                color: milanaBurgundy,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: milanaInk.withValues(alpha: .58),
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ],
        ),
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
    required this.onOpenCatalog,
  });

  final int women;
  final int men;
  final int kids;
  final VoidCallback onOpenCatalog;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth > 620;
        final children = [
          HomeCategoryTile(
            title: 'Women',
            count: women,
            icon: Icons.checkroom_outlined,
            color: milanaBurgundy,
            onTap: onOpenCatalog,
          ),
          HomeCategoryTile(
            title: 'Men',
            count: men,
            icon: Icons.man_2_outlined,
            color: milanaMoss,
            onTap: onOpenCatalog,
          ),
          HomeCategoryTile(
            title: 'Kids',
            count: kids,
            icon: Icons.child_care_outlined,
            color: const Color(0xff315f72),
            onTap: onOpenCatalog,
          ),
        ];
        return GridView.count(
          crossAxisCount: wide ? 3 : 1,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: wide ? 1.35 : 3.5,
          children: children,
        );
      },
    );
  }
}

class HomeCategoryTile extends StatelessWidget {
  const HomeCategoryTile({
    super.key,
    required this.title,
    required this.count,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String title;
  final int count;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Ink(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .16),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: Colors.white),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '$count model',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: .78),
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward, color: Colors.white),
          ],
        ),
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
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.inventory_2_outlined,
              color: milanaBurgundy,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Wholesale rule',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Minimal buyurtma: 1 modeldan kamida 1 qop. Standart qop 60 ta kiyimdan iborat.',
                  style: TextStyle(color: milanaInk.withValues(alpha: .68)),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: onSupport,
                  icon: const Icon(Icons.call_outlined, size: 18),
                  label: const Text('Menejer bilan bog‘lanish'),
                ),
              ],
            ),
          ),
        ],
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
  });

  final CatalogRepository catalog;
  final CartController cart;
  final AuthService auth;

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
  String sort = 'featured';
  bool savedOnly = false;
  int visibleProductCount = catalogInitialVisibleCount;
  final searchController = SearchController();
  final favoritesStore = FavoritesStore();
  final recentStore = RecentProductsStore();
  final favorites = <String>{};
  final recentIds = <String>[];
  String? syncedCustomerId;
  Set<String> lastRemoteFavorites = const <String>{};
  String? syncedRecentCustomerId;
  List<String> lastRemoteRecent = const <String>[];

  @override
  void initState() {
    super.initState();
    productsFuture = widget.catalog.loadProducts();
    _loadFavorites();
    _loadRecentProducts();
    widget.auth.addListener(_handleAuthChange);
  }

  @override
  void dispose() {
    widget.auth.removeListener(_handleAuthChange);
    searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Product>>(
      future: productsFuture,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          return _EmptyState(
            icon: Icons.cloud_off_outlined,
            title: 'Katalog ochilmadi',
            message: '${snap.error}',
            action: FilledButton(
              onPressed: () => setState(
                () => productsFuture = widget.catalog.loadProducts(),
              ),
              child: const Text('Qayta urinish'),
            ),
          );
        }
        final allProducts = snap.data ?? const <Product>[];
        final products = _filtered(allProducts);
        final visibleCount = effectiveCatalogVisibleCount(
          total: products.length,
          requested: visibleProductCount,
        );
        final visibleProducts = products.take(visibleCount).toList();
        final featured = _featuredProducts(products, allProducts);
        final recentProducts = _recentProducts(allProducts);
        final sizes = availableSizes(allProducts);
        final loadInfo = widget.catalog.lastLoadInfo;
        return RefreshIndicator(
          onRefresh: () async {
            final next = widget.catalog.loadProducts();
            setState(() => productsFuture = next);
            await next;
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            children: [
              PremiumCatalogHeader(
                total: allProducts.length,
                visible: products.length,
              ),
              if (loadInfo.fromCache) ...[
                const SizedBox(height: 12),
                CatalogCacheNotice(
                  info: loadInfo,
                  onRefresh: () => setState(
                    () => productsFuture = widget.catalog.loadProducts(),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              SearchBar(
                controller: searchController,
                hintText: 'Model, mato yoki kod qidirish',
                leading: const Icon(Icons.search),
                onChanged: (value) => setState(() {
                  query = value.trim().toLowerCase();
                  _resetCatalogWindow();
                }),
              ),
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
                onSize: (value) => setState(() {
                  size = value;
                  _resetCatalogWindow();
                }),
                onPriceBand: (value) => setState(() {
                  priceBand = value;
                  _resetCatalogWindow();
                }),
                onClear: () => setState(() {
                  searchController.clear();
                  query = '';
                  gender = 'all';
                  category = 'all';
                  size = 'all';
                  priceBand = PriceBand.all;
                  savedOnly = false;
                  _resetCatalogWindow();
                }),
                hasActiveFilters:
                    query.isNotEmpty ||
                    gender != 'all' ||
                    category != 'all' ||
                    size != 'all' ||
                    priceBand != PriceBand.all ||
                    savedOnly,
              ),
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
              if (featured.isNotEmpty) ...[
                const SizedBox(height: 18),
                SectionHeader(
                  title: 'Yangi kolleksiya',
                  trailing: '${featured.length} model',
                ),
                const SizedBox(height: 10),
                FeaturedProductsRail(
                  products: featured,
                  onOpen: (product) => _openProduct(product, allProducts),
                  onAdd: _add,
                ),
              ],
              if (recentProducts.isNotEmpty && !savedOnly) ...[
                const SizedBox(height: 18),
                SectionHeader(
                  title: 'Oxirgi ko‘rilganlar',
                  trailing: '${recentProducts.length} model',
                ),
                const SizedBox(height: 10),
                FeaturedProductsRail(
                  products: recentProducts,
                  badgeIcon: Icons.history,
                  badgeLabel: 'Ko‘rildi',
                  onOpen: (product) => _openProduct(product, allProducts),
                  onAdd: _add,
                ),
              ],
              const SizedBox(height: 18),
              SectionHeader(
                title: 'Katalog',
                trailing: products.length == visibleProducts.length
                    ? '${products.length} model'
                    : '${visibleProducts.length}/${products.length} model',
              ),
              const SizedBox(height: 10),
              LayoutBuilder(
                builder: (context, constraints) {
                  final wide = constraints.maxWidth > 720;
                  return GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: visibleProducts.length,
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: wide ? 3 : 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: wide ? .64 : .58,
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
        savedOnly: savedOnly,
        savedProductIds: favorites,
        sort: catalogSortFromString(sort),
      ),
    );
  }

  List<Product> _featuredProducts(List<Product> filtered, List<Product> all) {
    final source = filtered.isNotEmpty ? filtered : all;
    return source.take(8).toList();
  }

  List<Product> _recentProducts(List<Product> all) {
    if (recentIds.isEmpty) return const <Product>[];
    final byId = {for (final product in all) product.id: product};
    return recentIds
        .map((id) => byId[id])
        .whereType<Product>()
        .take(8)
        .toList();
  }

  void _toggleFavorite(Product product) {
    setState(() {
      if (!favorites.add(product.id)) favorites.remove(product.id);
    });
    unawaited(favoritesStore.save(favorites));
    if (widget.auth.signedIn) {
      unawaited(widget.auth.updateSavedProducts(favorites));
    }
  }

  Future<void> _loadFavorites() async {
    final saved = await favoritesStore.load();
    if (!mounted) return;
    setState(() {
      favorites
        ..clear()
        ..addAll(saved);
    });
    _mergeCustomerFavorites(widget.auth.customer);
  }

  Future<void> _loadRecentProducts() async {
    final saved = await recentStore.load();
    if (!mounted) return;
    setState(() {
      recentIds
        ..clear()
        ..addAll(saved);
    });
    _mergeCustomerRecent(widget.auth.customer);
  }

  void _handleAuthChange() {
    _mergeCustomerFavorites(widget.auth.customer);
    _mergeCustomerRecent(widget.auth.customer);
  }

  void _mergeCustomerFavorites(Customer? customer) {
    if (customer == null) {
      syncedCustomerId = null;
      lastRemoteFavorites = const <String>{};
      return;
    }
    final remote = customer.savedProductIds;
    final firstSyncForCustomer = syncedCustomerId != customer.id;
    final hasRemoteChanges = remote.difference(lastRemoteFavorites).isNotEmpty;
    if (!firstSyncForCustomer && !hasRemoteChanges) return;

    final merged = {...favorites, ...remote};
    setState(() {
      favorites
        ..clear()
        ..addAll(merged);
      syncedCustomerId = customer.id;
      lastRemoteFavorites = remote;
    });
    unawaited(favoritesStore.save(merged));
    if (firstSyncForCustomer && merged.length != remote.length) {
      unawaited(widget.auth.updateSavedProducts(merged));
    }
  }

  void _mergeCustomerRecent(Customer? customer) {
    if (customer == null) {
      syncedRecentCustomerId = null;
      lastRemoteRecent = const <String>[];
      return;
    }
    final remote = customer.recentProductIds;
    final firstSyncForCustomer = syncedRecentCustomerId != customer.id;
    final hasRemoteChanges =
        _recentFingerprint(remote) != _recentFingerprint(lastRemoteRecent);
    if (!firstSyncForCustomer && !hasRemoteChanges) return;

    final merged = _mergeRecent(
      firstSyncForCustomer ? recentIds : remote,
      firstSyncForCustomer ? remote : recentIds,
    );
    setState(() {
      recentIds
        ..clear()
        ..addAll(merged);
      syncedRecentCustomerId = customer.id;
      lastRemoteRecent = remote;
    });
    unawaited(recentStore.save(merged));
    if (_recentFingerprint(merged) != _recentFingerprint(remote)) {
      unawaited(widget.auth.updateRecentProducts(merged));
    }
  }

  void _trackRecent(Product product) {
    final next = _mergeRecent([product.id], recentIds);
    setState(() {
      recentIds
        ..clear()
        ..addAll(next);
    });
    unawaited(recentStore.save(next));
    if (widget.auth.signedIn) {
      unawaited(widget.auth.updateRecentProducts(next));
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

  void _add(Product product, {int quantity = 1}) {
    if (!widget.cart.canAdd(product, quantity: quantity)) {
      final limit = widget.cart.quantityLimit(product);
      final current = widget.cart.quantityOf(product);
      final message = limit < 1
          ? '${product.name} hozircha mavjud emas'
          : '${product.name} uchun maksimal $limit qop. Savatda $current qop bor.';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
      return;
    }
    for (var i = 0; i < quantity; i++) {
      widget.cart.add(product);
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${product.name} · $quantity qop savatga qo‘shildi'),
      ),
    );
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
        onAdd: (qty) => _add(product, quantity: qty),
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
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.auto_awesome, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Milana Premium',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'Optom uy kiyimlari katalogi. Dona narxini ko‘ring, qop bo‘yicha buyurtma qiling.',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: Colors.white.withValues(alpha: .86),
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _HeaderPill(
                icon: Icons.inventory_2_outlined,
                label: '1 qop = 60 ta',
              ),
              _HeaderPill(icon: Icons.straighten, label: '6 o‘lcham × 10'),
              _HeaderPill(
                icon: Icons.local_shipping_outlined,
                label: 'Cargo / pochta',
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _HeaderMetric(value: '$visible', label: 'ko‘rinmoqda'),
              const SizedBox(width: 10),
              _HeaderMetric(value: '$total', label: 'jami model'),
              const SizedBox(width: 10),
              const _HeaderMetric(value: r'$4+', label: 'dona narxi'),
            ],
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xfffff7e8),
        border: Border.all(color: const Color(0xffe2cfaa)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.wifi_off_outlined, color: milanaBurgundy),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Keshdagi katalog',
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 3),
                Text(
                  '$timestamp ko‘rsatilmoqda. Narx va mavjudlikni buyurtmadan oldin menejer tasdiqlaydi.',
                  style: TextStyle(color: milanaInk.withValues(alpha: .72)),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Yangilash'),
          ),
        ],
      ),
    );
  }
}

class _HeaderPill extends StatelessWidget {
  const _HeaderPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white.withValues(alpha: .1)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: Colors.white),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderMetric extends StatelessWidget {
  const _HeaderMetric({required this.value, required this.label});

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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: Colors.white.withValues(alpha: .72),
                fontSize: 12,
              ),
            ),
          ],
        ),
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
        Text(
          title,
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        const Spacer(),
        Text(
          trailing,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            color: milanaInk.withValues(alpha: .58),
          ),
        ),
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
      height: 260,
      child: ListView.separated(
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
        borderRadius: BorderRadius.circular(8),
        onTap: onOpen,
        child: Ink(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: ClipRRect(
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(8),
                        ),
                        child: ProductImage(product: product),
                      ),
                    ),
                    Positioned(
                      left: 10,
                      top: 10,
                      child: _SoftBadge(icon: badgeIcon, label: badgeLabel),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 2),
                child: Text(
                  product.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  '${money.format(product.price)} / dona',
                  style: Theme.of(
                    context,
                  ).textTheme.labelLarge?.copyWith(color: milanaBurgundy),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: onAdd,
                    icon: const Icon(Icons.shopping_bag_outlined, size: 18),
                    label: Text(onAdd == null ? 'Mavjud emas' : '1 qop'),
                  ),
                ),
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
    required this.onSize,
    required this.onPriceBand,
    required this.onClear,
    required this.hasActiveFilters,
  });

  final String size;
  final List<String> sizes;
  final PriceBand priceBand;
  final ValueChanged<String> onSize;
  final ValueChanged<PriceBand> onPriceBand;
  final VoidCallback onClear;
  final bool hasActiveFilters;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'Tez filterlar',
              style: Theme.of(
                context,
              ).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
            const Spacer(),
            if (hasActiveFilters)
              TextButton.icon(
                onPressed: onClear,
                icon: const Icon(Icons.close, size: 16),
                label: const Text('Tozalash'),
              ),
          ],
        ),
        const SizedBox(height: 6),
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
    return Row(
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
        const Spacer(),
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
              borderRadius: BorderRadius.circular(8),
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
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
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
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
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
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                children: [
                  Positioned.fill(child: ProductImage(product: product)),
                  Positioned(
                    left: 8,
                    top: 8,
                    child: _SoftBadge(
                      icon: Icons.inventory_2_outlined,
                      label: qopAvailabilityLabel(product),
                    ),
                  ),
                  Positioned(
                    right: 8,
                    top: 8,
                    child: IconButton.filledTonal(
                      onPressed: onFavorite,
                      icon: Icon(
                        isFavorite ? Icons.favorite : Icons.favorite_border,
                        size: 18,
                      ),
                      tooltip: 'Saqlash',
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.white.withValues(alpha: .92),
                        foregroundColor: milanaBurgundy,
                        fixedSize: const Size(36, 36),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 10, 10, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      product.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  Text(
                    money.format(product.price),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: milanaBurgundy,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Text(
                product.fabric.isEmpty
                    ? '${product.gender} · ${product.category}'
                    : product.fabric,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: onAdd,
                  icon: const Icon(Icons.shopping_bag_outlined, size: 18),
                  label: Text(onAdd == null ? 'Mavjud emas' : '1 qop savatga'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ProductImage extends StatelessWidget {
  const ProductImage({super.key, required this.product, this.image});

  final Product product;
  final String? image;

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
    return CachedNetworkImage(
      imageUrl: imageUrl,
      width: double.infinity,
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 180),
      fadeOutDuration: const Duration(milliseconds: 90),
      memCacheWidth: 900,
      maxWidthDiskCache: 1200,
      placeholder: (context, url) => const ProductImagePlaceholder(),
      errorWidget: (context, url, error) => const ProductImageFallback(),
      imageBuilder: (context, provider) => DecoratedBox(
        decoration: BoxDecoration(
          image: DecorationImage(image: provider, fit: BoxFit.cover),
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
  final ValueChanged<int> onAdd;
  final ValueChanged<Product> onOpenRelated;
  final ValueChanged<Product> onAddRelated;

  @override
  State<ProductSheet> createState() => _ProductSheetState();
}

class _ProductSheetState extends State<ProductSheet> {
  int imageIndex = 0;
  int qopCount = 1;

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final maxQop = qopUiLimit(product);
    final selectedQop = qopCount.clamp(1, maxQop < 1 ? 1 : maxQop).toInt();
    final item = CartItem(product: product, quantity: selectedQop);
    final images = product.images.isEmpty ? const <String>[] : product.images;
    final mix = item.mixSizes.map((size) => '$size × 10').join(', ');
    final specs = productSpecs(product, item);
    final highlights = productHighlights(product);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .94,
      builder: (context, controller) {
        return ListView(
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
                      child: ProductImage(
                        product: product,
                        image: images.isEmpty ? null : images[imageIndex],
                      ),
                    ),
                  ),
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
                      onTap: () => setState(() => imageIndex = index),
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
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: milanaBurgundy,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
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
                  const SnackBar(content: Text('Model ma’lumoti nusxalandi')),
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
            const SizedBox(height: 18),
            Row(
              children: [
                QuantityStepper(
                  value: selectedQop,
                  max: maxQop < 1 ? 1 : maxQop,
                  onChanged: (value) => setState(() => qopCount = value),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: maxQop < 1
                        ? null
                        : () => widget.onAdd(selectedQop),
                    icon: const Icon(Icons.shopping_bag_outlined),
                    label: Text(
                      maxQop < 1
                          ? 'Mavjud emas'
                          : '${money.format(item.lineTotal)} · savatga',
                    ),
                  ),
                ),
              ],
            ),
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
        );
      },
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
                'Optom qop hisobi',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text('1 qop: $bagSize ta kiyim · 6 o‘lchamdan 10 tadan'),
          Text('Tarkib: $mix'),
          const Divider(height: 22),
          Row(
            children: [
              const Expanded(child: Text('1 qop narxi')),
              Text(
                money.format(item.bagPrice),
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
  });

  final CartController cart;
  final OrderRepository orders;
  final AuthService auth;

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
  bool sending = false;
  OrderReceipt? receipt;
  String? pendingClientOrderId;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([widget.cart, widget.auth]),
      builder: (context, _) {
        final customer = widget.auth.customer;
        if (customer != null) {
          if (name.text.isEmpty) name.text = customer.name;
          if (phone.text.isEmpty) phone.text = customer.phone;
          if (city.text.isEmpty) city.text = customer.city;
          if (address.text.isEmpty) address.text = customer.address;
        }
        if (receipt != null) {
          return _ReceiptView(
            receipt: receipt!,
            onContinue: () => setState(() => receipt = null),
          );
        }
        if (widget.cart.items.isEmpty) {
          return const _EmptyState(
            icon: Icons.shopping_bag_outlined,
            title: 'Savat bo‘sh',
            message: 'Katalogdan kamida 1 qop model qo‘shing.',
          );
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            CartSummaryPanel(
              qopCount: widget.cart.count,
              modelCount: widget.cart.items.length,
              total: widget.cart.total,
            ),
            const SizedBox(height: 14),
            ...widget.cart.items.map(
              (item) => CartLine(item: item, cart: widget.cart),
            ),
            const SizedBox(height: 12),
            _TotalPanel(total: widget.cart.total, qopCount: widget.cart.count),
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
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: sending ? null : _submit,
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

  Future<void> _submit() async {
    if (!formKey.currentState!.validate()) return;
    setState(() => sending = true);
    try {
      final customer = widget.auth.customer;
      final clientOrderId = pendingClientOrderId ?? createClientOrderId();
      pendingClientOrderId = clientOrderId;
      final result = await widget.orders.placeOrder(
        CheckoutRequest(
          name: name.text.trim(),
          phone: normalizePhoneNumber(phone.text),
          city: city.text.trim(),
          address: address.text.trim(),
          comment: comment.text.trim(),
          paymentMethod: payment,
          customerEmail: customer?.email ?? '',
          customerId: customer?.id,
          clientOrderId: clientOrderId,
          items: widget.cart.items,
        ),
      );
      widget.cart.clear();
      pendingClientOrderId = null;
      setState(() => receipt = result);
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
                    'Dona: ${money.format(item.product.price)} · 1 qop: ${money.format(item.bagPrice)}',
                  ),
                  Text(
                    item.mixSizes.map((size) => '$size×10').join(', '),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Row(
                    children: [
                      QuantityStepper(
                        value: item.quantity,
                        max: cart.quantityLimit(item.product),
                        onChanged: (value) =>
                            cart.setQuantity(item.product, value),
                      ),
                      const Spacer(),
                      IconButton(
                        onPressed: () => cart.remove(item.product),
                        icon: const Icon(Icons.delete_outline),
                        color: milanaInk.withValues(alpha: .62),
                        tooltip: 'O‘chirish',
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      Text(
                        '${item.quantity} qop · ${item.quantity * bagSize} ta kiyim',
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
    required this.qopCount,
    required this.modelCount,
    required this.total,
  });

  final int qopCount;
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
                  '$modelCount model · $qopCount qop · ${qopCount * bagSize} ta kiyim',
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
  const _TotalPanel({required this.total, required this.qopCount});

  final double total;
  final int qopCount;

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
              const Expanded(child: Text('Jami qop narxi')),
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
            '$qopCount qop · har qopda $bagSize ta kiyim. Yetkazib berish Cargo bilan kelishiladi.',
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

  @override
  void dispose() {
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
    if (customer != null && name.text.isEmpty) {
      name.text = customer.name;
      phone.text = customer.phone;
      email.text = customer.email;
    }
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
                  onPressed: sending ? null : _send,
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
    if (!formKey.currentState!.validate()) return;
    setState(() => sending = true);
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
        if (customer != null) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              AccountDashboardCard(
                customer: customer,
                onEdit: () => _editProfile(customer),
                onSignOut: widget.auth.signOut,
              ),
              const SizedBox(height: 16),
              AccountOverviewSection(
                orders: widget.orders,
                customerId: customer.id,
              ),
              const SizedBox(height: 24),
              Text(
                'Buyurtmalarim',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              CustomerOrdersList(
                orders: widget.orders,
                customerId: customer.id,
                cart: widget.cart,
              ),
              const SizedBox(height: 24),
              Text(
                'Murojaatlarim',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              CustomerSupportTicketsList(
                orders: widget.orders,
                customerId: customer.id,
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
              onSubmit: _submit,
              onToggleMode: () => setState(() => signUp = !signUp),
              onResetPassword: signUp ? null : _resetPassword,
            ),
            const SizedBox(height: 12),
            const Text(
              'Firebase ulanganida akkaunt Firebase Auth orqali ishlaydi. Hozir lokal demo rejimda ham appni ko‘rish mumkin.',
            ),
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

  Future<void> _resetPassword() async {
    final resetEmail = TextEditingController(text: normalizeEmail(email.text));
    var sending = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
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
    required this.onSubmit,
    required this.onToggleMode,
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
  final VoidCallback onSubmit;
  final VoidCallback onToggleMode;
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
                if (!busy) onSubmit();
              },
              validator: (value) => validatePassword(value, signUp: signUp),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: busy ? null : onSubmit,
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
  });

  final Customer customer;
  final VoidCallback onEdit;
  final VoidCallback onSignOut;

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

class AccountOverviewSection extends StatelessWidget {
  const AccountOverviewSection({
    super.key,
    required this.orders,
    required this.customerId,
  });

  final OrderRepository orders;
  final String customerId;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<OrderSummary>>(
      stream: orders.customerOrders(customerId),
      builder: (context, orderSnap) {
        return StreamBuilder<List<SupportTicketSummary>>(
          stream: orders.customerSupportTickets(customerId),
          builder: (context, supportSnap) {
            if (orderSnap.connectionState == ConnectionState.waiting ||
                supportSnap.connectionState == ConnectionState.waiting) {
              return const AccountOverviewLoading();
            }
            if (orderSnap.hasError || supportSnap.hasError) {
              return AccountOverviewError(
                message: '${orderSnap.error ?? supportSnap.error}',
              );
            }
            final overview = buildAccountOverview(
              orders: orderSnap.data ?? const [],
              supportTickets: supportSnap.data ?? const [],
            );
            return AccountOverviewCard(overview: overview);
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
  const AccountOverviewError({super.key, required this.message});

  final String message;

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
          Expanded(child: Text('Akkaunt ko‘rsatkichlari ochilmadi: $message')),
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
                      value: '${overview.activeQop} qop',
                      label: 'aktiv buyurtma',
                      detail: '${overview.activeClothes} ta kiyim',
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
                      detail: '${overview.totalQop} qop tarixda',
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
    required this.orders,
    required this.customerId,
    required this.cart,
  });

  final OrderRepository orders;
  final String customerId;
  final CartController cart;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<OrderSummary>>(
      stream: orders.customerOrders(customerId),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snap.hasError) {
          return Text('Buyurtmalar ochilmadi: ${snap.error}');
        }
        final rows = snap.data ?? const [];
        if (rows.isEmpty) {
          return const Text('Hozircha buyurtmalar yo‘q.');
        }
        return Column(
          children: rows
              .map(
                (order) =>
                    OrderStatusCard(order: order, orders: orders, cart: cart),
              )
              .toList(),
        );
      },
    );
  }
}

class OrderStatusCard extends StatefulWidget {
  const OrderStatusCard({
    super.key,
    required this.order,
    required this.orders,
    required this.cart,
  });

  final OrderSummary order;
  final OrderRepository orders;
  final CartController cart;

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
        CancelOrderRequest(orderId: order.id, reason: reason),
      );
      if (!mounted) return;
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
                            : 'Savatdagi qop miqdori allaqachon limitda',
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
                    Text('Qop: ${money.format(item.bagPrice)}'),
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
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottom),
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
                    child: Text(paymentMethodLabel(value)),
                  ),
              ],
              onChanged: (value) => setState(() => method = value ?? 'manager'),
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
    );
  }

  Future<void> _submit() async {
    if (!formKey.currentState!.validate()) return;
    setState(() => sending = true);
    try {
      final receipt = await widget.orders.submitPaymentProof(
        PaymentSubmission(
          orderId: widget.order.id,
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
                        color: milanaInk.withValues(alpha: .48),
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
                    color: i <= current
                        ? milanaBurgundy
                        : milanaInk.withValues(alpha: .48),
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
    required this.orders,
    required this.customerId,
  });

  final OrderRepository orders;
  final String customerId;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<SupportTicketSummary>>(
      stream: orders.customerSupportTickets(customerId),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snap.hasError) {
          return Text('Murojaatlar ochilmadi: ${snap.error}');
        }
        final rows = snap.data ?? const [];
        if (rows.isEmpty) {
          return const Text('Hozircha murojaatlar yo‘q.');
        }
        return Column(
          children: rows
              .map((ticket) => SupportTicketCard(ticket: ticket))
              .toList(),
        );
      },
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
    return Center(
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
  }
}
