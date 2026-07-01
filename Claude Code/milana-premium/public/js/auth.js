/* ============================================================
   MILANA — customer auth
   Uses Firebase Auth when /api/auth/config exposes Firebase web config.
   Falls back to local email/password for development.
   ============================================================ */
(() => {
  "use strict";

  let me = null;
  let provider = "local";
  let firebaseAuth = null;
  let googleProvider = null;
  let orders = null;

  const t = (k) => window.I18N ? I18N.t(k) : k;
  const fmt = (n) => window.I18N ? I18N.fmtPrice(n) : "$" + Number(n || 0).toFixed(2);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const json = async (url, body) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "request_failed");
    return data;
  };

  async function initFirebase(config) {
    if (!config) return;
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const authMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const app = appMod.initializeApp(config);
    firebaseAuth = authMod.getAuth(app);
    googleProvider = new authMod.GoogleAuthProvider();
    window.__milanaFirebase = { authMod };
  }

  async function refresh() {
    try {
      const r = await fetch("/api/auth/me");
      me = (await r.json()).customer || null;
    } catch {
      me = null;
    }
    renderLinks();
    renderAccount();
    return me;
  }

  function renderLinks() {
    document.querySelectorAll("[data-auth-link]").forEach((el) => {
      if (me) {
        el.textContent = me.name || me.email || t("auth.account");
        el.setAttribute("href", "/account");
      } else {
        el.textContent = t("auth.signIn");
        el.setAttribute("href", "/signin");
      }
    });
  }

  function renderAccount() {
    const account = document.querySelector("[data-auth-account]");
    const page = document.querySelector("[data-auth-page]");
    if (!page || !account) return;
    page.classList.toggle("is-authenticated", Boolean(me));
    const forms = page.querySelectorAll(".auth-form, .auth-tabs");
    forms.forEach((el) => (el.hidden = Boolean(me)));
    page.querySelectorAll("[data-firebase-auth]").forEach((el) => {
      el.hidden = Boolean(me) || provider !== "firebase";
    });
    account.hidden = !me;
    if (!me) return;
    page.querySelector("[data-auth-name]").textContent = me.name || t("auth.customer");
    page.querySelector("[data-auth-email]").textContent = me.email || "";
    renderAccountDetails();
    loadOrders();
  }

  function renderAccountDetails() {
    if (!me) return;
    const profile = document.querySelector("[data-account-profile]");
    const orderCount = document.querySelector("[data-account-orders]");
    const wishCount = document.querySelector("[data-account-wishlist]");
    const orderList = document.querySelector("[data-account-orders-list]");
    const wishList = document.querySelector("[data-account-wishlist-list]");
    const wishlist = window.MilanaState?.wishlist?.all?.() || [];

    if (profile) {
      const rows = [
        [t("auth.name"), me.name || t("auth.customer")],
        [t("auth.phone"), me.phone || t("auth.missingPhone")],
        [t("cart.city"), me.city || t("auth.missingCity")],
        [t("cart.address"), me.address || t("auth.missingAddress")],
      ];
      profile.innerHTML = rows.map(([label, value]) => `<p><span>${esc(label)}</span><strong>${esc(value)}</strong></p>`).join("");
    }

    if (orderCount) orderCount.textContent = Array.isArray(orders) ? String(orders.length) : "0";
    if (wishCount) wishCount.textContent = String(wishlist.length);

    if (orderList) {
      if (orders === null) {
        orderList.innerHTML = `<div class="account-empty is-loading"><span></span><p>${esc(t("auth.loadingOrders"))}</p></div>`;
      } else if (!orders.length) {
        orderList.innerHTML = `<div class="account-empty"><p>${esc(t("auth.noOrders"))}</p><a href="/shop">${esc(t("auth.startOrder"))}</a></div>`;
      } else {
        orderList.innerHTML = orders.slice(0, 4).map((order) => {
          const first = order.items?.[0] || {};
          const extra = Math.max(0, (order.items?.length || 0) - 1);
          return `<a class="account-order" href="/support?topic=order">
            <span>${esc(order.number || "MP")}</span>
            <strong>${esc(first.name || t("cart.title"))}${extra ? ` +${extra}` : ""}</strong>
            <i>${esc(order.status || "new")} · ${fmt(order.total || 0)}</i>
          </a>`;
        }).join("");
      }
    }

    if (wishList) {
      if (!wishlist.length) {
        wishList.innerHTML = `<div class="account-empty"><p>${esc(t("auth.noWishlist"))}</p><a href="/shop">${esc(t("auth.findModels"))}</a></div>`;
      } else {
        wishList.innerHTML = wishlist.slice(0, 4).map((item) => `<a class="account-wish" href="/p/${esc(item.slug || item.id)}">
          <img src="${esc(item.image || "/assets/img/detail-stack.jpg")}" alt="">
          <span><strong>${esc(item.name || t("auth.savedModel"))}</strong><i>${fmt(item.price || 0)}</i></span>
          <button type="button" data-account-wish-remove="${esc(item.id)}" aria-label="Remove">×</button>
        </a>`).join("");
        window.MilanaState?.wireImages?.(wishList);
      }
    }
  }

  async function loadOrders() {
    if (!me || orders !== null) return;
    try {
      const r = await fetch("/api/auth/orders");
      if (!r.ok) throw new Error("orders");
      orders = (await r.json()).orders || [];
    } catch {
      orders = [];
    }
    renderAccountDetails();
  }

  function setMsg(formName, msg, bad = true) {
    const el = document.querySelector(`[data-auth-message="${formName}"]`);
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
    el.classList.toggle("is-good", !bad);
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form));
  }

  async function handleLocal(form, mode) {
    const data = formData(form);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email || ""))) throw new Error("email");
    if (String(data.password || "").length < 8) throw new Error("password");
    const res = await json(mode === "signup" ? "/api/auth/signup" : "/api/auth/signin", data);
    me = res.customer || null;
    renderLinks();
    renderAccount();
  }

  async function handleRecover(form) {
    const data = formData(form);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email || ""))) throw new Error("email");
    if (!/^[0-9+()\-\s]{5,25}$/.test(String(data.phone || ""))) throw new Error("phone");
    if (String(data.password || "").length < 8) throw new Error("password");
    const res = await json("/api/auth/recover", data);
    me = res.customer || null;
    renderLinks();
    renderAccount();
  }

  async function handleFirebase(form, mode) {
    if (!firebaseAuth || !window.__milanaFirebase) return handleLocal(form, mode);
    const data = formData(form);
    const { authMod } = window.__milanaFirebase;
    const cred = mode === "signup"
      ? await authMod.createUserWithEmailAndPassword(firebaseAuth, data.email, data.password)
      : await authMod.signInWithEmailAndPassword(firebaseAuth, data.email, data.password);
    if (mode === "signup" && data.name) await authMod.updateProfile(cred.user, { displayName: data.name });
    const idToken = await cred.user.getIdToken();
    const res = await json("/api/auth/firebase", {
      idToken,
      name: data.name || cred.user.displayName || "",
      phone: data.phone || "",
    });
    me = res.customer || null;
    renderLinks();
    renderAccount();
  }

  function wirePage() {
    const page = document.querySelector("[data-auth-page]");
    if (!page) return;
    const initialMode = location.pathname.includes("signup") ? "signup" : "signin";
    switchTab(initialMode);

    page.addEventListener("click", async (e) => {
      const tab = e.target.closest("[data-auth-tab]");
      if (tab) switchTab(tab.dataset.authTab);

      if (e.target.closest("[data-auth-recover-open]")) switchTab("recover");
      if (e.target.closest("[data-auth-back-signin]")) switchTab("signin");

      const logout = e.target.closest("[data-auth-logout]");
      if (logout) {
        await json("/api/auth/logout");
        if (firebaseAuth && window.__milanaFirebase) await window.__milanaFirebase.authMod.signOut(firebaseAuth).catch(() => {});
        me = null;
        orders = null;
        switchTab("signin");
        renderLinks();
        renderAccount();
      }

      const removeWish = e.target.closest("[data-account-wish-remove]");
      if (removeWish) {
        e.preventDefault();
        window.MilanaState?.wishlist?.remove(removeWish.dataset.accountWishRemove);
        renderAccountDetails();
      }

      const google = e.target.closest("[data-google-signin]");
      if (google && firebaseAuth && googleProvider && window.__milanaFirebase) {
        google.disabled = true;
        try {
          const { authMod } = window.__milanaFirebase;
          const cred = await authMod.signInWithPopup(firebaseAuth, googleProvider);
          const idToken = await cred.user.getIdToken();
          const res = await json("/api/auth/firebase", { idToken });
          me = res.customer || null;
          renderLinks();
          renderAccount();
        } catch (ex) {
          setMsg("signin", friendly(ex.message));
        } finally {
          google.disabled = false;
        }
      }
    });

    page.querySelectorAll("[data-auth-form]").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const mode = form.dataset.authForm;
        const btn = form.querySelector("button[type=submit]");
        setMsg(mode, "");
        btn.disabled = true;
        try {
          if (mode === "recover") await handleRecover(form);
          else if (provider === "firebase") await handleFirebase(form, mode);
          else await handleLocal(form, mode);
          setMsg(mode, t("auth.ready"), false);
        } catch (ex) {
          setMsg(mode, friendly(ex.message));
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function switchTab(mode) {
    document.querySelectorAll("[data-auth-message]").forEach((el) => {
      el.textContent = "";
      el.hidden = true;
      el.classList.remove("is-good");
    });
    document.querySelectorAll("[data-auth-tab]").forEach((b) => b.classList.toggle("is-on", b.dataset.authTab === mode));
    document.querySelectorAll("[data-auth-form]").forEach((f) => f.classList.toggle("is-on", f.dataset.authForm === mode));
  }

  function friendly(code) {
    const clean = String(code || "").replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/.*?\)\.?$/i, "");
    const map = {
      email: t("auth.errEmail"),
      password: t("auth.errPassword"),
      phone: t("auth.errPhone"),
      email_exists: t("auth.errExists"),
      wrong_credentials: t("auth.errWrong"),
      recovery_mismatch: t("auth.errRecover"),
    };
    return map[clean] || clean || t("auth.errGeneric");
  }

  async function boot() {
    const config = await fetch("/api/auth/config").then((r) => r.json()).catch(() => ({ provider: "local" }));
    provider = config.provider || "local";
    if (provider === "firebase") {
      await initFirebase(config.firebase).catch(() => { provider = "local"; });
      document.querySelectorAll("[data-firebase-auth]").forEach((el) => { el.hidden = false; });
    }
    wirePage();
    await refresh();
  }

  document.addEventListener("DOMContentLoaded", boot);
  window.addEventListener("i18n:change", () => { renderLinks(); renderAccount(); });
  window.addEventListener("milana:wishlist", renderAccountDetails);
  window.MilanaAuth = { refresh, get customer() { return me; } };
})();
