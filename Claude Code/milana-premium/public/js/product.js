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
  let unit = "qop";                       /* "pachka" — пачка (6 шт), "qop" — мешок (60 шт) */
  let selectedSize = "";

  const BAG = 60;
  let PACK = 6;                           /* пачка = 1 изделие на каждый размер модели */
  const orderMode = () => window.MilanaAuth?.customer?.account_type === "individual" ? "retail" : "wholesale";
  const retailMode = () => orderMode() === "retail";
  const availabilityFor = (prod = p) => retailMode() ? prod?.availability_retail : prod?.availability_wholesale;
  const canOrder = (prod = p) => {
    const explicit = retailMode() ? prod?.can_order_retail : prod?.can_order_wholesale;
    if (typeof explicit === "boolean") return explicit;
    const availability = availabilityFor(prod);
    if (typeof availability?.available === "boolean") return availability.available;
    if (prod?.in_stock === false) return false;
    if (retailMode() && prod?.retail_enabled === false) return false;
    const stock = retailMode() ? prod?.retail_stock : prod?.available_qop;
    return stock == null || stock === "" || Number(stock) > 0;
  };
  const availabilityStatus = (prod = p) => availabilityFor(prod)?.status
    || (prod?.in_stock === false ? "preorder" : canOrder(prod) ? "in_stock" : "out_of_stock");
  const syncPack = () => {
    const u = (p?.order_units || []).find((x) => x.unit_type === "pachka");
    const n = Array.isArray(p?.sizes) ? p.sizes.length : 0;
    /* один размер («Свободный размер») — пачка стандартная, 6 изделий одного размера */
    PACK = Number(u?.pieces) || (n > 1 ? n : 6);
  };
  const oneSize = () => (Array.isArray(p?.sizes) ? p.sizes.length : 0) === 1;
  const unitSize = () => retailMode() ? 1 : (unit === "pachka" ? PACK : BAG);
  const maxQty = () => {
    const availability = availabilityFor();
    if (!availability?.tracked) return 20;
    if (retailMode()) return Math.max(0, Math.min(20, Math.floor(Number(availability.remaining_units) || 0)));
    const remaining = Math.max(0, Number(availability.remaining_qop) || 0);
    const units = unit === "pachka" ? Math.floor(remaining * BAG / PACK) : Math.floor(remaining);
    return Math.max(0, Math.min(20, units));
  };
  /* мешок — оптовая цена; пачка — розничная, а если она не задана,
     наценка берётся из настроек сайта (Настройки → «Наценка на пачку, %») */
  const packMarkup = () => {
    const v = Number((window.I18N?.settings || {}).pack_markup);
    return Number.isFinite(v) && v >= 0 ? v : 20;
  };
  const pieceCost = (u = unit) => {
    const base = Number(p?.price || 0);
    if (retailMode()) return Number(p?.retail_price || base || 0);
    if (u !== "pachka") return base;
    const retail = Number(p?.retail_price || 0);
    return retail > base ? retail : Math.round(base * (1 + packMarkup() / 100) * 100) / 100;
  };
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
    const value = retailMode() ? Number(prod.retail_price || prod.price || 0) : Number(prod.price || 0);
    return `<strong>${I18N.fmtPrice(value)}</strong>${prod.old_price ? `<s>${I18N.fmtPrice(prod.old_price)}</s>` : ""}<small>${I18N.t("cart.unitPrice")}</small>`;
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
    const price = Number(retailMode() ? p.retail_price || p.price : p.wholesale_price || p.price || 0);
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
      const availability = availabilityStatus(p);
      schema.offers = {
        "@type": "Offer", url, price, priceCurrency: currency,
        availability: availability === "preorder"
          ? "https://schema.org/PreOrder"
          : canOrder(p)
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
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

  /* стрелки на главном кадре — появляются при наведении */
  const galleryArrows = () => [["prev", "M15 5l-7 7 7 7", "prod.prev"], ["next", "M9 5l7 7-7 7", "prod.next"]]
    .map(([dir, d, key]) => `<button class="pd__arrow pd__arrow--${dir}" type="button" data-dir="${dir}" aria-label="${esc(I18N.t(key))}">`
      + `<svg viewBox="0 0 24 24"><path d="${d}"/></svg></button>`).join("");

  function renderGallery() {
    const displayName = I18N.productName(p);
    const box = $("#pd-gallery");
    if (!box) return;
    const poster = p.images.find((u) => !isVideo(u)) || "";
    const many = p.images.length > 1;
    box.classList.toggle("is-single", !many);
    if (imgIdx >= p.images.length || imgIdx < 0) imgIdx = 0;
    /* главный кадр выбирается стрелками, остальные идут следом в своём порядке */
    const order = [imgIdx, ...p.images.map((_, i) => i).filter((i) => i !== imgIdx)];
    box.innerHTML = order.map((n, pos) => {
      const u = p.images[n];
      const lead = pos === 0;
      const media = isVideo(u)
        ? `<video src="${esc(u)}" ${lead ? "autoplay muted loop playsinline" : "controls muted playsinline"} preload="metadata"${poster ? ` poster="${esc(poster)}"` : ""}></video>`
        : `<img src="${esc(u)}" alt="${esc(displayName)}" ${lead ? 'decoding="async" fetchpriority="high"' : 'loading="lazy" decoding="async"'} onerror="this.classList.add('is-broken');this.removeAttribute('src')">`;
      /* первый кадр — во всю ширину колонки, остальные — парами */
      return `<figure class="pd__shot${lead ? " pd__shot--lead" : ""}" data-img="${n}">${lead ? tagChip(p) + (many ? galleryArrows() : "") : ""}${media}</figure>`;
    }).join("") + `<button class="pd__expand" type="button" aria-label="${esc(I18N.t("prod.zoom"))}"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>`;
    window.MilanaState?.wireImages?.($("#pd"));
  }

  /* артикул и отметки «нравится» рядом с названием */
  /* клик по звёздам ведёт к отзывам внизу страницы */
  document.addEventListener("click", (e) => {
    const link = e.target.closest("#pd-rating");
    if (!link) return;
    const box = document.querySelector("#reviews");
    if (!box) return;
    e.preventDefault();
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* другие варианты той же модели — миниатюрами, как выбор цвета у брендов */
  function renderVariants() {
    const box = $("#pd-variants");
    if (!box) return;
    const list = Array.isArray(p?.variants) ? p.variants : [];
    if (list.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
    const thumb = (u) => (window.MilanaThumb ? window.MilanaThumb(u) : u);
    const current = list.find((v) => v.slug === p.slug) || {};
    const head = [I18N.t("prod.variantLabel"), current.variant || ""].filter(Boolean).join(": ");
    box.innerHTML = `<p class="pd__label"><span>${esc(head)}</span>${current.color ? `<i>${esc(current.color)}</i>` : ""}</p>`
      + `<div class="pd__varrow">` + list.map((v) => {
        const on = v.slug === p.slug;
        const title = [v.variant, v.color].filter(Boolean).join(" · ");
        return `<a class="pd__var${on ? " is-on" : ""}${v.in_stock ? "" : " is-pre"}" href="/p/${esc(v.slug)}" title="${esc(title)}"${on ? ' aria-current="true"' : ""}>`
          + (v.image ? `<img src="${esc(thumb(v.image))}" alt="${esc(title)}" loading="lazy">` : `<span>${esc(v.variant || "?")}</span>`)
          + `</a>`;
      }).join("") + `</div>`;
    box.hidden = false;
  }

  /* русское склонение: 1 просмотр, 2–4 просмотра, 5+ просмотров */
  function pluralKey(n) {
    const d = n % 10, h = n % 100;
    if (d === 1 && h !== 11) return "1";
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return "2";
    return "5";
  }

  /* строка под названием: модель · вариант · рейтинг · просмотры · лайки */
  function renderSku() {
    const el = $("#pd-sku"); if (!el || !p) return;
    const parts = [];
    if (p.model_no) parts.push(`${I18N.t("prod.model")} ${p.model_no}`);
    if (p.variant) parts.push(`${I18N.t("prod.variantLabel")} ${p.variant}`);
    const reviews = Number(p.reviews) || 0;
    const rating = Number(p.rating) || 0;
    if (reviews > 0 && rating > 0) parts.push(`★ ${rating.toFixed(1)} (${reviews})`);
    const views = Number(p.views) || 0;
    if (views > 0) parts.push(I18N.t("prod.views" + pluralKey(views), { n: views }));
    el.textContent = parts.join(" · ");

    const likes = $("#pd-likes");
    if (likes) {
      const n = Number(p.like_count) || 0;
      likes.hidden = n < 1;
      likes.textContent = n ? `♡ ${n}` : "";
    }
  }

  /* просмотр засчитывается один раз за сессию, чтобы обновление страницы не накручивало */
  function countView() {
    if (!p?.id) return;
    const key = "ml-viewed";
    let seen = [];
    try { seen = JSON.parse(sessionStorage.getItem(key) || "[]"); } catch (e) { seen = []; }
    if (seen.includes(p.id)) return;
    seen.push(p.id);
    try { sessionStorage.setItem(key, JSON.stringify(seen.slice(-200))); } catch (e) { /* приватный режим */ }
    fetch(`/api/products/${p.id}/view`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => { if (d.counted && d.views) { p.views = d.views; renderSku(); } })
      .catch(() => {});
  }

  /* «60 изделий · по 12 на размер» — цифры зависят от длины размерного ряда */
  function unitNote(kind) {
    if (oneSize()) return I18N.t(kind === "pachka" ? "prod.packNoteOne" : "prod.bagNoteOne", { n: kind === "pachka" ? PACK : BAG });
    if (kind === "pachka") return I18N.t("prod.packNote", { n: PACK });
    const per = Math.floor(BAG / PACK);
    return BAG % PACK === 0
      ? I18N.t("prod.bagNote", { n: BAG, q: per })
      : I18N.t("prod.bagNoteMix", { n: BAG, s: PACK });
  }

  /* цены за упаковку: пачка и мешок */
  function renderTiers() {
    const box = $("#pd-tiers"); if (!box || !p) return;
    if (retailMode()) { box.innerHTML = ""; return; }
    if (p.price_visible === false) { box.innerHTML = ""; return; }

    /* предзаказ считается только мешками — пачку не показываем */
    const preorder = availabilityStatus() === "preorder";
    const rows = [
      { k: "pachka", n: PACK, label: I18N.t("prod.unitPack") },
      { k: "qop", n: BAG, label: I18N.t("prod.unitBag") },
    ].filter((r) => !preorder || r.k === "qop");
    box.classList.toggle("is-single", rows.length < 2);
    if (preorder) unit = "qop";
    box.innerHTML = rows.map((r) => `<button type="button" class="pd__tier${unit === r.k ? " is-on" : ""}" data-unit="${r.k}">`
      + `<b>${esc(I18N.fmtPrice(pieceCost(r.k) * r.n))}</b>`
      + `<i>${esc(r.label)} · ${r.n} ${esc(I18N.t("prod.pcs"))}</i>`
      + `<u>${esc(unitNote(r.k))}</u></button>`).join("");
  }

  /* характеристики: только заполненные поля */
  function renderSpecs() {
    const box = $("#pd-specs"), list = $("#pd-specs-list");
    if (!box || !list || !p) return;
    const lang = I18N.lang;
    const fab = (p.fabric && (p.fabric[lang] || p.fabric.en)) || "";
    const stub = window.MilanaIsFabricPlaceholder
      ? MilanaIsFabricPlaceholder(fab)
      : /не указан|not specified|ko.rsatilmagan/i.test(fab);
    const rows = [
      [I18N.t("prod.category"), p.catalog_panel ? I18N.panelName(p.catalog_panel) : I18N.catName(p.category)],
      [I18N.t("prod.color"), I18N.fieldValue("color", p.color)],   /* вариант — это код модели, не цвет */
      [I18N.t("prod.country"), I18N.fieldValue("country", p.country)],
      [I18N.t("prod.material"), p.material ? I18N.fieldValue("material", p.material) : (stub ? "" : (window.MilanaFab || ((x) => x))(fab))],
      [I18N.t("prod.composition"), I18N.fieldValue("composition", p.composition)],
      [I18N.t("prod.season"), I18N.fieldValue("season", p.season)],
      [I18N.t("prod.sizesRow"), (p.sizes || []).map((s) => I18N.sizeLabel(s)).join(" · ")],
      [I18N.t("prod.wholesaleBag"), retailMode() ? "" : `${I18N.t("prod.unitPack")} ${PACK} ${I18N.t("prod.pcs")} · ${I18N.t("prod.unitBag")} ${BAG} ${I18N.t("prod.pcs")}`],
    ].filter(([, v]) => String(v || "").trim());
    box.hidden = !rows.length;
    list.innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  }

  /* замеры прямо на странице */
  function renderMeasure() {
    const box = $("#pd-measure"), body = $("#pd-measure-body");
    if (!box || !body || !p) return;
    const rows = p.size_chart ? parseChart(p.size_chart) : defaultChart(p.sizes);
    box.hidden = !rows.length;
    if (!rows.length) return;
    const head = [I18N.t("prod.scSize"), I18N.t("prod.scChest"), I18N.t("prod.scLength"), I18N.t("prod.scSleeve")];
    body.innerHTML = `<table class="pd-sc__table"><thead><tr>${head.slice(0, rows[0].length).map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>`
      + `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function render() {
    syncPack();
    unit = retailMode() ? "piece" : (unit === "pachka" ? "pachka" : "qop");
    if (selectedSize && !(p.sizes || []).map(String).includes(String(selectedSize))) selectedSize = "";
    qty = Math.max(1, Math.min(qty, Math.max(1, maxQty())));
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
    { const el = $("#pd-cat"); if (el) el.textContent = displayName; }  /* надзаголовок убран из разметки */
    $("#pd-name").textContent = displayName;
    const rating = $("#pd-rating");
    /* звёзды показываем, когда задана оценка — отзывы не обязательны */
    const rv = Number(p.rating) || 0;
    const rn = Number(p.reviews) || 0;
    rating.hidden = !(rv > 0);
    rating.innerHTML = rv > 0
      ? `<span class="stars" style="--r:${((rv / 5) * 100).toFixed(1)}%" aria-hidden="true"><i>★★★★★</i><b>★★★★★</b></span>`
        + `<em>${rv.toFixed(1)}</em>${rn > 0 ? ` <span>(${rn} ${I18N.t("best.reviews")})</span>` : ""}`
        + `<u>${esc(I18N.t("prod.readReviews"))}</u>`
      : "";
    renderSku();
    renderTiers();
    renderSpecs();
    renderMeasure();
    $("#pd-price").classList.toggle("pd__price--pending", p.price_visible === false);
    $("#pd-price").innerHTML = priceHtml(p);
    /* состав: заглушку «не указан» не показываем — блок скрываем целиком */
    {
      /* рамка состава убрана из разметки — состав показывается в «Характеристиках» */
      const fabEl = $("#pd-fabric");
      if (fabEl) {
        const raw = (window.MilanaFab || ((x) => x))(p.fabric[lang] || p.fabric.en || "");
        const isStub = window.MilanaIsFabricPlaceholder
          ? MilanaIsFabricPlaceholder(raw)
          : /не указан|not specified|ko.rsatilmagan|korsatilmagan/i.test(raw);
        fabEl.textContent = isStub ? "" : raw;
        const wrap = fabEl.parentElement || fabEl;
        wrap.hidden = isStub || !raw.trim();
      }
    }
    /* прежняя таблица заменена блоком «Характеристики» */
    $("#pd-desc").textContent = I18N.packageText(p.desc[lang] || p.desc.en || "");
    {
      const composition = p.composition ? I18N.fieldValue("composition", p.composition) : "";
      const fabric = window.MilanaFabricText
        ? MilanaFabricText(p, lang)
        : (p.fabric[lang] || p.fabric.en || "");
      const lines = [composition, fabric, p.care?.[lang] || p.care?.en || ""]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .filter((value, index, values) => (
          values.findIndex((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) === index
        ));
      $("#pd-care").textContent = lines.join("\n");
    }
    /* Наличие зависит от типа аккаунта и рассчитывается API. */
    const stockEl = document.querySelector('[data-i18n="prod.inStock"], [data-i18n="prod.preorder"], [data-i18n="prod.unavailable"]');
    if (stockEl) {
      const status = availabilityStatus();
      const key = status === "in_stock" ? "prod.inStock" : status === "preorder" ? "prod.preorder" : "prod.unavailable";
      stockEl.dataset.i18n = key;
      stockEl.textContent = I18N.t(key);
      stockEl.classList.toggle("is-pre", status !== "in_stock");
    }
    renderPreorder();
    $("#pd").classList.remove("is-loading", "is-error");
    renderQty();
    renderVariants();
    countView();
    renderGallery();
    renderWish();
    renderReviews();

    /* sizes */
    const wrap = $("#pd-sizes");
    const sizeLabel = document.querySelector('[data-i18n="prod.size"]');
    if (retailMode() && p.sizes.length) {
      wrap.innerHTML = p.sizes.map((s) =>
        `<button type="button" data-retail-size="${esc(s)}" class="${String(selectedSize) === String(s) ? "is-on" : ""}">${esc(I18N.sizeLabel(s))}</button>`).join("");
      wrap.style.display = "";
      const labelRow = sizeLabel?.closest(".pd__label");
      if (labelRow) labelRow.style.display = "";
      if (sizeLabel) {
        sizeLabel.dataset.i18n = "cart.size";
        sizeLabel.textContent = I18N.t("cart.size") + " *";
      }
      wrap.parentElement?.classList?.remove("hidden");
    } else {
      /* ссылка на таблицу размеров живёт в строке с ценой, поэтому строку с плитками прячем целиком */
      wrap.innerHTML = "";
      wrap.style.display = "none";
      const labelRow = sizeLabel?.closest(".pd__label");
      if (labelRow) labelRow.style.display = "none";
      if (sizeLabel) sizeLabel.dataset.i18n = "prod.size";
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
    { const el = $("#pd-cat"); if (el) el.textContent = ""; }
  }

  /* ---------------- events ---------------- */
  document.addEventListener("click", (e) => {
    const arrow = e.target.closest(".pd__arrow");
    if (arrow && p && p.images.length > 1) {
      imgIdx = (imgIdx + (arrow.dataset.dir === "next" ? 1 : -1) + p.images.length) % p.images.length;
      renderGallery();
      return;
    }
    /* полноэкранный просмотр: клик по любому кадру или по кнопке «увеличить» */
    const shot = e.target.closest(".pd__shot");
    if (p && (e.target.closest(".pd__expand") || shot)) {
      window.MilanaLightbox?.open(p.images, shot ? Number(shot.dataset.img) || 0 : imgIdx);
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

  function renderQty() {
    $("#qty-n").textContent = qty + " " + I18N.t(retailMode() ? "cart.pcs" : unit === "pachka" ? "cart.packShort" : "cart.bagShort");
    const minus = $("#qty-minus"), plus = $("#qty-plus");
    if (minus) minus.disabled = qty <= 1 || !canOrder();
    if (plus) plus.disabled = qty >= maxQty() || !canOrder();
    renderTotal();
  }

  /* живой итог: количество × размер упаковки × цена за штуку */
  function renderTotal() {
    const box = $("#pd-total"); if (!box || !p) return;
    const pieces = unitSize() * qty;
    if (p.price_visible === false) { box.textContent = I18N.t("price.manager"); syncSticky(); return; }
    const sum = pieceCost() * pieces;
    box.innerHTML = `<span>${esc(I18N.t("prod.total"))}</span> <b>${esc(I18N.fmtPrice(sum))}</b>`
      + ` <i>${pieces} ${esc(I18N.t("prod.pcs"))} · ${esc(I18N.fmtPrice(pieceCost()))} ${esc(I18N.t("prod.perPiece"))}</i>`;
    syncSticky();
  }

  /* Недоступный для текущего типа аккаунта товар нельзя положить в корзину. */
  function managerLink() {
    const st = (window.I18N?.settings) || {};
    const model = [p?.model_no, p?.variant].filter(Boolean).join(" · ");
    const text = I18N.t("prod.preorderMsg", { name: (window.MilanaName ? MilanaName(p) : p?.name) || "", model });
    if (st.whatsapp) return `https://wa.me/${String(st.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
    if (st.telegram) return `https://t.me/${String(st.telegram).replace(/^@/, "")}`;
    if (st.phone) return `tel:${String(st.phone).replace(/[^\d+]/g, "")}`;
    return "/support";
  }

  function renderPreorder() {
    const status = availabilityStatus();
    const pre = status === "preorder";
    const blocked = !canOrder();
    const note = $("#pd-preorder"), buy = $("#pd-add"), mgr = $("#pd-manager");
    const qtyBox = document.querySelector(".pd__qty"), total = $("#pd-total");
    const sMgr = $("#pd-sticky-manager"), sAdd = $("#pd-sticky-add"), sPrice = document.querySelector(".pd-sticky__price");
    if (note) {
      const st = (window.I18N?.settings) || {};
      const min = Number(st.preorder_min) || 10;
      const max = Number(st.preorder_max) || 20;
      note.textContent = pre ? I18N.t("prod.preorderNote", { min, max }) : blocked ? I18N.t("prod.unavailable") : "";
      note.hidden = !blocked;
    }
    const href = blocked ? managerLink() : "";
    /* только [hidden] недостаточно: правила .btn / .pd__qty задают display и перебивают его */
    const show = (el, on) => {
      if (!el) return;
      el.hidden = !on;
      el.style.display = on ? "" : "none";
    };
    const label = document.querySelector('[data-i18n="prod.inStock"], [data-i18n="prod.preorder"], [data-i18n="prod.unavailable"]')?.closest(".pd__label");
    show(mgr, blocked); show(sMgr, blocked);
    show(buy, !blocked); show(sAdd, !blocked); show(qtyBox, !blocked); show(total, !blocked); show(sPrice, !blocked);
    show(label, !blocked);
    if (mgr) mgr.href = href;
    if (sMgr) sMgr.href = href;
  }

  function syncSticky() {
    const t = $("#pd-sticky-total"), u = $("#pd-sticky-unit");
    if (!t || !p || !canOrder()) return;
    const pieces = unitSize() * qty;
    t.textContent = p.price_visible === false ? I18N.t("price.manager") : I18N.fmtPrice(pieceCost() * pieces);
    u.textContent = retailMode()
      ? `${qty} ${I18N.t("cart.pcs")}${selectedSize ? " · " + I18N.t("cart.size") + " " + I18N.sizeLabel(selectedSize) : ""}`
      : `${qty} ${I18N.t(unit === "pachka" ? "cart.packShort" : "cart.bagShort")} · ${pieces} ${I18N.t("prod.pcs")}`;
  }

  /* переключение пачка / мешок */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-unit]");
    if (b) (() => {
      if (retailMode()) return;
      unit = b.dataset.unit === "pachka" ? "pachka" : "qop";
      qty = Math.min(qty, Math.max(1, maxQty()));
      document.querySelectorAll("[data-unit]").forEach((x) => x.classList.toggle("is-on", x.dataset.unit === unit));
      renderQty();
      renderTiers();
    })();
    const size = e.target.closest("[data-retail-size]");
    if (size && retailMode()) {
      selectedSize = size.dataset.retailSize || "";
      document.querySelectorAll("[data-retail-size]").forEach((button) => {
        button.classList.toggle("is-on", button.dataset.retailSize === selectedSize);
      });
      renderQty();
    }
  });

  /* липкая панель покупки на мобильном — появляется, когда основная кнопка ушла вверх */
  (() => {
    const bar = $("#pd-sticky"), addBtn = $("#pd-add");
    if (!bar || !addBtn) return;
    let btnVisible = false;
    const sync = () => {
      /* показываем, когда основная кнопка ушла из виду И страница уже пролистана */
      bar.hidden = btnVisible || window.innerWidth > 900 || window.scrollY < 360;
    };
    const io = new IntersectionObserver(([e]) => { btnVisible = e.isIntersecting; sync(); },
      { rootMargin: "-70px 0px 0px 0px" });
    io.observe(addBtn);
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
    $("#pd-sticky-add").addEventListener("click", () => addBtn.click());
  })();

  /* ---------- размерная сетка ---------- */
  function defaultChart(sizes) {
    /* базовые замеры, если у модели ещё не заполнена своя сетка */
    return (sizes || []).filter(Boolean).map((sz) => {
      const n = Number(String(sz).replace(/\D/g, "")) || 0;
      if (n >= 80) return [sz, Math.round(n * 0.52), Math.round(n * 0.46), Math.round(n * 0.36)];  /* детский рост */
      const chest = n * 2;
      return [sz, chest, Math.round(66 + (n - 44) * 0.9), Math.round(18 + (n - 44) * 0.35)];
    });
  }

  function parseChart(text) {
    return String(text || "").split(/\r?\n/).map((l) => l.split("|").map((c) => c.trim()))
      .filter((r) => r.length >= 2 && r[0]);
  }

  function renderChart() {
    const body = $("#pd-sc-body"); if (!body || !p) return;
    const rows = p.size_chart ? parseChart(p.size_chart) : defaultChart(p.sizes);
    if (!rows.length) { body.innerHTML = ""; return; }
    const head = [I18N.t("prod.scSize"), I18N.t("prod.scChest"), I18N.t("prod.scLength"), I18N.t("prod.scSleeve")];
    body.innerHTML = `<table class="pd-sc__table"><thead><tr>${head.slice(0, rows[0].length).map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>`
      + `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  const scBox = $("#pd-sc");
  $("#pd-sc-open")?.addEventListener("click", () => { renderChart(); scBox.hidden = false; document.body.style.overflow = "hidden"; });
  scBox?.addEventListener("click", (e) => {
    if (e.target.closest("[data-sc-close]")) { scBox.hidden = true; document.body.style.overflow = ""; }
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && scBox && !scBox.hidden) { scBox.hidden = true; document.body.style.overflow = ""; } });
  $("#qty-minus").addEventListener("click", () => { qty = Math.max(1, qty - 1); renderQty(); });
  $("#qty-plus").addEventListener("click", () => { qty = Math.min(maxQty(), qty + 1); renderQty(); });

  $("#pd-add").addEventListener("click", () => {
    if (!p || !canOrder()) return;
    if (retailMode() && !selectedSize) {
      const wrap = $("#pd-sizes");
      wrap?.classList.remove("shake");
      if (wrap) { void wrap.offsetWidth; wrap.classList.add("shake"); }
      return;
    }
    const added = Cart.add({
      id: p.id, slug: p.slug, name: window.MilanaName ? MilanaName(p) : p.name,
      name_i18n: p.name_i18n, product_type: p.product_type, catalog_panel: p.catalog_panel,
      category: p.category, image: p.images[0] || "", price: p.price,
      retail_price: p.retail_price || p.price, price_visible: p.price_visible,
      price_label: p.price_label, sizes: p.sizes, size: selectedSize, qty,
      pack: unit, pack_pieces: PACK, retail_enabled: p.retail_enabled,
      retail_stock: p.retail_stock, available_qop: p.available_qop, in_stock: p.in_stock,
      can_order_wholesale: p.can_order_wholesale, can_order_retail: p.can_order_retail,
      availability_wholesale: p.availability_wholesale, availability_retail: p.availability_retail,
    });
    if (added) Cart.open();
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
    const form = e.currentTarget;   /* после await currentTarget обнуляется — держим ссылку заранее */
    const msg = document.querySelector("[data-review-msg]");
    const data = Object.fromEntries(new FormData(form));
    msg.hidden = true;
    const comment = String(data.comment || "").trim();
    if (comment.length < 3) {
      msg.textContent = I18N.t("reviews.commentRequired");
      msg.classList.remove("is-good");
      msg.hidden = false;
      form.reportValidity();
      return;
    }
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: p.id, product_slug: p.slug, rating: data.rating, comment }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(res.error || "review_failed");
      msg.textContent = I18N.t("reviews.submitted");
      msg.classList.add("is-good");
      msg.hidden = false;
      form.reset();
      reviewRating = 5;
      renderReviewStars();
    } catch (ex) {
      const codes = {
        unauthorized: "reviews.signinFirst",
        rate_limited: "reviews.tooMany",
        verified_purchase_required: "reviews.verifiedOnly",
        comment_required: "reviews.commentRequired",
        duplicate_review: "reviews.duplicate",
      };
      msg.textContent = I18N.t(codes[ex.message] || "reviews.failed");
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
  let productRefresh = null;
  async function loadProduct() {
    if (productRefresh) return productRefresh;
    productRefresh = fetch("/api/products/" + encodeURIComponent(slug), { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error("product_unavailable");
        return response.json();
      })
      .then((product) => {
        p = product;
        window.MilanaState?.wishlist?.refresh?.([product]);
        render();
        openFirstAcc();
        return product;
      })
      .finally(() => { productRefresh = null; });
    return productRefresh;
  }

  async function boot() {
    await I18N.ready;
    if (!slug) { renderError(); return; }
    try {
      await loadProduct();
    } catch { renderError(); return; }
    await loadReviews();
  }
  boot();

  window.addEventListener("i18n:change", () => { if (p) { render(); openFirstAcc(); } });
  window.addEventListener("milana:wishlist", renderWish);
  window.addEventListener("milana:auth", () => {
    renderReviews();
    if (slug) loadProduct().catch(() => {});
  });
})();
