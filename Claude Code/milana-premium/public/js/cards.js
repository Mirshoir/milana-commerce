/* ============================================================
   MILANA — карточка товара (Lamoda-стиль):
   · курсор по фото листает снимки товара (сегменты сверху)
   · клик по размеру в панели «В корзину» → добавление
   Работает через делегирование: карточки рендерятся动态.
   ============================================================ */

/* лёгкая миниатюра для сеток: /uploads/thumbs/<base>.webp;
   полный файл остаётся в data-full как фолбэк */
window.MilanaThumb = (u) => /^\/uploads\/[\w.-]+\.(webp|png|jpe?g)$/i.test(String(u || ""))
  ? "/uploads/thumbs/" + String(u).slice(9).replace(/\.(png|jpe?g)$/i, ".webp")
  : u;

/* авто-слаги ткани/варианта («Туника-штапель-3/4») → читаемый вид с разделителем;
   строки с пробелами — уже нормальный текст, их не трогаем */
window.MilanaFab = (s) => {
  s = String(s || "");
  return s.includes(" ") ? s : s.replace(/-/g, " · ");
};

window.MilanaIsFabricPlaceholder = (value) =>
  /(?:состав\s+не\s+указан|composition\s+not\s+specified|tarkibi\s+ko['’‘ʻ`]?rsatilmagan)/iu
    .test(String(value || ""));

/* Карточки показывают только полезный текст. У старых товаров служебная
   заглушка заменяется фактическим составом из характеристик. */
window.MilanaFabricText = (product, lang) => {
  const activeLang = lang || (window.I18N && I18N.lang) || "ru";
  const fabric = product?.fabric || {};
  const raw = fabric[activeLang] || fabric.en || fabric.ru || fabric.uz || "";
  if (raw && !window.MilanaIsFabricPlaceholder(raw)) return window.MilanaFab(raw);
  const composition = String(product?.composition || "").trim();
  if (!composition) return "";
  return window.I18N && typeof I18N.fieldValue === "function"
    ? I18N.fieldValue("composition", composition)
    : composition;
};

/* локализованное имя товара: name_i18n из API, фолбэк — базовое name */
window.MilanaName = (p) => {
  if (window.I18N && typeof I18N.productName === "function") return I18N.productName(p);
  const l = (window.I18N && I18N.lang) || "ru";
  return (p && p.name_i18n && p.name_i18n[l]) || (p && p.name) || "";
};

(() => {
  "use strict";
  const apiItems = (payload) => Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.items) ? payload.items : []);
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---- листание фото курсором ---- */
  function setup(media) {
    if (media.dataset.hoverReady) return null;
    const imgs = (media.dataset.imgs || "").split("|").filter(Boolean).map(window.MilanaThumb);
    const img = media.querySelector("figure img");
    if (imgs.length < 2 || !img) { media.dataset.hoverReady = "0"; return null; }
    media.dataset.hoverReady = "1";
    /* сегменты-индикаторы */
    const segs = document.createElement("div");
    segs.className = "product__segs";
    segs.innerHTML = imgs.map((_, i) => `<i${i === 0 ? ' class="is-on"' : ""}></i>`).join("");
    media.appendChild(segs);
    /* предзагрузка остальных кадров */
    imgs.slice(1).forEach((u) => { const pre = new Image(); pre.src = u; });
    media._hover = { imgs, img, segs, idx: 0 };
    return media._hover;
  }

  function show(media, idx) {
    const h = media._hover;
    if (!h || idx === h.idx || !h.imgs[idx]) return;
    h.idx = idx;
    h.img.src = h.imgs[idx];
    [...h.segs.children].forEach((el, i) => el.classList.toggle("is-on", i === idx));
  }

  if (fine) {
    document.addEventListener("pointerenter", (e) => {
      const media = e.target.closest && e.target.closest(".product__media[data-imgs]");
      if (media) setup(media);
    }, true);
    document.addEventListener("pointermove", (e) => {
      const media = e.target.closest && e.target.closest(".product__media[data-imgs]");
      if (!media || media.dataset.hoverReady !== "1") return;
      const r = media.getBoundingClientRect();
      const n = media._hover.imgs.length;
      const idx = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)));
      show(media, idx);
    }, { passive: true });
    document.addEventListener("pointerout", (e) => {
      const media = e.target.closest && e.target.closest(".product__media[data-imgs]");
      if (media && media.dataset.hoverReady === "1" &&
          (!e.relatedTarget || !media.contains(e.relatedTarget))) show(media, 0);
    }, true);
  }

  /* ---- клик по размеру = добавить в корзину ---- */
  document.addEventListener("click", (e) => {
    const size = e.target.closest && e.target.closest(".product__quick .product__sizes span");
    if (!size) return;
    const quick = size.closest(".product__quick");
    const add = quick && quick.querySelector("[data-add]");
    if (add) { e.preventDefault(); e.stopPropagation(); add.click(); }
  }, true);

  /* ---- лента категорий: стрелки + прогресс ---- */
  const row = document.getElementById("cs-row");
  if (row) {
    const bar = document.getElementById("cs-bar");
    /* прокрутка на «страницу» видимой ширины (стрелки листают набор карточек) */
    const page = () => Math.max((row.firstElementChild ? row.firstElementChild.offsetWidth + 12 : 300), row.clientWidth * 0.85);
    document.getElementById("cs-prev")?.addEventListener("click", () => row.scrollBy({ left: -page(), behavior: "smooth" }));
    document.getElementById("cs-next")?.addEventListener("click", () => row.scrollBy({ left: page(), behavior: "smooth" }));
    const sync = () => {
      if (!bar) return;
      const max = row.scrollWidth - row.clientWidth;
      const frac = Math.min(1, row.clientWidth / row.scrollWidth);
      bar.style.width = (frac * 100) + "%";
      bar.style.transform = `translateX(${max > 0 ? (row.scrollLeft / max) * (100 / frac - 100) : 0}%)`;
    };
    row.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    window.addEventListener("load", sync);
    sync();
    /* перетаскивание курсором отключено — прокрутка стрелками, колесом и на тач */
  }

  /* ---- «Популярные товары»: лента внизу главной ---- */
  const pop = document.getElementById("pop-row");
  if (pop) {
    const esc2 = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const isCleanMedia = (src) => Boolean(src) && !/catalog-/i.test(String(src));
    const FALLBACK_POP = [
      "pmrlo8czo-400f22ac.webp", "pmrlk7am3-dd1aa8f4.webp",
      "pmrloe62a-800dfd84.webp", "pmrlkw1kq-94a08913.webp",
      "pmrlkb3hu-8f34e700.webp", "pmrlocny1-0e62fcbc.webp",
      "pmrlkcxu5-2c3ab779.webp", "pmrofns1v-3384c037.webp",
    ];
    pop.innerHTML = Array.from({ length: 5 }, () =>
      `<div class="pop-card is-skeleton"><figure></figure></div>`).join("");
    async function loadPop() {
      let items = [];
      try {
        const r = await fetch("/api/products?sort=popular&limit=12");
        if (!r.ok) throw new Error();
        const list = apiItems(await r.json());
        items = list
          .filter((p) => p.images && isCleanMedia(p.images[0]))
          .slice(0, 12)
          .map((p) => ({
            img: p.images[0], name: window.MilanaName ? MilanaName(p) : p.name, href: "/p/" + p.slug,
            price: p.price_visible === false
              ? (window.I18N ? I18N.t("price.manager") : "")
              : (window.I18N ? I18N.fmtPrice(p.price) : "$" + p.price),
          }));
      } catch { /* fallback ниже */ }
      if (items.length < 3) {
        items = FALLBACK_POP.map((f) => ({ img: "/uploads/" + f, name: "Milana Premium", href: "/shop", price: "" }));
      }
      pop.innerHTML = items.map((it) => `
        <a class="pop-card" href="${esc2(it.href)}">
          <figure><img src="${esc2(window.MilanaThumb(it.img))}" data-full="${esc2(it.img)}" alt="${esc2(it.name)}" loading="lazy" onerror="if(this.dataset.full&&this.src.indexOf('/uploads/thumbs/')>-1){this.src=this.dataset.full}else{this.style.display='none'}"></figure>
          <b>${esc2(it.name)}</b>
          <i>${esc2(it.price)}</i>
        </a>`).join("");
    }
    if (window.I18N) I18N.ready.then(loadPop); else loadPop();
    const popStep = () => (pop.firstElementChild ? pop.firstElementChild.offsetWidth + 12 : 300);
    document.getElementById("pop-prev")?.addEventListener("click", () => pop.scrollBy({ left: -popStep(), behavior: "smooth" }));
    document.getElementById("pop-next")?.addEventListener("click", () => pop.scrollBy({ left: popStep(), behavior: "smooth" }));
  }
})();

