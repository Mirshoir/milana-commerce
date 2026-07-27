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
    if (prod.price_visible !== false && prod.tag === "sale" && prod.old_price) return `<span class="product__tag product__tag--sale pd__tagchip">−${Math.round((1 - prod.price / prod.old_price) * 100)}%</span>`;
    if (prod.tag === "sale") return `<span class="product__tag product__tag--sale pd__tagchip">${I18N.t("shop.tagSale")}</span>`;
    return "";
  }

  function priceHtml(prod) {
    if (prod.price_visible === false) return `<strong>${I18N.t("price.manager")}</strong><small>${I18N.t("cart.unitPrice")}</small>`;
    return `<strong>${I18N.fmtPrice(prod.price)}</strong>${prod.old_price ? `<s>${I18N.fmtPrice(prod.old_price)}</s>` : ""}<small>${I18N.t("cart.unitPrice")}</small>`;
  }

  function setMeta(attribute, key, content) {
    let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute(attribute, key);
      document.head.appendChild(node);
    }
    node.setAttribute("content", content || "");
  }

  function updateSeoMetadata(lang) {
    const displayName = I18N.productName(p);
    const title = displayName + " — MILANA PREMIUM";
    const description = I18N.packageText(p.desc?.[lang] || p.desc?.uz || p.desc?.en || p.desc?.ru || p.name)
      .replace(/\s+/g, " ").trim().slice(0, 160);
    const url = new URL("/p/" + encodeURIComponent(p.slug), location.origin).href;
    const images = (p.images || []).filter(Boolean).map((image) => new URL(image, location.origin).href);
    const image = images[0] || new URL("/assets/hero-poster.jpg", location.origin).href;
    const currency = String(p.currency || "USD").toUpperCase();
    const price = Number(p.wholesale_price || p.price || 0);
    const canonical = document.head.querySelector('link[rel="canonical"]') || document.head.appendChild(document.createElement("link"));
    canonical.setAttribute("rel", "canonical");
    canonical.setAttribute("href", url);
    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:locale", ({ uz: "uz_UZ", ru: "ru_RU", en: "en_US" })[lang] || "uz_UZ");
    setMeta("property", "og:type", "product");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", image);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);
    const schema = {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": url + "#product",
      name: displayName,
      description,
      image: images.length ? images : [image],
      sku: p.model_no || p.variant || String(p.id),
      category: displayName,
      brand: { "@type": "Brand", name: "MILANA PREMIUM" },
      url,
    };
    if (price > 0 && p.price_visible !== false) {
      schema.offers = {
        "@type": "Offer", url, price, priceCurrency: currency,
        availability: Number(p.available_qop) === 0 ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", name: "MILANA PREMIUM" },
      };
    }
    if (Number(p.reviews) > 0 && Number(p.rating) > 0) {
      schema.aggregateRating = { "@type": "AggregateRating", ratingValue: Number(p.rating), reviewCount: Number(p.reviews) };
    }
    let jsonLd = document.getElementById("product-jsonld");
    if (!jsonLd) {
      jsonLd = document.createElement("script");
      jsonLd.id = "product-jsonld";
      jsonLd.type = "application/ld+json";
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify(schema);
  }

  function renderGallery() {
    const displayName = I18N.productName(p);
    const cur = p.images[imgIdx] || "";
    const poster = p.images.find((u) => !isVideo(u)) || "";
    const main = isVideo(cur)
      ? `<video src="${esc(cur)}" controls autoplay muted loop playsinline preload="metadata"${poster ? ` poster="${esc(poster)}"` : ""}></video>`
      : `<img src="${esc(cur)}" alt="${esc(displayName)}" decoding="async" fetchpriority="high" onerror="this.classList.add('is-broken');this.removeAttribute('src')">`;
    const expand = isVideo(cur) ? "" : `<button class="pd__expand" type="button" aria-label="${esc(I18N.t("prod.zoom"))}"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>`;
    $("#pd-main").innerHTML = tagChip(p) + main + expand;
    $("#pd-thumbs").innerHTML = p.images.map((u, i) => {
      const vid = isVideo(u);
      const thumb = vid ? (poster ? `<img src="${esc(poster)}" alt="" loading="lazy" decoding="async" onerror="this.classList.add('is-broken');this.removeAttribute('src')">` : "") : `<img src="${esc(u)}" alt="" loading="lazy" decoding="async" onerror="this.classList.add('is-broken');this.removeAttribute('src')">`;
      return `<button data-img="${i}" class="${i === imgIdx ? "is-on" : ""}${vid ? " is-video" : ""}" aria-label="Media ${i + 1}">${thumb}</button>`;
    }).join("");
    window.MilanaState?.wireImages?.($("#pd"));
  }

  function render() {
    const lang = I18N.lang;
    const displayName = I18N.productName(p);
    const catalogName = p.catalog_panel ? I18N.panelName(p.catalog_panel) : I18N.catName(p.category);
    updateSeoMetadata(lang);
    $("#crumb-name").textContent = displayName;
    const cg = document.getElementById("crumb-gender");
    if (cg && p.gender) {
      cg.hidden = false; cg.textContent = I18N.catName(p.gender);
      cg.href = "/shop?gender=" + encodeURIComponent(p.gender);
      const sep = document.getElementById("crumb-gender-sep"); if (sep) sep.hidden = false;
    }
    const cc = document.getElementById("crumb-cat");
    if (cc && (p.catalog_panel || p.category)) {
      cc.hidden = false; cc.textContent = catalogName;
      cc.href = p.catalog_panel
        ? "/shop?panel=" + encodeURIComponent(p.catalog_panel)
        : "/shop?" + (p.gender ? "gender=" + encodeURIComponent(p.gender) + "&" : "") + "category=" + encodeURIComponent(p.category);
      const sep = document.getElementById("crumb-cat-sep"); if (sep) sep.hidden = false;
    }
    $("#pd-cat").textContent = displayName;
    $("#pd-name").textContent = displayName;
    const rating = $("#pd-rating");
    const hasRating = Number(p.reviews) > 0 && Number(p.rating) > 0;
    rating.hidden = !hasRating;
    rating.innerHTML = hasRating ? `<svg class="ic"><use href="#i-star"/></svg>${p.rating} <span>(${p.reviews} ${I18N.t("best.reviews")})</span>` : "";
    $("#pd-price").classList.toggle("pd__price--pending", p.price_visible === false);
    $("#pd-price").innerHTML = priceHtml(p);
    $("#pd-fabric").textContent = (window.MilanaFab || ((x) => x))(p.fabric[lang] || p.fabric.en || "");
    $("#pd-meta").innerHTML = [
      [I18N.t("prod.model"), p.model_no || p.variant || p.id],
      [I18N.t("prod.category"), displayName],
      [I18N.t("prod.wholesaleBag"), I18N.t("cart.defaultMix")],
    ].map(([k, v]) => `<span><i>${esc(k)}</i><b>${esc(v)}</b></span>`).join("");
    $("#pd-desc").textContent = I18N.packageText(p.desc[lang] || p.desc.en || "");
    $("#pd-care").textContent = [
      p.fabric[lang] || p.fabric.en || "",
      p.care?.[lang] || p.care?.en || "",
    ].filter(Boolean).join("\n");
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
      $("#related-grid").innerHTML = p.related.map((r) => {
        const relatedName = I18N.productName(r);
        return `
        <article class="product">
          <div class="product__media" data-imgs="${esc((r.images || []).slice(0, 6).join('|'))}">
            <a class="product__go" href="/p/${r.slug}"><figure>${isVideo(r.images[0]) ? `<video src="${esc(r.images[0])}" muted loop playsinline autoplay preload="metadata"></video>` : `<img src="${esc(r.images[0] || "")}" alt="${esc(relatedName)}" loading="lazy" onerror="this.classList.add('is-broken');this.removeAttribute('src')">`}</figure></a>
          </div>
          <div class="product__info">
            <div class="product__row"><h3><a href="/p/${r.slug}">${esc(relatedName)}</a></h3>
              <p class="product__price${r.price_visible === false ? " product__price--pending" : ""}">${r.price_visible === false ? I18N.t("price.manager") : I18N.fmtPrice(r.price)}</p></div>
            ${Number(r.reviews) > 0 && Number(r.rating) > 0 ? `<p class="product__rating"><svg class="ic"><use href="#i-star"/></svg>${r.rating} <span>(${r.reviews})</span></p>` : ""}
          </div>
        </article>`;
      }).join("");
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

  /* ---------------- events ---------------- */
  document.addEventListener("click", (e) => {
    const th = e.target.closest("[data-img]");
    if (th) { imgIdx = +th.dataset.img; renderGallery(); return; }
    /* полноэкранный просмотр: клик по основному фото или кнопке «увеличить» */
    if (p && (e.target.closest(".pd__expand") || (e.target.tagName === "IMG" && e.target.closest("#pd-main")))) {
      window.MilanaLightbox?.open(p.images, imgIdx);
      return;
    }

    const wish = e.target.closest("#pd-wish");
    if (wish && p) {
      const payload = { id: p.id, slug: p.slug, name: p.name, image: p.images[0] || "", price: p.price, price_visible: p.price_visible };
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
    Cart.add({ id: p.id, slug: p.slug, name: window.MilanaName ? MilanaName(p) : p.name, image: p.images[0] || "", price: p.price, retail_price: p.retail_price || p.price, price_visible: p.price_visible, price_label: p.price_label, sizes: p.sizes, qty });
    Cart.open();
  });

  function renderReviews() {
    const summary = $("#reviews-summary");
    const list = $("#reviews-list");
    const form = $("#reviews-form");
    if (!summary || !list || !p) return;
    summary.textContent = reviewState.summary.count
      ? I18N.t("reviews.summary", { rating: Math.round(Number(reviewState.summary.rating ?? reviewState.summary.avg) * 10) / 10, count: reviewState.summary.count })
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
  }
  boot();

  window.addEventListener("i18n:change", () => { if (p) { render(); openFirstAcc(); } });
  window.addEventListener("milana:wishlist", renderWish);
  window.addEventListener("milana:auth", renderReviews);
})();
