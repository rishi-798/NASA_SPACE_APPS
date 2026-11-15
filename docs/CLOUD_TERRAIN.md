# Terrain streaming deployment

The terrain rasters are hosted on Hugging Face. This repository contains the
streaming code and pinned release settings; running the website does not require
the owner's computer or a local 55GB download.
Lossless DEFLATE COGs preserve every native elevation pixel, mask, unit and lunar datum.
Full-resolution scientific reads use no downsampled overviews. Cosmetic Blender assets remain separate.

Hugging Face dataset: https://huggingface.co/datasets/Deejee-2-406/brahmos-lunar-terrain-cogs
Public storage remains subject to Hugging Face's best-effort policy; there is no lifetime guarantee.

The backend uses `LUNAR_COG_BASE_URL` pointing to a dataset `resolve/<commit>` prefix.
Pin a verified commit rather than relying on changing `main` in production.
Only the manifest is fetched during build. Individual COG blocks and small catalogue shards
are fetched on demand. The full SQLite index is not required by the cloud service.
Use one backend worker, bounded GDAL caches and one compression thread.

`data/cloud-release.json` pins the published 41-source release. `terrain/streaming.py`
reads native raster windows and grid shards; `scripts/prepare_cloud_runtime.py`
installs the small manifest during a Render build.

Render uses `render.yaml`, Free plan only, no persistent disk and no payment method.
Its filesystem/cache is temporary and the service sleeps when idle. NAIF kernels are downloaded
during the build; neither terrain nor broad GitHub credentials are downloaded to the runtime.
The existing Sun/Earth implementation stays in SPICE, not replaced by approximate Earth-centric tools.
Existing horizon profiles retain their existing coverage limitations; streaming point heights alone
does not implement arbitrary-location horizon raycasting or Blender scene placement.

Completion checks: verify all 41 COG sources and quality files; manifest coverage; public range
responses; remote/local sample parity at equator, polar, dateline and landing sites;
API/grid identity; science endpoints; UI; Render restart; zero paid resources.

## Existing live service

- Website/backend: https://brahmos-lunar-browser.onrender.com
- Dataset: https://huggingface.co/datasets/Deejee-2-406/brahmos-lunar-terrain-cogs
- Render currently deploys from `Deejee585/nasa-space-apps-cloud`, branch `main`.
  This NASA-APP copy provides the same terrain connection. Copying the code does
  not change which repository the existing Render service watches.
- `render.yaml` includes the public dataset URL and pinned release file. No
  Hugging Face upload token is needed to read this public dataset.
- To check a coordinate, use `/api/terrain/catalogue?lat=0&lon=0`.
  Point elevation and regional statistics are returned separately.

## Local presentation setup (PowerShell)

Run these commands from the repository root in a Python environment with the backend dependencies and SPICE kernels installed. The small manifest is downloaded once; elevation windows and catalogue shards are read from the pinned public dataset when needed.

```powershell
$env:LUNAR_COG_RELEASE_FILE = 'data/cloud-release.json'
$env:LUNAR_DATASET_DIR = 'data/lunar-cloud'
$env:CORS_ORIGINS = 'http://127.0.0.1:5179'
python -m scripts.prepare_cloud_runtime
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8012
```

In a second terminal, from `frontend`, start the interface against that backend:

```powershell
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8012'
npm run dev -- --host 127.0.0.1 --port 5179
```

Check `/api/ready` and a real `/api/terrain/catalogue?lat=-84.79&lon=29.2` response before a demo. A healthy calculation service does not guarantee that remote terrain, the Cesium token, or every model is available. Without a configured Cesium token the map uses a labeled reference globe.
