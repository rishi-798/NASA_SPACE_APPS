import type { AnalysisResult } from "../../types";
export function AnalysisDetails({ result }: { result: AnalysisResult }) {
  const p = result.provenance, h = result.horizon;
  return <details className="analysis-details"><summary>Calculation assumptions & sources</summary>
    <p><strong>{p.sample_values ? "SAMPLE VALUES — illustrative only" : "Calculated results · no sample values"}</strong> · {p.engine}</p>
    <p>{p.frame} · {p.coordinates}</p><p>{p.geometry}</p><p>{p.visibility_rule}</p><p>{p.sampling}</p>
    <p><strong>{p.horizon_mode}</strong>{h ? ` · ${h.pixel_resolution_m} m/pixel · ${h.azimuth_step}° bins · ${h.observer_height_m} m observer · ${h.min_distance_m}–${h.max_distance_m} m terrain range · ${h.source_frame}` : ". Terrain obstruction is not assessed at this location."}</p>
    <ul>{p.limitations.map(l => <li key={l}>{l}</li>)}</ul>
    <p>Kernel files: {p.kernels.join(", ")}</p>
    <div className="source-links">{result.site.source && <a href={result.site.source} target="_blank" rel="noreferrer">Site coordinates ↗</a>}
      <a href={p.sources[0]} target="_blank" rel="noreferrer">NAIF SPICE ↗</a>
      {h && <a href={h.source} target="_blank" rel="noreferrer">LOLA elevation source ↗</a>}
    </div>
  </details>;
}
