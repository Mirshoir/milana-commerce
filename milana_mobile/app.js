/* ============ Milana Premium — app logic ============ */

let PRODUCTS = [];
const API_BASE = (window.MILANA_API_BASE || "").replace(/\/+$/, "");
const IS_NATIVE = Boolean(window.Capacitor?.isNativePlatform?.()) || (
  location.protocol === "https:" && location.hostname === "localhost" && Boolean(window.Capacitor)
);
const API_TIMEOUT_MS = 15000;
const BAG_SIZE = 60;
const PACK_SIZE = 6;
const money = (n) => "$" + n.toFixed(2);
const byId = (id) => document.getElementById(id);
const find = (id) => PRODUCTS.find((p) => String(p.id) === String(id));
const CATEGORY_MAP = {
  pajamas: "Pajamas",
  robes: "Robes",
  homewear: "Homewear",
  loungewear: "Loungewear",
};

function absoluteUrl(url) {
  const value = String(url || "");
  if (!value || /^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith("/")) return API_BASE ? API_BASE + value : value;
  return value;
}

function isVideoUrl(url) {
  return /\.(mp4|m4v|mov|webm)(?:[?#].*)?$/i.test(String(url || ""));
}

function mediaType(url) {
  return isVideoUrl(url) ? "video" : "image";
}

function mediaKey(url) {
  const value = absoluteUrl(url);
  if (!value) return "";
  try {
    const parsed = new URL(value, window.location.origin);
    parsed.search = "";
    parsed.hash = "";
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return String(value).split(/[?#]/)[0].toLowerCase();
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
}

function safeMediaUrl(value) {
  const url = absoluteUrl(value);
  return /^(https?:|data:image\/|blob:|\/|assets\/)/i.test(url) ? url : "";
}

function safeColor(value) {
  const color = String(value || "");
  return /^(#[0-9a-f]{3,8}|rgba?\([0-9.,% ]+\)|[a-z]{3,20})$/i.test(color) ? color : "#C9AE93";
}

/* ---------- state (persisted) ---------- */
const store = {
  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem("milana." + key)) ?? fallback; }
    catch { return fallback; }
  },
  save(key, value) {
    try { localStorage.setItem("milana." + key, JSON.stringify(value)); }
    catch (error) { console.warn(`Could not persist ${key}`, error); }
  },
  remove(key) {
    try { localStorage.removeItem("milana." + key); }
    catch {}
  },
};

let authToken = IS_NATIVE ? "" : store.load("authToken", "");
if (IS_NATIVE) store.remove("authToken");

const LANGUAGES = ["uz", "ru", "en"];
const I18N = {
  en: {
    searchPlaceholder: "Search for products, brands...",
    notifications: "Notifications",
    noNotifications: "No new notifications",
    filter: "Filter",
    back: "Back",
    wishlist: "Wishlist",
    cart: "Cart",
    addWishlist: "Add to wishlist",
    toggleWishlist: "Toggle wishlist",
    remove: "Remove",
    decrease: "Decrease",
    increase: "Increase",
    newCollection: "New Collection",
    springSummer: "Spring / Summer 2026",
    editorPick: "Editor's Pick",
    sportEdit: "Sport Edit",
    justIn: "Just In",
    floralEssentials: "Floral Essentials",
    shopNow: "Shop Now",
    shopByCategory: "Shop by Category",
    viewAll: "View all",
    catMen: "Men",
    catWomen: "Women",
    catKids: "Kids",
    catFamily: "Family set",
    brands: "Brands",
    bestSellers: "Best Sellers",
    all: "All",
    pajamas: "Pajamas",
    robes: "Robes",
    homewear: "Homewear",
    loungewear: "Loungewear",
    sort: "Sort",
    sortBy: "Sort by",
    featured: "Featured",
    priceAsc: "Price: Low to High",
    priceDesc: "Price: High to Low",
    topRated: "Top Rated",
    noProducts: "No products found",
    loadingProducts: "Loading collection...",
    productLoadFailed: "We couldn't refresh the collection. Please check your connection and try again.",
    retry: "Retry",
    description: "Description",
    suggestedItems: "Suggested items",
    defaultDescription: "Premium Milana piece for comfortable everyday wear. A manager will confirm size, pack quantity and delivery details after checkout.",
    product: "Product",
    color: "Color:",
    size: "Size:",
    quantityType: "Choose:",
    addToCart: "Add to Cart",
    myCart: "My Cart",
    orderSummary: "Order Summary",
    subtotal: "Subtotal",
    total: "Total",
    checkout: "Checkout",
    cartEmptyTitle: "Your cart is empty",
    cartEmptyText: "Discover the new collection and find something you love.",
    startShopping: "Start Shopping",
    wishlistEmptyTitle: "Nothing saved yet",
    wishlistEmptyText: "Tap the heart on any product to keep it here.",
    exploreProducts: "Explore Products",
    profile: "Profile",
    milanaGuest: "Milana Guest",
    guestEmail: "guest@milanapremium.uz",
    signedIn: "Signed in",
    guestMode: "Guest mode",
    signInPrompt: "Sign in to sync orders and wishlist",
    signIn: "Sign in",
    create: "Create",
    forgotKey: "Forgot key",
    email: "Email",
    password: "Password",
    googleContinue: "Continue with Google",
    name: "Name",
    phone: "Phone",
    sendCode: "Send code",
    cityRegion: "City / region",
    deliveryAddress: "Delivery address",
    terms: "I agree to create a Milana customer account.",
    createAccount: "Create account",
    emailCode: "Email code",
    newPassword: "New password",
    resetKey: "Reset key",
    logOut: "Log out",
    myOrders: "My Orders",
    paymentMethods: "Payment Methods",
    helpSupport: "Help & Support",
    paymentIntro: "Payment is confirmed by a Milana manager after your order is placed. No online payment is charged inside the app yet.",
    confirmation: "Confirmation",
    managerCall: "Manager call",
    currency: "Currency",
    status: "Status",
    available: "Available",
    contactManager: "Contact manager",
    deliveryIntro: "Save your preferred address so checkout is faster next time.",
    saveAddress: "Save address",
    addressSaved: "Delivery address saved",
    supportIntro: "Choose instant AI help or send a request to a Milana manager.",
    aiAssistant: "AI assistant",
    humanAssistant: "Human assistant",
    aiIntro: "Ask about sizes, delivery, payment, orders, bag or pack.",
    aiPlaceholder: "How can we help?",
    ask: "Ask",
    humanMessage: "Your message",
    humanPlaceholder: "Write your question for the manager",
    sendManager: "Send to manager",
    supportSent: "Your message was sent to a manager",
    supportMessageShort: "Please write at least 8 characters.",
    supportSendFailed: "Could not send the message. Please try again.",
    settings: "Settings",
    account: "Account",
    loginProfile: "Login and profile",
    orders: "Orders",
    language: "Language",
    uzbek: "Uzbek",
    russian: "Russian",
    english: "English",
    shopping: "Shopping",
    wholesaleQop: "Wholesale bag",
    qop: "Bag",
    qadoq: "Pack",
    qopSize: "60 pcs",
    qadoqSize: "6 pcs",
    pcs: "pcs",
    support: "Support",
    appSource: "App source",
    adminPanel: "Admin panel",
    websiteOnly: "Website only",
    home: "Home",
    categories: "Categories",
    reset: "Reset",
    price: "Price",
    under90: "Under $90",
    price90To130: "$90 - $130",
    over130: "Over $130",
    beige: "Beige",
    white: "White",
    black: "Black",
    navy: "Navy",
    showResults: "Show Results",
    orderDetails: "Order Details",
    managerConfirm: "A manager will contact you to confirm the order.",
    checkoutNote: "Pack: 6 pcs, 1 per each size. Bag: 60 pcs, 10 per each size.",
    receiverName: "Your name *",
    phoneNumber: "Phone number *",
    postCode: "Post code",
    deliveryNote: "Delivery note",
    cancel: "Cancel",
    sendOrder: "Send Order",
    sending: "Sending...",
    orderPlaced: "Order Placed",
    successThanks: "Thank you for shopping with Milana Premium.",
    continueShopping: "Continue Shopping",
    phPassword: "At least 8 characters",
    phName: "Your name",
    phCity: "Tashkent",
    phAddress: "Street, building, landmark",
    phReceiver: "For example, Alex",
    phPost: "For example, 100000",
    phNote: "Warehouse, floor, delivery time...",
    addedToCart: "Added to cart",
    savedWishlist: "Saved to wishlist",
    keyResetSignedIn: "Key reset. You are signed in.",
    signedInToast: "Signed in",
    loggedOut: "Logged out",
    signInCheckout: "Please sign in to checkout",
    signInOrders: "Please sign in to view orders",
    noOrders: "No orders yet",
    ordersUnavailable: "Orders unavailable: {message}",
    checkoutFailed: "Checkout failed: {message}",
    receiverNameError: "Please enter the receiver name.",
    phoneError: "Please enter a valid phone number.",
    orderSuccess: "Order {number} was placed. Total {total}.",
    codeShown: "Code: {code}",
    emailCodeSent: "Email code sent.",
    keyReset: "Your key was reset.",
    authEmail: "Enter a valid email address.",
    authPassword: "Password must be at least 8 characters.",
    authPhone: "Enter a valid phone number.",
    authName: "Enter your name.",
    authOtp: "Enter the 6 digit code.",
    authOtpWrong: "The code is incorrect.",
    authOtpExpired: "The code expired. Send a new one.",
    authPhoneNotVerified: "Please verify your phone number first.",
    authEmailNotVerified: "Please verify your email first.",
    authFirebaseNotConfigured: "Google sign-in is not configured yet.",
    authEmailExists: "This email already has an account.",
    authWrongCredentials: "Email or password is incorrect.",
    authRecoveryMismatch: "We could not reset that account.",
    authEmailNotConfigured: "Email recovery is not configured on the server.",
    authEmailFailed: "Could not send the email code.",
    authSmsNotConfigured: "SMS verification is not configured on the server.",
    authSmsFailed: "Could not send the phone code.",
    authRateLimited: "Too many attempts. Please try again later.",
    authTerms: "Please accept account creation.",
    homeKicker: "MILANA / 2026",
    homeHeadline: "Made for your rhythm.",
    homeSubtitle: "Premium everyday pieces, selected for the way you live.",
    shopCollection: "Shop collection",
    discover: "Discover",
    selectedForYou: "Selected for you",
    milanaEdit: "The Milana edit",
    shopAll: "Shop all",
    quickDiscovery: "Quick discovery",
    nextFavorite: "Find your next favorite",
    swipeSaveSkip: "Swipe to save or skip",
    discoverIntro: "A faster way to shape your Milana edit.",
    discoverHint: "Swipe left to skip · Swipe right to save",
    skip: "Skip",
    save: "Save",
    viewProduct: "View product",
    savedItems: "Saved Items",
    shop: "Shop",
    discoverEmpty: "You have seen today's edit.",
    discoverRestart: "Start again",
    clearSearch: "Clear search",
    searchTitle: "Search results",
    browseCollection: "Browse the collection",
    searchResults: "{count} products",
    authGeneric: "Something went wrong.",
    offline: "You are offline. Showing saved products.",
    backOnline: "Connection restored.",
    requestTimeout: "The server took too long to respond. Please try again.",
  },
  uz: {
    searchPlaceholder: "Mahsulotlar, brendlarni qidirish...",
    notifications: "Bildirishnomalar",
    noNotifications: "Yangi bildirishnoma yo'q",
    filter: "Filtr",
    back: "Ortga",
    wishlist: "Saralanganlar",
    cart: "Savatcha",
    addWishlist: "Saralanganlarga qo'shish",
    toggleWishlist: "Saralanganlarni almashtirish",
    remove: "O'chirish",
    decrease: "Kamaytirish",
    increase: "Ko'paytirish",
    newCollection: "Yangi kolleksiya",
    springSummer: "Bahor / Yoz 2026",
    editorPick: "Tanlangan",
    sportEdit: "Sport uslubi",
    justIn: "Yangi kelgan",
    floralEssentials: "Gulli uslublar",
    shopNow: "Xarid qilish",
    shopByCategory: "Kategoriya bo'yicha",
    viewAll: "Barchasi",
    catMen: "Erkaklar",
    catWomen: "Ayollar",
    catKids: "Bolalar",
    catFamily: "Oilaviy set",
    brands: "Brendlar",
    bestSellers: "Eng ko'p sotilganlar",
    all: "Hammasi",
    pajamas: "Pijamalar",
    robes: "Xalatlar",
    homewear: "Uy kiyimlari",
    loungewear: "Dam olish kiyimlari",
    sort: "Saralash",
    sortBy: "Saralash",
    featured: "Tavsiya etilgan",
    priceAsc: "Narx: arzondan qimmatga",
    priceDesc: "Narx: qimmatdan arzonga",
    topRated: "Yuqori baholangan",
    noProducts: "Mahsulot topilmadi",
    loadingProducts: "Kolleksiya yuklanmoqda...",
    productLoadFailed: "Kolleksiyani yangilab bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.",
    retry: "Qayta urinish",
    description: "Tavsif",
    suggestedItems: "Tavsiya etilgan mahsulotlar",
    defaultDescription: "Kundalik qulaylik uchun premium Milana mahsuloti. Buyurtmadan keyin menejer o'lcham, qadoq/qop miqdori va yetkazib berishni tasdiqlaydi.",
    product: "Mahsulot",
    color: "Rang:",
    size: "O'lcham:",
    quantityType: "Tanlang:",
    addToCart: "Savatchaga qo'shish",
    myCart: "Mening savatcham",
    orderSummary: "Buyurtma xulosasi",
    subtotal: "Jami",
    total: "Umumiy",
    checkout: "Rasmiylashtirish",
    cartEmptyTitle: "Savatcha bo'sh",
    cartEmptyText: "Yangi kolleksiyani ko'ring va yoqqan mahsulotni tanlang.",
    startShopping: "Xaridni boshlash",
    wishlistEmptyTitle: "Hali hech narsa saqlanmadi",
    wishlistEmptyText: "Mahsulotdagi yurakchani bosib, shu yerda saqlang.",
    exploreProducts: "Mahsulotlarni ko'rish",
    profile: "Profil",
    milanaGuest: "Milana mehmoni",
    guestEmail: "guest@milanapremium.uz",
    signedIn: "Tizimga kirilgan",
    guestMode: "Mehmon rejimi",
    signInPrompt: "Buyurtma va saralanganlarni sinxronlash uchun kiring",
    signIn: "Kirish",
    create: "Yaratish",
    forgotKey: "Kalitni unutdingizmi",
    email: "Email",
    password: "Parol",
    googleContinue: "Google orqali davom etish",
    name: "Ism",
    phone: "Telefon",
    sendCode: "Kod yuborish",
    cityRegion: "Shahar / viloyat",
    deliveryAddress: "Yetkazib berish manzili",
    terms: "Milana mijoz akkauntini yaratishga roziman.",
    createAccount: "Akkaunt yaratish",
    emailCode: "Email kodi",
    newPassword: "Yangi parol",
    resetKey: "Kalitni tiklash",
    logOut: "Chiqish",
    myOrders: "Buyurtmalarim",
    paymentMethods: "To'lov usullari",
    helpSupport: "Yordam",
    paymentIntro: "Buyurtma berilgandan keyin to'lov Milana menejeri tomonidan tasdiqlanadi. Ilova ichida hozircha online to'lov olinmaydi.",
    confirmation: "Tasdiqlash",
    managerCall: "Menejer qo'ng'irog'i",
    currency: "Valyuta",
    status: "Holat",
    available: "Mavjud",
    contactManager: "Menejer bilan bog'lanish",
    deliveryIntro: "Keyingi buyurtma tezroq bo'lishi uchun manzilingizni saqlang.",
    saveAddress: "Manzilni saqlash",
    addressSaved: "Yetkazib berish manzili saqlandi",
    supportIntro: "Tezkor AI yordam yoki Milana menejeriga murojaat yuboring.",
    aiAssistant: "AI yordamchi",
    humanAssistant: "Menejer",
    aiIntro: "O'lcham, yetkazib berish, to'lov, buyurtma, qop yoki qadoq haqida so'rang.",
    aiPlaceholder: "Qanday yordam bera olamiz?",
    ask: "So'rash",
    humanMessage: "Xabaringiz",
    humanPlaceholder: "Menejer uchun savolingizni yozing",
    sendManager: "Menejerga yuborish",
    supportSent: "Xabaringiz menejerga yuborildi",
    supportMessageShort: "Kamida 8 ta belgi yozing.",
    supportSendFailed: "Xabar yuborilmadi. Qayta urinib ko'ring.",
    settings: "Sozlamalar",
    account: "Akkaunt",
    loginProfile: "Kirish va profil",
    orders: "Buyurtmalar",
    language: "Til",
    uzbek: "O'zbekcha",
    russian: "Ruscha",
    english: "Inglizcha",
    shopping: "Xaridlar",
    wholesaleQop: "Ulgurji qop",
    qop: "Qop",
    qadoq: "Qadoq",
    qopSize: "60 dona",
    qadoqSize: "6 dona",
    pcs: "dona",
    support: "Yordam",
    appSource: "Ilova manbasi",
    adminPanel: "Admin panel",
    websiteOnly: "Faqat website",
    home: "Bosh sahifa",
    categories: "Kategoriyalar",
    reset: "Tozalash",
    price: "Narx",
    under90: "$90 dan past",
    price90To130: "$90 - $130",
    over130: "$130 dan yuqori",
    beige: "Bej",
    white: "Oq",
    black: "Qora",
    navy: "To'q ko'k",
    showResults: "Natijalarni ko'rsatish",
    orderDetails: "Buyurtma ma'lumotlari",
    managerConfirm: "Buyurtmani tasdiqlash uchun menejer siz bilan bog'lanadi.",
    checkoutNote: "Qadoq: 6 dona, har o'lchamdan 1 tadan. Qop: 60 dona, har o'lchamdan 10 tadan.",
    receiverName: "Ismingiz *",
    phoneNumber: "Telefon raqami *",
    postCode: "Pochta indeksi",
    deliveryNote: "Yetkazib berish izohi",
    cancel: "Bekor qilish",
    sendOrder: "Buyurtma yuborish",
    sending: "Yuborilmoqda...",
    orderPlaced: "Buyurtma qabul qilindi",
    successThanks: "Milana Premium bilan xarid qilganingiz uchun rahmat.",
    continueShopping: "Xaridni davom ettirish",
    phPassword: "Kamida 8 belgi",
    phName: "Ismingiz",
    phCity: "Toshkent",
    phAddress: "Ko'cha, bino, mo'ljal",
    phReceiver: "Masalan, Aziz",
    phPost: "Masalan, 100000",
    phNote: "Ombor, qavat, yetkazish vaqti...",
    addedToCart: "Savatchaga qo'shildi",
    savedWishlist: "Saralanganlarga saqlandi",
    keyResetSignedIn: "Kalit tiklandi. Siz tizimga kirdingiz.",
    signedInToast: "Tizimga kirdingiz",
    loggedOut: "Tizimdan chiqdingiz",
    signInCheckout: "Rasmiylashtirish uchun tizimga kiring",
    signInOrders: "Buyurtmalarni ko'rish uchun tizimga kiring",
    noOrders: "Hali buyurtma yo'q",
    ordersUnavailable: "Buyurtmalar mavjud emas: {message}",
    checkoutFailed: "Rasmiylashtirishda xatolik: {message}",
    receiverNameError: "Qabul qiluvchi ismini kiriting.",
    phoneError: "To'g'ri telefon raqamini kiriting.",
    orderSuccess: "{number} buyurtma qabul qilindi. Umumiy {total}.",
    codeShown: "Kod: {code}",
    emailCodeSent: "Email kodi yuborildi.",
    keyReset: "Kalitingiz tiklandi.",
    authEmail: "To'g'ri email kiriting.",
    authPassword: "Parol kamida 8 belgidan iborat bo'lishi kerak.",
    authPhone: "To'g'ri telefon raqamini kiriting.",
    authName: "Ismingizni kiriting.",
    authOtp: "6 xonali kodni kiriting.",
    authOtpWrong: "Kod noto'g'ri.",
    authOtpExpired: "Kod muddati tugagan. Yangisini yuboring.",
    authPhoneNotVerified: "Avval telefon raqamingizni tasdiqlang.",
    authEmailNotVerified: "Avval emailingizni tasdiqlang.",
    authFirebaseNotConfigured: "Google orqali kirish hali sozlanmagan.",
    authEmailExists: "Bu email bilan akkaunt mavjud.",
    authWrongCredentials: "Email yoki parol noto'g'ri.",
    authRecoveryMismatch: "Bu akkauntni tiklab bo'lmadi.",
    authEmailNotConfigured: "Email orqali tiklash serverda sozlanmagan.",
    authEmailFailed: "Email kodini yuborib bo'lmadi.",
    authSmsNotConfigured: "SMS tasdiqlash serverda sozlanmagan.",
    authSmsFailed: "Telefon kodini yuborib bo'lmadi.",
    authRateLimited: "Urinishlar ko'p. Keyinroq qayta urinib ko'ring.",
    authTerms: "Akkaunt yaratishga rozilik bering.",
    homeKicker: "MILANA / 2026",
    homeHeadline: "Sizning ritmingiz uchun.",
    homeSubtitle: "Hayot tarzingizga mos tanlangan premium kundalik kiyimlar.",
    shopCollection: "Kolleksiyani ko'rish",
    discover: "Kashf etish",
    selectedForYou: "Siz uchun tanlandi",
    milanaEdit: "Milana tanlovi",
    shopAll: "Barchasini ko'rish",
    quickDiscovery: "Tezkor tanlov",
    nextFavorite: "Yangi sevimli mahsulotingizni toping",
    swipeSaveSkip: "Saqlash yoki o'tkazish uchun suring",
    discoverIntro: "Milana tanlovingizni tezroq yarating.",
    discoverHint: "O'tkazish uchun chapga · Saqlash uchun o'ngga",
    skip: "O'tkazish",
    save: "Saqlash",
    viewProduct: "Mahsulotni ko'rish",
    savedItems: "Saqlanganlar",
    shop: "Do'kon",
    discoverEmpty: "Bugungi tanlovni ko'rib bo'ldingiz.",
    discoverRestart: "Qayta boshlash",
    clearSearch: "Qidiruvni tozalash",
    searchTitle: "Qidiruv natijalari",
    browseCollection: "Kolleksiyani ko'ring",
    searchResults: "{count} ta mahsulot",
    authGeneric: "Nimadir xato ketdi.",
    offline: "Internet yo'q. Saqlangan mahsulotlar ko'rsatilmoqda.",
    backOnline: "Internet qayta ulandi.",
    requestTimeout: "Server javobi kechikdi. Qayta urinib ko'ring.",
  },
  ru: {
    searchPlaceholder: "Поиск товаров и брендов...",
    notifications: "Уведомления",
    noNotifications: "Новых уведомлений нет",
    filter: "Фильтр",
    back: "Назад",
    wishlist: "Избранное",
    cart: "Корзина",
    addWishlist: "Добавить в избранное",
    toggleWishlist: "Переключить избранное",
    remove: "Удалить",
    decrease: "Уменьшить",
    increase: "Увеличить",
    newCollection: "Новая коллекция",
    springSummer: "Весна / Лето 2026",
    editorPick: "Выбор редакции",
    sportEdit: "Спортивный стиль",
    justIn: "Новинка",
    floralEssentials: "Цветочная коллекция",
    shopNow: "Купить",
    shopByCategory: "Категории",
    viewAll: "Все",
    catMen: "Мужчины",
    catWomen: "Женщины",
    catKids: "Дети",
    catFamily: "Семейный сет",
    brands: "Бренды",
    bestSellers: "Хиты продаж",
    all: "Все",
    pajamas: "Пижамы",
    robes: "Халаты",
    homewear: "Домашняя одежда",
    loungewear: "Одежда для отдыха",
    sort: "Сортировка",
    sortBy: "Сортировать",
    featured: "Рекомендуемые",
    priceAsc: "Цена: по возрастанию",
    priceDesc: "Цена: по убыванию",
    topRated: "Высокий рейтинг",
    noProducts: "Товары не найдены",
    loadingProducts: "Загружаем коллекцию...",
    productLoadFailed: "Не удалось обновить коллекцию. Проверьте интернет и попробуйте снова.",
    retry: "Повторить",
    description: "Описание",
    suggestedItems: "Рекомендуемые товары",
    defaultDescription: "Премиальная вещь Milana для комфортного ежедневного ношения. После оформления менеджер подтвердит размер, количество упаковок и доставку.",
    product: "Товар",
    color: "Цвет:",
    size: "Размер:",
    quantityType: "Выберите:",
    addToCart: "В корзину",
    myCart: "Моя корзина",
    orderSummary: "Итог заказа",
    subtotal: "Сумма",
    total: "Итого",
    checkout: "Оформить",
    cartEmptyTitle: "Корзина пуста",
    cartEmptyText: "Посмотрите новую коллекцию и выберите то, что понравится.",
    startShopping: "Начать покупки",
    wishlistEmptyTitle: "Пока ничего не сохранено",
    wishlistEmptyText: "Нажмите сердечко у товара, чтобы сохранить его здесь.",
    exploreProducts: "Смотреть товары",
    profile: "Профиль",
    milanaGuest: "Гость Milana",
    guestEmail: "guest@milanapremium.uz",
    signedIn: "Вы вошли",
    guestMode: "Гостевой режим",
    signInPrompt: "Войдите, чтобы синхронизировать заказы и избранное",
    signIn: "Войти",
    create: "Создать",
    forgotKey: "Забыли ключ",
    email: "Email",
    password: "Пароль",
    googleContinue: "Продолжить с Google",
    name: "Имя",
    phone: "Телефон",
    sendCode: "Отправить код",
    cityRegion: "Город / регион",
    deliveryAddress: "Адрес доставки",
    terms: "Я согласен создать клиентский аккаунт Milana.",
    createAccount: "Создать аккаунт",
    emailCode: "Код из email",
    newPassword: "Новый пароль",
    resetKey: "Сбросить ключ",
    logOut: "Выйти",
    myOrders: "Мои заказы",
    paymentMethods: "Способы оплаты",
    helpSupport: "Помощь",
    paymentIntro: "Оплату подтверждает менеджер Milana после оформления заказа. Онлайн-оплата в приложении пока не списывается.",
    confirmation: "Подтверждение",
    managerCall: "Звонок менеджера",
    currency: "Валюта",
    status: "Статус",
    available: "Доступно",
    contactManager: "Связаться с менеджером",
    deliveryIntro: "Сохраните удобный адрес, чтобы следующий заказ оформить быстрее.",
    saveAddress: "Сохранить адрес",
    addressSaved: "Адрес доставки сохранен",
    supportIntro: "Выберите быстрый AI-помощник или отправьте запрос менеджеру Milana.",
    aiAssistant: "AI-помощник",
    humanAssistant: "Менеджер",
    aiIntro: "Спросите о размерах, доставке, оплате, заказах, мешке или упаковке.",
    aiPlaceholder: "Как мы можем помочь?",
    ask: "Спросить",
    humanMessage: "Ваше сообщение",
    humanPlaceholder: "Напишите вопрос для менеджера",
    sendManager: "Отправить менеджеру",
    supportSent: "Сообщение отправлено менеджеру",
    supportMessageShort: "Напишите минимум 8 символов.",
    supportSendFailed: "Не удалось отправить сообщение. Попробуйте снова.",
    settings: "Настройки",
    account: "Аккаунт",
    loginProfile: "Вход и профиль",
    orders: "Заказы",
    language: "Язык",
    uzbek: "Узбекский",
    russian: "Русский",
    english: "Английский",
    shopping: "Покупки",
    wholesaleQop: "Оптовый мешок",
    qop: "Мешок",
    qadoq: "Упаковка",
    qopSize: "60 шт.",
    qadoqSize: "6 шт.",
    pcs: "шт.",
    support: "Поддержка",
    appSource: "Источник приложения",
    adminPanel: "Админ-панель",
    websiteOnly: "Только сайт",
    home: "Главная",
    categories: "Категории",
    reset: "Сбросить",
    price: "Цена",
    under90: "До $90",
    price90To130: "$90 - $130",
    over130: "Выше $130",
    beige: "Бежевый",
    white: "Белый",
    black: "Черный",
    navy: "Темно-синий",
    showResults: "Показать результаты",
    orderDetails: "Детали заказа",
    managerConfirm: "Менеджер свяжется с вами для подтверждения заказа.",
    checkoutNote: "Упаковка: 6 шт., по 1 каждого размера. Мешок: 60 шт., по 10 каждого размера.",
    receiverName: "Ваше имя *",
    phoneNumber: "Номер телефона *",
    postCode: "Почтовый индекс",
    deliveryNote: "Комментарий к доставке",
    cancel: "Отмена",
    sendOrder: "Отправить заказ",
    sending: "Отправка...",
    orderPlaced: "Заказ оформлен",
    successThanks: "Спасибо за покупку в Milana Premium.",
    continueShopping: "Продолжить покупки",
    phPassword: "Минимум 8 символов",
    phName: "Ваше имя",
    phCity: "Ташкент",
    phAddress: "Улица, дом, ориентир",
    phReceiver: "Например, Алекс",
    phPost: "Например, 100000",
    phNote: "Склад, этаж, время доставки...",
    addedToCart: "Добавлено в корзину",
    savedWishlist: "Сохранено в избранное",
    keyResetSignedIn: "Ключ сброшен. Вы вошли.",
    signedInToast: "Вы вошли",
    loggedOut: "Вы вышли",
    signInCheckout: "Войдите, чтобы оформить заказ",
    signInOrders: "Войдите, чтобы посмотреть заказы",
    noOrders: "Заказов пока нет",
    ordersUnavailable: "Заказы недоступны: {message}",
    checkoutFailed: "Ошибка оформления: {message}",
    receiverNameError: "Введите имя получателя.",
    phoneError: "Введите корректный номер телефона.",
    orderSuccess: "Заказ {number} оформлен. Итого {total}.",
    codeShown: "Код: {code}",
    emailCodeSent: "Код на email отправлен.",
    keyReset: "Ваш ключ сброшен.",
    authEmail: "Введите корректный email.",
    authPassword: "Пароль должен быть не менее 8 символов.",
    authPhone: "Введите корректный номер телефона.",
    authName: "Введите имя.",
    authOtp: "Введите 6-значный код.",
    authOtpWrong: "Код неверный.",
    authOtpExpired: "Срок кода истек. Отправьте новый.",
    authPhoneNotVerified: "Сначала подтвердите номер телефона.",
    authEmailNotVerified: "Сначала подтвердите email.",
    authFirebaseNotConfigured: "Вход через Google еще не настроен.",
    authEmailExists: "Аккаунт с этим email уже существует.",
    authWrongCredentials: "Email или пароль неверный.",
    authRecoveryMismatch: "Не удалось восстановить этот аккаунт.",
    authEmailNotConfigured: "Восстановление по email не настроено на сервере.",
    authEmailFailed: "Не удалось отправить код на email.",
    authSmsNotConfigured: "SMS-подтверждение не настроено на сервере.",
    authSmsFailed: "Не удалось отправить код на телефон.",
    authRateLimited: "Слишком много попыток. Попробуйте позже.",
    authTerms: "Примите условия создания аккаунта.",
    homeKicker: "MILANA / 2026",
    homeHeadline: "Создано для вашего ритма.",
    homeSubtitle: "Премиальные вещи на каждый день, выбранные для вашего образа жизни.",
    shopCollection: "Смотреть коллекцию",
    discover: "Открытия",
    selectedForYou: "Выбрано для вас",
    milanaEdit: "Выбор Milana",
    shopAll: "Смотреть все",
    quickDiscovery: "Быстрый выбор",
    nextFavorite: "Найдите новую любимую вещь",
    swipeSaveSkip: "Смахните, чтобы сохранить или пропустить",
    discoverIntro: "Быстрый способ собрать свою подборку Milana.",
    discoverHint: "Влево — пропустить · Вправо — сохранить",
    skip: "Пропустить",
    save: "Сохранить",
    viewProduct: "Открыть товар",
    savedItems: "Сохраненные",
    shop: "Магазин",
    discoverEmpty: "Вы посмотрели сегодняшнюю подборку.",
    discoverRestart: "Начать снова",
    clearSearch: "Очистить поиск",
    searchTitle: "Результаты поиска",
    browseCollection: "Смотреть коллекцию",
    searchResults: "Товаров: {count}",
    authGeneric: "Что-то пошло не так.",
    offline: "Нет интернета. Показаны сохраненные товары.",
    backOnline: "Соединение восстановлено.",
    requestTimeout: "Сервер отвечает слишком долго. Попробуйте еще раз.",
  },
};

const TEXT_BINDINGS = [
  ["#support-fab", "helpSupport", "aria-label"],
  [".filter-btn", "filter", "aria-label"],
  ["[data-back]", "back", "aria-label"],
  ["[data-nav='wishlist']", "wishlist", "aria-label"],
  ["[data-nav='cart']", "cart", "aria-label"],
  ["#detail-fav", "addWishlist", "aria-label"],
  [".hero-slide:nth-child(1) .hero-eyebrow", "newCollection"],
  [".hero-slide:nth-child(1) .hero-title", "springSummer"],
  [".hero-slide:nth-child(2) .hero-eyebrow", "editorPick"],
  [".hero-slide:nth-child(2) .hero-title", "sportEdit"],
  [".hero-slide:nth-child(3) .hero-eyebrow", "justIn"],
  [".hero-slide:nth-child(3) .hero-title", "floralEssentials"],
  [".hero-cta", "shopNow"],
  ["#home-kicker", "homeKicker"],
  ["#home-headline", "homeHeadline"],
  ["#home-subtitle", "homeSubtitle"],
  [".hero-primary", "shopCollection"],
  [".hero-secondary", "discover"],
  ["#curated-kicker", "selectedForYou"],
  ["#curated-title", "milanaEdit"],
  [".home-section-head .view-all", "shopAll"],
  ["#discover-kicker", "quickDiscovery"],
  ["#discover-title", "nextFavorite"],
  ["#discover-caption", "swipeSaveSkip"],
  ["#discover-page-kicker", "selectedForYou"],
  ["#discover-page-title", "discover"],
  ["#discover-intro", "discoverIntro"],
  ["#discover-hint", "discoverHint"],
  ["[data-discover-action='skip']", "skip", "aria-label"],
  ["[data-discover-action='save']", "save", "aria-label"],
  ["[data-discover-action='view']", "viewProduct", "aria-label"],
  ["#home-search-title", "searchTitle"],
  ["#home-search-clear", "clearSearch"],
  ["#home-categories-title", "shopByCategory"],
  ["#home-categories-all", "viewAll"],
  ["#home-brands-title", "brands"],
  ["#home-brands-all", "viewAll"],
  [".cat-card[data-cat='Men'] span", "catMen"],
  [".cat-card[data-cat='Women'] span", "catWomen"],
  [".cat-card[data-cat='Kids'] span", "catKids"],
  [".cat-card[data-cat='Family set'] span", "catFamily"],
  [".tab[data-tab='All']", "all"],
  [".tab[data-tab='Pajamas']", "pajamas"],
  [".tab[data-tab='Robes']", "robes"],
  [".tab[data-tab='Homewear']", "homewear"],
  [".tab[data-tab='Loungewear']", "loungewear"],
  ["#btn-filter", "filter"],
  ["#detail-name", "product"],
  ["#btn-add-cart", "addToCart"],
  ["#screen-cart h1", "myCart"],
  [".summary-title", "orderSummary"],
  [".summary-line span:first-child", "subtotal"],
  [".summary-total span:first-child", "total"],
  ["#btn-checkout", "checkout"],
  ["#cart-empty h3", "cartEmptyTitle"],
  ["#cart-empty p", "cartEmptyText"],
  ["#cart-empty .primary-btn", "startShopping"],
  ["#screen-wishlist h1", "savedItems"],
  ["#wishlist-empty h3", "wishlistEmptyTitle"],
  ["#wishlist-empty p", "wishlistEmptyText"],
  ["#wishlist-empty .primary-btn", "exploreProducts"],
  ["#screen-profile h1", "profile"],
  [".profile-card h3", "milanaGuest"],
  [".profile-card p", "guestEmail"],
  ["#account-section h3", "account"],
  ["#account-section .account-row:nth-child(2) span", "status"],
  ["#account-section .account-row:nth-child(3) span", "name"],
  ["#account-section .account-row:nth-child(4) span", "email"],
  ["#account-section .account-row:nth-child(5) span", "phone"],
  ["[data-auth-tab='signin']", "signIn"],
  ["[data-auth-tab='signup']", "create"],
  ["[data-auth-tab='recover']", "forgotKey"],
  ["#btn-google-auth [data-google-label]", "googleContinue"],
  ["#auth-signin label:nth-of-type(1)", "email"],
  ["#auth-signin label:nth-of-type(2)", "password"],
  ["#auth-signin .auth-submit", "signIn"],
  ["#auth-signup label:nth-of-type(1)", "name"],
  ["#auth-signup label:nth-of-type(2)", "phone"],
  ["#auth-signup label:nth-of-type(3)", "email"],
  ["#auth-signup .auth-code-row label", "emailCode"],
  ["[data-auth-signup-email-otp-send]", "sendCode"],
  ["#auth-signup label:nth-of-type(4)", "password"],
  ["#auth-signup label:nth-of-type(5)", "cityRegion"],
  ["#auth-signup label:nth-of-type(6)", "deliveryAddress"],
  [".auth-check span", "terms"],
  ["#auth-signup .auth-submit", "createAccount"],
  ["#auth-recover label:nth-of-type(1)", "email"],
  ["#auth-recover .auth-code-row label", "emailCode"],
  ["[data-auth-email-otp-send]", "sendCode"],
  ["#auth-recover label:nth-of-type(2)", "newPassword"],
  ["#auth-recover .auth-submit", "resetKey"],
  ["#btn-logout", "logOut"],
  ["#btn-my-orders", "myOrders"],
  [".menu-list .menu-item[data-nav='wishlist']", "wishlist"],
  [".menu-list .menu-item:nth-child(3)", "paymentMethods"],
  [".menu-list .menu-item:nth-child(4)", "deliveryAddress"],
  [".menu-list .menu-item:nth-child(5)", "helpSupport"],
  [".menu-list .menu-item[data-nav='settings']", "settings"],
  ["#screen-settings h1", "settings"],
  [".settings-section:nth-of-type(1) h3", "account"],
  [".settings-section:nth-of-type(1) .menu-item[data-nav='profile']", "loginProfile"],
  ["#btn-settings-orders", "orders"],
  [".settings-section:nth-of-type(2) h3", "language"],
  ["[data-lang='uz']", "uzbek"],
  ["[data-lang='ru']", "russian"],
  ["[data-lang='en']", "english"],
  [".settings-section:nth-of-type(3) h3", "shopping"],
  [".settings-section:nth-of-type(3) .settings-row:nth-child(2) span", "wholesaleQop"],
  [".settings-section:nth-of-type(3) .settings-row:nth-child(2) strong", "qopSize"],
  [".settings-section:nth-of-type(3) .settings-row:nth-child(3) span", "qadoq"],
  [".settings-section:nth-of-type(3) .settings-row:nth-child(3) strong", "qadoqSize"],
  [".settings-section:nth-of-type(3) .menu-item[data-nav='wishlist']", "wishlist"],
  [".settings-section:nth-of-type(4) h3", "support"],
  [".settings-section:nth-of-type(4) .settings-row:nth-child(2) span", "appSource"],
  [".settings-section:nth-of-type(4) .settings-row:nth-child(3) span", "adminPanel"],
  [".settings-section:nth-of-type(4) .settings-row:nth-child(3) strong", "websiteOnly"],
  [".nav-item[data-nav='home'] span", "home"],
  [".nav-item[data-nav='categories'] span", "shop"],
  [".nav-item[data-nav='discover'] span", "discover"],
  [".nav-item[data-nav='wishlist'] span", "savedItems"],
  [".nav-item[data-nav='cart'] > span:last-child", "cart"],
  [".nav-item[data-nav='profile'] span", "account"],
  ["#sort-sheet .sheet-title", "sortBy"],
  ["[data-sort='featured']", "featured"],
  ["[data-sort='price-asc']", "priceAsc"],
  ["[data-sort='price-desc']", "priceDesc"],
  ["[data-sort='rating']", "topRated"],
  ["#filter-sheet .sheet-title", "filter"],
  ["#btn-filter-reset", "reset"],
  ["#filter-sheet .f-label:nth-of-type(1)", "price"],
  ["[data-price='under90']", "under90"],
  ["[data-price='90-130']", "price90To130"],
  ["[data-price='over130']", "over130"],
  ["#filter-sheet .f-label:nth-of-type(2)", "color"],
  ["[data-fcolor='Beige']", "beige"],
  ["[data-fcolor='White']", "white"],
  ["[data-fcolor='Black']", "black"],
  ["[data-fcolor='Navy']", "navy"],
  ["#filter-sheet .f-label:nth-of-type(3)", "size"],
  ["#btn-filter-apply", "showResults"],
  ["#detail-description-title", "description"],
  ["#detail-suggested-title", "suggestedItems"],
  [".checkout-head h2", "orderDetails"],
  [".checkout-head span", "managerConfirm"],
  [".checkout-note", "checkoutNote"],
  [".checkout-grid label:nth-child(1)", "receiverName"],
  [".checkout-grid label:nth-child(2)", "phoneNumber"],
  [".checkout-grid label:nth-child(3)", "cityRegion"],
  [".checkout-grid label:nth-child(4)", "postCode"],
  [".checkout-card > label:nth-of-type(1)", "deliveryAddress"],
  [".checkout-card > label:nth-of-type(2)", "deliveryNote"],
  ["#btn-checkout-cancel", "cancel"],
  [".checkout-submit", "sendOrder"],
  [".success-card h2", "orderPlaced"],
  [".success-card p", "successThanks"],
  ["#btn-success-done", "continueShopping"],
  ["#payment-sheet .sheet-title", "paymentMethods"],
  ["#payment-sheet .sheet-copy", "paymentIntro"],
  ["#payment-sheet .info-list div:nth-child(1) span", "confirmation"],
  ["#payment-sheet .info-list div:nth-child(1) strong", "managerCall"],
  ["#payment-sheet .info-list div:nth-child(2) span", "currency"],
  ["#payment-sheet .info-list div:nth-child(3) span", "status"],
  ["#payment-sheet .info-list div:nth-child(3) strong", "available"],
  ["#payment-sheet .primary-btn", "contactManager"],
  ["#delivery-sheet .sheet-title", "deliveryAddress"],
  ["#delivery-sheet .sheet-copy", "deliveryIntro"],
  ["#delivery-form label:nth-child(1)", "cityRegion"],
  ["#delivery-form label:nth-child(2)", "deliveryAddress"],
  ["#delivery-form label:nth-child(3)", "phoneNumber"],
  ["#delivery-form .primary-btn", "saveAddress"],
  ["#support-sheet .sheet-title", "helpSupport"],
  ["#support-sheet .sheet-copy", "supportIntro"],
  ["[data-assistant-tab='ai']", "aiAssistant"],
  ["[data-assistant-tab='human']", "humanAssistant"],
  ["#ai-reply", "aiIntro"],
  ["#btn-ai-ask", "ask"],
  ["#human-support-panel label", "humanMessage"],
  ["#human-support-panel .primary-btn", "sendManager"],
];

const PLACEHOLDER_BINDINGS = [
  ["#search-input", "searchPlaceholder"],
  ["#listing-search-input", "searchPlaceholder"],
  ["#auth-signin input[name='password']", "phPassword"],
  ["#auth-signup input[name='name']", "phName"],
  ["#auth-signup input[name='password']", "phPassword"],
  ["#auth-signup input[name='city']", "phCity"],
  ["#auth-signup input[name='address']", "phAddress"],
  ["#auth-recover input[name='password']", "phPassword"],
  ["#checkout-form input[name='name']", "phReceiver"],
  ["#checkout-form input[name='city']", "phCity"],
  ["#checkout-form input[name='post_code']", "phPost"],
  ["#checkout-form input[name='address']", "phAddress"],
  ["#checkout-form textarea[name='comment']", "phNote"],
  ["#delivery-form input[name='city']", "phCity"],
  ["#delivery-form input[name='address']", "phAddress"],
  ["#ai-question", "aiPlaceholder"],
  ["#human-support-panel textarea[name='message']", "humanPlaceholder"],
];

const CATEGORY_LABEL_KEYS = {
  Men: "catMen",
  Women: "catWomen",
  Kids: "catKids",
  "Family set": "catFamily",
};

let currentLang = LANGUAGES.includes(store.load("lang", "en")) ? store.load("lang", "en") : "en";
let currentListingCategory = "Women";
let searchQuery = "";

function t(key, vars = {}) {
  const template = I18N[currentLang]?.[key] ?? I18N.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}

function setFirstTextNode(el, text) {
  if (!el) return;
  const node = [...el.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
  if (node) node.textContent = text;
  else el.textContent = text;
}

function setBoundText(selector, key, attr) {
  document.querySelectorAll(selector).forEach((el) => {
    if (attr) el.setAttribute(attr, t(key));
    else setFirstTextNode(el, t(key));
  });
}

function categoryLabel(category) {
  if (!category) return t("categories");
  return t(CATEGORY_LABEL_KEYS[category] || "catWomen");
}

function setSearchQuery(value, { focusResults = false } = {}) {
  searchQuery = String(value || "");
  const homeInput = byId("search-input");
  const listingInput = byId("listing-search-input");
  if (homeInput && homeInput.value !== searchQuery) homeInput.value = searchQuery;
  if (listingInput && listingInput.value !== searchQuery) listingInput.value = searchQuery;
  if (focusResults && listingInput) {
    requestAnimationFrame(() => {
      listingInput.focus({ preventScroll: true });
      const end = listingInput.value.length;
      listingInput.setSelectionRange?.(end, end);
    });
  }
}

function clearSearch({ focus = false } = {}) {
  setSearchQuery("", { focusResults: focus });
  renderHomeSearch();
  renderGrid();
}

function setLanguage(lang) {
  if (!LANGUAGES.includes(lang)) return;
  currentLang = lang;
  store.save("lang", lang);
  applyTranslations();
  renderProfile(authCustomer || profileFromStore());
  renderBestSellers();
  renderHomeSearch();
  if (!byId("screen-categories").hidden) renderGrid();
  if (!byId("screen-cart").hidden) renderCart();
  if (!byId("screen-wishlist").hidden) renderWishlist();
  if (!byId("screen-discover").hidden) renderDiscover();
  if (!byId("screen-detail").hidden && currentProduct) renderDetailProduct(currentProduct, { resetGallery: false });
  toast(t("language"));
}

function applyTranslations() {
  document.documentElement.lang = currentLang;
  TEXT_BINDINGS.forEach(([selector, key, attr]) => setBoundText(selector, key, attr));
  PLACEHOLDER_BINDINGS.forEach(([selector, key]) => {
    document.querySelectorAll(selector).forEach((el) => { el.placeholder = t(key); });
  });
  document.querySelectorAll(".opt-label").forEach((el, idx) => {
    const value = el.querySelector(".opt-value");
    el.firstChild.textContent = `${t(idx === 0 ? "color" : "quantityType")} `;
    if (value && !el.contains(value)) el.appendChild(value);
  });
  byId("listing-title").textContent = categoryLabel(currentListingCategory);
  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });
  const networkLabel = byId("network-banner-text");
  if (networkLabel) networkLabel.textContent = t("offline");
  updateFilterUI();
}

class ApiError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken && !headers.authorization) headers.authorization = `Bearer ${authToken}`;
  if (!headers.accept) headers.accept = "application/json";
  const method = String(options.method || "GET").toUpperCase();
  const retries = method === "GET" ? 1 : 0;
  const init = { ...options, method, headers, credentials: "include" };
  if (init.body && typeof init.body !== "string") {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(init.body);
  }
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), options.timeout || API_TIMEOUT_MS);
    try {
      const res = await fetch(API_BASE + path, { ...init, signal: controller.signal });
      const text = await res.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; }
      catch { throw new ApiError("invalid_server_response", res.status); }
      if (!res.ok) throw new ApiError(body.error || `api_${res.status}`, res.status);
      return body;
    } catch (error) {
      const isTimeout = error?.name === "AbortError" || controller.signal.aborted;
      const normalized = error instanceof ApiError
        ? error
        : new ApiError(isTimeout ? "request_timeout" : (navigator.onLine === false ? "offline" : "network"));
      if (attempt < retries && (!normalized.status || normalized.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        continue;
      }
      throw normalized;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ApiError("network");
}

let firebaseAuth = null;
let firebaseGoogleProvider = null;
let firebaseAuthMod = null;
let googleAuthReady = false;

function isNativeAppShell() {
  return IS_NATIVE;
}

function setGoogleButtonState({ hidden = false, disabled = false } = {}) {
  const button = byId("btn-google-auth");
  if (!button) return;
  button.hidden = hidden;
  button.disabled = disabled;
}

async function initFirebaseAuth(config) {
  if (!config || firebaseAuth) return Boolean(firebaseAuth);
  try {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const authMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const app = appMod.initializeApp(config);
    firebaseAuth = authMod.getAuth(app);
    firebaseGoogleProvider = new authMod.GoogleAuthProvider();
    firebaseGoogleProvider.setCustomParameters({ prompt: "select_account" });
    firebaseAuthMod = authMod;
    googleAuthReady = true;
    setGoogleButtonState({ hidden: false });
    return true;
  } catch {
    googleAuthReady = false;
    return false;
  }
}

async function loadAuthConfig() {
  try {
    const config = await api("/api/auth/config");
    if (IS_NATIVE) {
      googleAuthReady = Boolean(config.firebase);
      setGoogleButtonState({ hidden: !googleAuthReady });
      return;
    }
    const ready = await initFirebaseAuth(config.firebase);
    if (ready) await completeGoogleRedirectSignIn();
  } catch {}
}

async function completeGoogleRedirectSignIn() {
  if (!firebaseAuth || !firebaseAuthMod) return;
  try {
    const redirectResult = await firebaseAuthMod.getRedirectResult(firebaseAuth);
    if (!redirectResult?.user) return;
    const idToken = await redirectResult.user.getIdToken();
    const result = await api("/api/auth/firebase", { method: "POST", body: { idToken } });
    rememberAuth(result);
    toast(t("signedInToast"));
  } catch (err) {
    const code = String(err?.code || err?.message || "").replace(/^auth\//, "");
    toast(authErrorMessage(code));
  }
}

async function signInWithGoogle() {
  if (!googleAuthReady) {
    toast(authErrorMessage("firebase_not_configured"));
    return;
  }
  if (!IS_NATIVE && (!firebaseAuth || !firebaseGoogleProvider || !firebaseAuthMod)) {
    toast(authErrorMessage("firebase_not_configured"));
    return;
  }
  const button = byId("btn-google-auth");
  if (button) button.disabled = true;
  try {
    if (isNativeAppShell()) {
      const nativeFirebase = window.Capacitor?.Plugins?.FirebaseAuthentication;
      if (!nativeFirebase?.signInWithGoogle) throw new Error("firebase_not_configured");
      const nativeResult = await nativeFirebase.signInWithGoogle();
      const idToken = nativeResult?.credential?.idToken;
      if (!idToken) throw new Error("firebase_not_configured");
      const result = await api("/api/auth/firebase", { method: "POST", body: { idToken } });
      rememberAuth(result);
      toast(t("signedInToast"));
      return;
    }
    const cred = await firebaseAuthMod.signInWithPopup(firebaseAuth, firebaseGoogleProvider);
    const idToken = await cred.user.getIdToken();
    const result = await api("/api/auth/firebase", { method: "POST", body: { idToken } });
    rememberAuth(result);
    toast(t("signedInToast"));
  } catch (err) {
    const code = String(err?.code || err?.message || "").replace(/^auth\//, "");
    const shouldRedirect = [
      "popup-blocked",
      "popup-closed-by-user",
      "operation-not-supported-in-this-environment",
      "cancelled-popup-request",
    ].includes(code);
    if (shouldRedirect) {
      try {
        await firebaseAuthMod.signInWithRedirect(firebaseAuth, firebaseGoogleProvider);
        return;
      } catch (redirectErr) {
        const redirectCode = String(redirectErr?.code || redirectErr?.message || "").replace(/^auth\//, "");
        toast(authErrorMessage(redirectCode));
      }
    } else {
      toast(authErrorMessage(code));
    }
  } finally {
    if (button) button.disabled = false;
  }
}

function rememberAuth(data) {
  if (data?.session_token) {
    authToken = data.session_token;
    if (!IS_NATIVE) store.save("authToken", data.session_token);
  }
  if (data?.customer) {
    authCustomer = data.customer;
    store.save("customer", data.customer);
    store.save("profile", data.customer);
  }
  renderProfile(authCustomer || profileFromStore());
}

function forgetAuth() {
  authCustomer = null;
  authToken = "";
  store.remove("authToken");
  store.remove("customer");
  renderProfile(profileFromStore());
}

function customerDisplayName(customer) {
  return customer?.name || customer?.email || t("milanaGuest");
}

function setAuthMessage(mode, message, good = false) {
  const el = document.querySelector(`[data-auth-message="${mode}"]`);
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
  el.classList.toggle("good", Boolean(good));
}

function authFormData(form) {
  return Object.fromEntries(new FormData(form));
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ""));
}

function authErrorMessage(code) {
  const map = {
    email: t("authEmail"),
    password: t("authPassword"),
    phone: t("authPhone"),
    name: t("authName"),
    otp: t("authOtp"),
    otp_wrong: t("authOtpWrong"),
    otp_expired: t("authOtpExpired"),
    phone_not_verified: t("authPhoneNotVerified"),
    email_not_verified: t("authEmailNotVerified"),
    firebase_not_configured: t("authFirebaseNotConfigured"),
    email_exists: t("authEmailExists"),
    wrong_credentials: t("authWrongCredentials"),
    recovery_mismatch: t("authRecoveryMismatch"),
    email_not_configured: t("authEmailNotConfigured"),
    email_failed: t("authEmailFailed"),
    sms_not_configured: t("authSmsNotConfigured"),
    sms_failed: t("authSmsFailed"),
    rate_limited: t("authRateLimited"),
    terms: t("authTerms"),
    offline: t("offline"),
    network: t("offline"),
    request_timeout: t("requestTimeout"),
  };
  return map[code] || code || t("authGeneric");
}

function switchAuthTab(mode) {
  if (!["signin", "signup", "recover"].includes(mode)) mode = "signin";
  document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.authTab === mode);
  });
  document.querySelectorAll("[data-auth-form]").forEach((form) => {
    form.classList.toggle("active", form.dataset.authForm === mode);
  });
  document.querySelectorAll("[data-auth-message]").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("good");
  });
}

