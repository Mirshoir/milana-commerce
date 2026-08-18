import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String defaultLanguageCode = 'ru';
const String languageStorageKey = 'milana_language_code';

const List<String> supportedLanguageCodes = ['uz', 'ru', 'en'];

String normalizeLanguageCode(String value) {
  final normalized = value.trim().toLowerCase();
  return supportedLanguageCodes.contains(normalized)
      ? normalized
      : defaultLanguageCode;
}

String localizedText(
  String key, {
  String languageCode = defaultLanguageCode,
  Map<String, String>? args,
}) {
  final language = normalizeLanguageCode(languageCode);
  final fallback =
      localizedStrings[language]?[key] ??
      localizedStrings['ru']?[key] ??
      localizedStrings['en']?[key] ??
      localizedStrings['uz']?[key] ??
      key;
  if (args == null || args.isEmpty) return fallback;
  var value = fallback;
  for (final row in args.entries) {
    value = value.replaceAll('{${row.key}}', row.value);
  }
  return value;
}

class LanguageController extends ChangeNotifier {
  LanguageController({String languageCode = defaultLanguageCode}) {
    _languageCode = normalizeLanguageCode(languageCode);
    _loadSavedLanguage();
  }

  String _languageCode = defaultLanguageCode;
  bool ready = false;

  String get languageCode => _languageCode;
  Locale get locale => Locale(_languageCode);

  Future<void> _loadSavedLanguage() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(languageStorageKey);
      _languageCode = normalizeLanguageCode(saved ?? _languageCode);
    } finally {
      ready = true;
      notifyListeners();
    }
  }

  Future<void> setLanguage(String languageCode) async {
    final normalized = normalizeLanguageCode(languageCode);
    if (normalized == _languageCode) return;
    _languageCode = normalized;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(languageStorageKey, normalized);
    } catch (_) {
      // Persistence is intentionally not fatal.
    }
  }
}

class AppLanguageScope extends InheritedNotifier<LanguageController> {
  const AppLanguageScope({
    super.key,
    required super.notifier,
    required super.child,
  });

  static AppLanguageScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppLanguageScope>();

  static LanguageController of(BuildContext context) {
    final scope = maybeOf(context);
    if (scope == null) {
      throw StateError('Language scope is missing.');
    }
    return scope.notifier!;
  }

  static LanguageController? maybeController(BuildContext context) {
    return maybeOf(context)?.notifier;
  }
}

extension LocalizationContext on BuildContext {
  String localize(String key, {Map<String, String> args = const {}}) {
    final code =
        AppLanguageScope.maybeController(this)?.languageCode ??
        defaultLanguageCode;
    return localizedText(key, languageCode: code, args: args);
  }

  LanguageController? get maybeLanguageController =>
      AppLanguageScope.maybeController(this);

  String get currentLanguageCode =>
      maybeLanguageController?.languageCode ?? defaultLanguageCode;
}

