import * as THREE from "three";
import type { Terrain } from "../../sim/terrain.ts";

// Coordinates are in metres. These deposits are presentation detail, never DEM edits.
export function settledDustHeight(x: number, north: number): number {
  const noise = (cell: number) => {
    const a = x / cell, b = north / cell, i = Math.floor(a), j = Math.floor(b);
    const hash = (u: number, v: number) => { const n = Math.sin(u * 127.1 + v * 311.7) * 43758.5453; return n - Math.floor(n); };
    const sx = (a - i) ** 2 * (3 - 2 * (a - i)), sy = (b - j) ** 2 * (3 - 2 * (b - j));
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(i, j), hash(i + 1, j), sx), THREE.MathUtils.lerp(hash(i, j + 1), hash(i + 1, j + 1), sx), sy);
  };
  return .018 + .028 * noise(1.7) + .016 * noise(.23);
}

/** Cheap whole-area rocks plus denser fragments around the current viewing area. */
export function wideGravel(terrain: Terrain, exaggeration: number, east: number, north: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1, metalness: 0, flatShading: true });
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = .8 + .2 * Math.sin(x * 7 + z * 13); p.setXYZ(i, x * k, y * k, z * k); }
  geometry.computeVertexNormals();
  const transform = new THREE.Object3D();
  for (const [radius, capacity, minimum, maximum] of [[terrain.halfSizeM, 18000, .15, 2.4], [300, 20000, .015, .35]] as const) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    let seed = 77123, count = 0;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < capacity; i++) {
      const x = (radius === terrain.halfSizeM ? 0 : east) + (random() * 2 - 1) * radius;
      const n = (radius === terrain.halfSizeM ? 0 : north) + (random() * 2 - 1) * radius;
      const h = Math.abs(x) <= terrain.halfSizeM && Math.abs(n) <= terrain.halfSizeM ? terrain.heightAt(x, n) : NaN;
      if (!Number.isFinite(h)) continue;
      const size = minimum + random() ** 5 * maximum;
      transform.position.set(x, h * exaggeration + size * .3 + settledDustHeight(x, n), -n);
      transform.rotation.set(random() * .7, random() * Math.PI * 2, random() * .5);
      transform.scale.set(size, size * (.6 + random() * .6), size * (1 + random() * .5)); transform.updateMatrix();
      mesh.setMatrixAt(count, transform.matrix); mesh.setColorAt(count++, new THREE.Color().setScalar(.65 + random() * .35));
    }
    mesh.count = count; mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  return { group, dispose: () => { group.children.forEach(m => (m as THREE.InstancedMesh).dispose()); geometry.dispose(); material.dispose(); } };
}
