/* ============================================================
   MILANA — admin panel SPA (vanilla, zero deps)
   ============================================================ */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const GENDER_RU = { women: "Женский", men: "Мужской", kids: "Детский", unisex: "Унисекс" };
  const CLO_RU = { pajamas: "Пижамы", robes: "Халаты", homewear: "Домашняя одежда", loungewear: "Лаунж-сеты" };
  const TAG_RU = { bestseller: "Бестселлер", new: "Новинка", sale: "Скидка" };
  const STATUS_RU = { new: "🆕 Новый", processing: "⏳ В работе", shipped: "🚚 Отправлен", done: "✅ Выполнен", cancelled: "✖ Отменён" };
  const PAYMENT_METHOD_RU = { manager: "Менеджер", cash: "Наличные", bank: "Банк", click: "Click", payme: "Payme", card: "Карта" };
  const PAYMENT_STATUS_RU = { pending: "⏳ Ожидает", invoice_sent: "📨 Счёт отправлен", paid: "✅ Оплачено", failed: "⚠ Ошибка", refunded: "↩ Возврат", cancelled: "✖ Отменено" };
  const SUPPORT_STATUS_RU = { new: "🆕 Новый", open: "👀 Открыт", waiting: "⏳ Ждём", done: "✅ Решён", closed: "✖ Закрыт" };
  const SUPPORT_TOPIC_RU = { general: "Общий", catalog: "Каталог", price: "Цена", delivery: "Доставка", defect: "Брак", payment: "Оплата", order: "Заказ" };

  let products = [];
  let orders = [];
  let support = [];
  let editing = null;     // product being edited (null = new)
  let editImages = [];    // image urls of the edit form

  /* ---------------- api ---------------- */
  async function api(path, opts = {}) {
    const r = await fetch(path, {
      headers: opts.body && !(opts.body instanceof ArrayBuffer) ? { "Content-Type": "application/json" } : {},
      ...opts,
      body: opts.body && !(opts.body instanceof ArrayBuffer) ? JSON.stringify(opts.body) : opts.body,
    });
    if (r.status === 401) { location.replace("/admin"); throw new Error("unauthorized"); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.status);
    return data;
  }

  function toast(msg) {
    const el = $("#atoast");
    el.textContent = msg;
    el.classList.add("is-on");
    setTimeout(() => el.classList.remove("is-on"), 2200);
  }

  /* ---------------- auth ---------------- */
  async function showApp() {
    await Promise.all([loadProducts(), loadOrders(), loadSupport()]);
  }

  $("#logout").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    location.replace("/admin");
  });

  /* ---------------- view switching ---------------- */
  document.querySelectorAll(".side__nav button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".side__nav button").forEach((x) => x.classList.toggle("is-on", x === b));
      switchView(b.dataset.view);
    });
  });
  function switchView(name) {
    ["products", "edit", "orders", "support", "settings", "design"].forEach((v) => { $("#view-" + v).hidden = v !== name; });
    if (name === "orders") loadOrders();
    if (name === "support") loadSupport();
    if (name === "settings") loadSettings();
    if (name === "design") loadDesign();
  }

  /* ================= PRODUCTS ================= */
  async function loadProducts() {
    products = await api("/api/admin/products");
    renderProducts();
  }

  function renderProducts() {
    const q = ($("#prod-search").value || "").toLowerCase();
    const list = products.filter((p) => !q
      || p.name.toLowerCase().includes(q) || p.slug.includes(q)
      || (p.model_no || "").toLowerCase().includes(q) || (p.variant || "").toLowerCase().includes(q));
    $("#prod-count").textContent = "· " + list.length;
    $("#prod-table tbody").innerHTML = list.map((p) => `
      <tr data-id="${p.id}">
        <td class="pmodel">${esc(p.model_no || "—")}</td>
        <td>${esc(p.variant || "—")}</td>
        <td><span class="pname"><img class="pthumb" src="${esc(p.images[0] || "")}" alt="">${esc(p.name)}<small>/p/${esc(p.slug)}</small></span></td>
        <td class="psizes">${p.sizes.join(", ") || "—"}</td>
        <td>${GENDER_RU[p.gender] || "—"}</td>
        <td>${CLO_RU[p.category] || p.category}</td>
        <td>${p.tag ? `<span class="ptag ptag--${p.tag}">${TAG_RU[p.tag] || p.tag}</span>` : "—"}</td>
        <td class="pprice"><b>${p.price}</b>${p.old_price ? ` <s>${p.old_price}</s>` : ""}</td>
        <td><span class="pstatus"><button class="tgl ${p.active ? "is-on" : ""}" data-act="toggle" title="Показать/скрыть"></button><i>${p.active ? "Активен" : "Скрыт"}</i></span></td>
        <td><div class="rowact">
          <button data-act="edit" title="Изменить">✏️</button>
          <button data-act="del" class="del" title="Удалить">🗑</button>
        </div></td>
      </tr>`).join("");
  }

  $("#prod-search").addEventListener("input", renderProducts);

  $("#prod-table").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = Number(btn.closest("tr").dataset.id);
    const p = products.find((x) => x.id === id);
    if (btn.dataset.act === "edit") return openEdit(p);
    if (btn.dataset.act === "toggle") {
      try {
        await api("/api/admin/products/" + id, { method: "PUT", body: { ...p, active: !p.active } });
        p.active = !p.active;
        btn.classList.toggle("is-on", p.active);
        const lbl = btn.parentElement.querySelector("i");
        if (lbl) lbl.textContent = p.active ? "Активен" : "Скрыт";
        toast(p.active ? "Товар показан на сайте" : "Товар скрыт");
      } catch (ex) { toast("Ошибка: " + ex.message); }
    }
    if (btn.dataset.act === "del") {
      if (!confirm(`Удалить «${p.name}»? Это действие необратимо.`)) return;
      try {
        await api("/api/admin/products/" + id, { method: "DELETE" });
        products = products.filter((x) => x.id !== id);
        renderProducts();
        toast("Товар удалён");
      } catch (ex) { toast("Ошибка: " + ex.message); }
    }
  });

  /* ---------------- edit form ---------------- */
  $("#prod-new").addEventListener("click", () => openEdit(null));
  $("#edit-cancel").addEventListener("click", () => switchView("products"));

  function openEdit(p) {
    editing = p;
    editImages = p ? [...p.images] : [];
    $("#edit-title").textContent = p ? "Изменить: " + p.name : "Новый товар";
    $("#edit-err").hidden = true;
    $("#f-name").value = p?.name || "";
    $("#f-slug").value = p?.slug || "";
    $("#f-model").value = p?.model_no || "";
    $("#f-variant").value = p?.variant || "";
    $("#f-gender").value = p?.gender || "women";
    $("#f-cat").value = p?.category || "pajamas";
    $("#f-price").value = p?.price ?? "";
    $("#f-old").value = p?.old_price ?? "";
    $("#f-tag").value = p?.tag || "";
    $("#f-sizes").value = (p?.sizes || []).join(", ");
    $("#f-rating").value = p?.rating ?? 4.8;
    $("#f-reviews").value = p?.reviews ?? 0;
    $("#f-active").checked = p ? !!p.active : true;
    ["ru", "uz", "en"].forEach((l) => {
      $("#f-desc-" + l).value = p?.desc?.[l] || "";
      $("#f-fab-" + l).value = p?.fabric?.[l] || "";
    });
    renderPhotos();
    $("#upload-status").textContent = "";
    switchView("edit");
  }

  function renderPhotos() {
    $("#f-photos").innerHTML = editImages.map((u, i) => {
      const vid = /\.(mp4|webm)(\?|$)/i.test(u);
      const media = vid
        ? `<video src="${esc(u)}" muted playsinline preload="metadata"></video><span class="photo__vid">▶ видео</span>`
        : `<img src="${esc(u)}" alt="">`;
      return `
      <div class="photo${vid ? " photo--vid" : ""}">
        ${i === 0 ? '<span class="photo__main">Обложка</span>' : ""}
        ${media}
        <div class="photo__act">
          <button data-ph="left:${i}" title="Влево">←</button>
          <button data-ph="right:${i}" title="Вправо">→</button>
          <button data-ph="del:${i}" title="Удалить">✕</button>
        </div>
      </div>`;
    }).join("");
  }

  $("#f-photos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ph]");
    if (!b) return;
    const [act, iStr] = b.dataset.ph.split(":");
    const i = Number(iStr);
    if (act === "del") editImages.splice(i, 1);
    if (act === "left" && i > 0) [editImages[i - 1], editImages[i]] = [editImages[i], editImages[i - 1]];
    if (act === "right" && i < editImages.length - 1) [editImages[i + 1], editImages[i]] = [editImages[i], editImages[i + 1]];
    renderPhotos();
  });

  $("#f-upload").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    const status = $("#upload-status");
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isVid = /^video\//.test(f.type) || /\.(mp4|webm)$/i.test(f.name);
      const cap = isVid ? 64 : 8;
      if (f.size > cap * 1024 * 1024) { status.textContent = `«${f.name}» больше ${cap} МБ — пропущен.`; continue; }
      status.textContent = `Загрузка ${i + 1} из ${files.length}… ${isVid ? "(видео может занять время)" : ""}`;
      try {
        const buf = await f.arrayBuffer();
        const res = await api("/api/admin/upload", { method: "POST", body: buf });
        editImages.push(res.url);
        renderPhotos();
      } catch (ex) {
        const msg = ex.message === "image_too_large" ? "фото больше 8 МБ"
          : ex.message === "format_not_allowed" ? "формат не поддерживается (нужно JPG/PNG/WebP/MP4/WebM)"
          : ex.message;
        status.textContent = `Ошибка загрузки «${f.name}»: ${msg}`;
        return;
      }
    }
    status.textContent = "Готово ✓";
    setTimeout(() => (status.textContent = ""), 2000);
  });

  /* language tabs for description */
  $("#desc-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lt]");
    if (!b) return;
    document.querySelectorAll("#desc-tabs button").forEach((x) => x.classList.toggle("is-on", x === b));
    ["ru", "uz", "en"].forEach((l) => { $("#f-desc-" + l).hidden = l !== b.dataset.lt; });
  });

  $("#edit-save").addEventListener("click", async () => {
    const err = $("#edit-err");
    err.hidden = true;
    const body = {
      name: $("#f-name").value,
      slug: $("#f-slug").value,
      model_no: $("#f-model").value,
      variant: $("#f-variant").value,
      gender: $("#f-gender").value,
      category: $("#f-cat").value,
      price: Number($("#f-price").value),
      old_price: $("#f-old").value === "" ? null : Number($("#f-old").value),
      tag: $("#f-tag").value,
      sizes: $("#f-sizes").value.split(",").map((s) => s.trim()).filter(Boolean),
      rating: Number($("#f-rating").value) || 0,
      reviews: Number($("#f-reviews").value) || 0,
      active: $("#f-active").checked,
      images: editImages,
      desc: { ru: $("#f-desc-ru").value, uz: $("#f-desc-uz").value, en: $("#f-desc-en").value },
      fabric: { ru: $("#f-fab-ru").value, uz: $("#f-fab-uz").value, en: $("#f-fab-en").value },
      sort: editing?.sort ?? 0,
    };
    if (body.name.trim().length < 2) { err.textContent = "Укажите название товара."; err.hidden = false; return; }
    if (!(body.price > 0)) { err.textContent = "Укажите цену больше нуля."; err.hidden = false; return; }
    if (!body.images.length) { err.textContent = "Добавьте хотя бы одно фото."; err.hidden = false; return; }
    try {
      if (editing) {
        const updated = await api("/api/admin/products/" + editing.id, { method: "PUT", body });
        products = products.map((x) => (x.id === editing.id ? updated : x));
      } else {
        const created = await api("/api/admin/products", { method: "POST", body });
        products.unshift(created);
      }
      renderProducts();
      switchView("products");
      toast("Сохранено ✓");
    } catch (ex) {
      const map = { invalid_name: "Проверьте название.", invalid_price: "Проверьте цену.", invalid_category: "Проверьте категорию." };
      err.textContent = map[ex.message] || "Ошибка сохранения: " + ex.message;
      err.hidden = false;
    }
  });

  /* ================= ORDERS ================= */
  async function loadOrders() {
    orders = await api("/api/admin/orders");
    const fresh = orders.filter((o) => o.status === "new").length;
    const badge = $("#orders-badge");
    badge.hidden = !fresh;
    badge.textContent = fresh;
    $("#order-count").textContent = "· " + orders.length;
    $("#order-table tbody").innerHTML = orders.map((o) => {
      const pay = o.payment || {};
      return `
      <tr>
        <td class="onum">${esc(o.number)}</td>
        <td class="odate">${esc((o.created_at || "").slice(0, 16).replace("T", " "))}</td>
        <td class="ocust">
          ${esc(o.customer.name)}
          <a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a>
          <small>${esc([o.customer.city, o.customer.address].filter(Boolean).join(", "))}</small>
          ${o.customer.comment ? `<small>💬 ${esc(o.customer.comment)}</small>` : ""}
        </td>
        <td class="oitems">${o.items.map((i) => {
          const bagSize = i.bag_size || 60;
          const unit = i.unit_price ? ` · ${i.unit_price} × ${bagSize}` : "";
          const mix = Array.isArray(i.size_mix) && i.size_mix.length
            ? " · " + i.size_mix.map((m) => `${esc(m.size)}×${m.qty}`).join(", ")
            : "";
          return `<b>${esc(i.name)}</b> × ${i.qty} qop${unit}${mix}`;
        }).join("<br>")}</td>
        <td class="osum">${o.total}</td>
        <td class="opay">
          <b>${esc(PAYMENT_METHOD_RU[pay.method] || pay.method || "—")}</b>
          <small>${esc(pay.amount ? "$" + Number(pay.amount).toFixed(2) : "")}</small>
          ${pay.id ? `<select class="osel" data-payment="${pay.id}">
            ${Object.entries(PAYMENT_STATUS_RU).map(([v, l]) => `<option value="${v}" ${v === pay.status ? "selected" : ""}>${l}</option>`).join("")}
          </select>` : ""}
        </td>
        <td>
          <select class="osel ${o.status === "new" ? "osel--new" : ""}" data-order="${o.id}">
            ${Object.entries(STATUS_RU).map(([v, l]) => `<option value="${v}" ${v === o.status ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </td>
      </tr>`;
    }).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--soft);padding:36px">Заказов пока нет</td></tr>`;
  }

  $("#order-table").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-order]");
    if (!sel) return;
    try {
      await api("/api/admin/orders/" + sel.dataset.order, { method: "PUT", body: { status: sel.value } });
      sel.classList.toggle("osel--new", sel.value === "new");
      toast("Статус обновлён");
      loadOrders();
    } catch (ex) { toast("Ошибка: " + ex.message); }
  });

  $("#order-table").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-payment]");
    if (!sel) return;
    try {
      await api("/api/admin/payments/" + sel.dataset.payment, { method: "PUT", body: { status: sel.value } });
      toast("Оплата обновлена");
      loadOrders();
    } catch (ex) { toast("Ошибка: " + ex.message); }
  });

  /* ================= SUPPORT ================= */
  async function loadSupport() {
    support = await api("/api/admin/support");
    const fresh = support.filter((s) => s.status === "new").length;
    const badge = $("#support-badge");
    badge.hidden = !fresh;
    badge.textContent = fresh;
    $("#support-count").textContent = "· " + support.length;
    $("#support-table tbody").innerHTML = support.map((s) => `
      <tr>
        <td class="onum">${esc(s.number || s.id)}</td>
        <td class="odate">${esc((s.created_at || "").slice(0, 16).replace("T", " "))}</td>
        <td class="ocust">
          ${esc(s.name)}
          <a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>
          ${s.email ? `<small><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></small>` : ""}
        </td>
        <td>${esc(SUPPORT_TOPIC_RU[s.topic] || s.topic)}</td>
        <td class="oitems">${esc(s.message)}</td>
        <td>
          <select class="osel ${s.status === "new" ? "osel--new" : ""}" data-support="${s.id}">
            ${Object.entries(SUPPORT_STATUS_RU).map(([v, l]) => `<option value="${v}" ${v === s.status ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </td>
      </tr>`).join("") || `<tr><td colspan="6" style="text-align:center;color:var(--soft);padding:36px">Обращений пока нет</td></tr>`;
  }

  $("#support-table").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-support]");
    if (!sel) return;
    try {
      await api("/api/admin/support/" + sel.dataset.support, { method: "PUT", body: { status: sel.value } });
      sel.classList.toggle("osel--new", sel.value === "new");
      toast("Статус обращения обновлён");
      loadSupport();
    } catch (ex) { toast("Ошибка: " + ex.message); }
  });

  /* ================= SETTINGS ================= */
  const S_KEYS = ["phone", "whatsapp", "telegram", "instagram", "email", "address_ru", "address_uz", "address_en", "currency", "currency_pos", "admin_user"];

  async function loadSettings() {
    const s = await api("/api/admin/settings");
    S_KEYS.forEach((k) => { const el = $("#s-" + k); if (el) el.value = s[k] ?? ""; });
  }

  $("#set-save").addEventListener("click", async () => {
    const body = {};
    S_KEYS.forEach((k) => { const el = $("#s-" + k); if (el) body[k] = el.value; });
    try {
      await api("/api/admin/settings", { method: "PUT", body });
      const m = $("#set-msg");
      m.textContent = "Настройки сохранены ✓"; m.hidden = false;
      setTimeout(() => (m.hidden = true), 2500);
    } catch (ex) { toast("Ошибка: " + ex.message); }
  });

  $("#p-save").addEventListener("click", async () => {
    const m = $("#p-msg");
    m.hidden = true;
    try {
      await api("/api/admin/password", { method: "POST", body: { current: $("#p-current").value, next: $("#p-next").value } });
      m.textContent = "Пароль изменён ✓ (все другие сессии разлогинены)";
      m.classList.add("formerr--ok");
      m.hidden = false;
      $("#p-current").value = ""; $("#p-next").value = "";
    } catch (ex) {
      m.textContent = ex.message === "wrong_password" ? "Текущий пароль неверен." : ex.message === "too_short" ? "Новый пароль — минимум 8 символов." : "Ошибка: " + ex.message;
      m.classList.remove("formerr--ok");
      m.hidden = false;
    }
  });

  /* ================= DESIGN (оформление) ================= */
  const THEMES = [
    { id: "burgundy", name: "Бордо", accent: "#5c1f2d", dark: "#421521" },
    { id: "navy",     name: "Тёмно-синий", accent: "#1a2d4d", dark: "#101d33" },
    { id: "forest",   name: "Изумруд", accent: "#28453a", dark: "#1a2e26" },
    { id: "mocha",    name: "Мокко", accent: "#5f4636", dark: "#412f24" },
    { id: "plum",     name: "Слива", accent: "#4a2a4d", dark: "#321c34" },
    { id: "charcoal", name: "Графит", accent: "#33312e", dark: "#211f1d" },
  ];
  const design = { hero_type: "image", hero_image: "", hero_video: "", hero_poster: "", accent: "#5c1f2d", accent_dark: "#421521" };

  async function loadDesign() {
    const s = await api("/api/admin/settings");
    Object.keys(design).forEach((k) => { if (s[k] != null && s[k] !== "") design[k] = s[k]; });
    renderDesign();
  }

  function renderDesign() {
    // hero type radio
    document.querySelectorAll('[name="hero-type"]').forEach((r) => { r.checked = r.value === design.hero_type; });
    $("#d-hero-image-wrap").hidden = design.hero_type !== "image";
    $("#d-hero-video-wrap").hidden = design.hero_type !== "video";
    // previews
    $("#d-hero-image-prev").innerHTML = design.hero_image ? `<img src="${esc(design.hero_image)}" alt="">` : '<span class="dempty">нет фото</span>';
    $("#d-hero-video-prev").innerHTML = design.hero_video
      ? `<video src="${esc(design.hero_video)}" muted loop playsinline autoplay preload="metadata"></video>`
      : '<span class="dempty">нет видео</span>';
    $("#d-hero-poster-prev").innerHTML = design.hero_poster ? `<img src="${esc(design.hero_poster)}" alt="">` : '<span class="dempty">постер не задан</span>';
    // accent swatches
    $("#d-themes").innerHTML = THEMES.map((t) =>
      `<button class="swatch ${t.accent.toLowerCase() === design.accent.toLowerCase() ? "is-on" : ""}" data-theme="${t.id}" style="--sw:${t.accent}" title="${t.name}"><span></span>${t.name}</button>`
    ).join("");
  }

  async function uploadDesign(file, expect) {
    if (!file) return null;
    const isVid = /^video\//.test(file.type) || /\.(mp4|webm)$/i.test(file.name);
    if (expect === "video" && !isVid) { toast("Нужен видеофайл (MP4/WebM)"); return null; }
    if (expect === "image" && isVid) { toast("Нужно фото (JPG/PNG/WebP)"); return null; }
    const cap = isVid ? 64 : 8;
    if (file.size > cap * 1024 * 1024) { toast(`Файл больше ${cap} МБ`); return null; }
    toast("Загрузка…");
    try {
      const res = await api("/api/admin/upload", { method: "POST", body: await file.arrayBuffer() });
      return res.url;
    } catch (ex) { toast("Ошибка загрузки: " + ex.message); return null; }
  }

  document.addEventListener("change", async (e) => {
    if (e.target.name === "hero-type") { design.hero_type = e.target.value; renderDesign(); return; }
    if (e.target.id === "d-hero-image-file") {
      const url = await uploadDesign(e.target.files[0], "image"); e.target.value = "";
      if (url) { design.hero_image = url; renderDesign(); }
    }
    if (e.target.id === "d-hero-video-file") {
      const url = await uploadDesign(e.target.files[0], "video"); e.target.value = "";
      if (url) { design.hero_video = url; renderDesign(); }
    }
    if (e.target.id === "d-hero-poster-file") {
      const url = await uploadDesign(e.target.files[0], "image"); e.target.value = "";
      if (url) { design.hero_poster = url; renderDesign(); }
    }
  });

  document.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-theme]");
    if (sw) {
      const t = THEMES.find((x) => x.id === sw.dataset.theme);
      if (t) { design.accent = t.accent; design.accent_dark = t.dark; renderDesign(); }
    }
  });

  $("#design-save")?.addEventListener("click", async () => {
    const m = $("#design-msg");
    m.hidden = true;
    try {
      await api("/api/admin/settings", { method: "PUT", body: {
        hero_type: design.hero_type,
        hero_image: design.hero_image,
        hero_video: design.hero_video,
        hero_poster: design.hero_poster,
        accent: design.accent,
        accent_dark: design.accent_dark,
      }});
      m.textContent = "Дизайн сохранён ✓ Обновите сайт, чтобы увидеть изменения.";
      m.hidden = false;
      setTimeout(() => (m.hidden = true), 3500);
    } catch (ex) { toast("Ошибка: " + ex.message); }
  });

  /* ================= boot ================= */
  (async () => {
    try {
      const me = await fetch("/api/me").then((r) => r.json());
      if (!me.admin) { location.replace("/admin"); return; }
      showApp();
    } catch { location.replace("/admin"); }
  })();
})();
