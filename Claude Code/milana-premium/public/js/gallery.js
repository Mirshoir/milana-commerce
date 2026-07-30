/* ============================================================
   MILANA — lookbook: круговая drag-галерея гардероба
   Данные: /api/products (fallback — чистые фото товаров из /uploads).
   Управление: drag / колесо / стрелки / кнопки; авто-дрейф
   в простое (выключается при prefers-reduced-motion).
   ============================================================ */
(() => {
  "use strict";

  const viewport = document.getElementById("lb-viewport");
  const track = document.getElementById("lb-track");
  const counterEl = document.getElementById("lb-counter");
  if (!viewport || !track) return;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const apiItems = (payload) => Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.items) ? payload.items : []);
  const isCleanMedia = (src) => Boolean(src) && !/catalog-/i.test(String(src));

  /* fallback: clean product photography only; no catalog sheets with baked-in text */
  const FALLBACK = [
    ["pmrlo8czo-400f22ac.webp", "look.c1"],
    ["pmrlk7am3-dd1aa8f4.webp", "look.c2"],
    ["pmrloe62a-800dfd84.webp", "look.c3"],
    ["pmrlkw1kq-94a08913.webp", "mq.4"],
    ["pmrlkb3hu-8f34e700.webp", "mq.2"],
    ["pmrlocny1-0e62fcbc.webp", "mq.1"],
    ["pmrofns1v-3384c037.webp", "mq.3"],
    ["pmrlkcxu5-2c3ab779.webp", "mq.5"],
    ["pmrll4la7-82b1e1a8.webp", "mq.2"],
    ["pmrlle42t-a8eb9370.webp", "mq.1"],
    ["pmrloiv58-c3035d9c.webp", "mq.6"],
    ["pmrlmd12s-5c4df2a1.webp", "mq.4"],
  ];

  let items = [];
  let cards = [];
  let allProducts = [];
  let currentCat = "";
  const CATS = ["pajamas", "robes", "homewear", "loungewear"];
  const tabsEl = document.getElementById("lb-tabs");

  /* ---------- состояние ленты ---------- */
  const state = {
    scroll: 0, target: 0, spacing: 0,
    dragging: false, moved: 0,
    startX: 0, startTarget: 0,
    lastMoveX: 0, lastMoveT: 0, velocity: 0,
    lastInteraction: 0,
  };

  function skeleton() {
    track.innerHTML = "";
    cards = Array.from({ length: 8 }, () => {
      const el = document.createElement("div");
      el.className = "lb-card is-skeleton";
      el.innerHTML = `<div class="lb-card__frame"></div>`;
      track.appendChild(el);
      return el;
    });
    items = cards.map(() => ({}));
    computeSpacing();
    render();
  }

  function build() {
    track.innerHTML = "";
    const frag = document.createDocumentFragment();
    cards = items.map((it, i) => {
      const el = document.createElement("div");
      el.className = "lb-card";
      el.dataset.href = it.href || "/shop";
      el.innerHTML = `
        <div class="lb-card__frame">
          <span class="lb-card__idx">${pad(i + 1)}</span>
          <img src="${esc((window.MilanaThumb || ((x) => x))(it.img))}" data-full="${esc(it.img)}" alt="${esc(it.title)}" loading="lazy" draggable="false"
               onerror="if(this.dataset.full&&this.src.indexOf('/uploads/thumbs/')>-1){this.src=this.dataset.full}else{this.style.display='none'}">
        </div>
        <div class="lb-card__cap">
          <div class="lb-card__num">N°${pad(i + 1)}</div>
          <div class="lb-card__title">${esc(it.title)}</div>
        </div>`;
      frag.appendChild(el);
      return el;
    });
    track.appendChild(frag);
    computeSpacing();
    render();
  }

  /* вкладки категорий над лентой */
  function buildTabs() {
    if (!tabsEl) return;
    const tr = (k) => (window.I18N ? I18N.t(k) : k);
    const cn = (c) => (window.I18N && I18N.catName ? I18N.catName(c) : c);
    const present = CATS.filter((c) => allProducts.some((p) => p.category === c));
    tabsEl.innerHTML = ["", ...present].map((c) =>
      `<button type="button" data-lb-cat="${c}" class="${c === currentCat ? "is-on" : ""}">${esc(c === "" ? tr("shop.all") : cn(c))}</button>`).join("");
  }

  function applyCategory(cat) {
    currentCat = cat;
    const src = cat === "" ? allProducts : allProducts.filter((p) => p.category === cat);
    items = src.map((p) => ({ img: p.images[0], title: window.MilanaName ? MilanaName(p) : p.name, href: "/p/" + p.slug }));
    if (!items.length) {
      const tr = (k) => (window.I18N ? I18N.t(k) : k);
      items = FALLBACK.map(([f, key]) => ({ img: "/uploads/" + f, title: tr(key), href: "/shop" }));
    }
    build();
    state.scroll = 0; state.target = 0;
    tabsEl && tabsEl.querySelectorAll("[data-lb-cat]").forEach((b) => b.classList.toggle("is-on", b.dataset.lbCat === cat));
  }

  tabsEl && tabsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lb-cat]");
    if (b) applyCategory(b.dataset.lbCat);
  });

  /* ---------- геометрия (дуга) ---------- */
  function computeSpacing() {
    if (!cards.length) return;
    const cw = cards[0].offsetWidth || 200;
    const gap = window.innerWidth < 640 ? 34 : window.innerWidth < 900 ? 46 : 64;
    state.spacing = cw + gap;
  }

  function render() {
    if (!cards.length) return;
    const H = viewport.clientWidth / 2;
    const n = cards.length;
    const total = state.spacing * n;
    const bend = window.innerWidth < 640 ? 46 : 78;

    const cull = H * 2.6; // карточки за пределами окна не стилизуем (плавно при любом кол-ве)
    let closestIdx = 0, closestDist = Infinity;
    cards.forEach((card, i) => {
      const baseX = (i - n / 2) * state.spacing;
      const pos = ((baseX - state.scroll + total / 2) % total + total) % total - total / 2;
      const d = Math.abs(pos);
      if (d < closestDist) { closestDist = d; closestIdx = i; }
      if (d > cull) {
        if (card._off !== true) { card.style.visibility = "hidden"; card._off = true; }
        return;
      }
      if (card._off !== false) { card.style.visibility = ""; card._off = false; }
      const norm = Math.max(-1, Math.min(1, pos / H));
      const y = Math.pow(Math.abs(norm), 1.7) * bend;
      const rot = norm * -7;
      const scale = 1 - Math.abs(norm) * 0.22;
      card.style.transform = `translate3d(calc(-50% + ${pos}px), calc(-50% + ${y}px), 0) rotate(${rot}deg) scale(${scale})`;
      card.style.opacity = Math.max(0.08, 1 - Math.abs(norm) * 0.55);
      card.style.zIndex = Math.round(1000 - Math.abs(pos));
    });
    if (counterEl) counterEl.textContent = `${pad(closestIdx + 1)} / ${pad(n)}`;
  }

  function loop() {
    const now = performance.now();
    if (!state.dragging && !reduceMotion && now - state.lastInteraction > 2200) {
      state.target += 0.35; /* авто-дрейф в простое */
    }
    state.scroll += (state.target - state.scroll) * 0.075;
    render();
    requestAnimationFrame(loop);
  }

  /* ---------- взаимодействие ---------- */
  viewport.addEventListener("pointerdown", (e) => {
    state.dragging = true; state.moved = 0;
    state.pressCard = e.target.closest ? e.target.closest(".lb-card") : null;
    viewport.classList.add("is-dragging");
    state.startX = e.clientX; state.startTarget = state.target;
    state.lastMoveX = e.clientX; state.lastMoveT = performance.now();
    state.velocity = 0; state.lastInteraction = performance.now();
    viewport.setPointerCapture && viewport.setPointerCapture(e.pointerId);
  });
  window.addEventListener("pointermove", (e) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.startX;
    state.moved = Math.max(state.moved, Math.abs(dx));
    state.target = state.startTarget - dx * 1.15;
    const now = performance.now(), dt = now - state.lastMoveT;
    if (dt > 0) state.velocity = (state.lastMoveX - e.clientX) / dt;
    state.lastMoveX = e.clientX; state.lastMoveT = now;
    state.lastInteraction = now;
  });
  window.addEventListener("pointerup", (e) => {
    if (!state.dragging) return;
    state.dragging = false;
    viewport.classList.remove("is-dragging");
    state.target += state.velocity * 140;
    state.lastInteraction = performance.now();
    /* клик (а не drag) по карточке → страница модели */
    if (state.moved < 6) {
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const card = state.pressCard || (under && under.closest && under.closest(".lb-card"));
      if (card && card.dataset.href) location.href = card.dataset.href;
    }
    state.pressCard = null;
  });
  window.addEventListener("pointercancel", () => {
    state.dragging = false;
    viewport.classList.remove("is-dragging");
  });
  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    e.stopPropagation(); /* не отдаём событие Lenis/странице */
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    state.target += d * 0.9;
    state.lastInteraction = performance.now();
  }, { passive: false });

  const step = (dir) => { state.target += dir * state.spacing; state.lastInteraction = performance.now(); };
  document.getElementById("lb-prev")?.addEventListener("click", () => step(-1));
  document.getElementById("lb-next")?.addEventListener("click", () => step(1));
  window.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
  window.addEventListener("resize", () => { computeSpacing(); });

  /* ---------- данные ---------- */
  async function load() {
    skeleton();
    try {
      const r = await fetch("/api/products?limit=1000");
      if (!r.ok) throw new Error();
      allProducts = apiItems(await r.json()).filter((p) => p.images && isCleanMedia(p.images[0]));
    } catch { allProducts = []; }

    if (allProducts.length < 4) {
      /* API недоступен — статичный набор чистых фото */
      const t = (k) => (window.I18N ? I18N.t(k) : k);
      if (tabsEl) tabsEl.innerHTML = "";
      items = FALLBACK.map(([f, key]) => ({ img: "/uploads/" + f, title: t(key), href: "/shop" }));
      build();
      return;
    }
    buildTabs();
    applyCategory(currentCat || "");
  }

  if (window.I18N) I18N.ready.then(load); else load();
  window.addEventListener("i18n:change", () => {
    if (!allProducts.length) return;   // fallback-режим не трогаем
    buildTabs();
    applyCategory(currentCat);
  });
  requestAnimationFrame(loop);
})();
