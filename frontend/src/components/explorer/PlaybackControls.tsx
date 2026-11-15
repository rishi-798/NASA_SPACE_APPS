import { ArrowCounterClockwise, CaretLeft, CaretRight, Pause, Play } from "@phosphor-icons/react";
import type { KeyboardEvent } from "react";
import { atEnd, SPEEDS, type PlaybackAction, type PlaybackState } from "../../lib/playback";
import { formatUtcDisplay } from "../../lib/format";

type Props = {
  playback: PlaybackState;
  activeTime: string;
  requestedStart: string;
  speed: number;
  onSpeed: (index: number) => void;
  dispatch: (action: PlaybackAction) => void;
};

/** Play/pause, step and scrub over the returned samples. Any scrub or step pauses playback. */
export function PlaybackControls({ playback, activeTime, requestedStart, speed, onSpeed, dispatch }: Props) {
  const last = playback.count - 1;
  const finished = atEnd(playback);
  const label = playback.playing ? "Pause" : finished ? "Replay" : "Play";
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    // Arrow/Home/End/Page keys move the native slider (and pause via onChange). Space toggles play.
    if (event.key === " ") { event.preventDefault(); dispatch({ type: "toggle" }); }
  }
  return (
    <section className="playback" aria-label="Playback of analysed samples">
      <div className="playback-buttons">
        <button type="button" aria-label="Previous sample" disabled={playback.index <= 0} onClick={() => dispatch({ type: "step", by: -1 })}><CaretLeft /></button>
        <button type="button" className="playback-main" aria-label={label} disabled={playback.count < 2} onClick={() => dispatch({ type: "toggle" })}>
          {playback.playing ? <Pause weight="fill" /> : finished ? <ArrowCounterClockwise /> : <Play weight="fill" />}<span>{label}</span>
        </button>
        <button type="button" aria-label="Next sample" disabled={finished} onClick={() => dispatch({ type: "step", by: 1 })}><CaretRight /></button>
        <label className="playback-speed">
          <span className="visually-hidden">Playback speed</span>
          <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))} aria-label="Playback speed">
            {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
          </select>
        </label>
      </div>
      <input
        className="playback-slider" type="range" min={0} max={Math.max(last, 0)} step={1} value={playback.index}
        aria-label="Scrub through samples" aria-valuetext={`Sample ${playback.index + 1} of ${playback.count}, ${formatUtcDisplay(activeTime)}`}
        onChange={(e) => dispatch({ type: "seek", index: Number(e.target.value) })} onKeyDown={onKey}
      />
      <p className="playback-readout" aria-live="off">
        <span>ACTIVE SAMPLE <time dateTime={activeTime}>{formatUtcDisplay(activeTime)}</time></span>
        <span>Sample {playback.index + 1} of {playback.count}</span>
        <span>REQUESTED START <time dateTime={requestedStart}>{formatUtcDisplay(requestedStart)}</time></span>
        {finished && <span className="playback-end">End of range</span>}
      </p>
    </section>
  );
}
