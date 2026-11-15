import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settledDustHeight, wideGravel } from '../frontend/src/components/landing/wideSurface.ts';

const terrain = { halfSizeM: 2000, heightAt: (x, n) => x * .03 - n * .02 };

test('dust is deterministic and broad gravel extends well beyond the original tiny patch', () => {
  assert.equal(settledDustHeight(27, -11), settledDustHeight(27, -11));
  const layer = wideGravel(terrain, 1, 300, 100);
  const array = layer.group.children[0].instanceMatrix.array;
  let distant = 0;
  for (let i = 0; i < layer.group.children[0].count; i++) if (Math.hypot(array[i * 16 + 12], array[i * 16 + 14]) > 1000) distant++;
  assert.ok(distant > 1000);
  layer.dispose();
});
