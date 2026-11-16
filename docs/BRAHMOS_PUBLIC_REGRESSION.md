# BRAHMOS — Independent Regression & Scientific Contract Verification Report

**Target Repository**: `https://github.com/rishi-798/NASA_SPACE_APPS`  
**Regression Branch**: `test/brahmos-public-regression`  
**Public Deployment Tested**: `https://brahm0s.earth/`  
**Report Timestamp (UTC)**: `2026-11-16T07:52:31Z`

---

## 1. Environment, SHAs & Reproduction Commands

| Item | Observed Value |
| :--- | :--- |
| **Local Checkout Base (`main`)** | `10628bd3bd63a777c243f01a7f97e765eeab94ea` (*"Resume saved trip progress and restore mobile menu focus"*) |
| **Public `/build-info.json` (Run Start)** | `c46738015f70d9210bc124d86bcf052033de6c6a` (`built_at_utc`: `2026-11-16T07:28:35.674Z`, SHA256 `7156797ca...`) |
| **Public `/build-info.json` (Browser & API Runs)** | `10628bd3bd63a777c243f01a7f97e765eeab94ea` (`built_at_utc`: `2026-11-16T07:39:42.155Z`, SHA256 `b48c828c7...`) |
| **Operating System & Runtimes** | Windows 11, Node.js `v24.16.0`, Python `3.14.6` |
| **Browser Automation** | Playwright `1.65.1` driving headless Google Chrome `157.0.8103.51` (isolated contexts via `browser.newContext()`) |

### Exact Reproduction Commands

Run from repository root (`rishi-798/NASA_SPACE_APPS` on branch `test/brahmos-public-regression`):

```bash
# Work Package B (Unit State Contract) & Work Package D (Public Scientific Contracts)
node --experimental-strip-types --test tests/brahmos-e2e/trip_state_unit.test.mjs tests/brahmos-e2e/scientific_contracts.test.mjs

# Work Packages A, B (Browser), C (Responsive/A11y), and E (Rendering Lifecycle)
node tests/brahmos-e2e/browser_regression.mjs
```

---

## 2. Five Highest-Priority Findings

| Priority | Classification | Summary | Likely Source File(s) |
| :--- | :--- | :--- | :--- |
| **1** | **Verified Defect** | In-page **"Back to overview"** and **"Back to website"** links route through `/` without `?return=1#top`, causing internal returns to `/brahmos/index.html` to replay the full launch intro (`data-launching`). | `frontend/src/pages/MissionPhasePlannerPage.tsx`, `frontend/src/pages/TripPage.tsx`, `frontend/src/App.tsx`, `brahmos-redesign/launch.js` |
| **2** | **Verified Defect** | Direct navigation or refresh on an unknown URL (e.g. `/nonexistent-brahmos-route-404`) returns raw HTTP 404 JSON (`{"detail":"Not Found"}`) from the FastAPI/Starlette static handler rather than rendering the branded React `UnknownRoute` page (`"This page isn’t in the flight plan."`). | `backend/frontend.py` (`SPAStaticFiles.get_response`) |
| **3** | **Verified Defect** | Several mobile/tablet interactive controls (`320 px`, `390 px`, `768 px`) measure below `44x44` CSS px (`.cam-btn`, `.btn-play`, `.btn-reset`, `.rate-btn` at `36 px` height on `/planner`; `.mission-explore-link` at `29 px` height on `/missions`; filter buttons at `34 px` height on `/timeline`). | `frontend/src/components/redesign/phases-workspace.css`, `frontend/src/components/redesign/mission-workspace.css`, `frontend/src/pages/TimelinePage.tsx` |
| **4** | **Verified Defect** | `/api/terrain/catalogue` and `/api/terrain/local-scene` exhibit `1e-14 deg` IEEE-754 wrap drift on echoed western longitudes (`-35.0081` returned as `-35.00810000000001`), whereas `scene.anchor.longitude` remains exact (`-35.0081`). | `backend/terrain_models_api.py` |
| **5** | **Expected Limitation** | Every load of `/brahmos/index.html` logs a console `404` for `/brahmos/media/cabin-desktop.webp`. Confirmed intentional fallback for excluded licensed cabin art (`brahmos-redesign/HANDOFF.md:65`), though `launch.js` still awaits `.decode()` inside `Promise.allSettled`. | `brahmos-redesign/index.html`, `brahmos-redesign/launch.js`, `brahmos-redesign/HANDOFF.md` |

