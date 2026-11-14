# CLPS Lunar Browser frontend

React/TypeScript interface for exploring sunlight, Earth visibility, and terrain
context at CLPS-linked lunar landing sites.

## Run locally

```bash
npm ci
npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to
`http://127.0.0.1:8000`. Start the Python API from the repository root (see
`../README.md`). Set `VITE_API_BASE_URL` when the API is hosted at a
different origin.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Integration boundaries

- `src/lib/api.ts` owns the documented backend requests and response types.
- `MoonExplorer` wraps Rishi's Cesium Moon viewer using ion asset 2684829.
  Set `VITE_CESIUM_ION_ACCESS_TOKEN` using `.env.example` for deployment. If ion
  access fails, the bundled NASA reference globe remains usable, with an explicit
  notice that coordinate picking uses a sphere, not measured surface heights.
- `src/lib/missionState.ts` owns the trip record and invalidates stale analysis.
  `TripPage` reuses the backend's real condition and daily visibility outputs.
- `HorizonContainer` and `VisibilityTimeline` expose
  `data-visualization-slot` boundaries and display real backend results.
- Uncalculated, loading and failed requests show pending values, not mock telemetry.
  Athena uses the backend's LOLA profile; other locations use a flat horizon.
- Landing-site records are imported from the repository's shared
  `data/landing_sites.json`. Empty mission data produces an honest archive
  empty state instead of fabricated records.

## Routes

- `/trip` — Earth departure, rocket, Moon destination, landing analysis and
  illustrative mission overview. Detailed surface interaction is deferred.
- `/explorer` — landing site, UTC observation controls, conditions, and
  visualization adapters.
- `/missions` — split-view archive populated from shared repository data.
- `/timeline` — chronology shell ready for dated mission records.
- `/about` — concise product and data-integrity context.

## Visual asset credit

The bundled `public/moon-mosaic.png` is NASA Scientific Visualization Studio
and Lunar Reconnaissance Orbiter imagery. Source:
https://science.nasa.gov/resource/moon-mosaic/

Rishi's `public/nasa-moon.glb` model is credited to NASA Goddard:
https://svs.gsfc.nasa.gov/14959/

The trip gallery's Saturn V model is NASA / Michael D. Carbajal:
https://science.nasa.gov/3d-resources/saturn-v/
