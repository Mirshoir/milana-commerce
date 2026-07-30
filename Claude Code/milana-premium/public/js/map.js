/* ============================================================
   MILANA — карта с локацией фабрики (Leaflet, самохостинг)
   Milana Textile · Андижан · 40.7304768, 72.3308067
   Монохромные тайлы OSM, маркер и попап в стиле сайта.
   ============================================================ */
(() => {
  "use strict";

  const box = document.getElementById("factory-map");
  if (!box || !window.L) return;

  const LAT = 40.7304768;
  const LNG = 72.3308067;
  const GMAPS = "https://maps.app.goo.gl/JrRHEj7YLWNxmqQHA";
  const DIR = "https://www.google.com/maps/dir/?api=1&destination=" + LAT + "," + LNG;

  const t = (k, fb) => {
    const v = window.I18N ? I18N.t(k) : k;
    return v === k ? fb : v;
  };
  const address = () => {
    const s = window.SITE_SETTINGS || {};
    const lang = window.I18N ? I18N.lang : "ru";
    return s["address_" + lang] || s.address_ru || "Узбекистан, Андижан, Коратут, дом 605";
  };

  const map = L.map(box, {
    center: [LAT, LNG],
    zoom: 16,
    scrollWheelZoom: false,   /* не перехватываем прокрутку страницы */
    attributionControl: true,
    zoomControl: true,
  });
  map.attributionControl.setPrefix(false);

  /* тайлы отдаёт наш сервер (/map-tiles) — прокси с кэшем на диске */
  L.tileLayer("/map-tiles/{z}/{x}/{y}.png", {
    minZoom: 5,
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
  }).addTo(map);

  /* маркер: чёрная точка с белым кольцом + пульс */
  const icon = L.divIcon({
    className: "fmap-pin",
    html: '<span class="fmap-pin__pulse"></span><span class="fmap-pin__dot"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });

  const marker = L.marker([LAT, LNG], { icon, title: "Milana Textile" }).addTo(map);

  const IC_NAV = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>';
  const IC_EXT = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

  function popupHtml() {
    return `
      <div class="fmap-pop">
        <div class="fmap-pop__img"><img src="/assets/factory.webp" alt="Milana Textile" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/assets/hero-poster.jpg'"></div>
        <div class="fmap-pop__body">
          <p class="fmap-pop__over">${t("map.over", "Фабрика · Шоурум")}</p>
          <h3 class="fmap-pop__name">Milana Textile</h3>
          <p class="fmap-pop__addr">${address()}</p>
          <div class="fmap-pop__act">
            <a class="fmap-pop__btn" href="${DIR}" target="_blank" rel="noopener">${IC_NAV}<span>${t("map.dir", "Маршрут")}</span></a>
            <a class="fmap-pop__ext" href="${GMAPS}" target="_blank" rel="noopener" aria-label="Google Maps">${IC_EXT}</a>
          </div>
        </div>
      </div>`;
  }

  marker.bindPopup(popupHtml(), { closeButton: true, maxWidth: 288, minWidth: 256, className: "fmap-popup" });

  /* открываем попап, когда карта попадает в кадр */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { marker.openPopup(); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(box);
  } else {
    marker.openPopup();
  }

  /* зум колесом — только после клика по карте */
  box.addEventListener("click", () => map.scrollWheelZoom.enable(), { once: false });
  box.addEventListener("mouseleave", () => map.scrollWheelZoom.disable());

  window.addEventListener("i18n:change", () => marker.setPopupContent(popupHtml()));
})();
