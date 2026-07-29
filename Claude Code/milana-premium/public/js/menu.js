(() => {
  "use strict";

  const burger = document.querySelector(".burger");
  const menu = document.getElementById("menu");
  if (!burger || !menu) return;

  const setOpen = (open) => {
    menu.classList.toggle("is-open", open);
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    const key = open ? "aria.closeMenu" : "aria.openMenu";
    burger.setAttribute("aria-label", window.I18N ? I18N.t(key) : (open ? "Close menu" : "Open menu"));
    menu.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
  };

  burger.addEventListener("click", () => setOpen(!menu.classList.contains("is-open")));
  menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  window.addEventListener("i18n:change", () => setOpen(menu.classList.contains("is-open")));
  if (window.I18N?.ready) I18N.ready.then(() => setOpen(false));
})();
