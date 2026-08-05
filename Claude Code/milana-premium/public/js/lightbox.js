/* ============================================================
   MILANA — полноэкранный просмотр фото товара (лайтбокс)
   · вертикальная лента кадров, слева колонка миниатюр
   · зум по клику в точку курсора, ← → ↑ ↓ листают
   · закрытие: ✕, Esc, клик по фону
   Публичный API: window.MilanaLightbox.open(images, startIndex)
   ============================================================ */
(() => {
  "use strict";
  const isVideo = (u) => /\.(mp4|webm)(\?|$)/i.test(u || "");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const thumb = (u) => (window.MilanaThumb ? window.MilanaThumb(u) : u);
  const t = (k) => (window.I18N ? I18N.t(k) : k);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  let root, rail, feed, countEl, io = null;
  let images = [], idx = 0, lastFocus = null;

  function build() {
    root = document.createElement("div");
    root.className = "mlx mlx--feed";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", t("prod.gallery") || "Gallery");
    root.innerHTML = `
      <div class="mlx__rail" id="mlx-rail"></div>
      <div class="mlx__feed" id="mlx-feed"></div>
      <div class="mlx__bar">
        <span class="mlx__count" aria-live="polite"></span>
        <button class="mlx__btn mlx__close" type="button" aria-label="${esc(t("cart.close") || "Close")}">
          <svg viewBox="0 0 24 24" class="mlx__ic"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>`;
    document.body.appendChild(root);
    rail = root.querySelector("#mlx-rail");
    feed = root.querySelector("#mlx-feed");
    countEl = root.querySelector(".mlx__count");

    root.querySelector(".mlx__close").addEventListener("click", close);
    root.addEventListener("click", (e) => { if (e.target === root) close(); });

    /* клик по кадру — приблизить в точку курсора; мимо кадров — закрыть */
    feed.addEventListener("click", (e) => {
      const fig = e.target.closest(".mlx__item");
      if (!fig) { close(); return; }
      const media = e.target.closest("img");
      if (!media) return;                                  /* у видео свои элементы управления */
      const r = media.getBoundingClientRect();
      const on = fig.classList.toggle("is-zoomed");
      media.style.transformOrigin = on
        ? `${clamp(((e.clientX - r.left) / r.width) * 100, 0, 100)}% ${clamp(((e.clientY - r.top) / r.height) * 100, 0, 100)}%`
        : "";
    });

    rail.addEventListener("click", (e) => {
      const b = e.target.closest("[data-mlx-thumb]");
      if (b) go(+b.dataset.mlxThumb);
    });
  }

  function render() {
    const solo = images.length < 2;
    feed.innerHTML = images.map((u, i) => {
      const poster = isVideo(u) ? (images.find((x) => !isVideo(x)) || "") : "";
      const media = isVideo(u)
        ? `<video src="${esc(u)}" controls playsinline preload="metadata"${poster ? ` poster="${esc(poster)}"` : ""}></video>`
        : `<img src="${esc(u)}" alt="" draggable="false" ${i < 2 ? 'decoding="async"' : 'loading="lazy" decoding="async"'}>`;
      return `<figure class="mlx__item" data-i="${i}">${media}</figure>`;
    }).join("");

    rail.hidden = solo;
    rail.innerHTML = solo ? "" : images.map((u, i) => {
      const poster = isVideo(u) ? (images.find((x) => !isVideo(x)) || "") : u;
      return `<button type="button" data-mlx-thumb="${i}" aria-label="${i + 1}"${isVideo(u) ? ' class="is-video"' : ""}>`
        + (poster ? `<img src="${esc(thumb(poster))}" alt="" loading="lazy">` : "") + `</button>`;
    }).join("");

    observe();
  }

  /* активная миниатюра и счётчик следуют за прокруткой ленты */
  function observe() {
    io?.disconnect();
    if (!("IntersectionObserver" in window)) return;
    io = new IntersectionObserver((entries) => {
      let best = null;
      for (const en of entries) if (en.isIntersecting && (!best || en.intersectionRatio > best.intersectionRatio)) best = en;
      if (!best) return;
      const i = Number(best.target.dataset.i);
      if (Number.isInteger(i) && i !== idx) { idx = i; syncActive(); }
    }, { root: feed, threshold: [0.35, 0.6, 0.9] });
    feed.querySelectorAll(".mlx__item").forEach((el) => io.observe(el));
  }

  function syncActive() {
    countEl.textContent = images.length > 1 ? `${idx + 1} / ${images.length}` : "";
    const btns = rail.querySelectorAll("[data-mlx-thumb]");
    btns.forEach((b, i) => b.classList.toggle("is-on", i === idx));
    btns[idx]?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }

  function scrollTo(i, behavior) {
    const el = feed.querySelector(`.mlx__item[data-i="${i}"]`);
    if (!el) return;
    feed.scrollTo({ top: Math.max(0, el.offsetTop - 16), behavior });
  }

  function go(i) {
    idx = (i + images.length) % images.length;
    scrollTo(idx, "smooth");
    syncActive();
  }

  function onKey(e) {
    if (!root?.classList.contains("is-open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(idx - 1); }
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(idx + 1); }
  }

  function open(list, start = 0) {
    images = (list || []).filter(Boolean);
    if (!images.length) return;
    if (!root) build();
    lastFocus = document.activeElement;
    idx = clamp(start, 0, images.length - 1);
    render();
    document.body.classList.add("mlx-lock");
    root.classList.add("is-open");
    scrollTo(idx, "auto");
    syncActive();
    document.addEventListener("keydown", onKey);
    root.querySelector(".mlx__close").focus();
  }

  function close() {
    if (!root) return;
    root.classList.remove("is-open");
    document.body.classList.remove("mlx-lock");
    document.removeEventListener("keydown", onKey);
    io?.disconnect(); io = null;
    feed.querySelectorAll("video").forEach((v) => { v.pause?.(); v.removeAttribute("src"); });
    feed.innerHTML = ""; rail.innerHTML = "";
    lastFocus?.focus?.();
  }

  window.MilanaLightbox = { open, close };
})();
