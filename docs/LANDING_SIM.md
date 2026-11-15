# Lunar landing simulation (educational prototype)

It is **step 5, "Landing", of Plan a trip** (Departure → Rocket → Destination → Conditions → **Landing** → Overview). Old `/landing`
links forward to the trip planner. This is an educational model of the **final descent** over a small
area. It is **not** a validated six-degree-of-freedom spacecraft simulator, and it does not certify any landing.

Code: `frontend/src/sim/` (physics, terrain, autopilot, runner; no rendering code) · scene `components/landing/` ·
page component `pages/LandingSimPage.tsx` (embedded in `TripPage`) · terrain endpoint `backend/terrain/patch.py` (`GET /api/sim/terrain`).

## Supported domain

| | |
|---|---|
| Area | up to 4 km × 4 km square centred on the target (±2 km), smaller where a terrain model covers less (G7: 1.18 km). Leaving it ends the run |
| Altitude | up to 3 km above terrain |
| Duration | up to 600 s of simulation time |
| Phase | final descent and touchdown only (no orbit, braking burn or ascent) |

## Coordinate frame

A local east-north-up frame at the target: **x = east, y = north, z = up**, metres, SI units throughout.
- Synthetic scenario: z = 0 is the plane through the target.
- Real terrain: z = 0 is the LOLA surface under the target. Horizontal coordinates are ground distances
  (azimuthal-equidistant, within 1e-6 of a tangent plane over 2 km).
- Heights include lunar curvature: a point at ground distance d is `(R+h)·cos(d/R) − (R+h₀)` above the target's
  horizontal plane. At the patch edge that is about 1.15 m lower than a flat-Moon value.
- DEM heights are relative to the 1,737,400 m sphere. The target's DEM height is reported, and z is relative to it.
- **Altitude reference:** the clearance of the *lowest footpad* above the terrain directly beneath it.
- **Simulation time (T+)** starts at 0 for each run and is unrelated to the Explorer's UTC observation time.
- **Rendering:** sim (x, y, z) maps to three.js (x, z·k, −y). The visual height exaggeration k (1×, 2× or 5×,
  labelled "visual only") scales the lander, trail and terrain together, so contact stays visually aligned.
  The terrain mesh uses exactly the heights the physics samples.

## Physics model

State (one authoritative object): time, position, velocity, remaining propellant, mass, applied throttle, applied
thrust tilt, footpad clearance.

```
m        = m_dry + m_prop
F        = throttle · F_max                       (0 when m_prop = 0)
a        = (F / m) · û(tilt) + (0, 0, −g_moon)
dm/dt    = −F / (Isp · g0)
```
- **g_moon = 1.62 m/s²**, constant, straight down (NASA Moon facts, https://science.nasa.gov/moon/facts/). Over 3 km
  of altitude, real gravity changes by 2h/R ≈ 0.35%, and over ±2 km its direction by ≤ 0.07°; both are neglected.
- **g0 = 9.80665 m/s²** appears only in the mass flow. It is the standard-gravity convention for Isp quoted in seconds
  (exhaust velocity = Isp·g0; NASA GRC, https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/).
  Lunar gravity never enters the mass-flow relation.
- **No drag:** the Moon has no meaningful atmosphere.
- **Throttle** is bounded to 0–1. A non-zero command below the minimum throttle is raised to the minimum. With an
  empty tank the throttle is 0.
- **Simplified attitude:** the thrust direction û follows the commanded tilt (east and north components, capped at
  the maximum tilt) at a limited rate (default 15°/s). There are no rotational dynamics, inertia, RCS or attitude
  errors. The body is drawn tilted to show the thrust direction.
- **Contact geometry:** four rigid footpads (east, west, north and south of the centre line, at the pad radius), held
  level. The run stops at the first pad contact. Nothing after contact is modelled.

**Integration:** fixed timestep dt = 0.01 s, classical RK4, with throttle and tilt held constant over each step.
RK4 is exact for constant acceleration (free fall) and for linear mass loss.

**Events inside a step:**
- *Fuel exhaustion:* the burn time remaining, `m_prop/ṁ`, is computed exactly. The step is split into a powered part
  and an unpowered part, so no thrust ever comes from propellant that doesn't exist. After shutdown the lander keeps
  moving under gravity.
- *Terrain contact:* when a step ends below the surface, 60 bisection iterations on the sub-step length find the
  first contact (to about dt·2⁻⁶⁰). The vehicle never passes through the surface.
- *Other events:* insufficient thrust to hover, thrust-to-weight restored as propellant burns, leaving the area,
  exceeding the altitude limit, missing terrain under the vehicle, the time limit, and ended by user.

**Rendering independence:** each animation frame converts elapsed time × playback speed into a whole number of fixed
steps (`stepsFor`). Frame rate and speed change only how many steps run per frame, never the steps themselves.
**Replay** plays back the recorded states (every 2nd step, 50 Hz); it does not re-simulate. Each finished run is
also re-simulated from its recorded inputs, and the report confirms the trajectory is identical.

## Terrain

| Scenario | Source | Spacing | Slope estimate |
|---|---|---|---|
| **Synthetic training scenario** (flat or tilted plane) | synthetic, labelled in the UI, the report and exported file names | exact plane | the exact configured slope |
| **Real terrain (default): any of the team's 16 measured sites** | The team's Blender models (`data/local-scenes.json` in the team repo): LOLA 60 m (Athena, Odysseus), SLDEM2015 59 m (Apollo 11, 12, 14, 15, 16, 17; Luna 21; Lunokhod 1, 2; Surveyor 1, 5, 6, 7), a 5 m DEM (G7). Each file is checked against its recorded SHA-256 before use | Triangle mesh; contact uses the same triangles that are drawn | Least-squares plane through 3×3 samples of the mesh at its own spacing (**two spacings across**: 120 m, 118 m or 10 m) |
| Real terrain, poleward of 80° S: LOLA 80 m grid | LOLA `LDEM_80S_80MPP_ADJ`, NASA GSFC PGDA (local copy, `scripts/fetch_lola_dem.py`) | 80 m (native; bilinear between samples, no added resolution) | 3×3 DEM samples: **160 m across** |

A landing point uses a measured model when it lies within 150 m of that scene's anchor (the trip's destination
coordinates match the anchors exactly). Other points south of 80° S use the 80 m grid. Everything else gets the
synthetic scenario with a visible notice.

