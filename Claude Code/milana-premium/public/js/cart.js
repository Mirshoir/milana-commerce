/* ============================================================
   MILANA — cart store + slide-in drawer + checkout
   Requires i18n.js first. window.Cart = { add, open, ... }
   ============================================================ */
(() => {
  "use strict";

  const KEY = "ml-cart";
  const BAG_SIZE = () => (window.I18N && I18N.BAG_SIZE) || 60;
  const PACK_SIZE = () => (window.I18N && I18N.PACK_SIZE) || 6;
  /* единица продажи строки: "pachka" — пачка (6 шт), "qop" — мешок (60 шт) */
  const packOf = (i) => (i && i.pack === "pachka" ? "pachka" : "qop");
  /* пачка = 1 изделие на размер, поэтому её объём равен размерному ряду позиции */
  const packSize = (i) => {
    if (packOf(i) !== "pachka") return BAG_SIZE();
    const n = Number(i?.pack_pieces) || (Array.isArray(i?.sizes) ? i.sizes.length : 0);
    /* один размер — пачка обычная, 6 изделий одного размера */
    return n > 1 ? n : PACK_SIZE();
  };
  const packShort = (i) => t(packOf(i) === "pachka" ? "cart.packShort" : "cart.bagShort");
  const packTotalLabel = (i) => t(packOf(i) === "pachka" ? "cart.packTotal" : "cart.bagTotal");
  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
  if (!Array.isArray(items)) items = [];

  const orderMode = () => window.MilanaAuth?.customer?.account_type === "individual" ? "retail" : "wholesale";
  const availabilityFor = (i, mode = orderMode()) =>
    mode === "retail" ? i?.availability_retail : i?.availability_wholesale;
  const canOrder = (i, mode = orderMode()) => {
    const explicit = mode === "retail" ? i?.can_order_retail : i?.can_order_wholesale;
    if (typeof explicit === "boolean") return explicit;
    const availability = availabilityFor(i, mode);
    if (typeof availability?.available === "boolean") return availability.available;
    if (i?.in_stock === false) return false;
    if (mode === "retail" && i?.retail_enabled === false) return false;
    const stock = mode === "retail" ? i?.retail_stock : i?.available_qop;
    return stock == null || stock === "" || Number(stock) > 0;
  };
  const hasValidRetailSize = (i) => {
    if (orderMode() !== "retail") return true;
    const size = String(i?.size || "").trim();
    const sizes = Array.isArray(i?.sizes) ? i.sizes.map(String) : [];
    return Boolean(size) && (!sizes.length || sizes.includes(size));
  };
  const maxOrderQty = (i) => {
    const availability = availabilityFor(i);
    if (!availability?.tracked) return 20;
    if (orderMode() === "retail") {
      return Math.max(0, Math.min(20, Math.floor(Number(availability.remaining_units) || 0)));
    }
    const qop = Math.max(0, Number(availability.remaining_qop) || 0);
    const units = packOf(i) === "pachka" ? Math.floor(qop * BAG_SIZE() / packSize(i)) : Math.floor(qop);
    return Math.max(0, Math.min(20, units));
  };
  const isBlocked = (i) => i?.refresh_failed === true || !canOrder(i) || !hasValidRetailSize(i) || maxOrderQty(i) < 1;
  const hasBlockedItems = () => items.some(isBlocked);
  const save = () => { localStorage.setItem(KEY, JSON.stringify(items)); updateBadges(); };
  const count = () => items.reduce((s, i) => s + i.qty, 0);
  const pendingPrice = (i) => i.price_visible === false || i.price_pending === true;
  /* мешок — оптовая цена; пачка — розничная либо оптовая + наценка из настроек */
  const packMarkup = () => {
    const v = Number((window.I18N?.settings || {}).pack_markup);
    return Number.isFinite(v) && v >= 0 ? v : 20;
  };
  const unitPrice = (i) => {
    const base = Number(i.price || 0);
    if (orderMode() === "retail") return Number(i.retail_price || base || 0);
    if (packOf(i) !== "pachka") return base;
    const retail = Number(i.retail_price || 0);
    return retail > base ? retail : Math.round(base * (1 + packMarkup() / 100) * 100) / 100;
  };
  const lineTotal = (i) => pendingPrice(i) ? 0 : unitPrice(i) * (orderMode() === "retail" ? 1 : packSize(i)) * i.qty;
  const total = () => items.reduce((s, i) => s + lineTotal(i), 0);
  const hasPendingTotal = () => items.some(pendingPrice);
  const t = (k, v) => window.I18N ? I18N.t(k, v) : k;
  const fmt = (n) => window.I18N ? I18N.fmtPrice(n) : "$" + n;
  const priceText = (i, amount = unitPrice(i)) => pendingPrice(i) ? t("price.manager") : fmt(amount);
  /* пачка — по 1 на размер; мешок — 60 изделий, разложенных по ряду (остаток в первые размеры) */
  const mixList = (i) => {
    const list = (Array.isArray(i && i.sizes) ? i.sizes : []).filter(Boolean);
    if (!list.length) return [];
    if (packOf(i) === "pachka") {
      return list.length === 1 ? [{ s: list[0], q: packSize(i) }] : list.map((s) => ({ s, q: 1 }));
    }
    const base = Math.floor(BAG_SIZE() / list.length);
    let rest = BAG_SIZE() - base * list.length;
    return list.map((s) => ({ s, q: base + (rest-- > 0 ? 1 : 0) }));
  };
  const mixText = (i) => {
    const list = mixList(i);
    const label = (v) => (window.I18N ? I18N.sizeLabel(v) : v);
    return list.length ? list.map((x) => esc(label(x.s)) + " × " + x.q).join(", ") : t("cart.defaultMix");
  };

  /* ---------------- drawer skeleton ---------------- */
  const drawer = document.createElement("div");
  drawer.className = "drawer";
  drawer.innerHTML = `
    <div class="drawer__veil" data-cart-close></div>
    <aside class="drawer__panel" role="dialog" aria-modal="true" aria-label="Cart">
      <header class="drawer__head">
        <h3 class="drawer__title"></h3>
        <button type="button" class="drawer__x" data-cart-close aria-label="Close">&#10005;</button>
      </header>
      <div class="drawer__body"></div>
      <footer class="drawer__foot"></footer>
    </aside>`;
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(drawer));

  let view = "list"; // list | checkout | success
  let lastOrder = null;
  let lastPayment = null;
  let managers = [];
  let managersLoaded = false;
  let refreshPromise = null;
  let orderAttempt = null;
  const ORDER_ATTEMPT_STORAGE = "ml-checkout-attempt";

  async function orderFingerprint(serialized) {
    const webCrypto = globalThis.crypto;
    if (typeof webCrypto?.subtle?.digest !== "function" || typeof TextEncoder !== "function") return "";
    const digest = await webCrypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function secureOrderKey(serialized) {
    const fingerprint = await orderFingerprint(serialized);
    if (orderAttempt?.serialized === serialized) return orderAttempt.key;
    if (orderAttempt?.fingerprint && orderAttempt.fingerprint === fingerprint) return orderAttempt.key;
    if (fingerprint) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(ORDER_ATTEMPT_STORAGE) || "null");
        if (stored?.fingerprint === fingerprint && /^ml-[A-Za-z0-9-]{16,}$/.test(stored.key || "")) {
          orderAttempt = { ...stored, serialized };
          return stored.key;
        }
      } catch { /* unavailable or invalid session storage */ }
    }
    const webCrypto = globalThis.crypto;
    let key = "";
    if (typeof webCrypto?.randomUUID === "function") {
      key = "ml-" + webCrypto.randomUUID();
    } else if (typeof webCrypto?.getRandomValues === "function") {
      const bytes = new Uint8Array(18);
      webCrypto.getRandomValues(bytes);
      key = "ml-" + [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    } else {
      throw new Error("secure_context_required");
    }
    orderAttempt = { fingerprint, key, serialized };
    if (fingerprint) {
      try {
        sessionStorage.setItem(ORDER_ATTEMPT_STORAGE, JSON.stringify({ fingerprint, key }));
      } catch { /* private mode */ }
    }
    return key;
  }

  function orderErrorMessage(code) {
    const normalized = String(code || "").trim();
    const key = "cart.error." + normalized;
    const translated = t(key);
    return normalized && translated !== key ? translated : t("cart.orderFailed");
  }

  async function fetchCurrentProduct(item) {
    const stableId = Number(item?.id) || 0;
    const references = [
      stableId ? String(stableId) : "",
      String(item?.slug || "").trim(),
    ].filter((value, index, values) => value && values.indexOf(value) === index);
    let lastError = new Error("product_unavailable");
    for (const reference of references) {
      try {
        const response = await fetch("/api/products/" + encodeURIComponent(reference), {
          headers: { Accept: "application/json" },
        });
        const current = await response.json().catch(() => ({}));
        if (!response.ok || !current?.id) throw new Error("product_unavailable");
        /* A renamed slug may later be reused by another product. Never let the
           compatibility fallback replace a cart line with a different ID. */
        if (stableId && Number(current.id) !== stableId) throw new Error("product_id_mismatch");
        return current;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function refreshItems() {
    if (!items.length) return items;
    if (refreshPromise) return refreshPromise;
    const refreshedProducts = [];
    refreshPromise = Promise.all(items.map(async (item) => {
      if (!item?.id && !item?.slug) {
        item.refresh_failed = true;
        return;
      }
      try {
        const current = await fetchCurrentProduct(item);
        refreshedProducts.push(current);
        Object.assign(item, {
          id: current.id,
          slug: current.slug || item.slug,
          name: current.name || item.name,
          name_i18n: current.name_i18n || item.name_i18n,
          product_type: current.product_type || item.product_type,
          catalog_panel: current.catalog_panel || item.catalog_panel,
          category: current.category || item.category,
          image: current.images?.[0] || item.image,
          price: current.price,
          retail_price: current.retail_price,
          price_visible: current.price_visible !== false,
          price_label: current.price_label || "",
          sizes: Array.isArray(current.sizes) ? current.sizes.slice(0, 12) : [],
          pack_pieces: current.order_units?.find((unit) => unit.unit_type === "pachka")?.pieces,
          retail_enabled: current.retail_enabled,
          retail_stock: current.retail_stock,
          available_qop: current.available_qop,
          in_stock: current.in_stock,
          can_order_wholesale: current.can_order_wholesale,
          can_order_retail: current.can_order_retail,
          availability_wholesale: current.availability_wholesale,
          availability_retail: current.availability_retail,
          refresh_failed: false,
        });
        const max = maxOrderQty(item);
        if (max > 0 && item.qty > max) item.qty = max;
      } catch {
        item.refresh_failed = true;
      }
    })).then(() => {
      window.MilanaState?.wishlist?.refresh?.(refreshedProducts);
      save();
      return items;
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function loadManagers() {
    if (managersLoaded) return managers;
    try {
      const response = await fetch("/api/managers", { headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => []);
      managers = response.ok && Array.isArray(data) ? data : [];
    } catch {
      managers = [];
    }
    managersLoaded = true;
    return managers;
  }

  const bodyEl = () => drawer.querySelector(".drawer__body");
  const footEl = () => drawer.querySelector(".drawer__foot");

  function render() {
    drawer.querySelector(".drawer__panel").setAttribute("aria-label", t("cart.title"));
    drawer.querySelector("[data-cart-close]").setAttribute("aria-label", t("aria.close"));
    drawer.querySelector(".drawer__title").textContent =
      view === "checkout" ? t("cart.checkout") : view === "success" ? t("cart.success1") : t("cart.title");

    if (view === "success") {
      const wa = (window.I18N && I18N.settings.whatsapp) || "";
      bodyEl().innerHTML = `
        <div class="drawer__success">
          <div class="drawer__check">&#10003;</div>
          <h4>${t("cart.success1")}</h4>
          <p>${t("cart.success2", { n: "<strong>" + lastOrder + "</strong>" })}</p>
          ${lastPayment ? `<p>${t("cart.paymentStatus", { s: "<strong>" + t("cart.paymentPending") + "</strong>" })}</p>` : ""}
          <div class="drawer__success-cta">
            ${wa ? `<a class="btn btn--primary" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent("Hello! Order " + lastOrder)}"><span>${t("cart.successWa")}</span></a>` : ""}
            <a class="link-arrow" href="/shop">${t("cart.continue")}<svg class="ic"><use href="#i-arrow"/></svg></a>
          </div>
        </div>`;
      footEl().innerHTML = "";
      return;
    }

    if (view === "checkout") {
      const customer = window.MilanaAuth?.customer || {};
      const mode = orderMode();
      bodyEl().innerHTML = `
        <form class="drawer__form" id="checkout-form">
          <label><span>${t("cart.name")} *</span><input name="name" required maxlength="80" autocomplete="name" value="${esc(customer.name || "")}"></label>
          <label><span>${t("cart.phone")} *</span><input name="phone" required maxlength="25" autocomplete="tel" placeholder="+998 90 123 45 67" value="${esc(customer.phone || "")}"></label>
          <label><span>${t("cart.city")}</span><input name="city" maxlength="80" autocomplete="address-level2" value="${esc(customer.city || "")}"></label>
          <label><span>${t("cart.address")}</span><input name="address" maxlength="300" autocomplete="street-address" value="${esc(customer.address || "")}"></label>
          <label><span>${t("cart.manager")} *</span>
            <select name="manager_id" required>
              <option value="">${managersLoaded ? t("cart.managerChoose") : t("cart.managerLoading")}</option>
              ${managers.map((manager) => `<option value="${esc(manager.id)}">${esc(manager.name)}</option>`).join("")}
            </select>
          </label>
          ${managersLoaded && !managers.length ? `<p class="drawer__err">${t("cart.managerUnavailable")}</p>` : ""}
          <label><span>${t("cart.payment")} *</span>
            <select name="payment_method" required>
              <option value="manager">${t("cart.paymentManager")}</option>
              <option value="bank">${t("cart.paymentBank")}</option>
              <option value="click">${t("cart.paymentClick")}</option>
              <option value="payme">${t("cart.paymentPayme")}</option>
              <option value="card">${t("cart.paymentCard")}</option>
              <option value="cash">${t("cart.paymentCash")}</option>
            </select>
          </label>
          <label><span>${t("cart.comment")}</span><textarea name="comment" maxlength="1000" rows="3"></textarea></label>
          <p class="drawer__note">${mode === "retail" ? t("cart.retailRule") : t("cart.bagRule")}</p>
          <p class="drawer__note">${t("cart.paymentNote")}</p>
          <p class="drawer__note"><a href="/ordering" target="_blank">${t("cart.orderingLink")}</a> · ${t("cart.orderNote")}</p>
        </form>`;
      footEl().innerHTML = `
        <div class="drawer__total"><span>${t("cart.total")}</span><strong>${hasPendingTotal() ? t("cart.totalPending") : fmt(total())}</strong></div>
        <p class="drawer__err" data-order-error role="alert" aria-live="assertive" hidden></p>
        <button type="submit" form="checkout-form" class="btn btn--primary drawer__cta" data-place><span>${t("cart.place")}</span><svg class="ic"><use href="#i-arrow"/></svg></button>
        <button type="button" class="drawer__backlink" data-back>&larr; ${t("cart.back")}</button>`;
      return;
    }

    /* list view */
    if (!items.length) {
      bodyEl().innerHTML = `
        <div class="drawer__empty">
          <svg class="ic"><use href="#i-cart"/></svg>
          <p>${t("cart.empty")}</p>
          <a class="btn btn--ghost" href="/shop"><span>${t("cart.emptyCta")}</span></a>
        </div>`;
      footEl().innerHTML = "";
      return;
    }
    const mode = orderMode();
    bodyEl().innerHTML = items.map((it, idx) => `
      <div class="citem">
          <a class="citem__img" href="/p/${it.slug}"><img src="${it.image}" alt=""></a>
        <div class="citem__info">
          <a class="citem__name" href="/p/${it.slug}">${esc(window.I18N?.productName ? I18N.productName(it) : it.name)}</a>
          <p class="citem__size">${t("cart.unitPrice")}: ${priceText(it)}</p>
          ${mode === "retail" ? `<p class="citem__size">${t("cart.size")}: ${esc(it.size || "—")}</p>` : `<p class="citem__size">${t("cart.sizeMix")}: ${mixText(it)}</p><p class="citem__size">${packTotalLabel(it)}: ${priceText(it, unitPrice(it) * packSize(it))} <i class="citem__unit">${packSize(it)} ${t("cart.pcs")}</i></p>`}
          ${isBlocked(it) ? `<p class="drawer__err">${esc(it.refresh_failed ? t("shop.loadError") : !hasValidRetailSize(it) ? t("cart.size") + " *" : t("prod.unavailable"))}</p>` : ""}
          <div class="citem__row">
            <div class="citem__qty">
              <button type="button" data-qty="${idx}:-1" aria-label="−"${isBlocked(it) ? " disabled" : ""}>−</button><span>${it.qty} ${mode === "retail" ? t("cart.pcs") : packShort(it)}</span><button type="button" data-qty="${idx}:1" aria-label="+"${isBlocked(it) || it.qty >= maxOrderQty(it) ? " disabled" : ""}>+</button>
            </div>
            <strong>${priceText(it, lineTotal(it))}</strong>
          </div>
        </div>
        <button type="button" class="citem__x" data-del="${idx}" aria-label="Remove">&#10005;</button>
      </div>`).join("");
    footEl().innerHTML = `
      <div class="drawer__total"><span>${t("cart.total")}</span><strong>${hasPendingTotal() ? t("cart.totalPending") : fmt(total())}</strong></div>
      ${hasBlockedItems() ? `<p class="drawer__err">${esc(t("prod.unavailable"))}</p>` : ""}
      <button type="button" class="btn btn--primary drawer__cta" data-checkout${hasBlockedItems() ? " disabled" : ""}><span>${t("cart.checkout")}</span><svg class="ic"><use href="#i-arrow"/></svg></button>`;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- events ---------------- */
  drawer.addEventListener("click", async (e) => {
    if (e.target.closest("[data-cart-close]")) return close();
    const del = e.target.closest("[data-del]");
    if (del) { items.splice(+del.dataset.del, 1); save(); render(); return; }
    const q = e.target.closest("[data-qty]");
    if (q) {
      const [idx, d] = q.dataset.qty.split(":").map(Number);
      if (!items[idx] || isBlocked(items[idx])) return;
      items[idx].qty = Math.min(maxOrderQty(items[idx]), Math.max(1, items[idx].qty + d));
      save(); render(); return;
    }
    if (e.target.closest("[data-checkout]")) {
      await refreshItems();
      if (hasBlockedItems()) { view = "list"; render(); return; }
      view = "checkout";
      render();
      await loadManagers();
      render();
      return;
    }
    if (e.target.closest("[data-back]")) { view = "list"; render(); return; }
  });

  drawer.addEventListener("submit", (e) => {
    if (!e.target.matches("#checkout-form")) return;
    e.preventDefault();
    const btn = drawer.querySelector("[data-place]");
    if (btn && !btn.disabled) placeOrder(btn);
  });

  async function placeOrder(btn) {
    const form = drawer.querySelector("#checkout-form");
    if (!form) return;
    if (hasBlockedItems()) { view = "list"; render(); return; }
    const err = drawer.querySelector("[data-order-error]");
    const data = Object.fromEntries(new FormData(form));
    const name = String(data.name || "").trim();
    const phone = String(data.phone || "").trim();
    const managerId = Number(data.manager_id);
    if (name.length < 2 || !/^[0-9+()\-\s]{5,25}$/.test(phone)) {
      if (err) { err.textContent = t("cart.invalid"); err.hidden = false; }
      form.reportValidity();
      return;
    }
    if (!Number.isInteger(managerId) || managerId < 1) {
      if (err) { err.textContent = t("cart.managerRequired"); err.hidden = false; }
      form.reportValidity();
      return;
    }
    if (err) err.hidden = true;
    btn.disabled = true; btn.style.opacity = ".6";
    try {
      const payload = {
        customer: data,
        manager_id: managerId,
        payment: { method: data.payment_method || "manager" },
        order_type: orderMode() === "retail" ? "retail" : "wholesale",
        items: items.map((i) => ({
          id: i.id,
          qty: i.qty,
          unit_type: orderMode() === "retail" ? "piece" : packOf(i),
          size: orderMode() === "retail" ? i.size : "",
        })),
        lang: window.I18N ? I18N.lang : "en",
        source: "website",
      };
      const serialized = JSON.stringify(payload);
      const idempotencyKey = await secureOrderKey(serialized);
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: serialized,
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(res.error || "error");
      lastOrder = res.number;
      lastPayment = res.payment || null;
      orderAttempt = null;
      try { sessionStorage.removeItem(ORDER_ATTEMPT_STORAGE); } catch { /* private mode */ }
      items = []; save();
      view = "success"; render();
    } catch (ex) {
      if (err) {
        err.textContent = orderErrorMessage(ex.message);
        err.hidden = false;
        err.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } finally { btn.disabled = false; btn.style.opacity = ""; }
  }

  function open() {
    view = "list";
    render();
    drawer.classList.add("is-open");
    document.body.style.overflow = "hidden";
    refreshItems().then(() => { if (drawer.classList.contains("is-open") && view === "list") render(); });
  }
  function close() { drawer.classList.remove("is-open"); document.body.style.overflow = ""; if (view === "success") view = "list"; }

  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-cart-open]");
    if (opener) { e.preventDefault(); open(); }
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  window.addEventListener("i18n:change", render);

  /* ---------------- badge + toast ---------------- */
  function updateBadges() {
    document.querySelectorAll("[data-cart-count]").forEach((b) => {
      b.textContent = count();
      b.classList.toggle("is-zero", count() === 0);
    });
  }

  let toastTimer;
  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 2200);
  }

  function add({
    id, slug, name, name_i18n, product_type, catalog_panel, category, image, price, retail_price, price_visible = true, price_label = "",
    sizes = [], size = "", qty = 1, pack = "qop", pack_pieces, retail_enabled, retail_stock,
    available_qop, in_stock, can_order_wholesale, can_order_retail, availability_wholesale,
    availability_retail,
  }) {
    qty = Math.max(1, Math.round(Number(qty) || 1));
    sizes = Array.isArray(sizes) ? sizes.slice(0, 12) : [];
    pack = pack === "pachka" ? "pachka" : "qop";
    size = String(size || "").trim();
    const next = {
      id, slug, name, name_i18n, product_type, catalog_panel, category, image, price, retail_price, price_visible: price_visible !== false,
      price_label, sizes, size, qty, pack, pack_pieces, retail_enabled, retail_stock, available_qop,
      in_stock, can_order_wholesale, can_order_retail, availability_wholesale, availability_retail,
      refresh_failed: false,
    };
    if (!canOrder(next) || maxOrderQty(next) < 1) { toast(t("prod.unavailable")); return false; }
    if (!hasValidRetailSize(next)) { toast(t("cart.size") + " *"); return false; }
    qty = Math.min(qty, maxOrderQty(next));
    /* пачка и мешок одного товара — отдельные строки */
    const same = items.find((i) => i.id === id && packOf(i) === pack
      && (orderMode() !== "retail" || String(i.size || "") === size));
    if (same) {
      Object.assign(same, next, { qty: Math.min(maxOrderQty(next), same.qty + qty) });
    } else {
      next.qty = qty;
      items.push(next);
    }
    save();
    toast(t("prod.added"));
    const btn = document.querySelector("[data-cart-open]");
    if (btn) { btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump"); }
    return true;
  }

  document.addEventListener("DOMContentLoaded", updateBadges);
  if (window.I18N) I18N.ready.then(updateBadges);
  window.addEventListener("milana:auth", () => {
    refreshItems().then(() => { if (drawer.classList.contains("is-open")) { view = "list"; render(); } });
  });

  window.Cart = { add, open, close, refresh: refreshItems, get items() { return items; }, count, total };
})();
