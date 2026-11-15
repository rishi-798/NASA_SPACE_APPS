import { ArrowRight, CalendarBlank, Clock, MapPin } from "@phosphor-icons/react";
import type { LandingSite } from "../../types";

type ExplorerControlsProps = {
  sites: LandingSite[];
  selectedId: string;
  date: string;
  time: string;
  loading: boolean;
  onSiteChange: (siteId: string) => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onSubmit: () => void;
};

export function ExplorerControls({
  sites,
  selectedId,
  date,
  time,
  loading,
  onSiteChange,
  onDateChange,
  onTimeChange,
  onSubmit,
}: ExplorerControlsProps) {
  return (
    <section className="configuration" aria-labelledby="configuration-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Mission configuration</p>
          <h2 id="configuration-title">Observation parameters</h2>
        </div>
        <span className="sequence-number">01</span>
      </div>

      <div className="instrument-fields">
        <label className="instrument-field instrument-field-wide">
          <span>
            <MapPin aria-hidden="true" /> Landing site
          </span>
          <select value={selectedId} onChange={(event) => onSiteChange(event.target.value)}>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>

        <label className="instrument-field">
          <span>
            <CalendarBlank aria-hidden="true" /> Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </label>

        <label className="instrument-field">
          <span>
            <Clock aria-hidden="true" /> Time / UTC
          </span>
          <input
            type="time"
            value={time}
            onChange={(event) => onTimeChange(event.target.value)}
          />
        </label>
      </div>

      <button className="analyze-button" type="button" onClick={onSubmit} disabled={loading}>
        <span>{loading ? "CALCULATING VECTORS" : "ANALYZE CONDITIONS"}</span>
        {loading ? <span className="loading-track" aria-hidden="true" /> : <ArrowRight />}
      </button>
    </section>
  );
}