**The 16 scenes** (`frontend/src/data/blenderTerrain.json`): G7 (5 m, 1.3 km square); Athena and Odysseus (local files, 10 km
radius); Apollo 11, 12, 14, 15, 16, 17, Luna 21, Lunokhod 1, 2 and Surveyor 1, 5, 6, 7 (10 km radius). The 13
equatorial and mid-latitude models are 10–14 MB each. They are loaded on demand from the team's pinned GitHub commit
(`raw.githubusercontent.com`, checksum-verified), not stored in this repo, so those sites need a network connection.

**Alignment of the models** (`components/landing/blenderTerrain.ts`, `sim/terrain.ts → meshTerrain`,
`sim/terrainScenes.ts`). `python -m scripts.verify_terrain_models --curvature` re-checks all of it and writes
`docs/validation/terrain_models.json`.
- **Layouts differ.** Athena, Odysseus and G7 are glTF Y-up (x east, y up, z −north). The other 13 are Z-up (x east,
  y north, z up). The loader converts both to east/north/up for the physics and rotates Z-up models for drawing.
- **Frame:** for all 16 scenes, the rotation matrix in the metadata equals the exact east/north/up directions at the
  anchor (error < 1e-16). Anchors are at the reference sphere, except G7, whose frame origin sits at its DEM height
  (R + 1,699.87 m) with heights relative to that. The simulator always works relative to the surface under the target.
- **Curvature is included in every model.** At 8.5 km from each anchor, (mesh height − centre height) minus (the team's
  terrain-lookup elevation − centre elevation) should be −d²/2R = −20.8 m if curvature is included, and 0 if not.
  Measured: −20.8 ±1 m for 11 scenes. The other four differ by exactly the height differences the team recorded
  between its mesh source and the lookup service's source at those sites (Apollo 11 +4.7 m, Apollo 14 +1.2 m, Apollo 15
  +5.0 m, Lunokhod 2 −5.7 m), so curvature is present there too.
- Against the independent LOLA 80 m grid (Athena and Odysseus): the target heights agree to about 0.2 m and 0.9 m, and
  the median difference stays at 0.1–0.6 m out to 2.9 km.
- **Source mismatch (team flag):** at Apollo 11, 14, 15 and Lunokhod 1, 2, the lookup service uses a higher-priority
  local product at the centre (for example the Apollo 11 NAC DTM), which differs from the region mesh's SLDEM tile
  by up to about 6 m. The simulator uses the mesh only, and these scenes say so in their terrain notes.
