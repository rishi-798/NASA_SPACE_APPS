import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import { buildLunarSurfaceDetail, lunarDetailHeight } from '../frontend/src/lib/lunarSurfaceDetail.ts';

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

test('landing detail can cover a 128 m square without changing the measured surface', () => {
  const source = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, 140, 140));
  source.updateMatrixWorld(true);
  const before = Array.from(source.geometry.getAttribute('position').array);
  const hit = new THREE.Raycaster(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1)).intersectObject(source)[0];
  const detail = buildLunarSurfaceDetail(hit, true, 64);
  detail.computeBoundingBox();
  assert.ok(detail.boundingBox.max.x - detail.boundingBox.min.x >= 127);
  assert.ok(detail.boundingBox.max.y - detail.boundingBox.min.y >= 127);
  assert.ok(detail.getAttribute('position').count <= 150000);
  assert.deepEqual(Array.from(source.geometry.getAttribute('position').array), before);
  detail.dispose(); source.geometry.dispose(); source.material.dispose();
});


test('enriched crater skin stays bounded and deterministic and leaves measured positions intact', () => {
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(40, 40, 4, 4));
  terrain.updateMatrixWorld(true);
  const before = Array.from(terrain.geometry.getAttribute('position').array);
  const hit = new THREE.Raycaster(new THREE.Vector3(1, 1, 10), new THREE.Vector3(0, 0, -1)).intersectObject(terrain)[0];
  const first = buildLunarSurfaceDetail(hit, true), second = buildLunarSurfaceDetail(hit, true);
  assert.ok(first && second);
  const points = first.getAttribute('position');
  assert.ok(points.count <= 150000);
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < points.count; i++) {
    assert.ok(Number.isFinite(points.getZ(i)));
    low = Math.min(low, points.getZ(i)); high = Math.max(high, points.getZ(i));
  }
  assert.ok(low >= .014 && high < .61);
  assert.ok(high - low > .10);
  assert.deepEqual(Array.from(first.getAttribute('position').array), Array.from(second.getAttribute('position').array));
  assert.deepEqual(Array.from(terrain.geometry.getAttribute('position').array), before);
  first.dispose(); second.dispose(); terrain.geometry.dispose();
});


test('dense cosmetic patch follows a translated sloping measured surface without gaps at source triangles', () => {
  const terrain=new THREE.Mesh(new THREE.PlaneGeometry(120,120,2,2));
  const original=terrain.geometry.getAttribute('position');
  for(let i=0;i<original.count;i++) original.setZ(i,.02*original.getX(i)-.01*original.getY(i));
  const before=Array.from(original.array);
  terrain.position.set(100,-50,20);terrain.updateMatrixWorld(true);
  const hit=new THREE.Raycaster(new THREE.Vector3(101,-49,200),new THREE.Vector3(0,0,-1)).intersectObject(terrain)[0];
  const detail=buildLunarSurfaceDetail(hit,true);assert.ok(detail);
  const points=detail.getAttribute('position');
  assert.equal(points.count,385*385);
  assert.equal(detail.index.count,384*384*6);
  for(let i=0;i<points.count;i+=97) {
    const x=points.getX(i),y=points.getY(i);
    const expected=20+.02*(x-100)-.01*(y+50)+lunarDetailHeight(x,y,hit.point,true);
    assert.ok(Math.abs(points.getZ(i)-expected)<.00001);
  }
  assert.deepEqual(Array.from(original.array),before);
  detail.dispose();terrain.geometry.dispose();
});
