/* ============================================================
   MILANA — hero-слайдер главной страницы
   Слайды (фото/видео + заголовок на 3 языках) настраиваются
   в админке: Конструктор → Hero-слайдер (site_config.hero).
   Без настроенных слайдов остаётся стандартное hero-видео.
   ============================================================ */
(() => {
  "use strict";

  const hero = document.querySelector(".hero");
  const frame = hero && hero.querySelector(".hero__img");
  const title = hero && hero.querySelector("h1");
  if (!hero || !frame || !title) return;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const btn = hero.querySelector(".hero__btn");
  const overlay = hero.querySelector(".hero__overlay");
  const defaultHref = btn ? btn.getAttribute("href") : "/shop";
  const defaultTitle = title.innerHTML;

  async function getConfig() {
    if (window.SITE_CONFIG !== undefined) return window.SITE_CONFIG;
    try {
      const s = await (await fetch("/api/settings")).json();
      return s.site_config ? JSON.parse(s.site_config) : null;
    } catch { return null; }
  }

  function slideTitle(s) {
    const lang = window.I18N ? I18N.lang : "ru";
    return s["title_" + lang] || s.title_ru || s.title_uz || s.title_en || "";
  }

  function slideSub(s) {
    const lang = window.I18N ? I18N.lang : "ru";
    return s["sub_" + lang] || s.sub_ru || s.sub_uz || s.sub_en || "";
  }

  async function init() {
    const cfg = await getConfig();
    const slides = (cfg && cfg.hero && Array.isArray(cfg.hero.slides))
      ? cfg.hero.slides.filter((s) => s && s.src)
      : [];
    if (!slides.length) return; /* стандартное hero-видео остаётся */

    /* убираем стандартное видео и его постер */
    const oldVideo = frame.querySelector(".hero__video");
    if (oldVideo) oldVideo.remove();

    /* строим слайды */
    const els = slides.map((s, i) => {
      const el = document.createElement("div");
      el.className = "hslide";
      if (s.type === "video") {
        const v = document.createElement("video");
        v.className = "hslide__media";
        v.muted = true; v.loop = true; v.playsInline = true;
        v.preload = i === 0 ? "auto" : "none";
        v.dataset.src = s.src;
        el.appendChild(v);
      } else {
        const img = document.createElement("img");
        img.className = "hslide__media";
        img.src = s.src;
        img.alt = "";
        if (i === 0) { img.fetchPriority = "high"; } else { img.loading = "lazy"; }
        el.appendChild(img);
      }
      frame.appendChild(el);
      return el;
    });

    /* точки */
    let dots = [];
    if (slides.length > 1) {
      const dotsBox = document.createElement("div");
      dotsBox.className = "hero__dots";
      dots = slides.map((_, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("aria-label", "Слайд " + (i + 1));
        b.addEventListener("click", () => { go(i); restart(); });
        dotsBox.appendChild(b);
        return b;
      });
      hero.appendChild(dotsBox);
    }

    let cur = -1, timer = null;

    const escH = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const safe = (x) => (window.MilanaSanitize && /<[a-z][^>]*>/i.test(String(x))) ? window.MilanaSanitize(x) : escH(x);

    function setTitle(i) {
      const txt = slideTitle(slides[i]);
      const sub = slideSub(slides[i]);
      if (txt) {
        title.classList.add("is-swap");
        setTimeout(() => {
          title.innerHTML = `<span class="line"><span class="line__in">${safe(txt)}</span></span>`
            + (sub ? `<span class="line"><span class="line__in"><i>${safe(sub)}</i></span></span>` : "");
          title.classList.remove("is-swap");
        }, txt && cur >= 0 ? 350 : 0);
      } else {
        title.innerHTML = defaultTitle;
        if (window.I18N) I18N.apply(title.parentElement);
      }
      if (btn) {
        const href = (slides[i].href || "").trim();
        btn.setAttribute("href", href || defaultHref);
      }
      const align = (slides[i].align || "").trim();
      if (overlay) {
        overlay.style.textAlign = align;
        overlay.style.justifyItems = align === "center" ? "center" : align === "right" ? "end" : ""; /* overlay — grid */
      }
      /* h1 — grid c justify-items:start; короткие строки должны следовать выравниванию */
      title.style.justifyItems = align === "center" ? "center" : align === "right" ? "end" : "";
      title.style.setProperty("--slide-scale", String((Number(slides[i].scale) || 100) / 100));
    }

    function media(el) { return el.querySelector(".hslide__media"); }

    function go(i) {
      const next = (i + slides.length) % slides.length;
      if (next === cur) return;
      if (cur >= 0) {
        els[cur].classList.remove("is-on");
        const m = media(els[cur]);
        if (m.tagName === "VIDEO") m.pause();
      }
      const m = media(els[next]);
      if (m.tagName === "VIDEO") {
        if (!m.src) m.src = m.dataset.src;
        if (!reduceMotion) m.play && m.play().catch(() => {});
      }
      els[next].classList.add("is-on");
      dots.forEach((d, k) => d.classList.toggle("is-on", k === next));
      setTitle(next);
      cur = next;
    }

    const interval = Math.max(2000, Math.min(20000, (Number(cfg.hero && cfg.hero.interval) || 6) * 1000));

    function restart() {
      clearInterval(timer);
      if (slides.length > 1 && !reduceMotion) timer = setInterval(() => go(cur + 1), interval);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearInterval(timer);
      else restart();
    });
    window.addEventListener("i18n:change", () => { if (cur >= 0) setTitle(cur); });

    go(0);
    restart();
  }

  if (window.I18N && I18N.ready) I18N.ready.then(init); else init();
})();
