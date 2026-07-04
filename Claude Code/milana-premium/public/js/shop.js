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
    : `<img src="${esc(url)}" alt="${esc(alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async" fetchpriority="${eager ? "high" : "auto"}" onerror="this.classList.add('is-broken');this.removeAttribute('src')">`;
  const CATS = ["pajamas", "robes", "homewear", "loungewear"]; // clothing type
  const GENDERS = ["women", "men", "kids", "unisex"];
  const TAGS = ["bestseller", "new", "sale"];
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
  function smartNormalize(value) {
    return String(value || "").toLowerCase().replace(/['’`ʻ]/g, "").replace(/[^a-z0-9.$]+/g, " ").trim();
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
      p.name, p.slug, p.model_no, p.variant, p.gender, p.category, p.tag,
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
      if (p.gender === token || p.category === token) score += 12;
      if ((p.sizes || []).some((s) => smartNormalize(s) === token)) score += 10;
      return score;
    }, 0);
  }

  function filtered() {
    const lang = I18N.lang;
    let list = all.map((p) => ({ p, score: state.q ? smartScore(p, state.q, lang) : 0 })).filter(({ p, score }) => {
      if (state.gender && p.gender !== state.gender) return false;
      if (state.category && p.category !== state.category) return false;
      if (state.tags.size && !state.tags.has(p.tag)) return false;
      if (state.sizes.size && !p.sizes.some((s) => state.sizes.has(s))) return false;
      if (state.min !== null && p.price < state.min) return false;
      if (state.max !== null && p.price > state.max) return false;
      if (state.q && score <= 0) return false;
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
    return "";
  }

  function priceHtml(p) {
    if (p.price_visible === false) return `<p class="product__price product__price--pending">${I18N.t("price.manager")}</p>`;
    return `<p class="product__price">${I18N.fmtPrice(p.price)} ${p.old_price ? `<s>${I18N.fmtPrice(p.old_price)}</s>` : ""}</p>`;
  }

  function card(p, i) {
    const fabric = (p.fabric && (p.fabric[I18N.lang] || p.fabric.en)) || "";
    const wished = window.MilanaState?.wishlist?.has?.(p.id);
    return `
    <article class="product" data-id="${p.id}" style="animation-delay:${Math.min(i * 45, 400)}ms">
      <div class="product__media">
        ${tagChip(p)}
        <button class="product__wish${wished ? " is-active" : ""}" data-wish-id="${p.id}" data-wish-slug="${esc(p.slug)}" data-wish-name="${esc(p.name)}" data-wish-image="${esc(p.images[0] || "")}" data-wish-price="${p.price}" data-wish-price-visible="${p.price_visible !== false}" aria-label="Wishlist" aria-pressed="${wished ? "true" : "false"}"><svg class="ic"><use href="#i-heart"/></svg></button>
        <a class="product__go" href="/p/${p.slug}"><figure>${mediaTag(p.images[0] || "", p.name, i < 9)}</figure></a>
        <div class="product__quick">
          <div class="product__sizes">${p.sizes.map((s) => `<span data-size="${esc(s)}">${esc(s)}</span>`).join("")}</div>
          <button class="product__add" data-add="${p.id}"><svg class="ic"><use href="#i-cart"/></svg><span>${I18N.t("best.add")}</span></button>
        </div>
      </div>
      <div class="product__info">
        <div class="product__row"><h3><a href="/p/${p.slug}">${esc(p.name)}</a></h3>
          ${priceHtml(p)}</div>
        <p class="product__fab">${esc(fabric)}</p>
        <p class="product__rating"><svg class="ic"><use href="#i-star"/></svg>${p.rating} <span>(${p.reviews} ${I18N.t("best.reviews")}${p.like_count ? ` · ${p.like_count} saved` : ""})</span></p>
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
  document.addEventListener("click", async (e) => {
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
      Cart.add({ id: p.id, slug: p.slug, name: p.name, image: p.images[0] || "", price: p.price, retail_price: p.retail_price || p.price, price_visible: p.price_visible, price_label: p.price_label, sizes: p.sizes });
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
