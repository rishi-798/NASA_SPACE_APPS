import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWideDust, settledDustHeight, wideGravel } from '../frontend/src/components/landing/wideSurface.ts';

const terrain = { halfSizeM: 2000, heightAt: (x, n) => x * .03 - n * .02 };

test('wide dust covers the supported area with world-space UVs and bounded presentation relief', () => {
  const geometry = buildWideDust(terrain, 2, 0, 0, 2000, 64);
  const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  assert.equal(positions.count, 65 * 65);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), n = -positions.getZ(i);
    const offset = positions.getY(i) - 2 * terrain.heightAt(x, n);
    assert.ok(offset >= .01799 && offset <= .06201);
    assert.ok(Math.abs(uv.getX(i) - x / 24) < .00001);
    assert.ok(Math.abs(uv.getY(i) - n / 24) < .00001);
  }
  assert.equal(terrain.heightAt(500, 100), 13);
  geometry.dispose();
});

test('moving the detail centre covers new ground and does not fill missing terrain', () => {
  const patch = { ...terrain, heightAt: (x, n) => x > 800 ? NaN : terrain.heightAt(x, n) };
  const geometry = buildWideDust(patch, 1, 750, 100, 256, 64);
  const positions = geometry.getAttribute('position');
  for (const index of geometry.index.array) {
    assert.ok(positions.getX(index) <= 800);
    assert.ok(Number.isFinite(positions.getY(index)));
  }
  assert.ok(geometry.boundingSphere.center.x > 500);
  geometry.dispose();
});

test('dust is deterministic and broad gravel extends well beyond the original tiny patch', () => {
  assert.equal(settledDustHeight(27, -11), settledDustHeight(27, -11));
  const layer = wideGravel(terrain, 1, 300, 100);
  const array = layer.group.children[0].instanceMatrix.array;
  let distant = 0;
  for (let i = 0; i < layer.group.children[0].count; i++) if (Math.hypot(array[i * 16 + 12], array[i * 16 + 14]) > 1000) distant++;
  assert.ok(distant > 1000);
  layer.dispose();
});
