# CLPS Lunar Mission Browser: backend

FastAPI backend for investigating lunar locations. It calculates **Sun visibility, Earth visibility, and the
periods when both are visible** for Athena (IM-2), Odysseus (IM-1) or any custom coordinate. It uses NASA/NAIF
**SPICE**, plus a LOLA terrain-horizon profile where one exists.

> **Visibility does not by itself prove adequate power, a working communications link, or a safe landing.**
> The API never returns `safe_to_land` or `mission_viable`. Power, antenna pointing, link budgets,
> ground-station access, slope, roughness, hazards and descent are reported as `"not assessed"`.

This rebuild comes from `itsmetapasvi-glitch/NASA-APP`. It takes `main` (the cloud terrain and the current
frontend contract) and merges in the `rishi-landing-viability` analysis bundle. The existing SPICE calculation,
Athena LOLA profile, summary logic and cloud-terrain reads are **reused, not replaced**. See
[What changed](#what-changed-from-the-reference-repo).

---

## Quick start

Requires Python 3.10 or newer. Run every command from the repository root.

**macOS / Linux**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m backend.download_kernels        # ~45 MB from NAIF, once; writes kernels/manifest.json
python -m scripts.fetch_lola_dem          # optional, recommended: 189 MB LOLA DEM for reliable terrain
uvicorn backend.app:app --reload          # http://127.0.0.1:8000/docs
```

**Windows (PowerShell)**
```powershell
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m backend.download_kernels
python -m scripts.fetch_lola_dem
uvicorn backend.app:app --reload
```

Check that the service is ready, then run the demo and the tests:
```bash
curl http://127.0.0.1:8000/api/ready           # 200 = calculations can run
python -m scripts.demo_compare                 # Athena vs Odysseus, fixed inputs
pytest -q
```

The frontend's Vite dev server proxies `/api` to `127.0.0.1:8000`, so the old frontend works unchanged.

### Reproducible demo (`python -m scripts.demo_compare`)
Fixed range: 2026-10-12 → 2026-10-26 UTC, 30-minute step, 673 samples per site, identical grid for both sites.

| site | horizon | sun % | earth % | both % | longest dark | longest Earth-hidden |
|---|---|---|---|---|---|---|
| IM-1 Odysseus | flat_horizon (terrain **not** assessed) | 59.2 | 100.0 | 59.2 | 137.0 h | 0.0 h |
| IM-2 Athena | terrain_profile (LOLA) | 63.7 | 67.9 | 63.7 | 122.0 h | 108.0 h |

The two rows are **not equal-confidence**: Odysseus ignores terrain, and the API says so in
`comparison_notes`.

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SPICE_KERNELS_DIR` | `backend/kernels` | Folder holding the five kernels and `manifest.json` |
| `CORS_ORIGINS` | localhost:5173/5174 | Comma-separated frontend origins |
| `LOG_LEVEL` | `INFO` | Server log level. Full diagnostics go to the logs, never to responses |
| `LUNAR_DATASET_DIR` | `data/lunar` if present | Cloud/local terrain catalogue directory (unchanged) |
| `LUNAR_COG_BASE_URL` | unset | Hugging Face `resolve/<commit>` URL for streamed terrain COGs (unchanged) |
| `LUNAR_COG_RELEASE_FILE` | unset | Pinned release file, e.g. `data/cloud-release.json` (unchanged) |
| `GDAL_HTTP_TIMEOUT`, `GDAL_CACHEMAX`, … | see `render.yaml` | Bounded remote raster reads (unchanged) |
| `TERRAIN_ON_DEMAND` | `1` | `0` turns off on-demand LOLA horizons for custom points |
| `LOLA_80S_DEM_PATH` | unset | Path to `LDEM_80S_80MPP_ADJ.TIF`. Otherwise the copy from `scripts.fetch_lola_dem` is used if present, else remote windowed reads from PGDA |
| `TERRAIN_READ_ATTEMPTS` | `2` | Attempts for remote DEM reads (local reads are not retried) |
| `TERRAIN_CACHE_DIR` | `backend/terrain/cache` | Generated profiles, about 19 KB each (Git-ignored) |
| `TERRAIN_CACHE_MAX_FILES` | `300` | Cache bound; the oldest profiles are evicted first |
| `TERRAIN_ON_DEMAND_MAX_CONCURRENT` | `2` | Concurrent profile generations |
| `ALLOW_SYNTHETIC_TERRAIN` | unset | **Tests only.** Lets fixture profiles marked `"synthetic": true` load |

There is no database, no accounts, no queues and no paid services.

## Kernel and terrain preparation

- **Kernels:** run `python -m backend.download_kernels`. It installs these files and records their URL, size
  and SHA-256 in `backend/kernels/manifest.json`. At load time each kernel is checked against that hash, and
  `/api/ready` reports any mismatch.

  | File | Role |
  |---|---|
  | `naif0012.tls` | Leap seconds |
  | `de440s.bsp` | DE440 short ephemeris: Sun, Earth, Moon (1849–2150) |
  | `pck00011.tpc` | Moon radii (1737.4 km sphere) |
  | `moon_pa_de440_200625.bpc` | High-accuracy lunar orientation |
  | `moon_de440_220930.tf` | Defines `MOON_ME` as `MOON_ME_DE440_ME421` (from NAIF's CLPS PDS4 archive) |

- **Athena horizon profile:** `backend/terrain/profiles/athena-im2.json` is checked in, about 19 KB, with
  720 × 0.5° bins. It comes from PGDA `LDEM_80S_80MPP_ADJ.TIF` (LOLA, 80 m/pixel, DE421 `MOON_ME`), with a 40 km
  radius, 160 m inner exclusion and an assumed 2 m instrument height. To regenerate it, run
  `python -m backend.terrain.preprocess athena-im2`. That reads only a window of the remote GeoTIFF; see
  [backend/terrain/README.md](../backend/terrain/README.md).
- **Cloud terrain** (`/api/terrain/*`, point heights and regional stats): this is unchanged. See
  [docs/CLOUD_TERRAIN.md](CLOUD_TERRAIN.md). Nothing downloads the 55 GB dataset. Without
  configuration, those routes return explicit 503s, and visibility does not depend on them.

---

## API

Interactive OpenAPI docs are at `/docs`, and the raw schema at `/openapi.json`.

Every error body includes `detail`, which the existing frontend reads, plus a structured `error` object:
```json
{"detail": "landing site not found", "error": {"code": "unknown_site", "message": "landing site not found", "details": null}}
```

| HTTP | `error.code` | When |
|---|---|---|
| 422 | `invalid_request` | Bad fields, a timestamp without a timezone, end ≤ start, a bad step, both or neither of site and coordinates, non-finite or out-of-range lat/lon |
| 422 | `too_many_samples` | More than 2,000 samples per location |
| 422 | `outside_kernel_coverage` | A range outside 1849-12-26 to 2150-01-20 |
| 404 | `unknown_site` | Unknown `site_id` |
| 503 | `kernels_unavailable` | Kernels missing, corrupt (SHA-256 mismatch) or unloadable |
| 503 | `terrain_unavailable` | A configured horizon profile is missing, corrupt or refused |
| 503 | `terrain_data_unavailable` | Cloud terrain catalogue or rasters not available (`/api/terrain/*`) |
| 504 | `external_data_timeout` | A remote terrain read timed out |
| 502 | `calculation_failed` | SPICE raised. Only the short SPICE code is returned; details are logged |

### Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health`, `/api/health` | Liveness only |
| GET | `/api/ready` | **Scientific readiness.** Covers kernels, hashes and coverage, plus per-site terrain status and cloud-terrain configuration. Returns 503 when calculations can't run. Makes no network calls |
| GET | `/api/methodology` | Model, assumptions, limitations, viability text and limits |
| GET | `/api/sites` | Site list (unchanged shape, plus new descriptive fields) |
| GET | `/api/sites/{id}` | One site with its `terrain` status (new) |
| GET | `/api/sites/{id}/horizon` | The profile, or `null` when the site has **no** profile. **503 when a configured profile is broken** |
| GET | `/api/analysis` | **Main endpoint.** `site_id` **or** `lat`+`lon`, plus `start`, `end`, `step_minutes`, `allow_flat_fallback`, `terrain_mode` (`auto` or `flat`), `name` |
| POST | `/api/analysis` | The same fields as a JSON body |
| GET/POST | `/api/compare` | Athena and Odysseus on one shared range and grid |
| GET | `/api/sites/{id}/visibility`, `/visibility/window`, `/summary` | Existing routes, preserved |
| GET | `/api/visibility`, `/api/visibility/window`, `/api/summary` | Existing coordinate routes, preserved |
| GET | `/api/terrain/catalogue`, `/identity`, `/lookup`, `/grids/{id}` | Existing cloud terrain routes, preserved |

Defaults: if `start` is omitted it is 00:00 UTC today. If `end` is omitted it is `start + 24 h`.
`step_minutes` defaults to 30 and must be an integer from 1 to 1440. `request.defaults_applied` lists which
defaults were used.

### Example requests
```bash
# Athena, one UTC day, 30-minute samples
curl "http://127.0.0.1:8000/api/analysis?site_id=athena-im2&start=2026-10-12T00:00:00Z&end=2026-10-13T00:00:00Z&step_minutes=30"

# Custom coordinate (east-positive longitude), JSON body
curl -X POST http://127.0.0.1:8000/api/analysis -H "Content-Type: application/json" \
  -d '{"lat": -89.5, "lon": 135, "name": "Near Shackleton", "start": "2026-10-12T00:00:00Z", "end": "2026-10-19T00:00:00Z", "step_minutes": 60}'

# Comparison
curl "http://127.0.0.1:8000/api/compare?start=2026-10-12T00:00:00Z&end=2026-10-26T00:00:00Z&step_minutes=30"

# Explicitly accept a DEGRADED flat result if Athena's profile were broken (default is a 503)
curl "http://127.0.0.1:8000/api/analysis?site_id=athena-im2&allow_flat_fallback=true"
```

### Analysis response (abridged)
```jsonc
{
  "schema_version": 1,                       // unchanged: the rishi frontend checks === 1; all additions are additive
  "request": {"start": "2026-10-12T00:00:00Z", "end": "...Z", "step_minutes": 30, "sample_count": 49, "defaults_applied": []},
  "site": {"id": "athena-im2", "name": "...", "latitude": -84.79, "longitude": 29.2, "kind": "named",
           "source": "...", "coordinate_source": "...", "coordinate_note": "...", "terrain_status": "profile_loaded"},
  "samples": [{
    "time": "2026-10-12T00:00:00Z",
    "sun": {"azimuth": 139.35, "elevation": -2.73, "visible": false,          // visible is AUTHORITATIVE
            "distance_km": 1.49e8, "moon_fixed_position_km": [x, y, z],
            "flat_visible": false, "terrain_horizon": 2.26, "terrain_clearance": -4.99},  // terrain mode only
    "earth": { /* same fields */ },
    "both_visible": false, "status": "neither visible at this sample"
  }],
  "summary": {
    "total_minutes": 1440, "sunlight_percent": 0.0, "earth_visible_percent": 0.0, "both_available_percent": 0.0,
    "longest_darkness_minutes": 1440, "longest_earth_hidden_minutes": 1440,
    "longest_comm_blackout_minutes": 1440,   // legacy alias of longest_earth_hidden_minutes
    "longest_joint_window_minutes": 0,
    "windows": {"sunlight": [], "earth_visible": [], "both": []}   // each {start, end, duration_minutes, starts_at_range_start, ends_at_range_end}
  },
  "horizon": {"azimuth_step": 0.5, "horizon": [720 bins], "source": "...", ...},   // or null
  "terrain": {"mode": "terrain_profile | flat_horizon | flat_horizon_degraded",
              "status": "profile_loaded | no_profile_for_location | configured_profile_missing | configured_profile_invalid",
              "terrain_obstruction_assessed": true, "message": "...", "profile_metadata": {...}},
  "engineering_checks": {"sun_earth_visibility": "assessed (geometry only)", "power_generation": "not assessed",
                         "communications_link": "not assessed", "landing_slope_roughness_hazards": "not assessed", ...},
  "provenance": {"engine", "frame", "coordinates", "observer", "geometry", "angles", "visibility_rule", "clearance",
                 "sampling", "time", "kernels": [...filenames], "kernel_details": {files: [{sha256, source_url, ...}]},
                 "ephemeris_coverage", "horizon_mode": "LOLA terrain", "terrain_source", "site_coordinates",
                 "limitations", "sources", "sample_values": false},
  "assumptions": [...], "limitations": [...], "warnings": [...]
}
```
The compare response contains `request`, `shared_sample_times`, `sites[]`, `table[]` and `comparison_notes[]`.
Each entry in `sites[]` is `{site_id, ok, analysis | null, error | null}`. A failing site is **listed with its
error, never omitted**. An invalid range or missing kernels fail the whole comparison.

---

## Scientific model

These descriptions are read from the code, and `/api/methodology` returns the same text.

- **Engine:** the existing `backend/calculations/sun_earth.py`. It uses SPICE `spkpos` (Moon→Sun/Earth, J2000,
  `abcorr="NONE"`) and `pxform` (MOON_ME↔J2000), subtracts the surface point, and projects the result onto local
  east/north/up. It is checked against **JPL Horizons** (5 cases, under 0.02°) and against **NAIF `azlcpo`** (under
  1e-6°). The frontend does not recompute geometry.
- **Frame:** `MOON_ME`, which `moon_de440_220930.tf` defines as `MOON_ME_DE440_ME421`. Latitude is
  planetocentric. **Longitude is east-positive**, from −180 to 180.
- **Observer:** placed at 0 m on the 1737.4 km reference sphere (`pck00011`). Site elevations are not used in
  the Sun/Earth geometry. Athena's DEM surface is about 5.3 km above the sphere, which shifts the directions by
  under 0.001°. The terrain profile carries its own observer, 2 m above the DEM surface.
- **Geometric, not apparent**, target-centre directions: no light-time or aberration correction, and no
  refraction (the Moon has no atmosphere).
- **Azimuth** is measured clockwise from north, 0–360. **Elevation** is measured from the local horizontal plane.
- **Visibility:** the target **centre** must be above the horizon in use. That is the terrain horizon at its
  azimuth (linear interpolation between 0.5° bins), or 0° on a flat horizon. Disc edges and partial discs are not
  modelled.
- **`terrain_clearance`** = `elevation − terrain_horizon`, in degrees, and appears only in terrain mode.
  `visible` stays authoritative.
- **Sampling:** samples run at `start + k·step`. `end` is included only when it falls on the grid.
  Sample-and-hold: each state holds until the next step or the end, so the final interval can be short. A sample
  exactly at `end` has zero duration. Percentages are duration-weighted and rounded to 0.1; window durations are
  exact. **Crossings are not refined**: boundaries are accurate to one step, and windows shorter than a step can
  be missed.
- **Joint visibility:** both conditions hold in the same sample. It is a *candidate* opportunity, not an
  operating window.
- **Time:** timestamps must include a timezone and are normalised to UTC. `Z`, `+00:00` and offsets that denote
  the same instant give identical results, including across DST changes.

### Terrain honesty
- **Athena:** the real LOLA profile. `terrain.mode = terrain_profile`.
- **Odysseus:** `horizon_profile: null` in `data/landing_sites.json`. It has no profile because it sits at the
  DEM's 80° S coverage edge. Its results are `flat_horizon`, with `terrain_obstruction_assessed: false` and a
  lower-confidence warning.
- **Custom coordinates south of about 81.31° S: terrain-aware on demand.** The backend generates a LOLA horizon
  for the exact point with the same generator that produced Athena's profile. That generator, run against PGDA,
  reproduces Athena's checked-in profile bit for bit. It reads only a window of about ±44 km around the point,
  and the result is `terrain_profile` / `profile_generated`. A new point takes about 1 s with the local DEM copy
  (`scripts.fetch_lola_dem`), or 5–14 s with remote reads; later requests are instant from the disk cache. Use `python -m scripts.warm_terrain -89.5,135 ...` before a demo.
  - The coverage rule is "distance from pole + 40 km ≤ the DEM's 304 km half-width", checked before any read.
    Points outside it are `flat_horizon` / `no_profile_for_location`, with the reason given.
  - If the DEM can't be read, the result is a 503, or a 504 on a timeout. With `allow_flat_fallback=true` it is
    instead an explicit `flat_horizon_degraded` / `on_demand_failed` result. The frontend asks for that fallback
    and shows the warning.
  - `terrain_mode=flat` skips terrain explicitly and reports `not_requested`.
  - Example (2026-10-12 to 26): near Shackleton (89.5° S, 135° E), a flat horizon gives 100% sunlight, while
    the generated LOLA horizon gives **0% Sun and 0% Earth**, with crater walls up to 30°.
- **Custom coordinates north of the coverage limit:** `flat_horizon`.
- **A configured profile that is missing or corrupt** returns **503** by default, including on `/horizon`. With
  `allow_flat_fallback=true` you instead get an explicit `flat_horizon_degraded` result with a DEGRADED warning.
  It never silently falls back to flat.
- Cesium terrain, a sampled point elevation or a regional statistic is not a horizon and is never used for
  visibility.

### Concurrency and caching
- Routes are sync `def`, so FastAPI runs them in its threadpool. All SPICE calls hold `SPICE_LOCK`, an RLock,
  because the kernel pool is process-global. `/health` answered in about 4 ms during a 2,000-sample job.
- A bounded LRU (32 entries) holds finished analyses. Its key covers the site id, lat and lon, the profile file
  fingerprint, terrain status, normalised start/end, step, and a kernel fingerprint. Results are deep-copied on
  return. 2,000 samples take about 0.75 s cold and about 0.05 s from cache.

---

## Validation against real missions

[docs/VALIDATION.md](VALIDATION.md) checks the engine against Odysseus and Athena. Run it with
`python -m scripts.validate_missions`.
- The published Odysseus position lands on LOLA terrain 15 m from its published elevation.
- Both missions' plans fit inside the predicted sunlit periods.
- Both landers lost power while their sites were still sunlit and in view of Earth. Both were on their sides, and
  Athena lay in a ~20 m crater far below the map's resolution. That is the documented case for "visibility is not
  power".

## What changed from the reference repo

| Area | Change | Compatibility |
|---|---|---|
| `GET /api/analysis` | Merged from `rishi-landing-viability`. Adds `request`, `terrain`, `engineering_checks`, `assumptions`, `limitations`, `warnings`, per-sample `both_visible`/`status`, and optional `start`/`end`/`step_minutes` | Additive; `schema_version` stays 1 |
| `POST /api/analysis`, `/api/compare`, `/api/ready`, `/api/methodology`, `/api/sites/{id}`, `/api/health` | New | — |
| Terrain profile loading | `horizon_profile` is set per site in `landing_sites.json`. A **configured but missing/corrupt** file now returns 503 instead of a silent flat result | `null` still means no profile |
| `apply_horizon` | Adds `terrain_clearance` (degrees) in terrain mode | Additive; flat mode is unchanged |
| Summary | Adds `total_minutes`, `longest_earth_hidden_minutes`, `longest_joint_window_minutes`, and per-window `duration_minutes`, `starts_at_range_start`, `ends_at_range_end` | `longest_comm_blackout_minutes` is kept as an alias |
| Errors | `{detail, error: {code, message, details}}`. Local paths and SPICE free text are removed from responses and logged instead. SPICE errors are 502 | `detail` is still a string |
| Kernels | `manifest.json` stores SHA-256 hashes, checked at load. The downloader uses certifi (fixes macOS SSL) | Same five files |
| Step | `/api/analysis` and `/api/compare` cap `step_minutes` at 1440 | Legacy routes are unchanged |
| Athena metadata | Adds LROC's precise position (84.7906° S, 29.1957° E, about 22 m from the rounded profile point) as a note. The coordinates stay −84.79/29.20 because the profile was built for that point | Unchanged |

## Frontend client
Run it: `cd frontend && npm install && npm run build` (the backend serves `frontend/dist`), or `npm run dev` with the
backend on port 8000. Start the backend with `.venv/bin/python -m uvicorn backend.app:app --port 8000`.

Which tree is served: whichever directory uvicorn runs in. The review preview on port 8001 was a temporary copy
(`/tmp/nasa-team-preview-nov14`, no git history). This repository's `frontend/` is the maintained source.

- **One request, one sample set.** Explorer and Trip make one `GET /api/analysis` request per analysis. The
  summary, windows and conditions all come from it. No frontend geometry is computed.
- **Adjustable UTC range.** Start/end date and time, sampling interval 1–1440 min, and a 2,000-sample limit are
  checked before sending (`lib/analysisRange.ts`, mirroring the backend limits, which stay authoritative). A review
  box shows the exact request before Analyze. Invalid input fails visibly and disables Analyze.
- **One authoritative sample** (`lib/playback.ts`). The playback index drives the UTC timestamp, scene lighting time,
  Sun/Earth readings and visibility flags, horizon markers, and timeline cursor. "Requested start" and "active
  sample" are labelled separately. Play/pause, step, a scrub slider (arrow/Home/End/Page keys; Space toggles),
  1×/2×/4× speed. Scrubbing and stepping pause. Playback stops at the last sample and offers Replay. Changing any
  input, site or map point cancels playback, aborts in-flight requests and discards results. The Cesium camera is
  untouched by playback.
- **Timelines** for sunlight, Earth and both-visible, with percentages and longest dark / Earth-hidden periods.
- **Visibility-window finder.** Minimum continuous duration (h/min) over the backend's joint intervals: every match
  with start, end and duration. Selecting one jumps playback to its start sample. Windows cut by the range edge are
  labelled. Boundaries name which body changed, read from the returned samples. With no match it says why. It is
  labelled "windows matching visibility requirements", not power, link or landing safety, and there is no score.
- **Athena vs Odysseus** compares over exactly the analysis range (start, end and step verified). Terrain-aware,
  flat-horizon and degraded results carry badges and a "not equally reliable" caution.
- **Terrain, one result per location** (`useTerrainCatalogue`, `lib/terrainFacts.ts`). Four separate sections: sampled
  point elevation (source, datum, resolution), regional statistics, the LOLA horizon used for visibility, and the
  visual models (Cesium integrated; Blender pending, no substitute). The Trip "Point elevation" row reads the same
  result. The old hardcoded "Unavailable: no raster sampling" is gone. If the catalogue cannot be read, the reason is
  shown with Retry.
- **Paths.** Home and the nav lead with "Analyze a site". The trip planner is an optional path. Missions and
  Timeline show only sourced records (`data/missionEvents.ts`: four dated events for two missions, each linked);
  other fields say "No verified record".

### Mission Control voice guide (optional)
- **Off by default.** Nothing is spoken until the user presses **Enable mission control** (bottom right). Enabling
  is not remembered across reloads, so every session starts silent.
- **Pre-recorded audio, no voice service at runtime.** All 36 lines exist in English, Spanish, French, Hindi and
  Chinese in `frontend/src/data/voiceLines.json`. They are recorded once into `frontend/public/voice/<lang>/` with
  a `manifest.json`, and the app only plays those files (`lib/voicePlayback.ts`). No API key ships with the app,
  nothing expires, and playing lines costs nothing.
  - Record the final set once: `ELEVENLABS_API_KEY=... python -m scripts.generate_voice_lines --engine elevenlabs`
    (optional `ELEVENLABS_VOICE_ID`). This uses the multilingual model, so one voice speaks all five languages. About
    9,000 characters in total; `--dry-run` shows the count first.
  - Free placeholders, already generated: `python -m scripts.generate_voice_lines --engine say` (macOS voices
    Samantha, Paulina, Thomas, Lekha, Tingting). Replace them with the ElevenLabs set before publishing; Apple's
    voice licence is not meant for redistribution.
  - Re-running records only missing or edited lines (each entry stores a hash of the text and voice), so you are
    never billed twice for the same line.
- **Language follows the device** (`navigator.languages`): the first of en/es/fr/hi/zh in the user's preference list,
  else English. The dock has an "Auto" selector to override it (remembered in this browser). Captions use the same
  language. The rest of the UI stays in English.
- **Fallbacks:** if a clip is missing for that language, the browser's built-in voice reads that one line in the same
  language. If there's no voice either, the caption shows with "No recording for this line…".
- One manager (`lib/voiceGuide.ts`) owns all playback: one line at a time, and each new line cancels the previous
  one. Every prompt has a key, so rerenders never repeat it.
- **Prompts** (`PROMPTS` in `lib/explainResult.ts`) follow real events only:
  - trip stages: departure, rocket, destination, observation time, mission record
  - Explorer intro
  - analysis or comparison started, complete or failed, announced from the request handlers when the event happens
  - playback and scrubbing are never narrated
- **Explain this result** (Surface outlook panel, on both pages): pre-recorded sentences chosen from the displayed
  sample only:
  - site and UTC time
  - Sun and Earth, from the backend's `visible` flag, plus `flat_visible` in terrain mode for "above the flat horizon,
    but blocked by the local terrain"
  - terrain mode
  - one limitation, plus the visibility-is-not-power/communications/landing line
  Elevation is never used to decide visibility, and nothing is called safe. The exact UTC time, and a custom site's
  name, can't be pre-recorded: the audio says "at the selected time", and the caption shows the exact time. Clicking it pauses playback. Moving to
  another sample, changing inputs or getting a new result cancels the explanation.
- **Controls:** Replay, Mute (captions continue), Turn off. Captions show exactly the spoken text, and a signal icon
  shows when the guide is speaking. Leaving the page stops speech. With the guide off, Explain still shows the
  explanation as a caption, without speech. Without speech support the dock says "Captions only: voice unavailable"
  and works the same, and a speech error shows "Voice playback failed. Captions continue."
- **Demo:**
  1. Open `/trip` → Enable mission control ("Select your departure location").
  2. Depart → Choose rocket → Review landing point (one short prompt per stage).
  3. Analyze landing ("Calculating…", then "Analysis complete…") → Explain this result.
  4. In `/explorer`: Analyze → scrub to a sample → Explain this result (it names that sample's UTC time) → Mute → Replay → Turn off.
- **Limitations:**
  - The bundled recordings are macOS placeholders until the ElevenLabs set is generated.
  - The translations are mine, not checked by native speakers; review the Hindi and Chinese especially.
  - Spoken explanations do not read out the time (it's in the caption).
  - There is no microphone input or voice commands. That is a later extension.
  - Browser checks played the real clips in headless Chrome and confirmed each one played to the end, but nobody
    listened to them.

## Sources and credits
- SPICE toolkit and kernels: NASA/JPL NAIF, https://naif.jpl.nasa.gov. SpiceyPy (A. Annex et al.).
- LOLA DEM `LDEM_80S_80MPP_ADJ`: NASA GSFC PGDA, https://pgda.gsfc.nasa.gov/products/90.
- Athena position: LROC, *IM-2 Athena Seen Obliquely*, https://lroc.im-ldi.com/images/1408. Odysseus position:
  NASA/LROC, https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/.
- Reference cases: JPL Horizons, https://ssd.jpl.nasa.gov/horizons/.
- Original implementation: the NASA-APP team, on branches `suhas-backend` (SPICE engine), `rishi-landing-viability` and
  `rishi-cesium-moon` (analysis bundle, Moon viewer), and `dip-hemanth-terrain`/`main` (terrain and cloud terrain).

## Tests
`pytest -q` gives **179 passed, 3 skipped**. The skips are the external Moon catalogue (`data/lunar`) and two opt-in
data checks. `RUN_NETWORK_TESTS=1 pytest -k "real_pgda or partial"` regenerates Athena from the LOLA DEM (exact
match required) and checks the Odysseus terrain numbers. They use the local DEM copy when present.
Frontend unit tests: `cd frontend && npm test` gives **55 passed** (time sync and playback, range validation, interval
matching, window finder, stale-request gate, terrain consistency, loading screen timing, voice guide and result
explanations, mission state, comparison). The backend suite covers:
- JPL Horizons and `azlcpo` reference cases
- zenith and nadir checks
- terrain and flat modes, and terrain blocking a positive-elevation Sun
- missing, corrupt and synthetic profiles
- window boundaries, partial final intervals and zero-duration end samples
- real sunrise transitions (Athena over terrain, Odysseus on a flat horizon), checked across samples,
  windows and percentages, plus 1-minute resampling to confirm each crossing lies inside its 30-minute step
- DST and ISO equivalence
- invalid and excessive requests, and missing or corrupt kernels
- comparison grid identity and per-site failure
- cache separation and immutability
- error hygiene

## Remaining gaps
- Terrain horizons exist only inside the LOLA 80° S DEM (south of about 81.31° S). Odysseus (80.13° S) and
  points further north stay flat. A partial-radius horizon near the DEM edge is not attempted.
- On-demand profiles use the 80 m/pixel DEM, a 40 km radius, a 160 m inner exclusion and a 2 m observer.
  Terrain beyond 40 km and features smaller than a pixel are not represented.
- Crossings are not refined, and partial-disc (limb) visibility is not modelled.
- The Athena profile is not regenerated at LROC's precise coordinate. The 22 m difference is below DEM resolution,
  but this has not been verified.
- The cloud-terrain routes are tested only offline. Remote Hugging Face reads were not exercised here.
- The terrain catalogue (point elevation and regional statistics) needs the Moon grid index, which is not installed
  here, so those fields show an explicit "unavailable" with the reason. The LOLA horizon height is shown separately.
- The Cesium scene light uses the Sun direction at lat/lon 0 for the active time (a global directional light), not
  the site's own Sun direction. It is for orientation only.
- Window boundaries are known only to the sampling step. Only Odysseus and Athena have mission records.
- Browser checks were run with headless Chromium (software GL) and a scripted flow, not on real devices or screen readers.
