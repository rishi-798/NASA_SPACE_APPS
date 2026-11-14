import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisQuery, analysisWindow, toAnalysisResult, windowFraction, windowTicks } from '../frontend/src/lib/analysisWindow.ts';

const body = (az, el, visible) => ({ azimuth: az, elevation: el, visible });
function bundle(start = '2026-10-12T18:00:00.000Z', overrides = {}) {
  const t0 = Date.parse(start);
  const samples = [0, 1, 2].map((i) => ({ time: new Date(t0 + i * 1800000).toISOString(),
    sun: body(90, 1 + i, true), earth: body(0, 5, i !== 1) }));
  return { schema_version: 1, request: { start, end: samples[2].time, step_minutes: 30, sample_count: 3 },
    site: { id: 'athena-im2', name: 'Athena', latitude: -84.79, longitude: 29.2 }, samples,
    summary: { start, end: samples[2].time, step_minutes: 30, windows: { sunlight: [], earth_visible: [], both: [] } },
    horizon: null, terrain: { mode: 'terrain_profile', status: 'profile_loaded', terrain_obstruction_assessed: true, message: '' },
    ...overrides };
}

test('window starts at the selected time and covers the next 24 hours, not the calendar day', () => {
  assert.deepEqual(analysisWindow('2026-10-12T18:00:00Z'),
    { start: '2026-10-12T18:00:00.000Z', end: '2026-10-13T18:00:00.000Z' });
  assert.deepEqual(analysisWindow('2026-10-12T13:30:00-04:30'),
    { start: '2026-10-12T18:00:00.000Z', end: '2026-10-13T18:00:00.000Z' });
  assert.throws(() => analysisWindow('not a time'), RangeError);
});

test('one request carries the site or coordinates plus the window', () => {
  const site = analysisQuery('athena-im2', null, '2026-10-12T18:00:00Z');
  assert.equal(site.get('site_id'), 'athena-im2');
  assert.equal(site.get('start'), '2026-10-12T18:00:00.000Z');
  assert.equal(site.get('end'), '2026-10-13T18:00:00.000Z');
  assert.equal(site.get('step_minutes'), '30');
  const custom = analysisQuery('custom', { latitude: -83, longitude: 24 }, '2026-10-12T18:00:00Z');
  assert.equal(custom.get('site_id'), null);
  assert.equal(custom.get('lat'), '-83');
  assert.equal(custom.get('lon'), '24');
});

test('conditions are the first sample of the same sample set', () => {
  const b = bundle();
  const result = toAnalysisResult(b, '2026-10-12T18:00:00Z');
  assert.equal(result.conditions.time, b.samples[0].time);
  assert.equal(result.conditions.sun, b.samples[0].sun);
  assert.equal(result.conditions.site, 'athena-im2');
  assert.equal(result.conditions.latitude, -84.79);
  assert.equal(result.samples, b.samples);
  assert.equal(result.summary, b.summary);
  assert.equal(result.terrain.mode, 'terrain_profile');
});

test('incomplete or inconsistent data is rejected, never displayed', () => {
  assert.throws(() => toAnalysisResult(bundle(undefined, { schema_version: 2 }), '2026-10-12T18:00:00Z'), /incomplete/);
  assert.throws(() => toAnalysisResult(bundle(undefined, { samples: [] }), '2026-10-12T18:00:00Z'), /incomplete/);
  const bad = bundle(); bad.samples[1].sun.elevation = Number.NaN;
  assert.throws(() => toAnalysisResult(bad, '2026-10-12T18:00:00Z'), /invalid samples/);
  const unordered = bundle(); unordered.samples.reverse();
  assert.throws(() => toAnalysisResult(unordered, '2026-10-12T18:00:00Z'), /invalid samples/);
  assert.throws(() => toAnalysisResult(bundle(), '2026-10-12T00:00:00Z'), /did not start at the selected time/);
});

test('timeline positions and ticks are relative to the analysed window', () => {
  const start = '2026-10-12T18:00:00Z', end = '2026-10-13T18:00:00Z';
  assert.equal(windowFraction(start, start, end), 0);
  assert.equal(windowFraction('2026-10-13T06:00:00Z', start, end), 0.5);
  assert.equal(windowFraction('2026-10-14T00:00:00Z', start, end), 1);
  assert.deepEqual(windowTicks(start, end), ['18:00', '22:00', '02:00', '06:00', '10:00', '14:00', '18:00']);
});
