import { useMemo, useState } from "react";
import { formatUtcDisplay } from "../../lib/format";
import { findWindows, formatMinutes, parseMinDuration } from "../../lib/windowFinder";
import type { AnalysisResult } from "../../types";

type Props = { result: AnalysisResult | null; activeIndex: number; onSelect: (index: number) => void };

export function WindowFinder({ result, activeIndex, onSelect }: Props) {
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("0");
  const min = parseMinDuration(hours, minutes);
  const search = useMemo(() => (result && min ? findWindows(result, min) : null), [result, min]);
  const step = result?.summary.step_minutes;
  return (
    <section className="window-finder" aria-labelledby="window-finder-title">
      <div className="visualization-heading">
        <div><p className="eyebrow">Visibility-window finder</p><h2 id="window-finder-title">Sun and Earth both visible</h2></div>
        <p>Windows matching visibility requirements</p>
      </div>
      <form className="window-form" onSubmit={(e) => e.preventDefault()}>
        <label>Minimum continuous duration
          <span className="window-duration">
            <input type="number" min={0} step={1} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Hours" /> h
            <input type="number" min={0} step={1} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes" /> min
          </span>
        </label>
      </form>
      {!result && <p className="analysis-note">Analyze a site first. The finder searches the joint-visibility intervals of that analysis.</p>}
      {result && !min && <p role="alert" className="form-error">Enter a whole-number duration greater than zero.</p>}
      {search && search.windows.length > 0 && <>
        <p role="status" className="analysis-note">{search.qualifying} of {search.total} joint window{search.total === 1 ? "" : "s"} last at least {formatMinutes(min!)}.</p>
        <ol className="window-list">
          {search.windows.map((w) => {
            const selected = activeIndex >= w.startIndex && Date.parse(result!.samples[activeIndex]!.time) < Date.parse(w.end);
            return <li key={w.start}>
              <button type="button" className={`window-item${selected ? " window-item-active" : ""}`} aria-pressed={selected} onClick={() => onSelect(w.startIndex)}>
                <strong>{formatUtcDisplay(w.start)} → {formatUtcDisplay(w.end)}</strong>
                <span>{formatMinutes(w.durationMinutes)}{w.clippedAtStart || w.clippedAtEnd ? " (cut by the analysed range; may be longer)" : ""}</span>
                <small>{w.begins ?? (w.clippedAtStart ? "Already visible at range start" : "")}{w.begins || w.clippedAtStart ? " · " : ""}{w.ends ? `ends: ${w.ends}` : w.clippedAtEnd ? "Still visible at range end" : ""}</small>
                <em>Jump to start</em>
              </button>
            </li>;
          })}
        </ol>
      </>}
      {search && search.windows.length === 0 && <p role="status" className="window-empty">No qualifying window. {search.reason}</p>}
      {result && <p className="analysis-note">
        Start and end times are known only to the {step}-minute sampling step. A window is a period when both centres are above the horizon model; it does not establish adequate power, a working communications link or a safe landing.
      </p>}
    </section>
  );
}