function startAuthCooldown(button, seconds = 30) {
  if (!button) return;
  const original = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = original;
  let left = seconds;
  button.disabled = true;
  const tick = () => {
    if (left <= 0) {
      button.disabled = false;
      button.textContent = original;
      return;
    }
    button.textContent = `${left}s`;
    left -= 1;
    setTimeout(tick, 1000);
  };
  tick();
}

function normalizeProduct(p) {
  const images = Array.isArray(p.images) ? p.images : [];
  const normalizedImages = images.map(absoluteUrl).filter(Boolean);
  const firstPhoto = normalizedImages.find((src) => !isVideoUrl(src)) || "";
  const img = absoluteUrl(p.img || p.image || firstPhoto || "");
  const descSource = p.desc || p.description || p.details || "";
  const descriptions = typeof descSource === "object" && descSource ? descSource : {};
  const description = descriptions[currentLang] || descriptions.en || descriptions.ru || descriptions.uz || String(descSource || "");
  const colors = Array.isArray(p.colors) && p.colors.length
    ? p.colors.map((color) => typeof color === "string" ? { name: color, hex: "#C9AE93" } : color)
    : [{ name: "Default", hex: "#C9AE93" }];
  const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["One Size"];
  const rawCategory = String(p.category || p.rawCategory || "").toLowerCase();
  return {
    id: String(p.id || p.slug || ""),
    name: p.name || t("product"),
    price: Number(p.retail_price || p.price) || 0,
    description,
    descriptions,
    img,
    detailImg: absoluteUrl(p.detailImg || p.detail_image || firstPhoto || img),
    images: normalizedImages.length ? normalizedImages : [img].filter(Boolean),
    gender: String(p.gender || p.gender_category || "").toLowerCase(),
    category: CATEGORY_MAP[rawCategory] || p.category || "Pajamas",
    rating: Number(p.rating) || 0,
    reviews: Number(p.reviews) || 0,
    colors,
    sizes,
    defaultColor: p.defaultColor || colors[0]?.name || "",
    defaultSize: p.defaultSize || sizes[0] || "",
  };
}

