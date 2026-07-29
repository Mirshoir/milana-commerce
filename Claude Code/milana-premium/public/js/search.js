/* ============================================================
   MILANA — поиск в шапке (панель под хедером, живые подсказки)
   Открытие: [data-search-open] · Закрытие: Esc / вуаль / ✕
   Данные: /api/products?q= (debounce 250ms)
   Enter или «Смотреть все» → /shop?q=…
   ============================================================ */
(() => {
  "use strict";

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const t = (k) => (window.I18N ? I18N.t(k) : k);
  const fmt = (n) => (window.I18N ? I18N.fmtPrice(n) : "$" + n);

  /* ---------- разметка панели ---------- */
  const root = document.createElement("div");
  root.className = "hsearch";
  root.innerHTML = `
    <div class="hsearch__veil" data-search-close></div>
    <div class="hsearch__panel" role="dialog" aria-modal="true" aria-label="Поиск">
      <div class="container hsearch__in">
        <form class="hsearch__form" role="search">
          <svg class="ic"><use href="#i-search"/></svg>
          <input type="search" autocomplete="off" spellcheck="false" aria-label="Поиск">
          <button type="button" class="hsearch__x" data-search-close aria-label="Закрыть">&#10005;</button>
        </form>
        <div class="hsearch__body">
          <div class="hsearch__results" hidden></div>
          <p class="hsearch__note" hidden></p>
          <a class="hsearch__all link-underline" href="/shop" hidden></a>
        </div>
      </div>
    </div>`;
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(root));

  const input = root.querySelector("input");
  const form = root.querySelector(".hsearch__form");
  const resultsEl = root.querySelector(".hsearch__results");
  const noteEl = root.querySelector(".hsearch__note");
  const allEl = root.querySelector(".hsearch__all");

  function applyText() {
    input.placeholder = t("search.site");
    input.setAttribute("aria-label", t("aria.search"));
    root.querySelector(".hsearch__panel")?.setAttribute("aria-label", t("aria.search"));
    root.querySelector("[data-search-close]")?.setAttribute("aria-label", t("aria.close"));
    allEl.textContent = t("preview.viewAll");
  }
  if (window.I18N) I18N.ready.then(applyText); else applyText();
  window.addEventListener("i18n:change", applyText);

  /* ---------- открытие / закрытие ---------- */
  function open() {
    root.classList.add("is-open");
    document.body.style.overflow = "hidden";
    setTimeout(() => input.focus(), 60);
  }
  function close() {
    root.classList.remove("is-open");
    document.body.style.overflow = "";
  }
  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-search-open]");
    if (opener) { e.preventDefault(); open(); return; }
    if (e.target.closest("[data-search-close]")) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "/" && !root.classList.contains("is-open") &&
        !(e.target.closest && e.target.closest("input, textarea, select"))) {
      e.preventDefault(); open();
    }
  });

  /* ---------- разделы сайта (поиск по сайту) ---------- */
  const PAGES = [
    { href: "/shop", key: "nav.shop", kw: "каталог все товары catalog all products katalog" },
    { href: "/shop?tag=bestseller", key: "nav.bestsellers", kw: "хиты продаж bestseller top" },
    { href: "/ordering", key: "terms.navOrdering", kw: "опт заказ доставка оплата мешок wholesale order delivery qadoq qop buyurtma" },
    { href: "/#maison", key: "nav.maison", kw: "бренд фабрика о нас brand factory about fabrika" },
    { href: "/#faq", key: "foot.faq", kw: "вопросы ответы faq savollar" },
    { href: "/support", key: "support.title", kw: "поддержка помощь контакты support help yordam" },
    { href: "/terms", key: "terms.title", kw: "условия правила terms shartlar" },
    { href: "/signin", key: "auth.account", kw: "вход аккаунт профиль кабинет login account profile kirish" },
    { href: "/shop?category=pajamas", key: "cats.pajamas", kw: "пижамы pajamas pijama" },
    { href: "/shop?category=robes", key: "cats.robes", kw: "халаты robes xalat" },
    { href: "/shop?category=homewear", key: "cats.homewear", kw: "домашняя одежда homewear uy kiyimi" },
    { href: "/shop?category=loungewear", key: "cats.loungewear", kw: "лаунж сеты loungewear" },
    { href: "/shop?gender=women", key: "cats.women", kw: "женщинам женская women ayollar" },
    { href: "/shop?gender=men", key: "cats.men", kw: "мужчинам мужская men erkaklar" },
    { href: "/shop?gender=kids", key: "cats.kids", kw: "детям детская kids bolalar" },
  ];
  const norm = (x) => String(x || "").toLowerCase().replace(/\u0451/g, "\u0435");
  function pagesFor(q) {
    const n = norm(q);
    if (n.length < 2) return [];
    return PAGES.map((pg) => ({ ...pg, title: t(pg.key) }))
      .filter((pg) => pg.title && pg.title !== pg.key)
      .filter((pg) => norm(pg.title).includes(n) || norm(pg.kw).includes(n))
      .slice(0, 4);
  }

  /* ---------- живые подсказки ---------- */
  let timer, seq = 0;
  function setState({ results = null, note = "", loading = false, showAll = false, q = "", pages = [] }) {
    resultsEl.hidden = (!results || !results.length) && !pages.length;
    noteEl.hidden = !note && !loading;
    noteEl.textContent = loading ? "…" : note;
    allEl.hidden = !showAll;
    allEl.href = "/shop" + (q ? "?q=" + encodeURIComponent(q) : "");
    const pagesHtml = pages.length ? `<p class="hsearch__cap">${esc(t("search.sections"))}</p>` + pages.map((pg) => `
        <a class="hsearch__item hsearch__item--page" href="${esc(pg.href)}">
          <span class="hsearch__img hsearch__img--page">&#8594;</span>
          <b>${esc(pg.title)}</b>
        </a>`).join("") : "";
    if ((results && results.length) || pages.length) {
      resultsEl.innerHTML = pagesHtml + (results || []).map((p) => `
        <a class="hsearch__item" href="/p/${esc(p.slug)}">
          <span class="hsearch__img">${p.images && p.images[0] ? `<img src="${esc((window.MilanaThumb || ((x) => x))(p.images[0]))}" data-full="${esc(p.images[0])}" alt="" loading="lazy" onerror="if(this.dataset.full&&this.src.indexOf('/uploads/thumbs/')>-1){this.src=this.dataset.full}else{this.remove()}">` : ""}</span>
          <b>${esc(window.MilanaName ? MilanaName(p) : p.name)}</b>
          <i>${p.price_visible === false ? esc(t("price.manager")) : esc(fmt(p.price))}</i>
        </a>`).join("");
    } else {
      resultsEl.innerHTML = "";
    }
  }

  async function query(qText) {
    const my = ++seq;
    setState({ loading: true, q: qText, pages: pagesFor(qText) });
    try {
      const r = await fetch("/api/search/smart?q=" + encodeURIComponent(qText) + "&limit=8");
      if (!r.ok) throw new Error();
      const data = await r.json();
      let list = Array.isArray(data) ? data : (data.products || data.items || []);
      /* отсекаем «базовые» очки рейтинга/лайков: нужен реальный матч текста (+8) */
      if (Array.isArray(list) && list.length && list[0].smart_score !== undefined) {
        list = list.filter((p) => {
          const base = Math.min(8, Number(p.like_count || 0))
            + Math.min(6, Number(p.reviews || 0))
            + Math.max(0, Number(p.rating || 0) - 4) * 2;
          return Number(p.smart_score || 0) > base + 0.01;
        });
      }
      if (my !== seq) return; /* устаревший ответ */
      if (Array.isArray(list) && list.length) {
        setState({ results: list.slice(0, 8), showAll: true, q: qText, pages: pagesFor(qText) });
      } else {
        {
        const pgs = pagesFor(qText);
        setState({ note: pgs.length ? "" : t("shop.empty"), showAll: true, q: qText, pages: pgs });
      }
      }
    } catch {
      if (my !== seq) return;
      setState({ note: navigator.onLine ? t("shop.loadError") : t("shop.offline"), showAll: true, q: qText, pages: pagesFor(qText) });
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { setState({}); return; }
    timer = setTimeout(() => query(q), 250);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    location.href = "/shop" + (q ? "?q=" + encodeURIComponent(q) : "");
  });
})();
