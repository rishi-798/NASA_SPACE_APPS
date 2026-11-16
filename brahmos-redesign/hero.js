const scene = document.querySelector(".scene");
const video = scene.querySelector("video");
const media = scene.querySelector(".viewport__media");
const cabinArt = scene.querySelector(".cabin__art img");
function syncCabinArt() {
  cabinArt.closest(".cabin").toggleAttribute("data-painted-cabin", cabinArt.naturalWidth > 0);
}
cabinArt.addEventListener("load", syncCabinArt);
cabinArt.addEventListener("error", syncCabinArt);
syncCabinArt();

const motion = matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = matchMedia("(pointer: fine)");
let inView = true;
let panFrame = 0;
let panX = 0;
let panY = 0;

function resetPan() {
  cancelAnimationFrame(panFrame);
  panFrame = 0;
  media.style.removeProperty("transform");
}

function syncPlayback() {
  if (motion.matches || !inView || document.hidden || scene.hasAttribute("data-orbit-cover")
      || document.documentElement.hasAttribute("data-launching")) {
    video.pause();
    return;
  }

  if (!video.getAttribute("src")) video.src = video.dataset.src;
  if (video.paused) {
    video.play().catch(resetPan);
  }
}

if (video.canPlayType("video/mp4")) {
  video.addEventListener("playing", () => video.setAttribute("data-frame", ""));
  video.addEventListener("pause", resetPan);
  video.addEventListener("error", () => {
    video.removeAttribute("data-frame");
  });
  motion.addEventListener("change", () => {
    if (motion.matches) {
      video.removeAttribute("data-frame");
      resetPan();
    }
    syncPlayback();
  });
  document.addEventListener("visibilitychange", syncPlayback);
  document.addEventListener("brahmos:launched", syncPlayback);
  scene.addEventListener("orbitcoverchange", syncPlayback);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    syncPlayback();
  }).observe(scene);
  scene.addEventListener("pointermove", (event) => {
    if (motion.matches || !finePointer.matches || video.paused) return;
    panX = event.clientX;
    panY = event.clientY;
    if (panFrame) return;
    panFrame = requestAnimationFrame(() => {
      panFrame = 0;
      const bounds = scene.getBoundingClientRect();
      const x = (panX - bounds.left) / bounds.width - 0.5;
      const y = (panY - bounds.top) / bounds.height - 0.5;
      media.style.transform = `translate3d(${-x * 17}px, ${-y * 11}px, 0)`;
    });
  });
  scene.addEventListener("pointerleave", resetPan);
  syncPlayback();
}

const mobileMenu = document.querySelector(".mobile-menu");
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileMenu.open) {
    mobileMenu.open = false;
    mobileMenu.querySelector("summary").focus();
  }
});
document.addEventListener("pointerdown", (event) => {
  if (mobileMenu.open && !mobileMenu.contains(event.target)) mobileMenu.open = false;
});

