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
  const TAG_RU = { bestseller: "Бестселлер", new: "Новинка", sale: "Скидка" };
  const STATUS_RU = { new: "🆕 Новый", processing: "⏳ В работе", shipped: "🚚 Отправлен", done: "✅ Выполнен", cancelled: "✖ Отменён" };
  const PAYMENT_METHOD_RU = { manager: "Менеджер", cash: "Наличные", bank: "Банк", click: "Click", payme: "Payme", card: "Карта" };
  const PAYMENT_STATUS_RU = { pending: "⏳ Ожидает", invoice_sent: "📨 Счёт отправлен", paid: "✅ Оплачено", failed: "⚠ Ошибка", refunded: "↩ Возврат", cancelled: "✖ Отменено" };
  const SUPPORT_STATUS_RU = { new: "🆕 Новый", open: "👀 Открыт", waiting: "⏳ Ждём", done: "✅ Решён", closed: "✖ Закрыт" };
  const SUPPORT_TOPIC_RU = { general: "Общий", catalog: "Каталог", price: "Цена", delivery: "Доставка", defect: "Брак", payment: "Оплата", order: "Заказ" };
  const TIER_RU = { regular: "Обычный", premium: "Премиум", vip: "VIP" };

  let products = [];
  let orders = [];
  let support = [];
  let customers = [];
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
      p.name, p.slug, p.model_no, p.variant, p.gender, p.category, p.tag,
      (p.sizes || []).join(" "), p.desc?.ru, p.desc?.uz, p.desc?.en, p.fabric?.ru, p.fabric?.uz, p.fabric?.en,
    ].filter(Boolean).join(" "));
    const model = smartNormalize([p.model_no, p.variant, p.name].join(" "));
    return tokens.reduce((score, token) => {
      if (!hay.includes(token)) return score;
      let next = score + 8;
      if (model.includes(token)) next += 16;
      if (p.gender === token || p.category === token) next += 12;
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
    await Promise.all([loadProducts(), loadCustomers(), loadOrders(), loadReviews(), loadChat(), loadSupport()]);
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
    ["products", "edit", "customers", "orders", "reviews", "chat", "support", "settings", "design"].forEach((v) => { $("#view-" + v).hidden = v !== name; });
    if (name === "customers") loadCustomers();
    if (name === "orders") loadOrders();
    if (name === "reviews") loadReviews();
    if (name === "chat") loadChat();
    if (name === "support") loadSupport();
    if (name === "settings") loadSettings();
    if (name === "design") loadDesign();
  }

  /* ================= PRODUCTS ================= */
  async function loadProducts() {
    products = await api("/api/admin/products?refresh=1");
    renderProducts();
  }

  function clearAutofilledProductSearch() {
    const input = $("#prod-search");
    if (!input) return;
    const value = input.value.trim().toLowerCase();
    if (value === "admin") {
      input.value = "";
      renderProducts();
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

  $("#prod-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
  $("#prod-search").addEventListener("input", renderProducts);
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
    slugTouched = Boolean(p?.slug);
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
    $("#f-wholesale-price").value = p?.wholesale_price ?? p?.price ?? "";
    $("#f-wholesale-moq").value = 6;
    $("#f-available-qop").value = p?.available_qop ?? "";
    $("#f-retail-price").value = p?.retail_price ?? p?.price ?? "";
    $("#f-retail-stock").value = p?.retail_stock ?? 0;
    $("#f-retail-enabled").checked = p ? !!p.retail_enabled : true;
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
      { ok: Number($("#f-price").value) > 0, label: "Цена" },
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

  $("#f-upload").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    const status = $("#upload-status");
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isVid = /^video\//.test(f.type) || /\.(mp4|webm)$/i.test(f.name);
      const cap = 64;
      if (f.size > cap * 1024 * 1024) { status.textContent = `«${f.name}» больше ${cap} МБ — пропущен.`; continue; }
      status.textContent = `Загрузка ${i + 1} из ${files.length}… ${isVid ? "(видео может занять время)" : ""}`;
      try {
        const buf = await f.arrayBuffer();
        const res = await api("/api/admin/upload", { method: "POST", body: buf });
        editImages.push(res.url);
        renderPhotos();
      } catch (ex) {
        const msg = ex.message === "format_not_allowed" ? "формат не поддерживается (нужно JPG/PNG/WebP/MP4/WebM)"
          : ex.message === "too_large" ? "файл больше 64 МБ"
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

  $("#f-slug").addEventListener("input", () => { slugTouched = true; updateEditChecklist(); });
  ["#f-name", "#f-model", "#f-variant"].forEach((sel) => {
    $(sel).addEventListener("input", () => {
      if (!slugTouched) $("#f-slug").value = slugifyLocal([$("#f-model").value, $("#f-variant").value, $("#f-name").value].filter(Boolean).join(" "));
      updateEditChecklist();
    });
  });
  ["#f-price", "#f-sizes", "#f-desc-ru", "#f-desc-uz", "#f-desc-en"].forEach((sel) => {
    $(sel).addEventListener("input", updateEditChecklist);
  });

  function smartFillCopy() {
    const model = $("#f-model").value.trim() || $("#f-name").value.trim() || "Milana";
    const variant = $("#f-variant").value.trim();
    const name = $("#f-name").value.trim() || [model, variant].filter(Boolean).join(" / ");
    const category = $("#f-cat").value;
    const gender = $("#f-gender").value;
    const sizes = ($("#f-sizes").value || "48, 50, 52, 54, 56, 58").split(",").map((s) => s.trim()).filter(Boolean).join(", ");
    const price = $("#f-price").value ? `$${Number($("#f-price").value).toFixed(2)}` : "";
    const fabricRu = $("#f-fab-ru").value.trim() || "Suprem · хлопок 100%";
    const fabricUz = $("#f-fab-uz").value.trim() || "Suprem · 100% paxta";
    const fabricEn = $("#f-fab-en").value.trim() || "Suprem · 100% cotton";
    if (!$("#f-name").value.trim()) $("#f-name").value = name;
    if (!$("#f-wholesale-price").value && $("#f-price").value) $("#f-wholesale-price").value = $("#f-price").value;
    if (!$("#f-retail-price").value && $("#f-price").value) $("#f-retail-price").value = $("#f-price").value;
    if (!$("#f-fab-ru").value.trim()) $("#f-fab-ru").value = fabricRu;
    if (!$("#f-fab-uz").value.trim()) $("#f-fab-uz").value = fabricUz;
    if (!$("#f-fab-en").value.trim()) $("#f-fab-en").value = fabricEn;
    const ru = `${name} — ${CLO_RU[category].toLowerCase()} для категории ${GENDER_RU[gender].toLowerCase()}. Модель ${model}${variant ? `, вариант ${variant}` : ""}. Размеры: ${sizes}. Оптовый заказ от 1 Qadoq (6 шт., по 1 на размер) или 1 Qop (60 шт., по 10 на размер); финальную доступность и отправку подтверждает менеджер.${price ? ` Цена за 1 шт.: ${price}.` : ""}`;
    const uz = `${name} — ${GENDER_UZ[gender]} uchun ${CLO_UZ[category]}. Model ${model}${variant ? `, variant ${variant}` : ""}. O'lchamlar: ${sizes}. Ulgurji buyurtma kamida 1 Qadoq (6 dona, har o'lchamdan 1 tadan) yoki 1 Qop (60 dona, har o'lchamdan 10 tadan); mavjudlik va jo'natishni menejer tasdiqlaydi.${price ? ` 1 dona narxi: ${price}.` : ""}`;
    const en = `${name} — ${CLO_EN[category]} for ${GENDER_EN[gender]}. Model ${model}${variant ? `, variant ${variant}` : ""}. Sizes: ${sizes}. Wholesale orders start from 1 Qadoq (6 pcs, 1 per size) or 1 Qop (60 pcs, 10 per size); availability and dispatch are confirmed by a manager.${price ? ` Unit price: ${price}.` : ""}`;
    if (!$("#f-desc-ru").value.trim()) $("#f-desc-ru").value = ru;
    if (!$("#f-desc-uz").value.trim()) $("#f-desc-uz").value = uz;
    if (!$("#f-desc-en").value.trim()) $("#f-desc-en").value = en;
    if (!slugTouched) $("#f-slug").value = slugifyLocal([model, variant, name].filter(Boolean).join(" "));
    updateEditChecklist();
    $("#edit-ai-msg").textContent = "Smart fill заполнил только пустые поля. Чтобы переписать текст, очистите поле и нажмите снова.";
  }

  $("#edit-ai-fill").addEventListener("click", smartFillCopy);

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
      wholesale_price: Number($("#f-wholesale-price").value || $("#f-price").value),
      wholesale_moq: 6,
      available_qop: $("#f-available-qop").value === "" ? null : Number($("#f-available-qop").value || 0),
      retail_enabled: $("#f-retail-enabled").checked,
      retail_price: Number($("#f-retail-price").value || $("#f-price").value),
      retail_stock: Number($("#f-retail-stock").value || 0),
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
      <tr>
        <td class="onum">${esc(o.number)}</td>
        <td class="odate">${esc((o.created_at || "").slice(0, 16).replace("T", " "))}</td>
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
      </tr>`;
    }).join("") || `<tr><td colspan="8" style="text-align:center;color:var(--soft);padding:36px">Заказов пока нет</td></tr>`;
  }

  $("#order-table").addEventListener("change", async (e) => {
    const orderSel = e.target.closest("[data-order]");
    const paymentSel = e.target.closest("[data-payment]");
    if (!orderSel && !paymentSel) return;
    try {
      if (orderSel) {
        await api("/api/admin/orders/" + orderSel.dataset.order, { method: "PUT", body: { status: orderSel.value } });
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

  /* ================= SETTINGS ================= */
  const S_KEYS = ["phone", "whatsapp", "telegram", "instagram", "email", "address_ru", "address_uz", "address_en", "currency", "currency_pos", "admin_user"];

  async function loadSettings() {
    const s = await api("/api/admin/settings");
    S_KEYS.forEach((k) => { const el = $("#s-" + k); if (el) el.value = s[k] ?? ""; });
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
      showApp();
    } catch { location.replace("/admin"); }
  })();
})();
