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
