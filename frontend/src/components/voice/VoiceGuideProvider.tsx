import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createVoiceGuide, type VoiceState } from "../../lib/voiceGuide";
import { deviceLanguage, LANGS, type Lang } from "../../lib/voiceLines";
import { clipSpeech } from "../../lib/voicePlayback";
import { VoiceContext, type LangPreference } from "./voiceContext";

const PREF_KEY = "mc-voice-language";
const OFF_KEY = "mc-voice-turned-off";
const readPreference = (): LangPreference => {
  try {
    const saved = localStorage.getItem(PREF_KEY);
    return saved && (LANGS as string[]).includes(saved) ? (saved as Lang) : "auto";
  } catch { return "auto"; }
};
const resolve = (preference: LangPreference): Lang =>
  preference === "auto" ? deviceLanguage(typeof navigator === "undefined" ? null : navigator.languages ?? [navigator.language]) : preference;

export function VoiceGuideProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VoiceState | null>(null);
  const [preference, setPreferenceState] = useState<LangPreference>(() => (typeof window === "undefined" ? "auto" : readPreference()));
  // Created once; the audio engine is looked up lazily so server pre-rendering never touches `window`.
  const guide = useMemo(() => createVoiceGuide(clipSpeech(), setState, resolve(preference)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { guide.setLang(resolve(preference)); }, [guide, preference]);
  const blocked = state?.blocked ?? false;
  // Autoplay was refused: replay the current line on the user's first click or key press.
  useEffect(() => {
    if (!blocked) return;
    const unlock = () => guide.replay();
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => { window.removeEventListener("pointerdown", unlock, { capture: true }); window.removeEventListener("keydown", unlock, { capture: true }); };
  }, [blocked, guide]);
  const value = useMemo(() => ({
    guide, state: state ?? guide.getState(), preference, deviceLang: resolve("auto"),
    /** Turn the guide on unless the user has explicitly turned it off before (remembered in this browser). */
    autoEnable: () => {
      let off = false;
      try { off = localStorage.getItem(OFF_KEY) === "1"; } catch { /* storage optional */ }
      if (!off && !guide.getState().enabled) guide.enable();
    },
    /** Explicit on/off from the dock; turning off is remembered so auto-enable respects it. */
    setOn: (on: boolean) => {
      try { if (on) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, "1"); } catch { /* storage optional */ }
      if (on) guide.enable(); else guide.disable();
    },
    setPreference: (next: LangPreference) => {
      setPreferenceState(next);
      try { if (next === "auto") localStorage.removeItem(PREF_KEY); else localStorage.setItem(PREF_KEY, next); } catch { /* storage optional */ }
    },
  }), [guide, state, preference]);
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
