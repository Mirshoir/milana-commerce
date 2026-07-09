(() => {
  "use strict";

  const LANGS = ["uz", "ru", "en"];
  const LABELS = { uz: "UZ", ru: "RU", en: "ENG" };
  const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const TEXT = {
    en: {
      "Milana Premium · Admin": "Milana Premium · Admin",
      "Логин": "Login",
      "Пароль": "Password",
      "Войти": "Sign in",
      "Проверяем…": "Checking...",
      "Доступ только для администратора. Забыли пароль? На компьютере с сайтом выполните node tools/reset-password.js НовыйПароль": "Administrator access only. Forgot password? On the site computer run node tools/reset-password.js NewPassword",
      "Слишком много попыток — подождите 15 минут.": "Too many attempts. Please wait 15 minutes.",
      "Неверный логин или пароль.": "Wrong login or password.",
      "Сервер недоступен. Проверьте, что node server.js запущен.": "Server is unavailable. Check that node server.js is running.",
      "🧥 Товары": "🧥 Products",
      "👥 Клиенты": "👥 Customers",
      "📦 Заказы": "📦 Orders",
      "★ Отзывы": "★ Reviews",
      "💬 Чат": "💬 Chat",
      "☎️ Поддержка": "☎️ Support",
      "🎨 Дизайн": "🎨 Design",
      "⚙️ Настройки": "⚙️ Settings",
      "↗ Открыть сайт": "↗ Open site",
      "Выйти": "Log out",
      "Товары": "Products",
      "Клиенты": "Customers",
      "Заказы": "Orders",
      "Отзывы": "Reviews",
      "Чат": "Chat",
      "Поддержка": "Support",
      "Настройки": "Settings",
      "Дизайн": "Design",
      "+ Добавить товар": "+ Add product",
      "Номер модели": "Model number",
      "Вариант": "Variant",
      "Название": "Name",
      "Размеры": "Sizes",
      "Категория гендера": "Gender category",
      "Категория одежды": "Clothing category",
      "Тег": "Tag",
      "Цена": "Price",
      "Статус": "Status",
      "Новый товар": "New product",
      "← Назад": "Back",
      "Сохранить": "Save",
      "Основное": "Basic",
      "Вариант (цвет)": "Variant (color)",
      "Slug (URL)": "Slug (URL)",
      "Женский": "Women",
      "Мужской": "Men",
      "Детский": "Kids",
      "Унисекс": "Unisex",
      "Пижамы": "Pajamas",
      "Халаты": "Robes",
      "Домашняя одежда": "Homewear",
      "Лаунж-сеты": "Loungewear sets",
      "Старая цена": "Old price",
      "Бестселлер": "Bestseller",
      "Новинка": "New",
      "Скидка": "Sale",
      "Размеры (через запятую)": "Sizes (comma-separated)",
      "Рейтинг": "Rating",
      "Отзывов": "Reviews",
      "Опт. цена": "Wholesale price",
      "Опт. MOQ (дона)": "Wholesale MOQ (pcs)",
      "Розница цена": "Retail price",
      "Склад (qop)": "Stock (qop)",
      "Розница склад": "Retail stock",
      "Показывать на сайте": "Show on site",
      "Доступно в розницу": "Available retail",
      "Фотографии": "Photos",
      "＋ Загрузить фото или видео (JPG / PNG / WebP до 64 МБ · MP4 / WebM до 64 МБ)": "+ Upload photo or video (JPG / PNG / WebP up to 64 MB · MP4 / WebM up to 64 MB)",
      "Вертикальное, JPG/PNG/WebP, до 64 МБ.": "Vertical, JPG/PNG/WebP, up to 64 MB.",
      "Описание": "Description",
      "Smart fill": "Smart fill",
      "Ткань RU": "Fabric RU",
      "Ткань UZ": "Fabric UZ",
      "Ткань ENG": "Fabric ENG",
      "Клиент": "Customer",
      "Тип": "Type",
      "Компания": "Company",
      "Контакты": "Contacts",
      "Цены": "Prices",
      "Менеджер": "Manager",
      "Дата": "Date",
      "Состав": "Items",
      "Сумма": "Total",
      "Оплата": "Payment",
      "Товар": "Product",
      "Оценка": "Rating",
      "Комментарий": "Comment",
      "Последние сообщения": "Latest messages",
      "Тема": "Topic",
      "Сообщение": "Message",
      "Контакты": "Contacts",
      "Телефон (как показывать)": "Phone (display)",
      "WhatsApp (только цифры)": "WhatsApp (digits only)",
      "Telegram (без @)": "Telegram (without @)",
      "Instagram (без @)": "Instagram (without @)",
      "Адрес шоурума": "Showroom address",
      "Валюта": "Currency",
      "Символ / код": "Symbol / code",
      "Положение": "Position",
      "Перед суммой ($189)": "Before amount ($189)",
      "Валюта сайта зафиксирована как USD.": "Site currency is fixed as USD.",
      "Доступ в админку": "Admin access",
      "Логин администратора": "Admin login",
      "Текущий пароль": "Current password",
      "Новый пароль (мин. 8)": "New password (min. 8)",
      "Сменить пароль": "Change password",
      "Логин сохраняется кнопкой «Сохранить» сверху. Пароль меняется отдельной кнопкой и требует текущий пароль.": "Login is saved with the top Save button. Password is changed separately and requires the current password.",
      "Главный экран (Hero)": "Main screen (Hero)",
      "Что показывать в большом блоке на главной странице — фото или видео.": "Choose what to show in the large homepage block: photo or video.",
      "Фото": "Photo",
      "Видео": "Video",
      "Фото главного экрана": "Main screen photo",
      "＋ Загрузить фото": "+ Upload photo",
      "Видео главного экрана": "Main screen video",
      "＋ Загрузить видео": "+ Upload video",
      "Постер (заставка до загрузки видео)": "Poster (shown before video loads)",
      "＋ Загрузить постер": "+ Upload poster",
      "Фирменный цвет": "Brand color",
      "Акцентный цвет кнопок, заголовков и тёмных блоков по всему сайту.": "Accent color for buttons, headings, and dark blocks across the site.",
      "Активен": "Active",
      "Скрыт": "Hidden",
      "Новый": "New",
      "В работе": "Processing",
      "Отправлен": "Shipped",
      "Выполнен": "Done",
      "Отменён": "Cancelled",
      "Ожидает": "Pending",
      "Оплачено": "Paid",
      "Ошибка": "Error",
      "Возврат": "Refund",
      "Общий": "General",
      "Каталог": "Catalog",
      "Доставка": "Delivery",
      "Брак": "Defect",
      "Заказ": "Order",
      "Обычный": "Regular",
      "Премиум": "Premium"
    },
    uz: {
      "Milana Premium · Admin": "Milana Premium · Admin",
      "Логин": "Login",
      "Пароль": "Parol",
      "Войти": "Kirish",
      "Проверяем…": "Tekshirilmoqda...",
      "Доступ только для администратора. Забыли пароль? На компьютере с сайтом выполните node tools/reset-password.js НовыйПароль": "Faqat administrator uchun. Parolni unutdingizmi? Sayt kompyuterida node tools/reset-password.js YangiParol buyrug'ini bajaring",
      "Слишком много попыток — подождите 15 минут.": "Juda ko'p urinish. 15 daqiqa kuting.",
      "Неверный логин или пароль.": "Login yoki parol noto'g'ri.",
      "Сервер недоступен. Проверьте, что node server.js запущен.": "Server mavjud emas. node server.js ishga tushganini tekshiring.",
      "🧥 Товары": "🧥 Mahsulotlar",
      "👥 Клиенты": "👥 Mijozlar",
      "📦 Заказы": "📦 Buyurtmalar",
      "★ Отзывы": "★ Sharhlar",
      "💬 Чат": "💬 Chat",
      "☎️ Поддержка": "☎️ Yordam",
      "🎨 Дизайн": "🎨 Dizayn",
      "⚙️ Настройки": "⚙️ Sozlamalar",
      "↗ Открыть сайт": "↗ Saytni ochish",
      "Выйти": "Chiqish",
      "Товары": "Mahsulotlar",
      "Клиенты": "Mijozlar",
      "Заказы": "Buyurtmalar",
      "Отзывы": "Sharhlar",
      "Чат": "Chat",
      "Поддержка": "Yordam",
      "Настройки": "Sozlamalar",
      "Дизайн": "Dizayn",
      "+ Добавить товар": "+ Mahsulot qo'shish",
      "Номер модели": "Model raqami",
      "Вариант": "Variant",
      "Название": "Nomi",
      "Размеры": "O'lchamlar",
      "Категория гендера": "Jins kategoriyasi",
      "Категория одежды": "Kiyim kategoriyasi",
      "Тег": "Teg",
      "Цена": "Narx",
      "Статус": "Holat",
      "Новый товар": "Yangi mahsulot",
      "← Назад": "Orqaga",
      "Сохранить": "Saqlash",
      "Основное": "Asosiy",
      "Вариант (цвет)": "Variant (rang)",
      "Slug (URL)": "Slug (URL)",
      "Женский": "Ayollar",
      "Мужской": "Erkaklar",
      "Детский": "Bolalar",
      "Унисекс": "Uniseks",
      "Пижамы": "Pijamalar",
      "Халаты": "Xalatlar",
      "Домашняя одежда": "Uy kiyimlari",
      "Лаунж-сеты": "Lounge to'plamlar",
      "Старая цена": "Eski narx",
      "Бестселлер": "Xit",
      "Новинка": "Yangi",
      "Скидка": "Chegirma",
      "Размеры (через запятую)": "O'lchamlar (vergul bilan)",
      "Рейтинг": "Reyting",
      "Отзывов": "Sharhlar",
      "Опт. цена": "Ulgurji narx",
      "Опт. MOQ (дона)": "Ulgurji MOQ (dona)",
      "Розница цена": "Chakana narx",
      "Склад (qop)": "Ombor (qop)",
      "Розница склад": "Chakana ombor",
      "Показывать на сайте": "Saytda ko'rsatish",
      "Доступно в розницу": "Chakana mavjud",
      "Фотографии": "Rasmlar",
      "＋ Загрузить фото или видео (JPG / PNG / WebP до 64 МБ · MP4 / WebM до 64 МБ)": "+ Rasm yoki video yuklash (JPG / PNG / WebP 64 MB gacha · MP4 / WebM 64 MB gacha)",
      "Вертикальное, JPG/PNG/WebP, до 64 МБ.": "Vertikal, JPG/PNG/WebP, 64 MB gacha.",
      "Описание": "Tavsif",
      "Smart fill": "Smart to'ldirish",
      "Ткань RU": "Mato RU",
      "Ткань UZ": "Mato UZ",
      "Ткань ENG": "Mato ENG",
      "Клиент": "Mijoz",
      "Тип": "Tur",
      "Компания": "Kompaniya",
      "Контакты": "Aloqa",
      "Цены": "Narxlar",
      "Менеджер": "Menejer",
      "Дата": "Sana",
      "Состав": "Tarkib",
      "Сумма": "Summa",
      "Оплата": "To'lov",
      "Товар": "Mahsulot",
      "Оценка": "Baho",
      "Комментарий": "Izoh",
      "Последние сообщения": "So'nggi xabarlar",
      "Тема": "Mavzu",
      "Сообщение": "Xabar",
      "Телефон (как показывать)": "Telefon (ko'rsatish)",
      "WhatsApp (только цифры)": "WhatsApp (faqat raqam)",
      "Telegram (без @)": "Telegram (@ siz)",
      "Instagram (без @)": "Instagram (@ siz)",
      "Адрес шоурума": "Shourum manzili",
      "Валюта": "Valyuta",
      "Символ / код": "Belgi / kod",
      "Положение": "Joylashuv",
      "Перед суммой ($189)": "Summadan oldin ($189)",
      "Валюта сайта зафиксирована как USD.": "Sayt valyutasi USD qilib belgilangan.",
      "Доступ в админку": "Admin kirish",
      "Логин администратора": "Admin login",
      "Текущий пароль": "Joriy parol",
      "Новый пароль (мин. 8)": "Yangi parol (kamida 8)",
      "Сменить пароль": "Parolni almashtirish",
      "Логин сохраняется кнопкой «Сохранить» сверху. Пароль меняется отдельной кнопкой и требует текущий пароль.": "Login yuqoridagi Saqlash tugmasi bilan saqlanadi. Parol alohida tugma bilan o'zgaradi va joriy parol kerak.",
      "Главный экран (Hero)": "Bosh ekran (Hero)",
      "Что показывать в большом блоке на главной странице — фото или видео.": "Bosh sahifadagi katta blokda rasm yoki video ko'rsatishni tanlang.",
      "Фото": "Rasm",
      "Видео": "Video",
      "Фото главного экрана": "Bosh ekran rasmi",
      "＋ Загрузить фото": "+ Rasm yuklash",
      "Видео главного экрана": "Bosh ekran videosi",
      "＋ Загрузить видео": "+ Video yuklash",
      "Постер (заставка до загрузки видео)": "Poster (video yuklanguncha)",
      "＋ Загрузить постер": "+ Poster yuklash",
      "Фирменный цвет": "Brend rangi",
      "Акцентный цвет кнопок, заголовков и тёмных блоков по всему сайту.": "Butun sayt bo'ylab tugmalar, sarlavhalar va qorong'i bloklar aksent rangi.",
      "Активен": "Faol",
      "Скрыт": "Yashirilgan",
      "Новый": "Yangi",
      "В работе": "Jarayonda",
      "Отправлен": "Yuborilgan",
      "Выполнен": "Bajarildi",
      "Отменён": "Bekor qilingan",
      "Ожидает": "Kutilmoqda",
      "Оплачено": "To'langan",
      "Ошибка": "Xato",
      "Возврат": "Qaytarish",
      "Общий": "Umumiy",
      "Каталог": "Katalog",
      "Доставка": "Yetkazish",
      "Брак": "Brak",
      "Заказ": "Buyurtma",
      "Обычный": "Oddiy",
      "Премиум": "Premium"
    }
  };

  const PLACEHOLDER = {
    en: {
      "Поиск…": "Search...",
      "автоматически": "automatic",
      "—": "-",
      "XS, S, M, L": "XS, S, M, L",
      "998901234567": "998901234567"
    },
    uz: {
      "Поиск…": "Qidirish...",
      "автоматически": "avtomatik",
      "—": "-",
      "XS, S, M, L": "XS, S, M, L",
      "998901234567": "998901234567"
    }
  };

  const TITLES = {
    en: {
      "Вход — MILANA PREMIUM": "Sign in - MILANA PREMIUM",
      "Админ — MILANA PREMIUM": "Admin - MILANA PREMIUM",
      "Показать/скрыть": "Show/hide",
      "Изменить": "Edit",
      "Удалить": "Delete",
      "Влево": "Left",
      "Вправо": "Right"
    },
    uz: {
      "Вход — MILANA PREMIUM": "Kirish - MILANA PREMIUM",
      "Админ — MILANA PREMIUM": "Admin - MILANA PREMIUM",
      "Показать/скрыть": "Ko'rsatish/yashirish",
      "Изменить": "Tahrirlash",
      "Удалить": "O'chirish",
      "Влево": "Chapga",
      "Вправо": "O'ngga"
    }
  };

  let lang = localStorage.getItem("ml-lang") || "ru";
  if (!LANGS.includes(lang)) lang = lang === "UZ" ? "uz" : lang === "ENG" ? "en" : "ru";

  const textSources = new WeakMap();

  const dict = () => TEXT[lang] || {};
  const phDict = () => PLACEHOLDER[lang] || {};
  const titleDict = () => TITLES[lang] || {};
  const translate = (value, source = dict()) => source[norm(value)] || value;

  function translateTextNode(node) {
    const source = textSources.get(node) || norm(node.nodeValue);
    if (!source) return;
    textSources.set(node, source);
    const next = lang === "ru" ? source : translate(source);
    if (norm(node.nodeValue) !== next) node.nodeValue = node.nodeValue.replace(norm(node.nodeValue), next);
  }

  function translateElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.matches("input, textarea")) {
      if (el.placeholder) {
        el.dataset.adminLocalePlaceholder = el.dataset.adminLocalePlaceholder || el.placeholder;
        el.placeholder = lang === "ru" ? el.dataset.adminLocalePlaceholder : translate(el.dataset.adminLocalePlaceholder, phDict());
      }
      if (el.title) {
        el.dataset.adminLocaleTitle = el.dataset.adminLocaleTitle || el.title;
        el.title = lang === "ru" ? el.dataset.adminLocaleTitle : translate(el.dataset.adminLocaleTitle, titleDict());
      }
      return;
    }
    if (el.title) {
      el.dataset.adminLocaleTitle = el.dataset.adminLocaleTitle || el.title;
      el.title = lang === "ru" ? el.dataset.adminLocaleTitle : translate(el.dataset.adminLocaleTitle, titleDict());
    }
    if (el.placeholder) {
      el.dataset.adminLocalePlaceholder = el.dataset.adminLocalePlaceholder || el.placeholder;
      el.placeholder = lang === "ru" ? el.dataset.adminLocalePlaceholder : translate(el.dataset.adminLocalePlaceholder, phDict());
    }
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else if (node.nodeType === Node.ELEMENT_NODE && !node.matches("script, style, input, textarea, code")) translateElement(node);
    });
  }

  function renderLangSwitch() {
    document.querySelectorAll("[data-admin-lang]").forEach((mount) => {
      mount.innerHTML = LANGS.map((code) => `<button type="button" data-set-admin-lang="${code}" class="${code === lang ? "is-on" : ""}">${LABELS[code]}</button>`).join("");
    });
  }

  function apply() {
    document.documentElement.lang = lang;
    document.title = translate(document.title, titleDict());
    translateElement(document.body);
    renderLangSwitch();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-set-admin-lang]");
    if (!button) return;
    lang = button.dataset.setAdminLang;
    localStorage.setItem("ml-lang", lang);
    localStorage.setItem("milana-lang", lang === "en" ? "ENG" : lang.toUpperCase());
    apply();
  });

  document.addEventListener("DOMContentLoaded", () => {
    apply();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") translateTextNode(record.target);
        record.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
