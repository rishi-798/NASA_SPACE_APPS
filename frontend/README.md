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
npm run build
```

## Integration boundaries

- `src/lib/api.ts` owns the documented backend requests and response types.
- `MoonExplorer` streams the same Moon Terrain 3D Tiles as the
  [Cesium Moon showcase](https://sandcastle.cesium.com/standalone.html?id=moon),
  ion asset `2684829`, credited to NASA and the USGS Astrogeology Science Center.
  Clicking the terrain selects its rendered surface coordinates for backend analysis.
  The showcase's Apollo 11/14/15 and Lunokhod 1/2 markers are included alongside
  Athena and Odysseus. Marker clicks and the flight menu select a site and approach
  it; dragging or scrolling interrupts the flight. Reset returns to the full Moon.
- `HorizonContainer` and `VisibilityTimeline` expose
  `data-visualization-slot` boundaries and display real backend results.
- Uncalculated, loading and failed requests show pending values, not mock telemetry.
  Athena uses the backend's LOLA profile; other locations use a flat horizon.
- Landing-site records are imported from the repository's shared
  `data/landing_sites.json`. Empty mission data produces an honest archive
  empty state instead of fabricated records.

## Routes

- `/explorer` — landing site, UTC observation controls, conditions, and
  visualization adapters.
- `/missions` — split-view archive populated from shared repository data.
- `/timeline` — chronology shell ready for dated mission records.
- `/about` — concise product and data-integrity context.

## Visual asset credit

### Streamed Moon terrain

The explorer requires an internet connection to Cesium ion. For local evaluation,
it can use CesiumJS's bundled temporary evaluation token. Before deployment, set
`VITE_CESIUM_ION_ACCESS_TOKEN` in `frontend/.env.local` (see `.env.example`) to a
project token with read access to Moon Terrain asset `2684829`, then rebuild.
Client tokens are visible in the browser; use minimal permissions and allowed-URL
restrictions. Cesium's evaluation notice and data attribution remain visible.

Historic marker coordinates are from the showcase source:
https://sandcastle.cesium.com/gallery/moon/main.js
Apollo 14's longitude is normalized from 342.52135° to −17.47865°.
The visible 3D terrain does not replace the backend's horizon datasets: Athena
still uses LOLA; arbitrary coordinates (including historic markers) use the
backend's explicitly labeled flat horizon.

The bundled `public/moon-mosaic.png` is NASA Scientific Visualization Studio
and Lunar Reconnaissance Orbiter imagery. Source:
https://science.nasa.gov/resource/moon-mosaic/

The previous `public/nasa-moon.glb` asset (no longer used by the explorer) is credited to NASA Goddard:
https://svs.gsfc.nasa.gov/14959/
