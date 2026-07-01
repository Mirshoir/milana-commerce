/* ============================================================
   MILANA — landing dynamics: bestsellers from API,
   contact links from settings, localized address.
   Requires i18n.js + cart.js.
   ============================================================ */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isVideo = (u) => /\.(mp4|webm)(\?|$)/i.test(u || "");
  const mediaTag = (url, alt) => isVideo(url)
    ? `<video src="${esc(url)}" muted loop playsinline autoplay preload="metadata" aria-label="${esc(alt)}"></video>`
    : `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  let products = [];

  /* ---------- bestsellers from the live catalog ---------- */
  function tagChip(p) {
    if (p.tag === "bestseller") return `<span class="product__tag" data-i18n="best.tagBest">${I18N.t("best.tagBest")}</span>`;
    if (p.tag === "new") return `<span class="product__tag product__tag--new" data-i18n="best.tagNew">${I18N.t("best.tagNew")}</span>`;
    if (p.tag === "sale" && p.old_price) {
      const pct = Math.round((1 - p.price / p.old_price) * 100);
      return `<span class="product__tag product__tag--sale">−${pct}%</span>`;
    }
    return "";
  }

  function card(p) {
    const lang = I18N.lang;
    const fabric = (p.fabric && (p.fabric[lang] || p.fabric.en)) || "";
    return `
    <article class="product" data-id="${p.id}">
      <div class="product__media">
        ${tagChip(p)}
        <button class="product__wish" aria-label="Wishlist"><svg class="ic"><use href="#i-heart"/></svg></button>
        <a class="product__go" href="/p/${p.slug}"><figure>${mediaTag(p.images[0] || "", p.name)}</figure></a>
        <div class="product__quick">
          <div class="product__sizes">${p.sizes.map((s) => `<span data-size="${esc(s)}">${esc(s)}</span>`).join("")}</div>
          <button class="product__add" data-add="${p.id}"><svg class="ic"><use href="#i-cart"/></svg><span data-i18n="best.add">${I18N.t("best.add")}</span></button>
        </div>
      </div>
      <div class="product__info">
        <div class="product__row"><h3><a href="/p/${p.slug}">${esc(p.name)}</a></h3>
          <p class="product__price">${I18N.fmtPrice(p.price)} ${p.old_price ? `<s>${I18N.fmtPrice(p.old_price)}</s>` : ""}</p></div>
        <p class="product__fab" data-fab>${esc(fabric)}</p>
        <p class="product__rating"><svg class="ic"><use href="#i-star"/></svg>${p.rating} <span>(${p.reviews} <i data-i18n="best.reviews">${I18N.t("best.reviews")}</i>)</span></p>
      </div>
    </article>`;
  }

  async function renderBestsellers() {
    const grid = $(".product-grid");
    if (!grid) return;
    try {
      const r = await fetch("/api/products?limit=4");
      products = await r.json();
      grid.innerHTML = products.map(card).join("");
      window.dispatchEvent(new CustomEvent("products:rendered"));
    } catch { /* static fallback cards stay */ }
  }

  /* add-to-cart + size pick (event delegation, works for static + dynamic) */
  document.addEventListener("click", (e) => {
    const addBtn = e.target.closest("[data-add]");
    if (addBtn) {
      e.preventDefault();
      const p = products.find((x) => x.id === Number(addBtn.dataset.add));
      if (!p) return;
      Cart.add({ id: p.id, slug: p.slug, name: p.name, image: p.images[0] || "", price: p.price, sizes: p.sizes });
    }
    const wish = e.target.closest(".product__wish");
    if (wish && !wish.dataset.bound) { wish.classList.toggle("is-active"); e.preventDefault(); }
  });

  /* ---------- hero: image or video from settings ---------- */
  function applyHero() {
    const s = I18N.settings;
    const fig = $(".hero__img");
    if (!fig || !s) return;
    if (s.hero_type === "video" && s.hero_video) {
      if (fig.querySelector("video")) return; // already swapped
      const v = document.createElement("video");
      v.src = s.hero_video;
      v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
      v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
      v.preload = "auto";
      if (s.hero_poster) v.poster = s.hero_poster;
      v.className = "hero__video";
      fig.innerHTML = "";
      fig.appendChild(v);
      v.play && v.play().catch(() => {});
    } else if (s.hero_image) {
      const img = fig.querySelector("img");
      if (img && !img.getAttribute("src").endsWith(s.hero_image)) img.src = s.hero_image;
    }
  }

  function refreshLangBits() {
    document.querySelectorAll(".product").forEach((card) => {
      const p = products.find((x) => x.id === Number(card.dataset.id));
      if (!p) return;
      const fab = card.querySelector("[data-fab]");
      if (fab) fab.textContent = (p.fabric && (p.fabric[I18N.lang] || p.fabric.en)) || "";
      const price = card.querySelector(".product__price");
      if (price) price.innerHTML = I18N.fmtPrice(p.price) + (p.old_price ? ` <s>${I18N.fmtPrice(p.old_price)}</s>` : "");
    });
  }

  I18N.ready.then(() => { applyHero(); renderBestsellers(); });
  window.addEventListener("i18n:change", refreshLangBits);
})();
