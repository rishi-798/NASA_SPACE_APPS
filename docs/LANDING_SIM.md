# Lunar landing simulation (educational prototype)

Open **Landing sim** in the app (`/landing`). This is an educational model of the **final descent** over a small
area. It is **not** a validated six-degree-of-freedom spacecraft simulator, and it does not certify any landing.

Code: `frontend/src/sim/` (physics, terrain, autopilot, runner; no rendering code) · scene `components/landing/` ·
page `pages/LandingSimPage.tsx` · terrain endpoint `backend/terrain/patch.py` (`GET /api/sim/terrain`).

## Supported domain

| | |
|---|---|
| Area | 4 km × 4 km square centred on the target (±2 km). Leaving it ends the run |
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
| **Real terrain:** Athena or Odysseus | LOLA `LDEM_80S_80MPP_ADJ`, NASA GSFC PGDA (local copy, `scripts/fetch_lola_dem.py`) | 80 m (native; bilinear between samples, no added resolution) | least-squares plane through the 3×3 DEM samples around the point: **160 m across** |

- Missing DEM cells are returned as `null`, drawn red, and never filled.
- A start over missing data is refused. Flying over missing data ends the run with "terrain assessment unavailable".
- If the 3×3 slope neighbourhood touches a gap, the slope is "not assessed".
- Real terrain exists only inside the LOLA 80° S map. Elsewhere the endpoint returns an explicit error, and the UI
  offers to switch to the synthetic scenario. It is never substituted silently.
- An 80 m DEM supports **regional** slope only. Boulders and craters smaller than ~200 m (such as Athena's ~20 m
  crater) are not resolved, so a slope that meets the limit is **not** proof of a safe landing area.

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
3. Switch the terrain to **Real terrain: Athena** and run assisted again.
   - **Result:** within limits, with a regional slope of 1.94° over 160 m, plus the "not a landing-hazard
     assessment" note.

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
- The Blender surface scene is not used here; the 3D view is drawn from the DEM grid itself.
