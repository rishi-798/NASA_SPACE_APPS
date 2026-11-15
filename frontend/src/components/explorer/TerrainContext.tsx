import { useEffect, useState } from "react";
import type { CatalogueState, HorizonProfile, TerrainStatus } from "../../types";
import { horizonModel, pointElevation } from "../../lib/terrainFacts";
import "../../terrain-context.css";

type ModelIdentity = {
  model_available?: boolean;
  model_id?: string;
  model_url?: string;
  preview_url?: string;
  note?: string;
};

type Props = {
  latitude: number;
  longitude: number;
  catalogue: CatalogueState;
  onRetry: () => void;
  /** Backend terrain status + profile of the current analysis, when one exists. */
  terrain?: TerrainStatus | null;
  horizon?: HorizonProfile | null;
};

function metres(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString("en", { maximumFractionDigits: 1 })} m` : "Not supplied";
}

/** Four different terrain products, shown separately so none is mistaken for another. */
export function TerrainContext({ latitude, longitude, catalogue, onRetry, terrain = null, horizon = null }: Props) {
  const key = `${latitude},${longitude}`;
  const [identity, setIdentity] = useState<{ key: string; data: ModelIdentity } | null>(null);
  const modelInfo = identity?.key === key ? identity.data : null;
  useEffect(() => {
    const controller = new AbortController();
    const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
    const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
    void fetch(`${base}/api/terrain/identity?${params}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data: ModelIdentity | null) => {
        if (!controller.signal.aborted && data) setIdentity({ key, data });
      }).catch(() => {});
    return () => controller.abort();
  }, [latitude, longitude, key]);
  const point = pointElevation(catalogue);
  const data = catalogue.status === "ready" ? catalogue.data : null;
  const stats = data?.statistics;
  const native = typeof stats?.native_elevation_min_m === "number" && typeof stats?.native_elevation_max_m === "number";
  const model = horizonModel(terrain, horizon);
  return <section className="terrain-context" aria-label="Terrain information">
    <h3>Terrain information</h3>

    <h4>1 · Sampled point elevation</h4>
    <dl>
      <div><dt>Height</dt><dd data-testid="point-elevation">{point.text}</dd></div>
      {point.state === "available" && <>
        <div><dt>Datum</dt><dd>{point.datum}</dd></div>
        <div><dt>Resolution</dt><dd>{point.resolution}</dd></div>
        <div><dt>Source</dt><dd>{point.source}</dd></div>
      </>}
    </dl>
    {point.state === "unavailable" && <p role="status">{point.reason}</p>}
    {point.state === "unavailable" && catalogue.status === "error" && <button type="button" onClick={onRetry}>Retry catalogue</button>}
    {point.state === "loading" && <p role="status">Looking up the selected grid…</p>}
    <p className="terrain-note">One sample is not a local horizon or a landing-hazard assessment.</p>

    <h4>2 · Regional elevation statistics</h4>
    {stats && data ? <dl>
      <div><dt>Summary area</dt><dd>{data.statistics_scope}</dd></div>
      <div><dt>Height range</dt><dd>{metres(native ? stats.native_elevation_min_m : stats.elevation_min_m)} to {metres(native ? stats.native_elevation_max_m : stats.elevation_max_m)}</dd></div>
      <div><dt>Source sampling</dt><dd>{metres(native ? stats.native_statistics_spacing_m : stats.source_resolution_m)} — not measurement accuracy</dd></div>
      {stats.height_uncertainty_rms_m_median !== null && <div><dt>Median height RMS</dt><dd>{metres(stats.height_uncertainty_rms_m_median)}</dd></div>}
    </dl> : <p role="status">{catalogue.status === "loading" ? "Looking up…" : "Unavailable: the terrain catalogue could not be read for this point."}</p>}
    {data && <details><summary>Source and coverage</summary>
      <p>{native ? stats?.native_statistics_source_ids : stats?.terrain_source}</p>
      <p>Grid {data.grid_id} · summary grid {data.statistics_grid_id}.</p>
      <p>{data.local_elevation_files} / {data.expected_elevation_files} elevation files present locally.</p>
      {stats?.source_url && <a href={stats.source_url} target="_blank" rel="noreferrer">Elevation product reference</a>}
    </details>}

    <h4>3 · Terrain horizon used for visibility</h4>
    <dl>
      <div><dt>Model</dt><dd data-testid="horizon-model">{model.label}</dd></div>
      {model.demHeight && <div><dt>Horizon DEM height at site</dt><dd>{model.demHeight} (LOLA, datum sphere)</dd></div>}
      {model.resolution && <div><dt>Resolution</dt><dd>{model.resolution}</dd></div>}
      {model.source && <div><dt>Source</dt><dd><a href={model.source} target="_blank" rel="noreferrer">LOLA elevation model</a></dd></div>}
    </dl>
    <p className="terrain-note">{model.limits ?? model.detail}</p>
    {model.demHeight && point.state === "available" && <p className="terrain-note">The horizon DEM and the catalogue are separate products; their heights at one point may differ slightly.</p>}

    <h4>4 · Visual terrain model</h4>
    <p className="terrain-note"><strong>Cesium Moon (integrated):</strong> NASA/USGS imagery and terrain for orientation and lighting only. It is not used in the visibility calculation.</p>
      {modelInfo?.model_available ? (
        <div className="terrain-model-card" style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(56, 189, 248, 0.08)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}>✓ 3D Measured Mesh Available</span>
            {modelInfo.model_url && (
              <a href={modelInfo.model_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#93c5fd', textDecoration: 'underline' }}>
                Download GLB
              </a>
            )}
          </div>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#cbd5e1' }}>{modelInfo.note}</p>
          {modelInfo.preview_url && (
            <img src={modelInfo.preview_url} alt="Scientific terrain render preview" style={{ marginTop: '0.5rem', width: '100%', height: 'auto', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.15)' }} />
          )}
        </div>
      ) : (
        <p>Regional ranges describe the surrounding area. Point height is sampled separately from the terrain file. Open available models in Moon surface view below.</p>
      )}

  </section>;
}