- **Supported area:** up to 4 km square, but never more than 90% of what a model covers, so G7 supports 1.18 km. The
  page and the events show the actual size.
- **Candidates:** the team marks these as measured previews (`production_ready: false`), and the page repeats that.
- Points without mesh coverage are reported and never filled. Surface texture and colour variation are illustrative
  only.
- Missing DEM cells are returned as `null`, drawn red, and never filled.
- A start over missing data is refused. Flying over missing data ends the run with "terrain assessment unavailable".
- If the 3×3 slope neighbourhood touches a gap, the slope is "not assessed".
- If the Blender model fails to load or fails its checksum, the error is shown with explicit choices: the 80 m grid or
  the synthetic scenario. Nothing is substituted silently.
- Real terrain exists only inside the LOLA 80° S map. Elsewhere the endpoint returns an explicit error, and the UI
  offers to switch to the synthetic scenario. It is never substituted silently.
- An 80 m DEM supports **regional** slope only. Boulders and craters smaller than ~200 m (such as Athena's ~20 m
  crater) are not resolved, so a slope that meets the limit is **not** proof of a safe landing area.

## 3D vehicle model (visual only)

The vehicle is drawn with NASA's Saturn V 3D model (`/saturn-v.glb`, NASA 3D Resources), labelled **"Visual only: Saturn V"**
on the page.
- It is scaled to a display height of 6 m × the "Model size" setting (24 m by default) and stands on the contact plane.
  Small discs mark the four contact points the physics uses.
- **It does not affect the physics.** The mass, thrust, fuel and engine come only from the illustrative lander in
  Preflight. A Saturn V's real mass (about 2.9 million kg) and engines do not describe a lunar descent vehicle.
  There is no rocket picker, so nothing implies the choice changes the result.

## Vehicle and parameters

No verified lander specifications exist in the project. The trip catalogue holds launch rockets, which are not used.
The default vehicle is an **Illustrative lander**, adjustable in the preflight panel:

| Parameter | Default | Unit |
|---|---|---|
| Dry mass | 1000 | kg |
| Propellant | 150 | kg |
| Maximum thrust | 4500 | N |
| Minimum throttle | 0.10 | fraction |
| Specific impulse | 310 | s |
| Maximum tilt / tilt rate | 20 / 15 | ° / °/s |
| Footpad radius | 2 | m |
| Start | 400 m altitude, 300 m west and 120 m north of target, velocity (12, −4, −15) m/s | |

**Touchdown limits** are **demonstration settings**, not from any specific vehicle (all configurable):

| Limit | Default |
|---|---|
| Vertical speed | 2 m/s |
| Horizontal speed | 1 m/s |
| Slope | 10° |
| Impact | above 5 m/s down or 6 m/s total |

**Outcomes:**
- **Within configured simulation limits:** never called "safe".
- **Exceeded configured limits:** lists each limit exceeded.
- **Impact.**
- **Terrain assessment unavailable.**
- **Run ended without touchdown.**

Running out of fuel is an event, not an outcome. Tipping, leg loads and damage are not computed, and the report says so.

**Assisted descent** (optional) is an idealised feedback law:
- It has perfect knowledge of position and velocity.
- Horizontally, the desired velocity toward the target is proportional to distance, capped at 12 m/s.
- Vertically, the desired descent rate shrinks with altitude, from 25 m/s down to 0.8 m/s.
- The resulting thrust vector passes through the same throttle and tilt-rate limits as manual control.
- There is no noise, delay, estimation or guidance optimisation.

## Validation (`tests/landingSim.test.mjs`, `tests/test_sim_terrain.py`)

All fixtures are synthetic planes or hand-made grids with the illustrative lander. **Tolerances:** analytic cases are
held to 1e-8 m and 1e-9 m/s, because RK4 is exact for them and only float64 round-off remains. Event times are held to
1e-9 s, because 60 bisection steps resolve far finer than that.