const CATALOG_PAGE_SIZE = 60;
let catalogOffset = 0;
let catalogHasMore = true;
let catalogPageLoading = false;
let searchTimer = null;
let searchSequence = 0;

function mergeProducts(products) {
  const merged = new Map(PRODUCTS.map((product) => [product.id, product]));
  products.forEach((product) => merged.set(product.id, product));
  PRODUCTS = [...merged.values()];
}

async function loadPendingProduct() {
  if (!pendingProductId || find(pendingProductId)) return;
  try {
    const product = normalizeProduct(await api(`/api/products/${encodeURIComponent(pendingProductId)}`));
    if (!product.id) return;
    mergeProducts([product]);
    store.save("products", PRODUCTS);
    openDetail(product.id, { push: false, history: false });
    pendingProductId = null;
  } catch {}
}

async function hydrateReferencedProducts(ids) {
  const missingIds = [...new Set((ids || []).map(String))]
    .filter((id) => id && !find(id))
    .slice(0, 50);
  if (!missingIds.length) return;

  const results = await Promise.allSettled(
    missingIds.map((id) => api(`/api/products/${encodeURIComponent(id)}`)),
  );
  const hydrated = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => normalizeProduct(result.value))
    .filter((product) => product.id);
  if (!hydrated.length) return;

  mergeProducts(hydrated);
  store.save("products", PRODUCTS);
  renderBestSellers();
  if (!byId("screen-cart").hidden) renderCart();
  if (!byId("screen-wishlist").hidden) renderWishlist();
  if (!byId("screen-discover").hidden) renderDiscover();
}

