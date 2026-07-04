/* MILANA customer service chat widget */
(() => {
  "use strict";

  if (window.__milanaChatMounted) return;
  window.__milanaChatMounted = true;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (k) => window.I18N ? I18N.t(k) : k;
  let sessionId = Number(localStorage.getItem("ml-chat-session") || 0) || 0;
  let welcomed = false;

  const root = document.createElement("div");
  root.className = "chat-widget";
  root.innerHTML = `
    <button class="chat-widget__fab" type="button" aria-label="AI shopping assistant">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.75 6.75A4.75 4.75 0 0 1 9.5 2h5A4.75 4.75 0 0 1 19.25 6.75v4.5A4.75 4.75 0 0 1 14.5 16h-2.8l-4.1 3.25A.75.75 0 0 1 6.4 18.7V15.7a4.75 4.75 0 0 1-1.65-3.6V6.75Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M9 8.25h6M9 11.25h3.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
      <span>AI</span>
    </button>
    <section class="chat-widget__panel" hidden>
      <header><strong data-chat-label="title">Milana support</strong><button type="button" aria-label="Close">×</button></header>
      <div class="chat-widget__log" role="log"></div>
      <div class="chat-widget__quick">
        <button type="button" data-chat-key="delivery">Delivery</button>
        <button type="button" data-chat-key="qop">Qop rule</button>
        <button type="button" data-chat-key="human">Talk to human</button>
      </div>
      <form class="chat-widget__form">
        <input name="message" maxlength="1500" placeholder="Write a message..." autocomplete="off">
        <button type="submit" data-chat-label="send">Send</button>
      </form>
      <form class="chat-widget__contact" hidden>
        <input name="name" maxlength="80" placeholder="Name">
        <input name="phone" maxlength="25" placeholder="+998 90 123 45 67">
        <button type="submit" data-chat-label="ticket">Create ticket</button>
      </form>
    </section>`;

  function applyText() {
    root.querySelector('[data-chat-label="title"]').textContent = tr("chat.title");
    root.querySelector('[data-chat-label="send"]').textContent = tr("chat.send");
    root.querySelector('[data-chat-label="ticket"]').textContent = tr("chat.ticket");
    root.querySelector('.chat-widget__form input').placeholder = tr("chat.placeholder");
    root.querySelector('.chat-widget__contact input[name="name"]').placeholder = tr("auth.name");
    root.querySelector('[data-chat-key="delivery"]').textContent = tr("chat.quickDelivery");
    root.querySelector('[data-chat-key="qop"]').textContent = tr("chat.quickQop");
    root.querySelector('[data-chat-key="human"]').textContent = tr("chat.quickHuman");
  }

  function log(sender, text) {
    const box = root.querySelector(".chat-widget__log");
    box.insertAdjacentHTML("beforeend", `<p class="is-${sender}">${esc(text)}</p>`);
    box.scrollTop = box.scrollHeight;
  }

  function logWelcome() {
    if (welcomed) return;
    welcomed = true;
    log("bot", tr("chat.welcome"));
  }

  function logProducts(products) {
    if (!Array.isArray(products) || !products.length) return;
    const box = root.querySelector(".chat-widget__log");
    box.insertAdjacentHTML("beforeend", `
      <div class="chat-widget__products">
        ${products.slice(0, 3).map((p) => `
          <a class="chat-widget__product" href="/p/${esc(p.slug)}">
            <span>${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : ""}</span>
            <b>${esc(p.name)}</b>
            <small>${p.price_visible === false ? esc(tr("price.manager")) : `${esc(p.price)} USD`}</small>
          </a>
        `).join("")}
      </div>`);
    box.scrollTop = box.scrollHeight;
  }

  async function sendMessage(text) {
    if (!text.trim()) return;
    log("customer", text);
    const r = await fetch("/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message: text, lang: window.I18N?.lang || "uz" }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "chat_failed");
    sessionId = Number(data.session_id || sessionId);
    if (sessionId) localStorage.setItem("ml-chat-session", String(sessionId));
    log("bot", data.reply || "Rahmat. Menejer tez orada javob beradi.");
    logProducts(data.products);
    if (/manager|Menejer|ulaymiz/i.test(data.reply || "")) root.querySelector(".chat-widget__contact").hidden = false;
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(root);
    const ready = window.I18N?.ready || Promise.resolve();
    ready.then(() => {
      applyText();
      logWelcome();
    }).catch(() => {
      applyText();
      logWelcome();
    });
  });
  window.addEventListener("i18n:change", applyText);
  window.I18N?.ready?.then(applyText).catch(() => {});

  root.addEventListener("click", (e) => {
    if (e.target.closest(".chat-widget__fab")) {
      const panel = root.querySelector(".chat-widget__panel");
      panel.hidden = !panel.hidden;
    }
    if (e.target.closest("header button")) root.querySelector(".chat-widget__panel").hidden = true;
    const q = e.target.closest("[data-chat-key]");
    if (q) sendMessage(tr("chat.msg" + q.dataset.chatKey[0].toUpperCase() + q.dataset.chatKey.slice(1))).catch((ex) => log("bot", ex.message));
  });

  root.querySelector(".chat-widget__form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = e.currentTarget.elements.message;
    const text = input.value;
    input.value = "";
    sendMessage(text).catch((ex) => log("bot", ex.message));
  });

  root.querySelector(".chat-widget__contact").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await fetch("/api/chat/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, session_id: sessionId, message: "Chat customer requested a human manager.", lang: window.I18N?.lang || "uz" }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(res.error || "ticket_failed");
      log("bot", tr("chat.ticketCreated", { number: res.number }));
      e.currentTarget.hidden = true;
    } catch (ex) {
      log("bot", ex.message);
    }
  });
})();
