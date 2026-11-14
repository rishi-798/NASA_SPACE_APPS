# NASA SPACE APPS: team handoff

## Start here

1. Download and extract `Full Moon Dataset.zip`. It contains the full-Moon grid catalogue, `site04_1km_grid.csv`.
2. Read `MOON_DATASET.md` for the grid IDs, coordinates, data sources and backend setup.
3. Read `CESIUM_MOON.md` for the global Moon asset update (ion asset **2684829**).
4. Read `Terrain integration progress.md` for what is implemented locally and what remains.
5. Use `historical-mission-sites.json` for the five existing historical locations.

## What the CSV contains

379,987 rows: 379,726 global parent grids, the original 256 regional grids and five historical scene regions. Global parents are approximately 10 km wide; approximately 1 km child IDs are computed on demand.

The CSV contains elevation summaries, grid boundaries and source references. It is not a file containing every individual elevation measurement. `moon-catalogue-schema.json` lists its 57 columns. `moon-dataset.json` contains the original product paths, source URLs, coordinate information and checksums. `Moon dataset verification.json` records the checks performed on the complete local dataset.

## Backend code

Extract `Terrain backend handoff.zip` into your dataset working directory. Its `clps-lunar-browser/` paths are intended to match the repository. Review and copy the supplied terrain module, API router, frontend helpers and tests into the team's correct branch; do not replace the whole repository.

The ZIP also contains `build_moon_index.py` and `moon-catalogue-counts.json`. Place these next to the extracted CSV and run:

```text
python build_moon_index.py
```

This builds `moon-grid-index.sqlite` from the CSV. Do not commit the large CSV, index or raster files to GitHub.

Add these lines to the existing FastAPI app, with the second line after the app is created:

```python
from backend.terrain_api import router as terrain_router
app.include_router(terrain_router)
```

Set `LUNAR_DATASET_DIR` to the dataset directory and follow `MOON_DATASET.md` for dependencies and API usage.

## Important: this Drive folder is the catalogue and code handoff

The original elevation rasters, imagery, SQLite index and Blender project are **not uploaded here**. The full scientific dataset is on Dip's computer. The manifest's download status and verification report describe that complete local dataset, not files present in this Drive folder.

To enable exact point-height sampling, obtain the original terrain files from Dip or download the source URLs in the manifest into the exact relative paths it specifies. Verify their checksums. Building the CSV index alone does not provide missing elevation pixels. Until the raster files are available, grid metadata can be used, but accurate point-height lookup is not ready.

## Team tasks

1. Give the required teammates contributor access to the GitHub repository and confirm the frontend branch.
2. Review the existing local Cesium changes and update the global Moon asset to 2684829 using the team's token.
3. Set up the dataset and backend router.
4. Connect coordinate and mission-name search, map selection and grid lookup.
5. Connect date/time controls to the backend Sun/Earth calculations, horizon view and timelines.
6. Test and open a pull request. Nothing from this handoff has been pushed to GitHub.

## What to push to GitHub

Use a new branch and open a pull request against the team's correct frontend/backend branch. Review and integrate the files before committing them.

- Terrain grid identity and source lookup code in `terrain/`, plus its dependency requirements.
- The terrain API router in `backend/terrain_api.py` and its registration in the existing FastAPI app.
- The reviewed frontend update to Cesium ion Moon asset **2684829**, coordinate/mission search and backend grid lookup integration.
- Relevant tests and Markdown setup guides.
- Small JSON metadata files: source manifest, CSV column schema, grid counts, historical landing sites and shared scene/grid identities. Include verification reports when useful, explaining that they describe the complete dataset on Dip's computer.
- The CSV-to-SQLite index builder, adapted to the team's dataset location.

Keep the large CSV, original elevation rasters, generated SQLite index, Blender project and ZIP handoff files outside GitHub. Store large scientific data separately and configure the backend to read it through `LUNAR_DATASET_DIR`. Keep production tokens and credentials out of commits.

**Frontend handoff limitation:** `Terrain backend handoff.zip` includes frontend helpers and backend integration files, but not the complete React/Cesium viewer changes. Those complete changes are in the local `clps-lunar-browser` checkout on Dip's computer, on branch `moon-terrain-integration`. Obtain and review that local diff before implementing the frontend update. Do not assume the Drive ZIP contains the full app update.

Moon Kit colour and decorative detail are visual layers. They must not change scientific terrain calculations or be presented as measured geometry. Grid coverage does not mean every local interactive scene is already built.