async function loadProductsFromApi({ append = false } = {}) {
  if (catalogPageLoading || (append && !catalogHasMore)) return;
  catalogPageLoading = true;
  if (!append) catalogOffset = 0;
  productsLoading = PRODUCTS.length === 0;
  productsError = "";
  renderBestSellers();
  renderHomeSearch();
  if (!byId("screen-discover").hidden) renderDiscover();
  if (!byId("screen-categories").hidden) renderGrid();
  try {
    const query = new URLSearchParams({ limit: String(CATALOG_PAGE_SIZE), offset: String(catalogOffset) });
    const products = await api(`/api/products?${query}`);
    if (Array.isArray(products)) {
      const page = products.map(normalizeProduct).filter((p) => p.id);
      if (append) mergeProducts(page);
      else PRODUCTS = page;
      catalogOffset += page.length;
      catalogHasMore = page.length === CATALOG_PAGE_SIZE;
      store.save("products", PRODUCTS);
      store.save("productsCachedAt", Date.now());
      productsLoading = false;
      productsError = "";
      renderBestSellers();
      renderHomeSearch();
      updateBadge();
      if (pendingProductId && find(pendingProductId)) {
        openDetail(pendingProductId, { push: false, history: false });
        pendingProductId = null;
      } else if (!byId("screen-detail").hidden && currentProduct) {
        refreshOpenDetailFromProducts();
      }
      if (pendingProductId) loadPendingProduct();
      hydrateReferencedProducts([...cart.map((line) => line.id), ...wishlist]);
      if (!byId("screen-categories").hidden) renderGrid();
      if (!byId("screen-cart").hidden) renderCart();
      if (!byId("screen-wishlist").hidden) renderWishlist();
      if (!byId("screen-discover").hidden) renderDiscover();
    }
  } catch (err) {
    productsLoading = false;
    productsError = err.message || "network";
    renderBestSellers();
    renderHomeSearch();
    if (!byId("screen-categories").hidden) renderGrid();
    if (!byId("screen-cart").hidden) renderCart();
    if (!byId("screen-wishlist").hidden) renderWishlist();
    if (!byId("screen-discover").hidden) renderDiscover();
  } finally {
    catalogPageLoading = false;
    if (!byId("screen-categories").hidden) renderGrid();
  }
}

async function searchProductsRemotely(query) {
  const value = String(query || "").trim();
  if (value.length < 2 || navigator.onLine === false) return;
  const sequence = ++searchSequence;
  try {
    const params = new URLSearchParams({ q: value, limit: "30" });
    const products = await api(`/api/products?${params}`);
    if (sequence !== searchSequence || !Array.isArray(products)) return;
    mergeProducts(products.map(normalizeProduct).filter((product) => product.id));
    store.save("products", PRODUCTS);
    renderHomeSearch();
  } catch {}
}

function scheduleRemoteSearch(query) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchProductsRemotely(query), 350);
}

function profileFromStore() {
  return store.load("customer", null) || store.load("profile", {
    name: t("milanaGuest"),
    email: t("guestEmail"),
    phone: "",
    address: "",
  });
}

function saveProfile(profile) {
  store.save("profile", profile);
  if (authCustomer) {
    authCustomer = { ...authCustomer, ...profile };
    store.save("customer", authCustomer);
  }
  renderProfile(profile);
}

function renderProfile(profile, orderCount = null) {
  const card = document.querySelector(".profile-card");
  if (!card) return;
  const customer = authCustomer || profile || {};
  card.querySelector("h3").textContent = customerDisplayName(customer);
  card.querySelector("p").textContent = authCustomer ? (customer.email || customer.phone || t("signedIn")) : t("signInPrompt");
  const accountStatus = byId("account-status");
  const accountName = byId("account-name");
  const accountEmail = byId("account-email");
  const accountPhone = byId("account-phone");
  if (accountStatus) accountStatus.textContent = authCustomer ? t("signedIn") : t("guestMode");
  if (accountName) accountName.textContent = customerDisplayName(customer);
  if (accountEmail) accountEmail.textContent = customer.email || t("guestEmail");
  if (accountPhone) accountPhone.textContent = customer.phone || "-";
  const authPanel = byId("auth-panel");
  if (authPanel) authPanel.hidden = Boolean(authCustomer);
  const logout = byId("btn-logout");
  if (logout) logout.hidden = !authCustomer;
  const orders = byId("btn-my-orders");
  if (orders && orderCount !== null) {
    orders.querySelector(".chev").textContent = orderCount ? `${orderCount}` : "›";
  }
}

async function loadProfileFromApi() {
  renderProfile(profileFromStore());
  try {
    const data = await api("/api/auth/me");
    if (data.customer) rememberAuth(data);
    else authCustomer = null;
    let orderCount = null;
    if (authCustomer) {
      const orderData = await api("/api/auth/orders").catch(() => ({ orders: [] }));
      orderCount = Array.isArray(orderData.orders) ? orderData.orders.length : 0;
    }
    renderProfile(authCustomer || profileFromStore(), orderCount);
  } catch {}
}

async function syncWishlistToApi() {
  try {
    await api("/api/wishlist", { method: "PUT", body: { ids: wishlist } });
  } catch {}
}

async function loadWishlistFromApi() {
  try {
    const data = await api("/api/wishlist");
    const ids = Array.isArray(data.ids) ? data.ids.map(String) : [];
    if (!ids.length) return;
    wishlist = [...new Set([...wishlist, ...ids])];
    store.save("wishlist", wishlist);
    hydrateReferencedProducts(wishlist);
    renderBestSellers();
    if (!byId("screen-categories").hidden) renderGrid();
    if (!byId("screen-wishlist").hidden) renderWishlist();
  } catch {}
}

let cart = store.load("cart", []);
let wishlist = store.load("wishlist", []);
let authCustomer = store.load("customer", null);

