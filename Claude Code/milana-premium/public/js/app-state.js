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
    syncWishCount();
    window.dispatchEvent(new CustomEvent("milana:wishlist", { detail: { items: all() } }));
  };
  const idOf = (item) => String(item?.id || item?.slug || "");
  /* счётчик избранного в шапке */
  function syncWishCount() {
    const n = wishlist.length;
    document.querySelectorAll("[data-wish-count]").forEach((el) => {
      el.textContent = n > 99 ? "99+" : String(n);
      el.classList.toggle("is-zero", n < 1);
    });
  }
  document.addEventListener("DOMContentLoaded", syncWishCount);

  const all = () => wishlist.slice();
  const refresh = (products) => {
    const currentById = new Map((Array.isArray(products) ? products : [])
      .filter((product) => product && product.id != null)
      .map((product) => [String(product.id), product]));
    let changed = false;
    wishlist = wishlist.map((item) => {
      const current = currentById.get(idOf(item));
      if (!current) return item;
      const next = {
        ...item,
        slug: current.slug || item.slug || "",
        name: current.name || item.name || "",
        image: current.images?.[0] || current.image || item.image || "",
        price: Number(current.price ?? item.price) || 0,
        price_visible: current.price_visible !== false,
      };
      if (next.slug !== item.slug || next.name !== item.name || next.image !== item.image
        || next.price !== item.price || next.price_visible !== item.price_visible) changed = true;
      return next;
    });
    if (changed) save();
    return changed;
  };
  const setAll = (items) => {
    wishlist = (Array.isArray(items) ? items : []).slice(0, 80).map((item) => ({
      id: idOf(item),
      slug: item.slug || "",
      name: item.name || "",
      image: item.image || "",
      price: Number(item.price) || 0,
      price_visible: item.price_visible !== false,
      added_at: item.added_at || new Date().toISOString(),
    })).filter((item) => item.id);
    save();
  };
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
      price_visible: item.price_visible !== false,
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
      const reveal = () => img.classList.add("is-loaded");
      if (img.complete && img.naturalWidth > 0) reveal();
      requestAnimationFrame(() => {
        if (img.complete && img.naturalWidth > 0) reveal();
      });
      img.addEventListener("load", reveal, { once: true });
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

  window.MilanaState = { wishlist: { all, setAll, refresh, has, add, remove, toggle, sync: syncWishlistButtons }, wireImages };
})();
