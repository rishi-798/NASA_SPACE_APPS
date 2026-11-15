import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisRangeQuery, checkRange, defaultRange, rangeTicks, sameRange, sampleCountFor } from '../frontend/src/lib/analysisRange.ts';
import { validateComparisonRange } from '../frontend/src/lib/comparison.ts';

const input = (o = {}) => ({ startDate: '2026-10-03', startTime: '18:00', endDate: '2026-10-04', endTime: '18:00', stepMinutes: '30', ...o });

test('valid UTC range gives an ISO range and the exact sample count the backend will produce', () => {
  const c = checkRange(input());
  assert.equal(c.ok, true);
  assert.deepEqual(c.range, { start: '2026-10-03T18:00:00.000Z', end: '2026-10-04T18:00:00.000Z', stepMinutes: 30 });
  assert.equal(c.sampleCount, 49);
  assert.equal(checkRange(input({ endTime: '18:20' })).sampleCount, 49);   // partial final step is not sampled
  assert.equal(sampleCountFor(0, 3600000, 30), 3);
});

test('invalid dates, order, interval and oversize requests fail visibly with messages', () => {
  assert.match(checkRange(input({ startDate: '' })).errors[0], /valid UTC start/);
  assert.match(checkRange(input({ endTime: '' })).errors.join(' '), /valid UTC end/);
  assert.match(checkRange(input({ endDate: '2026-10-03', endTime: '18:00' })).errors[0], /after the start/);
  for (const bad of ['0', '1441', '-5', '2.5', 'abc', '']) {
    assert.match(checkRange(input({ stepMinutes: bad })).errors[0], /Sampling interval/, bad);
  }
  const big = checkRange(input({ endDate: '2026-12-31', stepMinutes: '1' }));
  assert.equal(big.ok, false);
  assert.match(big.errors[0], /limit is 2,000/);
  assert.equal(checkRange(input({ endDate: '2026-10-05', stepMinutes: '1' })).ok, false);  // 2881 samples
  assert.equal(checkRange(input({ endDate: '2026-10-04', stepMinutes: '1' })).ok, true);   // 1441 samples
});

test('query carries the exact range; default range is 24 h at 30 min', () => {
  const q = analysisRangeQuery('athena-im2', null, checkRange(input()).range);
  assert.equal(q.get('start'), '2026-10-03T18:00:00.000Z');
  assert.equal(q.get('end'), '2026-10-04T18:00:00.000Z');
  assert.equal(q.get('step_minutes'), '30');
  assert.equal(q.get('site_id'), 'athena-im2');
  assert.deepEqual(defaultRange('2026-10-12T18:00:00Z'), { start: '2026-10-12T18:00:00.000Z', end: '2026-10-13T18:00:00.000Z', stepMinutes: 30 });
  assert.equal(analysisRangeQuery('x', { latitude: -83, longitude: 2 }, defaultRange('2026-10-12T18:00:00Z')).get('lat'), '-83');
});

test('comparison must cover exactly the requested interval', () => {
  const range = checkRange(input()).range;
  const ok = { schema_version: 1, shared_sample_times: true, sites: [], table: [], request: { start: range.start, end: range.end, step_minutes: 30, sample_count: 49 } };
  assert.equal(validateComparisonRange(ok, range), ok);
  assert.throws(() => validateComparisonRange({ ...ok, request: { ...ok.request, end: '2026-10-04T12:00:00Z' } }, range), /requested interval/);
  assert.throws(() => validateComparisonRange({ ...ok, request: { ...ok.request, step_minutes: 60 } }, range), /requested interval/);
  assert.throws(() => validateComparisonRange({ ...ok, shared_sample_times: false }, range), /same sample times/);
  assert.equal(sameRange(range, { ...range }), true);
  assert.equal(sameRange(range, { ...range, stepMinutes: 10 }), false);
});

test('axis ticks adapt to the range length', () => {
  assert.equal(rangeTicks('2026-10-03T18:00:00Z', '2026-10-04T18:00:00Z')[0], '18:00');
  const long = rangeTicks('2026-10-03T00:00:00Z', '2026-10-17T00:00:00Z');
  assert.ok(long.length <= 8 && long[0].startsWith('10-03'));
  assert.deepEqual(rangeTicks('2026-10-04T00:00:00Z', '2026-10-03T00:00:00Z'), []);
});
