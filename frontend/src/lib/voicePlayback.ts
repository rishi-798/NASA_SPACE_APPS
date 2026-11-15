import type { SpeechPort } from "./voiceGuide.ts";
import { bcp47 } from "./voiceLines.ts";

/**
 * Plays pre-recorded clips listed in /voice/manifest.json (made once by scripts/generate_voice_lines.py).
 * Nothing is synthesised or fetched from a voice service at runtime. If a clip has not been recorded for
 * the chosen language, the browser's built-in voice reads that line instead; if that is missing too, the
 * guide reports it and captions carry on.
 */
type Manifest = { lines: Record<string, Record<string, { file: string }>> };

export function clipSpeech(base = "/voice/"): SpeechPort | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  let manifest: Manifest | null = null;
  void fetch(`${base}manifest.json`).then((r) => (r.ok ? r.json() : null)).then((m) => { manifest = m; }).catch(() => { manifest = null; });
  const audio = new Audio();
  audio.preload = "auto";
  let token = 0;
  const synth = (window as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  const hasTts = !!synth && typeof synth.speak === "function" && typeof SpeechSynthesisUtterance !== "undefined";

  function fallback(text: string, langTag: string, handlers: Parameters<SpeechPort["speak"]>[1], mine: number) {
    if (!hasTts) { handlers.onerror("no-recording"); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langTag;
    const voices = synth!.getVoices?.() ?? [];
    const voice = voices.find((v) => v.lang === langTag) ?? voices.find((v) => v.lang?.toLowerCase().startsWith(langTag.slice(0, 2).toLowerCase()));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => { if (mine === token) handlers.onstart(); };
    utterance.onend = () => { if (mine === token) handlers.onend(); };
    utterance.onerror = (event) => { if (mine === token) handlers.onerror(event.error); };
    try { synth!.speak(utterance); } catch { handlers.onerror("synthesis-failed"); }
  }

  return {
    speak({ ids, lang, text }, handlers) {
      const mine = ++token;
      const files = ids.map((id) => manifest?.lines?.[lang]?.[id]?.file);
      if (!files.every(Boolean)) { fallback(text, bcp47(lang), handlers, mine); return; }
      let index = 0;
      const playNext = () => {
        if (mine !== token) return;
        if (index >= files.length) { handlers.onend(); return; }
        audio.src = `${base}${files[index++]}`;
        audio.onended = playNext;
        audio.onerror = () => { if (mine === token) handlers.onerror("clip-failed"); };
        audio.play().then(() => { if (mine === token && index === 1) handlers.onstart(); })
          .catch((error: unknown) => { if (mine === token) handlers.onerror(error instanceof DOMException && error.name === "AbortError" ? "interrupted" : "clip-failed"); });
      };
      playNext();
    },
    cancel() {
      token++;
      audio.onended = null;
      audio.onerror = null;
      try { audio.pause(); } catch { /* not playing */ }
      try { synth?.cancel(); } catch { /* nothing to stop */ }
    },
  };
}
