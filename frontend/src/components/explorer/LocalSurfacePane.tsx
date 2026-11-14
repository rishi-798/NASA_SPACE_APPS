import { lazy, Suspense, useEffect, useState } from 'react';
import type { MoonLocation } from '../../MoonMap';
import type { TerrainChoice, TerrainRegion } from './terrainTypes';
import '../../local-surface.css';
import { surfaceTime } from '../../lib/surfaceViewMath';

const Viewer = lazy(() => import('./LocalTerrainViewer'));
const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export function LocalSurfacePane({ latitude, longitude, observationTime, onPick }: {
  latitude: number; longitude: number; observationTime: string; onPick: (point: MoonLocation) => void;
}) {
  const key = `${latitude},${longitude}`;
  const [regions, setRegions] = useState<TerrainRegion[]>([]);
  const [choice, setChoice] = useState<{ key: string; data: TerrainChoice } | null>(null);
  const [active, setActive] = useState<TerrainRegion | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${base}/api/terrain/local-scenes`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Surface view catalogue unavailable.'); return r.json(); })
      .then(data => setRegions(data.scenes))
      .catch(e => { if (!controller.signal.aborted) setError(String(e.message)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
    void fetch(`${base}/api/terrain/local-scene?${params}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Could not match this coordinate to a surface model.'); return r.json(); })
      .then(data => { setChoice({ key, data }); setError(''); })
      .catch(e => { if (!controller.signal.aborted) setError(String(e.message)); });
    return () => controller.abort();
  }, [latitude, longitude, key]);
  const current = choice?.key === key ? choice.data : null;
  const visible = active && (!current || current.scene?.id === active.id);
  return <section className="local-surface" aria-label="Moon surface view">
    <header><div><p className="eyebrow">Blender · measured terrain</p><h2>Moon surface view</h2></div>
      <label>Explore a finished patch<select aria-label="Choose surface patch" value="" onChange={event => {
        const region = regions.find(r => r.id === event.target.value);
        if (region) { setActive(null); onPick({ ...region.anchor, name: region.name }); }
      }}><option value="" disabled>G7, landing sites…</option>
        {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select></label></header>
    {error ? <p role="status">{error}</p> : !current ? <p role="status">Matching this coordinate to its terrain patch…</p> : <>
      <p>{current.grid_id}{current.scene ? ` · ${current.scene.name}` : ' · No exported surface model covers this point yet.'}</p>
      {current.scene && <button type="button" onClick={() => setActive(visible ? null : current.scene)}>
        {visible ? 'Close surface view' : 'Enter surface view'}
      </button>}
    </>}
    {visible && <Suspense fallback={<p role="status">Opening 3D viewer…</p>}>
      <SurfaceSession key={active.id} region={active} latitude={latitude} longitude={longitude}
        observationTime={observationTime} onPick={onPick} />
    </Suspense>}
    <p className="local-surface-note">Source terrain stays at true scale. Surface views are model previews, not photographs or landing-safety assessments. Crater overviews and the other Site04 grids are not enabled yet.</p>
  </section>;
}

function SurfaceSession(props: {
  region: TerrainRegion; latitude: number; longitude: number; observationTime: string;
  onPick: (point: MoonLocation) => void;
}) {
  const [clock, setClock] = useState({start: props.observationTime, minutes: 0});
  const minutes = clock.start === props.observationTime ? clock.minutes : 0;
  const time = surfaceTime(props.observationTime, minutes);
  return <>
    <div className="surface-time-controls">
      <label>Surface lighting · 24-hour UTC window
        <input aria-label="Surface lighting time" type="range" min="0" max="1440" step="10" value={minutes}
          aria-valuetext={`${time} (${minutes} minutes from window start)`}
          onChange={event => setClock({start: props.observationTime, minutes: Number(event.target.value)})} />
      </label>
      <time dateTime={time}>{time.replace('T', ' ').replace('.000Z', ' UTC')}</time>
      <p>+{(minutes / 60).toFixed(1)} h from the selected observation time. SPICE positions drive the sky and terrain shadows together.</p>
    </div>
    <Viewer {...props} observationTime={time} />
  </>;
}
