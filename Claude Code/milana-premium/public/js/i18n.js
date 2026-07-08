/* ============================================================
   MILANA — i18n (UZ / RU / ENG) + shared site settings
   Usage: <el data-i18n="key">, <input data-i18n-ph="key">
   window.I18N = { lang, t, set, ready, fmtPrice, catName }
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

  async function loadDict(l) {
    if (dicts[l]) return dicts[l];
    const r = await fetch("/lang/" + l + ".json");
    dicts[l] = await r.json();
    return dicts[l];
  }

  function t(key, vars) {
    let s = (dicts[lang] && dicts[lang][key]) ?? (dicts.en && dicts.en[key]) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace("{" + k + "}", v);
    return s;
  }

  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = t(el.dataset.i18n);
      if (v !== el.dataset.i18n || lang === "en") el.textContent = v;
    });
    root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    root.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
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
      mount.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-lang]");
        if (b) set(b.dataset.lang);
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

  /* fill contact links (data-dyn) + apply accent theme — runs on every page */
  function applyDynamic() {
    const s = settings;
    if (!s) return;
    if (/^#[0-9a-f]{6}$/i.test(s.accent || "")) document.documentElement.style.setProperty("--burgundy", s.accent);
    if (/^#[0-9a-f]{6}$/i.test(s.accent_dark || "")) document.documentElement.style.setProperty("--burgundy-2", s.accent_dark);
    const each = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
    if (s.whatsapp) each('[data-dyn="wa"]', (a) => {
      a.href = "https://wa.me/" + s.whatsapp + (a.dataset.waText ? "?text=" + encodeURIComponent(a.dataset.waText) : "");
    });
    if (s.telegram) each('[data-dyn="tg"]', (a) => (a.href = "https://t.me/" + s.telegram));
    if (s.instagram) each('[data-dyn="ig"]', (a) => (a.href = "https://instagram.com/" + s.instagram));
    if (s.phone) each('[data-dyn="tel"]', (a) => { a.href = "tel:" + s.phone.replace(/[^\d+]/g, ""); if (a.dataset.text !== "keep") a.textContent = s.phone; });
    if (s.email) each('[data-dyn="mail"]', (a) => { a.href = "mailto:" + s.email; a.textContent = s.email; });
    each('[data-dyn="address"]', (el) => (el.textContent = s["address_" + lang] || s.address_en || ""));
    if (s.instagram) each('[data-dyn="ig-handle"]', (el) => (el.textContent = "@" + s.instagram));
  }

  const ready = Promise.all([loadDict("en"), lang !== "en" ? loadDict(lang) : null, settingsReady])
    .then(() => { buildSwitchers(); apply(); applyDynamic(); });

  window.I18N = {
    get lang() { return lang; },
    t, set, apply, ready, fmtPrice, fmtBagPrice, bagPrice, catName, applyDynamic,
    BAG_SIZE,
    get settings() { return settings || {}; },
  };
})();