let pendingProductId = null;
let currentProduct = null;
let currentGallery = [];
let currentGalleryIndex = 0;
let galleryTouch = null;
let fullScreenTouch = null;
let suppressMediaOpenUntil = 0;
let detailSwipe = null;
let videoChromeTimer = null;
let videoHasAdvanced = false;
let sheetSwipe = null;
let selColor = null;
let selSize = null;
let selUnit = "qop";
let activeTab = "All";
let navStack = ["home"];
let routeDepth = 0;
let isApplyingHistory = false;
let sortMode = "featured";
let filt = { price: null, colors: new Set(), sizes: new Set() };
let productsLoading = true;
let productsError = "";
let discoverIndex = Number(store.load("discoverIndex", 0)) || 0;
let discoverPointer = null;

const cachedProducts = store.load("products", []);
if (Array.isArray(cachedProducts) && cachedProducts.length) {
  PRODUCTS = cachedProducts;
  productsLoading = false;
}

/* ---------- navigation ---------- */
const SCREENS = ["home", "categories", "discover", "detail", "cart", "wishlist", "profile", "settings"];
const NAV_TABS = ["home", "categories", "discover", "wishlist", "cart"];

function routeUrl(name, productId = null) {
  const url = new URL(location.href);
  if (name === "home") url.searchParams.delete("screen");
  else url.searchParams.set("screen", name);
  if (name === "detail" && productId) url.searchParams.set("product", productId);
  else url.searchParams.delete("product");
  url.searchParams.delete("t");
  return `${url.pathname}${url.search}${url.hash}`;
}

function currentRouteState(name) {
  return { screen: name, productId: name === "detail" ? currentProduct?.id || null : null };
}

function syncRouteHistory(name, replace = false) {
  if (isApplyingHistory || !window.history?.pushState) return;
  const state = currentRouteState(name);
  const url = routeUrl(state.screen, state.productId);
  if (replace) history.replaceState(state, "", url);
  else {
    history.pushState(state, "", url);
    routeDepth += 1;
  }
}

function hideBlockingLayers() {
  if (!byId("checkout-overlay").hidden) {
    closeCheckoutForm();
    return true;
  }
  if (!byId("success-overlay").hidden) {
    byId("success-overlay").hidden = true;
    return true;
  }
  if (byId("sheet-backdrop").classList.contains("open")) {
    closeSheets();
    return true;
  }
  return false;
}

function show(name, { push = true, history = true, replaceHistory = false } = {}) {
  const shouldPushRoute = push && navStack[navStack.length - 1] !== name;
  byId("app").scrollTop = 0;
  SCREENS.forEach((s) => { byId("screen-" + s).hidden = s !== name; });
  byId("app").dataset.screen = name;
  if (shouldPushRoute) navStack.push(name);
  if (history && (replaceHistory || shouldPushRoute)) syncRouteHistory(name, replaceHistory);
  document.querySelectorAll(".nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.nav === name);
  });
  if (name === "cart") renderCart();
  if (name === "wishlist") renderWishlist();
  if (name === "categories") {
    renderGrid();
    requestAnimationFrame(syncListingChrome);
  }
  if (name === "discover") renderDiscover();
}

function goBack() {
  if (hideBlockingLayers()) return;
  if (routeDepth > 0) {
    history.back();
    return;
  }
  if (navStack.length > 1) {
    navStack.pop();
    show(navStack[navStack.length - 1] || "home", { push: false, history: false });
    return;
  }
  if (byId("app").dataset.screen !== "home") show("home", { push: false, history: false });
}

window.addEventListener("popstate", (event) => {
  if (hideBlockingLayers()) {
    syncRouteHistory(byId("app").dataset.screen || "home");
    return;
  }
  routeDepth = Math.max(0, routeDepth - 1);
  const state = event.state || {};
  const screen = SCREENS.includes(state.screen) ? state.screen : "home";
  if (screen === "detail" && state.productId) {
    const product = find(state.productId);
    if (product) currentProduct = product;
  }
  if (navStack.length > 1) navStack.pop();
  isApplyingHistory = true;
  if (screen === "detail" && state.productId && find(state.productId)) openDetail(state.productId, { history: false, push: false });
  else show(screen, { push: false, history: false });
  isApplyingHistory = false;
});

function setupNativeBackButton() {
  const nativeApp = window.Capacitor?.Plugins?.App;
  nativeApp?.addListener?.("backButton", () => {
    if (hideBlockingLayers()) return;
    if (routeDepth > 0 || navStack.length > 1 || byId("app").dataset.screen !== "home") {
      goBack();
    }
  });
  nativeApp?.addListener?.("appStateChange", ({ isActive }) => {
    document.querySelectorAll("video").forEach((video) => {
      if (!isActive) video.pause();
      else if (!video.hidden && (video.autoplay || video.id === "detail-video")) video.play().catch(() => {});
    });
  });
}

let networkConnected = navigator.onLine !== false;

function setNetworkState(connected, { announce = false } = {}) {
  const wasConnected = networkConnected;
  networkConnected = connected !== false;
  const banner = byId("network-banner");
  const label = byId("network-banner-text");
  if (banner) banner.hidden = networkConnected;
  if (label) label.textContent = t("offline");
  document.documentElement.classList.toggle("is-offline", !networkConnected);
  if (announce && networkConnected && !wasConnected) toast(t("backOnline"));
}

async function setupNetworkMonitoring() {
  const nativeNetwork = window.Capacitor?.Plugins?.Network;
  if (nativeNetwork?.getStatus) {
    try {
      const status = await nativeNetwork.getStatus();
      setNetworkState(status.connected);
      nativeNetwork.addListener?.("networkStatusChange", (next) => {
        setNetworkState(next.connected, { announce: true });
        if (next.connected && productsError) loadProductsFromApi();
      });
      return;
    } catch {}
  }
  window.addEventListener("offline", () => setNetworkState(false));
  window.addEventListener("online", () => {
    setNetworkState(true, { announce: true });
    if (productsError) loadProductsFromApi();
  });
  setNetworkState(navigator.onLine !== false);
}

/* ---------- product cards ---------- */
function cardHTML(p) {
  const fav = wishlist.includes(p.id);
  const id = escapeHtml(p.id);
  const name = escapeHtml(p.name);
  const image = escapeHtml(safeMediaUrl(p.img));
  return `
    <div class="product-card" data-id="${id}" role="button" tabindex="0">
      <div class="pc-img"><img src="${image}" alt="${name}" loading="lazy" decoding="async"></div>
      <div class="pc-info">
        <span class="pc-name">${name}</span>
        <span class="pc-price">${money(p.price)}</span>
        <button class="pc-fav ${fav ? "active" : ""}" data-fav="${id}" aria-label="${escapeHtml(t("toggleWishlist"))}">
          <svg viewBox="0 0 24 24"><path d="M19 14c1.5-1.4 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.1 3 5.5l7 7z"/></svg>
        </button>
      </div>
    </div>`;
}

