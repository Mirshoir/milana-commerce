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
    const r = await fetch("/lang/" + l + ".json?v=20260801-clothing-sets1");
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

  const normalizeLabel = (value) => String(value || "").toLowerCase()
    .replace(/[’‘`ʻ]/g, "'").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  const CATEGORY_ALIASES = {
    pajama: "cats.pajamas", pajamas: "cats.pajamas", "пижама": "cats.pajamas", "пижамы": "cats.pajamas", pijama: "cats.pajamas", pijamalar: "cats.pajamas",
    robe: "cats.robes", robes: "cats.robes", "халат": "cats.robes", "халаты": "cats.robes", xalat: "cats.robes", xalatlar: "cats.robes",
    homewear: "cats.homewear", "home wear": "cats.homewear", "домашняя одежда": "cats.homewear", "uy kiyimi": "cats.homewear", "uy kiyimlari": "cats.homewear",
    loungewear: "cats.loungewear", "lounge wear": "cats.loungewear", "лаунж сеты": "cats.loungewear", "lounge to'plamlar": "cats.loungewear",
    tunic: "productType.tunic", tunics: "productType.tunic", "туника": "productType.tunic", "туники": "productType.tunic", tunika: "productType.tunic",
    sarochka: "productType.sarochka", "сорочка": "productType.sarochka", "сорочки": "productType.sarochka",
    dress: "cats.dresses", dresses: "cats.dresses", "платье": "cats.dresses", "платья": "cats.dresses", "ko'ylaklar": "cats.dresses",
    trousers: "productType.trousers", pants: "productType.trousers", "штаны": "productType.trousers", "брюки": "productType.trousers", shim: "productType.trousers",
    "t shirt": "productType.tshirt", tshirt: "productType.tshirt", "футболка": "productType.tshirt", "футболки": "productType.tshirt", futbolka: "productType.tshirt",
    capri: "productType.capri", "capri pants": "productType.capri", "бриджи": "productType.capri", "kapri shim": "productType.capri",
    set: "productType.set", sets: "productType.set", "комплект": "productType.set", "комплекты": "productType.set", "to'plam": "productType.set",
  };
  const catName = (c) => {
    const alias = CATEGORY_ALIASES[normalizeLabel(c)];
    if (alias) return t(alias);
    const key = "cats." + c;
    const translated = t(key);
    if (translated !== key) return translated;
    return String(c || "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
  };
  const panelName = (panel) => {
    const key = "panels." + panel;
    const translated = t(key);
    return translated === key ? catName(panel) : translated;
  };

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
    ["capri", /бридж|capri|kapri/],
    ["shorts", /шорт|shorts/],
    ["top", /майка|top|tank/],
  ];

  const PRODUCT_TYPES = new Set([
    "tunic", "sarochka", "robe", "pajamas", "set", "tracksuit", "hoodie",
    "dress", "shirt", "polo", "trousers", "tshirt", "capri", "shorts", "top",
    "homewear", "clothing",
  ]);

  function inferProductType(p) {
    const rawDeclared = String(p.product_type || "").trim();
    const declared = rawDeclared.toLowerCase();
    if (PRODUCT_TYPES.has(declared)) return declared;
    if (rawDeclared) return rawDeclared;

    /* Use panel and name inference only for legacy/imported rows that do not
       yet have a valid type selected in the admin panel. */
    const panelType = {
      tunics: "tunic",
      robes: "robe",
      nightgowns: "sarochka",
      clothing_sets: "set",
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

    return ({
      robes: "robe",
      pajamas: "pajamas",
      loungewear: "homewear",
      homewear: "homewear",
    })[String(p.category || "").toLowerCase()] || "clothing";
  }

  function productName(product) {
    const p = typeof product === "string" ? { name: product } : (product || {});
    const type = inferProductType(p);
    const key = "productType." + type;
    const translated = t(key);
    return translated === key ? catName(type) : translated;
  }

  function packageText(value) {
    const localizedToken = (match, key) => {
      const label = t(key);
      return match === match.toLowerCase() ? label.toLocaleLowerCase(lang) : label;
    };
    return String(value || "")
      .replace(/\bqadoq\b/giu, (match) => localizedToken(match, "prod.unitPack"))
      .replace(/\bqop\b/giu, (match) => localizedToken(match, "prod.unitBag"));
  }

  const FIELD_VALUE_ALIASES = {
    country: {
      uzbekistan: "spec.country.uzbekistan", "узбекистан": "spec.country.uzbekistan",
      "o'zbekiston": "spec.country.uzbekistan",
    },
    season: {
      "all season": "spec.season.all", "all-season": "spec.season.all", "всесезон": "spec.season.all",
      "всесезонный": "spec.season.all", "barcha mavsum": "spec.season.all",
      summer: "spec.season.summer", "лето": "spec.season.summer", yoz: "spec.season.summer",
      "demi season": "spec.season.demi", "demi-season": "spec.season.demi", "демисезон": "spec.season.demi",
      "mavsum oralig'i": "spec.season.demi", winter: "spec.season.winter", "зима": "spec.season.winter", qish: "spec.season.winter",
    },
    material: {
      "бамбуковая ткань": "spec.material.bamboo", bamboo: "spec.material.bamboo",
      "хлопковая ткань": "spec.material.cotton", "cotton fabric": "spec.material.cotton",
      "вискозная ткань": "spec.material.viscose", "viscose fabric": "spec.material.viscose",
      "шёлковая ткань": "spec.material.silk", "шелковая ткань": "spec.material.silk", "silk fabric": "spec.material.silk",
      "атласная ткань": "spec.material.satin", satin: "spec.material.satin",
      "муслин": "spec.material.muslin", muslin: "spec.material.muslin",
      "ткань модал": "spec.material.modal", modal: "spec.material.modal",
      "велюр": "spec.material.velour", velour: "spec.material.velour",
      "трикотаж с начёсом": "spec.material.brushedKnit", "трикотаж с начесом": "spec.material.brushedKnit",
      "brushed knit": "spec.material.brushedKnit",
      "супрем": "spec.material.suprem", "трикотаж супрем": "spec.material.suprem", suprem: "spec.material.suprem",
      "трикотаж лапша": "spec.material.ribKnit", "ажурная рибана": "spec.material.ribKnit", "rib knit": "spec.material.ribKnit",
      "штапель": "spec.material.staple", staple: "spec.material.staple",
      "двухнитка": "spec.material.twoThread", "двухниточный трикотаж": "spec.material.twoThread", "two-thread knit": "spec.material.twoThread",
      "трёхнитка": "spec.material.threeThread", "трехнитка": "spec.material.threeThread",
      "трёхниточный трикотаж": "spec.material.threeThread", "трехниточный трикотаж": "spec.material.threeThread",
      "three-thread knit": "spec.material.threeThread",
      "трикотаж": "spec.material.knit", knit: "spec.material.knit",
      "полиэстеровая ткань": "spec.material.polyester", "polyester fabric": "spec.material.polyester",
    },
    color: {
      burgundy: "spec.color.burgundy", "бордовый": "spec.color.burgundy", bordo: "spec.color.burgundy",
      black: "spec.color.black", "чёрный": "spec.color.black", "черный": "spec.color.black", qora: "spec.color.black",
      white: "spec.color.white", "белый": "spec.color.white", oq: "spec.color.white",
      red: "spec.color.red", "красный": "spec.color.red", qizil: "spec.color.red",
      blue: "spec.color.blue", "синий": "spec.color.blue", "голубой": "spec.color.blue", "ko'k": "spec.color.blue",
      green: "spec.color.green", "зелёный": "spec.color.green", "зеленый": "spec.color.green", yashil: "spec.color.green",
      grey: "spec.color.grey", gray: "spec.color.grey", "серый": "spec.color.grey", kulrang: "spec.color.grey",
      beige: "spec.color.beige", "бежевый": "spec.color.beige",
      brown: "spec.color.brown", "коричневый": "spec.color.brown", jigarrang: "spec.color.brown",
      pink: "spec.color.pink", "розовый": "spec.color.pink", pushti: "spec.color.pink",
      purple: "spec.color.purple", "фиолетовый": "spec.color.purple", binafsha: "spec.color.purple",
      yellow: "spec.color.yellow", "жёлтый": "spec.color.yellow", "желтый": "spec.color.yellow", sariq: "spec.color.yellow",
    },
  };
  const FIBER_ALIASES = [
    [/(?:хлопок|cotton|paxta)/giu, "spec.fiber.cotton"],
    [/(?:полиэстер|polyester)/giu, "spec.fiber.polyester"],
    [/(?:эластан|elastane|elastan)/giu, "spec.fiber.elastane"],
    [/(?:вискоза|viscose|viskoza)/giu, "spec.fiber.viscose"],
    [/(?:спандекс|spandex)/giu, "spec.fiber.spandex"],
  ];
  function fieldValue(kind, value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const key = FIELD_VALUE_ALIASES[kind]?.[normalizeLabel(raw)];
    if (key) return t(key);
    if (kind === "composition") {
      return FIBER_ALIASES.reduce((text, [pattern, fiberKey]) => text.replace(pattern, t(fiberKey)), raw);
    }
    return raw;
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
    t, set, apply, ready, fmtPrice, fmtBagPrice, bagPrice, catName, panelName, productName, packageText, fieldValue, applyDynamic,
    sizeLabel,
    BAG_SIZE,
    get settings() { return settings || {}; },
  };
})();
