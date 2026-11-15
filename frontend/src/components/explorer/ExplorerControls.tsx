import type { LandingSite } from "../../types";

type Props = {
  sites: LandingSite[]; selectedId: string; start: string; end: string; step: number;
  loading: boolean; customLocation: boolean; validation: string | null;
  onSiteChange: (id: string) => void; onStartChange: (value: string) => void;
  onEndChange: (value: string) => void; onStepChange: (value: number) => void; onSubmit: () => void;
};
export function ExplorerControls(p: Props) {
  return <section className="configuration" aria-labelledby="configuration-title">
    <div className="panel-heading"><div><p className="eyebrow">01 / Choose & review</p><h2 id="configuration-title">Observation parameters</h2></div></div>
    <div className="instrument-fields">
      <label className="instrument-field instrument-field-wide"><span>Landing site</span>
        <select value={p.selectedId} onChange={e => p.onSiteChange(e.target.value)}>
          {p.customLocation && <option value="custom">Selected map coordinate</option>}
          {p.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="instrument-field instrument-field-wide"><span>Start / UTC</span><input type="datetime-local" required value={p.start} onChange={e => p.onStartChange(e.target.value)} /></label>
      <label className="instrument-field instrument-field-wide"><span>End / UTC</span><input type="datetime-local" required value={p.end} onChange={e => p.onEndChange(e.target.value)} /></label>
      <label className="instrument-field instrument-field-wide"><span>Calculation step</span><select value={p.step} onChange={e => p.onStepChange(Number(e.target.value))}>
        {[5, 15, 30, 60, 120].map(n => <option key={n} value={n}>{n} minutes</option>)}
      </select></label>
    </div>
    <p className="analysis-note">All dates are UTC. Analyze also compares Athena and Odysseus over this same range.</p>
    {p.validation && <p className="range-error" role="status">{p.validation}</p>}
    <button className="analyze-button" type="button" onClick={p.onSubmit} disabled={p.loading || !!p.validation}>
      {p.loading ? "CALCULATING VISIBILITY…" : "ANALYZE CONDITIONS →"}
    </button>
  </section>;
}
