(() => {
  "use strict";

  const text = (node) => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  const root = () => document.querySelector("#root > div");
  const authState = { loaded: false, loading: null, auth: null, authMod: null, google: null, apple: null, appleEnabled: false };

  function clickExisting(label) {
    const target = [...document.querySelectorAll("nav button, footer button, section button")]
      .find((button) => text(button).toLowerCase() === label.toLowerCase());
    target?.click();
  }

  async function loadFirebaseAuth() {
    if (authState.loaded) return authState;
    if (authState.loading) return authState.loading;
    authState.loading = (async () => {
      const config = await fetch("/api/auth/config").then((r) => r.ok ? r.json() : null).catch(() => null);
      if (config?.provider !== "firebase" || !config.firebase) return authState;
      authState.appleEnabled = config.appleEnabled === true;
      const [appMod, authMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
      ]);
      const app = appMod.initializeApp(config.firebase);
      authState.auth = authMod.getAuth(app);
      authState.authMod = authMod;
      authState.google = new authMod.GoogleAuthProvider();
      authState.apple = authState.appleEnabled ? new authMod.OAuthProvider("apple.com") : null;
      authState.loaded = true;
      return authState;
    })().catch((error) => {
      console.warn("[Milana] Firebase auth unavailable", error);
      return authState;
    });
    return authState.loading;
  }

  function authMessage(message) {
    const box = document.querySelector("[data-auth-msg], .auth-msg");
    if (box) box.textContent = message;
  }

  async function socialSignIn(kind, button) {
    const state = await loadFirebaseAuth();
    const provider = kind === "apple" ? state.apple : state.google;
    if (!state.auth || !state.authMod || !provider) throw new Error("Social sign-in is not configured yet.");
    button.disabled = true;
    try {
      const cred = await state.authMod.signInWithPopup(state.auth, provider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/auth/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Sign-in failed.");
      location.assign("/?view=shop");
    } finally {
      button.disabled = false;
    }
  }

  function upgradeAuthButtons() {
    const buttons = [...document.querySelectorAll("button.social-button")];
    const google = buttons.find((button) => /continue with google/i.test(text(button)));
    const apple = buttons.find((button) => /continue with apple/i.test(text(button)));
    if (!google && !apple) return;
    loadFirebaseAuth().then((state) => {
      if (!state.auth) return;
      if (apple && !state.appleEnabled) apple.hidden = true;
      [
        [google, "google"],
        [state.appleEnabled ? apple : null, "apple"],
      ].forEach(([button, kind]) => {
        if (!button || button.dataset.mpFirebaseAuth === "ready") return;
        button.disabled = false;
        button.removeAttribute("disabled");
        button.querySelector("small")?.remove();
        button.dataset.mpFirebaseAuth = "ready";
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          try {
            await socialSignIn(kind, button);
          } catch (error) {
            authMessage(error?.message || "Sign-in failed.");
          }
        }, true);
      });
    });
  }

  function makeMega(nav) {
    const pill = nav?.parentElement;
    if (!pill || pill.querySelector(".mp-mega")) return;
    const newButton = [...nav.querySelectorAll("button")].find((button) => /new arrivals/i.test(text(button)));
    if (!newButton) return;

    const mega = document.createElement("div");
    mega.className = "mp-mega";
    mega.innerHTML = `
      <div class="mp-mega__col"><strong>What's new</strong><button type="button" data-mp-nav="NEW ARRIVALS">New in today</button><button type="button" data-mp-nav="Robes">New robes</button><button type="button" data-mp-nav="Pajamas">New pajamas</button><button type="button" data-mp-nav="Homewear">New homewear</button></div>
      <div class="mp-mega__col"><strong>Trending now</strong><button type="button" data-mp-nav="BEST SALES">Most wanted</button><button type="button" data-mp-nav="BEST SALES">Top rated</button><button type="button" data-mp-nav="WOMEN">Women's edit</button><button type="button" data-mp-nav="MEN">Men's edit</button></div>
      <div class="mp-mega__col"><strong>Discover</strong><button type="button" data-mp-nav="COLLECTION">All models</button><button type="button" data-mp-nav="COLLECTION">Matching sets</button><button type="button" data-mp-nav="Wholesale & Export">Wholesale guide</button><button type="button" data-mp-nav="FAQ">Talk to a manager</button></div>
      <div class="mp-mega__feature"><div class="mp-mega__thumb"></div><div><span>Spotlight on</span><b>Milana collection</b><button type="button" data-mp-nav="NEW ARRIVALS">Shop now</button></div></div>
    `;
    pill.appendChild(mega);

    let closeTimer = 0;
    const open = () => {
      clearTimeout(closeTimer);
      mega.classList.add("is-open");
    };
    const close = () => {
      closeTimer = setTimeout(() => mega.classList.remove("is-open"), 120);
    };
    const closeNow = () => {
      clearTimeout(closeTimer);
      mega.classList.remove("is-open");
    };

    newButton.addEventListener("pointerenter", open);
    newButton.addEventListener("click", closeNow);
    nav.querySelectorAll("button").forEach((button) => button.addEventListener("click", closeNow));
    mega.addEventListener("pointerenter", open);
    mega.addEventListener("pointerleave", close);
    nav.addEventListener("pointerleave", close);
    window.addEventListener("scroll", closeNow, { passive: true });
    window.addEventListener("popstate", closeNow);
    document.addEventListener("pointerdown", (event) => {
      if (!pill.contains(event.target)) closeNow();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNow();
    });
    mega.addEventListener("click", (event) => {
      const item = event.target.closest("[data-mp-nav]");
      if (!item) return;
      closeNow();
      clickExisting(item.dataset.mpNav);
    });
  }

  function hydrateHeroVideo() {
    const hero = document.querySelector("[data-mp-hero], #hero");
    const video = document.getElementById("hero-bg-video") || hero?.querySelector("video");
    if (!hero || !video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("autoplay", "");
    video.setAttribute("loop", "");
    video.preload = video.preload === "none" ? "metadata" : (video.preload || "metadata");

    const heroText = text(hero).toUpperCase();
    const firstSlideActive = /SOFTNESS|ELEGANCE|YUMSHOQLIK|NAFISLIK|МЯГКОСТ|ЭЛЕГАНТНОСТ/.test(heroText);
    video.classList.toggle("mp-hero-video-force", firstSlideActive);

    if (!video.dataset.mpHeroHydrated) {
      video.dataset.mpHeroHydrated = "1";
      const retry = () => requestAnimationFrame(hydrateHeroVideo);
      ["loadedmetadata", "loadeddata", "canplay", "playing", "pause", "stalled", "suspend", "emptied"].forEach((eventName) => {
        video.addEventListener(eventName, retry, { passive: true });
      });
      video.addEventListener("error", () => {
        video.classList.remove("mp-hero-video-force");
        retry();
      }, { passive: true });
    }

    if (firstSlideActive && video.readyState === 0 && video.src) {
      try { video.load(); } catch { /* Safari can throw while swapping routes */ }
    }

    if (firstSlideActive && video.paused) {
      const play = video.play?.();
      if (play && typeof play.catch === "function") play.catch(() => {});
    }

    hero.querySelectorAll("img").forEach((img) => {
      if (img.complete && img.naturalWidth === 0) img.hidden = true;
    });
  }

  function annotate() {
    const app = root();
    if (!app) return;
    app.dataset.mpSkin = "ready";

    const children = [...app.children];
    const desktopHead = children.find((node) => node.matches("div") && node.querySelector("nav") && text(node).toUpperCase().includes("NEW ARRIVALS"));
    const mobileHead = children.find((node) => node.matches("div") && /lg:hidden/.test(String(node.className)));
    if (desktopHead) {
      desktopHead.dataset.mpDesktopHead = "";
      const pill = desktopHead.querySelector(":scope > div");
      const logo = pill?.firstElementChild;
      const actions = pill?.lastElementChild;
      if (logo) logo.dataset.mpLogo = "";
      if (actions) actions.dataset.mpActions = "";
      makeMega(pill?.querySelector("nav"));
    }
    if (mobileHead) mobileHead.dataset.mpMobileHead = "";

    const sections = children.filter((node) => node.tagName === "SECTION");
    if (sections[0]) sections[0].dataset.mpHero = "";
    sections.forEach((section, index) => {
      const content = text(section).toUpperCase();
      if (content.includes("THE WARDROBE")) section.dataset.mpWardrobe = "";
      if (index > 0 && (content.startsWith("BEST SALES") || content.startsWith("NEW ARRIVALS"))) section.dataset.mpRail = "";
    });
    upgradeAuthButtons();
    hydrateHeroVideo();
  }

  const run = () => requestAnimationFrame(annotate);
  document.addEventListener("DOMContentLoaded", run);
  window.addEventListener("load", run);
  window.addEventListener("pageshow", run);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) run();
  });
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
})();
