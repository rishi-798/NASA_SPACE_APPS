import test from 'node:test';
import assert from 'node:assert/strict';
import { atEnd, conditionsAt, idlePlayback, indexForTime, playbackReducer as r } from '../frontend/src/lib/playback.ts';
import { toAnalysisResult } from '../frontend/src/lib/analysisWindow.ts';

const body = (az, el, visible) => ({ azimuth: az, elevation: el, visible });
function result(n = 5) {
  const t0 = Date.parse('2026-10-03T18:00:00Z');
  const samples = Array.from({ length: n }, (_, i) => ({ time: new Date(t0 + i * 1800000).toISOString(),
    sun: body(10 * i, i, i % 2 === 0), earth: body(100 + i, 20 - i, i < 3) }));
  const start = samples[0].time, end = samples[n - 1].time;
  return toAnalysisResult({ schema_version: 1, request: { start, end, step_minutes: 30, sample_count: n },
    site: { id: 'athena-im2', name: 'A', latitude: -84.79, longitude: 29.2 }, samples,
    summary: { start, end, step_minutes: 30, windows: { sunlight: [], earth_visible: [], both: [] } },
    horizon: null, terrain: null }, start);
}

test('one selected index drives time, Sun/Earth values and visibility flags together', () => {
  const res = result();
  for (let i = 0; i < 5; i++) {
    const c = conditionsAt(res, i);
    assert.equal(c.time, res.samples[i].time);
    assert.equal(c.sun, res.samples[i].sun);
    assert.equal(c.earth, res.samples[i].earth);
    assert.equal(c.sun.visible, i % 2 === 0);
  }
  assert.equal(conditionsAt(res, 99).time, res.samples[4].time);   // clamped, never a stale/other time
  assert.equal(conditionsAt(res, -3).time, res.samples[0].time);
});

test('scrubbing and stepping pause playback; playing stops at the last sample; replay restarts', () => {
  let s = r(idlePlayback, { type: 'load', count: 4 });
  assert.deepEqual(s, { index: 0, count: 4, playing: false });
  s = r(s, { type: 'play' }); assert.equal(s.playing, true);
  s = r(s, { type: 'tick' }); assert.equal(s.index, 1);
  s = r(s, { type: 'seek', index: 2 }); assert.deepEqual([s.index, s.playing], [2, false]);
  s = r(s, { type: 'play' }); s = r(s, { type: 'step', by: -1 }); assert.deepEqual([s.index, s.playing], [1, false]);
  s = r(s, { type: 'play' }); s = r(s, { type: 'tick' }); s = r(s, { type: 'tick' });
  assert.deepEqual([s.index, s.playing, atEnd(s)], [3, false, true]);   // stopped itself at the end
  assert.equal(r(s, { type: 'tick' }).index, 3);                          // no overrun
  assert.equal(r(s, { type: 'play' }).playing, false);                    // play at the end does nothing; use replay
  const again = r(s, { type: 'toggle' });
  assert.deepEqual([again.index, again.playing], [0, true]);              // toggle at end = Replay
});

test('loading a new or empty result cancels playback and resets to the first sample', () => {
  let s = r(r(idlePlayback, { type: 'load', count: 5 }), { type: 'play' });
  s = r(s, { type: 'tick' });
  const cleared = r(s, { type: 'load', count: 0 });
  assert.deepEqual(cleared, { index: 0, count: 0, playing: false });
  assert.equal(r(cleared, { type: 'play' }).playing, false);
  assert.equal(r(cleared, { type: 'seek', index: 3 }).index, 0);
});

test('indexForTime finds the sample for a window start', () => {
  const res = result();
  assert.equal(indexForTime(res, res.samples[3].time), 3);
  assert.equal(indexForTime(res, '2026-10-03T19:10:00Z'), 2);
  assert.equal(indexForTime(res, '2026-10-03T17:00:00Z'), -1);
});
