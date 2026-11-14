# NASA-APP

## Current raster ownership and online demo

Dip owns and hosts the entire raster dataset on his computer. **No teammate is
assigned raster downloading, extraction, transfer, storage or configuration.**
The frontend and backend are served together through an HTTPS tunnel; the browser
requests selected-point results, not the 55 GB dataset. See
`docs/OWNER_HOSTED_BACKEND.md`. This supersedes older handoff transfer tasks.


A cinematic space-project website combining the visual direction of the three
requested Aura references, with this project's own content throughout. The new
home page introduces Rishi's Cesium Moon viewer and Suhas's Python/SPICE visibility
engine. Both remain integrated into the existing operational Explorer.

The **Plan a trip** route adds Earth departure selection, an eleven-rocket catalogue,
Rishi's Moon destinations, exact-coordinate/UTC analysis, and an illustrative
Earth-to-Moon mission overview. The original website and Explorer remain intact.
Detailed Blender terrain, surface placement, and measured raster elevation are
deliberately deferred until their real assets are supplied. Integration details
and source credits: `docs/trip-integration.md`.

October 11 handoff: the full supplied grid catalogue is installed and connected
to the planner and Explorer. NASA SLS and both Ares I variants join the Saturn V
gallery; SLS is explicitly a neutral-material mesh. See
`docs/dataset-integration-20261011.md`. The missing raster and Blender surface
remain placeholders. The runtime uses `data/lunar/` unless `LUNAR_DATASET_DIR`
is set; original completion reports do not mean rasters are installed locally.

GitHub includes the original catalogue compressed under `data/catalogue/`.
`START-NASA-APP.cmd` verifies and restores its CSV and builds the local SQLite
index on first launch. Allow about 2 GB of free disk space for these generated
files; they are deliberately Git-ignored and require no raster download.
For manual setup, run `python scripts/prepare_moon_catalogue.py` before the API.
An existing index or external `LUNAR_DATASET_DIR` is preserved unchanged.

## Windows quick start

Install Python 3.11+. Double-click
`START-NASA-APP.cmd` and open **http://127.0.0.1:8000** after the server starts.
The launcher sets up a project-local Python environment, installs dependencies,
checks/downloads the official NAIF kernels, and runs both the site and API on
one port. The packaged ZIP includes the frontend build and all five kernels.
First Python dependency setup needs an internet connection. If the frontend
build is missing, the launcher builds it (requires Node.js 22.12+ or 24+).
Press Ctrl+C in that console to stop it. If port 8000 is occupied, stop your
existing server or use the manual commands below with a different port.

## Developer setup (PowerShell, project root)

Install Node.js 22.12+ (or 24+) for frontend development. After editing frontend
source, run `npm run build` to refresh the version served by the launcher.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/prepare_moon_catalogue.py
.\.venv\Scripts\python.exe -m backend.download_kernels
cd frontend
npm ci
npm run build
cd ..
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

For hot reload, run the API with `--reload` and in a second terminal run
`npm run dev` in `frontend`. Vite proxies `/api` to `127.0.0.1:8000`.
Vite preview also proxies the API. For separately hosted services, set
`VITE_API_BASE_URL` when building the frontend and set `CORS_ORIGINS` to a
comma-separated list of your frontend origins on the backend.
`SPICE_KERNELS_DIR` optionally selects another kernel directory.

## What's connected

- The Explorer, Missions, Timeline and About routes remain, with a cohesive visual
  redesign and a new home page. Project cards and landing-site links open the real
  Explorer, rather than mock demonstrations.
- `/trip` keeps one mission record across all steps. Editing inputs invalidates
  computed results; saved selections survive refresh, but calculations are rerun.
- Saturn V and both Ares I variants use official NASA GLBs; SLS uses official
  printable geometry with neutral material. Other rocket models and flight
  calculations are marked unavailable rather than represented by fabricated data.
- The terrain catalogue foundation exposes grid identity without claiming sampled
  elevation. Raster-backed endpoints return an explicit unavailable response when
  the external dataset is missing.
- The home page is pre-rendered for immediate content and lazy-separated from the
  heavy Cesium engine. Responsive WebP artwork and compressed text reduce downloads.
  Navigation,
  primary controls, editorial imagery and mobile layouts share one dark design.
- **Analyze conditions** retrieves actual Sun/Earth azimuth, elevation and visibility.
- Named sites use shared `data/landing_sites.json`; a clicked Moon coordinate uses
  the coordinate API. Changing inputs cancels old requests and clears old results.
- Athena's horizon chart displays Suhas's 720-bin LOLA profile and its terrain-aware
  visibility. Odysseus and arbitrary map coordinates use a labeled flat horizon.
- The 24-hour outlook displays real visibility intervals, percentages and longest
  darkness/Earth blackout from 30-minute SPICE samples, for the selected UTC day.
- No fabricated telemetry is shown before analysis or on API failure.
- Mission archive/chronology still reflect the supplied mission data; they are
  separate from the Explorer's computed visibility timeline.

Calculations are geometric positions, not light-time corrected positions or a radio
link budget. Terrain assumes a 2 m instrument height, and site/frame uncertainty
applies. Daily window boundaries are only accurate to the 30-minute sample step.
This is an independent student project, not flight-certified software.

Home-page hero and terrain artwork are AI-generated illustrations, not scientific
data or photographs of the named landing sites. The explorer retains the NASA 3D
model; the featured project uses NASA's existing CGI Moon Kit color map. Design
references, asset prompts and preserved features are documented in
`docs/design-direction.md`.

The working folder retains `NASA-APP-original-frontend.zip` and the earlier full
`NASA-APP.zip` separately. These recovery archives are not nested in the download.
`NASA-APP-redesign.zip` contains the updated project in a single `NASA-APP` folder.
`NASA-APP-trip-planner.zip` is the new trip-planner edition, also containing one
`NASA-APP` folder. Earlier archives are preserved separately.

API documentation: `docs/api.md`. Interactive API docs: http://127.0.0.1:8000/docs.
Terrain provenance and assumptions: `backend/terrain/README.md`.
Kernel sources: `backend/kernels/README.md`.

## Checks

```powershell
.\.venv\Scripts\python.exe -m pytest -q
cd frontend
npm run lint
npm test
npm run build
```

Install all five kernels before testing so the real SPICE tests run, not skip.
Verified locally on Windows with Python 3.14.6; `requirements-lock.txt` records
that tested environment. Use it instead of `requirements.txt` to reproduce it
on Python 3.14. Frontend dependencies are locked by `frontend/package-lock.json`.
The runtime uses the bundled horizon JSON. pyproj also resolves the supplied
local catalogue footprints; rasterio enables sampling once real rasters exist.
