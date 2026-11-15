import { ArrowCounterClockwise, Headset, SpeakerHigh, SpeakerSlash, X } from "@phosphor-icons/react";
import { LANGS, languageName, type Lang } from "../../lib/voiceLines";
import { useVoiceGuide, type LangPreference } from "./voiceContext";

/** Enable/mute/replay controls and captions carrying exactly what is spoken. */
export function MissionControlDock() {
  const { guide, state, preference, deviceLang, setPreference, setOn } = useVoiceGuide();
  const languagePicker = (
    <label className="mc-lang">
      <span className="visually-hidden">Voice language</span>
      <select aria-label="Voice language" value={preference} onChange={(e) => setPreference(e.target.value as LangPreference)}>
        <option value="auto">Auto: {languageName(deviceLang)}</option>
        {LANGS.map((lang: Lang) => <option key={lang} value={lang}>{languageName(lang)}</option>)}
      </select>
    </label>
  );
  const { enabled, muted, available, speaking, caption, error } = state;
  const audible = enabled && !muted && available;
  if (!enabled) {
    return (
      <aside className="mc-dock" aria-label="Mission control voice guide">
        {caption && <div className="mc-caption" role="status">
          <p lang={state.lang}>{caption.text}</p>
          <small>Enable mission control to hear explanations.</small>
          <button type="button" className="mc-icon" aria-label="Close caption" onClick={() => guide.cancel()}><X /></button>
        </div>}
        <button type="button" className="mc-enable" onClick={() => setOn(true)}>
          <Headset aria-hidden="true" /> Enable mission control
        </button>
      </aside>
    );
  }
  return (
    <aside className="mc-dock mc-dock-on" aria-label="Mission control voice guide">
      <div className="mc-panel">
        <div className="mc-head">
          <span className={`mc-signal${speaking ? " mc-signal-on" : ""}`} aria-hidden="true"><i /><i /><i /></span>
          <strong>Mission control</strong>
          <span className="mc-status">{!available ? "Captions only: voice unavailable" : muted ? "Muted: captions only" : state.blocked ? "Click anywhere for sound" : speaking ? "Speaking" : "Listening for events"}</span>
        </div>
        <p className="mc-text" role="status" aria-live="polite" lang={state.lang}>{caption?.text ?? "Standing by."}</p>
        {error && <p className={state.blocked ? "mc-hint" : "mc-error"} role={state.blocked ? "status" : "alert"}>{error}</p>}
        <div className="mc-actions">
          <button type="button" onClick={() => guide.replay()} disabled={!caption}><ArrowCounterClockwise aria-hidden="true" /> Replay</button>
          {available && <button type="button" aria-pressed={muted} onClick={() => guide.setMuted(!muted)}>
            {muted ? <SpeakerSlash aria-hidden="true" /> : <SpeakerHigh aria-hidden="true" />} {muted ? "Unmute" : "Mute"}
          </button>}
          <button type="button" onClick={() => setOn(false)}><X aria-hidden="true" /> Turn off</button>
          {languagePicker}
        </div>
        <span className="visually-hidden">{audible ? "Voice on" : "Voice off"}</span>
      </div>
    </aside>
  );
}
