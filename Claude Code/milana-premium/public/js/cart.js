/* ============================================================
   MILANA — cart store + slide-in drawer + checkout
   Requires i18n.js first. window.Cart = { add, open, ... }
   ============================================================ */
(() => {
  "use strict";

  const KEY = "ml-cart";
  const BAG_SIZE = () => (window.I18N && I18N.BAG_SIZE) || 60;
  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
  if (!Array.isArray(items)) items = [];

  const orderMode = () => window.MilanaAuth?.customer?.account_type === "individual" ? "retail" : "wholesale";
  const save = () => { localStorage.setItem(KEY, JSON.stringify(items)); updateBadges(); };
  const count = () => items.reduce((s, i) => s + i.qty, 0);
  const unitPrice = (i) => orderMode() === "retail" ? Number(i.retail_price || i.price || 0) : Number(i.price || 0);
  const lineTotal = (i) => unitPrice(i) * (orderMode() === "retail" ? 1 : BAG_SIZE()) * i.qty;
  const total = () => items.reduce((s, i) => s + lineTotal(i), 0);
  const t = (k, v) => window.I18N ? I18N.t(k, v) : k;
  const fmt = (n) => window.I18N ? I18N.fmtPrice(n) : "$" + n;
  const mix = (sizes = []) => sizes.slice(0, 6).filter(Boolean);
  const mixText = (sizes = []) => {
    const list = mix(sizes);
    return list.length ? list.map((s) => esc(s) + " × 10").join(", ") : t("cart.defaultMix");
  };

  /* ---------------- drawer skeleton ---------------- */
  const drawer = document.createElement("div");
  drawer.className = "drawer";
  drawer.innerHTML = `
    <div class="drawer__veil" data-cart-close></div>
    <aside class="drawer__panel" role="dialog" aria-modal="true" aria-label="Cart">
      <header class="drawer__head">
        <h3 class="drawer__title"></h3>
        <button class="drawer__x" data-cart-close aria-label="Close">&#10005;</button>
      </header>
      <div class="drawer__body"></div>
      <footer class="drawer__foot"></footer>
    </aside>`;
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(drawer));

  let view = "list"; // list | checkout | success
  let lastOrder = null;
  let lastPayment = null;

  const bodyEl = () => drawer.querySelector(".drawer__body");
  const footEl = () => drawer.querySelector(".drawer__foot");

  function render() {
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
        <form class="drawer__form" id="checkout-form" novalidate>
          <label><span>${t("cart.name")} *</span><input name="name" required maxlength="80" autocomplete="name" value="${esc(customer.name || "")}"></label>
          <label><span>${t("cart.phone")} *</span><input name="phone" required maxlength="25" autocomplete="tel" placeholder="+998 90 123 45 67" value="${esc(customer.phone || "")}"></label>
          <label><span>${t("cart.city")}</span><input name="city" maxlength="80" autocomplete="address-level2"></label>
          <label><span>${t("cart.address")}</span><input name="address" maxlength="300" autocomplete="street-address"></label>
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
          <p class="drawer__note">${mode === "retail" ? "Retail order: quantities are pieces. Manager confirms delivery and availability before dispatch." : t("cart.bagRule")}</p>
          <p class="drawer__note">${t("cart.paymentNote")}</p>
          <p class="drawer__note"><a href="/ordering" target="_blank">How ordering works</a> · ${t("cart.orderNote")}</p>
          <p class="drawer__err" hidden></p>
        </form>`;
      footEl().innerHTML = `
        <div class="drawer__total"><span>${t("cart.total")}</span><strong>${fmt(total())}</strong></div>
        <button class="btn btn--primary drawer__cta" data-place><span>${t("cart.place")}</span><svg class="ic"><use href="#i-arrow"/></svg></button>
        <button class="drawer__backlink" data-back>&larr; ${t("cart.back")}</button>`;
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
          <a class="citem__name" href="/p/${it.slug}">${esc(it.name)}</a>
          <p class="citem__size">${t("cart.unitPrice")}: ${fmt(unitPrice(it))}</p>
          ${mode === "retail" ? `<p class="citem__size">Retail pieces</p>` : `<p class="citem__size">${t("cart.sizeMix")}: ${mixText(it.sizes)}</p><p class="citem__size">${t("cart.bagTotal")}: ${fmt(it.price * BAG_SIZE())}</p>`}
          <div class="citem__row">
            <div class="citem__qty">
              <button data-qty="${idx}:-1" aria-label="−">−</button><span>${it.qty} ${mode === "retail" ? "pcs" : t("cart.bagShort")}</span><button data-qty="${idx}:1" aria-label="+">+</button>
            </div>
            <strong>${fmt(lineTotal(it))}</strong>
          </div>
        </div>
        <button class="citem__x" data-del="${idx}" aria-label="Remove">&#10005;</button>
      </div>`).join("");
    footEl().innerHTML = `
      <div class="drawer__total"><span>${t("cart.total")}</span><strong>${fmt(total())}</strong></div>
      <button class="btn btn--primary drawer__cta" data-checkout><span>${t("cart.checkout")}</span><svg class="ic"><use href="#i-arrow"/></svg></button>`;
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
      items[idx].qty = Math.min(20, Math.max(1, items[idx].qty + d));
      save(); render(); return;
    }
    if (e.target.closest("[data-checkout]")) { view = "checkout"; render(); return; }
    if (e.target.closest("[data-back]")) { view = "list"; render(); return; }
    if (e.target.closest("[data-place]")) return placeOrder(e.target.closest("[data-place]"));
  });

  async function placeOrder(btn) {
    const form = drawer.querySelector("#checkout-form");
    const err = form.querySelector(".drawer__err");
    const data = Object.fromEntries(new FormData(form));
    if (data.name.trim().length < 2 || !/^[0-9+()\-\s]{5,25}$/.test(data.phone.trim())) {
      err.textContent = t("cart.invalid"); err.hidden = false; return;
    }
    err.hidden = true;
    btn.disabled = true; btn.style.opacity = ".6";
    try {
      const r = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: data,
          payment: { method: data.payment_method || "manager" },
          order_type: orderMode() === "retail" ? "retail" : "wholesale",
          items: items.map((i) => ({ id: i.id, qty: i.qty })),
          lang: window.I18N ? I18N.lang : "en",
          source: "website",
        }),
      });
      const res = await r.json();
      if (!r.ok) throw new Error(res.error || "error");
      lastOrder = res.number;
      lastPayment = res.payment || null;
      items = []; save();
      view = "success"; render();
    } catch (ex) {
      err.textContent = t("cart.invalid") + " (" + ex.message + ")"; err.hidden = false;
    } finally { btn.disabled = false; btn.style.opacity = ""; }
  }

  function open() { view = items.length ? "list" : "list"; render(); drawer.classList.add("is-open"); document.body.style.overflow = "hidden"; }
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

  function add({ id, slug, name, image, price, retail_price, sizes = [], qty = 1 }) {
    qty = Math.max(1, Math.round(Number(qty) || 1));
    sizes = Array.isArray(sizes) ? sizes.slice(0, 12) : [];
    const same = items.find((i) => i.id === id);
    if (same) same.qty = Math.min(20, same.qty + qty);
    else items.push({ id, slug, name, image, price, retail_price, sizes, qty });
    save();
    toast(t("prod.added"));
    const btn = document.querySelector("[data-cart-open]");
    if (btn) { btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump"); }
  }

  document.addEventListener("DOMContentLoaded", updateBadges);
  if (window.I18N) I18N.ready.then(updateBadges);

  window.Cart = { add, open, close, get items() { return items; }, count, total };
})();
