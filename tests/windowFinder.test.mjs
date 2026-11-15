import test from 'node:test';
import assert from 'node:assert/strict';
import { findWindows, formatMinutes, parseMinDuration } from '../frontend/src/lib/windowFinder.ts';
import { toAnalysisResult } from '../frontend/src/lib/analysisWindow.ts';

const T0 = Date.parse('2026-10-03T00:00:00Z'), STEP = 30;
const iso = (i) => new Date(T0 + i * STEP * 60000).toISOString();
/** flags: string of S/E/B/- per sample: Sun only, Earth only, both, neither. */
function make(flags, both) {
  const samples = [...flags].map((f, i) => ({ time: iso(i),
    sun: { azimuth: 0, elevation: 1, visible: f === 'S' || f === 'B' }, earth: { azimuth: 0, elevation: 1, visible: f === 'E' || f === 'B' } }));
  const pct = (k) => Math.round(100 * samples.filter((s) => s[k].visible).length / samples.length);
  const summary = { start: iso(0), end: iso(samples.length - 1), step_minutes: STEP,
    sunlight_percent: pct('sun'), earth_visible_percent: pct('earth'), both_available_percent: 0,
    windows: { sunlight: [], earth_visible: [], both } };
  return toAnalysisResult({ schema_version: 1, request: {}, site: { id: 'x', name: 'x', latitude: 0, longitude: 0 },
    samples, summary, horizon: null, terrain: null }, iso(0));
}
const win = (a, b, extra = {}) => ({ start: iso(a), end: iso(b), duration_minutes: (b - a) * STEP, ...extra });

test('returns every window meeting the minimum, with start index for jumping playback', () => {
  const res = make('--BBBB-BB-BBBBB-', [win(2, 6), win(7, 9), win(10, 15)]);
  const s = findWindows(res, 90);
  assert.deepEqual(s.windows.map((w) => [w.startIndex, w.durationMinutes]), [[2, 120], [10, 150]]);
  assert.equal(s.qualifying, 2); assert.equal(s.total, 3); assert.equal(s.reason, null);
  assert.equal(res.samples[s.windows[0].startIndex].time, s.windows[0].start);   // jump target IS the window start sample
});

test('boundaries name what changed, from the returned samples only', () => {
  const res = make('SSBBBE--', [win(2, 5)]);
  const w = findWindows(res, 30).windows[0];
  assert.equal(w.begins, 'Earth becomes visible');
  assert.equal(w.ends, 'Sun no longer visible');
  assert.equal(w.clippedAtStart, false);
});

test('windows cut by the range edge are labelled, not presented as complete', () => {
  const res = make('BBBB--BB', [win(0, 4, { starts_at_range_start: true }), win(6, 7, { ends_at_range_end: true })]);
  const s = findWindows(res, 30);
  assert.equal(s.windows[0].clippedAtStart, true); assert.equal(s.windows[0].begins, null);
  assert.equal(s.windows[1].clippedAtEnd, true); assert.equal(s.windows[1].ends, null);
});

test('no match explains why, using only returned results', () => {
  assert.match(findWindows(make('SS--', []), 30).reason, /Earth is not visible/);
  assert.match(findWindows(make('EE--', []), 30).reason, /Sun is not visible/);
  assert.match(findWindows(make('----', []), 30).reason, /Neither/);
  assert.match(findWindows(make('SE-S', []), 30).reason, /never together/);
  const short = findWindows(make('-B--', [win(1, 2)]), 120);
  assert.equal(short.windows.length, 0);
  assert.match(short.reason, /longest joint window is 30 min, shorter than the 2 h required/);
});

test('duration input parsing and formatting', () => {
  assert.equal(parseMinDuration('1', '30'), 90);
  assert.equal(parseMinDuration('', '45'), 45);
  for (const [h, m] of [['0', '0'], ['-1', '0'], ['1.5', '0'], ['x', '0']]) assert.equal(parseMinDuration(h, m), null);
  assert.equal(formatMinutes(150), '2 h 30 min'); assert.equal(formatMinutes(45), '45 min'); assert.equal(formatMinutes(120), '2 h');
});
