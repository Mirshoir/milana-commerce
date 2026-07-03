/* ============================================================
   MILANA — product detail page (/p/:slug)
   ============================================================ */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isVideo = (u) => /\.(mp4|webm)(\?|$)/i.test(u || "");

  const slug = location.pathname.startsWith("/p/")
    ? location.pathname.split("/")[2]
    : new URLSearchParams(location.search).get("slug");

  let p = null;
  let qty = 1;
  let imgIdx = 0;
  let reviewState = { reviews: [], summary: { count: 0, avg: 0 } };
  let reviewRating = 5;

  function tagChip(prod) {
    if (prod.tag === "bestseller") return `<span class="product__tag pd__tagchip">${I18N.t("best.tagBest")}</span>`;
    if (prod.tag === "new") return `<span class="product__tag product__tag--new pd__tagchip">${I18N.t("best.tagNew")}</span>`;
    if (prod.tag === "sale" && prod.old_price) return `<span class="product__tag product__tag--sale pd__tagchip">−${Math.round((1 - prod.price / prod.old_price) * 100)}%</span>`;
    return "";
  }

  function renderGallery() {
    const cur = p.images[imgIdx] || "";
    const poster = p.images.find((u) => !isVideo(u)) || "";
    const main = isVideo(cur)
      ? `<video src="${esc(cur)}" controls autoplay muted loop playsinline preload="metadata"${poster ? ` poster="${esc(poster)}"` : ""}></video>`
      : `<img src="${esc(cur)}" alt="${esc(p.name)}" decoding="async" fetchpriority="high" onerror="this.classList.add('is-broken');this.removeAttribute('src')">`;
    $("#pd-main").innerHTML = tagChip(p) + main;
    $("#pd-thumbs").innerHTML = p.images.map((u, i) => {
      const vid = isVideo(u);
      const thumb = vid ? (poster ? `<img src="${esc(poster)}" alt="" loading="lazy" decoding="async" onerror="this.classList.add('is-broken');this.removeAttribute('src')">` : "") : `<img src="${esc(u)}" alt="" loading="lazy" decoding="async" onerror="this.classList.add('is-broken');this.removeAttribute('src')">`;
      return `<button data-img="${i}" class="${i === imgIdx ? "is-on" : ""}${vid ? " is-video" : ""}" aria-label="Media ${i + 1}">${thumb}</button>`;
    }).join("");
    window.MilanaState?.wireImages?.($("#pd"));
  }

  function render() {
    const lang = I18N.lang;
    document.title = p.name + " — MILANA PREMIUM";
    $("#crumb-name").textContent = p.name;
    $("#pd-cat").textContent = I18N.catName(p.category);
    $("#pd-name").textContent = p.name;
    $("#pd-rating").innerHTML = `<svg class="ic"><use href="#i-star"/></svg>${p.rating} <span>(${p.reviews} ${I18N.t("best.reviews")})</span>`;
    $("#pd-price").innerHTML = `<strong>${I18N.fmtPrice(p.price)}</strong>${p.old_price ? `<s>${I18N.fmtPrice(p.old_price)}</s>` : ""}<small>${I18N.t("cart.unitPrice")}</small>`;
    $("#pd-fabric").textContent = (p.fabric[lang] || p.fabric.en || "");
    $("#pd-meta").innerHTML = [
      [I18N.t("prod.model"), p.model_no || p.variant || p.id],
      [I18N.t("prod.category"), I18N.catName(p.category)],
      [I18N.t("prod.wholesaleBag"), I18N.t("cart.defaultMix")],
    ].map(([k, v]) => `<span><i>${esc(k)}</i><b>${esc(v)}</b></span>`).join("");
    $("#pd-desc").textContent = (p.desc[lang] || p.desc.en || "");
    $("#pd-care").textContent = (p.fabric[lang] || p.fabric.en || "") + "\n" + careLine();
    $("#pd").classList.remove("is-loading", "is-error");
    renderQty();
    renderGallery();
    renderWish();
    renderReviews();

    /* sizes */
    const wrap = $("#pd-sizes");
    if (p.sizes.length) {
      wrap.innerHTML = p.sizes.map((s) =>
        `<button type="button" disabled>${esc(s)}</button>`).join("");
      wrap.parentElement?.classList?.remove("hidden");
    } else {
      wrap.previousElementSibling.style.display = "none";
      wrap.style.display = "none";
    }

    /* related */
    if (p.related && p.related.length) {
      $("#related").hidden = false;
      $("#related-grid").innerHTML = p.related.map((r) => `
        <article class="product">
          <div class="product__media">
            <a class="product__go" href="/p/${r.slug}"><figure>${isVideo(r.images[0]) ? `<video src="${esc(r.images[0])}" muted loop playsinline autoplay preload="metadata"></video>` : `<img src="${esc(r.images[0] || "")}" alt="${esc(r.name)}" loading="lazy" onerror="this.classList.add('is-broken');this.removeAttribute('src')">`}</figure></a>
          </div>
          <div class="product__info">
            <div class="product__row"><h3><a href="/p/${r.slug}">${esc(r.name)}</a></h3>
              <p class="product__price">${I18N.fmtPrice(r.price)}</p></div>
            <p class="product__rating"><svg class="ic"><use href="#i-star"/></svg>${r.rating} <span>(${r.reviews})</span></p>
          </div>
        </article>`).join("");
      window.MilanaState?.wireImages?.($("#related"));
    }
  }

  function renderWish() {
    const btn = $("#pd-wish");
    if (!btn || !p) return;
    const active = window.MilanaState?.wishlist?.has?.(p.id);
    btn.classList.toggle("is-active", Boolean(active));
    btn.dataset.wishId = p.id;
    btn.setAttribute("aria-pressed", String(Boolean(active)));
  }

  function renderError() {
    $("#pd").classList.remove("is-loading");
    $("#pd").classList.add("is-error");
    $("#pd-main").innerHTML = `<div class="pd__unavailable"><p>${esc(navigator.onLine ? I18N.t("prod.unavailable") : I18N.t("shop.offline"))}</p><a class="btn btn--ghost" href="/shop"><span>${esc(I18N.t("prod.back"))}</span></a></div>`;
    $("#pd-thumbs").innerHTML = "";
    $("#pd-name").textContent = I18N.t("prod.unavailableTitle");
    $("#pd-cat").textContent = "";
  }

  function careLine() {
    const lines = {
      en: "Care: gentle wash at 30°, no tumble dry, low-heat iron from the reverse side.",
      ru: "Уход: деликатная стирка при 30°, без машинной сушки, утюг на низкой температуре с изнанки.",
      uz: "Parvarish: 30° da nozik yuvish, quritgichsiz, teskari tomondan past haroratda dazmollash.",
    };
    return lines[I18N.lang] || lines.en;
  }

  /* ---------------- events ---------------- */
  document.addEventListener("click", (e) => {
    const th = e.target.closest("[data-img]");
    if (th) { imgIdx = +th.dataset.img; renderGallery(); return; }

    const wish = e.target.closest("#pd-wish");
    if (wish && p) {
      const payload = { id: p.id, slug: p.slug, name: p.name, image: p.images[0] || "", price: p.price };
      if (window.MilanaAuth?.customer) {
        const active = wish.classList.contains("is-active");
        fetch("/api/products/" + encodeURIComponent(p.id) + "/like", { method: active ? "DELETE" : "POST" })
          .then((r) => {
            if (!r.ok) throw new Error();
            active ? window.MilanaState?.wishlist?.remove?.(payload.id) : window.MilanaState?.wishlist?.add?.(payload);
          })
          .then(renderWish)
          .catch(() => { window.MilanaState?.wishlist?.toggle?.(payload); renderWish(); });
      } else {
        window.MilanaState?.wishlist?.toggle?.(payload);
        renderWish();
      }
      return;
    }

    const head = e.target.closest(".pd__acc-head");
    if (head) {
      const open = head.getAttribute("aria-expanded") === "true";
      const body = head.nextElementSibling;
      head.setAttribute("aria-expanded", String(!open));
      body.style.height = !open ? body.scrollHeight + "px" : "0px";
      return;
    }
  });

  function renderQty() { $("#qty-n").textContent = qty + " " + I18N.t("cart.bagShort"); }
  $("#qty-minus").addEventListener("click", () => { qty = Math.max(1, qty - 1); renderQty(); });
  $("#qty-plus").addEventListener("click", () => { qty = Math.min(20, qty + 1); renderQty(); });

  $("#pd-add").addEventListener("click", () => {
    if (!p) return;
    Cart.add({ id: p.id, slug: p.slug, name: p.name, image: p.images[0] || "", price: p.price, retail_price: p.retail_price || p.price, sizes: p.sizes, qty });
    Cart.open();
  });

  function renderReviews() {
    const summary = $("#reviews-summary");
    const list = $("#reviews-list");
    const form = $("#reviews-form");
    if (!summary || !list || !p) return;
    summary.textContent = reviewState.summary.count
      ? I18N.t("reviews.summary", { rating: Math.round(reviewState.summary.avg * 10) / 10, count: reviewState.summary.count })
      : I18N.t("reviews.none");
    list.innerHTML = reviewState.reviews.length ? reviewState.reviews.map((r) => `
      <article class="review">
        <strong>${"★".repeat(Number(r.rating) || 0)}${"☆".repeat(5 - (Number(r.rating) || 0))}</strong>
        <p>${esc(r.comment || I18N.t("reviews.verified"))}</p>
        <span>${esc(r.customer_name || I18N.t("reviews.customer"))} · ${esc((r.created_at || "").slice(0, 10))}</span>
      </article>`).join("") : `<div class="account-empty"><p>${esc(I18N.t("reviews.empty"))}</p></div>`;
    if (form) form.hidden = !window.MilanaAuth?.customer;
    renderReviewStars();
  }

  function renderReviewStars() {
    document.querySelectorAll("[data-review-star]").forEach((button) => {
      const on = Number(button.dataset.reviewStar) <= reviewRating;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-checked", String(Number(button.dataset.reviewStar) === reviewRating));
    });
    const input = document.querySelector('#reviews-form input[name="rating"]');
    if (input) input.value = String(reviewRating);
  }

  async function loadReviews() {
    if (!p) return;
    try {
      const r = await fetch(`/api/products/${encodeURIComponent(p.slug)}/reviews?product_id=${encodeURIComponent(p.id)}`);
      if (!r.ok) throw new Error();
      reviewState = await r.json();
    } catch {
      reviewState = { reviews: [], summary: { count: 0, avg: 0 } };
    }
    renderReviews();
  }

  $("#reviews-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.querySelector("[data-review-msg]");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    msg.hidden = true;
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: p.id, product_slug: p.slug, rating: data.rating, comment: data.comment }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(res.error || "review_failed");
      msg.textContent = I18N.t("reviews.submitted");
      msg.classList.add("is-good");
      msg.hidden = false;
      e.currentTarget.reset();
      reviewRating = 5;
      renderReviewStars();
    } catch (ex) {
      msg.textContent = ex.message === "verified_purchase_required" ? I18N.t("reviews.verifiedOnly") : I18N.t("reviews.failed");
      msg.classList.remove("is-good");
      msg.hidden = false;
    }
  });

  document.addEventListener("click", (e) => {
    const star = e.target.closest("[data-review-star]");
    if (!star) return;
    reviewRating = Number(star.dataset.reviewStar) || 5;
    renderReviewStars();
  });

  /* burger */
  const burger = $(".burger"), menu = $("#menu");
  burger.addEventListener("click", () => {
    const open = menu.classList.toggle("is-open");
    burger.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
  });
  $("#year") && ($("#year").textContent = new Date().getFullYear());

  /* first accordion open */
  function openFirstAcc() {
    const body = document.querySelector('.pd__acc-head[aria-expanded="true"]')?.nextElementSibling;
    if (body) body.style.height = "auto";
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    await I18N.ready;
    if (!slug) { renderError(); return; }
    try {
      const r = await fetch("/api/products/" + encodeURIComponent(slug));
      if (!r.ok) throw new Error();
      p = await r.json();
    } catch { renderError(); return; }
    render();
    openFirstAcc();
    await loadReviews();

    /* Product JSON-LD */
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "Product",
      name: p.name, image: p.images, description: p.desc.en,
      offers: { "@type": "Offer", price: p.price, priceCurrency: p.currency || "USD", availability: "https://schema.org/InStock" },
      aggregateRating: p.reviews ? { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews } : undefined,
    });
    document.head.appendChild(ld);
  }
  boot();

  window.addEventListener("i18n:change", () => { if (p) { render(); openFirstAcc(); } });
  window.addEventListener("milana:wishlist", renderWish);
  window.addEventListener("milana:auth", renderReviews);
})();
