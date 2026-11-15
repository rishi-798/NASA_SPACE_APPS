import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import { frameEarthMoon } from '../frontend/src/lib/spaceSceneFraming.ts';

test('Earth and Moon remain in frame for different orientations and screen shapes', () => {
  for (const aspect of [0.55, 0.8, 1.2, 2]) {
    for (const axis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(.4, .7, .2).normalize(), new THREE.Vector3(0, 0, 1)]) {
      const earth = axis.clone().multiplyScalar(8.5), moon = new THREE.Vector3();
      const normal = axis.clone().cross(new THREE.Vector3(.3, 1, .5)).normalize();
      const frame = frameEarthMoon(earth, moon, normal, 2.64, .72, 38, aspect);
      const camera = new THREE.PerspectiveCamera(38, aspect, .05, 1000);
      camera.up.copy(frame.up); camera.position.copy(frame.target).addScaledVector(normal, frame.distance);
      camera.lookAt(frame.target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const right = moon.clone().sub(earth).normalize();
      for (const [center, radius] of [[earth, 2.64], [moon, .72]]) {
        for (const direction of [right, right.clone().negate(), frame.up, frame.up.clone().negate()]) {
          const projected = center.clone().addScaledVector(direction, radius).project(camera);
          assert.ok(Math.abs(projected.x) < .95 && Math.abs(projected.y) < .95, `aspect ${aspect}: ${projected.toArray()}`);
        }
      }
    }
  }
});
