/* ============================================================
   MILANA — применение настроек конструктора (site_config)
   Секции главной: скрытие + порядок. Промо-строка: на всех страницах.
   Тексты применяются в i18n.js (вливаются в словари).
   ============================================================ */
(() => {
  "use strict";

  const MAP = {
    promo: ".promo",
    hero: ".hero",
    services: ".services",
    catstrip: ".catstrip",
    categories: "#categories",
    bestsellers: "#bestsellers",
    types: "#types",
    lookbook: "#lookbook",
    band: "#contact",
    maison: "#maison",
    wholesale: "#wholesale",
    faq: "#faq",
    map: "#map",
  };

  async function getConfig() {
    if (window.SITE_CONFIG !== undefined) return window.SITE_CONFIG;
    try {
      const s = await (await fetch("/api/settings")).json();
      return s.site_config ? JSON.parse(s.site_config) : null;
    } catch { return null; }
  }

  /* типографика из админки: инъекция CSS-переопределений */
  function applyTypography(cfg) {
    const t = cfg && cfg.typography;
    if (!t || !Object.keys(t).length) return;
    const rules = [];
    /* смена шрифта: пресеты или загруженный файл */
    if (t.font === "system-sans") {
      rules.push(':root{--f-sans:"Helvetica Neue",Arial,sans-serif;--f-serif:"Helvetica Neue",Arial,sans-serif}');
    } else if (t.font === "system-serif") {
      rules.push(':root{--f-sans:Georgia,"Times New Roman",serif;--f-serif:Georgia,"Times New Roman",serif}');
    } else if (t.font === "custom" && t.fontUrl) {
      const fmt = t.fontUrl.endsWith(".woff2") ? "woff2" : t.fontUrl.endsWith(".woff") ? "woff"
        : t.fontUrl.endsWith(".otf") ? "opentype" : "truetype";
      rules.push('@font-face{font-family:"SiteCustom";src:url("' + t.fontUrl + '") format("' + fmt + '");font-display:swap}');
      rules.push(':root{--f-sans:"SiteCustom","Lato","Helvetica Neue",Arial,sans-serif;--f-serif:"SiteCustom","Lato",sans-serif}');
      /* один файл = одно начертание: убираем сверхтонкие веса, которых в файле нет */
      rules.push('.t-xxl,.pl-m,.pl-a{font-weight:400 !important}');
    }
    const body = [];
    if (t.base) body.push("font-size:" + Number(t.base) + "px !important");
    if (t.lh) body.push("line-height:" + Number(t.lh) + " !important");
    if (body.length) rules.push("body{" + body.join(";") + "}");
    if (t.hscale && Number(t.hscale) !== 100) {
      const k = Number(t.hscale) / 100;
      rules.push(":root{--typo-scale:" + k + "}");
      rules.push(".t-xxl{font-size:clamp(calc(38px*var(--typo-scale)),calc(5.4vw*var(--typo-scale)),calc(76px*var(--typo-scale))) !important}");
      rules.push(".t-xl{font-size:clamp(calc(28px*var(--typo-scale)),calc(3.4vw*var(--typo-scale)),calc(46px*var(--typo-scale))) !important}");
      rules.push(".t-lg{font-size:clamp(calc(23px*var(--typo-scale)),calc(2.5vw*var(--typo-scale)),calc(34px*var(--typo-scale))) !important}");
    }
    const head = [];
    if (t.hweight) head.push("font-weight:" + Number(t.hweight) + " !important");
    if (t.hspacing) head.push("letter-spacing:" + t.hspacing + "em !important");
    if (t.hcase === "uppercase") head.push("text-transform:uppercase !important");
    if (head.length) rules.push(".t-display,.t-display span,.t-display i{" + head.join(";") + "}");
    if (!rules.length) return;
    const style = document.createElement("style");
    style.id = "typo-style";
    style.textContent = rules.join("\n");
    document.head.appendChild(style);
  }

  async function run() {
    const cfg = await getConfig();
    applyTypography(cfg);
    const sec = cfg && cfg.sections;
    if (!sec) return;

    /* скрытые блоки */
    (sec.hidden || []).forEach((id) => {
      const el = MAP[id] && document.querySelector(MAP[id]);
      if (el) el.style.display = "none";
    });

    /* порядок секций главной */
    const main = document.querySelector("main");
    if (main && Array.isArray(sec.order) && sec.order.length) {
      sec.order.forEach((id) => {
        if (id === "promo") return;
        const el = MAP[id] && main.querySelector(":scope > " + MAP[id]);
        if (el) main.appendChild(el);
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
