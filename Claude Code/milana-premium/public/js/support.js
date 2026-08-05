(() => {
  "use strict";

  const form = document.querySelector("#support-form");
  const msg = document.querySelector("#support-msg");
  const t = (k, v) => window.I18N ? I18N.t(k, v) : k;

  function escMsg(text, good = false) {
    msg.textContent = text;
    msg.hidden = false;
    msg.classList.toggle("is-good", good);
  }

  async function boot() {
    await window.I18N?.ready;
    document.querySelector("#year") && (document.querySelector("#year").textContent = new Date().getFullYear());
    const requestedTopic = new URLSearchParams(window.location.search).get("topic");
    const topicOption = form?.querySelector(`option[value="${CSS.escape(requestedTopic || "")}"]`);
    if (topicOption) form.elements.topic.value = requestedTopic;
    const customer = window.MilanaAuth?.customer;
    if (customer) {
      form.elements.name.value = customer.name || "";
      form.elements.phone.value = customer.phone || "";
      form.elements.email.value = customer.email || "";
    }
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (String(data.name || "").trim().length < 2) return escMsg(t("support.errName"));
    if (!/^[0-9+()\-\s]{5,25}$/.test(String(data.phone || "").trim())) return escMsg(t("cart.invalid"));
    if (String(data.message || "").trim().length < 8) return escMsg(t("support.errMessage"));
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    msg.hidden = true;
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, lang: window.I18N?.lang || "en" }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || "error");
      form.reset();
      escMsg(t("support.ok", { n: out.number }), true);
    } catch (ex) {
      escMsg(t("support.errGeneric") + " (" + ex.message + ")");
    } finally {
      btn.disabled = false;
    }
  });

  boot();
})();
