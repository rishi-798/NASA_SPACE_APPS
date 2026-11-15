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
  const uvs = detail.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    assert.ok(Math.abs(uvs.getX(i) - positions.getX(i) / 3.1) < 1e-5);
    assert.ok(Math.abs(uvs.getY(i) - positions.getY(i) / 3.1) < 1e-5);
  }
  assert.ok(detail.index.count > 0);
  detail.dispose(); terrain.geometry.dispose();
});

test('detail gracefully skips an intersection without triangle data', () => {
  assert.equal(buildLunarSurfaceDetail({ object: new THREE.Object3D(), point: new THREE.Vector3() }), null);
});
