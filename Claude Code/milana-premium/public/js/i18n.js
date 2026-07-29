/* ============================================================
   MILANA — i18n (UZ / RU / ENG) + shared site settings
   Usage: <el data-i18n="key">, <input data-i18n-ph="key">
   window.I18N = { lang, t, set, ready, fmtPrice, catName, productName, packageText }
   ============================================================ */
(() => {
  "use strict";

  const LANGS = ["uz", "ru", "en"];
  const LANG_LABELS = { uz: "UZ", ru: "RU", en: "ENG" };
  const dicts = {};
  let lang = localStorage.getItem("ml-lang");
  if (!LANGS.includes(lang)) {
    const nav = (navigator.language || "en").toLowerCase();
    lang = nav.startsWith("ru") ? "ru" : nav.startsWith("uz") ? "uz" : "en";
  }

  let settings = null;
  const settingsReady = fetch("/api/settings")
    .then((r) => r.json())
    .then((s) => { settings = s; window.SITE_SETTINGS = s; return s; })
    .catch(() => (settings = {}));

  /* переопределения текстов из админ-конструктора (settings.site_config) */
  let siteCfg = null;
  const siteCfgReady = settingsReady.then((s) => {
    try { siteCfg = s && s.site_config ? JSON.parse(s.site_config) : null; } catch { siteCfg = null; }
    window.SITE_CONFIG = siteCfg;
    return siteCfg;
  });

  async function loadDict(l) {
    if (dicts[l]) return dicts[l];
    const r = await fetch("/lang/" + l + ".json");
    dicts[l] = await r.json();
    const cfg = await siteCfgReady;
    if (cfg && cfg.texts && cfg.texts[l]) {
      for (const [k, v] of Object.entries(cfg.texts[l])) if (v) dicts[l][k] = v;
    }
    return dicts[l];
  }

  function t(key, vars) {
    let s = (dicts[lang] && dicts[lang][key]) ?? (dicts.en && dicts.en[key]) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace("{" + k + "}", v);
    return s;
  }

  const SAFE_TAGS = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, BR: 1, A: 1 };
  const KILL_TAGS = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, LINK: 1, META: 1 };
  function sanitizeHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html);
    (function walk(node) {
      [...node.children].forEach((element) => {
        if (KILL_TAGS[element.tagName]) { element.remove(); return; }
        walk(element);
        if (!SAFE_TAGS[element.tagName]) { element.replaceWith(...element.childNodes); return; }
        [...element.attributes].forEach((attribute) => {
          if (element.tagName === "A" && attribute.name === "href"
            && /^(https?:\/\/|\/|#|tel:|mailto:)/i.test(attribute.value)) return;
          element.removeAttribute(attribute.name);
        });
        if (element.tagName === "A") {
          if (!element.getAttribute("href")) { element.replaceWith(...element.childNodes); return; }
          if (/^https?:/i.test(element.getAttribute("href"))) {
            element.target = "_blank";
            element.rel = "noopener";
          }
        }
      });
    })(template.content);
    return template.innerHTML;
  }
  window.MilanaSanitize = sanitizeHtml;

  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = t(el.dataset.i18n);
      if (v !== el.dataset.i18n || lang === "en") {
        if (/<[a-z][^>]*>/i.test(v)) el.innerHTML = sanitizeHtml(v);
        else el.textContent = v;
      }
    });
    root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    root.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
    const legacyAria = {
      "Аккаунт": "auth.account",
      "Избранное": "auth.wishlist",
      "Корзина": "cart.title",
      "Основное меню": "aria.mainNav",
      "Мобильное меню": "aria.mobileNav",
      "Хлебные крошки": "aria.breadcrumbs",
      "Назад": "aria.prev",
      "Вперёд": "aria.next",
      "Открыть меню": "aria.openMenu",
      "Закрыть": "aria.close",
      "Закрыть фильтры": "aria.closeFilters",
      "Поиск": "aria.search",
      "Оценка": "aria.rating",
      "Наличие": "aria.availability",
      "Меньше": "aria.decrease",
      "Больше": "aria.increase",
      "В избранное": "aria.addWishlist",
      "Популярные товары": "aria.popularProducts",
      "Цена от": "aria.priceMin",
      "Цена до": "aria.priceMax",
      "Слайды": "aria.slides",
      "Сезонная коллекция": "aria.seasonalCollection",
      "Тип одежды": "shop.clothing",
      "Edit profile": "aria.editProfile",
      "Сортировка": "shop.sort",
      "Фильтры": "shop.filters",
      "Каталоги": "shop.catalogPanel",
      "Товары": "shop.title",
    };
    root.querySelectorAll("[aria-label]").forEach((el) => {
      const key = el.dataset.i18nAria || legacyAria[el.getAttribute("aria-label")];
      if (key) {
        el.dataset.i18nAria = key;
        el.setAttribute("aria-label", t(key));
      }
    });
    document.documentElement.lang = lang;
    if (dicts[lang] && dicts[lang]["meta.title"] && root === document) {
      if (!document.body.dataset.keepTitle) document.title = t("meta.title");
      const md = document.querySelector('meta[name="description"]');
      if (md) md.content = t("meta.desc");
    }
    document.querySelectorAll(".lang button").forEach((b) => b.classList.toggle("is-on", b.dataset.lang === lang));
  }

  async function set(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    localStorage.setItem("ml-lang", lang);
    await loadDict(lang);
    apply();
    applyDynamic();
    window.dispatchEvent(new CustomEvent("i18n:change", { detail: { lang } }));
  }

  function buildSwitchers() {
    document.querySelectorAll("[data-lang-mount]").forEach((mount) => {
      mount.innerHTML = LANGS.map((l) =>
        `<button type="button" data-lang="${l}" class="${l === lang ? "is-on" : ""}">${LANG_LABELS[l] || l.toUpperCase()}</button>`
      ).join("");
      mount.addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-lang]");
        if (!b) return;
        await set(b.dataset.lang);
        if (mount.closest(".menu")?.classList.contains("is-open")) {
          document.querySelector(".burger")?.click();
        }
      });
    });
  }

  function fmtPrice(n) {
    const num = Math.round(Number(n) * 100) / 100;
    const txt = (num % 1 ? num.toFixed(2) : String(num)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return "$" + txt;
  }

  const BAG_SIZE = 60;
  const bagPrice = (unitPrice, bags = 1) => Number(unitPrice || 0) * BAG_SIZE * Number(bags || 1);
  const fmtBagPrice = (unitPrice, bags = 1) => fmtPrice(bagPrice(unitPrice, bags));

  const catName = (c) => t("cats." + c);
  const panelName = (panel) => t("panels." + panel);

  const PRODUCT_TYPE_PATTERNS = [
    ["sarochka", /сорочк|sarochka|nightdress|nightgown/],
    ["robe", /халат|robe|xalat/],
    ["tunic", /туник|tunic|tunika/],
    ["pajamas", /пижам|pajama|pijama/],
    ["tracksuit", /спортивк|tracksuit/],
    ["hoodie", /худи|hoodie/],
    ["dress", /плать|dress|анжелика/],
    ["polo", /поло|polo/],
    ["shirt", /рубашк|shirt/],
    ["set", /тройк|комплект|футболк.*(?:шорт|бридж|штан)|(?:майка|лямка).*(?:шорт|бридж)|set/],
    ["trousers", /штаны|брюки|trouser|pants/],
    ["tshirt", /футболк|t-shirt|tshirt/],
    ["shorts", /шорт|shorts/],
    ["top", /майка|top|tank/],
  ];

  const PRODUCT_TYPES = new Set([
    "tunic", "sarochka", "robe", "pajamas", "set", "tracksuit", "hoodie",
    "dress", "shirt", "polo", "trousers", "tshirt", "shorts", "top",
    "homewear", "clothing",
  ]);

  function inferProductType(p) {
    /* These panels are garment-specific and correct known imported rows where
       photo classification stored the generic type "dress". */
    const panelType = {
      tunics: "tunic",
      robes: "robe",
      nightgowns: "sarochka",
    }[String(p.catalog_panel || "").toLowerCase()];
    if (panelType) return panelType;

    const translatedNames = p.name_i18n && typeof p.name_i18n === "object"
      ? Object.values(p.name_i18n)
      : [];
    const source = [
      p.name, ...translatedNames, p.slug, p.model_no, p.variant,
    ].filter(Boolean).join(" ").toLowerCase();
    const fromName = PRODUCT_TYPE_PATTERNS.find(([, pattern]) => pattern.test(source))?.[0];
    if (fromName) return fromName;

    const declared = String(p.product_type || "").toLowerCase();
    if (PRODUCT_TYPES.has(declared)) return declared;

    return ({
      robes: "robe",
      pajamas: "pajamas",
      loungewear: "homewear",
      homewear: "homewear",
    })[String(p.category || "").toLowerCase()] || "clothing";
  }

  function productName(product) {
    const p = typeof product === "string" ? { name: product } : (product || {});
    return t("productType." + inferProductType(p));
  }

  function packageText(value) {
    let text = String(value || "");
    if (lang === "en") {
      return text
        .replace(/\bQadoq\b/g, "Pack").replace(/\bqadoq\b/g, "pack")
        .replace(/\bQop\b/g, "Bag").replace(/\bqop\b/g, "bag");
    }
    if (lang === "ru") {
      return text
        .replace(/от 1 Qadoq/g, "от 1 упаковки")
        .replace(/или 1 Qop/g, "или 1 мешка")
        .replace(/\bQadoq\b/g, "Упаковка").replace(/\bqadoq\b/g, "упаковка")
        .replace(/\bQop\b/g, "Мешок").replace(/\bqop\b/g, "мешок");
    }
    return text;
  }

  /* fill contact links (data-dyn) + apply accent theme — runs on every page */
  function applyDynamic() {
    const s = settings;
    if (!s) return;
    if (/^#[0-9a-f]{6}$/i.test(s.accent || "")) document.documentElement.style.setProperty("--burgundy", s.accent);
    if (/^#[0-9a-f]{6}$/i.test(s.accent_dark || "")) document.documentElement.style.setProperty("--burgundy-2", s.accent_dark);
    if (s.hero_gap !== undefined && s.hero_gap !== "" && Number.isFinite(Number(s.hero_gap))) {
      document.documentElement.style.setProperty("--hero-gap", Number(s.hero_gap) + "em");
    }
    const each = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
    if (s.whatsapp) each('[data-dyn="wa"]', (a) => {
      a.href = "https://wa.me/" + s.whatsapp + (a.dataset.waText ? "?text=" + encodeURIComponent(a.dataset.waText) : "");
    });
    if (s.telegram) each('[data-dyn="tg"]', (a) => (a.href = "https://t.me/" + s.telegram));
    if (s.instagram) each('[data-dyn="ig"]', (a) => (a.href = "https://www.instagram.com/" + s.instagram));
    if (s.phone) each('[data-dyn="tel"]', (a) => { a.href = "tel:" + s.phone.replace(/[^\d+]/g, ""); if (a.dataset.text !== "keep") a.textContent = s.phone; });
    if (s.email) each('[data-dyn="mail"]', (a) => { a.href = "mailto:" + s.email; a.textContent = s.email; });
    each('[data-dyn="address"]', (el) => (el.textContent = s["address_" + lang] || s.address_en || ""));
    if (s.instagram) each('[data-dyn="ig-handle"]', (el) => (el.textContent = "@" + s.instagram));
  }

  const ready = Promise.all([loadDict("en"), lang !== "en" ? loadDict(lang) : null, settingsReady])
    .then(() => { buildSwitchers(); apply(); applyDynamic(); });

  /* размеры вроде «Свободный размер» переводим; цифровые оставляем как есть */
  const SIZE_KEYS = { "свободный размер": "size.free", "free size": "size.free", "erkin o‘lcham": "size.free", "erkin o'lcham": "size.free" };
  function sizeLabel(value) {
    const raw = String(value ?? "").trim();
    const key = SIZE_KEYS[raw.toLowerCase()];
    return key ? t(key) : raw;
  }

  window.I18N = {
    get lang() { return lang; },
    t, set, apply, ready, fmtPrice, fmtBagPrice, bagPrice, catName, panelName, productName, packageText, applyDynamic,
    sizeLabel,
    BAG_SIZE,
    get settings() { return settings || {}; },
  };
})();
