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
  const mediaTag = (url, alt, eager = false) => isVideo(url)
    ? `<video src="${esc(url)}" muted loop playsinline autoplay preload="metadata" aria-label="${esc(alt)}"></video>`
    : `<img src="${esc((window.MilanaThumb || ((x) => x))(url))}" data-full="${esc(url)}" alt="${esc(alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async" fetchpriority="${eager ? "high" : "auto"}" onerror="if(this.dataset.full&&this.src.indexOf('/uploads/thumbs/')>-1){this.src=this.dataset.full}else{this.classList.add('is-broken');this.removeAttribute('src')}">`;
  const apiItems = (payload) => Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.items) ? payload.items : []);
  let products = [];
  const retailMode = () => window.MilanaAuth?.customer?.account_type === "individual";
  const availabilityFor = (p) => retailMode() ? p?.availability_retail : p?.availability_wholesale;
  const canOrder = (p) => {
    const explicit = retailMode() ? p?.can_order_retail : p?.can_order_wholesale;
    if (typeof explicit === "boolean") return explicit;
    const availability = availabilityFor(p);
    if (typeof availability?.available === "boolean") return availability.available;
    if (p?.in_stock === false) return false;
    if (retailMode() && p?.retail_enabled === false) return false;
    const stock = retailMode() ? p?.retail_stock : p?.available_qop;
    return stock == null || stock === "" || Number(stock) > 0;
  };
  const availabilityStatus = (p) => availabilityFor(p)?.status
    || (p?.in_stock === false ? "preorder" : canOrder(p) ? "in_stock" : "out_of_stock");

  /* ---------- bestsellers from the live catalog ---------- */
  function tagChip(p) {
    if (p.tag === "bestseller") return `<span class="product__tag" data-i18n="best.tagBest">${I18N.t("best.tagBest")}</span>`;
    if (p.tag === "new") return `<span class="product__tag product__tag--new" data-i18n="best.tagNew">${I18N.t("best.tagNew")}</span>`;
    if (p.price_visible !== false && p.tag === "sale" && p.old_price) {
      const pct = Math.round((1 - p.price / p.old_price) * 100);
      return `<span class="product__tag product__tag--sale">−${pct}%</span>`;
    }
    if (p.tag === "sale") return `<span class="product__tag product__tag--sale">${I18N.t("shop.tagSale")}</span>`;
    return "";
  }

  function priceHtml(p) {
    if (p.price_visible === false) return `<p class="product__price product__price--pending">${I18N.t("price.manager")}</p>`;
    return `<p class="product__price">${I18N.fmtPrice(p.price)} ${p.old_price ? `<s>${I18N.fmtPrice(p.old_price)}</s>` : ""}</p>`;
  }

  function card(p, i = 0) {
    const lang = I18N.lang;
    const fabric = window.MilanaFabricText
      ? MilanaFabricText(p, lang)
      : (window.MilanaFab || ((x) => x))((p.fabric && (p.fabric[lang] || p.fabric.en)) || "");
    const nm = window.MilanaName ? MilanaName(p) : p.name;
    const wished = window.MilanaState?.wishlist?.has?.(p.id);
    const orderable = canOrder(p);
    const unavailableLabel = availabilityStatus(p) === "preorder" ? I18N.t("shop.stockPre") : I18N.t("prod.unavailable");
    return `
    <article class="product" data-id="${p.id}">
      <div class="product__media" data-imgs="${esc((p.images || []).slice(0, 6).join('|'))}">
        <button class="product__wish${wished ? " is-active" : ""}" type="button"
          data-wish-id="${esc(p.id)}" aria-label="${esc(I18N.t("auth.wishlist"))}"
          aria-pressed="${wished ? "true" : "false"}"><svg class="ic"><use href="#i-heart"/></svg></button>
        <a class="product__go" href="/p/${p.slug}"><figure>${mediaTag(p.images[0] || "", nm, i < 4)}</figure></a>
        <div class="product__quick">
          <div class="product__sizes">${p.sizes.map((s) => `<span data-size="${esc(s)}" role="${retailMode() ? "button" : "presentation"}"${retailMode() ? ' tabindex="0"' : ""}>${esc(s)}</span>`).join("")}</div>
          ${orderable
            ? `<button class="product__add" data-add="${p.id}"><svg class="ic"><use href="#i-cart"/></svg><span data-i18n="best.add">${I18N.t("best.add")}</span></button>`
            : `<a class="product__add product__add--pre" href="/p/${p.slug}"><span>${esc(unavailableLabel)}</span></a>`}
        </div>
      </div>
      <div class="product__info">
        <div class="product__row"><h3><a href="/p/${p.slug}">${esc(nm)}</a></h3>
          ${priceHtml(p)}${tagChip(p)}</div>
        <p class="product__fab" data-fab${fabric ? "" : " hidden"}>${esc(fabric)}</p>
        ${(Number(p.rating) > 0) ? `<p class="product__rating" title="${Number(p.rating).toFixed(1)} / 5">
          <span class="stars" style="--r:${((Number(p.rating)/5)*100).toFixed(1)}%" aria-hidden="true"><i>★★★★★</i><b>★★★★★</b></span>
          <em>${Number(p.rating).toFixed(1)}</em>${Number(p.reviews) > 0 ? ` <span>(${p.reviews})</span>` : ""}
        </p>` : ""}
      </div>
    </article>`;
  }

  let productsRefresh = null;
  async function renderBestsellers() {
    const grid = $(".product-grid");
    if (!grid) return;
    if (productsRefresh) return productsRefresh;
    try {
      const localNikePreview = document.documentElement.classList.contains("nike-local");
      productsRefresh = fetch(`/api/products?tag=bestseller&sort=popular&limit=${localNikePreview ? 8 : 12}`, { headers: { Accept: "application/json" } })
        .then((response) => {
          if (!response.ok) throw new Error("catalog_unavailable");
          return response.json();
        })
        .then((payload) => {
          products = apiItems(payload);
          window.MilanaState?.wishlist?.refresh?.(products);
          grid.innerHTML = products.map(card).join("");
          window.MilanaState?.wireImages?.(grid);
          window.dispatchEvent(new CustomEvent("products:rendered"));
          return products;
        })
        .finally(() => { productsRefresh = null; });
      await productsRefresh;
    } catch { /* static fallback cards stay */ }
  }

  function addProductToCart(p, size = "") {
    return Cart.add({
      id: p.id, slug: p.slug, name: window.MilanaName ? MilanaName(p) : p.name,
      name_i18n: p.name_i18n, image: p.images[0] || "", price: p.price,
      retail_price: p.retail_price || p.price, price_visible: p.price_visible,
      price_label: p.price_label, sizes: p.sizes, size,
      pack_pieces: p.order_units?.find((orderUnit) => orderUnit.unit_type === "pachka")?.pieces,
      retail_enabled: p.retail_enabled, retail_stock: p.retail_stock,
      available_qop: p.available_qop, in_stock: p.in_stock,
      can_order_wholesale: p.can_order_wholesale, can_order_retail: p.can_order_retail,
      availability_wholesale: p.availability_wholesale, availability_retail: p.availability_retail,
    });
  }

  /* add-to-cart + size pick (event delegation, works for static + dynamic) */
  document.addEventListener("click", async (e) => {
    const quickSize = e.target.closest(".product__sizes [data-size]");
    if (quickSize && retailMode()) {
      e.preventDefault();
      quickSize.closest(".product__sizes")?.querySelectorAll("[data-size]").forEach((chip) => {
        chip.classList.toggle("is-on", chip === quickSize);
      });
      const product = products.find((item) => String(item.id) === String(quickSize.closest(".product")?.dataset.id));
      if (product) addProductToCart(product, quickSize.dataset.size);
      return;
    }
    const addBtn = e.target.closest("[data-add]");
    if (addBtn) {
      e.preventDefault();
      const p = products.find((x) => x.id === Number(addBtn.dataset.add));
      if (!p) return;
      const size = addBtn.closest(".product")?.querySelector(".product__sizes [data-size].is-on")?.dataset.size || "";
      if (retailMode() && !size) {
        const sizes = addBtn.closest(".product__quick")?.querySelector(".product__sizes");
        if (sizes) sizes.style.display = "flex";
        addBtn.style.display = "none";
        sizes?.querySelector("[data-size]")?.focus();
        return;
      }
      addProductToCart(p, size);
    }
    const wish = e.target.closest(".product__wish");
    if (wish && !wish.dataset.bound) {
      e.preventDefault();
      const p = products.find((item) => String(item.id) === String(wish.dataset.wishId || wish.closest("[data-id]")?.dataset.id));
      if (!p) return;
      const payload = {
        id: p.id,
        slug: p.slug,
        name: window.MilanaName ? MilanaName(p) : p.name,
        image: p.images?.[0] || "",
        price: p.price,
        price_visible: p.price_visible,
      };
      const currently = Boolean(window.MilanaState?.wishlist?.has?.(p.id));
      if (window.MilanaAuth?.customer) {
        const response = await fetch("/api/products/" + encodeURIComponent(p.id) + "/like", {
          method: currently ? "DELETE" : "POST",
        }).catch(() => null);
        if (!response?.ok) return;
      }
      currently
        ? window.MilanaState?.wishlist?.remove?.(p.id)
        : window.MilanaState?.wishlist?.add?.(payload);
      const active = !currently;
      wish.classList.toggle("is-active", active);
      wish.setAttribute("aria-pressed", String(active));
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".product__sizes [data-size][role=button]")) {
      e.preventDefault();
      e.target.click();
    }
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
      if (fab) {
        const fabric = window.MilanaFabricText
          ? MilanaFabricText(p, I18N.lang)
          : (window.MilanaFab || ((x) => x))((p.fabric && (p.fabric[I18N.lang] || p.fabric.en)) || "");
        fab.textContent = fabric;
        fab.hidden = !fabric;
      }
      const price = card.querySelector(".product__price");
      if (price) {
        price.classList.toggle("product__price--pending", p.price_visible === false);
        price.innerHTML = p.price_visible === false ? I18N.t("price.manager") : I18N.fmtPrice(p.price) + (p.old_price ? ` <s>${I18N.fmtPrice(p.old_price)}</s>` : "");
      }
    });
  }

  I18N.ready.then(() => { applyHero(); renderBestsellers(); });
  window.addEventListener("i18n:change", refreshLangBits);
  window.addEventListener("milana:auth", () => { renderBestsellers(); });
})();
