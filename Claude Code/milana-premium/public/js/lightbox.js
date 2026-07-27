/* ============================================================
   MILANA — полноэкранный просмотр фото товара (лайтбокс)
   · листание: стрелки, свайп, миниатюры, клавиши ← →
   · зум: двойной тап/клик, колесо, пинч; перетаскивание для панорамы
   · закрытие: ✕, Esc, тап по фону, свайп вниз
   Публичный API: window.MilanaLightbox.open(images, startIndex)
   ============================================================ */
(() => {
  "use strict";
  const isVideo = (u) => /\.(mp4|webm)(\?|$)/i.test(u || "");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const thumb = (u) => (window.MilanaThumb ? window.MilanaThumb(u) : u);
  const t = (k) => (window.I18N ? I18N.t(k) : k);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const MAX = 4;

  let root, stage, imgEl, vidEl, thumbsEl, countEl;
  let images = [], idx = 0;
  let scale = 1, tx = 0, ty = 0;
  const pointers = new Map();
  let startDist = 0, startScale = 1, panStart = null, tap = null;
  const BG = 0.8; // непрозрачность фона (80%)

  function build() {
    root = document.createElement("div");
    root.className = "mlx";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", t("prod.gallery") || "Gallery");
    root.innerHTML = `
      <div class="mlx__bar">
        <span class="mlx__count" aria-live="polite"></span>
        <button class="mlx__btn mlx__close" type="button" aria-label="${esc(t("cart.close") || "Close")}">
          <svg viewBox="0 0 24 24" class="mlx__ic"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <button class="mlx__nav mlx__prev" type="button" aria-label="${esc(t("prod.prev") || "Previous")}"><svg viewBox="0 0 24 24" class="mlx__ic"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="mlx__stage" id="mlx-stage">
        <img class="mlx__img" alt="" draggable="false">
        <video class="mlx__video" controls playsinline hidden></video>
      </div>
      <button class="mlx__nav mlx__next" type="button" aria-label="${esc(t("prod.next") || "Next")}"><svg viewBox="0 0 24 24" class="mlx__ic"><path d="M9 5l7 7-7 7"/></svg></button>
      <div class="mlx__thumbs" id="mlx-thumbs"></div>`;
    document.body.appendChild(root);
    stage = root.querySelector("#mlx-stage");
    imgEl = root.querySelector(".mlx__img");
    vidEl = root.querySelector(".mlx__video");
    thumbsEl = root.querySelector("#mlx-thumbs");
    countEl = root.querySelector(".mlx__count");

    root.querySelector(".mlx__close").addEventListener("click", close);
    root.querySelector(".mlx__prev").addEventListener("click", (e) => { e.stopPropagation(); go(idx - 1); });
    root.querySelector(".mlx__next").addEventListener("click", (e) => { e.stopPropagation(); go(idx + 1); });
    root.addEventListener("click", (e) => { if (e.target === root) close(); }); // тап по пустой зоне закрывает через onUp

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("wheel", onWheel, { passive: false });
  }

  function setTransform() {
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    imgEl.classList.toggle("is-zoomed", scale > 1.01);
  }
  function resetZoom() { scale = 1; tx = 0; ty = 0; setTransform(); }

  function bounds() {
    const r = stage.getBoundingClientRect();
    const iw = imgEl.clientWidth * scale, ih = imgEl.clientHeight * scale;
    return { x: Math.max(0, (iw - r.width) / 2), y: Math.max(0, (ih - r.height) / 2) };
  }
  function clampPan() { const b = bounds(); tx = clamp(tx, -b.x, b.x); ty = clamp(ty, -b.y, b.y); }

  function toggleZoom(cx, cy) {
    if (currentIsVideo()) return;
    if (scale > 1.01) { resetZoom(); return; }
    const r = stage.getBoundingClientRect();
    scale = 2.6;
    tx = (r.left + r.width / 2 - cx) * (scale - 1);
    ty = (r.top + r.height / 2 - cy) * (scale - 1);
    clampPan(); setTransform();
  }

  function onWheel(e) {
    if (currentIsVideo()) return;
    e.preventDefault();
    const prev = scale;
    scale = clamp(scale * (e.deltaY < 0 ? 1.18 : 0.85), 1, MAX);
    if (scale === 1) { resetZoom(); return; }
    const r = stage.getBoundingClientRect();
    const f = scale / prev;
    tx = (tx - (e.clientX - r.left - r.width / 2)) * f + (e.clientX - r.left - r.width / 2);
    ty = (ty - (e.clientY - r.top - r.height / 2)) * f + (e.clientY - r.top - r.height / 2);
    clampPan(); setTransform();
  }

  function onDown(e) {
    if (currentIsVideo()) return;
    stage.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      startDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      startScale = scale; tap = null; panStart = null;
      return;
    }
    tap = { x: e.clientX, y: e.clientY, t: Date.now(), target: e.target, moved: 0, dx: 0, dy: 0 };
    panStart = scale > 1.01 ? { x: e.clientX - tx, y: e.clientY - ty } : null;
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (startDist) { scale = clamp(startScale * (d / startDist), 1, MAX); clampPan(); setTransform(); }
      return;
    }
    if (!tap) return;
    tap.moved += Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
    if (panStart && scale > 1.01) {
      tx = e.clientX - panStart.x; ty = e.clientY - panStart.y;
      clampPan(); setTransform();
    } else if (scale <= 1.01) {
      tap.dx = e.clientX - tap.x; tap.dy = e.clientY - tap.y;
      if (Math.abs(tap.dy) > 6 && Math.abs(tap.dy) > Math.abs(tap.dx)) {
        stage.style.transform = `translateY(${tap.dy}px)`;
        root.style.background = `rgba(12,12,12,${clamp(BG - Math.abs(tap.dy) / 600, 0.3, BG)})`;
      }
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (startDist && pointers.size < 2) { startDist = 0; if (scale <= 1.01) resetZoom(); }
    if (!tap) { panStart = null; return; }
    const isTap = tap.moved < 8 && Date.now() - tap.t < 400;
    if (scale <= 1.01 && !isTap) {
      stage.style.transform = ""; root.style.background = "";
      const { dx, dy } = tap;
      if (Math.abs(dy) > 90 && Math.abs(dy) > Math.abs(dx)) close();
      else if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(idx + (dx < 0 ? 1 : -1));
    } else if (isTap) {
      // геометрия вместо e.target: pointer capture перенацеливает события на stage
      const r = imgEl.getBoundingClientRect();
      const onImg = imgEl.style.display !== "none" && tap.x >= r.left && tap.x <= r.right && tap.y >= r.top && tap.y <= r.bottom;
      if (onImg) toggleZoom(tap.x, tap.y);   // одиночный клик/тап по фото — увеличить/уменьшить
      else if (scale <= 1.01) close();         // тап по тёмной области — закрыть
    }
    tap = null; panStart = null;
  }

  const currentIsVideo = () => isVideo(images[idx]);

  function show() {
    resetZoom();
    const src = images[idx] || "";
    const vid = isVideo(src);
    imgEl.hidden = vid; vidEl.hidden = !vid;
    imgEl.style.display = vid ? "none" : "";   // не полагаемся на [hidden]: на сайте есть правила, что его перебивают
    vidEl.style.display = vid ? "" : "none";
    if (vid) { vidEl.src = src; vidEl.play?.().catch(() => {}); }
    else { vidEl.pause?.(); vidEl.removeAttribute("src"); imgEl.src = src; }
    countEl.textContent = `${idx + 1} / ${images.length}`;
    root.querySelectorAll(".mlx__thumbs button").forEach((b, i) => b.classList.toggle("is-on", i === idx));
    const on = root.querySelector(".mlx__thumbs button.is-on");
    on?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
    const solo = images.length < 2;
    root.querySelector(".mlx__prev").hidden = solo;
    root.querySelector(".mlx__next").hidden = solo;
    thumbsEl.hidden = solo;
  }

  function go(i) { idx = (i + images.length) % images.length; show(); }

  function renderThumbs() {
    thumbsEl.innerHTML = images.map((u, i) => {
      const poster = isVideo(u) ? (images.find((x) => !isVideo(x)) || "") : u;
      return `<button type="button" data-mlx-thumb="${i}" aria-label="${i + 1}"${isVideo(u) ? ' class="is-video"' : ""}>${poster ? `<img src="${esc(thumb(poster))}" alt="" loading="lazy">` : ""}</button>`;
    }).join("");
    thumbsEl.querySelectorAll("[data-mlx-thumb]").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); go(+b.dataset.mlxThumb); }));
  }

  function onKey(e) {
    if (!root?.classList.contains("is-open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") go(idx - 1);
    else if (e.key === "ArrowRight") go(idx + 1);
    else if (e.key === "+" || e.key === "=") { scale = clamp(scale * 1.3, 1, MAX); clampPan(); setTransform(); }
    else if (e.key === "-") { scale = clamp(scale / 1.3, 1, MAX); if (scale === 1) resetZoom(); else { clampPan(); setTransform(); } }
  }

  let lastFocus = null;
  function open(list, start = 0) {
    images = (list || []).filter(Boolean);
    if (!images.length) return;
    if (!root) build();
    lastFocus = document.activeElement;
    idx = clamp(start, 0, images.length - 1);
    renderThumbs();
    show();
    document.body.classList.add("mlx-lock");
    requestAnimationFrame(() => root.classList.add("is-open"));
    document.addEventListener("keydown", onKey);
    root.querySelector(".mlx__close").focus();
  }

  function close() {
    if (!root) return;
    root.classList.remove("is-open");
    document.body.classList.remove("mlx-lock");
    document.removeEventListener("keydown", onKey);
    vidEl.pause?.(); vidEl.removeAttribute("src");
    resetZoom(); stage.style.transform = ""; root.style.background = "";
    lastFocus?.focus?.();
  }

  window.MilanaLightbox = { open, close };
})();
