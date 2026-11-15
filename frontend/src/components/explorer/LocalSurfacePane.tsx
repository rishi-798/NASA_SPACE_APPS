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
      .then(r => { if (!r.ok) throw new Error('Could not match coordinate.'); return r.json(); })
      .then((data: TerrainChoice) => {
        setChoice({ key, data });
        setError('');
        if (data.scene) {
          setActive(data.scene);
        }
      })
      .catch(e => { if (!controller.signal.aborted) setError(String(e.message)); });
    return () => controller.abort();
  }, [latitude, longitude, key]);

  const current = choice?.key === key ? choice.data : null;

  return (
    <section className="local-surface" aria-label="Moon surface view">
      <div className="local-surface-header">
        <div>
          <span className="surface-badge">3D Measured Topography</span>
          <h2 className="surface-heading">Lunar Surface Explorer</h2>
        </div>
        <div className="surface-header-actions">
          <label className="surface-patch-select-label">
            <span>Landing Site Patch:</span>
            <select
              aria-label="Choose surface patch"
              value={active?.id ?? (current?.scene?.id ?? '')}
              onChange={event => {
                const region = regions.find(r => r.id === event.target.value);
                if (region) {
                  setActive(region);
                  onPick({ ...region.anchor, name: region.name });
                }
              }}
            >
              {regions.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.source_spacing_m.toFixed(0)}m/px)
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && <p role="status" className="surface-status-msg">{error}</p>}
      {!current && !error && <p role="status" className="surface-status-msg">Matching coordinates to high-resolution SLDEM terrain...</p>}

      {active && (
        <Suspense fallback={<div className="surface-loading-box">Loading 1:1 measured lunar topography...</div>}>
          <SurfaceSession key={active.id} region={active} latitude={latitude} longitude={longitude}
            observationTime={observationTime} onPick={onPick} />
        </Suspense>
      )}

      {!active && current && !current.scene && (
        <div className="surface-uncovered-box">
          <p>No regional 1:1 elevation mesh exists for this exact point. Select any measured landing patch from the dropdown above (e.g. Apollo 11, G7 South Pole, Lunokhod 1).</p>
        </div>
      )}
    </section>
  );
}

function SurfaceSession(props: {
  region: TerrainRegion; latitude: number; longitude: number; observationTime: string;
  onPick: (point: MoonLocation) => void;
}) {
  const [clock, setClock] = useState({start: props.observationTime, minutes: 0});
  const minutes = clock.start === props.observationTime ? clock.minutes : 0;
  const time = surfaceTime(props.observationTime, minutes);

  return (
    <div className="surface-session-container">
      <div className="surface-time-scrubber-bar">
        <div className="surface-time-label">
          <span className="surface-time-title">☀️ Solar Ephemeris &amp; Shadow Scrubber (24h UTC Window)</span>
          <time className="surface-time-utc" dateTime={time}>
            {time.replace('T', ' ').replace('.000Z', ' UTC')} (+{(minutes / 60).toFixed(1)}h)
          </time>
        </div>
        <input
          aria-label="Surface lighting time"
          type="range"
          min="0"
          max="1440"
          step="10"
          value={minutes}
          className="surface-range-slider"
          aria-valuetext={`${time} (${minutes} minutes from window start)`}
          onChange={event => setClock({start: props.observationTime, minutes: Number(event.target.value)})}
        />
      </div>
      <Viewer {...props} observationTime={time} />
    </div>
  );
}
