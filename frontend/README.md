# CLPS Lunar Browser frontend

React/TypeScript interface for exploring sunlight, Earth visibility, and terrain
context at CLPS-linked lunar landing sites.

## Run locally

```bash
npm install
npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to
`http://localhost:8000`. Set `VITE_API_BASE_URL` when the API is hosted at a
different origin.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Integration boundaries

- `src/lib/api.ts` owns the documented backend requests and response types.
- `MoonExplorer` currently presents a local NASA LRO mosaic in a replaceable
  2D shell. It does not implement or overwrite a 3D visualization system.
- `HorizonContainer` and `VisibilityTimeline` expose
  `data-visualization-slot` boundaries for the visualization team's components.
- Preview telemetry is isolated in `createInterfacePreview` and is visibly
  labeled as illustrative. It is never presented as a backend result.
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

The bundled `public/moon-mosaic.png` is NASA Scientific Visualization Studio
and Lunar Reconnaissance Orbiter imagery. Source:
https://science.nasa.gov/resource/moon-mosaic/
