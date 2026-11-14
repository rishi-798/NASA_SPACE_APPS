# Trip planner verification — October 10, 2026

- Production frontend build and TypeScript check pass; pre-rendered home retained.
- ESLint passes; all five mission-record tests pass.
- All 72 backend/integration tests pass with installed NAIF kernels. One existing
  Starlette/httpx deprecation warning remains.
- Production dependency audit reports zero vulnerabilities. The complete earlier
  audit reported development-tool advisories; no forced dependency downgrade was
  applied. Cesium and Three production chunks trigger size warnings and remain
  lazy-loaded.
- Browser exercised Kennedy LC-39A → Saturn V → Apollo 11 → real landing analysis
  → genuine request preparation → illustrative mission overview.
- Official Saturn V GLB and streamed Cesium Moon render successfully. The current
  preview uses Cesium's evaluation token, which displays a warning; deployment
  must use the user's project-specific ion token. Attribution is retained.
- Mobile landing review and Moon view checked at a narrow phone viewport; no
  document-level horizontal overflow. Progress/gallery scroll inside their own
  containers. Moon attribution no longer overlaps the map controls.
- Latitude 91 is rejected without changing the selected point. Refresh preserves
  Apollo 11's exact coordinate and UTC input, but discards previous results.
- Terrain grid identity works without rasters; measured elevation and detailed
  Blender surface remain unavailable/deferred as requested.

Local preview: http://127.0.0.1:8002/trip. These changes are not pushed to GitHub.

## Refresh correction

Refresh now opens Step 1 (departure), while retaining the previously selected
departure, rocket, lunar point and UTC time. Stored results are still discarded.
All six mission-state tests pass, including restoration from every saved stage;
the rebuilt frontend and lint checks pass.
