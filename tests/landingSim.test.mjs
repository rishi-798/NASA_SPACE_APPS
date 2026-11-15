/**
 * Landing-simulation physics validation. SYNTHETIC FIXTURES: every terrain here is a synthetic plane or a
 * hand-made grid, and the vehicle is the ILLUSTRATIVE LANDER (demonstration parameters, not a real vehicle).
 *
 * Tolerances: RK4 integrates constant acceleration and linear mass loss exactly, so analytic comparisons are
 * limited by float64 round-off (~1e-15 relative × values up to ~1e4 m over ~1e3 steps) → 1e-8 m / 1e-9 m/s.
 * Event times come from 60-step bisection (≈ dt·2^-60) → 1e-9 s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_INITIAL, DEFAULT_SETTINGS, DEMO_LIMITS, G0, ILLUSTRATIVE_LANDER, MOON_G, appliedThrottle, derivative, evaluate, footClearance, massFlow, step, validateConfig, initialState } from '../frontend/src/sim/physics.ts';
import { syntheticPlane, gridTerrain } from '../frontend/src/sim/terrain.ts';
import { assistedInput } from '../frontend/src/sim/autopilot.ts';
import { createSim, recordedInputs, runHeadless, stepsFor } from '../frontend/src/sim/runner.ts';

const V = ILLUSTRATIVE_LANDER, S = DEFAULT_SETTINGS, L = DEMO_LIMITS;
const flat = syntheticPlane(0);
const off = () => ({ throttle: 0, tiltEastDeg: 0, tiltNorthDeg: 0 });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

test('unpowered free fall matches the constant-gravity analytic solution', () => {
  const init = { eastM: 0, northM: 0, altitudeM: 2000, velocity: [3, -2, -5] };
  const sim = createSim(V, init, S, flat, L);
  for (let i = 0; i < 1000; i++) sim.advance(off());          // 10 s
  const t = sim.state.t, z0 = 2000;
  near(t, 10, 1e-12, 't');
  near(sim.state.pos[2], z0 - 5 * t - 0.5 * MOON_G * t * t, 1e-8, 'z');
  near(sim.state.pos[0], 3 * t, 1e-9, 'x'); near(sim.state.pos[1], -2 * t, 1e-9, 'y');
  near(sim.state.vel[2], -5 - MOON_G * t, 1e-9, 'vz');
  assert.equal(sim.state.propellantKg, V.propellantKg);       // no thrust → no propellant used
});

test('hover: thrust equal to lunar weight gives zero instantaneous acceleration', () => {
  const m = V.dryMassKg + V.propellantKg;
  const d = derivative([0, 0, 100, 0, 0, 0, m], m * MOON_G, [0, 0, 1], V.ispS, MOON_G);
  near(d[5], 0, 1e-12, 'az'); near(d[3], 0, 0); near(d[4], 0, 0);
  near(d[6], -(m * MOON_G) / (V.ispS * G0), 1e-15, 'mdot uses g0 = 9.80665, not lunar g');
});

test('mass falls exactly as propellant is consumed; mass = dry + remaining propellant', () => {
  const sim = createSim(V, { ...DEFAULT_INITIAL, altitudeM: 2000, velocity: [0, 0, -40] }, S, flat, L);
  for (let i = 0; i < 1000; i++) {
    sim.advance({ throttle: 1, tiltEastDeg: 0, tiltNorthDeg: 0 });
    assert.equal(sim.state.massKg, V.dryMassKg + sim.state.propellantKg);
  }
  near(V.propellantKg - sim.state.propellantKg, massFlow(V.maxThrustN, V.ispS) * 10, 1e-9, 'used');
});

test('engine shuts down exactly at fuel exhaustion and the lander keeps falling', () => {
  const v = { ...V, propellantKg: 10 };
  const sim = createSim(v, { eastM: 0, northM: 0, altitudeM: 2900, velocity: [0, 0, 0] }, S, flat, L);
  const tb = 10 / massFlow(v.maxThrustN, v.ispS);
  while (!sim.events.some((e) => e.kind === 'fuel_exhausted')) sim.advance({ throttle: 1, tiltEastDeg: 0, tiltNorthDeg: 0 });
  near(sim.events.find((e) => e.kind === 'fuel_exhausted').t, tb, 1e-9, 'exhaustion time');
  assert.equal(sim.state.propellantKg, 0); assert.equal(sim.state.massKg, v.dryMassKg);
  const before = sim.state;
  sim.advance({ throttle: 1, tiltEastDeg: 0, tiltNorthDeg: 0 });   // command ignored: no propellant
  assert.equal(sim.state.thrustN, 0); assert.equal(sim.state.throttle, 0);
  near(sim.state.vel[2] - before.vel[2], -MOON_G * S.dtS, 1e-12, 'pure gravity after shutdown');
  assert.notEqual(sim.state.pos[2], before.pos[2]);                 // not frozen in mid-air
  assert.equal(evaluate(null, sim.events, L).kind, 'no_touchdown'); // exhaustion alone is not an outcome
});

test('ideal rocket equation (test configuration: zero gravity, axial thrust, no contact)', () => {
  const settings = { ...S, gravity: 0, maxAltitudeM: 1e12, maxDurationS: 1e4 };
  const sim = createSim(V, { eastM: 0, northM: 0, altitudeM: 10, velocity: [0, 0, 0] }, settings, flat, L);
  while (sim.state.propellantKg > 0) sim.advance({ throttle: 1, tiltEastDeg: 0, tiltNorthDeg: 0 });
  const dv = V.ispS * G0 * Math.log((V.dryMassKg + V.propellantKg) / V.dryMassKg);
  near(sim.state.vel[2], dv, dv * 1e-9, 'Δv');
});

test('contact velocities match the analytic drop, without surface penetration', () => {
  const h = 50, v0 = -3, vx = 2;
  const sim = runHeadless(V, { eastM: 0, northM: 0, altitudeM: h, velocity: [vx, 0, v0] }, S, flat, L, off);
  const c = sim.contact;
  near(c.verticalSpeed, Math.sqrt(v0 * v0 + 2 * MOON_G * h), 1e-9, 'vertical');
  near(c.horizontalSpeed, vx, 1e-12, 'horizontal');
  near(c.t, (v0 + Math.sqrt(v0 * v0 + 2 * MOON_G * h)) / MOON_G, 1e-9, 'contact time');
  near(footClearance(...c.pos, V.padRadiusM, flat), 0, 1e-9, 'clearance at contact');
  const rec = sim.record(1, 't', 'manual');
  assert.ok(rec.samples.every((s) => s.altitudeM >= -1e-9), 'no sample below the surface');
});

test('sloped terrain: the uphill pad touches first, slope is reported and checked', () => {
  const slope = syntheticPlane(10, 90);                         // downhill toward east
  const sim = runHeadless(V, { eastM: 0, northM: 0, altitudeM: 30, velocity: [0, 0, -1] }, S, slope, L, off);
  const c = sim.contact;
  near(c.pos[2], slope.heightAt(c.pos[0] - V.padRadiusM, c.pos[1]), 1e-9, 'west (uphill) pad on the surface');
  assert.ok(c.pos[2] > slope.heightAt(c.pos[0] + V.padRadiusM, c.pos[1]), 'east pad still above');
  near(c.slope.deg, 10, 1e-12);
  assert.equal(evaluate(c, sim.events, { ...L, maxSlopeDeg: 5, impactVerticalSpeed: 99, impactTotalSpeed: 99 }).checks[2].met, false);
});

test('flat terrain reports 0° slope; real-grid slope comes from a 3×3 plane fit', () => {
  const n = 11, s = 80, half = 400;
  const g = 0.1;                                                // 5.71° plane rising toward north
  const heights = Array.from({ length: n }, (_, r) => Array.from({ length: n }, () => g * (-half + r * s)));
  const t = gridTerrain({ target: {}, half_size_m: half, spacing_m: s, count: n, heights_m: heights, missing_cells: 0, source: 'SYNTHETIC GRID', datum: 'test', limitations: [] }, 'SYNTHETIC GRID');
  const est = t.slopeAt(13, -27);
  near(est.deg, Math.atan(g) * 180 / Math.PI, 1e-9); assert.equal(est.scaleM, 160);
  near(t.heightAt(40, 40), g * 40, 1e-9, 'bilinear');
  assert.equal(syntheticPlane(0).slopeAt(5, 5).deg, 0);
});

test('missing terrain: start refused, flying into a gap ends the run, slope unavailable near gaps', () => {
  const n = 11, s = 80, half = 400;
  const heights = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (c >= 8 ? null : 0)));
  const t = gridTerrain({ target: {}, half_size_m: half, spacing_m: s, count: n, heights_m: heights, missing_cells: 33, source: 'SYNTHETIC GRID', datum: 'test', limitations: [] }, 'SYNTHETIC GRID');
  assert.match(validateConfig(V, { eastM: 300, northM: 0, altitudeM: 50, velocity: [0, 0, 0] }, S, t).join(' '), /No terrain data under the start/);
  const sim = runHeadless(V, { eastM: 0, northM: 0, altitudeM: 200, velocity: [30, 0, 0] }, S, t, L, () => ({ throttle: 0.4, tiltEastDeg: 0, tiltNorthDeg: 0 }));
  assert.ok(sim.events.some((e) => e.kind === 'terrain_missing'));
  assert.equal(evaluate(sim.contact, sim.events, L).kind, 'terrain_unavailable');
  assert.equal(t.slopeAt(160, 0), null);                       // 3×3 neighbourhood touches a gap
});

test('invalid configurations are rejected with explanations', () => {
  const errs = validateConfig({ ...V, dryMassKg: -1, ispS: 0, minThrottle: 1.2, maxTiltDeg: 80 }, { ...DEFAULT_INITIAL, altitudeM: 0 }, { ...S, dtS: 0.5 }, flat);
  for (const re of [/Dry mass/, /Specific impulse/, /Minimum throttle/, /Maximum tilt/, /Timestep must be 0.1/, /Initial altitude/]) assert.match(errs.join(' '), re);
  assert.match(validateConfig(V, DEFAULT_INITIAL, S, null).join(' '), /No terrain/);
  assert.deepEqual(validateConfig(V, DEFAULT_INITIAL, S, flat), []);
});

test('throttle is bounded and respects the minimum non-zero setting and empty tanks', () => {
  assert.deepEqual([-1, 0, 0.05, 0.5, 2].map((c) => appliedThrottle(c, V, 10)), [0, 0, 0.1, 0.5, 1]);
  assert.equal(appliedThrottle(1, V, 0), 0);
});

test('insufficient thrust is reported as an event', () => {
  const weak = { ...V, maxThrustN: 1500 };                      // 1500 N < 1150 kg × 1.62
  const sim = createSim(weak, DEFAULT_INITIAL, S, flat, L);
  sim.advance({ throttle: 1, tiltEastDeg: 0, tiltNorthDeg: 0 });
  assert.ok(sim.events.some((e) => e.kind === 'insufficient_thrust'));
});

// Scripted pilot used by the timing tests: depends only on the step number (like recorded inputs).
const script = (s) => s.step < 300 ? { throttle: 0.9, tiltEastDeg: -12, tiltNorthDeg: 4 } : s.step < 1500 ? { throttle: 0.3, tiltEastDeg: 3, tiltNorthDeg: 0 } : { throttle: 0.38, tiltEastDeg: 0, tiltNorthDeg: 0 };

test('identical results at different rendering frame rates and playback speeds', () => {
  const runAt = (frameS, speed, jitter = 0) => {
    const sim = createSim(V, DEFAULT_INITIAL, S, flat, L);
    let acc = 0, seed = 7, frames = 0;
    while (!sim.ended && frames < 1e6) {
      seed = (seed * 16807) % 2147483647;
      const r = stepsFor(acc, frameS * (1 + jitter * (seed / 2147483647 - 0.5)), speed, S.dtS);
      acc = r.accumulatorS; frames++;
      for (let i = 0; i < r.steps && !sim.ended; i++) sim.advance(script(sim.state));
    }
    return sim.record(1, 'x', 'manual');
  };
  const a = runAt(1 / 30, 1), b = runAt(1 / 144, 1), c = runAt(1 / 60, 4), d = runAt(1 / 60, 1, 0.9);
  for (const other of [b, c, d]) { assert.deepEqual(other.final, a.final); assert.deepEqual(other.contact, a.contact); }
  assert.ok(a.contact, 'scripted run reaches the ground');
});

test('deterministic replay: re-simulating recorded inputs reproduces the trajectory exactly', () => {
  const first = runHeadless(V, DEFAULT_INITIAL, S, flat, L, (s) => assistedInput(s, V, S.gravity)).record(1, 'a', 'assisted');
  const again = runHeadless(V, DEFAULT_INITIAL, S, flat, L, recordedInputs(first.inputs)).record(2, 'b', 'recorded-inputs');
  assert.deepEqual(again.samples, first.samples);
  assert.deepEqual(again.contact, first.contact);
});

test('timestep convergence of the touchdown state', () => {
  const at = (dt) => runHeadless(V, DEFAULT_INITIAL, { ...S, dtS: dt }, flat, L, (s) => script({ step: s.t < 3 - 1e-9 ? 0 : s.t < 15 - 1e-9 ? 300 : 1500 })).contact;
  const ref = at(0.000625);
  const errs = [0.04, 0.02, 0.01, 0.005].map((dt) => { const c = at(dt); return Math.abs(c.t - ref.t) + Math.abs(c.verticalSpeed - ref.verticalSpeed); });
  console.log('  convergence |Δt_contact|+|Δv_vertical| vs dt=0.000625:', errs.map((e) => e.toExponential(2)).join(', '));
  for (let i = 1; i < errs.length; i++) assert.ok(errs[i] < errs[i - 1] * 0.75, `error should shrink: ${errs}`);
  assert.ok(errs[2] < 0.05, 'dt = 0.01 s within 0.05 (s + m/s) of the reference');
});

test('assisted descent lands within demonstration limits; with too little fuel it does not', () => {
  const ok = runHeadless(V, DEFAULT_INITIAL, S, flat, L, (s) => assistedInput(s, V, S.gravity)).record(1, 'ok', 'assisted');
  assert.equal(ok.outcome.kind, 'within_limits', ok.outcome.explanation);
  assert.ok(Math.hypot(ok.contact.pos[0], ok.contact.pos[1]) < 50, 'lands in the 50 m target area');
  const run = (kg) => { const v = { ...V, propellantKg: kg }; return runHeadless(v, DEFAULT_INITIAL, S, flat, L, (s) => assistedInput(s, v, S.gravity)).record(2, String(kg), 'assisted'); };
  const bad = run(30), worse = run(25);
  assert.ok(bad.events.some((e) => e.kind === 'fuel_exhausted'));
  assert.equal(bad.outcome.kind, 'exceeds_limits', bad.outcome.explanation);   // fuel ran out just before contact
  assert.equal(bad.outcome.checks[0].met, false);
  assert.equal(worse.outcome.kind, 'impact');
  console.log('  demo: 150 kg →', ok.outcome.kind, ok.contact.verticalSpeed.toFixed(2), 'm/s; 30 kg →', bad.outcome.kind, bad.contact.verticalSpeed.toFixed(2), 'm/s; 25 kg →', worse.outcome.kind, worse.contact.verticalSpeed.toFixed(2), 'm/s');
});

// ------------------------------------------------------------------ mesh terrain (team Blender export)
import { meshTerrain } from '../frontend/src/sim/terrain.ts';
import { readFileSync } from 'node:fs';

function planeMesh(gx, gy, h0 = 100, n = 41, span = 6000) {      // SYNTHETIC triangulated plane z = h0 + gx·x + gy·y
  const e = [], no = [], u = [], tri = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x = -span / 2 + (c * span) / (n - 1), y = -span / 2 + (r * span) / (n - 1);
    e.push(x); no.push(y); u.push(h0 + gx * x + gy * y);
  }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const a = r * n + c; tri.push(a, a + 1, a + n, a + 1, a + n + 1, a + n); }
  return meshTerrain(e, no, u, tri, { siteName: 'SYNTHETIC MESH', source: 'test', sourceSpacingM: 60 });
}

test('mesh terrain: exact on a triangulated plane, z relative to the target, slope at the 120 m stencil', () => {
  const t = planeMesh(0.05, -0.02);
  assert.equal(t.kind, 'blender');
  near(t.targetDatumHeightM, 100, 1e-9);
  near(t.heightAt(0, 0), 0, 1e-9);
  near(t.heightAt(731.3, -412.9), 0.05 * 731.3 - 0.02 * -412.9, 1e-9);
  const s = t.slopeAt(250, 250);
  near(s.deg, Math.atan(Math.hypot(0.05, 0.02)) * 180 / Math.PI, 1e-9); assert.equal(s.scaleM, 120);
  assert.ok(Number.isNaN(t.heightAt(5000, 0)), 'outside the mesh: missing, not filled');
  assert.equal(t.missingCells, 0);
});

test('mesh terrain: contact lands exactly on the triangle surface', () => {
  const t = planeMesh(0.1, 0);
  const sim = runHeadless(V, { eastM: 0, northM: 0, altitudeM: 25, velocity: [0, 0, -2] }, S, t, L, off);
  near(sim.contact.pos[2], t.heightAt(sim.contact.pos[0] + V.padRadiusM, sim.contact.pos[1]), 1e-9, 'uphill (east) pad on the mesh');
  near(sim.contact.slope.deg, Math.atan(0.1) * 180 / Math.PI, 1e-9);
});

test('team Blender Athena model: centre height matches LOLA, full coverage of the simulation square', () => {
  const b = readFileSync(new URL('../frontend/public/terrain/REGION-ATHENA.glb', import.meta.url));
  const jsonLen = b.readUInt32LE(12), js = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  const prim = js.meshes[0].primitives[0], pa = js.accessors[prim.attributes.POSITION], pv = js.bufferViews[pa.bufferView];
  const pos = new Float32Array(b.buffer.slice(b.byteOffset + binStart + (pv.byteOffset ?? 0) + (pa.byteOffset ?? 0), b.byteOffset + binStart + (pv.byteOffset ?? 0) + (pa.byteOffset ?? 0) + pa.count * 12));
  const ia = js.accessors[prim.indices], iv = js.bufferViews[ia.bufferView];
  const Arr = ia.componentType === 5125 ? Uint32Array : Uint16Array;
  const idx = new Arr(b.buffer.slice(b.byteOffset + binStart + (iv.byteOffset ?? 0) + (ia.byteOffset ?? 0), b.byteOffset + binStart + (iv.byteOffset ?? 0) + (ia.byteOffset ?? 0) + ia.count * Arr.BYTES_PER_ELEMENT));
  const e = [], n = [], u = [];
  for (let i = 0; i < pa.count; i++) { e.push(pos[i * 3]); u.push(pos[i * 3 + 1]); n.push(-pos[i * 3 + 2]); }
  const t = meshTerrain(e, n, u, idx, { siteName: 'Athena', source: 'REGION-ATHENA.glb', sourceSpacingM: 60 });
  near(t.targetDatumHeightM, 5320.8, 1.0, 'vs LOLA 80 m bilinear at the target');   // independent DEM products: ≤ 1 m
  assert.equal(t.missingCells, 0);
  assert.ok(t.slopeAt(0, 0).deg < 15);
});

// ------------------------------------------------------------------ team terrain registry (all 16 scenes)
import { TERRAIN_SCENES, sceneForLanding, rawToEnu, supportedHalfSizeM, groundDistanceM, ANCHOR_MATCH_M } from '../frontend/src/sim/terrainScenes.ts';

test('registry: 16 scenes, each rotation matrix equals the exact east/north/up at its anchor', () => {
  assert.equal(TERRAIN_SCENES.length, 16);
  const R = 1737400;
  for (const s of TERRAIN_SCENES) {
    assert.ok(s.local_to_moon_fixed, s.id);
    const la = s.anchor.latitude * Math.PI / 180, lo = s.anchor.longitude * Math.PI / 180;
    const e = [-Math.sin(lo), Math.cos(lo), 0], n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)], u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    const m = s.local_to_moon_fixed;
    [e, n, u].forEach((vec, col) => vec.forEach((v, row) => near(m[row][col], v, 2e-3, `${s.id} column ${col}`)));
    // Every scene's frame origin is at the reference sphere, except G7 (a 5 m grid export): its origin sits at the DEM
    // height of the anchor (R + 1,699.87 m) and its mesh heights are relative to that. The simulator always works
    // relative to the surface under the target, so both conventions give the same z.
    near(Math.hypot(m[0][3], m[1][3], m[2][3]), R + (s.id === 'SITE04-G7' ? 1699.87 : 0), 0.01, `${s.id} anchor radius`);
    assert.ok(['Y', 'Z'].includes(s.gltf_up), s.id);
    assert.match(s.sha256, /^[0-9a-f]{64}$/);
  }
});

test('scene matching: each team landing point maps to its own scene, other points to none', () => {
  for (const s of TERRAIN_SCENES) assert.equal(sceneForLanding(s.anchor.latitude, s.anchor.longitude).id, s.id);
  assert.equal(sceneForLanding(0.67416, 23.47314).id, 'REGION-APOLLO-11');
  assert.equal(sceneForLanding(-84.79, 29.2).site_id, 'athena-im2');
  assert.equal(sceneForLanding(0.67416 + 0.01, 23.47314), null);                       // ~300 m away: not "at" the site
  assert.equal(sceneForLanding(-45, 10), null);
  near(groundDistanceM(0, 0, 0, 1), 1737400 * Math.PI / 180, 1e-6, 'one degree of arc');
  assert.ok(ANCHOR_MATCH_M < 200);
});

test('axis conversion for both glTF layouts', () => {
  assert.deepEqual(rawToEnu('Y', 10, 5000, -30), [10, 30, 5000]);   // x east, y up, z −north
  assert.deepEqual(rawToEnu('Z', 10, 30, 5000), [10, 30, 5000]);    // x east, y north, z up
});

test('supported area shrinks to what a mesh covers (G7 is ~1.3 km wide), never above 2 km', () => {
  assert.equal(supportedHalfSizeM(-9990, 9990, -9990, 9990), 2000);
  assert.equal(supportedHalfSizeM(-659, 659, -659, 659), 590);       // 0.9 × 659 = 593 → 590
  assert.equal(supportedHalfSizeM(-100, 400, -300, 300), 90);        // limited by the nearest edge
});