const Map<String, Map<String, String>> localizedStrings = {
  'uz': {
    'language.name.uz': 'O‘zbek',
    'language.name.ru': 'Русский',
    'language.name.en': 'English',
    'language.title': 'Til',
    'language.help': 'Tilni o‘zgartirish',

    'Milana Premium': 'Milana Premium',
    'MILANA PREMIUM': 'MILANA PREMIUM',

    'home': 'Asosiy',
    'catalog': 'Katalog',
    'saved': 'Saqlanganlar',
    'cart': 'Savat',
    'support': 'Yordam',
    'partnership': 'Hamkor',
    'account': 'Akkaunt',
    'menu': 'Menyu',

    'distributor.hero.eyebrow': 'MILANA BILAN BIZNES',
    'distributor.hero.title': 'Hududingizda Milana distributori bo‘ling',
    'distributor.hero.subtitle':
        'Ulgurji narxlar, barqaror ta’minot va savdo jamoamiz yordami bilan biznesingizni rivojlantiring.',
    'distributor.cta.apply': 'Distributor bo‘lish',
    'distributor.cta.contact_sales': 'Savdo bo‘limi bilan bog‘lanish',
    'distributor.cta.request_pricing': 'Ulgurji narxlarni so‘rash',
    'distributor.cta.call': 'Qo‘ng‘iroq qilish',
    'distributor.why.title': 'Nega Milana?',
    'distributor.why.subtitle':
        '25 yildan ortiq tajribaga ega to‘liq siklli ishlab chiqaruvchi.',
    'distributor.why.full_cycle': 'O‘z ishlab chiqarishimiz va to‘liq sikl',
    'distributor.why.supply': 'Ishonchli, barqaror ta’minot zanjiri',
    'distributor.why.export': '20 dan ortiq mamlakatga eksport',
    'distributor.why.private_label': 'O‘z AI ekotizimimiz',
    'distributor.why.marketing': 'Distributorlar uchun marketing ko‘magi',
    'distributor.why.quality': 'Sifat nazorati va sertifikatlar',
    'distributor.proof.years': 'yillik tajriba',
    'distributor.proof.factories': 'ishlab chiqarish fabrikasi',
    'distributor.proof.countries': 'eksport mamlakati',
    'distributor.requirements.title': 'Hamkorlik talablari',
    'distributor.requirements.business': 'Faol ro‘yxatdan o‘tgan savdo biznesi',
    'distributor.requirements.volume': 'Kelishilgan minimal xarid hajmi',
    'distributor.requirements.territory': 'Aniq savdo hududi va kanallari',
    'distributor.requirements.brand': 'Brend va narx siyosatiga rioya qilish',
    'distributor.logistics.title': 'Yetkazib berish va eksport',
    'distributor.logistics.uzbekistan': 'O‘zbekiston bo‘ylab yetkazib berish',
    'distributor.logistics.export': '20+ mamlakatga yuk jo‘natish imkoniyati',
    'distributor.logistics.documents':
        'Eksport hujjatlarini tayyorlashda yordam',
    'distributor.logistics.quote':
        'Yo‘nalish, hajm va muddatga qarab individual tarif',
    'distributor.sales.title': 'Savdo mutaxassisi bilan gaplashing',
    'distributor.sales.subtitle':
        'MOQ, narx, hudud yoki yetkazib berish bo‘yicha tezkor javob oling.',
    'distributor.whatsapp.quote':
        'Salom, Milana ulgurji narxlari va MOQ haqida ma’lumot olmoqchiman.',
    'distributor.whatsapp.contact':
        'Salom, distributorlik hamkorligi haqida gaplashmoqchiman.',
    'distributor.contact.failed': 'Aloqa ilovasini ochib bo‘lmadi.',
    'distributor.status.not_applied': 'Ariza hali yuborilmagan',
    'distributor.status.not_applied_hint':
        'Hamkorlikni boshlash uchun distributor arizasini to‘ldiring.',
    'distributor.status.title': 'Ariza {number}',
    'distributor.status.submitted': 'Ariza qabul qilindi',
    'distributor.status.under_review': 'Savdo jamoasi arizani ko‘rib chiqmoqda',
    'distributor.status.information_requested': 'Qo‘shimcha ma’lumot kerak',
    'distributor.status.approved': 'Hamkorlik tasdiqlandi',
    'distributor.status.rejected': 'Ariza hozircha tasdiqlanmadi',
    'distributor.status.suspended': 'Hamkorlik vaqtincha to‘xtatilgan',
    'distributor.status.unknown': 'Holat yangilanmoqda',
    'distributor.application.title': 'Distributor arizasi',
    'distributor.application.subtitle':
        'Ma’lumotlaringizni qoldiring. Savdo menejeri siz bilan bog‘lanadi.',
    'distributor.application.success':
        '{number} raqamli ariza muvaffaqiyatli yuborildi.',
    'distributor.application.submit': 'Arizani yuborish',
    'distributor.application.failed':
        'Arizani yuborib bo‘lmadi. Qayta urinib ko‘ring.',
    'distributor.field.contact_name': 'Kontakt shaxs',
    'distributor.field.company_name': 'Kompaniya nomi',
    'distributor.field.phone': 'Telefon',
    'distributor.field.email': 'Email',
    'distributor.field.country': 'Mamlakat',
    'distributor.field.city': 'Shahar',
    'distributor.field.consent':
        'Arizamni ko‘rib chiqish uchun ma’lumotlarimdan foydalanishga roziman.',
    'distributor.consent.required': 'Davom etish uchun rozilik bering.',
    'notifications.title': 'Bildirishnomalar',
    'notifications.sign_in':
        'Shaxsiy bildirishnomalarni ko‘rish uchun akkauntga kiring.',
    'notifications.inbox': 'Xabarlar',
    'notifications.empty': 'Hozircha yangi xabar yo‘q.',
    'notifications.push.enabled': 'Push-bildirishnomalar yoqilgan',
    'notifications.push.prompt': 'Muhim yangiliklarni darhol oling',
    'notifications.push.enable': 'Yoqish',
    'notifications.push.failed':
        'Push-bildirishnomalarni yoqib bo‘lmadi. Qurilma sozlamalarini tekshiring.',
    'notifications.preferences': 'Bildirishnoma sozlamalari',
    'notifications.preferences_hint': 'Qaysi yangiliklarni olishni tanlang',
    'notifications.preference.orders': 'Buyurtma holati',
    'notifications.preference.application': 'Distributor arizasi holati',
    'notifications.preference.collections': 'Yangi kolleksiyalar',
    'notifications.preference.restocks': 'Qayta sotuvga chiqqan mahsulotlar',
    'notifications.preference.offers': 'Maxsus taklif va aksiyalar',
    'notifications.preference.news': 'Kompaniya yangiliklari',
    'notifications.preferences_failed': 'Sozlamalarni saqlab bo‘lmadi.',
    'account.field.company_name': 'Kompaniya nomi',
    'account.field.country': 'Mamlakat',

    'app.bar.search.tooltip': 'Qidirish',
    'app.bar.saved.tooltip': 'Saqlanganlar',
    'app.bar.cart.tooltip': 'Savat',
    'app.bar.assistant.tooltip': 'AI yordamchi',
    'common.close': 'Yopish',

    'catalog.error.title': 'Katalog ochilmadi',
    'catalog.error.message':
        'Internet aloqasini tekshirib, qayta urinib ko‘ring.',
    'catalog.error.retry': 'Qayta urinish',

    'home.banner.title.season': 'BAHOR—YOZ 26',
    'home.banner.top': 'Top',
    'home.section.women': 'BUTUN OILA UCHUN KIYIM',
    'home.section.homewear': 'UY UCHUN KOLLEKSIYA',
    'home.section.recent': 'YAQINDA KO‘RILGANLAR',
    'home.section.all': 'BARCHA MAHSULOTLAR',
    'home.banner.set': 'SET',
    'home.wholesale_ticker': 'ULGURJI BUYURTMA · 1 QADOQ YOKI 1 QOPDAN',
    'home.hero.title.empty': 'YUMSHOQLIK,\nANIQ O‘LCHAMDA.',
    'home.hero.title.with_product': 'KUN BO‘YI\nQULAYLIK.',
    'home.hero.loading': 'KOLLEKSIYA YANGILANMOQDA',
    'home.hero.tagline': 'KIYIM-KECHAK FABRIKASI · O‘ZBEKISTON',
    'home.hero.view_model': 'Modelni ko‘rish',
    'home.hero.support_tooltip': 'Yordam',
    'home.hero.play_tooltip': 'Slaydlarni davom ettirish',
    'home.hero.pause_tooltip': 'Slaydlarni to‘xtatish',
    'home.stat.pack_value': '1 QADOQ YOKI 1 QOPDAN',
    'home.stat.pack_label': 'Qadoq — 6 dona, qop — 60 dona',
    'home.stat.delivery_value': 'POCHTA YOKI CARGO',
    'home.stat.delivery_label': 'Yetkazib berish xarajatini mijoz to‘laydi',
    'home.stat.manager_value': 'MENEJER YORDAMI',
    'home.stat.manager_label': '{count} model · narx va mavjudlik tasdiqlanadi',
    'home.category.women.subtitle': 'Xalat va pijama',
    'home.category.men.subtitle': 'Erkaklar to‘plami',
    'home.category.kids.subtitle': 'Bolalar kiyimlari',
    'home.wholesale_band.title': 'Buyurtma qanday ishlaydi',
    'home.wholesale_band.step1.title': 'Model va format',
    'home.wholesale_band.step2.text':
        'Mavjudlik, rang va jami summa tekshiriladi.',
    'home.wholesale_band.step3.text': 'To‘lovdan so‘ng buyurtma jo‘natiladi.',
    'home.wholesale_band.cta': 'Menejer bilan bog‘lanish',

    'catalog.clear_filters': 'Filterlarni tozalash',
    'catalog.refresh': 'Yangilash',
    'catalog.loading': 'Katalog yuklanmoqda',
    'catalog.search_placeholder': 'Barcha mahsulotlardan qidirish…',
    'catalog.breadcrumb': 'Bosh sahifa / Katalog',
    'catalog.header.subtitle':
        'Ulgurji buyurtmalar uchun uy va kundalik kiyimlar katalogi.',
    'catalog.filters.quick': 'Tez filtrlar',
    'catalog.filters.close': 'Filtrlarni yopish',
    'catalog.filters.open': 'Filtrlarni ochish',
    'catalog.filters.active': 'Filtrlar qo‘llanilgan ({count})',
    'catalog.badge.new': 'YANGI',
    'catalog.availability.all': 'Barchasi',
    'catalog.availability.in_stock': 'Mavjud',
    'catalog.availability.preorder': 'Oldindan',
    'catalog.curation.all': 'Barchasi',
    'catalog.curation.new_arrival': 'Yangi kelganlar',
    'catalog.curation.bestseller': 'Top savdo',
    'catalog.curation.sale': 'Aksiya',
    'catalog.price_band.all': 'Barchasi',
    'catalog.price_band.under5': '5 gacha',
    'catalog.price_band.from5_to7': '5–7',
    'catalog.price_band.over7': '7 dan yuqori',
    'catalog.size.all': 'Barchasi',
    'catalog.sort': 'Saralash bo‘yicha',
    'catalog.sort.all': 'Barchasi',
    'catalog.sort.pajamas': 'Pijamalar',
    'catalog.sort.robes': 'Xalatlar',
    'catalog.sort.women': 'Ayollar',
    'catalog.sort.men': 'Erkaklar',
    'catalog.sort.kids': 'Bolalar',
    'catalog.sort.featured': 'Mashhur',
    'catalog.sort.price_low': 'Arzonroqdan',
    'catalog.sort.price_high': 'Qimmatroqdan',
    'catalog.sort.name': 'Nomi bo‘yicha',
    'catalog.saved_count': 'Saqlanganlar: {count}',
    'catalog.models_count': '{count} model',
    'catalog.models_count_ratio': '{visible} / {total} model',
    'catalog.add': 'Savatga qo‘shish',
    'catalog.demo_enabled_note':
        'Demo rejimida siz real to‘lovsiz mahsulotlarni ko‘rishingiz va buyurtma jarayonini tekshirishingiz mumkin.',
    'catalog.add_to_cart_count': '{count} {unit} savatga qo‘shish',
    'catalog.add.limit_exceeded':
        '{product} uchun limit {limit} {unit}dan oshib ketdi. Hozirgi miqdor: {current} {unit}.',
    'catalog.empty.saved.title': 'Saqlangan modellar yo‘q',
    'catalog.empty.saved.message': 'Istalgan modelni ♡ bosib saqlang.',
    'catalog.empty.search.title': 'Hech narsa topilmadi',
    'catalog.empty.search.message':
        'Qidiruvni o‘zgartiring yoki filtrlarni tozalab qaytadan urinib ko‘ring.',
    'catalog.load_more': 'Ko‘proq ko‘rsatish · {visible}/{total}',
    'catalog.cache.title': 'Kesh ma’lumoti: {timestamp}',
    'catalog.cache.timestamp': 'So‘nggi yangilanish: {time}',
    'catalog.cache.empty': 'Kesh vaqti ko‘rsatilmagan',

    'product.sheet.view_all': 'MODELLARNI KO‘RISH · {count}',
    'product.highlight.pack':
        'Qadoqdan boshlang yoki to‘liq qop tanlang. Narx, qoldiq va jo‘natishni menejer yakuniy tasdiqlaydi.',
    'product.highlight.bag_select': 'Qadoq yoki qopni tanlab savatga qo‘shing.',
    'product.highlight.manager': 'Menejer tasdig‘i',
    'product.highlight.payment': 'To‘lov va Cargo',
    'product.highlight.delivery_cost':
        'Yetkazib berish xarajatini mijoz to‘laydi.',
    'product.tag.new': 'YANGI',
    'product.tag.bestseller': 'TOP',
    'product.tag.sale': 'AKSIYA',

    'product.card.price_unit': 'dona',
    'product.card.open_details': 'Tafsilotlarni ochish',
    'product.card.saved_add': 'Saqlash',
    'product.card.saved_remove': 'Saqlanganlardan olib tashlash',
    'product.image.label': '{product} rasmi',

    'auth.sign_in': 'Kirish',
    'auth.sign_up': 'Akkaunt yaratish',
    'auth.has_account': 'Menda akkaunt bor',
    'auth.create_account': 'Yangi akkaunt yaratish',
    'auth.forgot_password': 'Parolni unutdingizmi?',
    'auth.google': 'Google bilan kirish',
    'auth.apple': 'Apple bilan kirish',
    'auth.or': 'YOKI',
    'auth.privacy_checkbox':
        'Maxfiylik siyosati va foydalanish shartlariga roziman',
    'auth.privacy_policy': 'Maxfiylik siyosati',
    'auth.terms': 'Foydalanish shartlari',
    'auth.email': 'Email',
    'auth.password': 'Parol',

    'validation.email.required': 'Email kiriting',
    'validation.email.invalid': 'Email noto‘g‘ri',
    'validation.password.required': 'Parol kiriting',
    'validation.password.short': 'Kamida 8 ta belgi',
    'validation.name.required': 'Ism kiriting',
    'form.required': 'Majburiy',
    'validation.required': '{label} kiriting',
    'validation.phone.required': 'Telefon kiriting',
    'validation.phone.invalid': 'Telefonni tekshiring',
    'validation.long': '{label} juda uzun',
    'auth.error.default':
        'Xizmat bilan bog‘lanib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.',
    'auth.error.auth_backend': 'Akkaunt xizmati vaqtincha mavjud emas.',
    'auth.error.wrong_credentials': 'Email yoki parol noto‘g‘ri.',
    'auth.error.email_exists': 'Bu email bilan akkaunt mavjud.',
    'auth.error.google_cancelled': 'Google kirishi bekor qilindi.',
    'auth.error.google_failed':
        'Google orqali kirish muvaffaqiyatsiz tugadi. Iltimos, qayta urinib ko‘ring.',
    'auth.error.google_client_id':
        'Google OAuth sozlamasi to‘liq emas. Admin bilan bog‘lanib CLIENT ID ma’lumotlarini kiriting.',
    'auth.error.apple_cancelled': 'Apple kirishi bekor qilindi.',
    'auth.error.apple_failed':
        'Apple orqali kirish muvaffaqiyatsiz tugadi. Iltimos, qayta urinib ko‘ring.',
    'auth.error.weak_password': 'Parol juda oddiy.',
    'auth.error.recent_login':
        'Xavfsizlik uchun qayta kiring va amalni takrorlang.',
    'auth.error.unauthenticated': 'Davom etish uchun akkauntga qayta kiring.',

    'order.status.new': 'yangi',
    'order.status.confirmed': 'tasdiqlandi',
    'order.status.packed': 'tayyorlanmoqda',
    'order.status.shipped': 'yuborildi',
    'order.status.delivered': 'yetkazildi',
    'order.status.failed': 'muvaffaqiyatsiz',
    'order.status.cancelled': 'bekor qilingan',
    'order.status.pending': 'kutilmoqda',
    'order.status.submitted': 'tekshiruvda',
    'order.status.waiting': 'mijozdan kutilmoqda',
    'order.status.refunded': 'qaytarilgan',

    'order.payment.paid': 'to‘langan',
    'order.payment.submitted': 'tekshiruvda',
    'order.payment.waiting': 'mijozdan kutilmoqda',
    'order.payment.failed': 'muvaffaqiyatsiz',
    'order.payment.pending': 'kutilmoqda',
    'order.payment.cancelled': 'bekor qilingan',
    'order.payment.refunded': 'qaytarilgan',

    'checkout.payment_manager': 'Menejer orqali',
    'checkout.payment_bank': 'Bank o‘tkazmasi',
    'checkout.payment_click': 'Click',
    'checkout.payment_payme': 'Payme',
    'checkout.payment_card': 'Karta',
    'checkout.payment_cash': 'Naqd / kelishuv',
    'checkout.instructions.bank':
        'Bank rekvizitlari menejer tomonidan yuboriladi. To‘lovdan oldin {phone} bilan tasdiqlang.',
    'checkout.instructions.click':
        'Click to‘lovi uchun hisob/link menejer tomonidan yuboriladi. To‘lovdan oldin {phone} bilan tasdiqlang.',
    'checkout.instructions.payme':
        'Payme to‘lovi uchun hisob/link menejer tomonidan yuboriladi. To‘lovdan oldin {phone} bilan tasdiqlang.',
    'checkout.instructions.card':
        'Karta raqami menejer tomonidan yuboriladi. To‘lovdan oldin {phone} bilan tasdiqlang.',
    'checkout.instructions.cash':
        'Naqd to‘lov yetkazib berish yoki olib ketish shartiga qarab {phone} bilan kelishiladi.',
    'checkout.instructions.default':
        'Menejerimiz {phone} orqali narx, mavjudlik va to‘lovni tasdiqlaydi.',
    'checkout.copy_payment_label': 'Menejer tomonidan tasdiqlanadi',

    'product.pack.label': 'Qadoq',
    'product.bag.label': 'Qop',
    'product.pack.label.en': 'Pack',
    'product.bag.label.en': 'Bag',

    'product.unit': '{count} dona',
    'product.size_per': '{count} tadan',
    'product.sheet.recommended_models': 'TAVSIYA ETILGAN MODELLAR',
    'product.gallery.previous': 'Oldingi rasm',
    'product.gallery.next': 'Keyingi rasm',
    'product.premium': 'Premium',
    'product.order_type.prompt': 'Buyurtma formatini tanlang',
    'product.copy.info': 'Model ma’lumotini nusxalash',
    'product.copy.info_done': 'Model ma’lumoti nusxalandi',
    'product.add_to_cart': 'Savatga qo‘shish · {amount}',
    'product.related.title': 'Shunga o‘xshash modelllar',
    'product.variants.title': 'Shu modelning variantlari',
    'product.care.title': 'Parvarish bo‘yicha ko‘rsatma',
    'product.measurements.title': 'Kiyim o‘lchovlari',
    'product.related.badge': 'Tavsiya etilgan',
    'quantity.decrease': 'Kamaytirish',
    'quantity.increase': 'Ko‘paytirish',

    'assistant.placeholder':
        'Salom. Model, narx, qop qoidasi yoki yetkazib berish bo‘yicha so‘rashingiz mumkin.',
    'assistant.title': 'AI yordamchi',
    'assistant.subtitle':
        'Model, narx, mavjudlik va yetkazib berish bo‘yicha tezkor yordam.',
    'assistant.input_hint': 'Savolingizni yozing...',
    'assistant.send': 'Yuborish',
    'assistant.quick.bag': 'Qadoq va qop',
    'assistant.quick.delivery': 'Yetkazib berish',
    'assistant.quick.partnership': 'Distributorlik',
    'assistant.quick.sales': 'Savdo menejeri',
    'assistant.quick.mens_model': 'Erkaklar modeli',
    'assistant.quick.bag_prompt':
        'Qadoq yoki qop formatidagi buyurtmani ko‘rib chiqish',
    'assistant.quick.delivery_prompt':
        'Yetkazib berish narxi va muddatini so‘rang',
    'assistant.quick.partnership_prompt':
        'Distributor bo‘lish talablari, MOQ va hamkorlik shartlarini tushuntiring',
    'assistant.quick.mens_model_prompt':
        'Erkaklar uchun eng mashhur modellarni o‘rganing',
    'assistant.failure':
        'Hozir AI javob bera olmadi. Menejerga yozing yoki birozdan keyin qayta urinib ko‘ring.',
    'assistant.report.action': 'Javobni shikoyat qilish',
    'assistant.report.title': 'AI javobini shikoyat qilish',
    'assistant.report.description':
        'Xavfli, haqoratli yoki noto‘g‘ri javob haqida bizga xabar bering.',
    'assistant.report.reason': 'Sabab',
    'assistant.report.reason.offensive_or_unsafe': 'Haqoratli yoki xavfli',
    'assistant.report.reason.inaccurate_or_misleading':
        'Noto‘g‘ri yoki chalg‘ituvchi',
    'assistant.report.reason.other': 'Boshqa sabab',
    'assistant.report.comment': 'Qo‘shimcha izoh (ixtiyoriy)',
    'assistant.report.submit': 'Xabar berish',
    'assistant.report.success': 'Xabaringiz yuborildi. Rahmat.',
    'assistant.report.failed': 'Xabar yuborilmadi. Qayta urinib ko‘ring.',

    'cart.empty.title': 'Savat bo‘sh',
    'cart.empty.message': 'Katalogdan qadoq yoki qop tanlab qo‘shing.',
    'cart.added': 'Savatga qo‘shildi',
    'cart.item_unavailable': '{product} hozircha mavjud emas',
    'cart.message.unavailable': 'Hozircha mavjud emas',
    'cart.toast.added': '{product} · {count} dona {unit} savatga qo‘shildi',
    'action.clear': 'Tozalash',
    'action.continue': 'Davom etish',
    'action.copy': 'Nusxalash',
    'cart.loading': 'Yuklanmoqda',
    'cart.submit.action': 'Buyurtmani yuborish',
    'cart.empty.open_catalog': 'Katalogga o‘tish',
    'cart.account_service.unavailable.title': 'Akkaunt xizmati mavjud emas',
    'cart.account_service.unavailable.message':
        'Akkaunt xizmati hozirda ishlamayapti. Iltimos, keyinroq qayta urinib ko‘ring.',
    'cart.manager.list_error': 'Menejerlar ro‘yxatini yuklab bo‘lmadi',
    'cart.manager.unavailable': 'Menejer topilmadi',
    'cart.submit.failed': 'Buyurtma yuborilmadi: {error}',
    'cart.submit.failed_safe':
        'Buyurtmani yuborib bo‘lmadi. Iltimos, qayta urinib ko‘ring yoki +998 50 155 10 10 raqamiga murojaat qiling.',
    'cart.submit.note':
        'Iltimos, barcha maydonlarni to‘ldiring va to‘lov usulini aniqlang.',
    'cart.submit.receipt_save_failed': 'Buyurtma nusxasini saqlab bo‘lmadi',
    'cart.receipt.title': 'Buyurtma tasdiqlandi',
    'cart.receipt.reference_active': 'To‘lov rekvisiitsiyasi faol',
    'cart.receipt.reference_expires':
        'To‘lov refarensiyasi amal muddati: {datetime}',
    'cart.receipt.copy_action': 'Buyurtmani nusxalash',
    'cart.receipt.clear_failed': 'Chekni tozalash amalga oshmadi',
    'cart.field.name': 'Ism',
    'cart.field.phone': 'Telefon',
    'cart.field.city': 'Shahar',
    'cart.field.address': 'Manzil',
    'cart.field.country_prompt': 'Mamlakatni tanlang',
    'cart.field.country_required': 'Mamlakatni tanlash majburiy',
    'cart.country.uzbekistan': 'O‘zbekiston',
    'cart.country.other': 'Boshqa mamlakat',
    'cart.manager.choose_country': 'Avval mamlakatni tanlang',
    'cart.field.manager': 'Menejer',
    'cart.field.manager_prompt': 'Menejerni tanlang',
    'cart.field.manager_required': 'Menejerni tanlash majburiy',
    'cart.field.payment_method': 'To‘lov usuli',
    'cart.field.comment': 'Izoh',
    'cart.line.unit_price':
        '1 {unit} narxi: {price}, qadoq yoki to‘liq narxi: {package_price}',
    'cart.item.removed': '{product} savatdan olib tashlandi',
    'cart.action.undo': 'Bekor qilish',
    'cart.action.delete': 'O‘chirish',
    'cart.item.summary': '{quantity} {unit} · {pieces} dona',
    'cart.summary.title': 'Buyurtma xulosasi',
    'cart.summary.stats':
        '{models} model · {packages} qadoq · {pieces} dona · {packs} to‘plam · {bags} qop',
    'cart.total.label': 'Umumiy',
    'cart.total.note': 'Taxminiy hisob: {packages} qadoq, {pieces} dona',
    'cart.commerce.email_verification_hint':
        'Elektron pochtangiz tasdiqlanmagani uchun hisobni sinxronlash to‘xtatildi. Tasdiqlashni amalga oshiring.',
    'cart.commerce.notice.verify_title': 'Emailni tasdiqlash kerak',
    'cart.commerce.notice.verify_message':
        'Sotib olishdan oldin akkaunt e-mailingizni tasdiqlang.',
    'cart.commerce.notice.verify_button': 'Emailni tekshirish',
    'cart.commerce.notice.sync_title': 'Savdo hisobini sinxronlash',
    'cart.commerce.notice.sync_message':
        'Savdo platformasiga ulanishda xatolik.',
    'cart.commerce.notice.sync_button': 'Qayta ulash',
    'cart.privacy.open_failed': 'Maxfiylik siyosatini ochib bo‘lmadi',

    'support.title': 'Mijozlar qo‘llab-quvvatlovi',
    'support.help_hint':
        'Narx, mavjudlik, Cargo, to‘lov yoki brak bo‘yicha savolingizni yuboring. Menejer: +998 50 155 10 10',
    'support.action.send': 'Yuborish',
    'support.field.name': 'Ism',
    'support.field.phone': 'Telefon',
    'support.field.email': 'Email',
    'support.field.topic': 'Mavzu',
    'support.field.message': 'Savolingiz',
    'support.validation.message': 'Savol juda qisqa',
    'support.topic.general': 'Umumiy',
    'support.quick.title': 'Tez-tez so‘raladigan savollar',
    'support.quick.search_hint': 'Savollarni izlash',
    'support.quick.empty': 'Mos savol topilmadi',
    'support.ticket.created': 'Savol yuborildi: {number}',
    'support.ticket.failed': 'Yuborilmadi: {error}',
    'support.ticket.empty': 'Hozircha murojaat yo‘q',
    'support.ticket.reload': 'Qayta yuklash',
    'support.ticket.manager_reply': 'Menejer javobi',
    'support.ticket.status.open': 'Ochilgan',
    'support.ticket.status.waiting_for_customer': 'Mijoz javobini kutmoqda',
    'support.ticket.status.resolved': 'Yechilgan',
    'support.ticket.status.closed': 'Yopilgan',
    'support.ticket.status.new': 'Yangi',

    'account.title': 'Mening akkauntim',
    'account.metric.saved': 'saqlangan',
    'account.metric.account': 'optom akkaunt',
    'account.metric.profile': 'profil to‘liqligi',
    'account.action.edit_profile': 'Profil',
    'account.action.sign_out': 'Chiqish',
    'account.action.delete': 'Akkauntni o‘chirish',
    'account.security.title': 'Akkaunt va xavfsizlik',
    'account.security.subtitle': 'Maxfiy va muhim sozlamalar',
    'account.security.delete_description':
        'Akkauntni o‘chirish qaytarib bo‘lmaydigan amal. Bu bo‘limdan faqat akkauntni butunlay yopish uchun foydalaning.',
    'account.section.orders': 'Buyurtmalarim',
    'account.section.tickets': 'Murojaatlarim',
    'account.commerce.state_connected_title': 'Savdo hisobi bog‘langan',
    'account.commerce.state_connected_message':
        'Savdo hisobingiz muvaffaqiyatli sinxronlandi.',
    'account.commerce.state_verify_title': 'Emailni tasdiqlang',
    'account.commerce.state_verify_message':
        'Savdo hisobidan foydalansh uchun emailni tasdiqlang.',
    'account.commerce.state_syncing_title': 'Savdo hisobi sinxronlanmoqda',
    'account.commerce.state_syncing_message':
        'Savdo hisobingiz bilan ulanish tekshirilmoqda.',
    'account.commerce.state_retry_title': 'Savdo hisobi muammosi',
    'account.commerce.state_retry_message':
        'Savdo hisobini qayta bog‘lang yoki iltimos, keyinroq urinib ko‘ring.',
    'account.commerce.resend_verification': 'Tekshiruvni qayta yuborish',
    'account.commerce.resent_success': 'Tekshiruv uchun email yuborildi',
    'account.signup_success_with_verification':
        'Akkaunt yaratildi. Emailingizni tasdiqlang.',
    'account.delete_warning':
        'Akkauntni o‘chirganingizda barcha buyurtma va saqlangan ma’lumotlar o‘chadi. Bu amalni qaytarib bo‘lolmaydi.',
    'account.edit_profile_error':
        'Profilni yangilashda xatolik yuz berdi: {error}',
    'account.empty': 'Hali bu bo‘lim bo‘sh.',
    'account.loading_failed':
        'Ayrim akkaunt ma’lumotlari yangilanmadi. Qayta urinib ko‘ring.',
    'account.overview.title': 'Aktivligim',
    'account.overview.last_order': 'Oxirgi buyurtma: {latest}',
    'account.overview.no_activity': 'Hoziroq faoliyat yo‘q',
    'account.overview.none': 'Hali faoliyat yo‘q',
    'account.overview.active_packages_label': 'Faol qadoqlar',
    'account.overview.active_pieces': '{count} dona',
    'account.overview.confirmed_payment_label': 'Tasdiqlangan to‘lov',
    'account.overview.pending_payment_orders': 'Kutishda: {count} ta buyurtma',
    'account.overview.total_orders_label': 'Jami buyurtmalar',
    'account.overview.total_packages': '{count} ta qadoq',
    'account.overview.open_tickets_label': 'Ochilgan murojaatlar',
    'account.overview.ticket_waiting': 'Javobni kutmoqda',

    'order.title': 'Buyurtma ma’lumoti',

    'legal.title': 'Huquqiy ma’lumotlar',
    'legal.link.privacy': 'Maxfiylik',
    'analytics.consent.title': 'Ilovani yaxshilashga yordam bering',
    'analytics.consent.body':
        'Ixtiyoriy foydalanish tahlilini yoqing. Buni istalgan payt o‘chirish mumkin.',
    'legal.link.terms': 'Shartlar',
    'legal.link.delete': 'Akkauntni o‘chirish',
    'legal.link.support': 'Yordam',
    'legal.body':
        'Ma’lumotlaringiz qanday ishlatilishi, xizmat shartlari va akkauntni o‘chirish tartibi.',

    'copy.toast.reference': 'Reference nusxalandi',
    'copy.toast.order': 'Buyurtma ma’lumoti nusxalandi',
    'copy.toast.phone': 'Telefon nusxalandi',
    'copy.toast.manager': 'Menejer raqami nusxalandi',
    'copy.toast.tracking': 'Tracking raqami nusxalandi',

    'bootstrap.title': 'Milana Premium vaqtincha ochilmadi',
    'bootstrap.message':
        'Internet aloqasini tekshirib, ilovani qayta oching. Muammo davom etsa: +998 50 155 10 10',
    'bootstrap.retry_hint': 'Milana Premium vaqtincha ochilmadi',

    'delete.title': 'Akkauntni o‘chirish',
    'delete.cancel': 'Bekor qilish',
    'delete.confirm_instruction': 'Tasdiqlash uchun DELETE deb yozing',
    'delete.reason_label': 'Akkauntni nega o‘chirmoqchisiz?',
    'delete.reason_help':
        'Sabab anonim saqlanadi va xizmatni yaxshilash uchun ishlatiladi. Shaxsiy ma’lumot kiritmang.',
    'delete.reason_detail': 'Qo‘shimcha izoh (ixtiyoriy)',
    'delete.reason_detail_help': '“Boshqa” tanlansa, qisqacha izoh kiriting.',
    'delete.reason_invalid': 'O‘chirish sababini tanlang.',
    'delete.reason.no_longer_needed': 'Ilovadan endi foydalanmayman',
    'delete.reason.missing_features': 'Kerakli funksiyalar mavjud emas',
    'delete.reason.difficult_to_use': 'Ilovadan foydalanish qiyin',
    'delete.reason.technical_problems': 'Texnik muammolar bor',
    'delete.reason.privacy_concerns': 'Maxfiylik bo‘yicha xavotirim bor',
    'delete.reason.created_by_mistake': 'Akkaunt xato ochilgan',
    'delete.reason.prefer_not_to_say': 'Javob bermaslikni afzal ko‘raman',
    'delete.reason.other': 'Boshqa sabab',
    'delete.button': 'Butunlay o‘chirish',
    'delete.rules': 'O‘chirish qoidalarini ko‘rish',
    'delete.support': 'Yordam bilan bog‘lanish',
    'delete.success': 'Akkaunt o‘chirildi.',

    'password_reset.title': 'Parolni tiklash',
    'password_reset.button': 'Yuborish',
    'password_reset.description':
        'Qayta tiklash xatini olish uchun email manzilni kiriting.',
    'password_reset.sent': 'Parolni tiklash xati yuborildi.',
    'password_reset.cancel': 'Bekor qilish',
    'password_reset.error': 'Yuborilmadi: {error}',
    'password_reset.success': 'Parolni tiklash xati yuborildi.',
    'assistant.fallback':
        'Ayni vaqtda javob bera olmayapman. Menejerga yozing yoki birozdan so‘ng qayta urinib ko‘ring.',

    'catalog.gender.all': 'Hammasi',
    'catalog.gender.men': 'Erkaklar',
    'catalog.gender.kids': 'Bolalar',
    'catalog.gender.women': 'Ayollar',
    'catalog.category.default': 'Barcha toifalar',
    'catalog.category.family': 'Oila uchun',
    'catalog.category.homewear': 'Uy kiyimi',
    'catalog.category.loungewear': 'Uyda kiyinadigan',
    'catalog.category.pajamas': 'Pijamalar',
    'catalog.category.robes': 'Xalatlar',

    'product.unit.bag': 'qop',
    'product.unit.item': 'dona',
    'product.availability.manager': 'Menejer tasdiqlaydi',
    'product.availability.out_of_stock': 'Mavjud emas',
    'product.highlight.pending_confirmation': 'Menejer tasdig‘ini kutmoqda',
    'product.highlight.preorder': 'Oldindan buyurtma',
    'product.highlight.price_confirmed': 'Narx tasdiqlandi',
    'product.highlight.stock': 'Qoldiq: {count} dona',
    'product.highlight.unavailable': 'Mavjud emas',
    'product.highlight.with_manager': 'Menejer orqali',

    'product.spec.model': 'Model',
    'product.spec.gender': 'Jins',
    'product.spec.category': 'Kategoriya',
    'product.spec.order_type': 'Buyurtma formati',
    'product.spec.color': 'Rang',
    'product.spec.country': 'Mamlakat',
    'product.spec.material': 'Matoga oid',
    'product.spec.composition': 'Kompozitsiya',
    'product.spec.season': 'Mavsum',
    'product.spec.sizes': 'O‘lcham qatori',
    'product.spec.stock': 'Mavjud',
    'product.share.title': 'Model ma’lumoti',
    'product.share.model': 'Model',
    'product.share.gender': 'Jins',
    'product.share.category': 'Kategoriya',
    'product.share.price_per_item': 'Bitta dona narxi',
    'product.share.unit': 'O‘lchov',
    'product.share.size_mix': 'O‘lchamlar',
    'product.share.availability': 'Mavjudlik',
    'product.share.manager': 'Menejer',
    'product.wholesale.title': '{unit} formati',
    'product.moq': 'MOQ: kamida {quantity} {unit}',
    'product.wholesale.item_summary':
        '{unit}: {pieces} dona · {size} ta hajm bo‘yicha',
    'product.wholesale.unit_price': '{unit} narxi',

    'order.line_item.pieces': '{count} dona',
    'order.next_action.cancelled': 'Buyurtma #{number} bekor qilindi',
    'order.next_action.confirming': 'Tasdiqlanmoqda',
    'order.next_action.delivered': 'Yetkazildi',
    'order.next_action.paid': 'To‘langan',
    'order.next_action.pending': 'To‘lov kutilmoqda',
    'order.next_action.shipped': 'Yuborildi',
    'order.next_action.submitted': 'Tekshirilmoqda',
    'order.details': 'Buyurtma tafsilotlari',
    'order.details.empty_items': 'Buyurtmada mahsulotlar yo‘q',
    'order.list_empty': 'Buyurtmalar yo‘q',
    'order.status.empty': 'Buyurtmalar topilmadi',
    'order.submit_payment': 'To‘lov hujjatini yuborish',
    'order.payment_submission.title': 'To‘lovni tasdiqlash',
    'order.payment_submission.amount': 'To‘lov summasi',
    'order.payment_submission.reference': 'To‘lov raqami',
    'order.payment_submission.notes': 'Izoh',
    'order.payment_submission.submit': 'Yuborish',
    'order.payment_submission.sent': 'To‘lov ma’lumoti yuborildi',
    'order.payment_submission.failed': 'Yuborilmadi: {error}',
    'order.cart.item_added': 'Buyurtma savatga qo‘shildi',
    'order.cart.limit_reached':
        'Savdo chegarasi to‘ldi, qo‘shish muvaffaqiyatli bo‘lmadi',
    'order.activity.title': 'So‘nggi faoliyat',
    'order.delivery_carrier.cargo': 'Cargo',
    'order.progress.new': 'Yangi',
    'order.progress.confirming': 'Tasdiqlanmoqda',
    'order.progress.submitting': 'Tekshirilmoqda',
    'order.progress.delivery': 'Yetkazilmoqda',
    'order.cancel.title': 'Buyurtmani bekor qilish',
    'order.cancel.confirm': '{number} raqamli buyurtmani bekor qilasizmi?',
    'order.cancel.reason_label': 'Bekor qilish sababi',
    'order.cancel.reason_optional':
        'Sababni yozing (ixtiyoriy). Masalan: noto‘g‘ri o‘lcham.',
    'order.cancel.keep': 'Qoldirish',
    'order.cancel.success': 'Bekor qilish so‘rovi yuborildi',
    'order.cancel.failed': 'Bekor qilishda xatolik: {error}',
    'order.payment_status_label.paid': 'To‘langan',
    'order.payment_status_label.reviewing': 'Tekshirilmoqda',
    'order.size_mix.default': 'O‘lcham aralashmasi yo‘q',
    'order.tracking_summary.package_only':
        '{packages} ta buyurtma to‘plami · {pieces} dona',
    'order.tracking_summary.packages': '{summary} · jami {pieces} dona',
    'order.share.title': 'Buyurtma ma’lumoti',
    'order.share.number': 'Raqam',
    'order.share.total': 'Jami',
    'order.share.contents': 'Tarkibi',
    'order.share.status': 'Holat',
    'order.share.payment_status': 'To‘lov holati',
    'order.share.payment_reference': 'To‘lov referecensiya',
    'order.share.submitted_reference': 'Yuborilgan hujjat',
    'order.share.tracking_number': 'Traking raqam',
    'order.share.delivery': 'Yetkazib beruvchi',
    'order.share.next_step': 'Keyingi qadam',
    'order.share.payment_label': 'To‘lov turi',
    'order.share.payment_expires_at': 'To‘lov muddati',

    'payment.validation.amount.required': 'To‘lov summasini kiriting',
    'payment.validation.amount.mismatch':
        'Summada farq bor. Kutilgan summa: {expected}',
    'payment.validation.proof_required':
        'Reference yoki izohni kiriting (kamida 8 belgi)',

    'support.faq.topic.products': 'Katalog',
    'support.faq.question.products': 'Qanday mahsulotlar bor?',
    'support.faq.answer.products':
        'Asosan ayollar kiyimlari, shuningdek bolalar va erkaklar uchun xalat, pijama, tunika va uy kiyimlari ishlab chiqaramiz.',
    'support.faq.topic.minimum-order': 'Optom',
    'support.faq.question.minimum-order': 'Minimal buyurtma qancha?',
    'support.faq.answer.minimum-order':
        'Har bir model uchun katalogda ko‘rsatilgan minimal qadoq yoki qop miqdori amal qiladi. Qadoq odatda 6 ta, standart qop esa 60 ta kiyimdan iborat.',
    'support.faq.topic.bag-size': 'Optom',
    'support.faq.question.bag-size':
        '1 qop ichida o‘lchamlar qanday taqsimlanadi?',
    'support.faq.answer.bag-size':
        'Standart qop: 60 ta kiyim. Odatda 6 ta o‘lcham bo‘ladi va har bir o‘lchamdan 10 tadan joylanadi.',
    'support.faq.topic.price': 'Narx',
    'support.faq.question.price': 'Narx qanday hisoblanadi?',
    'support.faq.answer.price':
        'Kartochkada dona narxi ko‘rsatiladi. Tanlangan qadoq yoki qop narxi uning ichidagi dona soniga ko‘paytirib hisoblanadi. Aniq narx va mavjudlikni menejer tasdiqlaydi.',
    'support.faq.topic.delivery': 'Yetkazib berish',
    'support.faq.question.delivery': 'Yetkazib berish bormi?',
    'support.faq.answer.delivery':
        'Ha, buyurtma pochta yoki Cargo orqali yuboriladi. Yetkazib berish xarajatini mijoz to‘laydi va narx/vaqt Cargo bilan kelishiladi.',
    'support.faq.topic.address': 'Manzil',
    'support.faq.question.address': 'Manzilingiz qayerda?',
    'support.faq.answer.address':
        'Manzil: O‘zbekiston, Andijon, Qoratut 605-uy. Andijon aeroportidan taxminan 500 metr masofada joylashganmiz.',
    'support.faq.topic.hours': 'Ish vaqti',
    'support.faq.question.hours': 'Ish vaqtingiz qanday?',
    'support.faq.answer.hours':
        'Ish vaqti: Dushanba-Shanba, 08:00 dan 18:00 gacha.',
    'support.faq.topic.payment': 'To‘lov',
    'support.faq.question.payment': 'To‘lov qanday qilinadi?',
    'support.faq.answer.payment':
        'To‘lov usullarini menejer tushuntiradi. Buyurtma va to‘lovdan oldin +998501551010 raqami orqali tasdiqlang.',
    'support.faq.topic.defect': 'Brak',
    'support.faq.question.defect': 'Tovarda brak chiqsa nima bo‘ladi?',
    'support.faq.answer.defect':
        'Agar tovardan brak chiqsa, fabrika to‘laydi yoki boshqa tovar yuboradi. Holatni menejer bilan rasm/xabar orqali tasdiqlang.',
    'support.faq.topic.availability': 'Mavjudlik',
    'support.faq.question.availability': 'Mahsulotlar doim mavjudmi?',
    'support.faq.answer.availability':
        'Mahsulotlar limited edition, shuning uchun model mavjudligini buyurtmadan oldin aniqlashtirish kerak.',
  },
  'ru': {
    'language.name.uz': 'O‘zbek',
    'language.name.ru': 'Русский',
    'language.name.en': 'English',
    'language.title': 'Язык',
    'language.help': 'Сменить язык',

    'Milana Premium': 'Milana Premium',
    'MILANA PREMIUM': 'MILANA PREMIUM',

    'home': 'Главная',
    'catalog': 'Каталог',
    'saved': 'Избранное',
    'cart': 'Корзина',
    'support': 'Поддержка',
    'partnership': 'Партнёр',
    'account': 'Аккаунт',
    'menu': 'Меню',

    'distributor.hero.eyebrow': 'БИЗНЕС С MILANA',
    'distributor.hero.title': 'Станьте дистрибьютором Milana в своём регионе',
    'distributor.hero.subtitle':
        'Развивайте бизнес с оптовыми ценами, стабильными поставками и поддержкой нашей команды продаж.',
    'distributor.cta.apply': 'Стать дистрибьютором',
    'distributor.cta.contact_sales': 'Связаться с отделом продаж',
    'distributor.cta.request_pricing': 'Запросить оптовые цены',
    'distributor.cta.call': 'Позвонить',
    'distributor.why.title': 'Почему Milana?',
    'distributor.why.subtitle':
        'Производитель полного цикла с опытом более 25 лет.',
    'distributor.why.full_cycle': 'Собственное производство полного цикла',
    'distributor.why.supply': 'Надёжная и стабильная цепочка поставок',
    'distributor.why.export': 'Экспорт более чем в 20 стран',
    'distributor.why.private_label': 'Собственная AI-экосистема',
    'distributor.why.marketing': 'Маркетинговая поддержка дистрибьюторов',
    'distributor.why.quality': 'Контроль качества и сертификаты',
    'distributor.proof.years': 'лет опыта',
    'distributor.proof.factories': 'производственные фабрики',
    'distributor.proof.countries': 'стран экспорта',
    'distributor.requirements.title': 'Требования к партнёрам',
    'distributor.requirements.business':
        'Действующий зарегистрированный бизнес',
    'distributor.requirements.volume':
        'Согласованный минимальный объём закупки',
    'distributor.requirements.territory':
        'Определённая территория и каналы продаж',
    'distributor.requirements.brand': 'Соблюдение политики бренда и цен',
    'distributor.logistics.title': 'Доставка и экспорт',
    'distributor.logistics.uzbekistan': 'Доставка по всему Узбекистану',
    'distributor.logistics.export': 'Отправка грузов в 20+ стран',
    'distributor.logistics.documents': 'Помощь с экспортной документацией',
    'distributor.logistics.quote':
        'Индивидуальный тариф по направлению, объёму и срокам',
    'distributor.sales.title': 'Поговорите со специалистом по продажам',
    'distributor.sales.subtitle':
        'Быстро получите ответы о MOQ, ценах, территориях и доставке.',
    'distributor.whatsapp.quote':
        'Здравствуйте! Хочу узнать оптовые цены Milana и условия MOQ.',
    'distributor.whatsapp.contact':
        'Здравствуйте! Хочу обсудить дистрибьюторское партнёрство.',
    'distributor.contact.failed': 'Не удалось открыть приложение для связи.',
    'distributor.status.not_applied': 'Заявка ещё не отправлена',
    'distributor.status.not_applied_hint':
        'Заполните заявку дистрибьютора, чтобы начать партнёрство.',
    'distributor.status.title': 'Заявка {number}',
    'distributor.status.submitted': 'Заявка получена',
    'distributor.status.under_review': 'Команда продаж рассматривает заявку',
    'distributor.status.information_requested':
        'Нужна дополнительная информация',
    'distributor.status.approved': 'Партнёрство одобрено',
    'distributor.status.rejected': 'Заявка пока не одобрена',
    'distributor.status.suspended': 'Партнёрство временно приостановлено',
    'distributor.status.unknown': 'Статус обновляется',
    'distributor.application.title': 'Заявка дистрибьютора',
    'distributor.application.subtitle':
        'Оставьте данные — менеджер по продажам свяжется с вами.',
    'distributor.application.success': 'Заявка {number} успешно отправлена.',
    'distributor.application.submit': 'Отправить заявку',
    'distributor.application.failed':
        'Не удалось отправить заявку. Попробуйте ещё раз.',
    'distributor.field.contact_name': 'Контактное лицо',
    'distributor.field.company_name': 'Название компании',
    'distributor.field.phone': 'Телефон',
    'distributor.field.email': 'Email',
    'distributor.field.country': 'Страна',
    'distributor.field.city': 'Город',
    'distributor.field.consent':
        'Я согласен на использование данных для рассмотрения заявки.',
    'distributor.consent.required': 'Подтвердите согласие, чтобы продолжить.',
    'notifications.title': 'Уведомления',
    'notifications.sign_in':
        'Войдите в аккаунт, чтобы видеть персональные уведомления.',
    'notifications.inbox': 'Входящие',
    'notifications.empty': 'Новых сообщений пока нет.',
    'notifications.push.enabled': 'Push-уведомления включены',
    'notifications.push.prompt': 'Получайте важные новости сразу',
    'notifications.push.enable': 'Включить',
    'notifications.push.failed':
        'Не удалось включить push. Проверьте настройки устройства.',
    'notifications.preferences': 'Настройки уведомлений',
    'notifications.preferences_hint': 'Выберите, какие новости получать',
    'notifications.preference.orders': 'Статусы заказов',
    'notifications.preference.application': 'Статус заявки дистрибьютора',
    'notifications.preference.collections': 'Новые коллекции',
    'notifications.preference.restocks': 'Товары снова в наличии',
    'notifications.preference.offers': 'Спецпредложения и акции',
    'notifications.preference.news': 'Новости компании',
    'notifications.preferences_failed': 'Не удалось сохранить настройки.',
    'account.field.company_name': 'Название компании',
    'account.field.country': 'Страна',

    'app.bar.search.tooltip': 'Поиск',
    'app.bar.saved.tooltip': 'Избранное',
    'app.bar.cart.tooltip': 'Корзина',
    'app.bar.assistant.tooltip': 'AI помощник',
    'common.close': 'Закрыть',

    'catalog.error.title': 'Каталог не загрузился',
    'catalog.error.message':
        'Проверьте подключение к интернету и попробуйте ещё раз.',
    'catalog.error.retry': 'Повторить',

    'home.banner.title.season': 'ВЕСНА-ЛЕТО 26',
    'home.banner.top': 'TOP',
    'home.section.women': 'ОДЕЖДА ДЛЯ ЖЕНЩИН',
    'home.section.homewear': 'КОЛЛЕКЦИЯ ДЛЯ ДОМА',
    'home.section.recent': 'НЕДАВНО ПРОСМОТРЕННЫЕ',
    'home.section.all': 'ВСЕ ТОВАРЫ',
    'home.banner.set': 'КОМПЛЕКТЫ',
    'home.wholesale_ticker': 'БЫСТРЫЙ ЗАКАЗ · 1 УПАКОВКА ИЛИ 1 МЕШОК',
    'home.hero.title.empty': 'КОМФОРТ,\nТОЧНЫЙ РАЗМЕР.',
    'home.hero.title.with_product': 'КОМФОРТ\nВ ТЕЧЕНИЕ ДНЯ.',
    'home.hero.loading': 'ОБНОВЛЕНИЕ КОЛЛЕКЦИИ',
    'home.hero.tagline': 'ПРОИЗВОДСТВО ОДЕЖДЫ · УЗБЕКИСТАН',
    'home.hero.view_model': 'Посмотреть модель',
    'home.hero.support_tooltip': 'Помощь',
    'home.hero.play_tooltip': 'Возобновить слайды',
    'home.hero.pause_tooltip': 'Остановить слайды',
    'home.stat.pack_value': 'ЛИБО 1 УПАКОВКА ИЛИ 1 МЕШОК',
    'home.stat.pack_label': 'Упаковка — 6 шт., мешок — 60 шт',
    'home.stat.delivery_value': 'ПОЧТА ИЛИ CARGO',
    'home.stat.delivery_label': 'Стоимость доставки оплачивает покупатель',
    'home.stat.manager_value': 'ПОМОЩЬ МЕНЕДЖЕРА',
    'home.stat.manager_label': '{count} модель · цена и наличие подтверждаются',
    'home.category.women.subtitle': 'Халаты и пижамы',
    'home.category.men.subtitle': 'Мужская коллекция',
    'home.category.kids.subtitle': 'Детская одежда',
    'home.wholesale_band.title': 'Как работает заказ',
    'home.wholesale_band.step1.title': 'Модель и формат',
    'home.wholesale_band.step2.text':
        'Проверяются наличие, цвет и итоговая сумма.',
    'home.wholesale_band.step3.text': 'После оплаты заказ отправляется.',
    'home.wholesale_band.cta': 'Связаться с менеджером',

    'catalog.clear_filters': 'Сбросить фильтры',
    'catalog.refresh': 'Обновить',
    'catalog.loading': 'Загрузка каталога',
    'catalog.search_placeholder': 'Поиск по всем товарам…',
    'catalog.breadcrumb': 'Главная / Каталог',
    'catalog.header.subtitle':
        'Оптовый каталог для домашней и повседневной одежды.',
    'catalog.filters.quick': 'Быстрые фильтры',
    'catalog.filters.close': 'Скрыть фильтры',
    'catalog.filters.open': 'Показать фильтры',
    'catalog.filters.active': 'Фильтров выбрано ({count})',
    'catalog.badge.new': 'НОВОЕ',
    'catalog.availability.all': 'Все',
    'catalog.availability.in_stock': 'В наличии',
    'catalog.availability.preorder': 'Под заказ',
    'catalog.curation.all': 'Все',
    'catalog.curation.new_arrival': 'Новинки',
    'catalog.curation.bestseller': 'Бестселлеры',
    'catalog.curation.sale': 'Скидка',
    'catalog.price_band.all': 'Все',
    'catalog.price_band.under5': 'До 5',
    'catalog.price_band.from5_to7': '5–7',
    'catalog.price_band.over7': 'Свыше 7',
    'catalog.size.all': 'Все',
    'catalog.sort': 'Сортировать',
    'catalog.sort.all': 'Все',
    'catalog.sort.pajamas': 'Пижамы',
    'catalog.sort.robes': 'Халаты',
    'catalog.sort.women': 'Женщины',
    'catalog.sort.men': 'Мужчины',
    'catalog.sort.kids': 'Дети',
    'catalog.sort.featured': 'Рекомендуемое',
    'catalog.sort.price_low': 'Сначала дешевле',
    'catalog.sort.price_high': 'Сначала дороже',
    'catalog.sort.name': 'По названию',
    'catalog.saved_count': 'Сохраненные: {count}',
    'catalog.models_count': '{count} модель',
    'catalog.models_count_ratio': '{visible} / {total} модель',
    'catalog.add': 'Добавить',
    'catalog.demo_enabled_note':
        'Вы находитесь в демо-режиме: можете просмотреть товары и проверить процесс заказа без оформления реального платежа.',
    'catalog.add_to_cart_count': 'Добавить {count} {unit} в корзину',
    'catalog.add.limit_exceeded':
        'Невозможно добавить {product}. Превышен лимит {limit} {unit}. Сейчас: {current} {unit}.',
    'catalog.empty.saved.title': 'Нет сохраненных моделей',
    'catalog.empty.saved.message': 'Сохраняйте модели, нажимая ♡ на карточке.',
    'catalog.empty.search.title': 'Ничего не найдено',
    'catalog.empty.search.message':
        'Измените поиск или сбросьте фильтры и попробуйте снова.',
    'catalog.load_more': 'Показать еще · {visible}/{total}',
    'catalog.cache.title': 'Данные из кэша: {timestamp}',
    'catalog.cache.timestamp': 'Обновлено: {time}',
    'catalog.cache.empty': 'Время последнего обновления не указано',

    'product.sheet.view_all': 'ПОКАЗАТЬ МОДЕЛИ · {count}',
    'product.highlight.pack':
        'Упаковывайте по коробке или мешку. Менеджер окончательно подтверждает цену, остаток и отправку.',
    'product.highlight.bag_select':
        'Выберите количество в упаковке/мешке и добавьте в корзину.',
    'product.highlight.manager': 'Подтверждение менеджера',
    'product.highlight.payment': 'Оплата и доставка',
    'product.highlight.delivery_cost':
        'Стоимость доставки оплачивает покупатель.',
    'product.tag.new': 'НОВОЕ',
    'product.tag.bestseller': 'ХИТ',
    'product.tag.sale': 'АКЦИЯ',

    'product.card.price_unit': 'шт.',
    'product.card.open_details': 'Открыть детали',
    'product.card.saved_add': 'Сохранить',
    'product.card.saved_remove': 'Убрать из сохраненных',
    'product.image.label': '{product} изображение',

    'auth.sign_in': 'Войти',
    'auth.sign_up': 'Создать аккаунт',
    'auth.has_account': 'У меня уже есть аккаунт',
    'auth.create_account': 'Новый аккаунт',
    'auth.forgot_password': 'Забыли пароль?',
    'auth.google': 'Войти через Google',
    'auth.apple': 'Войти через Apple',
    'auth.or': 'ИЛИ',
    'auth.privacy_checkbox':
        'Согласен с политикой конфиденциальности и правилами использования',
    'auth.privacy_policy': 'Политика конфиденциальности',
    'auth.terms': 'Условия использования',
    'auth.email': 'Email',
    'auth.password': 'Пароль',

    'validation.email.required': 'Введите email',
    'validation.email.invalid': 'Неверный email',
    'validation.password.required': 'Введите пароль',
    'validation.password.short': 'Не менее 8 символов',
    'validation.name.required': 'Введите имя',
    'form.required': 'Обязательно',
    'validation.required': 'Введите {label}',
    'validation.phone.required': 'Введите телефон',
    'validation.phone.invalid': 'Проверьте телефон',
    'validation.long': '{label} слишком длинное',
    'auth.error.default': 'Не удалось связаться с сервисом. Попробуйте позже.',
    'auth.error.auth_backend': 'Сервис аккаунта временно недоступен.',
    'auth.error.wrong_credentials': 'Неверный email или пароль.',
    'auth.error.email_exists': 'Аккаунт с этим email уже существует.',
    'auth.error.google_cancelled': 'Вход через Google отменен.',
    'auth.error.google_failed':
        'Не удалось войти через Google. Попробуйте позже.',
    'auth.error.google_client_id':
        'OAuth Google не настроен. Обратитесь к администратору.',
    'auth.error.apple_cancelled': 'Вход через Apple отменен.',
    'auth.error.apple_failed':
        'Не удалось войти через Apple. Попробуйте позже.',
    'auth.error.weak_password': 'Слишком простой пароль.',
    'auth.error.recent_login':
        'В целях безопасности войдите заново и повторите действие.',
    'auth.error.unauthenticated': 'Войдите в аккаунт заново.',

    'order.status.new': 'новый',
    'order.status.confirmed': 'подтверждено',
    'order.status.packed': 'готовится',
    'order.status.shipped': 'отправлен',
    'order.status.delivered': 'доставлен',
    'order.status.failed': 'неуспешно',
    'order.status.cancelled': 'отменен',
    'order.status.pending': 'ожидает',
    'order.status.submitted': 'на проверке',
    'order.status.waiting': 'ожидает клиента',
    'order.status.refunded': 'возвращен',

    'order.payment.paid': 'оплачено',
    'order.payment.submitted': 'на проверке',
    'order.payment.waiting': 'ожидает клиента',
    'order.payment.failed': 'неуспешно',
    'order.payment.pending': 'ожидание',
    'order.payment.cancelled': 'отменено',
    'order.payment.refunded': 'возвращен',

    'checkout.payment_manager': 'Менеджер',
    'checkout.payment_bank': 'Банковский перевод',
    'checkout.payment_click': 'Click',
    'checkout.payment_payme': 'Payme',
    'checkout.payment_card': 'Карта',
    'checkout.payment_cash': 'Наличными / по договоренности',
    'checkout.instructions.bank':
        'Реквизиты для банк перевода присылает менеджер. Подтвердите перед оплатой по телефону {phone}.',
    'checkout.instructions.click':
        'Счет по Click присылает менеджер. Подтвердите перед оплатой по телефону {phone}.',
    'checkout.instructions.payme':
        'Счет по Payme присылает менеджер. Подтвердите перед оплатой по телефону {phone}.',
    'checkout.instructions.card':
        'Номер карты присылает менеджер. Подтвердите перед оплатой по телефону {phone}.',
    'checkout.instructions.cash':
        'Наличный расчет зависит от условий доставки/самовывоза. Согласовать с менеджером: {phone}.',
    'checkout.instructions.default':
        'Менеджер подтверждает цену, остатки и оплату по номеру {phone}.',
    'checkout.copy_payment_label': 'Подтверждает менеджер',

    'product.pack.label': 'Упаковка',
    'product.bag.label': 'Мешок',
    'product.pack.label.en': 'Pack',
    'product.bag.label.en': 'Bag',

    'product.unit': '{count} шт.',
    'product.size_per': 'по {count} шт.',
    'product.sheet.recommended_models': 'РЕКОМЕНДУЕМЫЕ МОДЕЛИ',
    'product.gallery.previous': 'Предыдущее фото',
    'product.gallery.next': 'Следующее фото',
    'product.premium': 'Премиум',
    'product.order_type.prompt': 'Выберите формат заказа',
    'product.copy.info': 'Скопировать детали модели',
    'product.copy.info_done': 'Детали модели скопированы',
    'product.add_to_cart': 'Добавить в корзину · {amount}',
    'product.related.title': 'Похожие модели',
    'product.variants.title': 'Варианты этой модели',
    'product.care.title': 'Рекомендации по уходу',
    'product.measurements.title': 'Замеры изделия',
    'product.related.badge': 'Рекомендуется',
    'quantity.decrease': 'Уменьшить',
    'quantity.increase': 'Увеличить',

    'assistant.placeholder':
        'Вы можете задать вопросы по модели, цене, мешкам и доставке.',
    'assistant.title': 'AI-помощник',
    'assistant.subtitle':
        'Нужна помощь с моделью, ценой, наличием или доставкой.',
    'assistant.input_hint': 'Введите ваш вопрос…',
    'assistant.send': 'Отправить',
    'assistant.quick.bag': 'Упаковка и мешок',
    'assistant.quick.delivery': 'Доставка',
    'assistant.quick.partnership': 'Дистрибьюторство',
    'assistant.quick.sales': 'Менеджер продаж',
    'assistant.quick.mens_model': 'Мужская модель',
    'assistant.quick.bag_prompt': 'Сравните форматы упаковки и мешка',
    'assistant.quick.delivery_prompt': 'Каковы сроки и стоимость доставки?',
    'assistant.quick.partnership_prompt':
        'Объясните требования к дистрибьюторам, MOQ и условия партнёрства',
    'assistant.quick.mens_model_prompt':
        'Покажите популярные модели для мужчин',
    'assistant.failure':
        'AI недоступен сейчас. Напишите менеджеру или попробуйте еще раз.',
    'assistant.report.action': 'Пожаловаться на ответ',
    'assistant.report.title': 'Пожаловаться на ответ ИИ',
    'assistant.report.description':
        'Сообщите нам об опасном, оскорбительном или неверном ответе.',
    'assistant.report.reason': 'Причина',
    'assistant.report.reason.offensive_or_unsafe': 'Оскорбительный или опасный',
    'assistant.report.reason.inaccurate_or_misleading':
        'Неверный или вводящий в заблуждение',
    'assistant.report.reason.other': 'Другая причина',
    'assistant.report.comment': 'Дополнительный комментарий (необязательно)',
    'assistant.report.submit': 'Отправить жалобу',
    'assistant.report.success': 'Жалоба отправлена. Спасибо.',
    'assistant.report.failed':
        'Не удалось отправить жалобу. Повторите попытку.',

    'cart.empty.title': 'Корзина пуста',
    'cart.empty.message': 'Перейдите в каталог и добавьте упаковку или мешок.',
    'cart.added': 'Добавлено в корзину',
    'cart.item_unavailable': '{product} пока недоступен',
    'cart.message.unavailable': 'Пока недоступно',
    'cart.toast.added': '{product} · {count} {unit} добавлено в корзину',
    'action.clear': 'Очистить',
    'action.continue': 'Продолжить',
    'action.copy': 'Копировать',
    'cart.loading': 'Загрузка',
    'cart.submit.action': 'Отправить заказ',
    'cart.empty.open_catalog': 'Перейти в каталог',
    'cart.account_service.unavailable.title': 'Сервис аккаунта недоступен',
    'cart.account_service.unavailable.message':
        'Сейчас сервис аккаунта недоступен. Повторите попытку позже.',
    'cart.manager.list_error': 'Не удалось загрузить список менеджеров',
    'cart.manager.unavailable': 'Менеджеры отсутствуют',
    'cart.submit.failed': 'Не удалось отправить заказ: {error}',
    'cart.submit.failed_safe':
        'Не удалось отправить заказ. Повторите попытку или свяжитесь с нами: +998 50 155 10 10.',
    'cart.submit.note':
        'Проверьте все поля и выберите способ оплаты перед отправкой.',
    'cart.submit.receipt_save_failed': 'Не удалось сохранить подтверждение',
    'cart.receipt.title': 'Заказ принят',
    'cart.receipt.reference_active': 'Реквизиты еще активны',
    'cart.receipt.reference_expires': 'Срок действия референса: {datetime}',
    'cart.receipt.copy_action': 'Копировать детали заказа',
    'cart.receipt.clear_failed': 'Не удалось очистить заказ',
    'cart.field.name': 'Имя',
    'cart.field.phone': 'Телефон',
    'cart.field.city': 'Город',
    'cart.field.address': 'Адрес',
    'cart.field.country_prompt': 'Выберите страну',
    'cart.field.country_required': 'Выберите страну',
    'cart.country.uzbekistan': 'Узбекистан',
    'cart.country.other': 'Другая страна',
    'cart.manager.choose_country': 'Сначала выберите страну',
    'cart.field.manager': 'Менеджер',
    'cart.field.manager_prompt': 'Выберите менеджера',
    'cart.field.manager_required': 'Выберите менеджера',
    'cart.field.payment_method': 'Способ оплаты',
    'cart.field.comment': 'Комментарий',
    'cart.line.unit_price': 'Цена за 1 {unit}: {price}, сумма: {package_price}',
    'cart.item.removed': 'Удалено: {product}',
    'cart.action.undo': 'Отменить',
    'cart.action.delete': 'Удалить',
    'cart.item.summary': '{quantity} {unit} · {pieces} шт',
    'cart.summary.title': 'Итог заказа',
    'cart.summary.stats':
        '{models} моделей · {packages} упаковок · {pieces} шт · {packs} пакетов · {bags} мешков',
    'cart.total.label': 'Итого',
    'cart.total.note': 'Итоговый расчет: {packages} упаковки, {pieces} шт.',
    'cart.commerce.email_verification_hint':
        'Для синхронизации требуется подтвержденный email.',
    'cart.commerce.notice.verify_title': 'Подтверждение email',
    'cart.commerce.notice.verify_message':
        'Подтвердите email, чтобы продолжить заказ.',
    'cart.commerce.notice.verify_button': 'Подтвердить email',
    'cart.commerce.notice.sync_title': 'Синхронизация аккаунта',
    'cart.commerce.notice.sync_message': 'Не удалось синхронизировать аккаунт.',
    'cart.commerce.notice.sync_button': 'Попробовать снова',
    'cart.privacy.open_failed':
        'Не удалось открыть политику конфиденциальности',

    'support.title': 'Поддержка клиентов',
    'support.help_hint':
        'Задайте вопрос по цене, наличию, доставке, оплате или браку.',
    'support.action.send': 'Отправить',
    'support.field.name': 'Имя',
    'support.field.phone': 'Телефон',
    'support.field.email': 'Email',
    'support.field.topic': 'Тема',
    'support.field.message': 'Ваш вопрос',
    'support.validation.message': 'Введите не менее 8 символов',
    'support.topic.general': 'Общее',
    'support.quick.title': 'Частые вопросы',
    'support.quick.search_hint': 'Найти в FAQ',
    'support.quick.empty': 'По вашему запросу ничего не найдено',
    'support.ticket.created': 'Запрос отправлен: {number}',
    'support.ticket.failed': 'Ошибка отправки: {error}',
    'support.ticket.empty': 'Пока обращений нет',
    'support.ticket.reload': 'Обновить список',
    'support.ticket.manager_reply': 'Ответ менеджера',
    'support.ticket.status.open': 'Открыто',
    'support.ticket.status.waiting_for_customer': 'Ожидает ответа клиента',
    'support.ticket.status.resolved': 'Решено',
    'support.ticket.status.closed': 'Закрыто',
    'support.ticket.status.new': 'Новое',

    'account.title': 'Мой аккаунт',
    'account.metric.saved': 'сохранено',
    'account.metric.account': 'оптовый аккаунт',
    'account.metric.profile': 'профиль заполнен',
    'account.action.edit_profile': 'Профиль',
    'account.action.sign_out': 'Выйти',
    'account.action.delete': 'Удалить аккаунт',
    'account.security.title': 'Аккаунт и безопасность',
    'account.security.subtitle': 'Конфиденциальные и важные настройки',
    'account.security.delete_description':
        'Удаление аккаунта необратимо. Используйте этот раздел только если хотите окончательно закрыть аккаунт.',
    'account.section.orders': 'Мои заказы',
    'account.section.tickets': 'Мои обращения',
    'account.commerce.state_connected_title': 'Торговый аккаунт подключен',
    'account.commerce.state_connected_message':
        'Торговый аккаунт успешно синхронизирован.',
    'account.commerce.state_verify_title': 'Подтвердите email',
    'account.commerce.state_verify_message':
        'Подтвердите email, чтобы активировать торговый аккаунт.',
    'account.commerce.state_syncing_title': 'Синхронизация аккаунта',
    'account.commerce.state_syncing_message':
        'Выполняется синхронизация торгового аккаунта.',
    'account.commerce.state_retry_title': 'Проблема с аккомтном',
    'account.commerce.state_retry_message':
        'Попробуйте повторно подключить торговый аккаунт.',
    'account.commerce.resend_verification': 'Отправить письмо проверки',
    'account.commerce.resent_success': 'Письмо проверки отправлено',
    'account.signup_success_with_verification':
        'Аккаунт создан. Проверьте почту для активации.',
    'account.delete_warning':
        'Удаление аккаунта удалит заказы и сохраненные данные. Действие необратимо.',
    'account.edit_profile_error': 'Ошибка обновления профиля: {error}',
    'account.empty': 'Ничего не найдено',
    'account.loading_failed':
        'Часть данных аккаунта не обновилась. Попробуйте снова.',
    'account.overview.title': 'Обзор аккаунта',
    'account.overview.last_order': 'Последний заказ: {latest}',
    'account.overview.no_activity': 'Нет активности',
    'account.overview.none': 'Нет данных об активности',
    'account.overview.active_packages_label': 'Активные пакеты',
    'account.overview.active_pieces': '{count} штук',
    'account.overview.confirmed_payment_label': 'Подтвержденная оплата',
    'account.overview.pending_payment_orders':
        'Ожидают оплаты: {count} заказов',
    'account.overview.total_orders_label': 'Всего заказов',
    'account.overview.total_packages': '{count} пакетов',
    'account.overview.open_tickets_label': 'Открытые обращения',
    'account.overview.ticket_waiting': 'Ожидает ответа',

    'order.title': 'Детали заказа',

    'legal.title': 'Юридическая информация',
    'legal.link.privacy': 'Конфиденциальность',
    'analytics.consent.title': 'Помогите улучшить приложение',
    'analytics.consent.body':
        'Разрешить необязательную аналитику использования. Это можно отключить в любое время.',
    'legal.link.terms': 'Условия',
    'legal.link.delete': 'Удаление аккаунта',
    'legal.link.support': 'Помощь',
    'legal.body':
        'Как используются ваши данные, условия использования и порядок удаления аккаунта.',

    'copy.toast.reference': 'Номер перевода скопирован',
    'copy.toast.order': 'Детали заказа скопированы',
    'copy.toast.phone': 'Телефон скопирован',
    'copy.toast.manager': 'Номер менеджера скопирован',

    'bootstrap.title': 'Milana Premium временно недоступен',
    'bootstrap.message':
        'Проверьте интернет и перезапустите приложение. Если проблема сохраняется, позвоните +998 50 155 10 10',
    'bootstrap.retry_hint': 'Повторная попытка через некоторое время.',

    'delete.title': 'Удаление аккаунта',
    'delete.cancel': 'Отмена',
    'delete.confirm_instruction': 'Введите DELETE для подтверждения',
    'delete.reason_label': 'Почему вы хотите удалить аккаунт?',
    'delete.reason_help':
        'Причина сохраняется анонимно и используется для улучшения сервиса. Не указывайте личные данные.',
    'delete.reason_detail': 'Дополнительный комментарий (необязательно)',
    'delete.reason_detail_help':
        'При выборе «Другая причина» добавьте короткий комментарий.',
    'delete.reason_invalid': 'Выберите причину удаления аккаунта.',
    'delete.reason.no_longer_needed': 'Больше не пользуюсь приложением',
    'delete.reason.missing_features': 'Не хватает нужных функций',
    'delete.reason.difficult_to_use': 'Приложением сложно пользоваться',
    'delete.reason.technical_problems': 'Возникают технические проблемы',
    'delete.reason.privacy_concerns': 'Есть опасения о конфиденциальности',
    'delete.reason.created_by_mistake': 'Аккаунт создан по ошибке',
    'delete.reason.prefer_not_to_say': 'Предпочитаю не отвечать',
    'delete.reason.other': 'Другая причина',
    'delete.button': 'Полное удаление',
    'delete.rules': 'Просмотреть правила удаления',
    'delete.support': 'Связаться с поддержкой',
    'delete.success': 'Аккаунт удален.',

    'password_reset.title': 'Сброс пароля',
    'password_reset.button': 'Отправить',
    'password_reset.sent': 'Письмо для восстановления отправлено.',
    'password_reset.cancel': 'Отмена',
    'password_reset.error': 'Ошибка отправки: {error}',
    'password_reset.success': 'Письмо для восстановления отправлено.',
    'assistant.fallback':
        'Сейчас не могу ответить. Напишите менеджеру или повторите запрос позже.',

    'catalog.gender.all': 'Все',
    'catalog.gender.men': 'Мужчины',
    'catalog.gender.kids': 'Дети',
    'catalog.gender.women': 'Женщины',
    'catalog.category.default': 'Все категории',
    'catalog.category.family': 'Для семьи',
    'catalog.category.homewear': 'Домашняя одежда',
    'catalog.category.loungewear': 'Домашняя',
    'catalog.category.pajamas': 'Пижамы',
    'catalog.category.robes': 'Халаты',

    'product.unit.bag': 'Мешок',
    'product.unit.item': 'шт',
    'product.availability.manager': 'Подтверждает менеджер',
    'product.availability.out_of_stock': 'Нет в наличии',
    'product.highlight.pending_confirmation': 'Ожидает подтверждения',
    'product.highlight.preorder': 'Под заказ',
    'product.highlight.price_confirmed': 'Цена подтверждена',
    'product.highlight.stock': 'Остаток: {count}',
    'product.highlight.unavailable': 'Недоступно',
    'product.highlight.with_manager': 'По согласованию с менеджером',

    'product.spec.model': 'Модель',
    'product.spec.gender': 'Пол',
    'product.spec.category': 'Категория',
    'product.spec.order_type': 'Формат заказа',
    'product.spec.color': 'Цвет',
    'product.spec.country': 'Страна',
    'product.spec.material': 'Материал',
    'product.spec.composition': 'Состав',
    'product.spec.season': 'Сезон',
    'product.spec.sizes': 'Размерный ряд',
    'product.spec.stock': 'Остаток',
    'product.share.title': 'Данные модели',
    'product.share.model': 'Модель',
    'product.share.gender': 'Пол',
    'product.share.category': 'Категория',
    'product.share.price_per_item': 'Цена за штуку',
    'product.share.unit': 'Ед.изм.',
    'product.share.size_mix': 'Размеры',
    'product.share.availability': 'Наличие',
    'product.share.manager': 'Менеджер',
    'product.wholesale.title': 'Формат {unit}',
    'product.moq': 'MOQ: минимум {quantity} {unit}',
    'product.wholesale.item_summary':
        '{unit}: {pieces} шт. · {size} шт. на размер',
    'product.wholesale.unit_price': 'Цена за {unit}',

    'order.line_item.pieces': '{count} шт.',
    'order.next_action.cancelled': 'Заказ #{number} отменен',
    'order.next_action.confirming': 'Ожидает подтверждения',
    'order.next_action.delivered': 'Доставлен',
    'order.next_action.paid': 'Оплачен',
    'order.next_action.pending': 'Ожидает оплаты',
    'order.next_action.shipped': 'Отправлен',
    'order.next_action.submitted': 'На проверке',
    'order.size_mix.default': 'Размерная сетка не выбрана',
    'order.tracking_summary.package_only':
        '{packages} пакет(ов) · {pieces} шт.',
    'order.tracking_summary.packages': '{summary} · {pieces} шт',
    'order.share.title': 'Детали заказа',
    'order.share.number': 'Номер',
    'order.share.total': 'Итого',
    'order.share.contents': 'Состав',
    'order.share.status': 'Статус',
    'order.share.payment_status': 'Статус оплаты',
    'order.share.payment_reference': 'Референс оплаты',
    'order.share.submitted_reference': 'Референс отправки',
    'order.share.tracking_number': 'Номер отслеживания',
    'order.share.delivery': 'Доставка',
    'order.share.next_step': 'Следующий шаг',
    'order.share.payment_label': 'Способ оплаты',
    'order.share.payment_expires_at': 'Срок оплаты',

    'payment.validation.amount.required': 'Введите сумму оплаты',
    'payment.validation.amount.mismatch':
        'Сумма не совпадает. Ожидается: {expected}',
    'payment.validation.proof_required':
        'Добавьте ссылку или комментарий к оплате',

    'support.faq.topic.products': 'Каталог',
    'support.faq.question.products': 'Какие есть категории товаров?',
    'support.faq.answer.products':
        'Производим одежду для женщин, а также халаты, пижамы, туники и домашнюю одежду для мужчин и детей.',
    'support.faq.topic.minimum-order': 'Опт',
    'support.faq.question.minimum-order': 'Какой минимальный заказ?',
    'support.faq.answer.minimum-order':
        'Для каждой модели действует минимальный объем qоп/упаковки, указанный в каталоге. Обычно это 6 шт. в упаковке и 60 шт. в мешке.',
    'support.faq.topic.bag-size': 'Опт',
    'support.faq.question.bag-size':
        'Как распределяются размеры в одном мешке?',
    'support.faq.answer.bag-size':
        'Стандартный мешок: 60 шт. Обычно 6 размеров, по 10 штук каждого.',
    'support.faq.topic.price': 'Цена',
    'support.faq.question.price': 'Как формируется цена?',
    'support.faq.answer.price':
        'Цена за штуку указана в карточке. Стоимость упаковки или мешка считается умножением на количество штук. Точный прайс и наличие подтверждает менеджер.',
    'support.faq.topic.delivery': 'Доставка',
    'support.faq.question.delivery': 'Есть ли доставка?',
    'support.faq.answer.delivery':
        'Да, отправка возможна через почту или cargo. Стоимость доставки и сроки согласуются отдельно и оплачиваются клиентом.',
    'support.faq.topic.address': 'Адрес',
    'support.faq.question.address': 'Где вы находитесь?',
    'support.faq.answer.address':
        'Адрес: Узбекистан, Андижан, улица Каратута 605. Мы находимся примерно в 500 м от Андийжонского аэропорта.',
    'support.faq.topic.hours': 'Режим работы',
    'support.faq.question.hours': 'Какой у вас график работы?',
    'support.faq.answer.hours':
        'Пн–Сб: 08:00–18:00. Поддержка и менеджеры доступны в это время.',
    'support.faq.topic.payment': 'Оплата',
    'support.faq.question.payment': 'Как оплачивать заказ?',
    'support.faq.answer.payment':
        'Способы оплаты объясняет менеджер. Подтвердите детали покупки заранее по номеру +998501551010.',
    'support.faq.topic.defect': 'Брак',
    'support.faq.question.defect': 'Что если товар с браком?',
    'support.faq.answer.defect':
        'Если обнаружен брак, фабрика оплачивает возврат/замену. Подтвердите дефект с менеджером по фото или сообщению.',
    'support.faq.topic.availability': 'Наличие',
    'support.faq.question.availability': 'В наличии всё время?',
    'support.faq.answer.availability':
        'Товары ограниченного тиража, поэтому лучше уточнить наличие перед заказом.',
  },
  'en': {
    'language.name.uz': 'O‘zbek',
    'language.name.ru': 'Русский',
    'language.name.en': 'English',
    'language.title': 'Language',
    'language.help': 'Change language',

    'home': 'Home',
    'catalog': 'Catalog',
    'saved': 'Saved',
    'cart': 'Cart',
    'support': 'Support',
    'partnership': 'Partner',
    'account': 'Account',
    'menu': 'Menu',

    'distributor.hero.eyebrow': 'BUILD WITH MILANA',
    'distributor.hero.title': 'Become a Milana distributor in your market',
    'distributor.hero.subtitle':
        'Grow with wholesale pricing, dependable supply, and direct support from our sales team.',
    'distributor.cta.apply': 'Become a distributor',
    'distributor.cta.contact_sales': 'Contact sales',
    'distributor.cta.request_pricing': 'Request wholesale pricing',
    'distributor.cta.call': 'Call sales',
    'distributor.why.title': 'Why Milana?',
    'distributor.why.subtitle':
        'A full-cycle manufacturer with more than 25 years of experience.',
    'distributor.why.full_cycle': 'Owned, full-cycle manufacturing',
    'distributor.why.supply': 'Reliable and consistent supply chain',
    'distributor.why.export': 'Exports to more than 20 countries',
    'distributor.why.private_label': 'Own AI ecosystem',
    'distributor.why.marketing': 'Marketing support for distributors',
    'distributor.why.quality': 'Quality control and certification',
    'distributor.proof.years': 'years of experience',
    'distributor.proof.factories': 'production factories',
    'distributor.proof.countries': 'export countries',
    'distributor.requirements.title': 'Partnership requirements',
    'distributor.requirements.business': 'An active, registered sales business',
    'distributor.requirements.volume': 'An agreed minimum purchase volume',
    'distributor.requirements.territory':
        'Defined sales territory and channels',
    'distributor.requirements.brand':
        'Compliance with brand and pricing policy',
    'distributor.logistics.title': 'Delivery and export',
    'distributor.logistics.uzbekistan': 'Delivery throughout Uzbekistan',
    'distributor.logistics.export': 'Cargo options to more than 20 countries',
    'distributor.logistics.documents': 'Export documentation assistance',
    'distributor.logistics.quote':
        'Destination, volume, and lead-time based shipping quote',
    'distributor.sales.title': 'Talk to a sales specialist',
    'distributor.sales.subtitle':
        'Get quick answers about MOQ, pricing, territories, and delivery.',
    'distributor.whatsapp.quote':
        'Hello, I would like Milana wholesale pricing and MOQ information.',
    'distributor.whatsapp.contact':
        'Hello, I would like to discuss a distributor partnership.',
    'distributor.contact.failed': 'Could not open the communication app.',
    'distributor.status.not_applied': 'No application submitted yet',
    'distributor.status.not_applied_hint':
        'Complete the distributor application to start a partnership.',
    'distributor.status.title': 'Application {number}',
    'distributor.status.submitted': 'Application received',
    'distributor.status.under_review': 'Our sales team is reviewing it',
    'distributor.status.information_requested': 'More information is required',
    'distributor.status.approved': 'Partnership approved',
    'distributor.status.rejected': 'Application not approved at this time',
    'distributor.status.suspended': 'Partnership temporarily suspended',
    'distributor.status.unknown': 'Status is being updated',
    'distributor.application.title': 'Distributor application',
    'distributor.application.subtitle':
        'Share your details and a sales manager will contact you.',
    'distributor.application.success': 'Application {number} was submitted.',
    'distributor.application.submit': 'Submit application',
    'distributor.application.failed':
        'Could not submit the application. Please try again.',
    'distributor.field.contact_name': 'Contact name',
    'distributor.field.company_name': 'Company name',
    'distributor.field.phone': 'Phone',
    'distributor.field.email': 'Email',
    'distributor.field.country': 'Country',
    'distributor.field.city': 'City',
    'distributor.field.consent':
        'I agree to the use of my data to review this application.',
    'distributor.consent.required': 'Consent is required to continue.',
    'notifications.title': 'Notifications',
    'notifications.sign_in': 'Sign in to see personal notifications.',
    'notifications.inbox': 'Inbox',
    'notifications.empty': 'No new messages yet.',
    'notifications.push.enabled': 'Push notifications are enabled',
    'notifications.push.prompt': 'Receive important updates immediately',
    'notifications.push.enable': 'Enable',
    'notifications.push.failed':
        'Push could not be enabled. Check your device settings.',
    'notifications.preferences': 'Notification preferences',
    'notifications.preferences_hint': 'Choose which updates you receive',
    'notifications.preference.orders': 'Order status updates',
    'notifications.preference.application': 'Distributor application status',
    'notifications.preference.collections': 'New collections',
    'notifications.preference.restocks': 'Product restocks',
    'notifications.preference.offers': 'Special offers and promotions',
    'notifications.preference.news': 'Company news',
    'notifications.preferences_failed': 'Could not save notification settings.',
    'account.field.company_name': 'Company name',
    'account.field.country': 'Country',

    'catalog.error.title': 'Catalog failed to load',
    'catalog.error.message': 'Check your connection and try again.',
    'catalog.error.retry': 'Try again',
    'catalog.sort': 'Sort',
    'catalog.sort.all': 'All',

    'auth.sign_in': 'Sign in',
    'auth.sign_up': 'Create account',
    'auth.has_account': 'I already have an account',
    'auth.forgot_password': 'Forgot password?',
    'auth.google': 'Sign in with Google',
    'auth.apple': 'Sign in with Apple',
    'auth.or': 'OR',
    'auth.email': 'Email',

    'validation.email.required': 'Enter email',
    'validation.email.invalid': 'Invalid email',
    'validation.password.required': 'Enter password',
    'validation.password.short': 'At least 8 characters',
    'validation.phone.required': 'Enter phone',
    'validation.phone.invalid': 'Check phone number',
    'validation.required': 'Enter {label}',
    'validation.long': '{label} is too long',
    'form.required': 'Required',

    'order.status.new': 'new',
    'order.status.confirmed': 'confirmed',
    'order.status.packed': 'processing',
    'order.status.shipped': 'shipped',
    'order.status.delivered': 'delivered',
    'order.status.failed': 'failed',
    'order.status.cancelled': 'cancelled',
    'order.status.pending': 'pending',
    'order.status.submitted': 'submitted',
    'order.status.waiting': 'waiting',
    'order.status.refunded': 'refunded',

    'order.payment.paid': 'paid',
    'order.payment.submitted': 'submitted',
    'order.payment.waiting': 'waiting',
    'order.payment.failed': 'failed',
    'order.payment.pending': 'pending',
    'order.payment.cancelled': 'cancelled',
    'order.payment.refunded': 'refunded',

    'product.pack.label': 'Pack',
    'product.bag.label': 'Bag',

    'assistant.failure':
        'AI is unavailable now. Send a message to the manager or try again soon.',
    'assistant.placeholder':
        'Ask about model, price, packing or delivery and get quick answers.',
    'assistant.title': 'AI assistant',
    'assistant.subtitle': 'Need help with model, price, stock, or shipping?',
    'assistant.input_hint': 'Type your question...',
    'assistant.send': 'Send',
    'assistant.quick.bag': 'Pack or bag',
    'assistant.quick.delivery': 'Delivery',
    'assistant.quick.partnership': 'Distribution',
    'assistant.quick.sales': 'Sales manager',
    'assistant.quick.mens_model': 'Men\'s model',
    'assistant.quick.bag_prompt': 'Compare pack and bag order formats',
    'assistant.quick.delivery_prompt': 'Check shipping cost and delivery time',
    'assistant.quick.partnership_prompt':
        'Explain distributor requirements, MOQ, and partnership terms',
    'assistant.quick.mens_model_prompt': 'Show popular men\'s models',
    'assistant.report.action': 'Report response',
    'assistant.report.title': 'Report AI response',
    'assistant.report.description':
        'Tell us about an unsafe, offensive, inaccurate, or misleading response.',
    'assistant.report.reason': 'Reason',
    'assistant.report.reason.offensive_or_unsafe': 'Offensive or unsafe',
    'assistant.report.reason.inaccurate_or_misleading':
        'Inaccurate or misleading',
    'assistant.report.reason.other': 'Other',
    'assistant.report.comment': 'Additional comment (optional)',
    'assistant.report.submit': 'Submit report',
    'assistant.report.success': 'Report submitted. Thank you.',
    'assistant.report.failed': 'Could not submit the report. Try again.',

    'cart.empty.title': 'Cart is empty',
    'cart.empty.message': 'Go to catalog and add pack or bag options first.',
    'cart.added': 'Added to cart',
    'cart.item_unavailable': '{product} is currently unavailable',
    'action.continue': 'Continue',
    'cart.loading': 'Loading',
    'cart.submit.action': 'Submit order',
    'cart.empty.open_catalog': 'Go to catalog',
    'cart.account_service.unavailable.title': 'Account service unavailable',
    'cart.account_service.unavailable.message':
        'Account service is currently unavailable. Please try again later.',
    'cart.manager.list_error': 'Could not load manager list',
    'cart.manager.unavailable': 'No manager found',
    'cart.submit.failed': 'Unable to submit order: {error}',
    'cart.submit.failed_safe':
        'Could not submit the order. Try again or contact us at +998 50 155 10 10.',
    'cart.submit.note':
        'Please complete all fields and choose a payment method before submitting.',
    'cart.submit.receipt_save_failed': 'Unable to save order confirmation',
    'cart.receipt.title': 'Order confirmed',
    'cart.receipt.copy_action': 'Copy order details',
    'cart.receipt.clear_failed': 'Unable to clear order',
    'cart.field.name': 'Name',
    'cart.field.phone': 'Phone',
    'cart.field.city': 'City',
    'cart.field.address': 'Address',
    'cart.field.country_prompt': 'Choose a country',
    'cart.field.country_required': 'Country is required',
    'cart.country.uzbekistan': 'Uzbekistan',
    'cart.country.other': 'Other country',
    'cart.manager.choose_country': 'Choose a country first',
    'cart.field.manager': 'Manager',
    'cart.field.manager_prompt': 'Choose a manager',
    'cart.field.manager_required': 'Manager is required',
    'cart.field.payment_method': 'Payment method',
    'cart.field.comment': 'Comment',
    'cart.action.undo': 'Undo',
    'cart.action.delete': 'Delete',
    'cart.line.unit_price':
        'Price per 1 {unit}: {price}, pack/full price: {package_price}',
    'cart.item.removed': '{product} removed from cart',
    'cart.item.summary': '{quantity} {unit} · {pieces} pcs',
    'cart.summary.title': 'Order summary',
    'cart.summary.stats':
        '{models} models · {packages} packs · {pieces} pcs · {packs} packs · {bags} bags',
    'cart.total.label': 'Total',
    'cart.total.note': 'Estimated total: {packages} packs, {pieces} pcs',
    'cart.receipt.reference_active': 'Payment reference is still active',
    'cart.receipt.reference_expires': 'Reference valid until: {datetime}',
    'action.clear': 'Clear',
    'action.copy': 'Copy',
    'cart.commerce.email_verification_hint':
        'Sync was paused because your email is not verified. Please verify it.',
    'cart.commerce.notice.verify_title': 'Email verification required',
    'cart.commerce.notice.verify_message': 'Verify your email before checkout.',
    'cart.commerce.notice.verify_button': 'Verify email',
    'cart.commerce.notice.sync_title': 'Sync account',
    'cart.commerce.notice.sync_message': 'Could not sync account.',
    'cart.commerce.notice.sync_button': 'Try again',
    'cart.privacy.open_failed': 'Unable to open privacy policy',

    'account.title': 'My account',
    'account.action.sign_out': 'Sign out',
    'account.section.orders': 'My orders',
    'account.section.tickets': 'My tickets',
    'support.title': 'Customer support',
    'support.field.name': 'Name',
    'support.field.phone': 'Phone',
    'support.field.email': 'Email',
    'support.field.topic': 'Topic',
    'support.field.message': 'Your question',
    'support.action.send': 'Send',
    'support.topic.general': 'General',
    'support.validation.message': 'Question is too short',
    'support.quick.title': 'Frequently asked questions',
    'support.quick.search_hint': 'Search questions',
    'support.quick.empty': 'No matching question found',
    'assistant.fallback':
        'I’m unable to answer this right now. Please message the manager.',
    'auth.error.auth_backend': 'Account service is temporarily unavailable.',
    'auth.error.default': 'Unable to reach service. Please try again.',
    'auth.error.email_exists': 'An account with this email already exists.',
    'auth.error.google_cancelled': 'Google sign in was cancelled.',
    'auth.error.google_failed': 'Google sign in failed. Please try again.',
    'auth.error.google_client_id':
        'Google OAuth is not configured. Ask an admin to set it up.',
    'auth.error.apple_cancelled': 'Apple sign in was cancelled.',
    'auth.error.apple_failed': 'Apple sign in failed. Please try again.',
    'auth.error.recent_login': 'For security, please sign in again and retry.',
    'auth.error.unauthenticated': 'Please sign back in.',
    'auth.error.weak_password': 'Password is too weak.',
    'auth.error.wrong_credentials': 'Invalid email or password.',

    'MILANA PREMIUM': 'MILANA PREMIUM',
    'Milana Premium': 'Milana Premium',
    'account.action.delete': 'Delete account',
    'account.action.edit_profile': 'Edit profile',
    'account.security.title': 'Account & security',
    'account.security.subtitle': 'Private and sensitive settings',
    'account.security.delete_description':
        'Account deletion is permanent. Use this section only when you intend to close the account completely.',
    'account.empty': 'No items yet.',
    'account.loading_failed': 'Some account data did not refresh. Try again.',
    'account.metric.account': 'wholesale account',
    'account.metric.profile': 'profile complete',
    'account.metric.saved': 'saved',

    'app.bar.assistant.tooltip': 'AI assistant',
    'common.close': 'Close',
    'app.bar.cart.tooltip': 'Cart',
    'app.bar.saved.tooltip': 'Saved',
    'app.bar.search.tooltip': 'Search',

    'auth.privacy_checkbox': 'I agree to the privacy policy and terms of use.',
    'auth.privacy_policy': 'Privacy policy',
    'auth.terms': 'Terms of use',
    'auth.create_account': 'Create account',

    'bootstrap.title': 'Milana Premium is temporarily unavailable',
    'bootstrap.message':
        'Check your internet connection and relaunch the app. If it persists, call +998 50 155 10 10',
    'bootstrap.retry_hint': 'Please try again in a few minutes.',

    'cart.message.unavailable': 'Currently unavailable',
    'cart.toast.added': '{product} · {count} {unit} added to cart',

    'catalog.clear_filters': 'Clear filters',
    'catalog.loading': 'Loading catalog',
    'catalog.refresh': 'Refresh',
    'catalog.search_placeholder': 'Search all products…',
    'catalog.breadcrumb': 'Home / Catalog',
    'catalog.header.subtitle':
        'Wholesale catalog of homewear and loungewear, ready by pack and bag.',
    'catalog.filters.quick': 'Quick filters',
    'catalog.filters.close': 'Hide filters',
    'catalog.filters.open': 'Show filters',
    'catalog.filters.active': '{count} filters active',
    'catalog.badge.new': 'NEW',
    'catalog.availability.all': 'All',
    'catalog.availability.in_stock': 'In stock',
    'catalog.availability.preorder': 'Pre-order',
    'catalog.curation.all': 'All',
    'catalog.curation.new_arrival': 'New arrivals',
    'catalog.curation.bestseller': 'Bestsellers',
    'catalog.curation.sale': 'Sale',
    'catalog.price_band.all': 'All',
    'catalog.price_band.under5': 'Under 5',
    'catalog.price_band.from5_to7': '5 to 7',
    'catalog.price_band.over7': 'Over 7',
    'catalog.size.all': 'All',
    'catalog.sort.kids': 'Kids',
    'catalog.sort.men': 'Men',
    'catalog.sort.pajamas': 'Pajamas',
    'catalog.sort.robes': 'Robes',
    'catalog.sort.women': 'Women',
    'catalog.sort.featured': 'Featured',
    'catalog.sort.price_low': 'Price: low to high',
    'catalog.sort.price_high': 'Price: high to low',
    'catalog.sort.name': 'Name',
    'catalog.saved_count': 'Saved: {count}',
    'catalog.models_count': '{count} models',
    'catalog.models_count_ratio': '{visible} / {total} models',
    'catalog.add': 'Add to cart',
    'catalog.add_to_cart_count': 'Add {count} {unit}',
    'catalog.add.limit_exceeded':
        'Cannot add more {product}. Limit is {limit} {unit}. Currently {current} {unit} added.',
    'catalog.empty.saved.title': 'No saved models',
    'catalog.empty.saved.message': 'Save a model from catalog first.',
    'catalog.empty.search.title': 'No results',
    'catalog.empty.search.message':
        'Try another query or clear the filters and retry.',
    'catalog.load_more': 'Load more · {visible}/{total}',
    'catalog.cache.title': 'Cached catalog: {timestamp}',
    'catalog.cache.timestamp': 'Last updated: {time}',
    'catalog.cache.empty': 'Cache time is unknown',

    'checkout.copy_payment_label': 'Manager confirms',
    'checkout.instructions.bank':
        'Bank transfer details are sent by the manager. Confirm by phone: {phone}.',
    'checkout.instructions.card':
        'Card details are sent by the manager. Confirm by phone: {phone}.',
    'checkout.instructions.cash':
        'Cash terms are agreed with the manager by delivery method.',
    'checkout.instructions.click':
        'Click payment details are sent by the manager. Confirm by phone: {phone}.',
    'checkout.instructions.default':
        'Manager confirms final price, stock and payment details at {phone}.',
    'checkout.instructions.payme':
        'Payme payment details are sent by the manager. Confirm by phone: {phone}.',

    'checkout.payment_manager': 'Manager',
    'checkout.payment_bank': 'Bank transfer',
    'checkout.payment_card': 'Card',
    'checkout.payment_cash': 'Cash / by agreement',
    'checkout.payment_click': 'Click',
    'checkout.payment_payme': 'Payme',

    'copy.toast.manager': 'Manager number copied',
    'copy.toast.order': 'Order details copied',
    'copy.toast.phone': 'Phone number copied',
    'copy.toast.reference': 'Reference copied',

    'delete.button': 'Delete account',
    'delete.cancel': 'Cancel',
    'delete.confirm_instruction': 'Type DELETE to confirm account deletion',
    'delete.reason_label': 'Why are you deleting your account?',
    'delete.reason_help':
        'Your reason is stored anonymously and used to improve the service. Do not include personal information.',
    'delete.reason_detail': 'Additional feedback (optional)',
    'delete.reason_detail_help':
        'Add a short explanation when selecting “Other”.',
    'delete.reason_invalid': 'Select an account deletion reason.',
    'delete.reason.no_longer_needed': 'I no longer use the app',
    'delete.reason.missing_features': 'Features I need are missing',
    'delete.reason.difficult_to_use': 'The app is difficult to use',
    'delete.reason.technical_problems': 'I experience technical problems',
    'delete.reason.privacy_concerns': 'I have privacy concerns',
    'delete.reason.created_by_mistake': 'I created the account by mistake',
    'delete.reason.prefer_not_to_say': 'Prefer not to say',
    'delete.reason.other': 'Other',
    'delete.rules': 'View deletion rules',
    'delete.success': 'Account deleted.',
    'delete.support': 'Contact support',
    'delete.title': 'Delete account',

    'home.banner.title.season': 'SPRING-SUMMER 26',
    'home.banner.top': 'TOP',
    'home.section.all': 'ALL PRODUCTS',
    'home.section.homewear': 'HOME COLLECTION',
    'home.section.recent': 'RECENTLY VIEWED',
    'home.section.women': 'WOMEN',
    'home.banner.set': 'SETS',
    'home.wholesale_ticker': 'QUICK ORDER · 1 PACK OR 1 BAG',
    'home.hero.title.empty': 'COMFORT,\nPRECISE FIT.',
    'home.hero.title.with_product': 'COMFORT\nALL DAY.',
    'home.hero.loading': 'COLLECTION UPDATING',
    'home.hero.tagline': 'CLOTHING MANUFACTURING · UZBEKISTAN',
    'home.hero.view_model': 'View model',
    'home.hero.support_tooltip': 'Support',
    'home.hero.play_tooltip': 'Resume slides',
    'home.hero.pause_tooltip': 'Pause slides',
    'home.stat.pack_value': '1 PACK OR 1 BAG',
    'home.stat.pack_label': 'Pack — 6 pcs, bag — 60 pcs',
    'home.stat.delivery_value': 'POST OR CARGO',
    'home.stat.delivery_label': 'Delivery cost is paid by the customer',
    'home.stat.manager_value': 'MANAGER HELPS',
    'home.stat.manager_label': '{count} models · price and stock are confirmed',
    'home.category.women.subtitle': 'Robes and pajamas',
    'home.category.men.subtitle': 'Men’s collection',
    'home.category.kids.subtitle': 'Kids clothing',
    'home.wholesale_band.title': 'How ordering works',
    'home.wholesale_band.step1.title': 'Model and format',
    'home.wholesale_band.step2.text':
        'Availability, color, and total amount are checked.',
    'home.wholesale_band.step3.text': 'Order is shipped after payment.',
    'home.wholesale_band.cta': 'Contact the manager',
    'legal.title': 'Legal information',
    'legal.link.privacy': 'Privacy',
    'analytics.consent.title': 'Help improve the app',
    'analytics.consent.body':
        'Allow optional usage analytics. You can turn this off at any time.',
    'legal.link.terms': 'Terms',
    'legal.link.delete': 'Account deletion',
    'legal.link.support': 'Support',
    'legal.body':
        'How we use your data, terms of service, and account deletion process.',

    'order.share.payment_status': 'Payment status',
    'order.title': 'Order details',

    'password_reset.button': 'Send',
    'password_reset.cancel': 'Cancel',
    'password_reset.error': 'Failed to send: {error}',
    'password_reset.sent': 'Password reset email sent.',
    'password_reset.success': 'Password reset email sent.',
    'password_reset.title': 'Reset password',

    'product.bag.label.en': 'Bag',
    'product.card.price_unit': '{count} pcs',
    'product.highlight.bag_select':
        'Choose quantity per pack or bag and add to cart.',
    'product.highlight.manager': 'Manager confirmation',
    'product.highlight.pack':
        'Start from one pack or full bag. Manager confirms final price, stock and shipment.',
    'product.highlight.payment': 'Payment and delivery',
    'product.highlight.delivery_cost': 'Delivery cost is paid by the customer.',
    'product.tag.new': 'NEW',
    'product.tag.bestseller': 'BESTSELLER',
    'product.tag.sale': 'SALE',
    'product.pack.label.en': 'Pack',
    'product.sheet.recommended_models': 'RECOMMENDED MODELS',
    'product.gallery.previous': 'Previous photo',
    'product.gallery.next': 'Next photo',
    'product.premium': 'Premium',
    'product.order_type.prompt': 'Choose order format',
    'product.copy.info': 'Copy model details',
    'product.copy.info_done': 'Model details copied',
    'product.add_to_cart': 'Add to cart · {amount}',
    'product.related.title': 'Similar models',
    'product.variants.title': 'Variants of this model',
    'product.care.title': 'Care instructions',
    'product.measurements.title': 'Garment measurements',
    'product.related.badge': 'Recommended',
    'quantity.decrease': 'Decrease',
    'quantity.increase': 'Increase',
    'product.sheet.view_all': 'VIEW ALL MODELS · {count}',
    'product.size_per': '{count} per',
    'product.unit': '{count} pcs',
    'product.wholesale.title': '{unit} format',
    'product.moq': 'MOQ: minimum {quantity} {unit}',
    'product.wholesale.item_summary':
        '{unit}: {pieces} pcs · {size} pcs per size',
    'product.wholesale.unit_price': '{unit} unit price',
    'product.share.title': 'Model details',
    'product.share.availability': 'Availability',
    'product.share.category': 'Category',
    'product.share.gender': 'Gender',
    'product.share.manager': 'Manager',
    'product.share.model': 'Model',
    'product.share.price_per_item': 'Price each',
    'product.share.size_mix': 'Size mix',
    'product.share.unit': 'Unit',
    'product.unit.bag': 'bag',
    'product.unit.item': 'pc',

    'product.spec.model': 'Model',
    'product.spec.gender': 'Gender',
    'product.spec.category': 'Category',
    'product.spec.order_type': 'Order type',
    'product.spec.color': 'Color',
    'product.spec.country': 'Country',
    'product.spec.material': 'Material',
    'product.spec.composition': 'Composition',
    'product.spec.season': 'Season',
    'product.spec.sizes': 'Size range',
    'product.spec.stock': 'Stock',

    'support.help_hint':
        'Send your question about price, stock, delivery, payment, or defects.',
    'support.ticket.created': 'Support ticket created: {number}',
    'support.ticket.failed': 'Failed to send: {error}',

    'validation.name.required': 'Enter name',

    'catalog.category.default': 'All categories',
    'catalog.category.family': 'Family',
    'catalog.category.homewear': 'Homewear',
    'catalog.category.loungewear': 'Loungewear',
    'catalog.category.pajamas': 'Pajamas',
    'catalog.category.robes': 'Robes',
    'catalog.gender.all': 'All',
    'catalog.gender.kids': 'Kids',
    'catalog.gender.men': 'Men',
    'catalog.gender.women': 'Women',
    'order.line_item.pieces': '{count} pcs',
    'order.next_action.cancelled': 'Order #{number} is cancelled',
    'order.next_action.confirming': 'Pending manager review',
    'order.next_action.delivered': 'Delivered',
    'order.next_action.paid': 'Paid',
    'order.next_action.pending': 'Waiting for payment',
    'order.next_action.shipped': 'Shipped',
    'order.next_action.submitted': 'Payment submitted',
    'order.share.contents': 'Contents',
    'order.share.delivery': 'Delivery',
    'order.share.next_step': 'Next step',
    'order.share.number': 'Order',
    'order.share.payment_expires_at': 'Payment expires',
    'order.share.payment_label': 'Payment method',
    'order.share.payment_reference': 'Payment reference',
    'order.share.status': 'Status',
    'order.share.submitted_reference': 'Submitted reference',
    'order.share.title': 'Order summary',
    'order.share.total': 'Total',
    'order.share.tracking_number': 'Tracking number',
    'order.size_mix.default': 'No size mix selected',
    'order.tracking_summary.package_only':
        '{packages} package(s), {pieces} pcs',
    'order.tracking_summary.packages': '{summary} · {pieces} pcs',
    'payment.validation.amount.mismatch':
        'Amount is different from expected ({expected})',
    'payment.validation.amount.required': 'Please enter an amount',
    'payment.validation.proof_required': 'Enter payment proof details or note.',
    'product.availability.manager': 'Pending manager confirmation',
    'product.availability.out_of_stock': 'Out of stock',
    'product.highlight.pending_confirmation': 'Stock confirmation pending',
    'product.highlight.preorder': 'Pre-order available',
    'product.highlight.price_confirmed': 'Price confirmed',
    'product.highlight.stock': '{count} in stock',
    'product.highlight.unavailable': 'Currently unavailable',
    'product.highlight.with_manager': 'Approved by manager',
    'product.card.open_details': 'Open details',
    'product.card.saved_add': 'Save',
    'product.card.saved_remove': 'Remove from saved',
    'product.image.label': '{product} image',

    'support.faq.topic.products': 'Catalog',
    'support.faq.question.products': 'What products are available?',
    'support.faq.answer.products':
        'We mainly make women’s fashion, plus robes, pajamas, tunics and homewear for men, women, and kids.',
    'support.faq.topic.minimum-order': 'Wholesale',
    'support.faq.question.minimum-order': 'What is the minimum order?',
    'support.faq.answer.minimum-order':
        'Minimum pack or bag size shown per model in catalog applies. Pack is usually 6 pcs, a standard bag has 60 pcs.',
    'support.faq.topic.bag-size': 'Wholesale',
    'support.faq.question.bag-size': 'How are sizes split in one bag?',
    'support.faq.answer.bag-size':
        'Standard bag: 60 pcs. Usually 6 sizes, 10 pieces each.',
    'support.faq.topic.price': 'Pricing',
    'support.faq.question.price': 'How is the price calculated?',
    'support.faq.answer.price':
        'Price per piece is shown in the product card. Pack/bag price is piece price multiplied by units. Manager confirms final price and stock.',
    'support.faq.topic.delivery': 'Delivery',
    'support.faq.question.delivery': 'Do you ship orders?',
    'support.faq.answer.delivery':
        'Yes, we ship via cargo or post. Customer covers delivery cost and timing is agreed with cargo providers.',
    'support.faq.topic.address': 'Address',
    'support.faq.question.address': 'Where are you located?',
    'support.faq.answer.address':
        'Address: Uzbekistan, Andijan, Karotat 605. About 500 meters from Andijan airport.',
    'support.faq.topic.hours': 'Business hours',
    'support.faq.question.hours': 'What are your office hours?',
    'support.faq.answer.hours': 'Mon–Sat, 08:00–18:00.',
    'support.faq.topic.payment': 'Payment',
    'support.faq.question.payment': 'How can I pay?',
    'support.faq.answer.payment':
        'Payment method is confirmed by the manager. Ask before placing order at +998501551010.',
    'support.faq.topic.defect': 'Defect',
    'support.faq.question.defect': 'What if there is a defect?',
    'support.faq.answer.defect':
        'If a defect is found, factory refunds or replaces the goods. Confirm with manager through photo or message.',
    'support.faq.topic.availability': 'Stock',
    'support.faq.question.availability': 'Are products always in stock?',
    'support.faq.answer.availability':
        'Many items are limited edition, so confirm stock before placing the order.',
  },
};
