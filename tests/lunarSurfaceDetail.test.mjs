import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import { buildLunarSurfaceDetail } from '../frontend/src/lib/lunarSurfaceDetail.ts';

test('detail adds bounded geometry without changing the measured mesh', () => {
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(20, 20, 4, 4));
  terrain.updateMatrixWorld(true);
  const before = Array.from(terrain.geometry.getAttribute('position').array);
  const hit = new THREE.Raycaster(new THREE.Vector3(1, 1, 10), new THREE.Vector3(0, 0, -1)).intersectObject(terrain)[0];
  assert.ok(hit);
  const detail = buildLunarSurfaceDetail(hit);
  assert.ok(detail);
  const positions = detail.getAttribute('position');
  assert.ok(positions.count > terrain.geometry.getAttribute('position').count);
  for (let i = 0; i < positions.count; i++) {
    assert.ok(positions.getZ(i) >= .014 && positions.getZ(i) <= .676);
  }
  assert.deepEqual(Array.from(terrain.geometry.getAttribute('position').array), before);
  assert.equal(detail.getAttribute('uv').count, positions.count);
  assert.ok(detail.index.count > 0);
  detail.dispose(); terrain.geometry.dispose();
});

test('detail gracefully skips an intersection without triangle data', () => {
  assert.equal(buildLunarSurfaceDetail({ object: new THREE.Object3D(), point: new THREE.Vector3() }), null);
});


test('enriched crater skin stays bounded and deterministic and leaves measured positions intact', () => {
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(40, 40, 4, 4));
  terrain.updateMatrixWorld(true);
  const before = Array.from(terrain.geometry.getAttribute('position').array);
  const hit = new THREE.Raycaster(new THREE.Vector3(1, 1, 10), new THREE.Vector3(0, 0, -1)).intersectObject(terrain)[0];
  const first = buildLunarSurfaceDetail(hit, true), second = buildLunarSurfaceDetail(hit, true);
  assert.ok(first && second);
  const points = first.getAttribute('position');
  assert.ok(points.count <= 180000);
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < points.count; i++) {
    assert.ok(Number.isFinite(points.getZ(i)));
    low = Math.min(low, points.getZ(i)); high = Math.max(high, points.getZ(i));
  }
  assert.ok(low >= .014 && high < .55);
  assert.ok(high - low > .10);
  assert.deepEqual(Array.from(first.getAttribute('position').array), Array.from(second.getAttribute('position').array));
  assert.deepEqual(Array.from(terrain.geometry.getAttribute('position').array), before);
  first.dispose(); second.dispose(); terrain.geometry.dispose();
});
