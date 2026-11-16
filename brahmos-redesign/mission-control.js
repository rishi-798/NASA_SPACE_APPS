(() => {
  const corpus = window.BRAHMOS_DATA?.voice;
  if (!corpus) return;

  const synthesis = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window ? window.speechSynthesis : null;
  const audio = new Audio();
  audio.preload = "none";
  const local = new Set(corpus.localAudio);
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  let enabled = read("brahmos-voice-enabled") === "true";
  let muted = read("brahmos-voice-muted") === "true";
  let language = read("brahmos-voice-language") || "en";
  if (!corpus.languages[language]) language = "en";
  let cue = "online";
  let speech;
  let generation = 0;

  const dialog = document.createElement("dialog");
  dialog.className = "mission-control glass";
  dialog.setAttribute("data-lenis-prevent", "");
  dialog.setAttribute("aria-labelledby", "mc-title");
  dialog.innerHTML = `
    <div class="mission-control__content">
      <div class="mission-control__heading">
        <h2 id="mc-title">Mission control</h2>
        <form method="dialog"><button class="control-button" aria-label="Close mission control">×</button></form>
      </div>
      <p class="mission-control__caption" aria-live="polite"></p>
      <p class="mission-control__status" role="status"></p>
      <label class="mission-control__language">Voice language<select></select></label>
      <div class="mission-control__actions">
        <button type="button" class="control-button" data-enable></button>
        <button type="button" class="control-button" data-mute></button>
        <button type="button" class="control-button" data-replay>Replay</button>
      </div>
    </div>`;
  document.body.append(dialog);

  const label = dialog.querySelector(".mission-control__caption");
  const status = dialog.querySelector(".mission-control__status");
  const select = dialog.querySelector("select");
  const enable = dialog.querySelector("[data-enable]");
  const mute = dialog.querySelector("[data-mute]");
  const replay = dialog.querySelector("[data-replay]");
  for (const [code, voice] of Object.entries(corpus.languages)) select.add(new Option(voice.name, code));
  select.value = language;

  const anchors = [];
  const headset = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2m-13 4H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1zm10 0h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1zm0 0a3 3 0 0 1-3 3h-2"/></svg>';
  for (const [root, placement] of [
    [".hero .topbar", "header"], [".orbit", "orbit"], [".about__header", "about"], [".workspace-header", "workspace"],
  ]) {
    const parent = document.querySelector(root);
    if (!parent) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mission-control-trigger mission-control-trigger--${placement} glass`;
    button.setAttribute("aria-haspopup", "dialog");
    button.innerHTML = headset + '<span class="mission-control-trigger__label"></span>';
    button.addEventListener("click", () => {
      dialog.showModal();
      if (!enabled) activate();
      document.dispatchEvent(new Event("brahmos:glasschange"));
    });
    parent.append(button);
    anchors.push(button);
  }

  function update() {
    const title = enabled ? "Mission control" : "Enable mission control";
    for (const button of anchors) {
      button.querySelector(".mission-control-trigger__label").textContent = title;
      button.setAttribute("aria-label", title);
    }
    if (!enabled) {
      label.textContent = "Enable the voice guide to hear the current operation.";
      status.textContent = "Voice guide off";
    }
    enable.textContent = enabled ? "Disable guide" : "Enable voice guide";
    mute.textContent = muted ? "Unmute" : "Mute";
    mute.disabled = !enabled;
    replay.disabled = !enabled;
  }

  function stop() {
    generation++;
    audio.pause();
    synthesis?.cancel();
  }

  function play() {
    stop();
    update();
    if (!enabled) return;
    const line = corpus.lines[cue];
    const selected = corpus.languages[language];
    const voices = synthesis?.getVoices() ?? [];
    const voice = voices.find((item) => item.lang.toLowerCase() === selected.bcp47.toLowerCase()) ||
      voices.find((item) => item.lang.toLowerCase().split("-")[0] === language);
    if (muted) {
      label.lang = line[language] ? selected.bcp47 : "en";
      label.textContent = line[language] || line.en;
      status.textContent = "Muted · captions on";
      return;
    }
    const token = generation;
    const useLocal = local.has(cue) && (language === "en" || !line[language] || !voice);
    status.textContent = "Starting audio…";
    if (useLocal) {
      label.lang = "en";
      label.textContent = line.en;
      audio.src = `media/voice/${cue}.wav`;
      const playing = language === "en" ? "Playing voice guide" : "Playing English · selected voice unavailable for this cue";
      audio.onended = () => { if (generation === token) status.textContent = "Voice guide ready"; };
      audio.play().then(() => { if (generation === token) status.textContent = playing; }).catch(() => {
        if (generation === token) status.textContent = "Audio could not start. Select Replay to try again.";
      });
      return;
    }
    label.lang = line[language] ? selected.bcp47 : "en";
    label.textContent = line[language] || line.en;
    if (!synthesis || !voice || !line[language]) {
      status.textContent = "Captions only · voice unavailable";
      return;
    }
    speech = new SpeechSynthesisUtterance(label.textContent);
    speech.lang = selected.bcp47;
    speech.voice = voice;
    speech.rate = .94;
    speech.onstart = () => { if (generation === token) status.textContent = "Playing voice guide"; };
    speech.onend = () => { if (generation === token) status.textContent = "Voice guide ready"; };
    speech.onerror = () => { if (generation === token) status.textContent = "System voice unavailable. Try English or Replay."; };
    synthesis.speak(speech);
  }

  function activate() {
    enabled = true;
    muted = false;
    write("brahmos-voice-enabled", "true");
    write("brahmos-voice-muted", "false");
    play();
  }

  enable.addEventListener("click", () => {
    if (!enabled) { activate(); return; }
    enabled = false;
    write("brahmos-voice-enabled", "false");
    stop();
    update();
  });
  mute.addEventListener("click", () => {
    muted = !muted;
    write("brahmos-voice-muted", String(muted));
    play();
  });
  replay.addEventListener("click", play);
  select.addEventListener("change", () => {
    language = select.value;
    write("brahmos-voice-language", language);
    play();
  });
  dialog.addEventListener("close", () => document.dispatchEvent(new Event("brahmos:glasschange")));
  document.addEventListener("brahmos:voice", (event) => {
    if (!corpus.lines[event.detail]) return;
    cue = event.detail;
    play();
  });
  update();
  if (enabled) {
    label.textContent = corpus.lines.online[language] || corpus.lines.online.en;
    status.textContent = muted ? "Muted · captions on" : "Voice guide ready";
  }
  window.addEventListener("pagehide", stop);
  window.BrahmosGlass?.register();
})();
