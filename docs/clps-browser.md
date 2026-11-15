# CLPS browser: integration and demonstration

## Run on macOS / Linux

From the project folder (quote its name if it contains spaces), with Python 3.11+
and Node 24+ installed:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m backend.download_kernels
cd frontend
npm ci
npm run build
cd ..
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/explorer. The frontend and API share this server.
For hot reload use `npm run dev` in `frontend` while the API runs. Rebuild after
frontend changes when using port 8000. Restart the API after backend changes.
See the main README for Windows instructions. Cesium Moon terrain requires an
internet connection and access to ion asset 2684829. For your own ion account,
set `VITE_CESIUM_ION_ACCESS_TOKEN` in `frontend/.env.local` and rebuild. Preserve
Cesium/NASA/USGS credits. No new 3D model or scientific algorithm was introduced.

## 90-second demonstration

1. Open Explorer. In “Explore landing sites”, choose **Athena · IM-2**.
   The existing camera flies to Athena; dragging/scrolling can interrupt it.
2. Review **Start / UTC = 2026-10-12 00:00**, **End / UTC = 2026-10-13 00:00**,
   **Calculation step = 30 minutes**. Nothing calculates until **Analyze conditions**.
3. Analyze. The selected site and the Athena/Odysseus comparison load together.
   Athena is marked LOLA terrain; Odysseus is marked flat horizon.
4. Press **Play**. The shared timestamp, Sun/Earth angles, visibility indicators,
   horizon markers, timeline cursor and Cesium clock/Sun lighting advance together.
   Pause, drag the time slider, or use its arrow keys. Playback stops at the final
   sample; Replay restarts. Changing inputs cancels playback and clears old results.
5. Inspect sunlight, Earth-visible and both-visible windows; expand their UTC
   boundaries. Read longest dark and Earth-hidden durations. Compare the two sites
   over exactly the same interval without treating different horizon models as an
   equal-confidence ranking.
6. Expand **Calculation assumptions & sources** for kernel filenames, frame,
   observer heights, sampling rule and terrain provenance. Explain that visibility
   alone does not establish power, communications, or landing safety.
7. Optionally click another lunar point, review the inputs and Analyze. That point
   gets explicit flat-horizon results; comparison remains Athena and Odysseus only.

## Output/UI contract

`GET /api/analysis?site_id=athena-im2&start=<ISO UTC>&end=<ISO UTC>&step_minutes=30`
or supply `lat` and `lon` instead of `site_id`.

Version 1 response:

- `schema_version: 1`
- `site`: ID (null for custom point), coordinates, name and original coordinate source.
- `samples`: ordered `{time, sun, earth}` records. Each body has azimuth/elevation in
  degrees and authoritative `visible`; terrain records retain `flat_visible` and
  `terrain_horizon`. The UI never infers visibility from elevation.
- `summary`: the unchanged `summarize_window` output, including duration-weighted
  percentages, longest gaps and interval lists.
- `horizon`: the existing profile JSON, or null explicitly indicating missing terrain.
- `provenance`: engine, kernels, frame, coordinate convention, geometry, visibility
  rule, horizon mode, sampling, limitations, sources and `sample_values: false`.

The endpoint calls existing `calculate_visibility_window`, `apply_horizon` and
`summarize_window` on one sample set. It does not replace them. Existing endpoints
remain available. HTTP 422 = invalid request, 404 = unknown site, 503 = unavailable
kernels/profile, 502 = SPICE error. There is no illustrative-data fallback.

The UI freezes one successful bundle and selects an integer sample index. The
same sample supplies all current values and Cesium's UTC clock. Transforming the
returned Sun azimuth/elevation into a Cesium light direction is a rendering step,
not a second ephemeris calculation. No camera movement is triggered by playback.
Terrain shading is illustrative: the visual tileset is not the calculation DEM.

All range inputs are interpreted as UTC, independent of the browser timezone.
End must exceed start; the existing cap is 2,000 samples. Sample spacing is chosen
before analysis, not changed by playback speed. A nonaligned end may be after the
last sample; its final state holds to the range end in the backend summary. Playback
shows only actual sample times. Comparison failures are shown per site. Changing
parameters aborts requests and discards late results. Empty/invalid bundles fail
visibly. The guide's hypothetical values are never used as project results.

## Verification

```sh
.venv/bin/python -m pytest -q
cd frontend
node --test tests/playback.test.mjs
npm run lint
npm run build
```

The new API contract tests compare each bundle against the existing window and
summary endpoints, cover both horizon modes, partial end steps, invalid inputs and
missing kernels. Frontend tests cover UTC across a DST boundary, range validation,
and preserving backend terrain-blocked visibility during playback.

## Existing science limitations

The core geometry uses target centers, geometric SPICE positions and an observer
at height zero on the reference ellipsoid. Athena's separate saved terrain horizon
uses a 2 m observer, 80 m/pixel LOLA DEM, 0.5° azimuth bins, and terrain from 160 m
to 40 km. DEM DE421 vs runtime DE440 frames and rounded landing coordinates retain
the existing uncertainty. Odysseus and arbitrary points have no terrain profile.
Flat and terrain modes should not be ranked as equivalent. Joint windows mean both
visibility flags are true, with no engineering thresholds. Sampling may miss brief
windows; boundaries are not refined between samples. Sources and fuller method
notes: `docs/api.md`, `backend/terrain/README.md`, `backend/kernels/README.md`.

### Local acceptance run

- 61 backend tests passed, including the new bundle/legacy-route equivalence checks.
- 3 frontend playback tests passed; lint and production build passed.
- Browser walkthrough verified Athena selection, UTC date edits, Analyze, synchronized
  sample stepping and scrubbing, play/pause, and automatic stop at the final sample.
- Comparison displayed real results for both sites; terrain and flat modes were visible.
- Checked the narrow layout with no page overflow and no browser console errors.

The preview currently uses Cesium's existing default evaluation token. Supply your
own permitted ion token for deployment; the app shows a visible error if tiles
cannot load. The backend calculations do not depend on that token.
