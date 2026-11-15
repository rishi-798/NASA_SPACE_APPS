import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {craterOutline, lunarDistanceKm, nearestReferenceCrater} from '../frontend/src/lib/psr.ts';
const data = JSON.parse(readFileSync(new URL('../data/psr_reference_craters.json', import.meta.url)));
test('All six sourced reference footprints remain valid across polar longitude wrapping', () => {
  assert.equal(data.craters.length, 6);
  for (const crater of data.craters) {
    assert.match(crater.source, /^https:\/\/planetarynames.wr.usgs.gov\/Feature\/\d+$/);
    const outline = craterOutline(crater); assert.equal(outline.length, 72);
    for (const point of outline) {
      assert.ok(Math.abs(point.longitude) <= 180 && Math.abs(point.latitude) <= 90);
      assert.ok(Math.abs(lunarDistanceKm(point, crater) - crater.diameterKm / 2) < 1e-6);
    }
    assert.equal(nearestReferenceCrater(crater.latitude, crater.longitude, [crater]).distanceKm, 0);
  }
});
test('Distance uses lunar geometry and does not extrapolate a polar assessment elsewhere', () => {
  assert.ok(lunarDistanceKm({latitude:0,longitude:179}, {latitude:0,longitude:-179}) < 61);
  for (const latitude of [0, -74, -91, NaN]) assert.equal(nearestReferenceCrater(latitude, 0, data.craters), null);
  assert.match(data.note, /NOT mapped PSR boundaries/);
});
