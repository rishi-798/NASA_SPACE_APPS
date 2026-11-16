(() => {
  const { gsap } = window;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const restoring = performance.getEntriesByType("navigation")[0]?.type === "back_forward";
  const internalReturn = new URLSearchParams(location.search).has("return") || location.hash === "#about";
  if (!gsap || restoring || internalReturn) return;

  const dialog = document.querySelector(".launch-screen");
  const main = document.querySelector("main");
  const brand = dialog.querySelector(".launch-screen__brand");
  const vehicle = dialog.querySelector(".launch-screen__vehicle");
  const flare = dialog.querySelector(".launch-screen__flare");
  const plume = dialog.querySelector(".launch-screen__plume");
  const shader = plume.querySelector("video");
  const fill = dialog.querySelector(".halo-fill");
  const status = dialog.querySelector(".launch-screen__status");
  const text = status.querySelector(".launch-screen__count");
  const count = { value: 0 };
  let finished = false;
  let failSafe;

  document.documentElement.setAttribute("data-launching", "");
  main.inert = true;
  dialog.hidden = false;
  dialog.focus({ preventScroll: true });
  const timeline = gsap.timeline({ paused: true, onComplete: finish });
  document.addEventListener("keydown", onEscape);
  if (reduce.matches) {
    gsap.set([brand, vehicle], { xPercent: -50, yPercent: -50, opacity: 1 });
    gsap.set(fill, { scaleX: 1 });
    text.textContent = "100%";
    failSafe = setTimeout(finish, 1000);
    return;
  }
  shader.preload = "auto";
  shader.src = shader.dataset.src;
  shader.addEventListener("playing", () => shader.setAttribute("data-frame", ""), { once: true });
  const essentials = Promise.allSettled([
    vehicle.querySelector("img").decode(),
    document.querySelector(".cabin__art img").decode(),
    document.fonts?.ready,
  ]);
  const maximumWait = new Promise((resolve) => setTimeout(resolve, 2400));
  failSafe = setTimeout(finish, 5200);

  function onEscape(event) {
    if (event.key === "Escape") finish();
  }

  function onPreference(event) {
    if (event.matches) finish();
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(failSafe);
    timeline.kill();
    const restoreFocus = dialog.contains(document.activeElement);
    if (shader.hasAttribute("src")) {
      shader.pause();
      shader.removeAttribute("src");
      shader.load();
    }
    dialog.hidden = true;
    main.inert = false;
    document.documentElement.removeAttribute("data-launching");
    document.documentElement.removeAttribute("data-ignition");
    document.removeEventListener("keydown", onEscape);
    reduce.removeEventListener("change", onPreference);
    if (restoreFocus) main.focus({ preventScroll: true });
    document.dispatchEvent(new Event("brahmos:launched"));
  }

  reduce.addEventListener("change", onPreference);
  timeline
    .set([brand, vehicle], { xPercent: -50, yPercent: -50, x: 0, y: 0 }, 0)
    .fromTo(brand, { opacity: 0, y: 13 }, { opacity: 1, y: 0, duration: 0.52, ease: "power2.out" }, 0.05)
    .fromTo(vehicle, { opacity: 0, y: 13 }, { opacity: 1, y: 0, duration: 0.65, ease: "sine.out" }, 0.09)
    .fromTo(fill, { scaleX: 0 }, { scaleX: 0.86, duration: 0.98, ease: "sine.out" }, 0.04)
    .to(count, {
      value: 86,
      duration: 0.98,
      ease: "sine.out",
      onUpdate: () => { text.textContent = `${Math.round(count.value).toString().padStart(2, "0")}%`; },
    }, 0.04)
    .addPause(1.04, () => Promise.race([essentials, maximumWait]).then(() => {
      if (!finished) timeline.resume();
    }))
    .to(fill, { scaleX: 1, duration: 0.3, ease: "sine.inOut" }, 1.04)
    .to(count, {
      value: 100,
      duration: 0.3,
      ease: "sine.inOut",
      onUpdate: () => { text.textContent = `${Math.round(count.value)}%`; },
    }, 1.04)
    .addLabel("ignition", 1.28)
    .call(() => {
      document.documentElement.setAttribute("data-ignition", "");
      document.dispatchEvent(new Event("brahmos:ignition"));
      shader.play().catch(() => {});
    }, [], "ignition")
    .to(plume, { xPercent: -50, x: 0, opacity: 1, scaleY: 1.13, duration: 0.3, ease: "power2.out" }, "ignition")
    .to(flare, { opacity: 1, duration: 0.33, ease: "power2.out" }, "ignition")
    .to([brand, status], { opacity: 0, duration: 0.28, ease: "sine.in" }, 1.47)
    .to(vehicle, { y: -innerHeight, duration: 0.94, ease: "power3.in" }, 1.44)
    .to(flare, { opacity: 0, duration: 0.68, ease: "power2.out" }, 1.82)
    .to(dialog, { opacity: 0, duration: 0.45, ease: "sine.inOut" }, 2.13);
  timeline.play(0);
})();
