(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const solid = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more)");
  const video = document.createElement("video");
  video.className = "glass-shader";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "none";
  video.setAttribute("aria-hidden", "true");

  let pointerPanel;
  let focusPanel;
  let active;
  let scrollIdle;

  const selector = ".glass, .orbit-card";
  function panelFor(target) {
    const panel = target?.closest?.(selector);
    return panel?.matches(".orbit-card") ? panel.querySelector(".glass") : panel;
  }

  function sync() {
    const root = document.documentElement;
    const modal = document.querySelector(".mission-control[open]");
    let panel = pointerPanel || focusPanel;
    if (root.hasAttribute("data-launching")) {
      panel = root.hasAttribute("data-ignition") ? null : document.querySelector(".launch-screen__rail");
    }
    if (panel?.closest("[inert], [hidden]") || (modal && !modal.contains(panel))) panel = null;
    if (root.hasAttribute("data-scrolling") || document.hidden || solid.matches) panel = null;
    if (panel !== active) {
      active?.removeAttribute("data-shader-active");
      active = panel;
      active?.setAttribute("data-shader-active", "");
      video.removeAttribute("data-frame");
      video.pause();
    }
    if (!active || reduced.matches) {
      video.pause();
      return;
    }
    const fill = active.querySelector(":scope > .halo-fill, :scope > .primary-action__face > .halo-fill");
    if (!fill) return;
    if (video.parentElement !== fill) fill.append(video);
    if (!video.getAttribute("src")) video.src = "media/halo-drift.mp4";
    if (video.paused) video.play().catch(() => {});
    if (video.readyState >= 2) video.setAttribute("data-frame", "");
  }
  video.addEventListener("playing", () => video.setAttribute("data-frame", ""));

  function register(root = document) {
    for (const panel of root.querySelectorAll(".glass, .journey-progress, .launch-screen__rail")) {
      if (panel.hasAttribute("data-glass-shader")) continue;
      if (!panel.querySelector(":scope > .halo-fill, :scope > .primary-action__face > .halo-fill")) {
        const fill = document.createElement("span");
        fill.className = "halo-fill";
        fill.setAttribute("aria-hidden", "true");
        panel.prepend(fill);
      }
      panel.setAttribute("data-glass-shader", "");
    }
    sync();
  }

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    const panel = panelFor(event.target);
    if (panel === pointerPanel) return;
    pointerPanel = panel;
    sync();
  });
  document.addEventListener("pointerout", (event) => {
    if (event.pointerType === "touch") return;
    const panel = panelFor(event.relatedTarget);
    if (panel === pointerPanel) return;
    pointerPanel = panel;
    sync();
  });
  document.addEventListener("focusin", (event) => {
    focusPanel = event.target.matches(":focus-visible") ? panelFor(event.target) : null;
    sync();
  });
  document.addEventListener("focusout", () => { focusPanel = null; sync(); });
  window.addEventListener("blur", () => { pointerPanel = null; sync(); });

  addEventListener("scroll", () => {
    const root = document.documentElement;
    if (!root.hasAttribute("data-scrolling")) {
      root.setAttribute("data-scrolling", "");
      sync();
      document.dispatchEvent(new Event("brahmos:scrollstate"));
    }
    clearTimeout(scrollIdle);
    scrollIdle = setTimeout(() => {
      root.removeAttribute("data-scrolling");
      const underPointer = pointerPanel?.matches(":hover") || pointerPanel?.closest(".orbit-card")?.matches(":hover");
      if (!underPointer) pointerPanel = null;
      sync();
      document.dispatchEvent(new Event("brahmos:scrollstate"));
    }, 120);
  }, { passive: true });

  for (const event of ["visibilitychange", "brahmos:scenechange", "brahmos:ignition", "brahmos:launched", "brahmos:glasschange"]) {
    document.addEventListener(event, sync);
  }
  reduced.addEventListener("change", sync);
  solid.addEventListener("change", sync);
  window.BrahmosGlass = { register };
  register();
})();