| Test | Reference | Result |
|---|---|---|
| Unpowered free fall, 10 s | z = z₀ + v₀t − ½gt² | within 1e-8 m |
| Hover force balance | F = m·g gives zero vertical acceleration; ṁ uses g0 | within 1e-12 |
| Mass vs propellant | m = m_dry + m_prop at every step; used = ṁ·t | exact / within 1e-9 kg |
| Fuel exhaustion | shutdown at t = m_prop/ṁ; then a = −g, not frozen | within 1e-9 s |
| Ideal rocket equation | test configuration only: g = 0, axial thrust, no contact. Δv = Isp·g0·ln(m₀/m_f) | relative 1e-9 |
| Contact velocities | v = √(v₀² + 2gh), horizontal unchanged | within 1e-9 m/s |
| No penetration | clearance at contact = 0; no recorded sample below the surface | within 1e-9 m |
| Sloped terrain | uphill pad touches first; slope 10° reported and checked | ✓ |
| Grid slope | 3×3 plane fit recovers a known plane; scale 160 m | within 1e-9° |
| Missing terrain / invalid config | refused start; "terrain assessment unavailable"; explained errors | ✓ |
| Frame-rate independence | 30 fps, 144 fps, 60 fps at 4×, jittered frames | bit-identical final state |
| Deterministic replay | re-simulating the recorded inputs | bit-identical trajectory |
| **Timestep convergence** | touchdown error vs a dt = 0.000625 s reference | see below |

**Convergence evidence** (scripted powered descent with thrust re-pointing; error = |Δt_contact| + |Δv_vertical|):

| dt (s) | 0.04 | 0.02 | 0.01 | 0.005 |
|---|---|---|---|---|
| error | 3.00e-3 | 1.45e-3 | 6.99e-4 | 3.26e-4 |

The error halves when dt halves, which is first order. That is expected: the thrust direction is held constant
within each step while it is being re-pointed. Free-fall and constant-thrust segments are exact (see above). At the
default dt = 0.01 s, the touchdown time and speed are within about 0.0007 of the reference.

## Demonstration

Synthetic flat scenario with the defaults:
1. Choose **Assisted descent** and press **Start** (4× speed is fine; the result is identical).
   - **Result:** "Touchdown within configured simulation limits". T+46.8 s, 4.8 m from the target, 0.80 m/s down,
     0.48 m/s across, 34.1 kg of propellant used.
2. Under **Compare runs**, choose *Propellant (kg)* = **30** and press **Run**.
   - **Result:** "Touchdown exceeded configured limits". The propellant runs out at T+45.8 s, 0.8 s before contact,
     and touchdown is 2.07 m/s down against the 2 m/s limit. With 25 kg the result is an impact at 5.47 m/s.
3. Switch the terrain to **Real terrain: Athena (team Blender model)** and run assisted again.
   - **Result:** within limits, with a regional slope of 1.97° over 120 m, plus the "not a landing-hazard
     assessment" note.
4. Switch to **Odysseus (team Blender model)** and run the same autopilot.
   - **Result:** the ground rises under the approach. Contact comes at T+32 s, 21.5 m from the target, at 2.25 m/s
     across, on an 11.9° regional slope. The report flags those two limits as exceeded: a difference caused by the
     measured terrain.

Use **Replay** to watch any run again, **Export JSON** to save it, and **Manual** to fly it yourself (W/S throttle,
arrow keys tilt, Z full, X cut, C centre tilt, Space start/pause).

## Not modelled (by design, for this version)

- Rotational dynamics and attitude control.
- Leg suspension, bounce, tipping and structural loads.
- Plume–surface interaction and dust.
- Sensor and navigation uncertainty, actuator delay and throttle response time.
- Variable gravity and mascons.
- Terrain finer than 80 m.
- Guidance from orbit.
- Terrain finer than the 60 m mesh (rocks and small craters) is not in the physics. The detail texture is cosmetic.

## Where it sits in the trip

- Step 4, **Conditions**: pick the observation time and analyze the chosen point.
- Step 5, **Landing**: this simulator, opened on the landing point you chose.
  - **Any of the team's 16 sites** (Apollo 11, 12, 14, 15, 16, 17, Athena, Odysseus, Luna 21, Lunokhod 1 and 2,
    Surveyor 1, 5, 6, 7, and G7): that site's measured terrain model. Poleward sites also offer the LOLA 80 m grid.
  - **A custom point south of about 80° S:** the real LOLA 80 m grid at that exact point.
  - **Any other point:** no real terrain exists, so a clear notice appears and the **synthetic training scenario** is
    used. It is labelled, and never silently substituted.
  - The step is optional: **Continue to overview** works at any time, and **Back to conditions** keeps your analysis.
- Step 6, **Overview**: the mission record.
- Simulation time (T+) starts at 0 for each run and is separate from the UTC observation time chosen in step 4.
