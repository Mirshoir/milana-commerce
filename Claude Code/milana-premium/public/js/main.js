/* ============================================================
   MILANA PREMIUM — interactions & motion
   Progressive enhancement: the page is fully usable without
   GSAP/Lenis; everything below only embellishes.
   ============================================================ */
(() => {
  "use strict";

  const doc = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap = typeof window.gsap !== "undefined";
  const hasST = hasGsap && typeof window.ScrollTrigger !== "undefined";
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (hasST) gsap.registerPlugin(ScrollTrigger);

  /* ---------------- smooth scroll (Lenis) ---------------- */
  let lenis = null;
  if (!reduceMotion && typeof window.Lenis !== "undefined" && hasST) {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    doc.classList.add("lenis-on");
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const scrollToTarget = (target) => {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -72, duration: 1.4 });
    else el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  };

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      closeMenu();
      scrollToTarget(el);
      history.replaceState(null, "", id);
    });
  });

  /* ---------------- preloader ---------------- */
  const preloader = document.querySelector(".preloader");
  const MIN_SHOW = reduceMotion ? 150 : 1500;
  const started = performance.now();

  const pageReady = new Promise((res) => {
    if (document.readyState === "complete") res();
    else window.addEventListener("load", res, { once: true });
  });
  const cap = new Promise((res) => setTimeout(res, 2700));

  Promise.race([pageReady, cap]).then(() => {
    const wait = Math.max(0, MIN_SHOW - (performance.now() - started));
    setTimeout(finishPreloader, wait);
  });

  function finishPreloader() {
    if (!preloader || preloader.classList.contains("is-done")) return;
    preloader.classList.add("is-done");
    setTimeout(() => preloader.classList.add("is-gone"), 1250);
    runIntro();
  }

  /* ---------------- hero intro ---------------- */
  // initial states are set only when GSAP is ready, so a CDN
  // failure still leaves the page fully visible.
  let introPrepared = false;
  if (hasGsap && !reduceMotion) {
    gsap.set(".hero .line__in", { yPercent: 112 });
    gsap.set("[data-intro]", { autoAlpha: 0, y: 26 });
    gsap.set(".hero__img", { clipPath: "inset(0% 0% 100% 0%)" });
    gsap.set(".hero__img img", { scale: 1.3 });
    introPrepared = true;
  }

  function runIntro() {
    if (!introPrepared) return;
    const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
    tl.to(".hero .line__in", { yPercent: 0, duration: 1.3, stagger: 0.1, clearProps: "transform" }, 0.15)
      .to(".hero__img", { clipPath: "inset(0% 0% 0% 0%)", duration: 1.5, ease: "power3.inOut", clearProps: "clipPath" }, 0.1)
      .to(".hero__img img", { scale: 1, duration: 2.1, ease: "power3.out", clearProps: "transform" }, 0.1)
      .to("[data-intro]", { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.09, clearProps: "transform" }, 0.55);
  }

  /* ---------------- scroll-driven motion ---------------- */
  if (hasST && !reduceMotion) {
    // masked line reveals for every heading outside the hero
    document.querySelectorAll("main .t-display, .lookbook__title").forEach((h) => {
      if (h.closest(".hero")) return;
      const lines = h.querySelectorAll(".line__in");
      if (!lines.length) return;
      gsap.set(lines, { yPercent: 112 });
      gsap.to(lines, {
        yPercent: 0, duration: 1.25, stagger: 0.1, ease: "power4.out", clearProps: "transform",
        scrollTrigger: { trigger: h, start: "top 84%", once: true },
      });
    });

    // generic fade-up reveals, batched for grids
    const revealEls = gsap.utils.toArray("[data-reveal]");
    gsap.set(revealEls, { autoAlpha: 0, y: 34 });
    ScrollTrigger.batch(revealEls, {
      start: "top 88%",
      once: true,
      batchMax: 6,
      onEnter: (batch) => gsap.to(batch, {
        autoAlpha: 1, y: 0, duration: 1.05, stagger: 0.09, ease: "power3.out", clearProps: "transform",
      }),
    });

    // curtain image reveals
    document.querySelectorAll("main .reveal-img").forEach((fig) => {
      if (fig.closest(".hero")) return;
      const img = fig.querySelector("img");
      gsap.set(fig, { clipPath: "inset(0% 0% 100% 0%)" });
      if (img) gsap.set(img, { scale: 1.26 });
      ScrollTrigger.create({
        trigger: fig, start: "top 86%", once: true,
        onEnter: () => {
          gsap.to(fig, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.35, ease: "power3.inOut", clearProps: "clipPath" });
          if (img) gsap.to(img, { scale: 1, duration: 2, ease: "power3.out", clearProps: "transform" });
        },
      });
    });

    // parallax drift
    document.querySelectorAll("[data-parallax]").forEach((el) => {
      const speed = parseFloat(el.dataset.parallax) || 0.1;
      gsap.fromTo(el, { y: -speed * 160 }, {
        y: speed * 160, ease: "none",
        scrollTrigger: {
          trigger: el.closest("section") || el,
          start: "top bottom", end: "bottom top", scrub: 0.6,
        },
      });
    });

    // stat counters
    document.querySelectorAll("[data-count]").forEach((el) => {
      const end = parseInt(el.dataset.count, 10);
      const state = { v: 0 };
      ScrollTrigger.create({
        trigger: el, start: "top 88%", once: true,
        onEnter: () => gsap.to(state, {
          v: end, duration: 1.9, ease: "power2.out",
          onUpdate: () => { el.textContent = Math.round(state.v); },
        }),
      });
    });

    // keep trigger positions honest as lazy images land
    let refreshQueued = false;
    const queueRefresh = () => {
      if (refreshQueued) return;
      refreshQueued = true;
      requestAnimationFrame(() => { refreshQueued = false; ScrollTrigger.refresh(); });
    };
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      if (!img.complete) img.addEventListener("load", queueRefresh, { once: true });
    });
    window.addEventListener("load", () => ScrollTrigger.refresh());
  }

  /* ---------------- header ---------------- */
  const header = document.querySelector(".header");
  let lastY = window.scrollY;
  const onScroll = (y) => {
    header.classList.toggle("is-solid", y > 24);
    const goingDown = y > lastY + 4;
    const goingUp = y < lastY - 4;
    if (y > 420 && goingDown) header.classList.add("is-hidden");
    else if (goingUp || y <= 420) header.classList.remove("is-hidden");
    lastY = y;
  };
  if (lenis) lenis.on("scroll", ({ scroll }) => onScroll(scroll));
  else window.addEventListener("scroll", () => onScroll(window.scrollY), { passive: true });

  /* ---------------- mobile menu ---------------- */
  const burger = document.querySelector(".burger");
  const menu = document.getElementById("menu");

  function openMenu() {
    menu.classList.add("is-open");
    burger.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Close menu");
    menu.setAttribute("aria-hidden", "false");
    if (lenis) lenis.stop();
    document.body.style.overflow = "hidden";
  }
  function closeMenu() {
    if (!menu.classList.contains("is-open")) return;
    menu.classList.remove("is-open");
    burger.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Open menu");
    menu.setAttribute("aria-hidden", "true");
    if (lenis) lenis.start();
    document.body.style.overflow = "";
  }
  burger.addEventListener("click", () =>
    menu.classList.contains("is-open") ? closeMenu() : openMenu()
  );
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  /* ---------------- drag-to-scroll collection ---------------- */
  document.querySelectorAll(".scroller").forEach((scroller) => {
    let isDown = false, startX = 0, startLeft = 0, moved = 0;
    scroller.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return; // touch scrolls natively
      isDown = true; moved = 0;
      startX = e.clientX; startLeft = scroller.scrollLeft;
      scroller.classList.add("is-dragging");
    });
    window.addEventListener("pointermove", (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      scroller.scrollLeft = startLeft - dx;
    });
    window.addEventListener("pointerup", () => {
      isDown = false;
      scroller.classList.remove("is-dragging");
    });
    // swallow the click that follows a drag
    scroller.addEventListener("click", (e) => {
      if (moved > 8) { e.preventDefault(); e.stopPropagation(); moved = 0; }
    }, true);
  });

  /* ---------------- materials accordion ---------------- */
  const items = document.querySelectorAll(".materials__item");
  items.forEach((item) => {
    const head = item.querySelector(".materials__head");
    const body = item.querySelector(".materials__body");
    if (head.getAttribute("aria-expanded") === "true") body.style.height = "auto";

    head.addEventListener("click", () => {
      const isOpen = head.getAttribute("aria-expanded") === "true";
      // close siblings
      items.forEach((other) => {
        if (other === item) return;
        const oHead = other.querySelector(".materials__head");
        const oBody = other.querySelector(".materials__body");
        if (oHead.getAttribute("aria-expanded") === "true") {
          oHead.setAttribute("aria-expanded", "false");
          animateHeight(oBody, false);
        }
      });
      head.setAttribute("aria-expanded", String(!isOpen));
      animateHeight(body, !isOpen);
    });
  });

  function animateHeight(body, open) {
    if (hasGsap && !reduceMotion) {
      if (open) {
        gsap.set(body, { height: "auto" });
        gsap.from(body, { height: 0, duration: 0.55, ease: "power3.inOut" });
      } else {
        gsap.to(body, { height: 0, duration: 0.45, ease: "power3.inOut" });
      }
    } else {
      body.style.height = open ? "auto" : "0px";
    }
  }

  /* ---------------- wishlist hearts ---------------- */
  document.querySelectorAll(".product__wish").forEach((btn) => {
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const active = btn.classList.toggle("is-active");
      btn.setAttribute("aria-pressed", String(active));
    });
  });

  /* ---------------- newsletter ---------------- */
  const form = document.querySelector(".newsletter");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const note = form.querySelector(".newsletter__note");
      const input = form.querySelector("input");
      const email = input.value.trim();
      const msg = window.I18N ? I18N.t("foot.nlOk") : "Grazie — your 10% code is on its way to";
      try {
        const r = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, lang: window.I18N ? I18N.lang : "en", source: "footer" }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "error");
        note.textContent = msg + " " + email;
        input.value = "";
      } catch {
        note.textContent = window.I18N ? I18N.t("cart.invalid") : "Please check the email and try again.";
      }
    });
  }

  /* ---------------- custom cursor ---------------- */
  const cursor = document.querySelector(".cursor");
  if (cursor && finePointer && !reduceMotion && hasGsap) {
    const label = cursor.querySelector(".cursor__label");
    const pos = { x: -100, y: -100 };
    const target = { x: -100, y: -100 };
    window.addEventListener("pointermove", (e) => {
      target.x = e.clientX; target.y = e.clientY;
    }, { passive: true });
    gsap.ticker.add(() => {
      pos.x += (target.x - pos.x) * 0.16;
      pos.y += (target.y - pos.y) * 0.16;
      cursor.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%,-50%)`;
    });
    document.querySelectorAll("[data-cursor]").forEach((el) => {
      el.addEventListener("pointerenter", () => {
        label.textContent = el.dataset.cursor;
        cursor.classList.add("has-label");
      });
      el.addEventListener("pointerleave", () => cursor.classList.remove("has-label"));
    });
    document.addEventListener("pointerleave", () => { cursor.style.opacity = "0"; });
    document.addEventListener("pointerenter", () => { cursor.style.opacity = "1"; });
  } else if (cursor) {
    cursor.remove();
  }

  /* ---------------- footer year ---------------- */
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  /* keep scroll triggers honest after dynamic catalog render */
  window.addEventListener("products:rendered", () => {
    if (hasST) ScrollTrigger.refresh();
  });
})();