> **Important Version Delta Observation**: At the start of verification (`07:36:58Z`), `https://brahm0s.earth` served `c46738015f70d9210bc124d86bcf052033de6c6a` (which pre-dated commit `10628bd` for saved trip resumption and mobile Escape focus restoration). Render completed an automatic deploy of `10628bd3bd63a777c243f01a7f97e765eeab94ea` at `07:39:42Z`; all automated Playwright checks (`07:46:37Z` onward) executed against `10628bd`, confirming both fixes live.

---

## 3. Detailed Work Package Verification

### Work Package A — Navigation Reliability

- **Suite Executed**: `tests/brahmos-e2e/browser_regression.mjs` (`1440x900` isolated Chromium context, deployed SHA `10628bd3bd63a777c243f01a7f97e765eeab94ea`).
- **Scope**: 23 deliberate transitions (Root redirect, Topbar links, Footer links, About anchor `#about`, `/about` direct route, Browser `Back`/`Forward`, deep-link `reload()`, Explorer 3D drag -> nav, Planner 3D drag -> nav, "Back to overview", and BRAHMOS wordmark return Home), plus 5 legacy `/workspace.html` query redirects and unknown-route backend vs SPA tests.

#### Highlights & Verified Behavior
- **[Passed Check] 23/23 multi-route transitions** reached their expected path (`/` -> `/brahmos/index.html`, `/missions`, `/timeline`, `/planner`, `/trip`, `/explorer`, `/discover`, `#about`) with zero unhandled `pageerror` exceptions.
- **[Passed Check] Legacy Workspace Routing (`app-links.js` & `WorkspaceRoute` in `App.tsx`)**:
  - `GET /workspace.html?view=analyze&lat=38.315&lon=-35.0081&time=2026-10-23T12%3A00%3A00Z` -> routed cleanly to `/explorer?lat=38.315&lon=-35.0081&time=2026-10-23T12%3A00%3A00Z&ui=brahmos`.
  - Explorer UI reflected preserved inputs (`LAT 38.31° N / LON 35.01° W`, start date `2026-10-23`, start time `12:00` UTC).
  - `/brahmos/workspace.html?view=analyze&...` similarly preserved exact parameters to `/explorer?...&ui=brahmos`.
  - Legacy `view=trip`, `view=phases`, and `view=missions` mapped to `/trip?ui=brahmos`, `/planner?ui=brahmos`, and `/missions?ui=brahmos`.
- **[Passed Check] Direct About Entry**: Both nav `#about` and direct `GET /about` redirected to `/brahmos/index.html#about` and scrolled cleanly to `#about` (`scrollY = 1692 px`), NOT stuck at Hero top (`0 px`).
- **[Verified Defect] Internal Home Links Replay Launch Intro (`MissionPhasePlannerPage.tsx:11`, `TripPage.tsx:217`)**:
  - **Reproduction**: Navigate to `/planner` -> click `"Back to overview"` (`<Link to="/">`).
  - **Expected (`HANDOFF.md:27`)**: Return to `/brahmos/index.html?return=1#top` without replaying the rocket launch overlay.
  - **Actual**: `CinematicHome` (`App.tsx:5-11`) executes `window.location.replace('/brahmos/index.html' + search + targetHash)`. Because `<Link to="/">` carries no `?return=1`, `launch.js` sets `data-launching` and replays the full launch intro. By contrast, header wordmark links use `/brahmos/index.html?return=1#top` and skip the intro cleanly.
