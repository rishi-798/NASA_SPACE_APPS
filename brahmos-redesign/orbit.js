(() => {
  const { gsap, ScrollTrigger, Lenis } = window;
  if (!gsap || !ScrollTrigger || !Lenis) return;
  gsap.registerPlugin(ScrollTrigger);

  const journey = document.querySelector(".journey");
  const frame = journey.querySelector(".journey__frame");
  const hero = frame.querySelector(".hero");
  const header = frame.querySelector(".topbar");
  const intro = frame.querySelector(".intro");
  const scene = frame.querySelector(".scene");
  const camera = scene.querySelector(".scene__camera");
  const footer = frame.querySelector(".hero-footer");
  const siteFooter = frame.querySelector(".site-footer");
  const openExplorer = footer.querySelector(".primary-action");
  const progressRail = frame.querySelector(".journey-progress");
  const progressFill = progressRail.querySelector(".halo-fill");
  const mobileMenu = frame.querySelector(".mobile-menu");
  const orbit = frame.querySelector(".orbit");
  const system = orbit.querySelector(".orbit__system");
  const track = orbit.querySelector(".orbit__track");
  const nearBelt = orbit.querySelector(".orbit__front");
  const moon = orbit.querySelector(".moon");
  const canvas = moon.querySelector("canvas");
  const cards = Array.from(orbit.querySelectorAll(".orbit-card"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const canHover = matchMedia("(hover: hover) and (pointer: fine)");
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  function curve(start, end, value) {
    const position = clamp((value - start) / (end - start));
    return position * position * (3 - 2 * position);
  }

  for (const item of header.querySelectorAll("li a, summary, .brand > span")) window.setUpBrahmosLabel(item, item, 620);
  for (const card of cards) window.setUpBrahmosLabel(card.querySelector(".orbit-card__title"), card, 285);

  let distance = 1;
  let start = 0;
  let cameraRise = 0;
  let progress = 0;
  let lenis;
  let animateScroll;
  let wheelTicking = false;
  let wheelOnScreen = false;
  let wheelClock = null;
  let moonWarmup;
  let moonNeedsDraw = true;
  let lastMoonDraw = -Infinity;
  let flyoverCovered = false;
  let focusRequested = false;
  let assetRequested = false;
  let drawMoon;
  let activeCard;
  let hoveredCard;
  let focusedCard;
  let yaw = 0.12;
  let pitch = 0.12;
  let dragX = 0;
  let dragY = 0;
  let dragging;
  let phase = 0;
  let angularSpeed = 0;
  let orbitRadiusX = 0;
  let orbitRadiusY = 0;
  let tiltCos = 1;
  let tiltSin = 0;
  let drift = 0;
  let gazeX = 0;
  let gazeY = 0;
  let targetGazeX = 0;
  let targetGazeY = 0;
  let hoverTiltX = 0;
  let hoverTiltY = 0;
  const slots = cards.map((card, index) => ({
    card,
    face: card.querySelector(".orbit-card__face"),
    angle: -Math.PI / 2 + index * Math.PI * 2 / cards.length,
    arrival: 0,
    emphasis: 0,
    depth: 0,
  }));
  function loadMoon() {
    if (assetRequested) return;
    assetRequested = true;
    const asset = document.createElement("script");
    asset.src = "media/moon-asset.js";
    asset.onload = async () => {
      try {
        drawMoon = await window.createBrahmosMoon(canvas, window.brahmosMoonAsset);
      } catch {
        drawMoon = null;
      } finally {
        delete window.brahmosMoonAsset;
        asset.remove();
        paintMoon(performance.now(), true);
      }
    };
    asset.onerror = () => asset.remove();
    document.head.append(asset);
  }

  canvas.addEventListener("webglcontextlost", () => {
    drawMoon = null;
    moon.removeAttribute("data-rendered");
  });

  function measure() {
    start = journey.getBoundingClientRect().top + scrollY;
    distance = Math.max(1, journey.offsetHeight - innerHeight);
    const sceneShift = parseFloat(getComputedStyle(scene).getPropertyValue("--scene-shift")) || 0;
    cameraRise = frame.offsetHeight / 2 - (scene.offsetTop + scene.offsetHeight / 2 + sceneShift);
    const trackStyle = getComputedStyle(track);
    orbitRadiusX = parseFloat(trackStyle.width) * 0.486;
    orbitRadiusY = parseFloat(trackStyle.height) * 0.454;
    const angle = parseFloat(getComputedStyle(orbit).getPropertyValue("--belt-tilt")) * Math.PI / 180;
    tiltCos = Math.cos(angle);
    tiltSin = Math.sin(angle);
    drift = Math.min(34, Math.max(0, (orbit.clientWidth - 300) * 0.071));
  }

  function syncWheelTicker() {
    const settled = wheelOnScreen && !document.hidden && progress >= .84 &&
      !document.documentElement.hasAttribute("data-scrolling") && !document.documentElement.hasAttribute("data-launching");
    if (settled && !assetRequested && !moonWarmup) {
      moonWarmup = setTimeout(() => {
        moonWarmup = null;
        if (wheelOnScreen && progress >= .84 && !document.documentElement.hasAttribute("data-scrolling")) loadMoon();
      }, 150);
    }
    const visible = settled && !reduced.matches;
    if (visible === wheelTicking) return;
    wheelTicking = visible;
    wheelClock = null;
    if (visible) gsap.ticker.add(animateWheel);
    else gsap.ticker.remove(animateWheel);
  }

  function syncScene(value, still) {
    progress = value;
    const wheelReady = value >= (still ? 0.50 : 0.84);
    hero.toggleAttribute("data-covered", value >= (still ? .50 : .65));
    const headerHidden = value >= (still ? 0.50 : 0.21);
    if (header.inert !== headerHidden) {
      header.inert = headerHidden;
    }
    const footerHidden = value >= (still ? 0.50 : 0.30);
    if (footer.inert !== footerHidden) {
      footer.inert = footerHidden;
      siteFooter.inert = footerHidden;

      document.dispatchEvent(new Event("brahmos:scenechange"));
    }
    if (header.inert && mobileMenu.open) mobileMenu.open = false;

    if (orbit.inert === wheelReady) {
      orbit.toggleAttribute("data-visible", wheelReady);
      orbit.inert = !wheelReady;
      if (!wheelReady) {
        hoveredCard = null;
        targetGazeX = targetGazeY = 0;
      }
      updateHighlight();
      document.dispatchEvent(new Event("brahmos:scenechange"));
    }
    const covered = value >= (still ? 0.50 : 0.045);
    if (covered !== flyoverCovered) {
      flyoverCovered = covered;
      scene.toggleAttribute("data-orbit-cover", covered);
      scene.dispatchEvent(new Event("orbitcoverchange"));
    }
    if (focusRequested && wheelReady && value >= (still ? 0.50 : 0.97)) {
      focusRequested = false;
      cards[0].focus({ preventScroll: true });
    }
    syncWheelTicker();
  }

  function createScrollTimeline() {
    const timeline = gsap.timeline({ paused: true });
    timeline
      .set(moon, { xPercent: -50, yPercent: -50 }, 0)
      .addLabel("departure", 0.02)
      .fromTo(header, { opacity: 1, y: 0 }, { opacity: 0, y: -18, duration: 0.19, ease: "sine.inOut" }, "departure")
      .fromTo(intro, { opacity: 1, y: 0, scale: 1 }, { opacity: 0, y: -24, scale: 0.98, duration: 0.25, ease: "sine.inOut" }, 0.045)
      .fromTo([footer, siteFooter], { opacity: 1, y: 0 }, { opacity: 0, y: 25, duration: 0.22, ease: "sine.inOut" }, 0.055)
      .addLabel("porthole", 0.07)
      .fromTo(camera, { scale: 1, y: 0 }, {
        scale: 3.45, y: () => cameraRise, duration: 0.53, ease: "sine.inOut", force3D: true,
      }, "porthole")
      .fromTo(progressRail, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "sine.out" }, 0.24)
      .fromTo(progressFill, { scaleX: 0 }, { scaleX: 1, duration: 1, ease: "none" }, 0)
      .to(progressRail, { opacity: 0, duration: 0.11, ease: "sine.in" }, 0.79)
      .addLabel("orbit", 0.39)
      .fromTo(orbit, { opacity: 0 }, { opacity: 1, duration: 0.24, ease: "sine.inOut" }, "orbit")
      .fromTo(moon, { opacity: 0, scale: 1.35, y: 15 }, {
        opacity: 1, scale: 1, y: 0, duration: 0.33, ease: "sine.out", force3D: true,
      }, 0.45)
      .fromTo([track, nearBelt], { opacity: 0 }, { opacity: 1, duration: 0.23, ease: "sine.out" }, 0.58);

    slots.forEach((slot, index) => {
      const at = 0.64 + index * 0.023;
      timeline
        .fromTo(slot, { arrival: 0 }, { arrival: 1, duration: 0.247, ease: "power3.out" }, at)
        .fromTo(slot.card, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "sine.out" }, at);
    });
    timeline.eventCallback("onUpdate", () => {
      syncScene(timeline.progress(), false);
      if (timeline.progress() > .59) positionCards(0);
    });
    return timeline;
  }

  function renderReduced(value) {
    const visible = Number(value >= 0.50);
    if (visible === Number(orbit.hasAttribute("data-visible"))) {
      syncScene(value, true);
      return;
    }
    gsap.set([header, intro, footer, siteFooter], { opacity: 1 - visible, y: 0, scale: 1 });
    gsap.set(camera, { scale: 1, y: 0 });
    gsap.set(moon, { xPercent: -50, yPercent: -50, scale: 1, y: 0, opacity: visible });
    gsap.set([orbit, track, nearBelt, ...cards], { opacity: visible });
    gsap.set(progressRail, { opacity: 0 });
    gsap.set(system, { x: 0, y: 0 });
    for (const slot of slots) slot.arrival = 1;
    syncScene(value, true);
    positionCards(1);
    if (visible) paintMoon(performance.now(), true);
  }

  function positionCards(responsiveness) {
    for (const slot of slots) {
      const { card, face, angle, arrival } = slot;
      const longitude = angle + phase - (1 - arrival) * 0.32;
      const across = Math.cos(longitude);
      const depth = Math.sin(longitude);
      const spread = 0.63 + arrival * 0.37;
      const x = orbitRadiusX * across * spread;
      const y = orbitRadiusY * depth * spread;
      const screenX = x * tiltCos - y * tiltSin;
      const screenY = x * tiltSin + y * tiltCos;
      const emphasis = activeCard === card ? 1 : 0;
      slot.emphasis += (emphasis - slot.emphasis) * responsiveness;
      const scale = (0.93 + depth * 0.08 + slot.emphasis * 0.074) * (0.89 + 0.11 * arrival);
      card.style.transform = `translate3d(${screenX.toFixed(2)}px, ${screenY.toFixed(2)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(4)})`;
      const rest = 1 - slot.emphasis * 0.7;
      const roll = (-6 + across * 10 - (1 - arrival) * 16) * rest;
      const pitch = -depth * 13 * rest + hoverTiltX * slot.emphasis;
      const yaw = across * 21 * rest + hoverTiltY * slot.emphasis;
      face.style.transform = `rotate(${roll.toFixed(2)}deg) rotateX(${pitch.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg)`;
      const layer = depth < 0 ? 3 : depth < 0.55 ? 6 : 7;
      if (layer !== slot.depth) {
        slot.depth = layer;
        card.style.setProperty("--orbit-depth", layer);
      }
    }
  }

  function animateWheel(seconds) {
    const now = seconds * 1000;
    if (wheelClock !== null && now - wheelClock < 25) return;
    const step = wheelClock === null ? 25 : clamp(now - wheelClock, 0, 50);
    wheelClock = now;
    if (progress >= 0.64) {
      const holding = hoveredCard || focusedCard?.matches(":focus-visible") || dragging;
      const speed = holding ? 0 : 0.000197 * curve(0.64, 0.86, progress);
      angularSpeed += (speed - angularSpeed) * (1 - Math.exp(-step / 115));
      phase = (phase + angularSpeed * step) % (Math.PI * 2);
      positionCards(1 - Math.exp(-step / 110));
    }
    if (moonNeedsDraw) {
      const follow = 1 - Math.exp(-step / 105);
      gazeX += (targetGazeX - gazeX) * follow;
      gazeY += (targetGazeY - gazeY) * follow;
      const desiredYaw = dragX + .27 + gazeX * .60;
      const desiredPitch = dragY + .09 + gazeY * .31;
      yaw += (desiredYaw - yaw) * follow;
      pitch += (desiredPitch - pitch) * follow;
      system.style.transform = `translate3d(${(gazeX * drift).toFixed(2)}px, ${(gazeY * drift * .57).toFixed(2)}px, 0)`;
      paintMoon(performance.now());
      moonNeedsDraw = Math.max(Math.abs(targetGazeX - gazeX), Math.abs(targetGazeY - gazeY),
        Math.abs(desiredYaw - yaw), Math.abs(desiredPitch - pitch)) > .003;
    }
  }

  function paintMoon(now, force = false) {
    if (!drawMoon || (!force && now - lastMoonDraw < 30)) return;
    lastMoonDraw = now;
    if (drawMoon(pitch, yaw, gazeX, gazeY) && !moon.hasAttribute("data-rendered")) {
      moon.setAttribute("data-rendered", "");
    }
  }

  function updateHighlight() {
    const current = hoveredCard || focusedCard;
    if (current === activeCard) return;
    activeCard?.removeAttribute("data-active");
    current?.setAttribute("data-active", "");
    activeCard = current;
    hoverTiltX = hoverTiltY = 0;
    if (reduced.matches) positionCards(1);
  }

  orbit.addEventListener("pointermove", (event) => {
    if (!canHover.matches || dragging || orbit.inert) return;
    const bounds = orbit.getBoundingClientRect();
    targetGazeX = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
    targetGazeY = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1);
    moonNeedsDraw = true;
    hoveredCard = event.target.closest(".orbit-card");
    updateHighlight();
    if (hoveredCard && !reduced.matches) {
      hoverTiltX = -targetGazeY * 6;
      hoverTiltY = targetGazeX * 9;
    }
  });
  orbit.addEventListener("pointerleave", () => {
    targetGazeX = targetGazeY = 0;
    moonNeedsDraw = true;
    hoveredCard = null;
    updateHighlight();
  });

  cards.forEach((card, index) => {
    card.addEventListener("pointerenter", () => {
      if (!canHover.matches || orbit.inert) return;
      hoveredCard = card;
      updateHighlight();
    });
    card.addEventListener("pointerleave", () => {
      if (hoveredCard !== card) return;
      hoveredCard = null;
      updateHighlight();
    });
    card.addEventListener("focus", () => { focusedCard = card; updateHighlight(); });
    card.addEventListener("blur", () => { focusedCard = null; updateHighlight(); });
    card.addEventListener("keydown", (event) => {
      const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!direction) return;
      event.preventDefault();
      cards[(index + direction + cards.length) % cards.length].focus({ preventScroll: true });
    });
  });

  moon.addEventListener("pointerdown", (event) => {
    if (!drawMoon || event.button !== 0) return;
    dragging = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
    moon.setPointerCapture(event.pointerId);
    moon.setAttribute("data-dragging", "");
  });
  moon.addEventListener("pointermove", (event) => {
    if (dragging?.pointer !== event.pointerId) return;
    dragX += (event.clientX - dragging.x) * 0.010;
    dragY = clamp(dragY + (event.clientY - dragging.y) * 0.007, -0.8, 0.8);
    moonNeedsDraw = true;
    dragging.x = event.clientX;
    dragging.y = event.clientY;
    if (reduced.matches) {
      yaw = dragX + 0.16;
      pitch = dragY + 0.09;
      paintMoon(performance.now(), true);
    }
  });
  moon.addEventListener("lostpointercapture", () => {
    dragging = null;
    moon.removeAttribute("data-dragging");
  });

  openExplorer.addEventListener("click", () => {
    focusRequested = true;
    document.dispatchEvent(new CustomEvent("brahmos:voice", { detail: "explorer" }));
    if (animateScroll) animateScroll(start + distance, { duration: 1.05, easing: gsap.parseEase("sine.inOut") });
    else scrollTo({ top: start + distance, behavior: "instant" });
  });

  function visitSection(hash) {
    const destination = document.querySelector(hash);
    if (!destination) return;
    focusRequested = false;
    mobileMenu.open = false;
    const focus = () => {
      const heading = destination.querySelector("#about-title") || destination;
      heading.focus({ preventScroll: true });
      try {
        history.replaceState(null, "", hash === "#top" ? location.pathname + location.search : hash);
      } catch {
        // File-based previews can still scroll even if history writes are restricted.
      }
    };
    if (animateScroll) {
      animateScroll(destination, { duration: .85, easing: gsap.parseEase("sine.inOut"), onComplete: focus });
    } else {
      destination.scrollIntoView({ behavior: "instant" });
      focus();
    }
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href="#top"], a[href="#about"]');
    if (!link) return;
    event.preventDefault();
    visitSection(link.getAttribute("href"));
  });
  addEventListener("wheel", () => { focusRequested = false; }, { passive: true });
  addEventListener("touchstart", () => { focusRequested = false; }, { passive: true });
  document.addEventListener("brahmos:scrollstate", syncWheelTicker);
  document.addEventListener("visibilitychange", syncWheelTicker);
  document.addEventListener("brahmos:launched", refreshScene);

  let refreshQueued = false;
  function refreshScene() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      measure();
      lenis?.resize();
      ScrollTrigger.refresh();
      positionCards(0);
    });
  }

  const layout = new ResizeObserver(refreshScene);
  layout.observe(frame);
  layout.observe(scene);
  journey.setAttribute("data-enhanced", "");
  openExplorer.disabled = false;
  new IntersectionObserver(([entry]) => {
    wheelOnScreen = entry.intersectionRatio >= .23;
    syncWheelTicker();
    if (!wheelOnScreen) {
      hoveredCard = null;
      updateHighlight();
    }
  }, { threshold: [0, .23] }).observe(orbit);

  const variants = gsap.matchMedia();
  variants.add({
    motion: "(prefers-reduced-motion: no-preference)",
    still: "(prefers-reduced-motion: reduce)",
  }, ({ conditions }) => {
    measure();
    const timeline = conditions.motion ? createScrollTimeline() : null;
    let scroll;
    let stopWatchingWheel;
    let driving = false;
    let mounted = true;
    function driveScroll(seconds) {
      scroll.raf(seconds * 1000);
      if (scroll.isScrolling !== "smooth") {
        gsap.ticker.remove(driveScroll);
        driving = false;
      }
    }
    function startDriver() {
      if (!mounted || driving || scroll.isScrolling !== "smooth") return;
      driving = true;
      gsap.ticker.add(driveScroll);
    }
    function resetClock() {
      if (!driving) scroll.raf(gsap.ticker.time * 1000);
    }
    if (timeline) {
      scroll = new Lenis({ autoRaf: false, lerp: 0.19, smoothWheel: true, syncTouch: false });
      lenis = scroll;
      animateScroll = (target, options) => {
        resetClock();
        scroll.scrollTo(target, options);
        startDriver();
      };
      stopWatchingWheel = scroll.on("virtual-scroll", ({ event }) => {
        if (event.type !== "wheel" || event.ctrlKey || event.defaultPrevented || driving) return;
        // Lenis emits this event before it handles wheel deltas.
        resetClock();
        queueMicrotask(startDriver);
      });
      scroll.on("scroll", ScrollTrigger.update);
    }
    const trigger = ScrollTrigger.create({
      id: "brahmos-journey",
      trigger: journey,
      start: "top top",
      end: "bottom bottom",
      animation: timeline || undefined,
      scrub: Boolean(timeline),
      invalidateOnRefresh: true,
      onUpdate: timeline ? undefined : (self) => renderReduced(self.progress),
      onRefresh: (self) => {
        if (timeline) syncScene(self.progress, false);
        else renderReduced(self.progress);
      },
    });
    if (timeline) {
      timeline.progress(trigger.progress);
      syncScene(trigger.progress, false);
    } else renderReduced(trigger.progress);
    positionCards(1);

    return () => {
      mounted = false;
      if (scroll) {
        gsap.ticker.remove(driveScroll);
        stopWatchingWheel();
        scroll.off("scroll", ScrollTrigger.update);
        scroll.destroy();
        if (lenis === scroll) {
          lenis = undefined;
          animateScroll = undefined;
        }
      }
      gsap.ticker.remove(animateWheel);
      wheelTicking = false;
    };
  });
  document.fonts?.ready.then(refreshScene);

})();
