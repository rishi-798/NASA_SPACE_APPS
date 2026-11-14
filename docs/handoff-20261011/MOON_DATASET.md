# Moon terrain dataset and scene identities

The dataset covers the entire Moon. It contains original elevation rasters, a CSV catalogue, a SQLite index, source metadata and the Blender scene registry. The CSV is a grid catalogue, not a replacement for full-resolution raster pixels.

## What is included

- 379,726 global parent grids, about 10 km across.
- Each parent has 100 addressable children, about 1 km across. Child IDs are calculated on demand; 37,972,600 child rows are not stored in the CSV.
- The original 256 Site04 cells A1–P16 retain their original values and aliases. Their unambiguous IDs are `SITE04-A1` through `SITE04-P16`.
- Five existing historical scenes use IDs such as `MISSION-APOLLO-11`.
- The CSV has 379,987 data rows. The existing filename `site04_1km_grid.csv` is retained, but its contents now cover the Moon.

Global parent IDs look like `MOON-R0273-C0546`. A child looks like `MOON-R0273-C0546-r3-c7`. Rows run north to south. Columns run west to east, with fewer columns near the poles. These grids index locations; they do not imply a particular elevation resolution. Grid dimensions are approximate, especially near the poles.

## Elevation sources

`moon-dataset.json` lists exact paths, source URLs, original units, product versions and download availability. The full-Moon fallback is NASA's 64-pixels-per-degree LOLA map, about 474 m between latitude samples. Global CSV summaries come from that complete fallback and explicitly identify their source.

The `native_elevation_*` fields separately summarize original SLDEM and polar source pixels in each global parent. `native_statistics_source_ids` identifies every contributing tile, including seam crossings. These global-tier summaries retain native sampling, while the Site04 and mission rows preserve finer local information. Keeping the two tiers separate allows source comparison without averaging measurements or disguising a resolution change.

Higher-resolution original products are retained alongside it: SLDEM2015 at 512 pixels/degree between 60°S and 60°N, LOLA polar grids at 60 m, the 5 m adjusted Site04 DEM and the 2–5 m mission DTMs. Lookup uses the finest downloaded valid source for the point. A missing or nodata pixel falls back to the next source. All 42 manifest files are downloaded and have recorded SHA-256 checksums. `moon-dataset-complete.json` confirms completion; `Moon dataset verification.json` records the coverage, preserved original fields, source checks and shared Blender identities.

The NASA Moon Kit elevation map is a reformatted LOLA product. “NASA DEM”, “raw DEM” and “LOLA” are not three independent measurements to average. Combining means putting the products under one documented coordinate and source-selection contract. Original heights are retained; grids never upsample data to claim more accuracy.

Moon Kit colour is a visual layer. Decorative rocks, dust, bump shading and illustrative lights never enter elevation calculations. Sampling distance is not vertical accuracy. The Site04 RMS and shot-count rasters remain available. Polar products and SLDEM use different gravity-field processing; transitions require overlap validation before any blending.

## Backend setup

Keep large downloaded files outside Git. Copy the dataset directory to the backend machine, or place the native files at the relative paths described by the manifest. Install the existing backend requirements and `terrain/requirements.txt`. Set `LUNAR_DATASET_DIR` to the directory containing `moon-dataset.json`, then run the existing FastAPI app:

```powershell
$env:LUNAR_DATASET_DIR = 'D:\MoonData'
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

`GET /api/terrain/lookup?lat=-89.8&lon=-155` returns the point, shared grid ID, global parent and child, elevation, original source pixel, spacing, reference radius and scene availability. `GET /api/terrain/grids/{grid_id}` returns metadata. An unavailable dataset returns HTTP 503; an unknown grid returns 404. Global child responses clearly identify any statistics as **parent** statistics, not child measurements.

Coordinates are planetocentric latitude and east-positive longitude in degrees, using lunar ME/DE421 and a reference sphere of radius 1,737,400 m. Heights are returned in metres above that sphere. Use lunar source CRS definitions, not Earth EPSG:4326. Longitude +180 and -180 identify the same meridian. Pole longitude is normalized to zero.

Example:

```python
from terrain.catalogue import lookup
selection = lookup(latitude, longitude)
grid_id = selection['grid_id']
height_m = selection['terrain']['elevation_m']
```

## Frontend and Blender contract

1. Cesium returns lunar latitude/longitude for the selected point.
2. `resolveLunarGrid` requests the backend lookup. The UI can copy that response as a scene selection.
3. Preserve `grid_id`, exact selected latitude/longitude, terrain source and original reference radius in the local-scene request. A grid center is not a replacement for the selected point.
4. In `Moon Model.blend`, existing decorative terrain objects have the same canonical name and `grid_id` custom property. Friendly scene names remain unchanged. `blender-grid-registry.json` records the mapping for all 261 existing terrain regions.
5. New global local scenes must use their returned child ID as object identity and export name. No global scene is claimed built simply because its CSV row exists.

Blender is the asset authoring tool; the website must load exported glTF/GLB in a browser renderer. The data grid and IDs are implemented here. Global local-scene generation, browser exports and date/time Sun/Earth lighting remain separate integration work. Existing preview lighting is illustrative. Terrain blocking for horizons and timelines must use scientific elevations, excluding cosmetic objects.

The local development viewer proxies `/api` to port 8000. For a deployed frontend, set `VITE_API_BASE_URL` or provide a same-origin API reverse proxy. Do not commit dataset files or production credentials.
