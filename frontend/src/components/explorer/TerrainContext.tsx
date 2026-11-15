import { useEffect, useState } from "react";
import "../../terrain-context.css";

type Catalogue = {
  latitude: number; longitude: number; grid_id: string; global_child_grid_id: string;
  statistics_grid_id: string; statistics_scope: string; point_elevation_m: null;
  local_elevation_files: number; expected_elevation_files: number; scene_available: false;
  statistics: {
    elevation_min_m: number | null; elevation_max_m: number | null;
    source_resolution_m: number | null; terrain_source: string | null; source_url: string | null;
    native_elevation_min_m: number | null; native_elevation_max_m: number | null;
    native_statistics_spacing_m: number | null; native_statistics_source_ids: string | null;
    height_uncertainty_rms_m_median: number | null;
  };
};

function metres(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString("en", { maximumFractionDigits: 1 })} m` : "Not supplied";
}

export function TerrainContext({ latitude, longitude }: { latitude: number; longitude: number }) {
  const key = `${latitude},${longitude}`;
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; data?: Catalogue; error?: string } | null>(null);
  const current = response?.key === `${key}:${attempt}` ? response : null;
  useEffect(() => {
    const controller = new AbortController();
    const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
    const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
    void fetch(`${base}/api/terrain/catalogue?${params}`, { signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) throw new Error("Catalogue unavailable. Check the backend and local Moon index, then retry.");
        const data = await result.json() as Catalogue;
        if (Math.abs(data.latitude - latitude) > 1e-9 || Math.abs(data.longitude - (longitude === 180 ? -180 : longitude)) > 1e-9)
          throw new Error("Catalogue returned a different coordinate. Retry without changing your selected point.");
        return data;
      }).then((data) => {
        if (!controller.signal.aborted) setResponse({ key: `${key}:${attempt}`, data });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setResponse({ key: `${key}:${attempt}`, error: error instanceof Error ? error.message : "Catalogue unavailable. Retry." });
      });
    return () => controller.abort();
  }, [latitude, longitude, key, attempt]);
  const data = current?.data;
  const stats = data?.statistics;
  const native = typeof stats?.native_elevation_min_m === "number" && typeof stats?.native_elevation_max_m === "number";
  return <section className="terrain-context" aria-label="Terrain catalogue">
    <h3>Terrain catalogue</h3>
    {!current ? <p role="status">Looking up the selected grid…</p> : current.error ? <>
      <p role="status">{current.error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry catalogue</button>
    </> : data && stats ? <>
      <p className="terrain-grid-id">{data.grid_id}</p>
      <dl>
        <div><dt>Summary area</dt><dd>{data.statistics_scope}</dd></div>
        <div><dt>Regional height range</dt><dd>{metres(native ? stats.native_elevation_min_m : stats.elevation_min_m)} to {metres(native ? stats.native_elevation_max_m : stats.elevation_max_m)}</dd></div>
        <div><dt>Source sampling</dt><dd>{metres(native ? stats.native_statistics_spacing_m : stats.source_resolution_m)} — not measurement accuracy</dd></div>
        {stats.height_uncertainty_rms_m_median !== null && <div><dt>Median reported height RMS</dt><dd>{metres(stats.height_uncertainty_rms_m_median)}</dd></div>}
        <div><dt>Point height</dt><dd>Unavailable — elevation rasters not supplied</dd></div>
      </dl>
      <details><summary>Source and coverage</summary><p>{native ? stats.native_statistics_source_ids : stats.terrain_source}</p>
        <p>Summary grid: {data.statistics_grid_id}. Global child: {data.global_child_grid_id}.</p>
        <p>{data.local_elevation_files} / {data.expected_elevation_files} elevation files present locally. Upstream completion reports do not prove these files are installed here.</p>
        {stats.source_url && <a href={stats.source_url} target="_blank" rel="noreferrer">Elevation product reference</a>}
      </details>
      <p>These supplied CSV statistics describe a region, not the exact selected point. The local Blender surface remains a placeholder.</p>
    </> : null}
  </section>;
}
