# Trip planner integration

October 11 update: the supplied regional catalogue/index and additional NASA
rocket geometry are now installed. See `dataset-integration-20261011.md` for
current availability; the detailed Blender surface and point-height rasters are
still missing. The foundation notes below describe the original integration.

The existing home, Explorer, Missions, Timeline and About pages are preserved.
The new `/trip` route extends their dark visual system rather than replacing the
website. Its stages are departure, rocket, Moon destination, landing review and
mission overview.

## Connected projects

- Rishi: the supplied Cesium Moon viewer, ion asset 2684829, historical/CLPS
  markers, depth-based coordinate selection, and selected-site controls.
- Suhas: the existing integrated Python/SPICE API, named-site horizons and
  coordinate analysis. Existing CORS, static serving and gzip integration remain.
- Dip/Hemanth: terrain catalogue/grid modules, metadata, index-building script,
  and terrain API foundation. `/api/terrain/identity` returns grid identity only.
  It explicitly returns no elevation or detailed scene. Dataset-dependent
  endpoints report unavailable until the actual manifest/rasters are installed.

## Deliberately deferred

The user asked to leave detailed terrain unchanged until the Blender GLB/glTF,
its location/coordinate metadata and the real raster manifest/files are supplied.
No substitute surface, fake elevation, rover placement or fabricated landing
safety is implemented. The landing review uses a clearly labeled global reference
image, not a claimed local scene. See `MOON_DATASET.md` for the supplied dataset
contract. Do not rename the legacy SITE04/G7 region to an Apollo site.

## State and calculations

`frontend/src/lib/missionState.ts` owns a versioned mission record: departure,
rocket, exact latitude/longitude, UTC observation time, revision and analysis.
Changes to inputs clear results and increment the revision. Responses are accepted
only for the current revision; canceled/older requests cannot overwrite it.
Local storage saves selections only. Refresh restores choices but always opens
Step 1 (departure), and requires fresh analysis. Editing departure/rocket does
not discard a chosen lunar coordinate.

Coordinates are planetocentric latitude in degrees and east-positive longitude.
The planner validates finite values and the latitude/longitude bounds. The chosen
point is sent without display-rounding to the backend. A known CLPS coordinate
uses its existing site horizon; historical/custom points use a labeled flat
horizon. Coordinate alignment has uncertainty: streamed terrain and the SPICE
frame are not asserted to be a scientifically calibrated surface registration.

Landing review requests actual conditions, 30-minute daily visibility samples,
summary and an available site horizon. Final preparation shows rotating NASA Moon
facts only while real requests are pending; no artificial wait is imposed.
Failures remain editable/retryable. Visibility is geometric, not a radio link
budget, launch window, flight trajectory or landing certification.

## Assets and presentation limits

The official NASA Saturn V GLB is attributed to NASA / Michael D. Carbajal:
https://science.nasa.gov/3d-resources/saturn-v/
Its gallery scale is illustrative. Eight other entries are explicitly model
pending. Departure coordinates are approximate prototype pad positions and
rocket associations are historical context, not launch approval.

The overview shows separate schematic Earth and Moon bodies, a selected-point
marker and a representative curved path. Sizes, distance and travel time are
compressed. It is labeled illustrative; there is no calculated flight duration,
delta-v, fuel budget or launch-window claim. NASA Moon imagery/model attribution
is retained in `frontend/public/MODEL-SOURCES.md`. Loader facts are sourced from
https://science.nasa.gov/moon/facts/.

## Development and verification

Install frontend dependencies with `npm ci`; run `npm test`, `npm run lint` and
`npm run build` inside `frontend`. Build includes TypeScript checking, production
assets and the pre-rendered home page. Large Cesium/Three bundles are lazy-loaded
on the routes/stages that need them. Set a deployment-appropriate restricted ion
read token through `frontend/.env` using `.env.example`; never commit secrets.

Run `python -m pytest tests -q` from the project environment with the five NAIF
kernels installed. On Windows, a fresh project-local `--basetemp` and
`-o cache_dir=...` can avoid permissions inherited from a different user account.
The checks cover scientific results, terrain missing-data behavior, static trip
and model serving, and mission state/stale-response handling.

Package using `python scripts/package_project.py --output NASA-APP-trip-planner.zip`.
The archive includes one `NASA-APP` directory, source, built frontend, kernels,
metadata, tests and Windows launcher. It excludes local environments, secrets,
incoming ZIP extraction, publish checkouts and previous recovery archives.
