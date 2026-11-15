import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeError, utcRange, sampleAt } from '../src/lib/playback.ts';
test('UTC remains UTC across a daylight-saving change', () => {
  assert.deepEqual(utcRange('2026-11-01T00:00', '2026-11-02T00:00', 30), {start:'2026-11-01T00:00:00.000Z', end:'2026-11-02T00:00:00.000Z', stepMinutes:30});
});
test('reject missing, reversed and too large ranges', () => {
  assert.ok(rangeError('', '', 30));
  assert.ok(rangeError('2026-10-12T00:00', '2026-10-12T00:00', 30));
  assert.ok(rangeError('2026-10-12T00:00', '2026-11-12T00:00', 5));
  assert.equal(rangeError('2026-10-12T00:00', '2026-10-13T00:00', 30), null);
});
test('playback preserves backend visibility even when positive elevation is terrain-blocked', () => {
  // Synthetic test fixture, never served to users.
  const sun = {azimuth:120, elevation:2, terrain_horizon:3, visible:false};
  const sample = {time:'2026-10-12T03:30:00Z', sun, earth:{azimuth:40,elevation:6,visible:true}};
  const result = {site:{id:'athena-im2',latitude:-84.79,longitude:29.2},samples:[sample]};
  const active = sampleAt(result, 0);
  assert.equal(active.time, sample.time);
  assert.equal(active.sun, sun);
  assert.equal(active.sun.visible, false);
  assert.equal(sampleAt(result, 1), null);
  assert.equal(sampleAt(null, 0), null);
});
