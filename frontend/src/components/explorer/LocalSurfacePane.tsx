import { lazy, Suspense, useEffect, useState } from 'react';
import type { MoonLocation } from '../../MoonMap';
import type { TerrainChoice, TerrainRegion } from './terrainTypes';
import '../../local-surface.css';
import { surfaceTime } from '../../lib/surfaceViewMath';

const Viewer = lazy(() => import('./LocalTerrainViewer'));
const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export function LocalSurfacePane({ latitude, longitude, observationTime, onPick, onOpenGlobal, initialMode, diveWhen, onReady }: {
  latitude: number; longitude: number; observationTime: string; onPick: (point: MoonLocation) => void;
  onOpenGlobal?: () => void;
  /** Open the 3D surface in this camera mode ('eye' = lander eye level, arriving with a dive). */
  initialMode?: 'aerial' | 'orbit' | 'eye';
  /** Hold the eye-level dive until true (used while the view is preloading behind the globe). */
  diveWhen?: boolean;
  /** The terrain is loaded and the selected point is on it. */
  onReady?: () => void;
}) {
  const key = `${latitude},${longitude}`;
  const [regions, setRegions] = useState<TerrainRegion[]>([]);
  const [choice, setChoice] = useState<{ key: string; data: TerrainChoice } | null>(null);
  const [catalogueError, setCatalogueError] = useState('');
  const [matchError, setMatchError] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${base}/api/terrain/local-scenes`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Surface view catalogue unavailable.'); return r.json(); })
      .then(data => setRegions(data.scenes))
      .catch(() => { if (!controller.signal.aborted) setCatalogueError('Surface patch catalogue unavailable.'); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
    void fetch(`${base}/api/terrain/local-scene?${params}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Could not match coordinate.'); return r.json(); })
      .then((data: TerrainChoice) => {
        if (controller.signal.aborted) return;
        setChoice({ key, data });
        setMatchError(null);
      })
      .catch(() => { if (!controller.signal.aborted) setMatchError({ key, message: 'Could not match this location to a surface patch. Reload the page to try again.' }); });
    return () => controller.abort();
  }, [latitude, longitude, key]);

  const current = choice?.key === key ? choice.data : null;
  const active = current?.scene ?? null;
  const error = matchError?.key === key ? matchError.message : '';

  return (
    <section className="local-surface" aria-label="Moon surface view">
      <div className="local-surface-header">
        <div>
          <span className="surface-badge">1:1 Endless Lunar Topography</span>
          <h2 className="surface-heading">Lunar Surface Explorer</h2>
        </div>
        <div className="surface-header-actions">
          {onOpenGlobal && (
            <button
              type="button"
              className="surface-back-orbit-btn"
              onClick={onOpenGlobal}
              style={{
                marginRight: '0.75rem',
                padding: '0.4rem 0.75rem',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '6px',
                color: '#38bdf8',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🌐 Global Moon Orbit
            </button>
          )}
          <label className="surface-patch-select-label">
            <span>Landing Site Patch:</span>
            <select
              aria-label="Choose surface patch"
              value={active?.id ?? ''}
              onChange={event => {
                const region = regions.find(r => r.id === event.target.value);
                if (region) {
                  onPick({ ...region.anchor, name: region.name });
                }
              }}
            >
              <option value="" disabled>Choose a surface patch</option>
              {regions.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.source_spacing_m.toFixed(0)}m/px)
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {catalogueError && <p role="status" className="surface-status-msg">{catalogueError}</p>}
      {error && <p role="status" className="surface-status-msg">{error}</p>}
      {!current && !error && <p role="status" className="surface-status-msg">Matching coordinates to available terrain...</p>}

      {active && (
        <Suspense fallback={<div className="surface-loading-box">Loading 1:1 measured lunar topography...</div>}>
          <SurfaceSession key={active.id} region={active} latitude={latitude} longitude={longitude}
            observationTime={observationTime} onPick={onPick} initialMode={initialMode} diveWhen={diveWhen} onReady={onReady} />
        </Suspense>
      )}

      {!active && current && !current.scene && (
        <div className="surface-uncovered-box">
          <p>No local terrain model is available for this location yet. Use the global Moon view, or choose another available surface patch above.</p>
          {onOpenGlobal && <button type="button" onClick={onOpenGlobal}>Open global Moon view</button>}
        </div>
      )}
    </section>
  );
}

function SurfaceSession(props: {
  region: TerrainRegion; latitude: number; longitude: number; observationTime: string;
  onPick: (point: MoonLocation) => void;
  initialMode?: 'aerial' | 'orbit' | 'eye';
  diveWhen?: boolean;
  onReady?: () => void;
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
