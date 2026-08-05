/* ============================================================
   MILANA — shop catalog page
   Fetches the whole active catalog once, filters client-side.
   ============================================================ */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isVideo = (u) => /\.(mp4|webm)(\?|$)/i.test(u || "");
  const mediaTag = (url, alt, eager = false) => isVideo(url)
    ? `<video src="${esc(url)}" muted loop playsinline autoplay preload="metadata" aria-label="${esc(alt)}"></video>`
    : `<img src="${esc((window.MilanaThumb || ((x) => x))(url))}" data-full="${esc(url)}" alt="${esc(alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async" fetchpriority="${eager ? "high" : "auto"}" onerror="if(this.dataset.full&&this.src.indexOf('/uploads/thumbs/')>-1){this.src=this.dataset.full}else{this.classList.add('is-broken');this.removeAttribute('src')}">`;
  const apiItems = (payload) => Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.items) ? payload.items : []);
  const PRODUCT_TYPES = [
    "tunic", "sarochka", "robe", "pajamas", "set", "tracksuit", "hoodie",
    "dress", "shirt", "polo", "trousers", "tshirt", "capri", "shorts", "top",
  ];
  const PANELS = ["pajamas", "robes", "men", "tunics", "trousers", "nightgowns", "sets", "clothing_sets", "tshirts", "kids"];
  const PANEL_COVER_ASSETS = Object.fromEntries(
    PANELS.map((panel) => [panel, `/assets/catalog-circles/${panel === "clothing_sets" ? "sets" : panel}.webp`])
  );
  const GENDERS = ["women", "men", "kids", "unisex"];
  const TAGS = ["bestseller", "new", "sale"];
  const CURATIONS = ["new", "bestseller", "sale"]; // «Подборка»: показываем всегда, в этом порядке
  const COLLECTIONS = ["ss26"];                     // сезонные коллекции (ss26 = Весна–Лето 26)
  const isHeight = (s) => Number(s) >= 80;          // детский рост (98–164 см) vs размер (44–66)
  const SMART_SYNONYMS = {
    ayol: "women", ayollar: "women", women: "women", woman: "women", female: "women", jenskiy: "women", zhenskij: "women",
    erkak: "men", erkaklar: "men", men: "men", man: "men", male: "men", mujskoy: "men", muzhskoy: "men",
    bola: "kids", bolalar: "kids", kids: "kids", children: "kids", child: "kids", detskiy: "kids",
    pijama: "pajamas", pajama: "pajamas", pajamas: "pajamas",
    halat: "robes", xalat: "robes", robe: "robes", robes: "robes",
    uy: "homewear", home: "homewear", homewear: "homewear",
    lounge: "loungewear", loungewear: "loungewear", komplekt: "loungewear", set: "loungewear",
    paxta: "cotton", cotton: "cotton", suprem: "suprem",
  };

  let all = [];          // full catalog (detail rows)
  const state = {
    panel: "", genders: new Set(), categories: new Set(), types: new Set(), q: "", sort: "default", stock: "all",
    sizes: new Set(), tags: new Set(), collections: new Set(), min: null, max: null,
    pStart: 1, pEnd: 1,
  };
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

  /* ---------- пагинация: не более 10 рядов товаров ---------- */
  const PAGER_ROWS = 10;
  const pageSize = () => (window.innerWidth < 700 ? 2 : window.innerWidth < 1080 ? 3 : 4) * PAGER_ROWS;
  let lastSig = "";
  const filterSig = () => [state.panel, [...state.genders].sort().join(","), [...state.categories].sort().join(","), [...state.types].sort().join(","), state.q, state.sort, state.stock,
    [...state.sizes].join(","), [...state.tags].sort().join(","), [...state.collections].sort().join(","), state.min, state.max].join("|");
  function renderPager(total, ps) {
    const wrap = $("#shop-pager");
    if (!wrap) return;
    const pages = Math.max(1, Math.ceil(total / ps));
    wrap.hidden = pages <= 1;
    wrap.style.display = pages <= 1 ? "none" : "";
    if (pages <= 1) return;
    $("#shop-more").hidden = state.pEnd >= pages;
    const cur = state.pEnd;
    const nums = [...new Set([1, 2, 3, 4, 5, cur - 1, cur, cur + 1, pages]
      .filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
    let html = "", prev = 0;
    nums.forEach((n) => {
      if (n - prev > 1) html += `<span class="shop-pager__dots">…</span>`;
      html += `<button type="button" data-page="${n}" class="${n === cur ? "is-on" : ""}">${n}</button>`;
      prev = n;
    });
    if (cur < pages) html += `<button type="button" data-page="${cur + 1}" class="shop-pager__next" aria-label="→"><svg class="ic"><use href="#i-arrow"/></svg></button>`;
    $("#shop-pages").innerHTML = html;
  }

  /* ---------- read state from URL ---------- */
  const sp = new URLSearchParams(location.search);
  const legacyCategoryValues = (sp.get("category") || "").split(",").map((c) => c.trim()).filter(Boolean);
  const requestedCategories = legacyCategoryValues.filter((value) => !value.startsWith("type:"));
  const requestedTypes = [
    ...(sp.get("product_type") || "").split(",").map((value) => value.trim()).filter(Boolean),
    ...legacyCategoryValues.filter((value) => value.startsWith("type:")).map((value) => value.slice(5)),
  ];
  if (sp.get("panel")) state.panel = sp.get("panel");
  (sp.get("gender") || "").split(",").map((g) => g.trim()).filter(Boolean).forEach((g) => state.genders.add(g));
  if (sp.get("wish") === "1") state.wish = true;
  if (sp.get("q")) state.q = sp.get("q");
  if (["new", "price-asc", "price-desc", "popular"].includes(sp.get("sort"))) state.sort = sp.get("sort");
  if (["in", "pre"].includes(sp.get("stock"))) state.stock = sp.get("stock");
  (sp.get("tag") || "").split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => state.tags.add(t));
  (sp.get("collection") || "").split(",").map((c) => c.trim()).filter(Boolean).forEach((c) => state.collections.add(c));

  function pushUrl() {
    const p = new URLSearchParams();
    if (state.panel) p.set("panel", state.panel);
    if (state.genders.size) p.set("gender", [...state.genders].join(","));
    if (state.categories.size) p.set("category", [...state.categories].join(","));
    if (state.types.size) p.set("product_type", [...state.types].join(","));
    if (state.q) p.set("q", state.q);
    if (state.sort !== "default") p.set("sort", state.sort);
    if (state.stock !== "all") p.set("stock", state.stock);
    if (state.tags.size) p.set("tag", [...state.tags].join(","));
    if (state.collections.size) p.set("collection", [...state.collections].join(","));
    if (state.wish) p.set("wish", "1");   /* режим «Избранное» переживает обновление страницы */
    history.replaceState(null, "", "/shop" + (p.toString() ? "?" + p : ""));
  }

  /* ---------- filtering ---------- */
  function smartNormalize(value) {
    return String(value || "").toLowerCase().replace(/['’`ʻ]/g, "").replace(/ё/g, "е").replace(/[^a-z0-9а-я.$]+/g, " ").trim();
  }

  function smartTokens(query) {
    const seen = new Set();
    return smartNormalize(query).split(/\s+/).filter((t) => t.length > 1)
      .flatMap((t) => [t, SMART_SYNONYMS[t]].filter(Boolean))
      .filter((t) => {
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      });
  }

  function productText(p, lang) {
    return smartNormalize([
      p.name, p.name_i18n && Object.values(p.name_i18n).join(" "), p.slug, p.model_no, p.variant, p.gender, p.category, p.tag,
      (p.sizes || []).join(" "), p.desc?.[lang], p.desc?.en, p.fabric?.[lang], p.fabric?.en,
    ].filter(Boolean).join(" "));
  }

  function smartScore(p, query, lang) {
    const tokens = smartTokens(query);
    if (!tokens.length) return 0;
    const text = productText(p, lang);
    const model = smartNormalize([p.model_no, p.variant, p.name].filter(Boolean).join(" "));
    return tokens.reduce((sum, token) => {
      if (!text.includes(token)) return sum;
      let score = sum + 8;
      if (model.includes(token)) score += 18;
      if (p.gender === token || p.category === token || p.product_type === token) score += 12;
      if ((p.sizes || []).some((s) => smartNormalize(s) === token)) score += 10;
      return score;
    }, 0);
  }

  function filtered() {
    const lang = I18N.lang;
    /* режим «Избранное»: только отмеченные товары, прочие фильтры не применяются */
    if (state.wish) {
      const ids = new Set((window.MilanaState?.wishlist?.all?.() || []).map((w) => Number(w.id)));
      return all.filter((p) => ids.has(Number(p.id)));
    }
    const qOn = !!state.q; /* поиск — по всем товарам, фильтры не сужают выдачу */
    const stockOk = (p) => state.stock === "all"
      || (state.stock === "in" ? canOrder(p) : availabilityStatus(p) === "preorder");
    let list = all.map((p) => ({ p, score: qOn ? smartScore(p, state.q, lang) : 0 })).filter(({ p, score }) => {
      if (!stockOk(p)) return false;   /* наличие действует поверх остальных фильтров и поиска */
      if (qOn) return score > 0 && (!state.panel || p.catalog_panel === state.panel);
      if (state.panel && p.catalog_panel !== state.panel) return false;
      if (state.genders.size && !state.genders.has(p.gender)) return false;
      if (state.categories.size && !state.categories.has(p.category)) return false;
      if (state.types.size && !state.types.has(p.product_type)) return false;
      if (state.tags.size && !state.tags.has(p.tag)) return false;
      if (state.collections.size && !state.collections.has(p.collection)) return false;
      if (state.sizes.size && !p.sizes.some((s) => state.sizes.has(s))) return false;
      if (state.min !== null && p.price < state.min) return false;
      if (state.max !== null && p.price > state.max) return false;
      return true;
    });
    const sorts = {
      "new": (a, b) => b.p.id - a.p.id,
      "price-asc": (a, b) => a.p.price - b.p.price,
      "price-desc": (a, b) => b.p.price - a.p.price,
      "popular": (a, b) => b.p.reviews - a.p.reviews || b.p.rating - a.p.rating,
      "default": (a, b) => b.score - a.score || b.p.sort - a.p.sort || b.p.id - a.p.id,
    };
    return list.sort(sorts[state.sort] || sorts.default).map((row) => row.p);
  }

  /* ---------- render ---------- */
  function tagChip(p) {
    if (p.tag === "bestseller") return `<span class="product__tag">${I18N.t("best.tagBest")}</span>`;
    if (p.tag === "new") return `<span class="product__tag product__tag--new">${I18N.t("best.tagNew")}</span>`;
    if (p.price_visible !== false && p.tag === "sale" && p.old_price) return `<span class="product__tag product__tag--sale">−${Math.round((1 - p.price / p.old_price) * 100)}%</span>`;
    if (p.tag === "sale") return `<span class="product__tag product__tag--sale">${I18N.t("shop.tagSale")}</span>`;
    return "";
  }

  function priceHtml(p) {
    if (p.price_visible === false) return `<p class="product__price product__price--pending">${I18N.t("price.manager")}</p>`;
    return `<p class="product__price">${I18N.fmtPrice(p.price)} ${p.old_price ? `<s>${I18N.fmtPrice(p.old_price)}</s>` : ""}</p>`;
  }

  /* пятизвёздочный рейтинг; показываем, когда задана оценка — отзывы не обязательны */
  function ratingHtml(p) {
    const r = Number(p.rating) || 0;
    if (!(r > 0)) return "";
    const pct = Math.max(0, Math.min(100, (r / 5) * 100)).toFixed(1);
    const n = Number(p.reviews) || 0;
    return `<p class="product__rating" title="${r.toFixed(1)} / 5">`
      + `<span class="stars" style="--r:${pct}%" aria-hidden="true"><i>★★★★★</i><b>★★★★★</b></span>`
      + `<em>${r.toFixed(1)}</em>${n > 0 ? ` <span>(${n})</span>` : ""}</p>`;
  }

  function card(p, i) {
    const fabric = window.MilanaFabricText
      ? MilanaFabricText(p, I18N.lang)
      : (window.MilanaFab || ((x) => x))((p.fabric && (p.fabric[I18N.lang] || p.fabric.en)) || "");
    const nm = window.MilanaName ? MilanaName(p) : p.name;
    const wished = window.MilanaState?.wishlist?.has?.(p.id);
    const orderable = canOrder(p);
    const unavailableLabel = availabilityStatus(p) === "preorder" ? I18N.t("shop.stockPre") : I18N.t("prod.unavailable");
    return `
    <article class="product" data-id="${p.id}" style="animation-delay:${Math.min(i * 45, 400)}ms">
      <div class="product__media" data-imgs="${esc((p.images || []).slice(0, 6).join('|'))}">
        <button class="product__wish${wished ? " is-active" : ""}" data-wish-id="${p.id}" data-wish-slug="${esc(p.slug)}" data-wish-name="${esc(nm)}" data-wish-image="${esc(p.images[0] || "")}" data-wish-price="${p.price}" data-wish-price-visible="${p.price_visible !== false}" aria-label="Wishlist" aria-pressed="${wished ? "true" : "false"}"><svg class="ic"><use href="#i-heart"/></svg></button>
        <a class="product__go" href="/p/${p.slug}"><figure>${mediaTag(p.images[0] || "", nm, i < 9)}</figure></a>
        <div class="product__quick">
          <div class="product__sizes">${p.sizes.map((s) => `<span data-size="${esc(s)}" role="${retailMode() ? "button" : "presentation"}"${retailMode() ? ' tabindex="0"' : ""}>${esc(s)}</span>`).join("")}</div>
          ${!orderable
            ? `<a class="product__add product__add--pre" href="/p/${p.slug}"><span>${esc(unavailableLabel)}</span></a>`
            : `<button class="product__add" data-add="${p.id}"><svg class="ic"><use href="#i-cart"/></svg><span>${I18N.t("best.add")}</span></button>`}
        </div>
      </div>
      <div class="product__info">
        <div class="product__row"><h3><a href="/p/${p.slug}">${esc(nm)}</a></h3>
          ${priceHtml(p)}${tagChip(p)}${!orderable ? `<span class="product__pre">${esc(unavailableLabel)}</span>` : ""}</div>
        <p class="product__fab"${fabric ? "" : " hidden"}>${esc(fabric)}</p>
        ${ratingHtml(p)}
      </div>
    </article>`;
  }

  /* полоса режима «Избранное» с явным выходом */
  function renderWishBar() {
    const grid = document.querySelector(".product-grid");
    if (!grid) return;
    let bar = document.querySelector(".shop-wishbar");
    if (!state.wish) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "shop-wishbar";
      grid.parentNode.insertBefore(bar, grid);
    }
    const n = (window.MilanaState?.wishlist?.all?.() || []).length;
    bar.innerHTML = `<span><svg class="ic"><use href="#i-heart"/></svg>${esc(I18N.t("shop.wishTitle"))} · ${n}</span>`
      + `<button type="button" data-wish-exit>${esc(I18N.t("shop.wishExit"))}</button>`;
  }

  function renderStockBar() {
    const box = $("#shop-stock");
    if (!box) return;
    const n = { all: all.length, in: all.filter(canOrder).length, pre: all.filter((p) => availabilityStatus(p) === "preorder").length };
    box.querySelectorAll("[data-stock]").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.stock === state.stock);
      const badge = b.querySelector("i");
      if (badge) badge.textContent = n[b.dataset.stock] ?? "";
    });
    box.hidden = !n.pre;   /* пока товаров под заказ нет, переключатель не нужен */
  }

  function render() {
    renderWishBar();
    renderStockBar();
    const list = filtered();
    const sig = filterSig();
    if (sig !== lastSig) { lastSig = sig; state.pStart = 1; state.pEnd = 1; }
    const ps = pageSize();
    const pages = Math.max(1, Math.ceil(list.length / ps));
    if (state.pEnd > pages) state.pEnd = pages;
    if (state.pStart > state.pEnd) state.pStart = state.pEnd;
    const view = list.slice((state.pStart - 1) * ps, state.pEnd * ps);
    $("#found-n").textContent = list.length;
    $("#shop-grid").innerHTML = view.map(card).join("");
    renderPager(list.length, ps);
    $("#shop-grid").classList.remove("is-loading");
    $("#shop-empty").classList.toggle("is-on", !list.length);
    window.MilanaState?.wishlist?.sync?.();
    window.MilanaState?.wireImages?.($("#shop-grid"));
    pushUrl();
  }

  function renderSkeleton() {
    $("#shop-grid").classList.add("is-loading");
    $("#shop-grid").innerHTML = Array.from({ length: 8 }, (_, i) => `
      <article class="product product--skeleton" style="animation-delay:${i * 35}ms">
        <div class="product__media"><figure></figure></div>
        <div class="product__info"><i></i><i></i><i></i></div>
      </article>`).join("");
  }

  function renderUnavailable() {
    $("#shop-grid").classList.remove("is-loading");
    $("#shop-grid").innerHTML = "";
    $("#shop-empty").classList.add("is-on");
    $("#shop-empty").querySelector("p").textContent = navigator.onLine ? I18N.t("shop.loadError") : I18N.t("shop.offline");
  }

  function addProductToCart(p, size = "") {
    return Cart.add({
      id: p.id, slug: p.slug, name: window.MilanaName ? MilanaName(p) : p.name,
      name_i18n: p.name_i18n, product_type: p.product_type, catalog_panel: p.catalog_panel,
      category: p.category, image: p.images[0] || "", price: p.price,
      retail_price: p.retail_price || p.price, price_visible: p.price_visible,
      price_label: p.price_label, sizes: p.sizes, size,
      pack_pieces: p.order_units?.find((orderUnit) => orderUnit.unit_type === "pachka")?.pieces,
      retail_enabled: p.retail_enabled, retail_stock: p.retail_stock,
      available_qop: p.available_qop, in_stock: p.in_stock,
      can_order_wholesale: p.can_order_wholesale, can_order_retail: p.can_order_retail,
      availability_wholesale: p.availability_wholesale, availability_retail: p.availability_retail,
    });
  }

  /* ---------- filters UI ---------- */
  function buildFilters() {
    // gender — мультивыбор; «Все» = ничего не выбрано
    const genders = [...new Set([...GENDERS, ...all.map((product) => product.gender).filter(Boolean)])];
    const gc = {};
    genders.forEach((g) => (gc[g] = all.filter((p) => p.gender === g).length));
    $("#f-gender").innerHTML =
      `<button data-gender="" class="f-all${!state.genders.size ? " is-on" : ""}"><span>${I18N.t("shop.all")}</span><i>${all.length}</i></button>` +
      genders.filter((g) => gc[g]).map((g) =>
        `<button data-gender="${g}" class="${state.genders.has(g) ? "is-on" : ""}"><span>${I18N.catName(g)}</span><i>${gc[g]}</i></button>`
      ).join("");

    // clothing type — мультивыбор
    const types = [...new Set([
      ...PRODUCT_TYPES.filter((type) => all.some((p) => p.product_type === type)),
      ...all.map((p) => p.product_type).filter(Boolean),
    ])];
    const counts = {};
    types.forEach((type) => (counts[type] = all.filter((p) => p.product_type === type).length));
    $("#f-cats").innerHTML =
      `<button data-cat="" class="f-all${!state.types.size ? " is-on" : ""}"><span>${I18N.t("shop.all")}</span><i>${all.length}</i></button>` +
      types.filter((type) => counts[type]).map((type) =>
        `<button data-cat="${esc(type)}" class="${state.types.has(type) ? "is-on" : ""}"><span>${esc(I18N.productName({ product_type: type }))}</span><i>${counts[type]}</i></button>`
      ).join("");

    // размеры: взрослые (44–66) отдельно от детского роста (98–164 см)
    const sizeVals = [...new Set(all.flatMap((p) => p.sizes))];
    const numOrder = (a, b) => (Number(a) || 0) - (Number(b) || 0);
    const adult = sizeVals.filter((s) => !isHeight(s)).sort(numOrder);
    const heights = sizeVals.filter((s) => isHeight(s)).sort(numOrder);
    const chip = (s) => `<button data-fsize="${esc(s)}" class="${state.sizes.has(s) ? "is-on" : ""}">${esc(s)}</button>`;
    $("#f-sizes").innerHTML = adult.map(chip).join("");
    const hbox = $("#f-heights");
    if (hbox) hbox.innerHTML = heights.map(chip).join("");
    const hgroup = $("#f-heights-group");
    if (hgroup) hgroup.hidden = !heights.length;

    // подборка: теги (новинка / хит продаж / скидка) + сезонные коллекции, мультивыбор
    const tagLabel = { new: I18N.t("best.tagNew"), bestseller: I18N.t("best.tagBest"), sale: I18N.t("shop.tagSale") };
    const collLabel = { ss26: I18N.t("shop.collSS26") };
    const curations = [...new Set([...CURATIONS, ...all.map((product) => product.tag).filter(Boolean)])];
    const collections = [...new Set([...COLLECTIONS, ...all.map((product) => product.collection).filter(Boolean)])];
    $("#f-tags").innerHTML =
      curations.map((tg) => `<button data-ftag="${esc(tg)}" class="${state.tags.has(tg) ? "is-on" : ""}">${esc(tagLabel[tg] || I18N.catName(tg))}</button>`).join("") +
      collections.map((cl) => `<button data-fcoll="${esc(cl)}" class="coll ${state.collections.has(cl) ? "is-on" : ""}">${esc(collLabel[cl] || I18N.catName(cl))}</button>`).join("");
  }

  function renderCatalogPanels() {
    const root = $("#catalog-panel-grid");
    if (!root) return;
    const panels = [...new Set([...PANELS, ...all.map((product) => product.catalog_panel).filter(Boolean)])];
    const visiblePanels = panels.filter((panel) =>
      (PANELS.includes(panel) && panel !== "clothing_sets") || all.some((product) => product.catalog_panel === panel)
    );
    root.innerHTML = visiblePanels.map((panel) => {
      const count = all.filter((product) => product.catalog_panel === panel).length;
      const cover = PANEL_COVER_ASSETS[panel]
        || all.find((product) => product.catalog_panel === panel && product.images?.[0])?.images?.[0]
        || PANEL_COVER_ASSETS.sets;
      return `
        <button type="button" class="catalog-panel-card${state.panel === panel ? " is-on" : ""}" data-panel-card="${panel}"
          aria-label="${esc(I18N.panelName(panel))}, ${count} ${esc(I18N.t("cats.styles"))}"
          aria-pressed="${state.panel === panel ? "true" : "false"}" ${count ? "" : "disabled"}>
          <span class="catalog-panel-card__media"><img src="${esc((window.MilanaThumb || ((x) => x))(cover))}" alt="" loading="eager" decoding="async"></span>
          <span class="catalog-panel-card__meta"><b>${I18N.panelName(panel)}</b></span>
        </button>`;
    }).join("");
    $("#catalog-panel-clear").hidden = !state.panel;
  }

  /* ---------- events ---------- */
  document.addEventListener("click", async (e) => {
    /* выход из «Избранного» при любом действии с фильтрами */
    if (state.wish && e.target.closest("[data-panel-card],[data-gender],[data-cat],[data-fsize],[data-ftag],[data-fcoll],[data-fheight],#catalog-panel-clear")) {
      state.wish = false;
    }
    const wishExit = e.target.closest("[data-wish-exit]");
    if (wishExit) { state.wish = false; buildFilters(); renderCatalogPanels(); render(); return; }
    const panelCard = e.target.closest("[data-panel-card]");
    if (panelCard) {
      state.panel = state.panel === panelCard.dataset.panelCard ? "" : panelCard.dataset.panelCard;
      renderCatalogPanels();
      render();
      document.querySelector(".shop-bar")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const gen = e.target.closest("[data-gender]");
    if (gen) {
      const g = gen.dataset.gender;
      if (!g) state.genders.clear();
      else state.genders.has(g) ? state.genders.delete(g) : state.genders.add(g);
      buildFilters(); renderCatalogPanels(); render(); return;
    }
    const cat = e.target.closest("[data-cat]");
    if (cat) {
      const c = cat.dataset.cat;
      if (!c) state.types.clear();
      else state.types.has(c) ? state.types.delete(c) : state.types.add(c);
      buildFilters(); render(); return;
    }
    const fs = e.target.closest("[data-fsize]");
    if (fs) {
      const s = fs.dataset.fsize;
      state.sizes.has(s) ? state.sizes.delete(s) : state.sizes.add(s);
      fs.classList.toggle("is-on"); render(); return;
    }
    const ft = e.target.closest("[data-ftag]");
    if (ft) {
      const tg = ft.dataset.ftag;
      state.tags.has(tg) ? state.tags.delete(tg) : state.tags.add(tg);
      ft.classList.toggle("is-on"); render(); return;
    }
    const fc = e.target.closest("[data-fcoll]");
    if (fc) {
      const cl = fc.dataset.fcoll;
      state.collections.has(cl) ? state.collections.delete(cl) : state.collections.add(cl);
      fc.classList.toggle("is-on"); render(); return;
    }
    if (e.target.closest("#f-reset") || e.target.closest("#f-reset2")) {
      Object.assign(state, { panel: "", q: "", sort: "default", min: null, max: null });
      state.genders.clear(); state.categories.clear(); state.types.clear(); state.sizes.clear(); state.tags.clear(); state.collections.clear();
      $("#shop-q").value = ""; $("#shop-sort").value = "default"; $("#f-min").value = ""; $("#f-max").value = "";
      buildFilters(); renderCatalogPanels(); render(); return;
    }
    /* size pick + add to cart on cards */
    const quickSize = e.target.closest(".product__sizes [data-size]");
    if (quickSize && retailMode()) {
      e.preventDefault();
      quickSize.closest(".product__sizes")?.querySelectorAll("[data-size]").forEach((chip) => {
        chip.classList.toggle("is-on", chip === quickSize);
      });
      const product = all.find((item) => String(item.id) === String(quickSize.closest(".product")?.dataset.id));
      if (product) addProductToCart(product, quickSize.dataset.size);
      return;
    }
    const addBtn = e.target.closest("[data-add]");
    if (addBtn) {
      e.preventDefault();
      const p = all.find((x) => x.id === Number(addBtn.dataset.add));
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
    if (wish) {
      e.preventDefault();
      const payload = {
        id: wish.dataset.wishId,
        slug: wish.dataset.wishSlug,
        name: wish.dataset.wishName,
        image: wish.dataset.wishImage,
        price: wish.dataset.wishPrice,
        price_visible: wish.dataset.wishPriceVisible !== "false",
      };
      let active;
      if (window.MilanaAuth?.customer) {
        const currently = wish.classList.contains("is-active");
        const r = await fetch("/api/products/" + encodeURIComponent(payload.id) + "/like", { method: currently ? "DELETE" : "POST" });
        if (r.ok) {
          active = !currently;
          active ? window.MilanaState?.wishlist?.add?.(payload) : window.MilanaState?.wishlist?.remove?.(payload.id);
        }
        else active = window.MilanaState?.wishlist?.toggle?.(payload);
      } else {
        active = window.MilanaState?.wishlist?.toggle?.(payload);
      }
      wish.classList.toggle("is-active", Boolean(active));
      wish.setAttribute("aria-pressed", String(Boolean(active)));
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".product__sizes [data-size][role=button]")) {
      e.preventDefault();
      e.target.click();
    }
  });

  let qTimer;
  $("#shop-q").addEventListener("input", (e) => {
      state.wish = false;

    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 250);
  });
  $("#shop-stock")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-stock]");
    if (!b) return;
    state.wish = false;
    state.stock = b.dataset.stock;
    render();
  });

  $("#shop-sort").addEventListener("change", (e) => { state.wish = false; state.sort = e.target.value; render(); });
  $("#f-min").addEventListener("change", (e) => { state.wish = false; state.min = e.target.value === "" ? null : Number(e.target.value); render(); });
  $("#f-max").addEventListener("change", (e) => { state.wish = false; state.max = e.target.value === "" ? null : Number(e.target.value); render(); });
  $("#catalog-panel-clear")?.addEventListener("click", () => {
    state.panel = "";
    renderCatalogPanels();
    render();
  });

  /* пагинация: «Показать ещё» + номера страниц */
  $("#shop-more")?.addEventListener("click", () => { state.pEnd += 1; render(); });
  $("#shop-pages")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-page]");
    if (!b) return;
    state.pStart = state.pEnd = Number(b.dataset.page) || 1;
    render();
    const grid = $("#shop-grid");
    const top = grid.getBoundingClientRect().top + window.scrollY - 180;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  });

  /* mobile filters drawer */
  $("#filters-toggle").addEventListener("click", () => $("#filters").classList.add("is-open"));
  $("#filters-close").addEventListener("click", () => $("#filters").classList.remove("is-open"));

  /* burger menu (same behavior as landing) */
  const burger = $(".burger"), menu = $("#menu");
  burger.addEventListener("click", () => {
    const open = menu.classList.toggle("is-open");
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
  });

  $("#year") && ($("#year").textContent = new Date().getFullYear());

  /* ---------- boot ---------- */
  let catalogRefresh = null;
  async function loadCatalog() {
    if (catalogRefresh) return catalogRefresh;
    catalogRefresh = fetch("/api/products?limit=1000&meta=1", { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error("catalog_unavailable");
        return response.json();
      })
      .then((payload) => {
        all = apiItems(payload);
        window.MilanaState?.wishlist?.refresh?.(all);
        buildFilters();
        renderCatalogPanels();
        render();
        return all;
      })
      .finally(() => { catalogRefresh = null; });
    return catalogRefresh;
  }

  async function boot() {
    await I18N.ready;
    document.title = I18N.t("shop.title") + " — MILANA PREMIUM";
    $("#shop-q").value = state.q;
    $("#shop-sort").value = state.sort;
    renderSkeleton();
    try {
      await loadCatalog();
    } catch { all = []; renderUnavailable(); return; }
    const availableCategories = new Set(all.map((product) => product.category).filter(Boolean));
    const availableTypes = new Set(all.map((product) => product.product_type).filter(Boolean));
    requestedCategories.filter((category) => availableCategories.has(category)).forEach((category) => state.categories.add(category));
    requestedTypes.filter((type) => availableTypes.has(type)).forEach((type) => state.types.add(type));
    buildFilters();
    renderCatalogPanels();
    render();
  }
  boot();

  window.addEventListener("i18n:change", () => {
    document.title = I18N.t("shop.title") + " — MILANA PREMIUM";
    buildFilters(); renderCatalogPanels(); render();
  });
  window.addEventListener("milana:auth", () => {
    loadCatalog().catch(() => {});
  });
})();