- **[Verified Defect] Unknown Route Handling Mismatch (`backend/frontend.py:49-51` vs `App.tsx:22-32`)**:
  - **Reproduction A (In-App SPA Navigation)**: Client-side transition to `/nonexistent-brahmos-route-404` -> renders React `UnknownRoute` (`<h1>This page isn’t in the flight plan.</h1>`), preserving URL without redirecting Home.
  - **Reproduction B (Direct GET / Refresh)**: `GET https://brahm0s.earth/nonexistent-brahmos-route-404` -> `backend/frontend.py` rejects paths outside `PAGES` and serves HTTP `404` JSON `{"detail":"Not Found"}` instead of the styled HTML 404 shell.
- **[Passed Check (Timing Note on Transition Metrics)]**: In Step 05 (Planner -> Trip) and Step 09 (Missions -> Discover), React's `lazy()`/`Suspense` chunk loading finished after DOM navigation (`~600 ms` probe captured transitional title before mounting resolved). Subsequent reload/explicit wait confirmed full page render and zero navigation drops home.

---

### Work Package B — Trip-State Restoration

- **Unit Tests Executed (`tests/brahmos-e2e/trip_state_unit.test.mjs` against local `10628bd`)**: **5/5 Passed** (zero mocks, imports `frontend/src/lib/missionState.ts` directly via Node `--experimental-strip-types`).
- **Live Browser Verification (`/trip` on `10628bd3bd63a777c243f01a7f97e765eeab94ea` in isolated context)**:
  - `stage: "landing"` (valid `kennedy-39a` + `saturn-v` + `Athena IM-2`): reloads directly at **Step 4 — Conditions** (`aria-current="step"` -> `4Conditions`, heading `"Look before you land."`).
  - `stage: "reveal"` with persisted stale `result`: safely resets to **Step 4 — Conditions** (`4Conditions`), retains all editable choices (`kennedy-39a`, `saturn-v`, coordinates, dates), and drops `result`/`resultRevision` so no stale analysis is displayed as fresh.
  - Removed vehicle ID (`rocketId: "removed-x"`, `stage: "moon"`): safely drops back to **Step 2 — Rocket** (`2Rocket`, `"Choose your ride."`).
  - Invalid coordinates (`latitude: 95`, `stage: "landing"`): rejects coordinates and returns to **Step 3 — Destination** (`3Destination`, `"Find your place on the Moon."`).
  - Removed departure site ID (`departureId: "ksc-lc39a"`, malformed JSON `"{bad-json"`, unknown stage strings): degrades cleanly to **Step 1 — Departure** (`1Departure`, `"Where will you leave from?"`) with zero exceptions.
  - Cross-year transfers (`2026-12-30T22:00:00Z` departure -> `2027-01-03T06:00:00Z` arrival) retain exact UTC timestamps and invalidate prior results on any subsequent input change (`WP-B5`).

---

### Work Package C — Mobile & Accessibility (`320`, `390`, `768`, `1440` CSS px)

Checked across `/brahmos/index.html?return=1#top`, `/explorer`, `/trip`, `/planner`, `/missions`, and `/timeline`:

- **[Passed Check] Horizontal Overflow**: Measured `0 px` horizontal overflow (`scrollWidth === innerWidth`) across **all 24** route × viewport combinations (`320`, `390`, `768`, `1440`).
- **[Passed Check] Overlay Obstruction**: `elementFromPoint()` checks detected **0 obscured header/nav/heading controls** across all 24 viewport checks.
- **[Passed Check] 3D Canvas Interaction**: Both `FlightPhases` (`CislunarOrbitalCanvas` on `/planner`) and `Explorer` (`MoonMap` Cesium canvas on `/explorer`) received unobstructed pointer/wheel events at center (`CANVAS` hit directly by `document.elementFromPoint`).
- **[Passed Check] Mobile Menu Escape & Focus Restoration (`10628bd`)**: At `390x844` on `/missions`, opening `.menu-button`, pressing `Escape` closes `#mobile-navigation` and cleanly restores active focus to `BUTTON.menu-button`.
- **[Passed Check] Reduced Motion (`prefers-reduced-motion: reduce`)**: On `/brahmos/index.html`, launch overlay finishes without video animation blocking `<main>`, `.topbar` disables heavy backdrop blur fallback (`#101216`), and `Open Explorer` remains enabled (`disabled: false`).
- **[Verified Defect — Mobile Touch Targets `< 44 px`]**:
  - **Styling vs Functionality Separation**: All underlying buttons/links are functionally clickable and keyboard-accessible, but layout height falls below WCAG/Apple/Material 44 px touch targets on narrow viewports:
    - `/planner` (`320`, `390`, `768`): `.cam-btn` (`System`, `Earth`, `Craft`, `Moon`) and `.btn-play` measure `36 px` tall (`phases-workspace.css:7`); `.planner-topline` back link measures `122x18 px`.
    - `/missions` (`320`, `390`, `768`): `.mission-explore-link` (`"Explore on Moon"`, `"Explore lunar context"`) measures `29 px` tall (`mission-workspace.css:17`).
    - `/timeline` (`320`, `390`, `768`): category filter buttons (`"All Programs"`, `"Surface Deliveries"`, `"Orbital & Demonstrations"`) measure `34 px` tall (`TimelinePage.tsx:85`).
