/* ============================================================
   MILANA — admin panel SPA (vanilla, zero deps)
   ============================================================ */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const GENDER_RU = { women: "Женский", men: "Мужской", kids: "Детский", unisex: "Унисекс" };
  const CLO_RU = { pajamas: "Пижамы", robes: "Халаты", homewear: "Домашняя одежда", loungewear: "Лаунж-сеты" };
  const GENDER_UZ = { women: "ayollar", men: "erkaklar", kids: "bolalar", unisex: "universal" };
  const GENDER_EN = { women: "women", men: "men", kids: "kids", unisex: "unisex" };
  const CLO_UZ = { pajamas: "pijama", robes: "xalat", homewear: "uy kiyimi", loungewear: "lounge to'plam" };
  const CLO_EN = { pajamas: "pajamas", robes: "robes", homewear: "homewear", loungewear: "loungewear sets" };
  const PANEL_RU = {
    pajamas: "Pijama", robes: "Xalat", men: "Erkaklar", tunics: "Tunika",
    trousers: "Ishton", nightgowns: "Sarochka", sets: "Dvoyka",
    tshirts: "Futbolka", kids: "Yosh bolalar",
  };
  const TYPE_RU = {
    tunic: "Туника", sarochka: "Сорочка", robe: "Халат", pajamas: "Пижама",
    set: "Комплект", tracksuit: "Спортивный костюм", hoodie: "Худи",
    dress: "Платье", shirt: "Рубашка", polo: "Поло", trousers: "Штаны",
    tshirt: "Футболка", shorts: "Шорты", top: "Майка",
  };
  const TAG_RU = { bestseller: "Бестселлер", new: "Новинка", sale: "Скидка" };
  const STATUS_RU = { new: "🆕 Новый", processing: "⏳ В работе", shipped: "🚚 Отправлен", done: "✅ Выполнен", cancelled: "✖ Отменён" };
  const PAYMENT_METHOD_RU = { manager: "Менеджер", cash: "Наличные", bank: "Банк", click: "Click", payme: "Payme", card: "Карта" };
  const PAYMENT_STATUS_RU = {
    pending: "⏳ Ожидает",
    invoice_sent: "📨 Счёт отправлен",
    waiting_for_customer: "👤 Ждём клиента",
    submitted: "📎 Подтверждение отправлено",
    paid: "✅ Оплачено",
    failed: "⚠ Ошибка",
    refunded: "↩ Возврат",
    cancelled: "✖ Отменено",
  };
  const SUPPORT_STATUS_RU = { new: "🆕 Новый", open: "👀 Открыт", waiting: "⏳ Ждём", done: "✅ Решён", closed: "✖ Закрыт" };
  const SUPPORT_TOPIC_RU = { general: "Общий", catalog: "Каталог", price: "Цена", delivery: "Доставка", defect: "Брак", payment: "Оплата", order: "Заказ" };
  const TIER_RU = { regular: "Обычный", premium: "Премиум", vip: "VIP" };

  let products = [];
  let catalogPanels = [];
  let catalogPanelFilter = "";
  let productPage = 1;
  let productTotal = 0;
  let productPages = 1;
  const PRODUCT_PAGE_SIZE = 100;
  let orders = [];
  let support = [];
  let customers = [];
  let managers = [];
  let reviews = [];
  let chats = [];
  let editing = null;     // product being edited (null = new)
  let editImages = [];    // image urls of the edit form
  let slugTouched = false;

  const SMART_SYNONYMS = {
    ayol: "women", ayollar: "women", women: "women", jenskiy: "women", женский: "women",
    erkak: "men", erkaklar: "men", men: "men", mujskoy: "men", мужской: "men",
    bola: "kids", bolalar: "kids", kids: "kids", detskiy: "kids", детский: "kids",
    pijama: "pajamas", pajama: "pajamas", pajamas: "pajamas", пижама: "pajamas",
    halat: "robes", xalat: "robes", robe: "robes", халат: "robes",
    uy: "homewear", homewear: "homewear", lounge: "loungewear", set: "loungewear",
  };

  function smartNormalize(value) {
    return String(value || "").toLowerCase().replace(/['’`ʻ]/g, "").replace(/[^a-z0-9а-яёёўқғҳ]+/gi, " ").trim();
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

  function productSearchScore(p, query) {
    const tokens = smartTokens(query);
    if (!tokens.length) return 1;
    const hay = smartNormalize([
      p.name, p.slug, p.model_no, p.variant, p.gender, p.category, p.catalog_panel, p.product_type, p.tag,
      (p.sizes || []).join(" "), p.desc?.ru, p.desc?.uz, p.desc?.en, p.fabric?.ru, p.fabric?.uz, p.fabric?.en,
    ].filter(Boolean).join(" "));
    const model = smartNormalize([p.model_no, p.variant, p.name].join(" "));
    return tokens.reduce((score, token) => {
      if (!hay.includes(token)) return score;
      let next = score + 8;
      if (model.includes(token)) next += 16;
      if (p.gender === token || p.category === token || p.catalog_panel === token) next += 12;
      if ((p.sizes || []).some((s) => smartNormalize(s) === token)) next += 10;
      return next;
    }, 0);
  }

  function slugifyLocal(value) {
    return smartNormalize(value)
      .replace(/[а-яёёўқғҳ]/gi, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

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

  function confirmAction({ title, message, confirmText = "Подтвердить", cancelText = "Отмена", danger = false }) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "aconfirm";
      modal.innerHTML = `
        <div class="aconfirm__shade" data-confirm-cancel></div>
        <section class="aconfirm__panel" role="dialog" aria-modal="true" aria-labelledby="aconfirm-title">
          <div class="aconfirm__mark ${danger ? "aconfirm__mark--danger" : ""}">${danger ? "!" : "✓"}</div>
          <h2 id="aconfirm-title">${esc(title)}</h2>
          <p>${esc(message)}</p>
          <div class="aconfirm__actions">
            <button class="abtn" type="button" data-confirm-cancel>${esc(cancelText)}</button>
            <button class="abtn ${danger ? "abtn--danger-fill" : "abtn--primary"}" type="button" data-confirm-ok>${esc(confirmText)}</button>
          </div>
        </section>`;
      const done = (value) => {
        document.removeEventListener("keydown", onKey);
        modal.remove();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === "Escape") done(false);
        if (e.key === "Enter") done(true);
      };
      modal.addEventListener("click", (e) => {
        if (e.target.closest("[data-confirm-ok]")) done(true);
        if (e.target.closest("[data-confirm-cancel]")) done(false);
      });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(modal);
      modal.querySelector("[data-confirm-cancel]")?.focus();
    });
  }

  function phoneHref(phone) {
    const raw = String(phone || "").trim();
    return raw ? "tel:" + raw.replace(/[^\d+]/g, "") : "";
  }

  function whatsappHref(phone) {
    let digits = String(phone || "").replace(/\D/g, "");
    if (digits.length === 9) digits = "998" + digits;
    return digits ? "https://wa.me/" + digits : "";
  }

  function parseOrderComment(comment) {
    const parts = String(comment || "").split(";").map((part) => part.trim()).filter(Boolean);
    const parsed = { postCode: "", note: "", extra: [] };
    parts.forEach((part) => {
      const postCode = part.match(/^post\s*code\s*:\s*(.+)$/i);
      const note = part.match(/^note\s*:\s*(.+)$/i);
      if (postCode) parsed.postCode = postCode[1].trim();
      else if (note) parsed.note = note[1].trim();
      else if (!/\/.+\/.+\/.+\((?:\d+\s*)?pcs\)/i.test(part)) parsed.extra.push(part);
    });
    return parsed;
  }

  function renderCustomerCell(customer = {}) {
    const comment = parseOrderComment(customer.comment);
    const rawAddress = String(customer.address || "");
    const embeddedPostCode = rawAddress.match(/(?:^|[·,;])\s*post\s*code\s*:\s*([^·,;]+)/i);
    const cleanAddress = rawAddress.replace(/\s*[·,;]?\s*post\s*code\s*:\s*[^·,;]+/i, "").trim();
    const postCode = customer.postcode || comment.postCode || (embeddedPostCode ? embeddedPostCode[1].trim() : "");
    const address = [customer.city, cleanAddress].filter(Boolean).join(", ");
    const delivery = [address, postCode ? `Индекс: ${postCode}` : ""].filter(Boolean).join(" · ");
    const call = phoneHref(customer.phone);
    const wa = whatsappHref(customer.phone);
    const note = [customer.delivery_note || "", comment.note, ...comment.extra].filter(Boolean).join(" · ");
    return `
      <div class="ocust__head">
        <b>${esc(customer.name || "—")}</b>
        ${customer.customer_tier && customer.customer_tier !== "regular" ? `<span>${esc(TIER_RU[customer.customer_tier] || customer.customer_tier)}</span>` : ""}
      </div>
      ${customer.phone ? `<a class="ocust__phone" href="${esc(call)}">${esc(customer.phone)}</a>` : `<small>Телефон не указан</small>`}
      <div class="ocust__actions">
        ${call ? `<a href="${esc(call)}">Позвонить</a>` : ""}
        ${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
      </div>
      ${delivery ? `<div class="odelivery"><span>Доставка</span><small>${esc(delivery)}</small></div>` : ""}
      ${note ? `<div class="odelivery odelivery--note"><span>Комментарий</span><small>${esc(note)}</small></div>` : ""}
      ${customer.assigned_manager ? `<small>Менеджер: ${esc(customer.assigned_manager)}</small>` : ""}
    `;
  }

  function renderOrderItem(i = {}) {
    const bagSize = i.bag_size || 60;
    const unit = i.unit_price ? `${esc(i.unit_price)} × ${bagSize}` : `${bagSize} dona`;
    const mix = Array.isArray(i.size_mix) && i.size_mix.length
      ? i.size_mix.map((m) => `${esc(m.size)}×${m.qty}`).join(", ")
      : "";
    const unitLabel = i.unit_type === "piece" ? "Dona" : i.unit_type === "pachka" ? "Qadoq" : "Qop";
    const details = [
      i.color ? `<span><b>Rang:</b> ${esc(i.color)}</span>` : "",
      i.size ? `<span><b>O'lcham:</b> ${esc(i.size)}</span>` : "",
      mix ? `<span><b>Mix:</b> ${mix}</span>` : "",
      `<span><b>${unitLabel}:</b> ${unit}</span>`,
    ].filter(Boolean).join("");
    return `
      <div class="oitem">
        <b>${esc(i.name)}</b>
        <span class="oitem__qty">× ${esc(i.qty)} ${unitLabel.toLowerCase()}</span>
        <small>${details}</small>
      </div>
    `;
  }

  /* ---------------- auth ---------------- */
  async function showApp() {
    await Promise.all([loadProducts(), loadCatalogPanels(), loadCustomers(), loadManagers(), loadOrders(), loadReviews(), loadChat(), loadSupport()]);
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
    ["products", "edit", "customers", "managers", "orders", "reviews", "chat", "support", "settings", "design", "builder", "dict"].forEach((v) => { $("#view-" + v).hidden = v !== name; });
    if (name === "customers") loadCustomers();
    if (name === "managers") loadManagers();
    if (name === "orders") loadOrders();
    if (name === "reviews") loadReviews();
    if (name === "chat") loadChat();
    if (name === "support") loadSupport();
    if (name === "dict") loadDictView();
    else if (dictDirty && !confirm("В справочниках есть несохранённые правки. Уйти без сохранения?")) {
      document.querySelectorAll(".side__nav button").forEach((x) => x.classList.toggle("is-on", x.dataset.view === "dict"));
      return switchView("dict");
    }
    if (name === "settings") loadSettings();
    if (name === "design") loadDesign();
  }

  /* ================= PRODUCTS ================= */
  async function loadProducts({ reset = false } = {}) {
    if (reset) productPage = 1;
    const query = $("#prod-search")?.value.trim() || "";
    const panel = catalogPanelFilter ? `&panel=${encodeURIComponent(catalogPanelFilter)}` : "";
    const result = await api(`/api/admin/products?meta=1&limit=${PRODUCT_PAGE_SIZE}&page=${productPage}&q=${encodeURIComponent(query)}${panel}`);
    products = Array.isArray(result) ? result : (result.items || []);
    productTotal = Number(result?.meta?.total ?? products.length);
    productPages = Math.max(1, Number(result?.meta?.pages) || 1);
    if (productPage > productPages) {
      productPage = productPages;
      return loadProducts();
    }
    renderProducts();
  }

  async function loadCatalogPanels() {
    catalogPanels = await api("/api/admin/catalog-panels");
    renderCatalogPanels();
  }

  function renderCatalogPanels() {
    const root = $("#admin-catalog-panels");
    root.innerHTML = catalogPanels.map((panel) => `
      <button type="button" class="admin-catalog-panel${catalogPanelFilter === panel.id ? " is-on" : ""}" data-admin-panel="${panel.id}">
        <span class="admin-catalog-panel__media">${panel.image ? `<img src="${esc(panel.image)}" alt="">` : ""}</span>
        <span class="admin-catalog-panel__body">
          <small>Каталог ${esc(panel.number)}</small>
          <b>${esc(PANEL_RU[panel.id] || panel.id)}</b>
          <i>${panel.active} активных · ${panel.total} всего</i>
        </span>
      </button>
    `).join("");
  }

  $("#admin-catalog-panels").addEventListener("click", async (e) => {
    const button = e.target.closest("[data-admin-panel]");
    if (!button) return;
    catalogPanelFilter = catalogPanelFilter === button.dataset.adminPanel ? "" : button.dataset.adminPanel;
    renderCatalogPanels();
    await loadProducts({ reset: true });
  });

  function clearAutofilledProductSearch() {
    const input = $("#prod-search");
    if (!input) return;
    const value = input.value.trim().toLowerCase();
    if (value === "admin") {
      input.value = "";
      loadProducts({ reset: true });
    }
  }

  function renderProducts() {
    const search = $("#prod-search");
    if (search && search.value.trim().toLowerCase() === "admin") search.value = "";
    const q = search?.value || "";
    const list = products
      .map((p) => ({ p, score: productSearchScore(p, q) }))
      .filter((row) => !q.trim() || row.score > 0)
      .sort((a, b) => b.score - a.score || (b.p.sort || 0) - (a.p.sort || 0) || b.p.id - a.p.id)
      .map((row) => row.p);
    $("#prod-count").textContent = "· " + productTotal;
    $("#prod-table tbody").innerHTML = list.map((p) => `
      <tr data-id="${p.id}">
        <td class="pmodel">${esc(p.model_no || "—")}</td>
        <td>${esc(p.variant || "—")}</td>
        <td><span class="pname"><img class="pthumb" src="${esc(p.images[0] || "")}" alt="">${esc(p.name)}<small>/p/${esc(p.slug)}</small></span></td>
        <td><span class="pcatalog">${esc(PANEL_RU[p.catalog_panel] || p.catalog_panel || "—")}<small>${esc(TYPE_RU[p.product_type] || "—")}</small></span></td>
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
    $("#prod-page-label").textContent = `Страница ${productPage} из ${productPages}`;
    $("#prod-prev").disabled = productPage <= 1;
    $("#prod-next").disabled = productPage >= productPages;
  }

  $("#prod-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
  let productSearchTimer;
  $("#prod-search").addEventListener("input", () => {
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => loadProducts({ reset: true }).catch((e) => toast("Ошибка: " + e.message)), 250);
  });
  $("#prod-prev").addEventListener("click", () => {
    if (productPage <= 1) return;
    productPage -= 1;
    loadProducts().catch((e) => toast("Ошибка: " + e.message));
  });
  $("#prod-next").addEventListener("click", () => {
    if (productPage >= productPages) return;
    productPage += 1;
    loadProducts().catch((e) => toast("Ошибка: " + e.message));
  });
  window.addEventListener("pageshow", () => setTimeout(clearAutofilledProductSearch, 80));
  setTimeout(clearAutofilledProductSearch, 250);

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
      const confirmed = await confirmAction({
        title: "Удалить товар?",
        message: `«${p.name}» будет удалён из админки и сайта. Это действие нельзя отменить.`,
        confirmText: "Удалить товар",
        danger: true,
      });
      if (!confirmed) return;
      try {
        await api("/api/admin/products/" + id, { method: "DELETE" });
        await loadProducts();
        toast("Товар удалён");
      } catch (ex) { toast("Ошибка: " + ex.message); }
    }
  });

  /* ---------------- edit form ---------------- */
  $("#prod-new").addEventListener("click", () => openEdit(null));
  $("#edit-cancel").addEventListener("click", () => switchView("products"));

  function openEdit(p) {
    editing = p;
    slugTouched = Boolean(p?.slug);
    editImages = p ? [...p.images] : [];
    $("#edit-title").textContent = p ? "Изменить: " + p.name : "Новый товар";
    $("#edit-err").hidden = true;
    $("#f-name").value = p?.name || "";
    $("#f-slug").value = p?.slug || "";
    $("#f-model").value = p?.model_no || "";
    $("#f-variant").value = p?.variant || "";
    $("#f-color").value = p?.color || "";
    $("#f-gender").value = p?.gender || "women";
    $("#f-cat").value = p?.category || "pajamas";
    $("#f-catalog-panel").value = p?.catalog_panel || "pajamas";
    $("#f-product-type").value = p?.product_type || "";
    $("#f-old").value = p?.old_price ?? "";
    $("#f-wholesale-price").value = p?.wholesale_price ?? p?.price ?? "";
    syncRetailFromWholesale();
    $("#f-available-qop").value = p?.available_qop ?? "";
    $("#f-retail-price").value = p?.retail_price ?? p?.price ?? "";
    $("#f-retail-stock").value = p?.retail_stock ?? 0;
    $("#f-retail-enabled").checked = p ? !!p.retail_enabled : true;
    $("#f-tag").value = p?.tag || "";
    $("#f-collection").value = p?.collection || "";
    $("#f-size-chart").value = p?.size_chart || "";
    $("#f-country").value = p?.country || "";
    fillDictSelect($("#f-material"), p?.material || "");
    fillDictSelect($("#f-composition"), p?.composition || "");
    fillDictSelect($("#f-season"), p?.season || "");
    fillDictSelect($("#f-sizes"), (p?.sizes || []).join(", "));
    syncMoqFromSizes();
    $("#f-rating").value = p?.rating ?? 0;
    $("#f-reviews").value = p?.reviews ?? 0;
    $("#f-active").checked = p ? !!p.active : true;
    ["ru", "uz", "en"].forEach((l) => {
      $("#f-desc-" + l).value = p?.desc?.[l] || "";
      $("#f-fab-" + l).value = p?.fabric?.[l] || "";
    });
    renderPhotos();
    updateEditChecklist();
    $("#upload-status").textContent = "";
    $("#edit-ai-msg").textContent = "";
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
    updateEditChecklist();
  }

  function updateEditChecklist() {
    const items = [
      { ok: $("#f-name").value.trim().length >= 2, label: "Название" },
      { ok: Number($("#f-wholesale-price").value) > 0, label: "Цена" },
      { ok: ($("#f-sizes").value || "").split(",").map((s) => s.trim()).filter(Boolean).length > 0, label: "Размеры" },
      { ok: editImages.length > 0, label: "Фото" },
      { ok: $("#f-desc-ru").value.trim().length > 20 || $("#f-desc-uz").value.trim().length > 20 || $("#f-desc-en").value.trim().length > 20, label: "Описание" },
    ];
    $("#edit-checklist").innerHTML = items.map((item) => `<span class="${item.ok ? "is-ok" : "is-miss"}">${item.ok ? "✓" : "•"} ${item.label}</span>`).join("");
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

  async function uploadProductFiles(files, source = "picker") {
    files = [...(files || [])].filter(Boolean);
    if (!files.length) return;
    const status = $("#upload-status");
    const zone = $("#f-upload-zone");
    const optimizedStats = [];
    zone?.classList.add("is-uploading");
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isVid = /^video\//.test(f.type) || /\.(mp4|webm)$/i.test(f.name);
      const allowed = /^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/.test(f.type)
        || /\.(jpe?g|png|webp|mp4|webm)$/i.test(f.name);
      if (!allowed) {
        status.textContent = `«${f.name}» не поддерживается — нужен JPG, PNG, WebP, MP4 или WebM.`;
        zone?.classList.remove("is-uploading");
        return;
      }
      const cap = 64;
      if (f.size > cap * 1024 * 1024) { status.textContent = `«${f.name}» больше ${cap} МБ — пропущен.`; continue; }
      status.textContent = `${source === "drop" ? "Перетаскивание" : "Загрузка"} ${i + 1} из ${files.length}… ${isVid ? "(видео может занять время)" : ""}`;
      try {
        const buf = await f.arrayBuffer();
        const res = await api("/api/admin/upload", { method: "POST", body: buf });
        if (res.optimized && res.saved_bytes) optimizedStats.push(res.saved_bytes);
        editImages.push(res.url);
        renderPhotos();
      } catch (ex) {
        const msg = ex.message === "format_not_allowed" ? "формат не поддерживается (нужно JPG/PNG/WebP/MP4/WebM)"
          : ex.message === "too_large" ? "файл больше 64 МБ"
          : ex.message;
        status.textContent = `Ошибка загрузки «${f.name}»: ${msg}`;
        zone?.classList.remove("is-uploading");
        return;
      }
    }
    zone?.classList.remove("is-uploading");
    const saved = optimizedStats.reduce((sum, value) => sum + value, 0);
    status.textContent = saved
      ? `Готово ✓ Оптимизировано, сэкономлено ${(saved / 1024 / 1024).toFixed(1)} МБ.`
      : "Готово ✓";
    setTimeout(() => (status.textContent = ""), 2000);
  }

  $("#f-upload").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    await uploadProductFiles(files);
  });

  const uploadZone = $("#f-upload-zone");
  if (uploadZone) {
    ["dragenter", "dragover"].forEach((type) => {
      uploadZone.addEventListener(type, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.add("is-dragover");
      });
    });
    ["dragleave", "dragend"].forEach((type) => {
      uploadZone.addEventListener(type, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove("is-dragover");
      });
    });
    uploadZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove("is-dragover");
      await uploadProductFiles([...(e.dataTransfer?.files || [])], "drop");
    });
  }

  /* language tabs for description */
  $("#desc-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lt]");
    if (!b) return;
    document.querySelectorAll("#desc-tabs button").forEach((x) => x.classList.toggle("is-on", x === b));
    ["ru", "uz", "en"].forEach((l) => { $("#f-desc-" + l).hidden = l !== b.dataset.lt; });
  });

  $("#f-slug").addEventListener("input", () => { slugTouched = true; updateEditChecklist(); });
  ["#f-name", "#f-model", "#f-variant"].forEach((sel) => {
    $(sel).addEventListener("input", () => {
      if (!slugTouched) $("#f-slug").value = slugifyLocal([$("#f-model").value, $("#f-variant").value, $("#f-name").value].filter(Boolean).join(" "));
      updateEditChecklist();
    });
  });
  ["#f-wholesale-price", "#f-sizes", "#f-desc-ru", "#f-desc-uz", "#f-desc-en"].forEach((sel) => {
    $(sel).addEventListener("input", updateEditChecklist);
  });

  async function generatePhotoDescription() {
    const images = editImages.filter((url) => !/\.(mp4|webm)(?:\?|$)/i.test(url)).slice(0, 3);
    const button = $("#edit-ai-fill");
    const message = $("#edit-ai-msg");
    if (!images.length) {
      message.textContent = "Сначала загрузите фотографию товара.";
      return;
    }
    button.disabled = true;
    button.textContent = "Анализ…";
    message.textContent = "Анализируем фото товара…";
    try {
      const result = await api("/api/admin/products/describe", {
        method: "POST",
        body: {
          images,
          name: $("#f-name").value,
          model_no: $("#f-model").value,
          variant: $("#f-variant").value,
      color: $("#f-color").value.trim(),
          category: $("#f-cat").value,
          gender: $("#f-gender").value,
        },
      });
      ["ru", "uz", "en"].forEach((lang) => {
        $("#f-desc-" + lang).value = result.desc?.[lang] || "";
      });
      if (result.product_type) $("#f-product-type").value = result.product_type;
      if (!$("#f-name").value.trim() && result.names?.ru) {
        $("#f-name").value = result.names.ru;
      }
      updateEditChecklist();
      message.textContent = "Описание создано по фото на русском, узбекском и английском. Проверьте и сохраните товар.";
    } catch (ex) {
      const errors = {
        openai_not_configured: "OpenAI не настроен на сервере.",
        image_required: "Нужно загрузить фотографию, не видео.",
        image_not_local: "Можно анализировать только загруженные на сайт фотографии.",
        image_not_found: "Фотография не найдена. Загрузите её заново.",
        image_too_large: "Фотография слишком большая для анализа.",
      };
      message.textContent = errors[ex.message] || "Не удалось создать описание по фото. Попробуйте ещё раз.";
    } finally {
      button.disabled = false;
      button.textContent = "По фото";
    }
  }

  $("#edit-ai-fill").addEventListener("click", () => {
    const approved = window.confirm(
      "Фотографии товара будут отправлены в OpenAI для анализа, и это может использовать API-кредиты. Продолжить?"
    );
    if (approved) generatePhotoDescription();
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
      catalog_panel: $("#f-catalog-panel").value,
      product_type: $("#f-product-type").value,
      price: Number($("#f-wholesale-price").value),   /* столбец price хранит ту же оптовую цену */
      old_price: $("#f-old").value === "" ? null : Number($("#f-old").value),
      wholesale_price: Number($("#f-wholesale-price").value),
      wholesale_moq: Number($("#f-wholesale-moq").value) || 6,
      available_qop: $("#f-available-qop").value === "" ? null : Number($("#f-available-qop").value || 0),
      retail_enabled: $("#f-retail-enabled").checked,
      retail_price: Number($("#f-retail-price").value || $("#f-wholesale-price").value),
      retail_stock: Number($("#f-retail-stock").value || 0),
      tag: $("#f-tag").value,
      collection: $("#f-collection").value,
      size_chart: $("#f-size-chart").value.trim(),
      country: $("#f-country").value.trim(),
      material: $("#f-material").value.trim(),
      composition: $("#f-composition").value.trim(),
      season: $("#f-season").value.trim(),
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
      await loadCatalogPanels();
      switchView("products");
      toast("Сохранено ✓");
    } catch (ex) {
      const map = { invalid_name: "Проверьте название.", invalid_price: "Проверьте цену.", invalid_category: "Проверьте категорию." };
      err.textContent = map[ex.message] || "Ошибка сохранения: " + ex.message;
      err.hidden = false;
    }
  });

  /* ================= CUSTOMERS ================= */
  async function loadCustomers() {
    customers = await api("/api/admin/customers");
    const pending = customers.filter((c) => c.approval_status === "pending_review").length;
    const badge = $("#customers-badge");
    badge.hidden = !pending;
    badge.textContent = pending;
    $("#customer-count").textContent = "· " + customers.length;
    $("#customer-table tbody").innerHTML = customers.map((c) => `
      <tr>
        <td class="ocust">
          ${esc(c.name || c.contact_person || c.email)}
          <small>${esc(c.email)}</small>
          <small>${esc((c.created_at || "").slice(0, 10))}</small>
        </td>
        <td>${c.account_type === "individual" ? "Розница" : "Бизнес"}</td>
        <td class="oitems">
          <b>${esc(c.company_name || "—")}</b>
          <small>${esc(c.tax_id || "")}</small>
          <small>${esc(c.legal_address || c.address || "")}</small>
        </td>
        <td class="ocust">
          <a href="tel:${esc(c.phone)}">${esc(c.phone || "—")}</a>
          <small>${c.phone_verified ? "Телефон подтверждён" : "Телефон не подтверждён"}</small>
        </td>
        <td>
          <select class="osel" data-customer-tier="${c.id}">
            ${Object.entries(TIER_RU).map(([value, label]) => `<option value="${value}" ${c.customer_tier === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
          <input class="ainput ainput--mini" data-customer-discount="${c.id}" type="number" min="0" max="90" step="1" value="${Number(c.price_discount || 0)}" placeholder="Скидка %">
        </td>
        <td>
          <input class="ainput ainput--mini" data-customer-manager="${c.id}" value="${esc(c.assigned_manager || "")}" placeholder="Имя менеджера">
        </td>
        <td>
          <select class="osel ${c.approval_status === "pending_review" ? "osel--new" : ""}" data-customer="${c.id}">
            <option value="pending_review" ${c.approval_status === "pending_review" ? "selected" : ""}>⏳ На проверке</option>
            <option value="active" ${c.approval_status === "active" ? "selected" : ""}>✅ Активен</option>
            <option value="info_requested" ${c.approval_status === "info_requested" ? "selected" : ""}>❔ Нужна информация</option>
            <option value="rejected" ${c.approval_status === "rejected" ? "selected" : ""}>✖ Отклонён</option>
          </select>
        </td>
      </tr>`).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--soft);padding:36px">Клиентов пока нет</td></tr>`;
  }

  $("#customer-table").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-customer]");
    const tier = e.target.closest("[data-customer-tier]");
    const discount = e.target.closest("[data-customer-discount]");
    const manager = e.target.closest("[data-customer-manager]");
    try {
      if (sel) {
        await api("/api/admin/customers/" + sel.dataset.customer + "/approval", { method: "PUT", body: { approval_status: sel.value } });
        toast("Статус клиента обновлён");
        loadCustomers();
      }
      const commercial = tier || discount || manager;
      if (commercial) {
        const id = commercial.dataset.customerTier || commercial.dataset.customerDiscount || commercial.dataset.customerManager;
        await api("/api/admin/customers/" + id + "/commercial", {
          method: "PUT",
          body: {
            customer_tier: document.querySelector(`[data-customer-tier="${id}"]`)?.value || "regular",
            assigned_manager: document.querySelector(`[data-customer-manager="${id}"]`)?.value || "",
            price_discount: Number(document.querySelector(`[data-customer-discount="${id}"]`)?.value || 0),
          },
        });
        toast("Условия клиента сохранены");
      }
    } catch (ex) { toast("Ошибка: " + ex.message); }
  });

  /* ================= MANAGERS ================= */
  async function loadManagers() {
    managers = await api("/api/admin/managers");
    $("#manager-count").textContent = "· " + managers.length;
    $("#manager-table tbody").innerHTML = managers.map((manager) => `
      <tr data-manager-row="${manager.id}">
        <td><input class="ainput" data-manager-name value="${esc(manager.name)}" maxlength="80"></td>
        <td><input class="ainput" data-manager-login value="${esc(manager.login)}" maxlength="60" autocomplete="off"></td>
        <td><input class="ainput" data-manager-password type="password" minlength="8" maxlength="100" autocomplete="new-password" placeholder="Без изменений"></td>
        <td><input class="ainput" data-manager-chat value="${esc(manager.telegram_chat_id)}" maxlength="80"></td>
        <td><input class="ainput" data-manager-thread value="${esc(manager.telegram_thread_id)}" maxlength="30" placeholder="—"></td>
        <td>
          <select class="ainput" data-manager-active>
            <option value="1" ${manager.active ? "selected" : ""}>Активен</option>
            <option value="0" ${manager.active ? "" : "selected"}>Отключён</option>
          </select>
        </td>
        <td><button class="abtn" type="button" data-manager-save="${manager.id}">Сохранить</button></td>
      </tr>
    `).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--soft);padding:36px">Добавьте первого менеджера</td></tr>`;
  }

  $("#manager-create").addEventListener("click", async () => {
    const msg = $("#manager-msg");
    msg.textContent = "";
    try {
      await api("/api/admin/managers", {
        method: "POST",
        body: {
          name: $("#manager-name").value.trim(),
          login: $("#manager-login").value.trim(),
          password: $("#manager-password").value,
          telegram_chat_id: $("#manager-chat-id").value.trim(),
          telegram_thread_id: $("#manager-thread-id").value.trim(),
          active: $("#manager-active").checked,
        },
      });
      ["manager-name", "manager-login", "manager-password", "manager-chat-id", "manager-thread-id"]
        .forEach((id) => { $("#" + id).value = ""; });
      $("#manager-active").checked = true;
      msg.textContent = "Менеджер добавлен";
      await loadManagers();
    } catch (error) {
      msg.textContent = "Ошибка: " + error.message;
    }
  });

  $("#manager-table").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-manager-save]");
    if (!button) return;
    const row = button.closest("[data-manager-row]");
    button.disabled = true;
    try {
      await api("/api/admin/managers/" + button.dataset.managerSave, {
        method: "PUT",
        body: {
          name: row.querySelector("[data-manager-name]").value.trim(),
          login: row.querySelector("[data-manager-login]").value.trim(),
          password: row.querySelector("[data-manager-password]").value,
          telegram_chat_id: row.querySelector("[data-manager-chat]").value.trim(),
          telegram_thread_id: row.querySelector("[data-manager-thread]").value.trim(),
          active: row.querySelector("[data-manager-active]").value === "1",
        },
      });
      toast("Менеджер сохранён");
      await loadManagers();
    } catch (error) {
      toast("Ошибка: " + error.message);
    } finally {
      button.disabled = false;
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
      const customer = o.customer || {};
      return `
      <tr data-order-row="${o.id}">
        <td class="onum">${esc(o.number)}</td>
        <td class="odate">${esc((o.created_at || "").slice(0, 16).replace("T", " "))}</td>
        <td><b>${esc(o.manager_name || customer.assigned_manager || "—")}</b></td>
        <td class="ocust">${renderCustomerCell(customer)}</td>
        <td>${o.order_type === "retail" ? "Розница" : "Опт"}</td>
        <td class="oitems">${o.items.map(renderOrderItem).join("")}</td>
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
        <td class="otracking">
          <input class="ainput ainput--tracking" data-order-tracking="${o.id}" value="${esc(o.tracking_number || "")}" maxlength="80" aria-label="Трек-номер заказа ${esc(o.number)}" placeholder="Не назначен">
          <button class="abtn" type="button" data-order-tracking-save="${o.id}">Сохранить</button>
        </td>
      </tr>`;
    }).join("") || `<tr><td colspan="10" style="text-align:center;color:var(--soft);padding:36px">Заказов пока нет</td></tr>`;
  }

  $("#order-table").addEventListener("change", async (e) => {
    const orderSel = e.target.closest("[data-order]");
    const paymentSel = e.target.closest("[data-payment]");
    if (!orderSel && !paymentSel) return;
    try {
      if (orderSel) {
        const tracking = orderSel.closest("[data-order-row]")?.querySelector("[data-order-tracking]")?.value.trim() || "";
        await api("/api/admin/orders/" + orderSel.dataset.order, { method: "PUT", body: { status: orderSel.value, tracking_number: tracking } });
        orderSel.classList.toggle("osel--new", orderSel.value === "new");
        toast("Статус обновлён");
      }
      if (paymentSel) {
        await api("/api/admin/payments/" + paymentSel.dataset.payment, { method: "PUT", body: { status: paymentSel.value } });
        toast("Оплата обновлена");
      }
      loadOrders();
    } catch (ex) { toast("Ошибка: " + ex.message); }
  });

  $("#order-table").addEventListener("click", async (e) => {
    const button = e.target.closest("[data-order-tracking-save]");
    if (!button) return;
    const row = button.closest("[data-order-row]");
    const status = row?.querySelector("[data-order]")?.value;
    const tracking = row?.querySelector("[data-order-tracking]")?.value.trim() || "";
    if (!row || !status) return;
    button.disabled = true;
    try {
      await api("/api/admin/orders/" + button.dataset.orderTrackingSave, {
        method: "PUT",
        body: { status, tracking_number: tracking },
      });
      toast("Трек-номер сохранён");
      await loadOrders();
    } catch (ex) {
      toast("Ошибка: " + ex.message);
    } finally {
      button.disabled = false;
    }
  });

  /* ================= REVIEWS ================= */
  async function loadReviews() {
    reviews = await api("/api/admin/reviews");
    const pending = reviews.filter((r) => r.status === "pending").length;
    const badge = $("#reviews-badge");
    badge.hidden = !pending;
    badge.textContent = pending;
    $("#review-count").textContent = "· " + reviews.length;
    $("#review-table tbody").innerHTML = reviews.map((r) => `
      <tr>
        <td class="odate">${esc((r.created_at || "").slice(0, 16).replace("T", " "))}</td>
        <td class="ocust">${esc(r.customer_name || "—")}<small>${esc(r.customer_email || "")}</small></td>
        <td class="onum">${esc(r.product_slug || r.product_id || "—")}</td>
        <td>${"★".repeat(Number(r.rating) || 0)}</td>
        <td class="oitems">${esc(r.comment || "—")}</td>
        <td>
          <select class="osel ${r.status === "pending" ? "osel--new" : ""}" data-review="${r.id}">
            <option value="pending" ${r.status === "pending" ? "selected" : ""}>⏳ На модерации</option>
            <option value="approved" ${r.status === "approved" ? "selected" : ""}>✅ Опубликован</option>
            <option value="rejected" ${r.status === "rejected" ? "selected" : ""}>✖ Отклонён</option>
          </select>
        </td>
      </tr>`).join("") || `<tr><td colspan="6" style="text-align:center;color:var(--soft);padding:36px">Отзывов пока нет</td></tr>`;
  }

  $("#review-table").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-review]");
    if (!sel) return;
    try {
      await api("/api/admin/reviews/" + sel.dataset.review, { method: "PUT", body: { status: sel.value } });
      toast("Отзыв обновлён");
      loadReviews();
    } catch (ex) { toast("Ошибка: " + ex.message); }
  });

  /* ================= CHAT ================= */
  async function loadChat() {
    chats = await api("/api/admin/chat");
    const open = chats.filter((c) => ["escalated", "open"].includes(c.status)).length;
    const badge = $("#chat-badge");
    badge.hidden = !open;
    badge.textContent = open;
    $("#chat-count").textContent = "· " + chats.length;
    $("#chat-table tbody").innerHTML = chats.map((c) => `
      <tr>
        <td class="odate">${esc((c.created_at || "").slice(0, 16).replace("T", " "))}</td>
        <td class="ocust">
          ${esc(c.customer_name || c.visitor_name || "Visitor")}
          <small>${esc(c.customer_email || c.visitor_email || "")}</small>
          <small>${esc(c.visitor_phone || "")}</small>
        </td>
        <td class="oitems">${(c.messages || []).slice(-4).map((m) => `<b>${esc(m.sender_type)}:</b> ${esc(m.message)}`).join("<br>")}</td>
        <td>
          <select class="osel ${c.status === "escalated" ? "osel--new" : ""}" data-chat="${c.id}">
            <option value="bot" ${c.status === "bot" ? "selected" : ""}>Bot</option>
            <option value="escalated" ${c.status === "escalated" ? "selected" : ""}>Escalated</option>
            <option value="open" ${c.status === "open" ? "selected" : ""}>Open</option>
            <option value="closed" ${c.status === "closed" ? "selected" : ""}>Closed</option>
          </select>
        </td>
      </tr>`).join("") || `<tr><td colspan="4" style="text-align:center;color:var(--soft);padding:36px">Чатов пока нет</td></tr>`;
  }

  $("#chat-table").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-chat]");
    if (!sel) return;
    try {
      await api("/api/admin/chat/" + sel.dataset.chat, { method: "PUT", body: { status: sel.value } });
      toast("Статус чата обновлён");
      loadChat();
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

  /* розничная цена (за штуку в пачке) = оптовая + наценка из настроек */
  let packMarkup = 20;
  function syncRetailFromWholesale(force) {
    const w = Number(String($("#f-wholesale-price").value).replace(",", "."));
    const r = $("#f-retail-price");
    if (!Number.isFinite(w) || w <= 0) return;
    if (!force && r.dataset.touched === "1") return;
    r.value = Math.round(w * (1 + packMarkup / 100) * 100) / 100;
  }
  document.addEventListener("input", (e) => {
    if (e.target.id === "f-wholesale-price") syncRetailFromWholesale();
    if (e.target.id === "f-retail-price") e.target.dataset.touched = "1";
  });

  /* ================= СПРАВОЧНИКИ ================= */
  const DICT_KINDS = ["material", "composition", "season", "sizes"];
  const DICT_META = {
    material: { title: "Полотно (материал)", ph: "Например: Штапель" },
    composition: { title: "Состав ткани", ph: "Например: 100% хлопок" },
    season: { title: "Сезон", ph: "Например: Всесезонный" },
    sizes: { title: "Размерный ряд", ph: "Например: 46, 48, 50, 52, 54" },
  };
  const EMPTY_DICT = () => ({ material: [], composition: [], season: [], sizes: [] });
  let dicts = EMPTY_DICT();
  let dictUsage = EMPTY_DICT();
  let dictDraft = null;          /* {kind: [{value, orig}]} — orig нужен, чтобы отличить правку от нового значения */
  let dictDirty = false;

  const natCmp = (a, b) => String(a).localeCompare(String(b), "ru", { numeric: true, sensitivity: "base" });
  /* ряд из одного значения («Свободный размер») — пачка стандартная, 6 изделий */
  const dictPack = (v) => {
    const n = String(v).split(",").map((x) => x.trim()).filter(Boolean).length;
    return n > 1 ? n : 6;
  };
  function dictNormalize(kind, v) {
    const value = String(v ?? "").replace(/\s+/g, " ").trim();
    return kind === "sizes" ? value.split(",").map((x) => x.trim()).filter(Boolean).join(", ") : value;
  }

  /* значение товара, которого нет в списке, добавляем отдельным пунктом — иначе оно потеряется */
  function fillDictSelect(el, current) {
    if (!el) return;
    const value = String(current ?? "");
    const list = dicts[el.dataset.dict] || [];
    const values = value && !list.includes(value) ? [value, ...list] : list;
    el.innerHTML = `<option value="">—</option>` + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    el.value = value;
  }

  function applyDicts(res) {
    dicts = EMPTY_DICT();
    dictUsage = EMPTY_DICT();
    DICT_KINDS.forEach((k) => {
      dicts[k] = Array.isArray(res?.[k]) ? res[k] : [];
      dictUsage[k] = (res?.usage || {})[k] || {};
    });
    dictDraft = Object.fromEntries(DICT_KINDS.map((k) => [k, dicts[k].map((v) => ({ value: v, orig: v }))]));
    setDictDirty(false);
  }

  function setDictDirty(on) {
    dictDirty = !!on;
    const el = $("#dict-state");
    if (el) el.hidden = !dictDirty;
  }

  async function loadDicts() {
    try { applyDicts(await api("/api/admin/dictionaries")); }
    catch (ex) { toast("Справочники недоступны: " + ex.message); applyDicts({}); }
  }

  function dictRowHtml(kind, row, i, used) {
    const n = used[row.orig || row.value] || 0;
    const pack = kind === "sizes" && row.value ? `<i class="dictrow__pack">пачка ${dictPack(row.value)} шт</i>` : "";
    return `<div class="dictrow" data-i="${i}">
      <input class="ainput dictrow__in" value="${esc(row.value)}" data-dict-edit="${kind}">
      ${pack}
      <i class="dictrow__use${n ? "" : " is-zero"}">${n ? n + " тов." : "не исп."}</i>
      <button class="dictrow__b" type="button" data-dict-move="up" data-kind="${kind}" title="Выше">↑</button>
      <button class="dictrow__b" type="button" data-dict-move="down" data-kind="${kind}" title="Ниже">↓</button>
      <button class="dictrow__b dictrow__b--del" type="button" data-dict-del="${kind}" title="Удалить">✕</button>
    </div>`;
  }

  function renderDicts() {
    const grid = $("#dict-grid");
    if (!grid) return;
    if (!dictDraft) dictDraft = Object.fromEntries(DICT_KINDS.map((k) => [k, []]));
    grid.innerHTML = DICT_KINDS.map((kind) => {
      const rows = dictDraft[kind];
      const used = dictUsage[kind] || {};
      const orphans = Object.keys(used).filter((v) => !rows.some((r) => dictNormalize(kind, r.value) === v));
      return `<div class="card dictcard" data-kind="${kind}">
        <h3>${esc(DICT_META[kind].title)} <i class="dictcard__n">${rows.length}</i></h3>
        <div class="dictlist">${rows.map((r, i) => dictRowHtml(kind, r, i, used)).join("")
          || `<p class="hint" style="margin:6px 0">Список пуст — добавьте первое значение.</p>`}</div>
        <div class="dictadd">
          <input class="ainput" data-dict-new="${kind}" placeholder="${esc(DICT_META[kind].ph)}">
          <button class="abtn" type="button" data-dict-add="${kind}">Добавить</button>
          <button class="abtn" type="button" data-dict-sort="${kind}">Сортировать</button>
        </div>
        ${orphans.length ? `<p class="hint dictcard__warn">В каталоге используется ${orphans.length} значение(й) не из списка: ${esc(orphans.slice(0, 3).join(", "))}${orphans.length > 3 ? "…" : ""}</p>` : ""}
      </div>`;
    }).join("");
  }

  function loadDictView() { renderDicts(); }

  function dictAdd(kind, raw) {
    const value = dictNormalize(kind, raw);
    if (!value) return false;
    if (dictDraft[kind].some((r) => dictNormalize(kind, r.value).toLowerCase() === value.toLowerCase())) {
      toast("Такое значение уже есть в списке");
      return false;
    }
    dictDraft[kind].push({ value, orig: "" });
    setDictDirty(true);
    return true;
  }

  $("#dict-grid")?.addEventListener("click", (e) => {
    const add = e.target.closest("[data-dict-add]");
    if (add) {
      const kind = add.dataset.dictAdd;
      const input = $(`[data-dict-new="${kind}"]`);
      if (dictAdd(kind, input.value)) { input.value = ""; renderDicts(); $(`[data-dict-new="${kind}"]`)?.focus(); }
      return;
    }
    const sort = e.target.closest("[data-dict-sort]");
    if (sort) {
      const kind = sort.dataset.dictSort;
      dictDraft[kind].sort((a, b) => natCmp(a.value, b.value));
      setDictDirty(true); renderDicts();
      return;
    }
    const del = e.target.closest("[data-dict-del]");
    if (del) {
      const kind = del.dataset.dictDel;
      const i = Number(del.closest(".dictrow").dataset.i);
      dictDraft[kind].splice(i, 1);
      setDictDirty(true); renderDicts();
      return;
    }
    const move = e.target.closest("[data-dict-move]");
    if (move) {
      const kind = move.dataset.kind;
      const i = Number(move.closest(".dictrow").dataset.i);
      const j = move.dataset.dictMove === "up" ? i - 1 : i + 1;
      const list = dictDraft[kind];
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      setDictDirty(true); renderDicts();
    }
  });

  /* правка идёт в черновик без перерисовки, иначе поле теряет фокус на каждом символе */
  $("#dict-grid")?.addEventListener("input", (e) => {
    const edit = e.target.closest("[data-dict-edit]");
    if (edit) {
      dictDraft[edit.dataset.dictEdit][Number(edit.closest(".dictrow").dataset.i)].value = edit.value;
      setDictDirty(true);
    }
  });
  $("#dict-grid")?.addEventListener("change", (e) => {
    if (e.target.closest("[data-dict-edit]")) renderDicts();
  });
  $("#dict-grid")?.addEventListener("keydown", (e) => {
    const input = e.target.closest("[data-dict-new]");
    if (input && e.key === "Enter") {
      e.preventDefault();
      const kind = input.dataset.dictNew;
      if (dictAdd(kind, input.value)) { input.value = ""; renderDicts(); $(`[data-dict-new="${kind}"]`)?.focus(); }
    }
  });

  async function saveDicts() {
    const values = {};
    const renames = [];
    for (const kind of DICT_KINDS) {
      const seen = new Set();
      const out = [];
      for (const row of dictDraft[kind]) {
        const v = dictNormalize(kind, row.value);
        if (!v || seen.has(v.toLowerCase())) continue;
        seen.add(v.toLowerCase());
        out.push(v);
        if (row.orig && row.orig !== v && (dictUsage[kind] || {})[row.orig]) renames.push({ kind, from: row.orig, to: v });
      }
      values[kind] = out;
    }

    /* значения, которые остаются в товарах, но пропадают из списка */
    const lost = [];
    for (const kind of DICT_KINDS) {
      for (const [v, n] of Object.entries(dictUsage[kind] || {})) {
        if (values[kind].includes(v)) continue;
        if (renames.some((r) => r.kind === kind && r.from === v)) continue;
        lost.push(`${DICT_META[kind].title}: ${v} — ${n} тов.`);
      }
    }
    if (lost.length && !confirm(
      "Эти значения используются в товарах, но их не будет в списке:\n\n"
      + lost.slice(0, 12).join("\n") + (lost.length > 12 ? `\n…и ещё ${lost.length - 12}` : "")
      + "\n\nВ товарах они останутся, но выбрать их заново будет нельзя. Продолжить?"
    )) return;

    const btn = $("#dict-save");
    btn.disabled = true;
    try {
      let renamed = 0;
      for (const r of renames) {
        const res = await api("/api/admin/dictionaries/rename", { method: "POST", body: r });
        renamed += Number(res.renamed) || 0;
      }
      applyDicts(await api("/api/admin/dictionaries", { method: "PUT", body: values }));
      renderDicts();
      const m = $("#dict-msg");
      m.className = "formerr formerr--ok";
      m.textContent = renamed ? `Сохранено ✓ Обновлено товаров: ${renamed}` : "Сохранено ✓";
      m.hidden = false;
      setTimeout(() => (m.hidden = true), 3500);
    } catch (ex) {
      const m = $("#dict-msg");
      m.className = "formerr";
      m.textContent = "Не удалось сохранить: " + ex.message;
      m.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  $("#dict-save")?.addEventListener("click", saveDicts);

  /* пачка = число размеров выбранного ряда */
  function syncMoqFromSizes() {
    const n = ($("#f-sizes")?.value || "").split(",").map((v) => v.trim()).filter(Boolean).length;
    const el = $("#f-wholesale-moq");
    if (el) el.value = n > 1 ? n : 6;
  }
  $("#f-sizes")?.addEventListener("change", () => { syncMoqFromSizes(); updateEditChecklist(); });

  /* ================= SETTINGS ================= */
  const S_KEYS = ["phone", "whatsapp", "telegram", "instagram", "email", "address_ru", "address_uz", "address_en", "currency", "currency_pos", "hero_gap", "pack_markup", "preorder_min", "preorder_max", "admin_user"];

  async function loadSettings() {
    const s = await api("/api/admin/settings");
    S_KEYS.forEach((k) => { const el = $("#s-" + k); if (el) el.value = s[k] ?? ""; });
    packMarkup = Number(s.pack_markup) || 20;
    if ($("#s-currency")) $("#s-currency").value = "$";
    if ($("#s-currency_pos")) $("#s-currency_pos").value = "before";
  }

  $("#set-save").addEventListener("click", async () => {
    const body = {};
    S_KEYS.forEach((k) => { const el = $("#s-" + k); if (el) body[k] = el.value; });
    body.currency = "$";
    body.currency_pos = "before";
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
    const cap = 64;
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
      await loadDicts();
      showApp();
    } catch { location.replace("/admin"); }
  })();
})();