/* ============================================================
   СЕЗОННАЯ ЛЕНТА (главная) — живые товары летней коллекции.
   Подбор по ключевым словам сезона; если каталог недоступен,
   остаются статичные категории из разметки.
   ============================================================ */
(() => {
  "use strict";
  const row = document.getElementById("cs-row");
  if (!row || !document.querySelector(".catstrip__label[data-i18n='season.label']")) return;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const apiItems = (payload) => Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.items) ? payload.items : []);
  const fmt = (n) => (window.I18N ? I18N.fmtPrice(n) : "$" + n);
  const COLLECTION = "ss26";                                   // новая коллекция «Весна–Лето 26»
  const KEYWORDS = ["штапель", "туника", "шорты", "сорочка", "лямка", "к/р"]; // фолбэк, пока коллекция пуста

  const cardHTML = (p) => `
    <a class="catstrip__item" href="/p/${esc(p.slug)}">
      <figure><img src="${esc(window.MilanaThumb(p.images[0]))}" data-full="${esc(p.images[0])}" alt="${esc(window.MilanaName(p))}" loading="lazy" onerror="if(this.dataset.full&&this.src.indexOf('/uploads/thumbs/')>-1){this.src=this.dataset.full}else{this.style.display='none'}"></figure>
      <b>${esc(window.MilanaName(p))}</b>
      <span class="catstrip__price">${p.price_visible === false ? "" : esc(fmt(p.price))}</span>
    </a>`;

  async function collectionItems() {
    try {
      const r = await fetch("/api/products?collection=" + COLLECTION + "&limit=40");
      if (!r.ok) return [];
      return apiItems(await r.json()).filter((p) => p.images && p.images[0]);
    } catch { return []; }
  }

  async function keywordItems() {
    try {
      const lists = await Promise.all(KEYWORDS.map((q) =>
        fetch("/api/products?q=" + encodeURIComponent(q) + "&limit=6").then((r) => (r.ok ? r.json() : [])).catch(() => [])));
      const seen = new Set(); const items = [];
      for (const list of lists) for (const p of apiItems(list)) {
        if (!p || seen.has(p.id) || !(p.images && p.images[0])) continue;
        seen.add(p.id); items.push(p);
      }
      return items;
    } catch { return []; }
  }

  async function load() {
    let items = await collectionItems();                 // приоритет — товары новой коллекции
    if (items.length < 4) items = await keywordItems();  // фолбэк, пока в коллекции нет товаров
    if (items.length < 4) return;                        // совсем мало — оставляем статичные плитки
    row.innerHTML = items.slice(0, 16).map(cardHTML).join("");
    row.scrollTo({ left: 0 });
    row.dispatchEvent(new Event("scroll"));
  }

  if (window.I18N) I18N.ready.then(load); else load();
  window.addEventListener("i18n:change", load);
})();

