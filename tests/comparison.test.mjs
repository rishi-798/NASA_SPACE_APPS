import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonQuery, formatDuration, unequalConfidence, validateComparison, failedSites } from '../frontend/src/lib/comparison.ts';

const row = (id, mode) => ({ site_id: id, horizon_mode: mode });
const ok = (over = {}) => ({ schema_version: 1, shared_sample_times: true, table: [], sites: [],
  request: { start: '2026-10-12T18:00:00Z', end: '2026-10-13T18:00:00Z', step_minutes: 30, sample_count: 49 }, ...over });

test('comparison uses the same 24 h window from the selected time as the analysis', () => {
  const q = comparisonQuery('2026-10-12T18:00:00Z');
  assert.equal(q.get('start'), '2026-10-12T18:00:00.000Z');
  assert.equal(q.get('end'), '2026-10-13T18:00:00.000Z');
  assert.equal(q.get('step_minutes'), '30');
});

test('only complete comparisons on one shared grid starting at the selected time are shown', () => {
  assert.doesNotThrow(() => validateComparison(ok(), '2026-10-12T18:00:00Z'));
  assert.throws(() => validateComparison(ok({ schema_version: 2 }), '2026-10-12T18:00:00Z'), /incomplete/);
  assert.throws(() => validateComparison(ok({ table: undefined }), '2026-10-12T18:00:00Z'), /incomplete/);
  assert.throws(() => validateComparison(ok({ shared_sample_times: false }), '2026-10-12T18:00:00Z'), /same sample times/);
  assert.throws(() => validateComparison(ok(), '2026-10-12T00:00:00Z'), /did not start/);
});

test('mixed or flat horizons are flagged as unequal confidence; all-terrain is not', () => {
  assert.equal(unequalConfidence([row('a', 'terrain_profile'), row('b', 'flat_horizon')]), true);
  assert.equal(unequalConfidence([row('a', 'flat_horizon'), row('b', 'flat_horizon')]), true);
  assert.equal(unequalConfidence([row('a', 'flat_horizon_degraded')]), true);
  assert.equal(unequalConfidence([row('a', 'terrain_profile'), row('b', 'terrain_profile')]), false);
});

test('durations read naturally and failed sites are surfaced, not dropped', () => {
  assert.equal(formatDuration(30), '30 min');
  assert.equal(formatDuration(90), '1.5 h');
  assert.equal(formatDuration(3000), '2.1 d');
  assert.equal(formatDuration(Number.NaN), '--');
  const r = ok({ sites: [{ site_id: 'a', ok: true }, { site_id: 'b', ok: false, error: { code: 'x', message: 'boom' } }] });
  assert.deepEqual(failedSites(r).map((s) => s.site_id), ['b']);
});