function skeletonCards(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="product-card skeleton-card" aria-hidden="true">
      <div class="pc-img skeleton-block"></div>
      <div class="pc-info">
        <span class="skeleton-line wide"></span>
        <span class="skeleton-line"></span>
      </div>
    </div>
  `).join("");
}

function gridMessageHTML(message, action = "") {
  return `
    <div class="grid-message">
      <p>${escapeHtml(message)}</p>
      ${action ? `<button class="secondary-btn compact" data-retry-products>${escapeHtml(action)}</button>` : ""}
    </div>
  `;
}

function productMatchesListing(p) {
  const listing = String(currentListingCategory || "").toLowerCase();
  if (!listing) return true;
  if (listing === "women") return !p.gender || p.gender === "women";
  if (listing === "men") return p.gender === "men";
  if (listing === "kids") return p.gender === "kids" || p.gender === "children";
  if (listing === "family set") return p.gender === "family" || p.category === "Family set";
  return true;
}

function productMatchesSearch(p, query = searchQuery) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return [
    p.name,
    p.model,
    p.category,
    p.gender,
    p.tag,
    ...(p.colors || []).map((color) => color.name),
  ].some((value) => String(value || "").toLowerCase().includes(q));
}

function renderHomeSearch() {
  const panel = byId("home-search-results");
  if (!panel) return;
  const q = searchQuery.trim();
  panel.hidden = !q;
  if (!q) return;

  const grid = byId("home-search-grid");
  const summary = byId("home-search-summary");
  if (productsLoading && !PRODUCTS.length) {
    if (summary) summary.textContent = t("loadingProducts");
    if (grid) grid.innerHTML = skeletonCards(4);
    return;
  }

  const items = PRODUCTS.filter((p) => productMatchesSearch(p)).slice(0, 8);
  if (summary) summary.textContent = t("searchResults", { count: items.length });
  if (grid) {
    grid.innerHTML = items.map(cardHTML).join("") ||
      (productsError && !PRODUCTS.length
        ? gridMessageHTML(t("productLoadFailed"), t("retry"))
        : gridMessageHTML(t("noProducts")));
  }
}

const PRICE_BUCKETS = {
  "under90": (p) => p.price < 90,
  "90-130": (p) => p.price >= 90 && p.price <= 130,
  "over130": (p) => p.price > 130,
};

function renderGrid() {
  const q = searchQuery.trim().toLowerCase();
  if (productsLoading && !PRODUCTS.length) {
    byId("product-grid").innerHTML = skeletonCards(4);
    return;
  }
  let items = PRODUCTS.filter(productMatchesListing);
  items = items.filter((p) => activeTab === "All" || p.category === activeTab);
  if (q) items = items.filter((p) => productMatchesSearch(p, q));
  if (filt.price) items = items.filter(PRICE_BUCKETS[filt.price]);
  if (filt.colors.size) items = items.filter((p) => p.colors.some((c) => filt.colors.has(c.name)));
  if (filt.sizes.size) items = items.filter((p) => p.sizes.some((s) => filt.sizes.has(s)));
  if (sortMode === "price-asc") items = [...items].sort((a, b) => a.price - b.price);
  else if (sortMode === "price-desc") items = [...items].sort((a, b) => b.price - a.price);
  else if (sortMode === "rating") items = [...items].sort((a, b) => b.rating - a.rating);
  const loadMore = catalogHasMore
    ? `<button class="catalog-load-more" data-load-more-products ${catalogPageLoading ? "disabled" : ""}>${escapeHtml(catalogPageLoading ? t("loadingProducts") : t("viewAll"))}</button>`
    : "";
  byId("product-grid").innerHTML = (items.map(cardHTML).join("") + loadMore) ||
    (productsError && !PRODUCTS.length
      ? gridMessageHTML(t("productLoadFailed"), t("retry"))
      : gridMessageHTML(t("noProducts")));
}

function syncListingChrome() {
  const listingScroll = byId("listing-scroll");
  const categoriesScreen = byId("screen-categories");
  if (!listingScroll || !categoriesScreen) return;
  categoriesScreen.classList.toggle("listing-scrolled", listingScroll.scrollTop > 18);
  if (catalogHasMore && !catalogPageLoading && listingScroll.scrollHeight - listingScroll.scrollTop - listingScroll.clientHeight < 700) {
    loadProductsFromApi({ append: true });
  }
}

/* ---------- sort & filter sheets ---------- */
const SORT_LABELS = {
  "featured": "sort",
  "price-asc": "priceAsc",
  "price-desc": "priceDesc",
  "rating": "topRated",
};

function openSheet(id) {
  byId("sheet-backdrop").classList.add("open");
  document.querySelectorAll(".bottom-sheet.open").forEach((sheet) => {
    if (sheet.id !== id) sheet.classList.remove("open");
  });
  byId(id).classList.add("open");
}
function closeSheets() {
  byId("sheet-backdrop").classList.remove("open");
  document.querySelectorAll(".bottom-sheet.open").forEach((sheet) => sheet.classList.remove("open"));
}

function updateFilterUI() {
  const n = (filt.price ? 1 : 0) + filt.colors.size + filt.sizes.size;
  const count = byId("filter-count");
  count.hidden = n === 0;
  count.textContent = n;
  byId("btn-filter").classList.toggle("on", n > 0);
  byId("btn-sort").classList.toggle("on", sortMode !== "featured");
  byId("sort-label").textContent = t(SORT_LABELS[sortMode]);
}

function renderBestSellers() {
  if (productsLoading && !PRODUCTS.length) {
    byId("bestseller-row").innerHTML = skeletonCards(3);
    return;
  }
  if (productsError && !PRODUCTS.length) {
    byId("bestseller-row").innerHTML = `
      <div class="inline-message">
        <span>${t("productLoadFailed")}</span>
        <button class="secondary-btn compact" data-retry-products>${t("retry")}</button>
      </div>
    `;
    return;
  }
  byId("bestseller-row").innerHTML = [...PRODUCTS]
    .sort((a, b) => b.reviews - a.reviews)
    .slice(0, 8)
    .map(cardHTML)
    .join("");
}

function renderWishlist() {
  const items = PRODUCTS.filter((p) => wishlist.includes(p.id));
  byId("wishlist-grid").innerHTML = items.map(cardHTML).join("");
  byId("wishlist-empty").hidden = items.length > 0;
}

/* ---------- swipe discovery ---------- */
function discoverCardHTML(product, active = false) {
  const id = escapeHtml(product.id);
  const name = escapeHtml(product.name);
  const image = escapeHtml(safeMediaUrl(product.detailImg || product.img));
  const category = escapeHtml(String(product.category || t("product")).toUpperCase());
  return `
    <article class="discover-card ${active ? "active" : "behind"}" data-discover-id="${id}" ${active ? "data-discover-active" : "aria-hidden=\"true\""}>
      <img src="${image}" alt="${active ? name : ""}" decoding="async">
      <span class="discover-stamp save">${t("save").toUpperCase()}</span>
      <span class="discover-stamp skip">${t("skip").toUpperCase()}</span>
      <span class="discover-card-shade"></span>
      <div class="discover-card-copy">
        <small>${category}</small>
        <h2>${name}</h2>
        <div><b>${money(product.price)}</b><span>${escapeHtml(product.sizes.slice(0, 4).join(" · "))}</span></div>
      </div>
    </article>`;
}

function renderDiscover() {
  const deck = byId("discover-deck");
  const actions = byId("discover-actions");
  if (!deck) return;
  if (productsLoading && !PRODUCTS.length) {
    deck.innerHTML = `<div class="discover-empty"><span>${t("loadingProducts")}</span></div>`;
    if (actions) actions.hidden = true;
    return;
  }
  if (!PRODUCTS.length) {
    deck.innerHTML = `<div class="discover-empty"><span>${t("productLoadFailed")}</span></div>`;
    if (actions) actions.hidden = true;
    return;
  }
  if (discoverIndex >= PRODUCTS.length) {
    deck.innerHTML = `<button class="discover-empty" data-discover-restart><span><strong>${t("discoverEmpty")}</strong>${t("discoverRestart")}</span></button>`;
    if (actions) actions.hidden = true;
    return;
  }
  const current = PRODUCTS[discoverIndex];
  const next = PRODUCTS[discoverIndex + 1];
  deck.innerHTML = `${next ? discoverCardHTML(next) : ""}${discoverCardHTML(current, true)}`;
  if (actions) actions.hidden = false;
}

function saveDiscoveredProduct(id) {
  if (!wishlist.includes(id)) {
    wishlist.push(id);
    store.save("wishlist", wishlist);
    syncWishlistToApi();
    renderBestSellers();
    if (!byId("screen-wishlist").hidden) renderWishlist();
    toast(t("savedWishlist"));
  }
}

function advanceDiscover(direction) {
  const card = document.querySelector("[data-discover-active]");
  if (!card) return;
  const id = card.dataset.discoverId;
  if (direction === "right") saveDiscoveredProduct(id);
  card.classList.add(direction === "right" ? "exit-right" : "exit-left");
  window.setTimeout(() => {
    discoverIndex += 1;
    store.save("discoverIndex", discoverIndex);
    renderDiscover();
  }, 210);
}

function resetDiscoverCard(card) {
  if (!card) return;
  card.classList.remove("is-dragging");
  card.style.transform = "";
  card.querySelectorAll(".discover-stamp").forEach((stamp) => { stamp.style.opacity = ""; });
}

/* ---------- detail ---------- */
function productImages(product) {
  const raw = [
    product.detailImg,
    product.img,
    ...(Array.isArray(product.images) ? product.images : []),
  ].filter(Boolean);
  const media = [...new Map(raw.map((src) => [mediaKey(src), { src, type: mediaType(src) }])).values()];
  const firstImageIndex = media.findIndex((item) => item.type === "image");
  const firstVideoIndex = media.findIndex((item) => item.type === "video");

  // Keep the product gallery's lead photo, video, then remaining media order.
  if (firstImageIndex >= 0 && firstVideoIndex > firstImageIndex + 1) {
    const [video] = media.splice(firstVideoIndex, 1);
    media.splice(firstImageIndex + 1, 0, video);
  }

  return media;
}

function updateVideoProgress() {
  const video = byId("detail-video");
  const bar = byId("detail-video-progress")?.querySelector("span");
  if (!video || !bar) return;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const progress = duration > 0 ? Math.min(100, Math.max(0, (video.currentTime / duration) * 100)) : 0;
  bar.style.width = `${progress}%`;
  if (!videoHasAdvanced && video.currentTime > 0.12) {
    videoHasAdvanced = true;
    revealVideoChrome(false);
  }
}

function syncVideoToggle() {
  const video = byId("detail-video");
  const toggle = byId("detail-video-toggle");
  if (!video || !toggle) return;
  const isPaused = video.paused || video.ended;
  toggle.classList.toggle("is-paused", isPaused);
  toggle.setAttribute("aria-label", isPaused ? "Play video" : "Pause video");
  revealVideoChrome(false);
}

function setVideoChrome(visible) {
  const toggle = byId("detail-video-toggle");
  const progress = byId("detail-video-progress");
  clearTimeout(videoChromeTimer);
  if (toggle) toggle.hidden = !visible;
  if (progress) {
    progress.hidden = !visible;
    if (!visible) {
      const bar = progress.querySelector("span");
      if (bar) bar.style.width = "0";
    }
  }
  if (!visible) videoHasAdvanced = false;
  if (visible) revealVideoChrome(false);
}

function revealVideoChrome(autoHide = true) {
  const video = byId("detail-video");
  const toggle = byId("detail-video-toggle");
  const progress = byId("detail-video-progress");
  if (!video || !toggle || toggle.hidden) return;
  clearTimeout(videoChromeTimer);
  toggle.classList.remove("is-soft-hidden");
  if (progress && !progress.hidden) progress.classList.remove("is-soft-hidden");
  if (!autoHide || video.paused || video.ended) return;
  videoChromeTimer = setTimeout(() => {
    if (video.paused || video.ended || video.hidden) return;
    toggle.classList.add("is-soft-hidden");
    if (progress && !progress.hidden) progress.classList.add("is-soft-hidden");
  }, 950);
}

function toggleDetailVideoPlayback() {
  const video = byId("detail-video");
  if (!video || video.hidden) return;
  if (video.paused || video.ended) {
    video.play().then(syncVideoToggle).catch(syncVideoToggle);
  } else {
    video.pause();
    syncVideoToggle();
  }
}

function renderGalleryImage(animate = true) {
  const img = byId("detail-img");
  const video = byId("detail-video");
  const count = byId("detail-photo-count");
  const mediaKind = byId("detail-media-kind");
  const hasMultiple = currentGallery.length > 1;
  if (!currentGallery.length) return;
  const media = currentGallery[currentGalleryIndex];
  if (animate) {
    img.classList.add("switching");
    video.classList.add("switching");
    setTimeout(() => img.classList.remove("switching"), 170);
    setTimeout(() => video.classList.remove("switching"), 170);
  }
  if (media.type === "video") {
    img.hidden = true;
    video.hidden = false;
    setVideoChrome(true);
    if (video.src !== media.src) {
      videoHasAdvanced = false;
      video.src = media.src;
      video.load();
    }
    video.muted = true;
    video.play().then(syncVideoToggle).catch(syncVideoToggle);
    updateVideoProgress();
    if (mediaKind) mediaKind.hidden = false;
  } else {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = true;
    setVideoChrome(false);
    img.hidden = false;
    img.src = media.src;
    if (mediaKind) mediaKind.hidden = true;
  }
  count.textContent = `${currentGalleryIndex + 1}/${currentGallery.length}`;
  count.hidden = !hasMultiple;
  document.querySelectorAll("[data-gallery-prev], [data-gallery-next]").forEach((btn) => {
    btn.hidden = !hasMultiple;
  });
}

function moveGallery(delta) {
  if (currentGallery.length <= 1) return;
  currentGalleryIndex = (currentGalleryIndex + delta + currentGallery.length) % currentGallery.length;
  renderGalleryImage();
  if (!byId("media-fullscreen").hidden) renderFullScreenMedia();
}

function renderFullScreenMedia() {
  const overlay = byId("media-fullscreen");
  const img = byId("media-fullscreen-img");
  const video = byId("media-fullscreen-video");
  const count = byId("media-fullscreen-count");
  const media = currentGallery[currentGalleryIndex];
  if (!media) return;

  const hasMultiple = currentGallery.length > 1;
  document.querySelectorAll("[data-media-prev], [data-media-next]").forEach((btn) => {
    btn.hidden = !hasMultiple;
  });
  count.textContent = `${currentGalleryIndex + 1}/${currentGallery.length}`;
  count.hidden = !hasMultiple;

  if (media.type === "video") {
    img.hidden = true;
    video.hidden = false;
    if (video.src !== media.src) {
      video.src = media.src;
      video.load();
    }
    video.play().catch(() => {});
  } else {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = true;
    img.hidden = false;
    img.src = media.src;
    img.alt = currentProduct?.name || "";
  }

  overlay.classList.remove("closing");
}

function openFullScreenMedia() {
  if (!currentGallery.length) return;
  byId("media-fullscreen").hidden = false;
  renderFullScreenMedia();
}

function closeFullScreenMedia() {
  const overlay = byId("media-fullscreen");
  const video = byId("media-fullscreen-video");
  if (overlay.hidden) return;
  overlay.classList.add("closing");
  video.pause();
  window.setTimeout(() => {
    overlay.hidden = true;
    overlay.classList.remove("closing");
    video.removeAttribute("src");
    video.load();
  }, 150);
}

function suggestedProducts(product) {
  return PRODUCTS
    .filter((item) => item.id !== product.id)
    .filter((item) => {
      const sameCategory = item.category && item.category === product.category;
      const sameGender = item.gender && product.gender && item.gender === product.gender;
      return sameCategory || sameGender;
    })
    .slice(0, 8);
}

function suggestedCardHTML(product) {
  const id = escapeHtml(product.id);
  const name = escapeHtml(product.name);
  const image = escapeHtml(safeMediaUrl(product.img));
  return `
    <button class="suggested-card" data-suggested="${id}">
      <img src="${image}" alt="${name}" loading="lazy" decoding="async">
      <span>${name}</span>
      <b>${money(product.price)}</b>
    </button>`;
}

function renderDetailExtras(product) {
  const localized = product.descriptions?.[currentLang] || product.description || "";
  const description = String(localized || "").trim() || t("defaultDescription");
  const suggestions = suggestedProducts(product);
  byId("detail-description").textContent = description;
  byId("detail-suggestions").innerHTML = suggestions.map(suggestedCardHTML).join("");
  byId("detail-suggested-section").hidden = suggestions.length === 0;
}

function renderDetailProduct(p, { resetGallery = true } = {}) {
  currentProduct = p;
  selColor = resetGallery || !p.colors.some((c) => c.name === selColor) ? p.defaultColor : selColor;
  selSize = resetGallery || !p.sizes.includes(selSize) ? p.defaultSize : selSize;
  if (resetGallery) selUnit = "qop";
  const previousIndex = currentGalleryIndex;
  currentGallery = productImages(p);
  currentGalleryIndex = resetGallery ? 0 : Math.min(previousIndex, Math.max(currentGallery.length - 1, 0));

  const firstMedia = currentGallery[0];
  byId("detail-img").src = firstMedia?.type === "image" ? firstMedia.src : (p.detailImg || p.img);
  byId("detail-name").textContent = p.name;
  byId("detail-price").textContent = money(p.price);
  byId("detail-rating").textContent = p.rating.toFixed(1);
  byId("detail-reviews").textContent = `(${p.reviews})`;
  byId("detail-fav").classList.toggle("fav-active", wishlist.includes(p.id));
  renderGalleryImage(false);

  byId("swatches").innerHTML = p.colors
    .map((c) => `<button class="swatch ${c.name === selColor ? "active" : ""}" data-color="${escapeHtml(c.name)}" style="background:${safeColor(c.hex)}" aria-label="${escapeHtml(c.name)}"></button>`)
    .join("");
  byId("unit-options").innerHTML = `
    <button class="unit-chip ${selUnit === "qop" ? "active" : ""}" data-unit-choice="qop">${t("qop")}</button>
    <button class="unit-chip ${selUnit === "pachka" ? "active" : ""}" data-unit-choice="pachka">${t("qadoq")}</button>
  `;
  byId("color-value").textContent = selColor;
  byId("unit-value").textContent = unitLabel(selUnit);
  renderDetailExtras(p);
}

function refreshOpenDetailFromProducts() {
  if (!currentProduct) return;
  const fresh = find(currentProduct.id);
  if (!fresh) return;
  renderDetailProduct(fresh, { resetGallery: false });
}

function openDetail(id, options = {}) {
  const p = find(id);
  if (!p) return;
  renderDetailProduct(p, { resetGallery: true });
  show("detail", options);
}

/* ---------- cart ---------- */
function cartCount() { return cart.reduce((n, i) => n + i.qty, 0); }
function normalizeUnit(unit) {
  return unit === "pachka" || unit === "qadoq" ? "pachka" : "qop";
}
function unitPieces(unit) {
  return normalizeUnit(unit) === "pachka" ? PACK_SIZE : BAG_SIZE;
}
function unitLabel(unit) {
  return normalizeUnit(unit) === "pachka" ? t("qadoq") : t("qop");
}
function lineTotal(line) {
  const p = find(line.id);
  return p ? p.price * unitPieces(line.unit_type) * line.qty : 0;
}

function updateBadge(bump = false) {
  const badge = byId("cart-badge");
  const heroBadge = byId("hero-cart-count");
  const n = cartCount();
  badge.textContent = n;
  badge.classList.toggle("zero", n === 0);
  if (heroBadge) {
    heroBadge.textContent = n;
    heroBadge.hidden = n === 0;
  }
  if (bump) {
    badge.classList.remove("bump");
    void badge.offsetWidth;
    badge.classList.add("bump");
  }
}

function addToCart(id, color, size, unit = "qop") {
  const unitType = normalizeUnit(unit);
  const line = cart.find((i) => i.id === id && i.color === color && i.size === size && normalizeUnit(i.unit_type) === unitType);
  if (line) line.qty += 1;
  else cart.push({ id, color, size, qty: 1, unit_type: unitType });
  store.save("cart", cart);
  updateBadge(true);
  toast(t("addedToCart"));
}

function renderCart() {
  const wrap = byId("cart-items");
  const hasItems = cart.length > 0;
  byId("cart-summary").style.display = hasItems ? "" : "none";
  byId("cart-empty").hidden = hasItems;

  wrap.innerHTML = cart
    .map((line, idx) => {
      const p = find(line.id);
      if (!p) return "";
      const unit = normalizeUnit(line.unit_type);
      const name = escapeHtml(p.name);
      const image = escapeHtml(safeMediaUrl(p.img));
      return `
      <div class="cart-item" data-idx="${idx}">
        <img class="ci-img" src="${image}" alt="${name}" loading="lazy" decoding="async">
        <div class="ci-mid">
          <span class="ci-name">${name}</span>
          <span class="ci-variant">${escapeHtml(line.color)} / ${escapeHtml(unitLabel(unit))}</span>
          <span class="ci-price">${money(p.price)} × ${unitPieces(unit)} ${t("pcs")}</span>
          <span class="ci-unit">
            <button class="${unit === "qop" ? "active" : ""}" data-unit="${idx}:qop">${t("qop")}</button>
            <button class="${unit === "pachka" ? "active" : ""}" data-unit="${idx}:pachka">${t("qadoq")}</button>
          </span>
          <span class="ci-qty">
            <button data-dec="${idx}" aria-label="${t("decrease")}">−</button>
            <b>${line.qty} ${unitLabel(unit)}</b>
            <button data-inc="${idx}" aria-label="${t("increase")}">+</button>
          </span>
        </div>
        <div class="ci-right">
          <button class="ci-remove" data-remove="${idx}" aria-label="${t("remove")}">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>`;
    })
    .join("");

  const subtotal = cart.reduce((s, l) => s + lineTotal(l), 0);
  byId("sum-subtotal").textContent = money(subtotal);
  byId("sum-total").textContent = money(subtotal);
}

/* ---------- wishlist ---------- */
function toggleWishlist(id) {
  const i = wishlist.indexOf(id);
  if (i >= 0) wishlist.splice(i, 1);
  else { wishlist.push(id); toast(t("savedWishlist")); }
  store.save("wishlist", wishlist);
  syncWishlistToApi();
  renderBestSellers();
  if (!byId("screen-categories").hidden) renderGrid();
  if (!byId("screen-wishlist").hidden) renderWishlist();
  if (!byId("screen-discover").hidden) renderDiscover();
  if (currentProduct) byId("detail-fav").classList.toggle("fav-active", wishlist.includes(currentProduct.id));
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = byId("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

function openPaymentSheet() {
  openSheet("payment-sheet");
}

function openDeliverySheet() {
  const profile = authCustomer || profileFromStore();
  const form = byId("delivery-form");
  form.city.value = profile.city || "";
  form.address.value = profile.address || "";
  form.phone.value = profile.phone || "";
  openSheet("delivery-sheet");
}

function openSupportSheet(mode = "ai") {
  switchAssistantTab(mode);
  openSheet("support-sheet");
}

function switchAssistantTab(mode) {
  document.querySelectorAll("[data-assistant-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.assistantTab === mode);
  });
  byId("ai-assistant-panel").classList.toggle("active", mode === "ai");
  byId("human-support-panel").classList.toggle("active", mode === "human");
}

function aiAnswer(question) {
  const raw = String(question || "").trim();
  const q = raw.toLowerCase();
  if (!q) return t("aiIntro");

  const cartItems = cartCount();
  const languageReplies = {
    en: {
      greeting: "Hi. I can help with products, sizes, qop/qadoq rules, delivery, payment, cart, orders, login, or manager support.",
      qop: `${t("qop")}: ${t("qopSize")}. Usually 10 pcs for each size when a product has 6 sizes.`,
      qadoq: `${t("qadoq")}: ${t("qadoqSize")}. Usually 1 pc for each size when a product has 6 sizes.`,
      size: `Choose the size on the product page, then add it to cart. ${t("qadoq")} = ${t("qadoqSize")}, ${t("qop")} = ${t("qopSize")}.`,
      delivery: "Add or edit your delivery address from Profile > Delivery address. A manager can confirm final delivery details after checkout.",
      payment: t("paymentIntro"),
      order: "After checkout, your order is sent to Milana. A manager contacts you to confirm quantity, delivery, and payment.",
      cart: cartItems ? `You currently have ${cartItems} item${cartItems === 1 ? "" : "s"} in cart. Open Cart to adjust quantity or checkout.` : "Your cart is empty. Open Categories or search to add products.",
      search: "Use the search bar on Home or Categories. You can search by product name, category, model, color, or brand.",
      login: "Open Profile to sign in or create an account. Google sign-in and email reset are prepared for the app flow.",
      manager: "For a human manager, switch to the Manager tab here and send your message.",
      product: currentProduct ? `${currentProduct.name}: ${money(currentProduct.price)}. Choose color and size, then add it to cart.` : "Open a product to see price, photos, video, sizes, description, and suggested items.",
      fallback: "I can help fastest with sizes, qop, qadoq, delivery, payment, orders, cart, login, and manager support. For a special request, switch to the Manager tab.",
    },
    uz: {
      greeting: "Salom. Mahsulotlar, o'lchamlar, qop/qadoq qoidalari, yetkazib berish, to'lov, savatcha, buyurtmalar, kirish yoki menejer yordami bo'yicha yordam beraman.",
      qop: `${t("qop")}: ${t("qopSize")}. Mahsulotda 6 ta o'lcham bo'lsa, odatda har bir o'lchamdan 10 tadan.`,
      qadoq: `${t("qadoq")}: ${t("qadoqSize")}. Mahsulotda 6 ta o'lcham bo'lsa, odatda har bir o'lchamdan 1 tadan.`,
      size: `Mahsulot sahifasida o'lchamni tanlab, savatchaga qo'shing. ${t("qadoq")} = ${t("qadoqSize")}, ${t("qop")} = ${t("qopSize")}.`,
      delivery: "Yetkazib berish manzilini Profil > Yetkazib berish manzili bo'limida saqlashingiz mumkin. Checkoutdan keyin menejer tafsilotlarni tasdiqlaydi.",
      payment: t("paymentIntro"),
      order: "Checkoutdan keyin buyurtma Milana'ga yuboriladi. Menejer miqdor, yetkazib berish va to'lovni tasdiqlash uchun bog'lanadi.",
      cart: cartItems ? `Savatchangizda ${cartItems} ta mahsulot bor. Miqdorni o'zgartirish yoki checkout qilish uchun Savatchani oching.` : "Savatcha bo'sh. Mahsulot qo'shish uchun Kategoriyalar yoki qidiruvdan foydalaning.",
      search: "Bosh sahifa yoki Kategoriyalardagi qidiruvdan foydalaning. Nomi, kategoriya, model, rang yoki brend bo'yicha qidirishingiz mumkin.",
      login: "Kirish yoki akkaunt yaratish uchun Profilni oching. Google orqali kirish va email tiklash app flow uchun tayyorlangan.",
      manager: "Menejer bilan gaplashish uchun shu oynada Menejer tabini tanlab xabar yuboring.",
      product: currentProduct ? `${currentProduct.name}: ${money(currentProduct.price)}. Rang va o'lchamni tanlab, savatchaga qo'shing.` : "Mahsulotni ochsangiz narx, rasmlar, video, o'lchamlar, tavsif va tavsiya qilingan mahsulotlar ko'rinadi.",
      fallback: "Men o'lcham, qop, qadoq, yetkazib berish, to'lov, buyurtma, savatcha, kirish va menejer yordami bo'yicha tez yordam bera olaman. Maxsus savol uchun Menejer tabiga o'ting.",
    },
    ru: {
      greeting: "Здравствуйте. Я помогу с товарами, размерами, правилами мешка/упаковки, доставкой, оплатой, корзиной, заказами, входом или связью с менеджером.",
      qop: `${t("qop")}: ${t("qopSize")}. Если у товара 6 размеров, обычно это по 10 шт. каждого размера.`,
      qadoq: `${t("qadoq")}: ${t("qadoqSize")}. Если у товара 6 размеров, обычно это по 1 шт. каждого размера.`,
      size: `Выберите размер на странице товара и добавьте в корзину. ${t("qadoq")} = ${t("qadoqSize")}, ${t("qop")} = ${t("qopSize")}.`,
      delivery: "Адрес доставки можно сохранить в Профиль > Адрес доставки. После оформления менеджер подтвердит детали.",
      payment: t("paymentIntro"),
      order: "После checkout заказ отправляется в Milana. Менеджер свяжется с вами, чтобы подтвердить количество, доставку и оплату.",
      cart: cartItems ? `В корзине сейчас ${cartItems} товар(а). Откройте корзину, чтобы изменить количество или оформить заказ.` : "Корзина пустая. Откройте категории или поиск, чтобы добавить товары.",
      search: "Используйте поиск на главной или в категориях. Можно искать по названию, категории, модели, цвету или бренду.",
      login: "Откройте Профиль, чтобы войти или создать аккаунт. Google-вход и восстановление через email подготовлены для app flow.",
      manager: "Чтобы написать менеджеру, переключитесь на вкладку Менеджер и отправьте сообщение.",
      product: currentProduct ? `${currentProduct.name}: ${money(currentProduct.price)}. Выберите цвет и размер, затем добавьте в корзину.` : "Откройте товар, чтобы увидеть цену, фото, видео, размеры, описание и рекомендации.",
      fallback: "Я быстрее всего помогу с размерами, мешком, упаковкой, доставкой, оплатой, заказами, корзиной, входом и менеджером. Для особого вопроса перейдите во вкладку Менеджер.",
    },
  };
  const r = languageReplies[currentLang] || languageReplies.en;

  if (/^(hi|hello|hey|salom|салом|привет|здрав)/i.test(q)) return r.greeting;
  if (/qop|bag|меш|60|опт|wholesale/.test(q)) return r.qop;
  if (/qadoq|pack|pachka|упаков|пачк|6\b/.test(q)) return r.qadoq;
  if (/size|o'lch|olch|размер|разм|50|52|54|56|58|60/.test(q)) return r.size;
  if (/deliver|address|yetkaz|manzil|достав|адрес|город|shahar/.test(q)) return r.delivery;
  if (/pay|payment|to'lov|tolov|оплат|карта|card|cash|налич/.test(q)) return r.payment;
  if (/order|buyurt|заказ|checkout|confirm|тасдиқ|подтверд/.test(q)) return r.order;
  if (/cart|savatch|корзин|basket/.test(q)) return r.cart;
  if (/search|find|qidir|поиск|найт|brand|brend|бренд/.test(q)) return r.search;
  if (/login|sign|account|profile|kirish|akkaunt|вход|аккаунт|google|gmail|password|parol|парол/.test(q)) return r.login;
  if (/manager|human|menejer|менедж|operator|support|help|yordam|помощ/.test(q)) return r.manager;
  if (/product|price|photo|video|mahsulot|narx|товар|цен|фото|видео/.test(q)) return r.product;
  return r.fallback;
}

function askAiAssistant() {
  const input = byId("ai-question");
  const reply = byId("ai-reply");
  const button = byId("btn-ai-ask");
  const question = String(input.value || "").trim();
  reply.textContent = question ? "..." : t("aiIntro");
  button.disabled = true;
  window.setTimeout(() => {
    reply.textContent = aiAnswer(question);
    if (question) input.value = "";
    button.disabled = false;
    input.focus();
  }, 90);
}

async function saveDeliveryAddress(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const profile = {
    ...profileFromStore(),
    city: String(form.city.value || "").trim(),
    address: String(form.address.value || "").trim(),
    phone: String(form.phone.value || "").trim(),
  };
  saveProfile(profile);
  api("/api/profile", { method: "PUT", body: profile }).catch(() => {});
  closeSheets();
  toast(t("addressSaved"));
}

async function sendHumanSupport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = String(form.message.value || "").trim();
  if (message.length < 8) return toast(t("supportMessageShort"));
  const customer = authCustomer || profileFromStore();
  const submit = form.querySelector("button[type='submit']");
  submit.disabled = true;
  try {
    await api("/api/support", {
      method: "POST",
      body: {
        topic: "mobile-support",
        message,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
      },
    });
    form.reset();
    closeSheets();
    toast(t("supportSent"));
  } catch {
    toast(t("supportSendFailed"));
  } finally {
    submit.disabled = false;
  }
}