- **[Verified Defect / Gap Note] Keyboard Skip Link Probe During Async Suspense Fallback**: Pressing `Tab` before `React.lazy()` page chunk resolved landed focus temporarily inside `Opening your lunar workspace...`; once mounted, focus styling works via `phases-workspace.css:9` / `mission-workspace.css:23` (`2px solid` outlines). `MissionDossierModal` (`<dialog>`) print modal focus restoration after close was not exercised end-to-end because the modal requires completing an active analysis run in `/trip` first.

---

### Work Package D — Public Scientific API Contracts (`https://brahm0s.earth`)

Executed via `tests/brahmos-e2e/scientific_contracts.test.mjs` (**4/4 Passed**, `0` auth leakage, minimal single-request cadence):

1. **`GET /api/ready` (`[Passed Check]`)**:
   - All 5 NAIF SPICE kernels report `present: true`, `integrity: "verified against manifest"` (`naif0012.tls`, `de440s.bsp`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `moon_de440_220930.tf`).
   - Ephemeris coverage: `1849-12-26T23:59:19Z` to `2150-01-20T23:58:51Z`.
   - `cloud_terrain`: `remote_cog_configured: true`, `remote_host: "huggingface.co"`, `release_pinned: true`, `point_elevation_available: true`.
2. **`GET /api/analysis?site_id=athena-im2&start=2026-10-23T12:00:00Z&end=2026-10-23T13:00:00Z&step_minutes=60` (`[Passed Check]`)**:
   - Returns `schema_version: 1`, `site.terrain_status: "profile_loaded"`, 720-bin LOLA horizon array (datum radius `1737400.0 m`, observer height `2.0 m`, pixel resolution `80.0 m`).
   - Provenance explicitly reports `MOON_ME_DE440_ME421`, geometric positions (`abcorr NONE`, degrees azimuth clockwise from north `[0, 360)`, east-positive longitude `[-180, 180]`), and `sample_values: false`.
   - Cross-check vs `GET /api/sites/athena-im2/visibility?time=2026-10-23T12:00:00Z` at identical epoch (`2026-10-23T12:00:00Z`), frame (`MOON_ME_DE440_ME421`), and observer coordinates (`-84.79°`, `29.2°`): Sun azimuth (`359.220969°`), Sun elevation (`6.578428°`), Earth azimuth (`324.459254°`), and Earth elevation (`7.064328°`) match within `< 1e-6 deg` (exact agreement tolerance justified by floating-point JSON serialization). Terrain clearance equals `elevation - terrain_horizon` within `< 1e-9 deg`.
3. **`GET /api/terrain/catalogue?lat=38.315&lon=-35.0081` & `/api/terrain/local-scene?lat=38.315&lon=-35.0081` (`[Verified Defect — 1e-14 Precision Drift]`)**:
   - Catalogue echoes `local_elevation_files: 41`, `expected_elevation_files: 41`, frame `ME/DE421`, datum radius `1737400.0 m`, matching `REGION-LUNOKHOD-1`.
   - Both top-level responses return `longitude: -35.00810000000001` (`1e-14 deg` float rounding drift from modulo wrapping), while `scene.anchor.longitude` preserves exact `-35.0081`.
