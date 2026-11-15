import { createContext, useContext, useEffect } from "react";
import type { VoiceGuide, VoiceState } from "../../lib/voiceGuide";
import type { Lang, Utterance } from "../../lib/voiceLines";

export type LangPreference = "auto" | Lang;

export const VoiceContext = createContext<{
  guide: VoiceGuide; state: VoiceState; preference: LangPreference; deviceLang: Lang; setPreference: (next: LangPreference) => void;
} | null>(null);

export function useVoiceGuide() {
  const value = useContext(VoiceContext);
  if (!value) throw new Error("useVoiceGuide must be used inside VoiceGuideProvider");
  return value;
}

/** Announce `utterance` when `key` changes (null = nothing to say). Rerenders with the same key say nothing. */
export function useAnnounce(tag: string, key: string | null, utterance: Utterance | null) {
  const { guide } = useVoiceGuide();
  useEffect(() => { if (key && utterance) guide.say(tag, key, utterance); }, [guide, tag, key, utterance]);
}

/** Stop any speech when the page using this hook unmounts. */
export function useCancelOnLeave() {
  const { guide } = useVoiceGuide();
  useEffect(() => () => guide.cancel(), [guide]);
}
