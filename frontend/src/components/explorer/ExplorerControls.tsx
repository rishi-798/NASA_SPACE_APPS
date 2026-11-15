import { ArrowRight, CalendarBlank, Clock, MapPin, Timer } from "@phosphor-icons/react";
import type { RangeCheck, RangeInput } from "../../lib/analysisRange";
import { formatUtcDisplay } from "../../lib/format";
import { formatMinutes } from "../../lib/windowFinder";
import type { LandingSite } from "../../types";

type ExplorerControlsProps = {
  sites: LandingSite[];
  selectedId: string;
  input: RangeInput;
  check: RangeCheck;
  loading: boolean;
  customLocation: boolean;
  /** Horizon model the backend is expected to use for the selected location (informational). */
  horizonExpectation: string;
  onSiteChange: (siteId: string) => void;
  onInputChange: (patch: Partial<RangeInput>) => void;
  onSubmit: () => void;
};

export function ExplorerControls({ sites, selectedId, input, check, loading, customLocation, horizonExpectation, onSiteChange, onInputChange, onSubmit }: ExplorerControlsProps) {
  const siteName = customLocation ? "Selected map coordinate" : sites.find((s) => s.id === selectedId)?.name ?? selectedId;
  return (
    <section className="configuration" aria-labelledby="configuration-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Mission configuration</p>
          <h2 id="configuration-title">Analysis parameters</h2>
        </div>
        <span className="sequence-number">01</span>
      </div>

      <form className="instrument-fields" onSubmit={(e) => { e.preventDefault(); if (check.ok && !loading) onSubmit(); }} noValidate>
        <label className="instrument-field instrument-field-wide">
          <span><MapPin aria-hidden="true" /> Landing site</span>
          <select value={selectedId} onChange={(event) => onSiteChange(event.target.value)}>
            {customLocation && <option value="custom">Selected map coordinate</option>}
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>

        <label className="instrument-field">
          <span><CalendarBlank aria-hidden="true" /> Start date (UTC)</span>
          <input type="date" required value={input.startDate} onChange={(e) => onInputChange({ startDate: e.target.value })} />
        </label>
        <label className="instrument-field">
          <span><Clock aria-hidden="true" /> Start time (UTC)</span>
          <input type="time" required value={input.startTime} onChange={(e) => onInputChange({ startTime: e.target.value })} />
        </label>
        <label className="instrument-field">
          <span><CalendarBlank aria-hidden="true" /> End date (UTC)</span>
          <input type="date" required value={input.endDate} onChange={(e) => onInputChange({ endDate: e.target.value })} />
        </label>
        <label className="instrument-field">
          <span><Clock aria-hidden="true" /> End time (UTC)</span>
          <input type="time" required value={input.endTime} onChange={(e) => onInputChange({ endTime: e.target.value })} />
        </label>
        <label className="instrument-field instrument-field-wide">
          <span><Timer aria-hidden="true" /> Sampling interval (minutes)</span>
          <input type="number" min={1} max={1440} step={1} inputMode="numeric" required value={input.stepMinutes}
            onChange={(e) => onInputChange({ stepMinutes: e.target.value })} />
        </label>

        <div className="parameter-review" aria-live="polite">
          <p className="eyebrow">Review before analyzing</p>
          {check.ok ? <dl>
            <div><dt>Location</dt><dd>{siteName}</dd></div>
            <div><dt>From</dt><dd>{formatUtcDisplay(check.range.start)}</dd></div>
            <div><dt>To</dt><dd>{formatUtcDisplay(check.range.end)}</dd></div>
            <div><dt>Samples</dt><dd>{check.sampleCount} × {check.range.stepMinutes} min ({formatMinutes(check.durationMinutes)})</dd></div>
            <div><dt>Horizon</dt><dd>{horizonExpectation}</dd></div>
          </dl> : <ul className="form-errors" role="alert">{check.errors.map((message) => <li key={message}>{message}</li>)}</ul>}
        </div>

        <button className="analyze-button" type="submit" disabled={loading || !check.ok}>
          <span>{loading ? "CALCULATING VECTORS" : "ANALYZE CONDITIONS"}</span>
          {loading ? <span className="loading-track" aria-hidden="true" /> : <ArrowRight />}
        </button>
      </form>
    </section>
  );
}
