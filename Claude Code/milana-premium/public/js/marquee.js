/* ============================================================
   MILANA — авто-лента (marquee): непрерывный плавный ход
   в заданном направлении, пауза при наведении + стрелки.
   Bestsellers → слева направо, Clothing type → справа налево.
   ============================================================ */
(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function build(track, dir, speed) {
    if (!track || track.dataset.marq || track.children.length < 2) return;
    track.dataset.marq = "1";

    const vp = document.createElement("div");
    vp.className = "marq__vp";
    track.parentNode.insertBefore(vp, track);
    vp.appendChild(track);
    track.classList.add("marq__track");
    track.classList.remove("scroller");
    track.style.overflow = "visible";

    const nav = (cls, back) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "marq__nav " + cls;
      b.setAttribute("aria-label", back ? "Назад" : "Вперёд");
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"${back ? ' style="transform:rotate(180deg)"' : ""}><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      vp.appendChild(b); return b;
    };
    const prevBtn = nav("marq__nav--prev", true);
    const nextBtn = nav("marq__nav--next", false);

    const originals = [...track.children];
    const clone = () => originals.forEach((n) => {
      const c = n.cloneNode(true);
      c.setAttribute("aria-hidden", "true");
      c.classList.add("is-clone");
      track.appendChild(c);
    });

    let W = 0;
    const measure = () => {
      const st = getComputedStyle(track);
      const gap = parseFloat(st.columnGap || st.gap || 0) || 0;
      W = originals.reduce((w, n) => w + n.getBoundingClientRect().width + gap, 0);
    };

    clone(); measure();
    let safety = 0;
    while (track.scrollWidth < vp.clientWidth * 2 + W && safety < 6) { clone(); safety++; }
    measure();

    let offset = dir > 0 ? -W : 0;
    let boost = 0, paused = false;
    const apply = () => { track.style.transform = `translate3d(${offset.toFixed(2)}px,0,0)`; };
    apply();

    /* шаг-пауза: лента стоит HOLD мс, затем плавно проезжает одну карточку */
    const HOLD = 3000;   /* пауза, мс */
    const GLIDE = 900;   /* длительность проезда, мс */
    let phase = "hold", phaseStart = performance.now(), from = offset, to = offset;

    const stepSize = () => {
      const first = originals[0];
      if (!first) return 240;
      const st = getComputedStyle(track);
      const gap = parseFloat(st.columnGap || st.gap || 0) || 0;
      return first.getBoundingClientRect().width + gap;
    };

    function frame(now) {
      if (!reduce && !paused) {
        if (phase === "hold") {
          if (now - phaseStart >= HOLD) {
            from = offset;
            to = offset + stepSize() * dir;
            phase = "glide";
            phaseStart = now;
          }
        } else {
          const p = Math.min(1, (now - phaseStart) / GLIDE);
          const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;  /* мягкий старт и остановка */
          offset = from + (to - from) * eased;
          if (p >= 1) { phase = "hold"; phaseStart = now; }
        }
      } else if (paused && phase === "glide") {
        /* если увели курсор во время проезда — доводим шаг до конца при возврате */
        phaseStart = now - GLIDE * 0.999;
      }

      offset += boost;
      boost *= 0.86; if (Math.abs(boost) < 0.03) boost = 0;
      while (offset <= -W) { offset += W; from += W; to += W; }
      while (offset > 0) { offset -= W; from -= W; to -= W; }
      apply();
      requestAnimationFrame(frame);
    }

    const pause = () => { paused = true; };
    const resume = () => { paused = false; };
    vp.addEventListener("pointerenter", pause);
    vp.addEventListener("pointerleave", resume);
    vp.addEventListener("pointerdown", pause);
    window.addEventListener("pointerup", resume);
    window.addEventListener("resize", measure);

    const cw = () => (originals[0] ? originals[0].getBoundingClientRect().width + 14 : 260);
    prevBtn.addEventListener("click", (e) => { e.preventDefault(); boost += cw() * 0.28; });
    nextBtn.addEventListener("click", (e) => { e.preventDefault(); boost -= cw() * 0.28; });

    requestAnimationFrame(frame);
  }

  function initClothing() {
    const row = document.querySelector("#types .typestrip__row");
    if (row) build(row, -1, 0.32);              // справа → налево
  }
  function initBest() {
    const grid = document.querySelector("#bestsellers .product-grid");
    if (grid && grid.querySelector(".product:not(.product--skeleton)")) build(grid, 1, 0.32); // слева → направо
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initClothing);
  else initClothing();
  window.addEventListener("products:rendered", initBest);
  setTimeout(initBest, 1600); // подстраховка, если событие уже прошло
})();
