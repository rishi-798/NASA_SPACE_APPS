import type {CatalogueState} from '../../types';
import {pointElevation} from '../../lib/terrainFacts';
import '../../terrain-context.css';

function metres(value:number|null) {
  return typeof value==='number'&&Number.isFinite(value)?`${value.toLocaleString('en',{maximumFractionDigits:1})} m`:'Unavailable';
}

/** Retain point evidence and regional range; detailed source/model sections were removed. */
export function TerrainContext({catalogue,onRetry}:{catalogue:CatalogueState;onRetry:()=>void}) {
  const point=pointElevation(catalogue);
  const data=catalogue.status==='ready'?catalogue.data:null;
  const stats=data?.statistics;
  const native=typeof stats?.native_elevation_min_m==='number'&&typeof stats?.native_elevation_max_m==='number';
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
    </dl> : <p role="status">{catalogue.status==='loading'?'Looking up…':'Unavailable: the terrain catalogue could not be read for this point.'}</p>}
  </section>;
}