/* ---------- hero carousel dots ---------- */
const heroTrack = document.querySelector(".hero-track");
const dots = document.querySelectorAll(".hero-dots .dot");
heroTrack?.addEventListener("scroll", () => {
  const i = Math.round(heroTrack.scrollLeft / heroTrack.clientWidth);
  dots.forEach((d, j) => d.classList.toggle("active", j === i));
}, { passive: true });

/* ---------- global click handling ---------- */
document.addEventListener("click", (e) => {
  const favBtn = e.target.closest("[data-fav]");
  if (favBtn) { e.stopPropagation(); toggleWishlist(favBtn.dataset.fav); return; }

  if (e.target.closest("[data-retry-products]")) {
    loadProductsFromApi();
    return;
  }

  if (e.target.closest("[data-load-more-products]")) {
    loadProductsFromApi({ append: true });
    return;
  }

  const card = e.target.closest(".product-card");
  if (card) { openDetail(card.dataset.id); return; }

  const audience = e.target.closest(".audience-tabs [data-cat]");
  if (audience) {
    setSearchQuery("");
    currentListingCategory = audience.dataset.cat;
    activeTab = "All";
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === "All"));
    byId("listing-title").textContent = categoryLabel(currentListingCategory);
    show("categories");
    return;
  }

  const discoverAction = e.target.closest("[data-discover-action]");
  if (discoverAction) {
    const action = discoverAction.dataset.discoverAction;
    if (action === "view") {
      const card = document.querySelector("[data-discover-active]");
      if (card) openDetail(card.dataset.discoverId);
    } else advanceDiscover(action === "save" ? "right" : "left");
    return;
  }

  if (e.target.closest("[data-discover-restart]")) {
    discoverIndex = 0;
    store.save("discoverIndex", discoverIndex);
    renderDiscover();
    return;
  }

  const nav = e.target.closest("[data-nav]");
  if (nav) {
    if (nav.dataset.nav === "categories") {
      setSearchQuery("");
      currentListingCategory = "";
      activeTab = "All";
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "All"));
      byId("listing-title").textContent = categoryLabel(currentListingCategory);
    }
    show(nav.dataset.nav);
    return;
  }

  const back = e.target.closest("[data-back]");
  if (back) { goBack(); return; }

  if (e.target.closest("[data-media-close]")) { closeFullScreenMedia(); return; }
  if (e.target.closest("[data-media-prev]")) { moveGallery(-1); return; }
  if (e.target.closest("[data-media-next]")) { moveGallery(1); return; }

  if (e.target.closest("[data-gallery-prev]")) { moveGallery(-1); return; }
  if (e.target.closest("[data-gallery-next]")) { moveGallery(1); return; }

  const suggested = e.target.closest("[data-suggested]");
  if (suggested) {
    openDetail(suggested.dataset.suggested, { replaceHistory: true });
    return;
  }

  const action = e.target.closest("[data-action]");
  if (action) {
    const name = action.dataset.action;
    if (name === "payment") openPaymentSheet();
    else if (name === "delivery") openDeliverySheet();
    else if (name === "support") openSupportSheet("ai");
    else if (name === "support-human") openSupportSheet("human");
    else if (name === "shop-now") show("categories");
    return;
  }

  const catCard = e.target.closest("[data-cat]");
  if (catCard) {
    setSearchQuery("");
    currentListingCategory = catCard.dataset.cat;
    byId("listing-title").textContent = categoryLabel(currentListingCategory);
    activeTab = "All";
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "All"));
    show("categories");
    return;
  }

  const tab = e.target.closest(".tab");
  if (tab) {
    activeTab = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    renderGrid();
    return;
  }

  const swatch = e.target.closest(".swatch");
  if (swatch) {
    selColor = swatch.dataset.color;
    byId("color-value").textContent = selColor;
    document.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s === swatch));
    return;
  }

  const unitChoice = e.target.closest("[data-unit-choice]");
  if (unitChoice) {
    selUnit = normalizeUnit(unitChoice.dataset.unitChoice);
    byId("unit-value").textContent = unitLabel(selUnit);
    document.querySelectorAll("[data-unit-choice]").forEach((btn) => {
      btn.classList.toggle("active", btn === unitChoice);
    });
    return;
  }

  const inc = e.target.closest("[data-inc]");
  if (inc) { cart[+inc.dataset.inc].qty += 1; store.save("cart", cart); renderCart(); updateBadge(); return; }

  const dec = e.target.closest("[data-dec]");
  if (dec) {
    const line = cart[+dec.dataset.dec];
    if (line.qty > 1) line.qty -= 1;
    else cart.splice(+dec.dataset.dec, 1);
    store.save("cart", cart); renderCart(); updateBadge();
    return;
  }

  const unitBtn = e.target.closest("[data-unit]");
  if (unitBtn) {
    const [idx, unit] = unitBtn.dataset.unit.split(":");
    const line = cart[Number(idx)];
    if (line) {
      line.unit_type = normalizeUnit(unit);
      store.save("cart", cart);
      renderCart();
      updateBadge();
    }
    return;
  }

  const rem = e.target.closest("[data-remove]");
  if (rem) {
    const el = rem.closest(".cart-item");
    el.classList.add("removing");
    setTimeout(() => {
      cart.splice(+rem.dataset.remove, 1);
      store.save("cart", cart); renderCart(); updateBadge();
    }, 220);
    return;
  }

  const sortOpt = e.target.closest("[data-sort]");
  if (sortOpt) {
    sortMode = sortOpt.dataset.sort;
    document.querySelectorAll("[data-sort]").forEach((o) => o.classList.toggle("active", o === sortOpt));
    updateFilterUI();
    renderGrid();
    closeSheets();
    return;
  }

  const priceChip = e.target.closest("[data-price]");
  if (priceChip) {
    filt.price = filt.price === priceChip.dataset.price ? null : priceChip.dataset.price;
    document.querySelectorAll("[data-price]").forEach((c) => c.classList.toggle("active", c.dataset.price === filt.price));
    return;
  }
  const colorChip = e.target.closest("[data-fcolor]");
  if (colorChip) {
    const c = colorChip.dataset.fcolor;
    filt.colors.has(c) ? filt.colors.delete(c) : filt.colors.add(c);
    colorChip.classList.toggle("active");
    return;
  }
  const sizeFChip = e.target.closest("[data-fsize]");
  if (sizeFChip) {
    const s = sizeFChip.dataset.fsize;
    filt.sizes.has(s) ? filt.sizes.delete(s) : filt.sizes.add(s);
    sizeFChip.classList.toggle("active");
    return;
  }

  if (e.target.closest("[data-action='shop-now']")) { show("categories"); return; }
});

const discoverDeck = byId("discover-deck");
discoverDeck?.addEventListener("pointerdown", (e) => {
  const card = e.target.closest("[data-discover-active]");
  if (!card || e.button > 0) return;
  discoverPointer = { id: e.pointerId, card, x: e.clientX, y: e.clientY, dx: 0 };
  card.classList.add("is-dragging");
  card.setPointerCapture?.(e.pointerId);
});

discoverDeck?.addEventListener("pointermove", (e) => {
  if (!discoverPointer || discoverPointer.id !== e.pointerId) return;
  const dx = e.clientX - discoverPointer.x;
  const dy = e.clientY - discoverPointer.y;
  if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
  e.preventDefault();
  discoverPointer.dx = dx;
  discoverPointer.card.style.transform = `translate3d(${dx}px, 0, 0) rotate(${dx / 24}deg)`;
  const strength = Math.min(1, Math.abs(dx) / 90);
  const stamp = discoverPointer.card.querySelector(dx > 0 ? ".discover-stamp.save" : ".discover-stamp.skip");
  const other = discoverPointer.card.querySelector(dx > 0 ? ".discover-stamp.skip" : ".discover-stamp.save");
  if (stamp) stamp.style.opacity = strength;
  if (other) other.style.opacity = 0;
});

function endDiscoverPointer(e) {
  if (!discoverPointer || discoverPointer.id !== e.pointerId) return;
  const { card, dx } = discoverPointer;
  discoverPointer = null;
  if (Math.abs(dx) >= 72) advanceDiscover(dx > 0 ? "right" : "left");
  else resetDiscoverCard(card);
}

discoverDeck?.addEventListener("pointerup", endDiscoverPointer);
discoverDeck?.addEventListener("pointercancel", (e) => {
  if (!discoverPointer || discoverPointer.id !== e.pointerId) return;
  const card = discoverPointer.card;
  discoverPointer = null;
  resetDiscoverCard(card);
});

/* sort & filter triggers */
byId("btn-sort").addEventListener("click", () => openSheet("sort-sheet"));
byId("btn-filter").addEventListener("click", () => openSheet("filter-sheet"));
document.querySelector(".filter-btn").addEventListener("click", () => {
  if (byId("screen-categories").hidden) show("categories");
  openSheet("filter-sheet");
});
byId("sheet-backdrop").addEventListener("click", closeSheets);
byId("btn-filter-reset").addEventListener("click", () => {
  filt = { price: null, colors: new Set(), sizes: new Set() };
  document.querySelectorAll(".f-chip").forEach((c) => c.classList.remove("active"));
  updateFilterUI();
  renderGrid();
});
byId("btn-filter-apply").addEventListener("click", () => {
  updateFilterUI();
  renderGrid();
  closeSheets();
});

