/* ============================================================
   MILANA — shared app state: wishlist, image states, offline banner
   ============================================================ */
(() => {
  "use strict";

  const KEY = "ml-wishlist";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let wishlist = [];

  try { wishlist = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
  if (!Array.isArray(wishlist)) wishlist = [];

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(wishlist.slice(0, 80)));
    syncWishlistButtons();
    window.dispatchEvent(new CustomEvent("milana:wishlist", { detail: { items: all() } }));
  };
  const idOf = (item) => String(item?.id || item?.slug || "");
  const all = () => wishlist.slice();
  const has = (id) => wishlist.some((item) => idOf(item) === String(id));
  const add = (item) => {
    const id = idOf(item);
    if (!id || has(id)) return;
    wishlist.unshift({
      id,
      slug: item.slug || "",
      name: item.name || "",
      image: item.image || "",
      price: Number(item.price) || 0,
      added_at: new Date().toISOString(),
    });
    save();
  };
  const remove = (id) => {
    wishlist = wishlist.filter((item) => idOf(item) !== String(id));
    save();
  };
  const toggle = (item) => {
    const id = idOf(item);
    if (!id) return false;
    if (has(id)) { remove(id); return false; }
    add(item);
    return true;
  };

  function syncWishlistButtons() {
    document.querySelectorAll("[data-wish-id]").forEach((button) => {
      const active = has(button.dataset.wishId);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function wireImages(root = document) {
    root.querySelectorAll("img").forEach((img) => {
      if (img.dataset.imgState === "1") return;
      img.dataset.imgState = "1";
      img.classList.toggle("is-loaded", img.complete && img.naturalWidth > 0);
      img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
      img.addEventListener("error", () => img.classList.add("is-broken"), { once: true });
    });
  }

  function offlineText() {
    const lang = window.I18N?.lang || "en";
    return {
      en: "You are offline. Catalog actions will resume when the connection returns.",
      ru: "Вы офлайн. Каталог продолжит работу после восстановления соединения.",
      uz: "Siz oflaynsiz. Ulanish qaytganda katalog ishlashda davom etadi.",
    }[lang] || "You are offline.";
  }

  function wireOffline() {
    let banner = document.querySelector(".offline-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "offline-banner";
      banner.setAttribute("role", "status");
      document.body.appendChild(banner);
    }
    const render = () => {
      banner.innerHTML = `<span></span>${esc(offlineText())}`;
      banner.classList.toggle("is-on", !navigator.onLine);
    };
    window.addEventListener("online", render);
    window.addEventListener("offline", render);
    window.addEventListener("i18n:change", render);
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    syncWishlistButtons();
    wireImages();
    wireOffline();
  });

  window.MilanaState = { wishlist: { all, has, add, remove, toggle, sync: syncWishlistButtons }, wireImages };
})();