/* ============================================================
   КАТЕГОРИИ «Одежда для всей семьи» — смена фото при наведении
   (кроссфейд по товарам из той же категории)
   ============================================================ */
(() => {
  "use strict";
  const cards = document.querySelectorAll("#categories .cat-card");
  if (!cards.length) return;
  const apiItems = (payload) => Array.isArray(payload) ? payload : (payload && Array.isArray(payload.items) ? payload.items : []);
  const isClean = (src) => Boolean(src) && !/catalog-/i.test(String(src));
  const thumb = (u) => (window.MilanaThumb ? window.MilanaThumb(u) : u);
  const escq = (s) => String(s).replace(/"/g, "&quot;");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function imagesFor(href) {
    let q = "sort=popular&limit=12";                       // «для всей семьи» (unisex пуст) → популярный микс
    try {
      const g = new URL(href, location.origin).searchParams.get("gender");
      if (["women", "men", "kids"].includes(g)) q = "gender=" + g + "&limit=12";
    } catch {}
    try {
      const r = await fetch("/api/products?" + q);
      if (!r.ok) return [];
      const seen = new Set();
      return apiItems(await r.json())
        .map((p) => p.images && p.images[0])
        .filter((im) => im && isClean(im) && !seen.has(im) && seen.add(im))
        .slice(0, 5);
    } catch { return []; }
  }

  cards.forEach(async (card) => {
    const fig = card.querySelector("figure");
    if (!fig) return;
    const firstImg = fig.querySelector("img");
    const original = firstImg ? (firstImg.getAttribute("data-full") || firstImg.getAttribute("src") || "") : "";
    let imgs = await imagesFor(card.getAttribute("href") || "");
    imgs = [original, ...imgs.filter((u) => u && u !== original)].filter(Boolean).slice(0, 5);
    if (imgs.length < 2) return;
    fig.innerHTML = imgs.map((u, i) =>
      `<img src="${escq(thumb(u))}" data-full="${escq(u)}" alt="" loading="lazy" class="cat-card__ph${i === 0 ? " is-on" : ""}" draggable="false" onerror="if(this.dataset.full&&this.src.indexOf('/uploads/thumbs/')>-1){this.src=this.dataset.full}else{this.style.display='none'}">`).join("");
    const phs = [...fig.querySelectorAll(".cat-card__ph")];
    let idx = 0, timer = null;
    const show = (i) => phs.forEach((im, k) => im.classList.toggle("is-on", k === i));
    card.addEventListener("mouseenter", () => {
      if (reduce) return;
      clearInterval(timer);
      timer = setInterval(() => { idx = (idx + 1) % phs.length; show(idx); }, 850);
    });
    card.addEventListener("mouseleave", () => { clearInterval(timer); idx = 0; show(0); });
  });
})();