/* ============================================================
   КОНСТРУКТОР САЙТА — секции главной + тексты (site_config)
   ============================================================ */
(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $("#view-builder");
  if (!view) return;

  const SECTIONS = [
    ["promo",       "Промо-строка (верх сайта)", false],
    ["hero",        "Главный баннер (видео)", true],
    ["services",    "Преимущества (3 колонки)", true],
    ["catstrip",    "Сезонная лента (Лето 2026)", true],
    ["categories",  "Категории — 4 плитки", true],
    ["bestsellers", "Хиты продаж", true],
    ["types",       "Тип одежды", true],
    ["lookbook",    "Галерея-лукбук", true],
    ["band",        "Чёрная полоса (CTA)", true],
    ["maison",      "Бренд / фабрика", true],
    ["wholesale",   "Как работает опт", true],
    ["faq",         "Частые вопросы", true],
    ["map",         "Карта — как нас найти", true],
  ];

  const SCHEMA = [
    ["Промо-строка", [["best.ship", "Текст промо-строки", 1]]],
    ["Сезонная лента", [["season.label", "Заголовок сезона (напр. Лето 2026)"]]],
    ["Главный экран", [
      ["hero.overline", "Надстрочник"], ["hero.t1", "Заголовок — строка 1"],
      ["hero.t2", "Заголовок — строка 2"], ["hero.cta", "Кнопка на баннере (Перейти)"], ["nav.viewCatalog", "Кнопка «Смотреть каталог»"]]],
    ["Преимущества (3 колонки)", [
      ["ws.p1", "Колонка 1 — заголовок"], ["ws.p2d", "Колонка 1 — текст"],
      ["ws.p4", "Колонка 2 — заголовок"], ["ws.p4d", "Колонка 2 — текст"],
      ["hero.proof2", "Колонка 3 — заголовок"], ["flow.s3d", "Колонка 3 — текст"]]],
    ["Категории", [
      ["cats.t1", "Заголовок — часть 1"], ["cats.t2", "Заголовок — часть 2"],
      ["cats.women", "Женщинам"], ["mq.4", "Женщинам — подпись"],
      ["cats.men", "Мужчинам"], ["mq.2", "Мужчинам — подпись"],
      ["cats.kids", "Детям"], ["mq.3", "Детям — подпись"],
      ["cats.family", "Для всей семьи"], ["cats.familyNote", "Для всей семьи — подпись"],
      ["preview.explore", "Кнопка «Смотреть»"]]],
    ["Хиты продаж", [
      ["best.t1", "Заголовок — часть 1"], ["best.t2", "Заголовок — часть 2"], ["best.cta", "Кнопка"]]],
    ["Тип одежды", [
      ["shop.clothing", "Заголовок ленты"], ["cats.pajamas", "Пижамы"], ["cats.robes", "Халаты"],
      ["cats.homewear", "Домашняя одежда"], ["cats.loungewear", "Лаунж-сеты"]]],
    ["Галерея-лукбук", [
      ["look.over", "Надстрочник"], ["look.t1", "Заголовок — часть 1"], ["look.t2", "Заголовок — часть 2"],
      ["look.side", "Подпись"], ["coll.hint", "Подсказка управления"]]],
    ["Чёрная полоса (CTA)", [
      ["ws.over", "Надстрочник"], ["close.t1", "Заголовок — часть 1"], ["close.t2", "Заголовок — часть 2"],
      ["ws.text", "Текст", 1], ["ws.wa", "Ссылка WhatsApp"], ["ws.tg", "Ссылка Telegram"], ["close.showroom", "Подпись фабрики"]]],
    ["Бренд / фабрика", [
      ["mai.over", "Надстрочник"], ["mai.t1", "Заголовок — часть 1"], ["mai.t2", "Заголовок — часть 2"],
      ["mai.text", "Текст о бренде", 1],
      ["ws.p1d", "Пункт 1 — пояснение"], ["ws.p2", "Пункт 2 — заголовок"],
      ["ws.p3", "Пункт 3 — заголовок"], ["ws.p3d", "Пункт 3 — пояснение"]]],
    ["Как работает опт", [
      ["flow.over", "Надстрочник"], ["flow.t1", "Заголовок — часть 1"], ["flow.t2", "Заголовок — часть 2"],
      ["flow.s1", "Шаг 1"], ["flow.s1d", "Шаг 1 — текст", 1],
      ["flow.s2", "Шаг 2"], ["flow.s2d", "Шаг 2 — текст", 1],
      ["flow.s3", "Шаг 3"], ["flow.s4", "Шаг 4"], ["flow.s4d", "Шаг 4 — текст", 1]]],
    ["Частые вопросы", [
      ["faq.t1", "Заголовок — часть 1"], ["faq.t2", "Заголовок — часть 2"],
      ["faq.q1", "Вопрос 1"], ["faq.a1", "Ответ 1", 1],
      ["faq.q2", "Вопрос 2"], ["faq.a2", "Ответ 2", 1],
      ["faq.q3", "Вопрос 3"], ["faq.a3", "Ответ 3", 1],
      ["faq.q4", "Вопрос 4"], ["faq.a4", "Ответ 4", 1],
      ["faq.q5", "Вопрос 5"], ["faq.a5", "Ответ 5", 1]]],
    ["Популярные товары", [["pop.title", "Заголовок ленты"]]],
    ["Шапка и меню", [
      ["nav.shop", "Пункт «Все товары»"], ["nav.bestsellers", "Пункт «Бестселлеры»"],
      ["terms.navOrdering", "Пункт «Как работает заказ»"], ["nav.maison", "Пункт «О нас»"],
      ["shop.search", "Плейсхолдер поиска"]]],
    ["О нас — факты о производстве", [
      ["mai.t1", "Заголовок раздела"], ["mai.text", "Описание компании", 1],
      ["about.quote", "Акцентная фраза", 1],
      ["about.s1n", "Цифра 1"], ["about.s1l", "Подпись 1"],
      ["about.s2n", "Цифра 2"], ["about.s2l", "Подпись 2"],
      ["about.s3n", "Цифра 3"], ["about.s3l", "Подпись 3"],
      ["about.s4n", "Цифра 4"], ["about.s4l", "Подпись 4"],
      ["about.s5n", "Цифра 5"], ["about.s5l", "Подпись 5"],
      ["about.s6n", "Цифра 6"], ["about.s6l", "Подпись 6"],
      ["about.c1t", "Карточка 1 — заголовок"], ["about.c1d", "Карточка 1 — текст", 1],
      ["about.c2t", "Карточка 2 — заголовок"], ["about.c2d", "Карточка 2 — текст", 1],
      ["about.c3t", "Карточка 3 — заголовок"], ["about.c3d", "Карточка 3 — текст", 1],
      ["about.c4t", "Карточка 4 — заголовок"], ["about.c4d", "Карточка 4 — текст", 1],
      ["about.c5t", "Карточка 5 — заголовок"], ["about.c5d", "Карточка 5 — текст", 1],
      ["about.c6t", "Карточка 6 — заголовок"], ["about.c6d", "Карточка 6 — текст", 1],
      ["about.factT", "Производства — заголовок"],
      ["about.f1", "Фабрика 1"], ["about.f2", "Фабрика 2"], ["about.f3", "Фабрика 3"],
      ["about.exportT", "География поставок — заголовок"], ["about.countries", "Список стран", 1]]],
    ["Подвал", [
      ["foot.tag", "Описание под логотипом", 1], ["foot.nl", "Заголовок рассылки"], ["foot.nlNote", "Подпись рассылки"]]],
  ];

  let cfg = { sections: { order: [], hidden: [] }, texts: { ru: {}, uz: {}, en: {} }, hero: { slides: [] }, typography: {} };
  let defaults = { ru: {}, uz: {}, en: {} };
  let curLang = "ru";
  let order = SECTIONS.filter(([, , mov]) => mov).map(([id]) => id);

  const secsBox = $("#b-sections");
  const textsBox = $("#b-texts");
  const msg = $("#b-msg");

  function note(text, ok) {
    msg.textContent = text;
    msg.hidden = !text;
    msg.classList.toggle("formerr--ok", Boolean(ok));
  }

  /* ---------- секции ---------- */
  function renderSections() {
    const hidden = new Set(cfg.sections.hidden || []);
    const rows = [SECTIONS[0], ...order.map((id) => SECTIONS.find((s) => s[0] === id))];
    secsBox.innerHTML = rows.map(([id, label, movable], i) => `
      <div class="bsec" data-sec="${id}">
        <div class="bsec__move">
          ${movable ? `<button type="button" data-mv="-1" title="Выше" ${i <= 1 ? "disabled" : ""}>↑</button>
          <button type="button" data-mv="1" title="Ниже" ${i === rows.length - 1 ? "disabled" : ""}>↓</button>` : ""}
        </div>
        <span class="bsec__name">${label}</span>
        <button type="button" class="tgl ${hidden.has(id) ? "" : "is-on"}" data-tgl title="Показывать блок"></button>
      </div>`).join("");
  }

  secsBox.addEventListener("click", (e) => {
    const row = e.target.closest(".bsec");
    if (!row) return;
    const id = row.dataset.sec;
    const mv = e.target.closest("[data-mv]");
    if (mv) {
      const d = Number(mv.dataset.mv);
      const i = order.indexOf(id);
      const j = i + d;
      if (i >= 0 && j >= 0 && j < order.length) {
        [order[i], order[j]] = [order[j], order[i]];
        cfg.sections.order = order.slice();
        renderSections();
      }
    }
    if (e.target.closest("[data-tgl]")) {
      const hidden = new Set(cfg.sections.hidden || []);
      hidden.has(id) ? hidden.delete(id) : hidden.add(id);
      cfg.sections.hidden = [...hidden];
      renderSections();
    }
  });

  /* ---------- тексты ---------- */
  function renderTexts() {
    const dict = defaults[curLang] || {};
    const over = cfg.texts[curLang] || {};
    textsBox.innerHTML = SCHEMA.map(([group, keys]) => `
      <div class="bgrp">
        <h4>${group}</h4>
        ${keys.map(([key, label, area]) => {
          const def = String(dict[key] ?? "").replace(/"/g, "&quot;");
          const val = String(over[key] ?? "").replace(/"/g, "&quot;");
          return `<div class="brow"><span>${label}</span>
            <div class="redit${area ? " redit--area" : ""}">
              <div class="redit__bar" contenteditable="false">
                <button type="button" data-rcmd="bold" title="Жирный"><b>Ж</b></button>
                <button type="button" data-rcmd="italic" title="Курсив"><i>К</i></button>
                <button type="button" data-rcmd="underline" title="Подчёркнутый"><u>Ч</u></button>
                <button type="button" data-rcmd="strikeThrough" title="Зачёркнутый"><s>А</s></button>
                <button type="button" data-rcmd="link" title="Ссылка">&#128279;</button>
                <button type="button" data-rcmd="clear" title="Убрать форматирование">&#10005;</button>
              </div>
              <div class="ainput redit__area" contenteditable="true" data-bkey="${key}" data-ph="${def}">${over[key] ?? ""}</div>
            </div></div>`;
        }).join("")}
      </div>`).join("");
  }

  /* мини-санитайзер: b/i/u/s/br/a[href] */
  function rSanitize(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html);
    const SAFE = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, BR: 1, A: 1 };
    const KILL = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1 };
    (function walk(node) {
      [...node.children].forEach((el) => {
        if (KILL[el.tagName]) { el.remove(); return; }
        walk(el);
        if (!SAFE[el.tagName]) {
          if ((el.tagName === "DIV" || el.tagName === "P") && el.previousSibling) el.parentNode.insertBefore(document.createElement("br"), el);
          el.replaceWith(...el.childNodes); return;
        }
        [...el.attributes].forEach((a) => {
          if (el.tagName === "A" && a.name === "href" && /^(https?:\/\/|\/|#|tel:|mailto:)/i.test(a.value)) return;
          el.removeAttribute(a.name);
        });
      });
    })(tpl.content);
    return tpl.innerHTML;
  }

  function rSave(el) {
    const clean = rSanitize(el.innerHTML)
      .replace(/\u200B/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/^(\s|<br>)+|(\s|<br>)+$/g, "");
    const hasText = el.textContent.trim().length > 0;
    if (!cfg.texts[curLang]) cfg.texts[curLang] = {};
    if (hasText) cfg.texts[curLang][el.dataset.bkey] = clean;
    else delete cfg.texts[curLang][el.dataset.bkey];
  }

  textsBox.addEventListener("input", (e) => {
    const el = e.target.closest("[data-bkey]");
    if (el) rSave(el);
  });

  /* Enter = перенос строки (не блок) */
  textsBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.closest("[data-bkey]")) {
      e.preventDefault();
      document.execCommand("insertHTML", false, "<br>\u200B");
    }
  });

  /* панель форматирования */
  textsBox.addEventListener("mousedown", (e) => {
    if (e.target.closest("[data-rcmd]")) e.preventDefault(); /* не терять выделение */
  });
  textsBox.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rcmd]");
    if (!b) return;
    const area = b.closest(".redit").querySelector("[data-bkey]");
    area.focus();
    const cmd = b.dataset.rcmd;
    if (cmd === "link") {
      const url = prompt("Ссылка (URL или /страница):", "https://");
      if (url && url !== "https://") document.execCommand("createLink", false, url.trim());
    } else if (cmd === "clear") {
      document.execCommand("removeFormat");
      document.execCommand("unlink");
    } else {
      document.execCommand(cmd);
    }
    rSave(area);
  });

  $("#b-langtabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-blang]");
    if (!b) return;
    curLang = b.dataset.blang;
    document.querySelectorAll("#b-langtabs button").forEach((x) => x.classList.toggle("is-on", x === b));
    renderTexts();
  });

  /* ---------- hero-слайдер ---------- */
  const hsList = $("#hs-list");
  const hsFile = $("#hs-file");
  let hsTarget = -1; /* -1 = новый слайд, иначе замена медиа */

  const hesc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function renderSlides() {
    if (!hsList) return;
    const slides = cfg.hero.slides;
    if (!slides.length) {
      hsList.innerHTML = '<div class="account-empty"><p>Слайдов нет — на сайте показывается стандартное видео. Нажмите «+ Добавить слайд».</p></div>';
      return;
    }
    hsList.innerHTML = slides.map((s, i) => `
      <div class="hsrow" data-i="${i}">
        <div class="hsrow__thumb">
          ${s.type === "video"
            ? `<video src="${hesc(s.src)}" muted preload="metadata"></video><span class="hsrow__badge">VIDEO</span>`
            : `<img src="${hesc(s.src)}" alt="">`}
        </div>
        <div class="hsrow__fields">
          <div class="hsbar redit__bar" contenteditable="false">
            <button type="button" data-hsfmt="bold" title="Жирный"><b>Ж</b></button>
            <button type="button" data-hsfmt="italic" title="Курсив"><i>К</i></button>
            <button type="button" data-hsfmt="underline" title="Подчёркнутый"><u>Ч</u></button>
            <button type="button" data-hsfmt="clear" title="Убрать форматирование">&#10005;</button>
            <span class="hsbar__sep"></span>
            <button type="button" data-hsalign="left" class="${(s.align || "left") === "left" ? "is-on" : ""}" title="Влево">&#9664;</button>
            <button type="button" data-hsalign="center" class="${s.align === "center" ? "is-on" : ""}" title="По центру">&#9679;</button>
            <button type="button" data-hsalign="right" class="${s.align === "right" ? "is-on" : ""}" title="Вправо">&#9654;</button>
            <span class="hsbar__sep"></span>
            <label class="hsbar__scale">Размер <select data-hsscale>${[70, 80, 90, 100, 110, 120, 130].map((v) => `<option value="${v}"${(Number(s.scale) || 100) === v ? " selected" : ""}>${v}%</option>`).join("")}</select></label>
          </div>
          <div class="ainput redit__area redit__area--mini" contenteditable="true" data-hst="ru" data-ph="Заголовок (RU)">${s.title_ru || ""}</div>
          <div class="ainput redit__area redit__area--mini" contenteditable="true" data-hst="uz" data-ph="Sarlavha (UZ)">${s.title_uz || ""}</div>
          <div class="ainput redit__area redit__area--mini" contenteditable="true" data-hst="en" data-ph="Title (EN)">${s.title_en || ""}</div>
          <div class="ainput redit__area redit__area--mini" contenteditable="true" data-hss="ru" data-ph="Подзаголовок курсивом (RU)">${s.sub_ru || ""}</div>
          <div class="ainput redit__area redit__area--mini" contenteditable="true" data-hss="uz" data-ph="Kursiv pastki sarlavha (UZ)">${s.sub_uz || ""}</div>
          <div class="ainput redit__area redit__area--mini" contenteditable="true" data-hss="en" data-ph="Italic subtitle (EN)">${s.sub_en || ""}</div>
          <input class="ainput" data-hsl placeholder="Ссылка кнопки «Перейти» (напр. /shop?category=robes) — пусто = /shop" value="${hesc(s.href || "")}">
        </div>
        <div class="hsrow__act">
          <button type="button" data-hsmv="-1" title="Выше" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-hsmv="1" title="Ниже" ${i === slides.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" data-hsrep title="Заменить фото/видео">⇆</button>
          <button type="button" data-hsdel class="del" title="Удалить">✕</button>
        </div>
      </div>`).join("");
  }

  async function hsUpload(file) {
    const r = await fetch("/api/admin/upload", { method: "POST", body: await file.arrayBuffer() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "upload_failed");
    return d; /* {url, kind} */
  }

  if (hsList) {
    $("#hs-interval")?.addEventListener("input", (e) => {
      const v = Math.max(2, Math.min(20, Number(e.target.value) || 6));
      cfg.hero.interval = v;
    });
    $("#hs-add")?.addEventListener("click", () => { hsTarget = -1; hsFile.value = ""; hsFile.click(); });

    hsFile?.addEventListener("change", async () => {
      const f = hsFile.files && hsFile.files[0];
      if (!f) return;
      note("Загружаем медиа…", true);
      try {
        const d = await hsUpload(f);
        if (hsTarget >= 0 && cfg.hero.slides[hsTarget]) {
          cfg.hero.slides[hsTarget].src = d.url;
          cfg.hero.slides[hsTarget].type = d.kind;
        } else {
          cfg.hero.slides.push({ type: d.kind, src: d.url, title_ru: "", title_uz: "", title_en: "", sub_ru: "", sub_uz: "", sub_en: "", href: "", align: "", scale: 100 });
        }
        renderSlides();
        note("Медиа загружено. Не забудьте «Сохранить».", true);
      } catch (ex) {
        note(ex.message === "format_not_allowed" ? "Формат не поддерживается (JPG/PNG/WebP/MP4/WebM)."
          : ex.message === "too_large" ? "Файл больше 64 МБ."
          : "Не удалось загрузить файл.");
      }
    });

    function hsField(inp, s) {
      const val = inp.isContentEditable
        ? (inp.textContent.trim()
            ? rSanitize(inp.innerHTML).replace(/\u200B/g, "").replace(/&nbsp;/g, " ").replace(/^(\s|<br>)+|(\s|<br>)+$/g, "")
            : "")
        : inp.value.trim();
      if (inp.dataset.hst !== undefined) s["title_" + inp.dataset.hst] = val;
      else if (inp.dataset.hss !== undefined) s["sub_" + inp.dataset.hss] = val;
      else s.href = val;
    }

    hsList.addEventListener("mousedown", (e) => {
      if (e.target.closest("[data-hsfmt]")) e.preventDefault(); /* не терять выделение */
    });

    hsList.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.closest("[data-hst],[data-hss]")) {
        e.preventDefault();
        document.execCommand("insertHTML", false, "<br>\u200B");
      }
    });

    hsList.addEventListener("change", (e) => {
      const sc = e.target.closest("[data-hsscale]");
      if (!sc) return;
      const s = cfg.hero.slides[Number(sc.closest(".hsrow").dataset.i)];
      if (s) s.scale = Number(sc.value) || 100;
    });

        hsList.addEventListener("click", (e) => {
      const row = e.target.closest(".hsrow");
      if (!row) return;
      const i = Number(row.dataset.i);
      const mv = e.target.closest("[data-hsmv]");
      if (mv) {
        const j = i + Number(mv.dataset.hsmv);
        const s = cfg.hero.slides;
        if (j >= 0 && j < s.length) { [s[i], s[j]] = [s[j], s[i]]; renderSlides(); }
      }
      const fmt = e.target.closest("[data-hsfmt]");
      if (fmt) {
        const cmd = fmt.dataset.hsfmt;
        if (cmd === "clear") document.execCommand("removeFormat");
        else document.execCommand(cmd);
        const ed = document.activeElement;
        const sl = cfg.hero.slides[i];
        if (sl && ed && ed.closest && ed.closest(".hsrow") === row && (ed.dataset.hst !== undefined || ed.dataset.hss !== undefined)) hsField(ed, sl);
        return;
      }
      const al = e.target.closest("[data-hsalign]");
      if (al) {
        const sl = cfg.hero.slides[i];
        if (sl) { sl.align = al.dataset.hsalign === "left" ? "" : al.dataset.hsalign; renderSlides(); }
        return;
      }
      if (e.target.closest("[data-hsrep]")) { hsTarget = i; hsFile.value = ""; hsFile.click(); }
      if (e.target.closest("[data-hsdel]")) { cfg.hero.slides.splice(i, 1); renderSlides(); }
    });

    hsList.addEventListener("input", (e) => {
      const inp = e.target.closest("[data-hst],[data-hss],[data-hsl]");
      if (!inp) return;
      const row = e.target.closest(".hsrow");
      const s = cfg.hero.slides[Number(row.dataset.i)];
      if (!s) return;
      hsField(inp, s);
    });
  }

  /* ---------- типографика ---------- */
  const TY_FIELDS = ["base", "lh", "hscale", "hweight", "hspacing", "hcase", "font"];

  function renderTypo() {
    TY_FIELDS.forEach((k) => {
      const el = $("#ty-" + k);
      if (el) el.value = cfg.typography[k] ?? "";
    });
    const upRow = $("#ty-fontup-row");
    if (upRow) {
      upRow.hidden = cfg.typography.font !== "custom";
      $("#ty-fontname").textContent = cfg.typography.fontName ? "Файл: " + cfg.typography.fontName : "Файл не загружен";
    }
    typoPreview();
  }

  function typoFamily() {
    const t = cfg.typography;
    if (t.font === "system-sans") return '"Helvetica Neue", Arial, sans-serif';
    if (t.font === "system-serif") return 'Georgia, "Times New Roman", serif';
    if (t.font === "custom" && t.fontUrl) {
      if (!typoFamily.loaded || typoFamily.loaded !== t.fontUrl) {
        try {
          const ff = new FontFace("TyCustomPreview", "url(" + t.fontUrl + ")");
          ff.load().then((f) => { document.fonts.add(f); typoPreview(); }).catch(() => {});
          typoFamily.loaded = t.fontUrl;
        } catch {}
      }
      return '"TyCustomPreview", "Lato", sans-serif';
    }
    return '"Lato", "Helvetica Neue", Arial, sans-serif';
  }

  function typoPreview() {
    const p = $("#ty-preview");
    if (!p) return;
    const t = cfg.typography;
    const h = p.querySelector(".typreview__h");
    const txt = p.querySelector(".typreview__t");
    p.style.fontFamily = typoFamily();
    const scale = t.hscale ? Number(t.hscale) / 100 : 1;
    h.style.fontSize = (30 * scale) + "px";
    h.style.fontWeight = t.hweight || "300";
    h.style.letterSpacing = (t.hspacing || "0.01") + "em";
    h.style.textTransform = t.hcase || "none";
    txt.style.fontSize = (t.base || 14) + "px";
    txt.style.lineHeight = t.lh || "1.6";
  }

  TY_FIELDS.forEach((k) => {
    $("#ty-" + k)?.addEventListener("change", (e) => {
      const v = e.target.value;
      if (v === "") delete cfg.typography[k];
      else cfg.typography[k] = v;
      if (k === "font") renderTypo();
      typoPreview();
    });
  });

  $("#ty-fontup")?.addEventListener("click", () => $("#ty-fontfile").click());
  $("#ty-fontfile")?.addEventListener("change", async () => {
    const f = $("#ty-fontfile").files && $("#ty-fontfile").files[0];
    if (!f) return;
    note("Загружаем шрифт…", true);
    try {
      const r = await fetch("/api/admin/upload", { method: "POST", body: await f.arrayBuffer() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.kind !== "font") throw new Error(d.error || "font");
      cfg.typography.font = "custom";
      cfg.typography.fontUrl = d.url;
      cfg.typography.fontName = f.name;
      typoFamily.loaded = null;
      renderTypo();
      note("Шрифт загружен. Не забудьте «Сохранить».", true);
    } catch (ex) {
      note(ex.message === "format_not_allowed" ? "Это не файл шрифта (нужен WOFF2/WOFF/TTF/OTF)." : "Не удалось загрузить шрифт.");
    }
  });

  /* ---------- загрузка / сохранение ---------- */
  async function load() {
    try {
      const [settings, ru, uz, en] = await Promise.all([
        fetch("/api/admin/settings").then((r) => r.json()),
        fetch("/lang/ru.json").then((r) => r.json()),
        fetch("/lang/uz.json").then((r) => r.json()),
        fetch("/lang/en.json").then((r) => r.json()),
      ]);
      defaults = { ru, uz, en };
      if (settings.site_config) {
        try {
          const saved = JSON.parse(settings.site_config);
          cfg = {
            sections: { order: saved.sections?.order || [], hidden: saved.sections?.hidden || [] },
            texts: { ru: saved.texts?.ru || {}, uz: saved.texts?.uz || {}, en: saved.texts?.en || {} },
            hero: { slides: Array.isArray(saved.hero?.slides) ? saved.hero.slides : [], interval: Number(saved.hero?.interval) || 6 },
            typography: saved.typography || {},
          };
        } catch {}
      }
      const movable = SECTIONS.filter(([, , m]) => m).map(([id]) => id);
      const saved = (cfg.sections.order || []).filter((id) => movable.includes(id));
      order = [...saved, ...movable.filter((id) => !saved.includes(id))];
      renderSections();
      renderTexts();
      renderSlides();
      if ($("#hs-interval")) $("#hs-interval").value = cfg.hero.interval || 6;
      renderTypo();
    } catch {
      note("Не удалось загрузить настройки конструктора.");
    }
  }

  $("#b-save").addEventListener("click", async () => {
    note("");
    const btn = $("#b-save");
    btn.disabled = true;
    try {
      cfg.sections.order = order.slice();
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_config: JSON.stringify(cfg) }),
      });
      if (!r.ok) throw new Error();
      note("Сохранено. Обновите сайт, чтобы увидеть изменения.", true);
    } catch {
      note("Не удалось сохранить. Проверьте соединение.");
    } finally {
      btn.disabled = false;
    }
  });

  $("#b-reset").addEventListener("click", async () => {
    if (!confirm("Вернуть все секции и тексты к стандартным?")) return;
    cfg = { sections: { order: [], hidden: [] }, texts: { ru: {}, uz: {}, en: {} }, hero: { slides: [] }, typography: {} };
    order = SECTIONS.filter(([, , m]) => m).map(([id]) => id);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_config: "" }),
      });
      if (!r.ok) throw new Error();
      renderSections();
      renderTexts();
      renderSlides();
      if ($("#hs-interval")) $("#hs-interval").value = 6;
      renderTypo();
      note("Сброшено к стандартному виду.", true);
    } catch {
      note("Не удалось сбросить.");
    }
  });

  document.addEventListener("DOMContentLoaded", load);
  if (document.readyState !== "loading") load();
})();
