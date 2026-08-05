/* ============================================================
   MILANA — раздел «О нас»: счётчики оживают при прокрутке
   ============================================================ */
(() => {
  "use strict";
  const box = document.querySelector(".about-stats");
  if (!box) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* «20 000» → {pre:"", n:20000, suf:"", sep:" "} ; «25+» → {n:25, suf:"+"} */
  function parse(txt) {
    const m = String(txt).match(/^(\D*?)([\d  .,]*\d)(\D*)$/);
    if (!m) return null;
    const raw = m[2];
    const n = Number(raw.replace(/\D/g, ""));
    if (!Number.isFinite(n)) return null;
    const sep = /[  ]/.test(raw) ? " " : raw.includes(",") ? "," : "";
    return { pre: m[1], n, suf: m[3], sep };
  }
  const group = (n, sep) => (sep ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep) : String(n));

  function run(el) {
    const target = el.dataset.countTo ? JSON.parse(el.dataset.countTo) : parse(el.textContent);
    if (!target) return;
    el.dataset.countTo = JSON.stringify(target);          /* переживает смену языка */
    if (reduce) return;
    const dur = 1100, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = target.pre + group(Math.round(target.n * eased), target.sep) + target.suf;
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = target.pre + "0" + target.suf;
    requestAnimationFrame(step);
  }

  const nums = [...box.querySelectorAll("b")];
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      run(e.target);
    });
  }, { threshold: 0.4 });
  nums.forEach((n) => io.observe(n));

  /* при смене языка цифры перерисовываются — считаем заново */
  window.addEventListener("i18n:change", () => {
    setTimeout(() => nums.forEach((n) => { delete n.dataset.countTo; run(n); }), 60);
  });
})();
