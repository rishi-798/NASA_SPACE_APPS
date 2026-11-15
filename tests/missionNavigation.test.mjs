import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { missionExplorerUrl, explorerDestination, missionRangeInput } from '../frontend/src/lib/missionNavigation.ts';
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url)));
const sites = JSON.parse(readFileSync(new URL('../data/landing_sites.json', import.meta.url)));
const ids = sites.map(s => s.id);
test('Surface mission links preserve the intended destination', () => {
  for (const m of missions.filter(m => m.missionType === 'surface' && m.status !== 'Cancelled')) {
    const url = missionExplorerUrl(m); assert.ok(url, m.id);
    const selected = explorerDestination(new URL(url, 'https://example.test').searchParams, ids);
    if (m.siteId) assert.equal(selected.siteId, m.siteId);
    else { assert.equal(selected.location.latitude, m.latitude); assert.equal(selected.location.longitude, m.longitude); assert.equal(selected.location.name, m.name); }
  }
});
test('Every manifest entry has an epoch and clearly labeled exploration context', () => {
  for (const m of missions) {
    const params = new URL(missionExplorerUrl(m), 'https://example.test').searchParams;
    assert.equal(params.get('time'), m.explorationEpoch);
    assert.ok(params.get('context'));
    assert.ok(explorerDestination(params, ids).time);
    if (m.missionType !== 'surface') assert.match(m.explorationNote, /context|illustrative/i);
  }
});
test('Mission navigation restores the landing epoch and normalizes timezone offsets', () => {
  assert.equal(explorerDestination(new URLSearchParams('lat=0&lon=0&time=2025-03-02T07:30:00%2B02:00'), ids).time, '2025-03-02T05:30:00.000Z');
  for (const time of ['nonsense', '2025-03-02T07:30:00', '2025-99-02T00:00:00Z'])
    assert.equal(explorerDestination(new URLSearchParams({lat:'0',lon:'0',time}), ids).time, undefined);
});
test('Invalid coordinates are rejected; zero coordinates are preserved', () => {
  for (const q of ['lat=&lon=1','lat=91&lon=0','lat=0&lon=181','lat=NaN&lon=2','lat=0x10&lon=0','site=missing']) assert.deepEqual(explorerDestination(new URLSearchParams(q), ids), {siteId:null,location:null});
  assert.equal(explorerDestination(new URLSearchParams('lat=0&lon=0'), ids).location.latitude, 0);
  assert.equal(missionExplorerUrl({...missions[0], siteId:null, latitude:NaN,longitude:0}), null);
});
test('Records have provenance and non-surface missions have no dummy coordinates', () => {
  for (const m of missions) {
    assert.match(m.lastVerified, /^\d{4}-\d{2}-\d{2}$/); assert.ok(m.sources.includes(m.source));
    if (m.missionType !== 'surface') { assert.equal(m.latitude, undefined); assert.equal(m.longitude, undefined); }
  }
});

test('Mission epoch initializes the newer editable analysis range across midnight', () => {
  const fallback = {startDate:'2026-10-03', startTime:'18:00', endDate:'2026-10-04', endTime:'18:00', stepMinutes:'30'};
  assert.deepEqual(missionRangeInput('2024-02-29T23:30:00Z', fallback), {...fallback, startDate:'2024-02-29', startTime:'23:30', endDate:'2024-03-01', endTime:'23:30'});
  assert.deepEqual(missionRangeInput(undefined, fallback), fallback);
});
