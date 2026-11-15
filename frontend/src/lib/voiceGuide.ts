import { captionText, type Lang, type LineId, type Utterance } from "./voiceLines.ts";

/**
 * Mission-control speech manager. One instance per app; every line goes through it, so there is never more
 * than one utterance at a time and rerenders cannot repeat a prompt (each prompt has a key).
 * The playback engine is injected (pre-recorded clips in the app, a fake in tests).
 */
export type SpeechHandlers = { onstart: () => void; onend: () => void; onerror: (error: string) => void };
export type SpeechRequest = { ids: LineId[]; lang: Lang; text: string };
export type SpeechPort = { speak: (request: SpeechRequest, handlers: SpeechHandlers) => void; cancel: () => void };

export type Caption = { id: number; tag: string; text: string };
export type VoiceState = {
  enabled: boolean;
  muted: boolean;
  /** False when the device cannot play audio at all: captions still work. */
  available: boolean;
  speaking: boolean;
  lang: Lang;
  caption: Caption | null;
  error: string | null;
};
export type SayOptions = {
  /** Repeat even if this key was the last prompt (Replay, a second Explain click). */
  force?: boolean;
  /** Requested by the user (Explain): show the caption even while the guide is off. Speech still needs enabling. */
  explicit?: boolean;
};

const ERRORS: Record<string, string> = {
  "no-recording": "No recording for this line in the selected language yet. Captions continue.",
};

export function createVoiceGuide(port: SpeechPort | null, onState: (state: VoiceState) => void, lang: Lang = "en") {
  let state: VoiceState = { enabled: false, muted: false, available: !!port, speaking: false, lang, caption: null, error: null };
  let lastKey: string | null = null;
  let last: { tag: string; utterance: Utterance } | null = null;
  let current: { tag: string; utterance: Utterance } | null = null;
  let serial = 0;
  const emit = (patch: Partial<VoiceState>) => { state = { ...state, ...patch }; onState(state); };

  function show(tag: string, utterance: Utterance) {
    const id = ++serial;
    current = { tag, utterance };
    const text = captionText(utterance, state.lang);
    emit({ caption: { id, tag, text }, error: null, speaking: false });
    if (!state.enabled || state.muted || !port) return;
    port.cancel();                                   // never overlap: the newest line replaces the old one
    port.speak({ ids: utterance.ids, lang: state.lang, text }, {
      onstart: () => { if (state.caption?.id === id) emit({ speaking: true }); },
      onend: () => { if (state.caption?.id === id) emit({ speaking: false }); },
      onerror: (error) => {
        if (state.caption?.id !== id) return;
        // "interrupted"/"canceled" are our own cancellations, not failures.
        emit({ speaking: false, error: error === "interrupted" || error === "canceled" ? null : ERRORS[error] ?? "Voice playback failed. Captions continue." });
      },
    });
  }

  return {
    getState: () => state,
    say(tag: string, key: string, utterance: Utterance, options: SayOptions = {}) {
      if (!options.force && key === lastKey) return;
      lastKey = key;
      last = { tag, utterance };
      if (!state.enabled && !options.explicit) return;   // remembered, so enabling can announce where you are
      show(tag, utterance);
    },
    /** Stop speech. With a tag, only if the current line has that tag (e.g. a now-stale explanation). */
    cancel(tag?: string) {
      if (tag && state.caption?.tag !== tag) return;
      port?.cancel();
      serial++;
      current = null;
      emit({ speaking: false, caption: null });
    },
    enable() {
      emit({ enabled: true, error: null });
      const context = last && last.tag !== "explain" ? last.utterance.ids : [];
      show("system", { ids: ["online", ...context] });
    },
    disable() {
      port?.cancel();
      serial++;
      current = null;
      emit({ enabled: false, speaking: false, caption: null, error: null });
    },
    setMuted(muted: boolean) {
      if (muted) { port?.cancel(); serial++; }
      emit({ muted, speaking: false });
    },
    /** Switch language: the caption on screen is re-rendered; the next line is spoken in the new language. */
    setLang(next: Lang) {
      if (next === state.lang) return;
      port?.cancel();
      serial++;
      const caption = current ? { id: serial, tag: current.tag, text: captionText(current.utterance, next) } : null;
      emit({ lang: next, caption, speaking: false });
    },
    replay() {
      const line = current ?? last;
      if (line) show(line.tag, line.utterance);
    },
  };
}
export type VoiceGuide = ReturnType<typeof createVoiceGuide>;
