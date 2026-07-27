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
  let appleProvider = null;
  let appleEnabled = false;
  let orders = null;

  const t = (k, v) => window.I18N ? I18N.t(k, v) : k;
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
    appleProvider = new authMod.OAuthProvider("apple.com");
    appleProvider.addScope("email");
    appleProvider.addScope("name");
    window.__milanaFirebase = { authMod };
  }

  async function refresh() {
    try {
      const r = await fetch("/api/auth/me");
      me = (await r.json()).customer || null;
    } catch {
      me = null;
    }
    if (me && window.MilanaState?.wishlist?.setAll) {
      fetch("/api/auth/likes")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data?.likes) window.MilanaState.wishlist.setAll(data.likes); })
        .catch(() => {});
    }
    renderLinks();
    renderAccount();
    window.dispatchEvent(new CustomEvent("milana:auth", { detail: { customer: me } }));
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
    const shell = page.closest(".auth2");
    if (shell) shell.classList.toggle("is-authenticated", Boolean(me));
    const forms = page.querySelectorAll(".auth-form, .auth-tabs");
    forms.forEach((el) => (el.hidden = Boolean(me)));
    page.querySelectorAll("[data-firebase-auth]").forEach((el) => {
      el.hidden = Boolean(me) || provider !== "firebase";
    });
    page.querySelectorAll("[data-apple-signin]").forEach((el) => {
      el.hidden = Boolean(me) || provider !== "firebase" || !appleEnabled;
    });
    account.hidden = !me;
    if (!me) return;
    page.querySelector("[data-auth-name]").textContent = me.name || t("auth.customer");
    page.querySelector("[data-auth-email]").textContent = me.email || "";
    const initial = page.querySelector("[data-account-initial]");
    if (initial) initial.textContent = String(me.name || me.email || "M").trim().charAt(0).toUpperCase() || "M";
    renderAccountDetails();
    loadOrders();
  }

  /* поля профиля — расширяются для бизнес-аккаунтов */
  function profileFields() {
    const base = [
      { key: "name", label: t("auth.name"), missing: t("auth.customer"), required: true, max: 80 },
      { key: "phone", label: t("auth.phone"), missing: t("auth.missingPhone"), type: "tel", ph: "+998 90 123 45 67", max: 25 },
      { key: "city", label: t("cart.city"), missing: t("auth.missingCity"), max: 80 },
      { key: "address", label: t("cart.address"), missing: t("auth.missingAddress"), max: 300 },
    ];
    if (me && me.account_type === "business") base.push(
      { key: "company_name", label: t("auth.company"), missing: t("auth.missingGeneric"), max: 120 },
      { key: "tax_id", label: t("auth.taxId"), missing: t("auth.missingGeneric"), max: 40 },
      { key: "contact_person", label: t("auth.contactPerson"), missing: t("auth.missingGeneric"), max: 80 },
    );
    return base;
  }

  function renderProfileView() {
    const profile = document.querySelector("[data-account-profile]");
    if (!profile || !me) return;
    profile.innerHTML = profileFields().map((f) => {
      const val = me[f.key];
      const has = Boolean(String(val ?? "").trim());
      const verified = f.key === "phone" && has && me.phone_verified ? ` <em class="account-profile__ok" title="${esc(t("auth.verified"))}">✓</em>` : "";
      return `<p><span>${esc(f.label)}</span><strong${has ? "" : ' class="is-empty"'}>${esc(has ? val : f.missing)}${verified}</strong></p>`;
    }).join("");
    const edit = document.querySelector("[data-profile-edit]"); if (edit) edit.hidden = false;
    const meta = document.querySelector("[data-account-progress-label]"); if (meta) meta.hidden = false;
  }

  function editProfile() {
    const profile = document.querySelector("[data-account-profile]");
    if (!profile || !me) return;
    profile.innerHTML = `<form class="account-form" data-account-form novalidate>
      ${profileFields().map((f) => `<label><span>${esc(f.label)}</span><input name="${f.key}" value="${esc(me[f.key] || "")}"${f.required ? " required" : ""}${f.type ? ` type="${f.type}"` : ""}${f.ph ? ` placeholder="${esc(f.ph)}"` : ""} maxlength="${f.max || 120}" autocomplete="off"></label>`).join("")}
      <p class="account-form__msg" data-account-form-msg hidden></p>
      <div class="account-form__actions">
        <button type="submit" class="btn btn--primary">${esc(t("auth.save"))}</button>
        <button type="button" class="account-form__cancel" data-profile-cancel>${esc(t("auth.cancel"))}</button>
      </div>
    </form>`;
    const edit = document.querySelector("[data-profile-edit]"); if (edit) edit.hidden = true;
    const meta = document.querySelector("[data-account-progress-label]"); if (meta) meta.hidden = true;
    profile.querySelector("input")?.focus();
  }

  async function saveProfile(form) {
    const data = Object.fromEntries(new FormData(form));
    const msg = form.querySelector("[data-account-form-msg]");
    const btn = form.querySelector("button[type=submit]");
    const setM = (text, bad = true) => { if (msg) { msg.textContent = text; msg.hidden = !text; msg.classList.toggle("is-good", !bad); } };
    setM("");
    if (String(data.name || "").trim().length < 2) return setM(friendly("name"));
    if (data.phone && !/^[0-9+()\-\s]{5,25}$/.test(String(data.phone).trim())) return setM(friendly("phone"));
    btn.disabled = true;
    try {
      const r = await fetch("/api/auth/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || "request_failed");
      me = out.customer || me;
      renderProfileView();     // выйти из режима редактирования (форму убрать)
      renderAccountDetails();  // обновить прогресс, бейджи, счётчики
      flashSaved();
      window.dispatchEvent(new CustomEvent("milana:auth", { detail: { customer: me } }));
    } catch (ex) {
      setM(friendly(ex.message));
      btn.disabled = false;
    }
  }

  function flashSaved() {
    const host = document.querySelector(".account");
    if (!host) return;
    let el = host.querySelector(".account-toast");
    if (!el) { el = document.createElement("div"); el.className = "account-toast"; host.appendChild(el); }
    el.textContent = t("auth.profileSaved");
    el.classList.add("is-on");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("is-on"), 2600);
  }

  function renderAccountDetails() {
    if (!me) return;
    const profile = document.querySelector("[data-account-profile]");
    const orderCount = document.querySelector("[data-account-orders]");
    const wishCount = document.querySelector("[data-account-wishlist]");
    const orderList = document.querySelector("[data-account-orders-list]");
    const wishList = document.querySelector("[data-account-wishlist-list]");
    const wishlist = window.MilanaState?.wishlist?.all?.() || [];

    // не перерисовываем, если пользователь сейчас редактирует
    if (profile && !profile.querySelector("[data-account-form]")) renderProfileView();

    // бейджи: тип аккаунта + статус
    const badges = document.querySelector("[data-account-badges]");
    if (badges) {
      const typeLabel = me.account_type === "individual" ? t("auth.individual") : t("auth.business");
      const status = me.approval_status || "active";
      let statusLabel = t("auth.status." + status);
      if (statusLabel === "auth.status." + status) statusLabel = status.replace(/_/g, " ");
      const statusMod = status === "active" ? "is-ok" : "is-wait";
      badges.innerHTML =
        `<span class="account-badge">${esc(typeLabel)}</span>` +
        `<span class="account-badge ${statusMod}">${esc(statusLabel)}</span>`;
    }

    // индикатор заполненности профиля (по всем полям — зависит от типа аккаунта)
    const flds = profileFields();
    const filled = flds.filter((f) => String(me[f.key] ?? "").trim()).length;
    const pct = Math.round((filled / flds.length) * 100);
    const bar = document.querySelector("[data-account-progress]");
    const barLabel = document.querySelector("[data-account-progress-label]");
    if (bar) {
      bar.hidden = false;
      const fill = bar.querySelector("i");
      if (fill) fill.style.width = pct + "%";
      bar.classList.toggle("is-complete", pct === 100);
    }
    if (barLabel) barLabel.textContent = t("auth.profileComplete", { pct });

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
            <strong>${esc(first.name ? I18N.productName(first) : t("cart.title"))}${extra ? ` +${extra}` : ""}</strong>
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
          <span><strong>${esc(item.name ? I18N.productName(item) : t("auth.savedModel"))}</strong><i>${item.price_visible === false ? t("price.manager") : fmt(item.price || 0)}</i></span>
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

  function startCodeCooldown(button, seconds = 30) {
    if (!button) return;
    button.dataset.originalLabel ||= button.textContent;
    let left = seconds;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    const tick = () => {
      if (left <= 0) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = button.dataset.originalLabel || t("auth.sendCode");
        return;
      }
      button.textContent = t("auth.resendIn", { seconds: left });
      left -= 1;
      setTimeout(tick, 1000);
    };
    tick();
  }

  async function handleLocal(form, mode) {
    const data = formData(form);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email || ""))) throw new Error("email");
    if (String(data.password || "").length < 8) throw new Error("password");
    if (mode === "signup") {
      if (!["business", "individual"].includes(data.account_type)) throw new Error("account_type");
      if (!data.terms) throw new Error("terms");
      if (!/^[0-9+()\-\s]{5,25}$/.test(String(data.phone || ""))) throw new Error("phone");
      if (!/^\d{6}$/.test(String(data.email_code || ""))) throw new Error("otp");
      if (String(data.name || "").trim().length < 2) throw new Error("name");
      await json("/api/auth/email-otp/verify", { email: data.email, code: data.email_code });
    }
    const res = await json(mode === "signup" ? "/api/auth/signup" : "/api/auth/signin", data);
    me = res.customer || null;
    renderLinks();
    renderAccount();
    window.dispatchEvent(new CustomEvent("milana:auth", { detail: { customer: me } }));
  }

  async function handleRecover(form) {
    const data = formData(form);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email || ""))) throw new Error("email");
    if (!/^\d{6}$/.test(String(data.email_code || ""))) throw new Error("otp");
    if (String(data.password || "").length < 8) throw new Error("password");
    await json("/api/auth/email-otp/verify", { email: data.email, code: data.email_code });
    const res = await json("/api/auth/recover", data);
    me = res.customer || null;
    renderLinks();
    renderAccount();
    window.dispatchEvent(new CustomEvent("milana:auth", { detail: { customer: me } }));
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
    window.dispatchEvent(new CustomEvent("milana:auth", { detail: { customer: me } }));
  }

  function socialDisplayName(cred, authMod) {
    const profile = authMod.getAdditionalUserInfo?.(cred)?.profile || {};
    const profileName = profile.name;
    if (typeof profileName === "string") return profileName.trim();
    if (profileName && typeof profileName === "object") {
      return [profileName.firstName, profileName.lastName].filter(Boolean).join(" ").trim();
    }
    return [
      profile.firstName || profile.first_name || profile.given_name,
      profile.lastName || profile.last_name || profile.family_name,
    ].filter(Boolean).join(" ").trim() || cred.user.displayName || "";
  }

  async function handleSocialSignIn(button, oauthProvider) {
    if (!button || !firebaseAuth || !oauthProvider || !window.__milanaFirebase) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      const { authMod } = window.__milanaFirebase;
      const cred = await authMod.signInWithPopup(firebaseAuth, oauthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await json("/api/auth/firebase", {
        idToken,
        name: socialDisplayName(cred, authMod),
      });
      me = res.customer || null;
      renderLinks();
      renderAccount();
      window.dispatchEvent(new CustomEvent("milana:auth", { detail: { customer: me } }));
    } catch (ex) {
      setMsg("signin", friendly(ex.code || ex.message));
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  function wirePage() {
    const page = document.querySelector("[data-auth-page]");
    if (!page) return;
    const requestedMode = new URLSearchParams(location.search).get("mode") || location.hash.replace("#", "");
    const initialMode = location.pathname.includes("signup")
      ? "signup"
      : ["signin", "signup", "recover"].includes(requestedMode)
        ? requestedMode
        : "signin";
    switchTab(initialMode);

    page.addEventListener("click", async (e) => {
      const tab = e.target.closest("[data-auth-tab]");
      if (tab) switchTab(tab.dataset.authTab);

      if (e.target.closest("[data-auth-recover-open]")) switchTab("recover");
      if (e.target.closest("[data-auth-back-signin]")) switchTab("signin");

      const otp = e.target.closest("[data-auth-otp-send]");
      if (otp) {
        const form = otp.closest("form");
        const data = formData(form);
        try {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email || ""))) throw new Error("email");
          startCodeCooldown(otp);
          const res = await json("/api/auth/email-otp/start", { email: data.email, lang: I18N.lang });
          setMsg("signup", res.dev_code ? I18N.t("auth.localEmailCode", { code: res.dev_code }) : I18N.t("auth.emailCodeSent"), false);
        } catch (ex) {
          setMsg("signup", friendly(ex.message));
        }
      }

      const emailOtp = e.target.closest("[data-auth-email-otp-send]");
      if (emailOtp) {
        const form = emailOtp.closest("form");
        const data = formData(form);
        try {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email || ""))) throw new Error("email");
          startCodeCooldown(emailOtp);
          const res = await json("/api/auth/email-otp/start", { email: data.email, lang: I18N.lang });
          setMsg("recover", res.dev_code ? I18N.t("auth.localEmailCode", { code: res.dev_code }) : I18N.t("auth.emailCodeSent"), false);
        } catch (ex) {
          setMsg("recover", friendly(ex.message));
        }
      }

      const logout = e.target.closest("[data-auth-logout]");
      if (logout) {
        await json("/api/auth/logout");
        if (firebaseAuth && window.__milanaFirebase) await window.__milanaFirebase.authMod.signOut(firebaseAuth).catch(() => {});
        me = null;
        orders = null;
        switchTab("signin");
        renderLinks();
        renderAccount();
        window.dispatchEvent(new CustomEvent("milana:auth", { detail: { customer: me } }));
      }

      const removeWish = e.target.closest("[data-account-wish-remove]");
      if (removeWish) {
        e.preventDefault();
        window.MilanaState?.wishlist?.remove(removeWish.dataset.accountWishRemove);
        renderAccountDetails();
      }

      if (e.target.closest("[data-profile-edit]")) { editProfile(); return; }
      if (e.target.closest("[data-profile-cancel]")) { renderProfileView(); return; }

      const google = e.target.closest("[data-google-signin]");
      if (google) await handleSocialSignIn(google, googleProvider);

      const apple = e.target.closest("[data-apple-signin]");
      if (apple) await handleSocialSignIn(apple, appleProvider);
    });

    /* сохранение профиля (форма создаётся динамически) */
    page.addEventListener("submit", (e) => {
      const pform = e.target.closest("[data-account-form]");
      if (!pform) return;
      e.preventDefault();
      saveProfile(pform);
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
    if (!["signin", "signup", "recover"].includes(mode)) mode = "signin";
    const pageModeCopy = {
      signin: { title: "auth.title", lead: "auth.lead" },
      signup: { title: "auth.signupTitle", lead: "auth.signupLead" },
      recover: { title: "auth.recoverTitle", lead: "auth.recoverLead" },
    };
    document.querySelectorAll("[data-auth-message]").forEach((el) => {
      el.textContent = "";
      el.hidden = true;
      el.classList.remove("is-good");
    });
    document.querySelectorAll("[data-auth-page]").forEach((page) => {
      page.classList.toggle("is-recovering", mode === "recover");
    });
    document.querySelectorAll("[data-auth-tab]").forEach((b) => b.classList.toggle("is-on", b.dataset.authTab === mode));
    document.querySelectorAll("[data-auth-form]").forEach((f) => f.classList.toggle("is-on", f.dataset.authForm === mode));
    document.querySelectorAll("[data-auth-title]").forEach((el) => {
      el.dataset.i18n = pageModeCopy[mode].title;
      el.textContent = t(pageModeCopy[mode].title);
    });
    document.querySelectorAll("[data-auth-lead]").forEach((el) => {
      el.dataset.i18n = pageModeCopy[mode].lead;
      el.textContent = t(pageModeCopy[mode].lead);
    });
    const next = mode === "signin" ? "/signin" : `/signin?mode=${encodeURIComponent(mode)}`;
    if (location.pathname === "/signin" && location.search !== (mode === "signin" ? "" : `?mode=${mode}`)) {
      history.replaceState(null, "", next);
    }
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
      account_type: t("auth.errAccountType"),
      terms: t("auth.errTerms"),
      otp: t("auth.errOtp"),
      otp_wrong: t("auth.errOtpWrong"),
      otp_expired: t("auth.errOtpExpired"),
      sms_not_configured: t("auth.errSmsConfig"),
      sms_failed: t("auth.errSmsFailed"),
      email_not_configured: t("auth.errEmailConfig"),
      email_failed: t("auth.errEmailSend"),
      email_not_verified: t("auth.errEmailVerify"),
      rate_limited: t("auth.errRateLimited"),
      phone_not_verified: t("auth.errPhoneVerify"),
      name: t("auth.errName"),
      "auth/popup-closed-by-user": t("auth.errPopupClosed"),
      "auth/cancelled-popup-request": t("auth.errPopupClosed"),
      "auth/account-exists-with-different-credential": t("auth.errProviderConflict"),
      "auth/operation-not-allowed": t("auth.errProviderDisabled"),
    };
    return map[clean] || clean || t("auth.errGeneric");
  }

  async function boot() {
    const config = await fetch("/api/auth/config").then((r) => r.json()).catch(() => ({ provider: "local" }));
    provider = config.provider || "local";
    appleEnabled = config.appleEnabled === true;
    if (provider === "firebase") {
      document.querySelectorAll("[data-firebase-auth]").forEach((el) => { el.hidden = false; });
      await initFirebase(config.firebase).catch(() => { provider = "local"; });
    }
    document.querySelectorAll("[data-apple-signin]").forEach((el) => {
      el.hidden = provider !== "firebase" || !appleEnabled;
    });
    wirePage();
    await refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  window.addEventListener("i18n:change", () => { renderLinks(); renderAccount(); });
  window.addEventListener("milana:wishlist", renderAccountDetails);
  window.MilanaAuth = { refresh, get customer() { return me; } };
})();
