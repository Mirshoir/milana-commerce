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
    : `<img src="${esc(url)}" alt="${esc(alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async" fetchpriority="${eager ? "high" : "auto"}">`;
  const CATS = ["pajamas", "robes", "homewear", "loungewear"]; // clothing type
  const GENDERS = ["women", "men", "kids", "unisex"];
  const TAGS = ["bestseller", "new", "sale"];

  let all = [];          // full catalog (detail rows)
  const state = {
    gender: "", category: "", q: "", sort: "default",
    sizes: new Set(), tags: new Set(), min: null, max: null,
  };

  /* ---------- read state from URL ---------- */
  const sp = new URLSearchParams(location.search);
  if (GENDERS.includes(sp.get("gender"))) state.gender = sp.get("gender");
  if (CATS.includes(sp.get("category"))) state.category = sp.get("category");
  if (sp.get("q")) state.q = sp.get("q");
  if (["new", "price-asc", "price-desc", "popular"].includes(sp.get("sort"))) state.sort = sp.get("sort");
  if (TAGS.includes(sp.get("tag"))) state.tags.add(sp.get("tag"));

  function pushUrl() {
    const p = new URLSearchParams();
    if (state.gender) p.set("gender", state.gender);
    if (state.category) p.set("category", state.category);
    if (state.q) p.set("q", state.q);
    if (state.sort !== "default") p.set("sort", state.sort);
    if (state.tags.size === 1) p.set("tag", [...state.tags][0]);
    history.replaceState(null, "", "/shop" + (p.toString() ? "?" + p : ""));
  }

  /* ---------- filtering ---------- */
  function filtered() {
    const lang = I18N.lang;
    let list = all.filter((p) => {
      if (state.gender && p.gender !== state.gender) return false;
      if (state.category && p.category !== state.category) return false;
      if (state.tags.size && !state.tags.has(p.tag)) return false;
      if (state.sizes.size && !p.sizes.some((s) => state.sizes.has(s))) return false;
      if (state.min !== null && p.price < state.min) return false;
      if (state.max !== null && p.price > state.max) return false;
      if (state.q) {
        const hay = (p.name + " " + (p.model_no || "") + " " + (p.variant || "") + " " + (p.desc?.[lang] || "") + " " + (p.desc?.en || "") + " " + (p.fabric?.[lang] || "")).toLowerCase();
        if (!hay.includes(state.q.toLowerCase())) return false;
      }
      return true;
    });
    const sorts = {
      "new": (a, b) => b.id - a.id,
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      "popular": (a, b) => b.reviews - a.reviews || b.rating - a.rating,
      "default": (a, b) => b.sort - a.sort || b.id - a.id,
    };
    return list.sort(sorts[state.sort] || sorts.default);
  }

  /* ---------- render ---------- */
  function tagChip(p) {
    if (p.tag === "bestseller") return `<span class="product__tag">${I18N.t("best.tagBest")}</span>`;
    if (p.tag === "new") return `<span class="product__tag product__tag--new">${I18N.t("best.tagNew")}</span>`;
    if (p.tag === "sale" && p.old_price) return `<span class="product__tag product__tag--sale">−${Math.round((1 - p.price / p.old_price) * 100)}%</span>`;
    return "";
  }

  function card(p, i) {
    const fabric = (p.fabric && (p.fabric[I18N.lang] || p.fabric.en)) || "";
    const wished = window.MilanaState?.wishlist?.has?.(p.id);
    return `
    <article class="product" data-id="${p.id}" style="animation-delay:${Math.min(i * 45, 400)}ms">
      <div class="product__media">
        ${tagChip(p)}
        <button class="product__wish${wished ? " is-active" : ""}" data-wish-id="${p.id}" data-wish-slug="${esc(p.slug)}" data-wish-name="${esc(p.name)}" data-wish-image="${esc(p.images[0] || "")}" data-wish-price="${p.price}" aria-label="Wishlist" aria-pressed="${wished ? "true" : "false"}"><svg class="ic"><use href="#i-heart"/></svg></button>
        <a class="product__go" href="/p/${p.slug}"><figure>${mediaTag(p.images[0] || "", p.name, i < 9)}</figure></a>
        <div class="product__quick">
          <div class="product__sizes">${p.sizes.map((s) => `<span data-size="${esc(s)}">${esc(s)}</span>`).join("")}</div>
          <button class="product__add" data-add="${p.id}"><svg class="ic"><use href="#i-cart"/></svg><span>${I18N.t("best.add")}</span></button>
        </div>
      </div>
      <div class="product__info">
        <div class="product__row"><h3><a href="/p/${p.slug}">${esc(p.name)}</a></h3>
          <p class="product__price">${I18N.fmtPrice(p.price)} ${p.old_price ? `<s>${I18N.fmtPrice(p.old_price)}</s>` : ""}</p></div>
        <p class="product__fab">${esc(fabric)}</p>
        <p class="product__rating"><svg class="ic"><use href="#i-star"/></svg>${p.rating} <span>(${p.reviews} ${I18N.t("best.reviews")})</span></p>
      </div>
    </article>`;
  }

  function render() {
    const list = filtered();
    $("#found-n").textContent = list.length;
    $("#shop-grid").innerHTML = list.map(card).join("");
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

  /* ---------- filters UI ---------- */
  function buildFilters() {
    // gender
    const gc = {};
    GENDERS.forEach((g) => (gc[g] = all.filter((p) => p.gender === g).length));
    $("#f-gender").innerHTML =
      `<button data-gender="" class="${!state.gender ? "is-on" : ""}"><span>${I18N.t("shop.all")}</span><i>${all.length}</i></button>` +
      GENDERS.filter((g) => gc[g]).map((g) =>
        `<button data-gender="${g}" class="${state.gender === g ? "is-on" : ""}"><span>${I18N.catName(g)}</span><i>${gc[g]}</i></button>`
      ).join("");

    // clothing type
    const counts = {};
    CATS.forEach((c) => (counts[c] = all.filter((p) => p.category === c).length));
    $("#f-cats").innerHTML =
      `<button data-cat="" class="${!state.category ? "is-on" : ""}"><span>${I18N.t("shop.all")}</span><i>${all.length}</i></button>` +
      CATS.filter((c) => counts[c]).map((c) =>
        `<button data-cat="${c}" class="${state.category === c ? "is-on" : ""}"><span>${I18N.catName(c)}</span><i>${counts[c]}</i></button>`
      ).join("");

    const sizes = [...new Set(all.flatMap((p) => p.sizes))];
    const order = ["2Y", "4Y", "6Y", "8Y", "10Y", "XS", "S", "M", "L", "XL", "XXL"];
    sizes.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    $("#f-sizes").innerHTML = sizes.map((s) =>
      `<button data-fsize="${esc(s)}" class="${state.sizes.has(s) ? "is-on" : ""}">${esc(s)}</button>`).join("");

    const tagLabel = { bestseller: I18N.t("best.tagBest"), new: I18N.t("best.tagNew"), sale: I18N.t("shop.tagSale") };
    $("#f-tags").innerHTML = TAGS.filter((tg) => all.some((p) => p.tag === tg)).map((tg) =>
      `<button data-ftag="${tg}" class="${state.tags.has(tg) ? "is-on" : ""}">${tagLabel[tg]}</button>`).join("");
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const gen = e.target.closest("[data-gender]");
    if (gen) { state.gender = gen.dataset.gender; buildFilters(); render(); return; }
    const cat = e.target.closest("[data-cat]");
    if (cat) { state.category = cat.dataset.cat; buildFilters(); render(); return; }
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
    if (e.target.closest("#f-reset") || e.target.closest("#f-reset2")) {
      Object.assign(state, { gender: "", category: "", q: "", sort: "default", min: null, max: null });
      state.sizes.clear(); state.tags.clear();
      $("#shop-q").value = ""; $("#shop-sort").value = "default"; $("#f-min").value = ""; $("#f-max").value = "";
      buildFilters(); render(); return;
    }
    /* size pick + add to cart on cards */
    const addBtn = e.target.closest("[data-add]");
    if (addBtn) {
      e.preventDefault();
      const p = all.find((x) => x.id === Number(addBtn.dataset.add));
      if (!p) return;
      Cart.add({ id: p.id, slug: p.slug, name: p.name, image: p.images[0] || "", price: p.price, sizes: p.sizes });
    }
    const wish = e.target.closest(".product__wish");
    if (wish) {
      e.preventDefault();
      const active = window.MilanaState?.wishlist?.toggle?.({
        id: wish.dataset.wishId,
        slug: wish.dataset.wishSlug,
        name: wish.dataset.wishName,
        image: wish.dataset.wishImage,
        price: wish.dataset.wishPrice,
      });
      wish.classList.toggle("is-active", Boolean(active));
      wish.setAttribute("aria-pressed", String(Boolean(active)));
    }
  });

  let qTimer;
  $("#shop-q").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 250);
  });
  $("#shop-sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("#f-min").addEventListener("change", (e) => { state.min = e.target.value === "" ? null : Number(e.target.value); render(); });
  $("#f-max").addEventListener("change", (e) => { state.max = e.target.value === "" ? null : Number(e.target.value); render(); });

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
  async function boot() {
    await I18N.ready;
    document.title = I18N.t("shop.title") + " — MILANA PREMIUM";
    $("#shop-q").value = state.q;
    $("#shop-sort").value = state.sort;
    renderSkeleton();
    try {
      all = await (await fetch("/api/products?limit=1000")).json();
    } catch { all = []; renderUnavailable(); return; }
    buildFilters();
    render();
  }
  boot();

  window.addEventListener("i18n:change", () => {
    document.title = I18N.t("shop.title") + " — MILANA PREMIUM";
    buildFilters(); render();
  });
})();
