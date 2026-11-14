# Lunar terrain data setup

## Current local integration

The October 11 handoff's CSV, source manifest and generated catalogue index are
installed in `data/lunar/`. This is the default runtime location; override it with
`LUNAR_DATASET_DIR`. `/api/terrain/catalogue` is available for regional summaries
without the rasters. Detailed Blender surfaces and exact point heights are not
available. See `docs/dataset-integration-20261011.md` for local versus upstream
availability and the imported alignment contract.

## Catalogue and index

The catalogue CSV contains 379,987 summary rows: 379,726 global parent grids, 256 legacy Site04 cells, and five historical mission scene regions. It stores summaries, boundaries, and provenance; it does not contain the underlying elevation pixels. The CSV has 57 columns; see [`metadata/moon-catalogue-schema.json`](metadata/moon-catalogue-schema.json).

Keep the CSV and generated SQLite index outside Git. Extract `site04_1km_grid.csv` to a local data directory, set `LUNAR_DATASET_DIR` to that directory, then build the index:

```powershell
$env:LUNAR_DATASET_DIR = 'D:\moon-data'
python scripts/build_moon_index.py
```

The builder checks the CSV row count against the versioned catalogue counts and checks the resulting SQLite database. The generated `moon-grid-index.sqlite` is local data and must not be committed.

The source registry and native-summary verification report are handoff metadata. Their download/verification claims describe the complete local dataset on its owner's computer, not files included with this repository.

## Exact point-height sampling

The handoff ZIP does not contain `moon-dataset.json` or the original raster files. Obtain the manifest and its referenced raster files from the dataset owner, or download them from the source URLs recorded in that manifest to the specified relative paths. Verify the manifest checksums before sampling. The catalogue index alone cannot provide point heights. Until those files are available, `/api/terrain/lookup` returns HTTP 503 for point-height sampling.

## API

Install dependencies with `pip install -r requirements.txt`, set `LUNAR_DATASET_DIR`, and run `uvicorn backend.app:app`. The router provides:

- `GET /api/terrain/grids/{grid_id}` for catalogue metadata and computed global child-grid bounds.
- `GET /api/terrain/lookup?lat={latitude}&lon={longitude}` for grid identity and a source-backed point height when the scientific manifest and raster are available.

Coordinates use planetocentric latitude and east-positive longitude. Scientific elevations preserve source provenance and are not modified by visual quality settings.
