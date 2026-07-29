/* ============================================================
   MILANA — состояния шапки:
   вверху главной — прозрачная (is-clear), при скролле —
   стеклянная 50% (is-glass), при открытой мега-панели —
   сплошная белая (is-mega). Всегда закреплена сверху.
   ============================================================ */
(() => {
  "use strict";
  const h = document.querySelector(".header");
  if (!h) return;

  /* On narrow screens the full language selector and account icon move into
     the menu so search/cart/logo never overflow the viewport. */
  const mobileMenu = document.querySelector(".menu");
  if (mobileMenu && !mobileMenu.querySelector(".menu__utility")) {
    const utility = document.createElement("div");
    utility.className = "menu__utility";
    utility.innerHTML = `
      <a href="/signin" data-i18n="auth.account">Account</a>
      <div class="lang menu__lang" data-lang-mount aria-label="Til / Язык / Language"></div>`;
    mobileMenu.appendChild(utility);
  }
  const rightActions = h.querySelector(".header__side--r");
  if (rightActions && !rightActions.querySelector(".header__search--mobile")) {
    const mobileSearch = document.createElement("button");
    mobileSearch.type = "button";
    mobileSearch.className = "iconbtn header__search--mobile";
    mobileSearch.setAttribute("data-search-open", "");
    mobileSearch.setAttribute("data-i18n-aria", "shop.search");
    mobileSearch.setAttribute("aria-label", "Search");
    mobileSearch.innerHTML = '<svg class="ic"><use href="#i-search"/></svg>';
    rightActions.insertBefore(mobileSearch, rightActions.querySelector("[data-cart-open]"));
  }

  /* при загрузке без #якоря — всегда начинаем с верха страницы */
  if (!location.hash) {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    window.addEventListener("load", () => window.scrollTo(0, 0));
  }
  const overlay = document.body.classList.contains("has-overlay-header");

  function update() {
    const scrolled = window.scrollY > 12;
    h.classList.toggle("is-glass", scrolled);
    h.classList.toggle("is-solid", scrolled);
    h.classList.toggle("is-clear", overlay && !scrolled);
    if (h.classList.contains("is-hidden")) h.classList.remove("is-hidden");
  }
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("load", update);
  update();

  /* открытая мега-панель → шапка сплошным белым, как сама панель */
  h.querySelectorAll(".navitem").forEach((item) => {
    if (!item.querySelector(".mega")) return;
    item.addEventListener("mouseenter", () => h.classList.add("is-mega"));
    item.addEventListener("mouseleave", () => h.classList.remove("is-mega"));
    item.addEventListener("focusin", () => h.classList.add("is-mega"));
    item.addEventListener("focusout", (e) => {
      if (!item.contains(e.relatedTarget)) h.classList.remove("is-mega");
    });
  });

  /* выпадающий выбор языка */
  const sel = h.querySelector(".langsel");
  if (sel) {
    const btn = sel.querySelector(".langsel__btn");
    const cur = sel.querySelector("[data-lang-current]");
    const setOpen = (open) => {
      sel.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
    };
    btn.addEventListener("click", () => setOpen(!sel.classList.contains("is-open")));
    document.addEventListener("click", (e) => { if (!sel.contains(e.target)) setOpen(false); });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
    sel.querySelectorAll("[data-lang]").forEach((b) => {
      b.addEventListener("click", () => {
        if (window.I18N) I18N.set(b.dataset.lang);
        setOpen(false);
      });
    });
    const syncLabel = () => { if (window.I18N && cur) cur.textContent = I18N.lang.toUpperCase(); };
    if (window.I18N) I18N.ready.then(syncLabel); else window.addEventListener("load", syncLabel);
    window.addEventListener("i18n:change", syncLabel);
  }

  /* кнопка «наверх» рядом с чат-ассистентом */
  const toTop = document.createElement("button");
  toTop.type = "button";
  toTop.className = "to-top";
  toTop.setAttribute("aria-label", "Наверх");
  toTop.innerHTML = '<svg class="ic"><use href="#i-arrow"/></svg>';
  document.body.appendChild(toTop);
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  const syncTop = () => toTop.classList.toggle("is-on", window.scrollY > 600);
  window.addEventListener("scroll", syncTop, { passive: true });
  syncTop();
  /* выравниваем по фактической ширине кнопки чата */
  window.addEventListener("load", () => setTimeout(() => {
    const fab = document.querySelector(".chat-widget__fab");
    if (fab && fab.offsetWidth) toTop.style.right = (18 + fab.offsetWidth + 12) + "px";
  }, 400));
})();

/* ============================================================
   Промо-строка → бегущая новостная лента
   Текст берётся из ключа best.ship (админка → Тексты → Промо-строка).
   Несколько новостей можно разделить символом «|».
   ============================================================ */
(() => {
  "use strict";
  const promo = document.querySelector(".promo");
  if (!promo) return;
  const src = promo.querySelector("[data-i18n]");
  if (!src) return;

  function build() {
    const text = (src.textContent || "").trim();
    if (!text) return;
    const parts = text.split("|").map((t) => t.trim()).filter(Boolean);

    let track = promo.querySelector(".promo__track");
    if (!track) {
      track = document.createElement("div");
      track.className = "promo__track";
      promo.appendChild(track);
      promo.classList.add("promo--ticker");
    }
    const makeRun = () => {
      const run = document.createElement("span");
      run.className = "promo__run";
      parts.forEach((t) => {
        const i = document.createElement("i");
        i.className = "promo__item";
        i.textContent = t;
        run.appendChild(i);
      });
      return run;
    };

    /* измеряем одну копию */
    track.innerHTML = "";
    const probe = makeRun();
    track.appendChild(probe);
    const runW = probe.getBoundingClientRect().width || 600;

    /* половина дорожки должна быть шире экрана — иначе в строке появляется пустой разрыв */
    const viewport = promo.clientWidth || window.innerWidth || 1200;
    const copies = Math.max(1, Math.ceil(viewport / runW) + 1);

    track.innerHTML = "";
    const half = document.createDocumentFragment();
    for (let i = 0; i < copies; i++) half.appendChild(makeRun());
    track.appendChild(half.cloneNode(true));   /* первая половина */
    track.appendChild(half);                   /* вторая — точная копия для бесшовной петли */

    /* скорость постоянная (~60 px/с) независимо от длины текста */
    track.style.setProperty("--ticker-dur", Math.max(14, Math.round((runW * copies) / 60)) + "s");
  }

  /* The source text is translated asynchronously. Building immediately
     cloned the Russian fallback before the selected language was applied,
     leaving a mixed-language ticker until the user changed language. */
  if (window.I18N?.ready) I18N.ready.then(build);
  else build();
  window.addEventListener("i18n:change", () => setTimeout(build, 60));
  window.addEventListener("resize", () => { clearTimeout(build._t); build._t = setTimeout(build, 200); });
})();