/* detail actions */
byId("btn-add-cart").addEventListener("click", () => {
  if (!currentProduct) return;
  addToCart(currentProduct.id, selColor, selSize, selUnit);
});
byId("detail-fav").addEventListener("click", () => {
  if (currentProduct) toggleWishlist(currentProduct.id);
});

byId("detail-video").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDetailVideoPlayback();
});
byId("detail-video").addEventListener("loadedmetadata", updateVideoProgress);
byId("detail-video").addEventListener("timeupdate", updateVideoProgress);
byId("detail-video").addEventListener("play", syncVideoToggle);
byId("detail-video").addEventListener("pause", syncVideoToggle);

byId("screen-detail").querySelector(".detail-photo-wrap").addEventListener("pointerdown", () => {
  if (currentGallery[currentGalleryIndex]?.type === "video") revealVideoChrome(true);
}, { passive: true });

byId("screen-detail").querySelector(".detail-photo-wrap").addEventListener("click", (e) => {
  if (e.target.closest("button")) return;
  if (Date.now() < suppressMediaOpenUntil) return;
  if (currentGallery[currentGalleryIndex]?.type === "video") toggleDetailVideoPlayback();
  else openFullScreenMedia();
});

byId("screen-detail").querySelector(".detail-photo-wrap").addEventListener("touchstart", (e) => {
  const touch = e.changedTouches[0];
  galleryTouch = {
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now(),
  };
}, { passive: true });

byId("screen-detail").querySelector(".detail-photo-wrap").addEventListener("touchend", (e) => {
  if (!galleryTouch) return;
  if (currentGallery.length <= 1) {
    galleryTouch = null;
    return;
  }
  const touch = e.changedTouches[0];
  const dx = touch.clientX - galleryTouch.x;
  const dy = touch.clientY - galleryTouch.y;
  const elapsed = Date.now() - galleryTouch.time;
  galleryTouch = null;
  if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.25 || elapsed > 800) return;
  suppressMediaOpenUntil = Date.now() + 450;
  moveGallery(dx < 0 ? 1 : -1);
}, { passive: true });

byId("media-fullscreen-stage").addEventListener("click", (e) => {
  if (e.target.closest("button")) return;
  closeFullScreenMedia();
});

byId("media-fullscreen-stage").addEventListener("touchstart", (e) => {
  const touch = e.changedTouches[0];
  fullScreenTouch = {
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now(),
  };
}, { passive: true });

byId("media-fullscreen-stage").addEventListener("touchend", (e) => {
  if (!fullScreenTouch) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - fullScreenTouch.x;
  const dy = touch.clientY - fullScreenTouch.y;
  const elapsed = Date.now() - fullScreenTouch.time;
  fullScreenTouch = null;
  if (elapsed > 900) return;
  if (dy > 82 && Math.abs(dy) > Math.abs(dx) * 1.2) {
    closeFullScreenMedia();
    return;
  }
  if (currentGallery.length <= 1) return;
  if (Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) * 1.15) moveGallery(dx < 0 ? 1 : -1);
}, { passive: true });

byId("screen-detail").addEventListener("touchstart", (e) => {
  if (e.target.closest("button, input, textarea")) return;
  const touch = e.changedTouches[0];
  const detailSheet = e.target.closest(".detail-sheet");
  const scrollTop = detailSheet ? detailSheet.scrollTop : 0;
  if (scrollTop > 4) return;
  detailSwipe = {
    x: touch.clientX,
    y: touch.clientY,
    currentX: touch.clientX,
    currentY: touch.clientY,
    time: Date.now(),
    dragging: false,
  };
}, { passive: true });

byId("screen-detail").addEventListener("touchmove", (e) => {
  if (!detailSwipe) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - detailSwipe.x;
  const dy = touch.clientY - detailSwipe.y;
  detailSwipe.currentX = touch.clientX;
  detailSwipe.currentY = touch.clientY;

  if (!detailSwipe.dragging) {
    if (dy <= 8 || Math.abs(dy) <= Math.abs(dx) * 1.15) return;
    detailSwipe.dragging = true;
    byId("screen-detail").classList.add("detail-dragging");
  }

  e.preventDefault();
  const pull = Math.min(dy * 0.9, window.innerHeight * 0.72);
  byId("screen-detail").style.transform = `translate3d(0, ${Math.max(0, pull)}px, 0)`;
}, { passive: false });

function resetDetailDrag() {
  const screen = byId("screen-detail");
  screen.classList.remove("detail-dragging");
  screen.style.transform = "";
}

byId("screen-detail").addEventListener("touchend", (e) => {
  if (!detailSwipe) return;
  const touch = e.changedTouches[0] || detailSwipe;
  const dx = touch.clientX - detailSwipe.x;
  const dy = touch.clientY - detailSwipe.y;
  const elapsed = Date.now() - detailSwipe.time;
  const wasDragging = detailSwipe.dragging;
  detailSwipe = null;
  resetDetailDrag();

  if (!wasDragging) return;
  const fastPull = dy > 52 && elapsed < 320;
  if ((dy > 88 || fastPull) && Math.abs(dy) > Math.abs(dx) * 1.15) goBack();
}, { passive: true });

byId("screen-detail").addEventListener("touchcancel", () => {
  detailSwipe = null;
  resetDetailDrag();
}, { passive: true });

document.querySelectorAll(".bottom-sheet").forEach((sheet) => {
  sheet.addEventListener("touchstart", (e) => {
    if (!sheet.classList.contains("open")) return;
    const touch = e.changedTouches[0];
    sheetSwipe = { id: sheet.id, x: touch.clientX, y: touch.clientY, time: Date.now(), scrollTop: sheet.scrollTop };
  }, { passive: true });
  sheet.addEventListener("touchend", (e) => {
    if (!sheetSwipe || sheetSwipe.id !== sheet.id) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - sheetSwipe.x;
    const dy = touch.clientY - sheetSwipe.y;
    const elapsed = Date.now() - sheetSwipe.time;
    const startScrollTop = sheetSwipe.scrollTop;
    sheetSwipe = null;
    if (startScrollTop <= 4 && dy > 80 && Math.abs(dy) > Math.abs(dx) * 1.35 && elapsed < 900) closeSheets();
  }, { passive: true });
});

document.addEventListener("error", (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  const holder = img.closest(".product-card, .detail-photo-wrap, .cart-item");
  holder?.classList.add("image-missing");
}, true);

document.addEventListener("load", (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  const holder = img.closest(".product-card, .detail-photo-wrap, .cart-item");
  holder?.classList.remove("image-missing");
}, true);

/* auth */
document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchAuthTab(btn.dataset.authTab));
});

document.querySelectorAll("[data-lang]").forEach((btn) => {
  btn.addEventListener("click", () => setLanguage(btn.dataset.lang));
});

byId("btn-google-auth")?.addEventListener("click", signInWithGoogle);

document.querySelectorAll("[data-assistant-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchAssistantTab(btn.dataset.assistantTab));
});

byId("btn-ai-ask")?.addEventListener("click", () => {
  askAiAssistant();
});

byId("ai-question")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    byId("btn-ai-ask").click();
  }
});

byId("delivery-form")?.addEventListener("submit", saveDeliveryAddress);
byId("human-support-panel")?.addEventListener("submit", sendHumanSupport);

document.querySelectorAll("[data-auth-form]").forEach((form) => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mode = form.dataset.authForm;
    const submit = form.querySelector("button[type=submit]");
    const data = authFormData(form);
    setAuthMessage(mode, "");
    if (!validateEmail(data.email)) return setAuthMessage(mode, authErrorMessage("email"));
    if (String(data.password || "").length < 8) return setAuthMessage(mode, authErrorMessage("password"));
    if (mode === "signup") {
      if (String(data.name || "").trim().length < 2) return setAuthMessage(mode, authErrorMessage("name"));
      if (!/^[0-9+()\-\s]{5,25}$/.test(String(data.phone || ""))) return setAuthMessage(mode, authErrorMessage("phone"));
      if (!/^\d{6}$/.test(String(data.email_code || ""))) return setAuthMessage(mode, authErrorMessage("otp"));
      if (!data.terms) return setAuthMessage(mode, authErrorMessage("terms"));
    }
    if (mode === "recover" && !/^\d{6}$/.test(String(data.email_code || ""))) {
      return setAuthMessage(mode, authErrorMessage("otp"));
    }
    submit.disabled = true;
    try {
      const path = mode === "signin" ? "/api/auth/signin" : mode === "signup" ? "/api/auth/signup" : "/api/auth/recover";
      const result = await api(path, { method: "POST", body: data });
      rememberAuth(result);
      setAuthMessage(mode, mode === "recover" ? t("keyReset") : t("signedInToast"), true);
      toast(mode === "recover" ? t("keyResetSignedIn") : t("signedInToast"));
    } catch (err) {
      setAuthMessage(mode, authErrorMessage(err.message));
    } finally {
      submit.disabled = false;
    }
  });
});

document.querySelector("[data-auth-signup-email-otp-send]")?.addEventListener("click", async (e) => {
  const form = e.currentTarget.closest("form");
  const email = authFormData(form).email;
  if (!validateEmail(email)) return setAuthMessage("signup", authErrorMessage("email"));
  startAuthCooldown(e.currentTarget);
  try {
    const result = await api("/api/auth/email-otp/start", { method: "POST", body: { email, lang: currentLang } });
    setAuthMessage("signup", result.dev_code ? t("codeShown", { code: result.dev_code }) : t("emailCodeSent"), true);
  } catch (err) {
    setAuthMessage("signup", authErrorMessage(err.message));
  }
});

document.querySelector("[data-auth-email-otp-send]")?.addEventListener("click", async (e) => {
  const form = e.currentTarget.closest("form");
  const email = authFormData(form).email;
  if (!validateEmail(email)) return setAuthMessage("recover", authErrorMessage("email"));
  startAuthCooldown(e.currentTarget);
  try {
    const result = await api("/api/auth/email-otp/start", { method: "POST", body: { email, lang: currentLang } });
    setAuthMessage("recover", result.dev_code ? t("codeShown", { code: result.dev_code }) : t("emailCodeSent"), true);
  } catch (err) {
    setAuthMessage("recover", authErrorMessage(err.message));
  }
});

byId("btn-logout")?.addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  forgetAuth();
  switchAuthTab("signin");
  toast(t("loggedOut"));
});

/* checkout */
function openCheckoutForm() {
  if (!cart.length) return;
  if (!authCustomer) {
    toast(t("signInCheckout"));
    show("profile");
    return;
  }
  const profile = authCustomer || profileFromStore();
  const form = byId("checkout-form");
  form.name.value = profile.name || "";
  form.phone.value = profile.phone || "";
  form.city.value = profile.city || "";
  form.address.value = profile.address || "";
  form.post_code.value = profile.post_code || "";
  form.comment.value = profile.comment || "";
  byId("checkout-error").hidden = true;
  byId("checkout-overlay").hidden = false;
}

function closeCheckoutForm() {
  byId("checkout-overlay").hidden = true;
}

async function submitCheckoutForm() {
  const form = byId("checkout-form");
  const err = byId("checkout-error");
  const submit = form.querySelector(".checkout-submit");
  const data = Object.fromEntries(new FormData(form));
  const customer = {
    name: String(data.name || "").trim(),
    phone: String(data.phone || "").trim(),
    city: String(data.city || "").trim(),
    address: String(data.address || "").trim(),
    comment: [data.post_code ? `Post code: ${String(data.post_code).trim()}` : "", String(data.comment || "").trim()]
      .filter(Boolean)
      .join("\n"),
  };
  if (customer.name.length < 2) {
    err.textContent = t("receiverNameError");
    err.hidden = false;
    return;
  }
  if (!/^[0-9+()\-\s]{5,25}$/.test(customer.phone)) {
    err.textContent = t("phoneError");
    err.hidden = false;
    return;
  }
  err.hidden = true;
  submit.disabled = true;
  submit.textContent = t("sending");
  try {
    const order = await api("/api/orders", {
      method: "POST",
      body: {
        source: "mobile-app",
        order_type: "wholesale",
        payment: { method: "manager" },
        customer,
        items: cart.map((line) => ({
          id: line.id,
          color: line.color,
          size: line.size,
          qty: line.qty,
          unit_type: normalizeUnit(line.unit_type),
        })),
      },
    });
    store.save("lastOrder", order);
    saveProfile({ ...profileFromStore(), ...customer });
    const successText = document.querySelector(".success-card p");
    if (successText) {
      successText.textContent = t("orderSuccess", { number: order.number, total: money(Number(order.total) || 0) });
    }
    closeCheckoutForm();
    byId("success-overlay").hidden = false;
    loadProfileFromApi();
  } catch (err) {
    byId("checkout-error").textContent = t("checkoutFailed", { message: err.message });
    byId("checkout-error").hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = t("sendOrder");
  }
}

byId("btn-checkout").addEventListener("click", openCheckoutForm);
byId("btn-checkout-close").addEventListener("click", closeCheckoutForm);
byId("btn-checkout-cancel").addEventListener("click", closeCheckoutForm);
byId("checkout-overlay").addEventListener("click", (e) => {
  if (e.target.id === "checkout-overlay") closeCheckoutForm();
});
byId("checkout-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitCheckoutForm();
});
byId("btn-success-done").addEventListener("click", () => {
  byId("success-overlay").hidden = true;
  cart = [];
  store.save("cart", cart);
  updateBadge();
  navStack = ["home"];
  show("home", { push: false, replaceHistory: true });
});

async function showLatestOrder() {
  if (!authCustomer) {
    toast(t("signInOrders"));
    return;
  }
  try {
    const data = await api("/api/auth/orders");
    const orders = Array.isArray(data.orders) ? data.orders : [];
    if (!orders.length) return toast(t("noOrders"));
    const latest = orders[0];
    toast(`${latest.number}: ${money(Number(latest.total) || 0)} · ${latest.status}`);
  } catch (err) {
    toast(t("ordersUnavailable", { message: err.message }));
  }
}

byId("btn-my-orders").addEventListener("click", showLatestOrder);
byId("btn-settings-orders")?.addEventListener("click", showLatestOrder);
byId("btn-notif")?.addEventListener("click", () => toast(t("noNotifications")));

/* search: keep the keyboard and query alive on the results screen */
byId("search-input").addEventListener("click", (event) => {
  setSearchQuery(event.currentTarget.value);
  renderHomeSearch();
});

byId("search-input").addEventListener("input", (event) => {
  setSearchQuery(event.currentTarget.value);
  renderHomeSearch();
  scheduleRemoteSearch(event.currentTarget.value);
});

byId("home-search-clear")?.addEventListener("click", () => {
  setSearchQuery("");
  renderHomeSearch();
  byId("search-input")?.focus({ preventScroll: true });
});

byId("network-retry")?.addEventListener("click", () => {
  loadProductsFromApi();
  loadProfileFromApi();
  loadWishlistFromApi();
});

byId("listing-scroll")?.addEventListener("scroll", syncListingChrome, { passive: true });

/* ---------- init ---------- */
function hideAppLoader() {
  requestAnimationFrame(() => {
    byId("app-loader")?.classList.add("done");
  });
}

function start() {
  applyTranslations();
  setupNetworkMonitoring();
  renderBestSellers();
  updateBadge();
  renderProfile(profileFromStore());
  const params = new URLSearchParams(location.search);
  const startProduct = params.get("product");
  const startScreen = params.get("screen");
  pendingProductId = startProduct || null;
  if (startProduct && find(startProduct)) openDetail(startProduct, { push: false, history: false });
  else if (startScreen && SCREENS.includes(startScreen)) show(startScreen, { push: false, history: false });
  else show("home", { push: false, history: false });
  syncRouteHistory(byId("app").dataset.screen || "home", true);
  const startSheet = params.get("sheet");
  if (startSheet === "sort" || startSheet === "filter") openSheet(startSheet + "-sheet");
  setupNativeBackButton();
  loadAuthConfig();
  loadProductsFromApi();
  loadProfileFromApi();
  loadWishlistFromApi();
  setTimeout(hideAppLoader, 420);
}

start();
