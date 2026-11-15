import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createVoiceGuide, type VoiceState } from "../../lib/voiceGuide";
import { deviceLanguage, LANGS, type Lang } from "../../lib/voiceLines";
import { clipSpeech } from "../../lib/voicePlayback";
import { VoiceContext, type LangPreference } from "./voiceContext";

const PREF_KEY = "mc-voice-language";
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
  const value = useMemo(() => ({
    guide, state: state ?? guide.getState(), preference, deviceLang: resolve("auto"),
    setPreference: (next: LangPreference) => {
      setPreferenceState(next);
      try { if (next === "auto") localStorage.removeItem(PREF_KEY); else localStorage.setItem(PREF_KEY, next); } catch { /* storage optional */ }
    },
  }), [guide, state, preference]);
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
