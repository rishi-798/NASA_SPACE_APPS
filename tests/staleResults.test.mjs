import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestGate } from '../frontend/src/lib/requestGate.ts';
import { pointElevation, horizonModel } from '../frontend/src/lib/terrainFacts.ts';

test('only the newest request may apply its response', () => {
  const gate = createRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(first.current(), false);
  assert.equal(first.signal.aborted, true);
  assert.equal(second.current(), true);
});

test('changing inputs invalidates the in-flight request', () => {
  const gate = createRequestGate();
  const t = gate.begin();
  gate.invalidate();
  assert.equal(t.current(), false);
  assert.equal(t.signal.aborted, true);
  assert.equal(gate.begin().current(), true);   // a fresh request afterwards still works
});

test('a late response from a replaced request is discarded (simulated race)', async () => {
  const gate = createRequestGate();
  let shown = null;
  const run = (label, ms) => { const t = gate.begin(); return new Promise((res) => setTimeout(() => { if (t.current()) shown = label; res(); }, ms)); };
  await Promise.all([run('old-slow', 30), run('new-fast', 5)]);
  assert.equal(shown, 'new-fast');
});

const ready = (value, extra = {}) => ({ status: 'ready', data: { point_elevation_m: value, point_elevation_note: null,
  point_terrain: value === null ? null : { source_id: 'LOLA', source_url: '', sampling: 'nearest', coordinate_frame: 'ME', sample_spacing_x_m: 20, sample_spacing_y_m: 20, vertical_reference_radius_m: 1737400 }, ...extra } });

test('one catalogue result gives one elevation statement with source, datum and resolution', () => {
  const p = pointElevation(ready(2594.2));
  assert.equal(p.state, 'available'); assert.equal(p.text, '2,594.2 m');
  assert.match(p.datum, /1,737,400 m/); assert.match(p.resolution, /20 m/); assert.equal(p.source, 'LOLA');
});

test('unavailable and error states are explicit and carry the reason; never a stale hardcoded message', () => {
  const none = pointElevation(ready(null, { point_elevation_note: 'No local tile here' }));
  assert.deepEqual([none.state, none.reason], ['unavailable', 'No local tile here']);
  const err = pointElevation({ status: 'error', message: 'Moon grid index has not been built' });
  assert.deepEqual([err.state, err.reason], ['unavailable', 'Moon grid index has not been built']);
  assert.equal(pointElevation({ status: 'loading' }).state, 'loading');
});

test('horizon model reflects the backend terrain status and is kept distinct from point elevation', () => {
  assert.equal(horizonModel(null, null).label, 'NOT ANALYSED');
  const terrain = { mode: 'terrain_profile', status: 'profile_loaded', terrain_obstruction_assessed: true, message: 'm',
    profile_metadata: { source: 'u', site_elevation_m: 5319.5, pixel_resolution_m: 80, max_distance_m: 40000, observer_height_m: 2 } };
  const m = horizonModel(terrain, null);
  assert.equal(m.label, 'TERRAIN-AWARE'); assert.equal(m.demHeight, '5,319.5 m'); assert.equal(m.resolution, '80 m per pixel');
  assert.match(m.limits, /40 km/);
  assert.equal(horizonModel({ ...terrain, mode: 'flat_horizon' }, null).label, 'FLAT HORIZON');
  assert.equal(horizonModel({ ...terrain, mode: 'flat_horizon_degraded' }, null).label, 'DEGRADED');
  assert.match(horizonModel({ ...terrain, mode: 'flat_horizon', profile_metadata: null }, null).limits, /not assessed/);
});
