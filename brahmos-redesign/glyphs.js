(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+·/−";

  function setupLabel(element, trigger, duration) {
    const source = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!source) return;

    const original = source.textContent.trim();
    const label = document.createElement("span");
    label.className = "glyph-label";
    const text = document.createElement("span");
    text.className = "glyph-label__text";
    text.textContent = original;
    const flash = document.createElement("span");
    flash.className = "glyph-label__animation";
    flash.setAttribute("aria-hidden", "true");
    label.append(text, flash);
    source.replaceWith(label);

    let timer;
    const cadence = duration > 400 ? 46 : 31;
    const play = () => {
      if (reduced.matches) return;
      clearTimeout(timer);
      label.setAttribute("data-scrambling", "");
      const started = performance.now();
      function shuffle() {
        const time = performance.now() - started;
        if (time >= duration || reduced.matches) {
          label.removeAttribute("data-scrambling");
          flash.textContent = "";
          return;
        }
        const reveal = Math.floor(time / (duration - 22) * original.length);
        flash.textContent = Array.from(original, (character, index) =>
          index < reveal || character === " " ? character : glyphs[Math.floor(Math.random() * glyphs.length)]
        ).join("");
        timer = setTimeout(shuffle, Math.max(1, Math.ceil(Math.min(cadence - time % cadence, duration - time))));
      }
      shuffle();
    };
    trigger.addEventListener("pointerenter", () => { if (canHover.matches) play(); });
    trigger.addEventListener("focus", () => { if (trigger.matches(":focus-visible")) play(); });
  }

  window.setUpBrahmosLabel = setupLabel;
})();