4. **`GET /api/weather/launch-sites/kennedy-39a?include_cloud=true` & `include_cloud=false` (`[Passed Check]`)**:
   - Anonymous access (no login/cookie required) returned `200 OK` from provider `Meteomatics` with `25` hourly samples (`start` to `end` +24h inclusive), `temperature_c`, `wind_speed_ms`, `precipitation_mm`, and `cloud_cover_pct`.
   - `include_cloud=false` cleanly returns `cloud_cover_pct: null` across samples without failing or falling back to mock weather.
   - Inspected response payloads for accidental credential strings (`authorization`, `bearer `, `password`, `secret`): zero leakage found.

---

### Work Package E — Rendering Lifecycle & WebGL Cleanup

- **Static Cleanup Inspection (`[Passed Check]`)**:
  - `frontend/src/MoonMap.tsx:489-497` cancels terrain loading (`cancelled = true`), destroys Cesium `ScreenSpaceEventHandler`, removes pointer/wheel listeners, and calls `viewer.destroy()`.
  - `frontend/src/components/explorer/LocalTerrainViewer.tsx:1036-1042` disconnects `ResizeObserver`, disposes `OrbitControls`, traverses and disposes scene meshes/textures/shadow map/renderer, and removes canvas.
  - `frontend/src/components/planner/CislunarOrbitalCanvas.tsx:500-520` cancels `animId`, disposes geometries/materials/textures, disconnects `ResizeObserver`, and disposes renderer.
  - `frontend/src/components/landing/LandingScene.tsx:317-330` calls `cancelAnimationFrame(frame)`, `renderer.dispose()`, and `renderer.forceContextLoss()`.
- **Multi-Cycle Browser Execution (`[Passed Check]`)**:
  - Cycled **6 full passes** across `/explorer` -> `/planner` -> `/trip` -> `/missions` (`24` continuous WebGL mount/unmount cycles).
  - Recorded **`0` `webglcontextlost` events**, **`0` `console.error` / `pageerror` events**, and **`0` orphaned `<canvas>` elements** when resting on `/missions`.
  - Instrumented `requestAnimationFrame` on `/missions` post-unmount: **`0` RAF callbacks fired over 1,000 ms**, confirming no leaking animation loops after leaving `/planner` or `/explorer`. Observed Chrome `performance.memory.usedJSHeapSize` at `83.99 MB` post-cycling (`--enable-precise-memory-info` was not set, so peak native GPU VRAM allocation is not directly observable in standard headless Chrome).

---

## 4. What Was Not Tested & Why

1. **Modal Focus Restoration inside `<dialog class="mission-dossier">` (`MissionDossierModal.tsx`)**: Requires executing a live multi-step `/trip` analysis + transfer flow and opening/closing print preview; left for manual or expanded flow verification so we avoided triggering unrequested heavy transfer/analysis loads.
2. **Real Physical Mobile Touch Hardware & Voice Synthesis Playback**: Checks used Playwright Chromium desktop emulation (`320/390/768 px`), not physical iOS Safari or Android Chrome (`navigator.speechSynthesis` / native momentum scrolling on real iOS devices was not tested).
3. **Cesium Ion Remote Tile Server Errors & Offline Service Worker Simulation**: We kept API/tile traffic gentle per instructions and did not throttle/cut network mid-flight to force ServiceWorker (`sw.js`) offline fallback behavior.
4. **Full 16-Region `.glb` Visual/Material Inspection & Landing Simulation Playback**: Outside automated navigation/lifecycle cycle checks, we did not manually fly through all 16 terrain `.glb` meshes or complete a full powered descent run inside `LandingSimPage.tsx`.
5. **External Cross-Year `/api/transfer/calculate` Numerical Ephemeris Benchmark**: Tested client-side date preservation across `2026-12-30` -> `2027-01-03` in `missionState.ts`, without calling `POST /api/transfer/calculate` against JPL Horizons externally.
