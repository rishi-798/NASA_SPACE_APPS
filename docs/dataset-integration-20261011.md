# October 11 handoff integration

The site is extended, not replaced. The Step 1 refresh correction is retained.
The integration was first completed locally. Publishing to `main` was separately
authorized by the user afterwards; see `github-publishing.md` for the clone setup.

## Locally installed

The user's fresh-copy archive contains a nested no-Blender handoff. Its original
264 MB `site04_1km_grid.csv` and scientific/source/scene manifests are installed
under `data/lunar/`. The generated SQLite index contains 379,987 records and passes
its integrity check: 379,726 global parent regions, 256 SITE04 regions and five
historical mission regions. Small original metadata is preserved separately under
`metadata/handoff-20261011/`; original handoff documentation is in
`docs/handoff-20261011/`.

The runtime defaults to this bundled data directory; `LUNAR_DATASET_DIR` can
override it. The CSV/index remain excluded from Git. The downloadable project
includes them for a working local catalogue, not an assertion of full raster data.
Import/rebuild scripts: `scripts/import_moon_handoff.py` and
`scripts/build_moon_index.py --dataset-dir data/lunar`.

`GET /api/terrain/catalogue?lat=...&lon=...` resolves the selected coordinate to
its global child and any matching local scene footprint. It returns the correct
regional CSV summary, source spacing and provenance, separately from point
elevation. The planner's Moon selection and landing review, and the existing
Explorer, display these real records. Global child IDs never inherit invented
child statistics: their readout explicitly identifies the approximately 10 km
parent summary. Native global-tier ranges remain separate from the LOLA64 baseline.

Historical markers now use the supplied source coordinates. In particular,
Lunokhod markers refer to final observed rover positions, not lander positions.
Existing saved clicked coordinates are not silently moved to the new markers.

## Missing, intentionally not substituted

None of the 41 elevation-source files is present in these archives. The manifest's
downloaded/completed flags and the upstream verification reports describe Dip's
computer, not this installation. No 55 GB raster download is started. The
catalogue's regional minimum/maximum is not a height measurement at the selected
point. `/api/terrain/lookup` continues to return explicit unavailability without
the real rasters; SPICE visibility remains unchanged.

The Blender local scene and its diagnostic/export GLB are not supplied.
`production_ready` remains false in the G7 scene contract. The supplied alignment
adapter, controls and evidence are preserved and portable tests rerun, but no
local scene is enabled. No fake craters, rover placement, elevation, detailed
textures or live ion-registration claim is introduced. SITE04-G7 is not renamed
to an Apollo landing region.

## Rocket guide

The NASA core gallery now offers Saturn V, SLS Block 1 and Ares I variants A/B.
Older international/commercial choices are retained behind a catalogue toggle,
with their original pending-model limitations. The official NASA SLS printable
STL was converted to GLB using neutral shading, explicitly labeled in the UI.
The guide's detailed digital SLS archive is Blender-only and is not represented
as a ready textured model. Both Ares variants use original NASA GLBs and a local
Draco decoder; canceled-program and non-lunar-flight limitations are visible.
See `frontend/public/MODEL-SOURCES.md` for sources and conversion provenance.

No third-party account, paid model, restricted download or license agreement is
used. Community candidates remain references rather than unverified installed
assets. The PDF guide was used to choose authoritative, redistributable starting
assets, not to assert that all listed files were supplied.

## Alignment checks

`npm run test:alignment` inside `frontend` uses the actual installed Cesium
1.145.0 engine against 47 supplied exported controls. It checks metre scale,
cardinal directions, loader axis correction and a translated/rotated Moon frame.
It does not reproduce a GPU render of the missing GLB or validate registration
against live ion terrain. Upstream browser reports remain labeled upstream data.

Run `npm test`, `npm run lint` and `npm run build`, plus backend pytest with the
NAIF kernels installed. The API tests cover independent catalogue availability,
no invented point heights, the actual row count and missing local raster files.

Desktop/mobile browser checks confirmed the real Apollo 11 regional readout,
explicit missing-point-height notice and no horizontal overflow at phone width.
The original website layout is retained. Local Draco files are served directly
under `/draco/`, rather than buried under a copied `node_modules` tree.
Both Ares variants were confirmed rendering after this deployment-path correction.
SLS uses the original printable geometry with its base; no visual features are
invented. The trip destination and review resolve saved coordinates independently
of marker coordinate updates. Final checks: 76 backend tests, 9 frontend tests,
47 real-Cesium alignment controls, ESLint and the complete production build pass.
