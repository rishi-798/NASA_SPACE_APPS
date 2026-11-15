import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// This is a visual overlay only. The viewer still raycasts against the source mesh.
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const hash = (a: number, b: number) => {
    const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx);
  const b = THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx);
  return THREE.MathUtils.lerp(a, b, sy);
}

export function lunarDetailHeight(x: number, y: number, anchor: THREE.Vector3): number {
  const fade = THREE.MathUtils.smoothstep(45 - Math.hypot(x - anchor.x, y - anchor.y), 0, 12);
  return .015 + fade * (.35 * noise(x * .13, y * .13)
    + .25 * noise(x * .37 + 17, y * .37 - 11)
    + .06 * noise(x * .9 - 9, y * .9 + 4));
}

export function buildLunarSurfaceDetail(hit: THREE.Intersection): THREE.BufferGeometry | null {
  if (!(hit.object instanceof THREE.Mesh) || hit.faceIndex == null) return null;
  const mesh = hit.object, source = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
  if (!source || !indices) return null;
  const vertices: number[] = [], uvs: number[] = [], faces: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), point = new THREE.Vector3();
  const first = Math.max(0, hit.faceIndex - 16384), last = Math.min(indices.count / 3, hit.faceIndex + 16385);
  const radius = 45, maxVertices = 90000;
  for (let face = first; face < last; face++) {
    a.fromBufferAttribute(source, indices.getX(face * 3)).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(source, indices.getX(face * 3 + 1)).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(source, indices.getX(face * 3 + 2)).applyMatrix4(mesh.matrixWorld);
    const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x);
    const minY = Math.min(a.y, b.y, c.y), maxY = Math.max(a.y, b.y, c.y);
    if (hit.point.x < minX - radius || hit.point.x > maxX + radius ||
        hit.point.y < minY - radius || hit.point.y > maxY + radius) continue;
    const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const steps = Math.max(1, Math.min(48, Math.ceil(edge / 1.3)));
    const required = (steps + 1) * (steps + 2) / 2;
    if (vertices.length / 3 + required > maxVertices) break;
    const rows: number[][] = [];
    for (let i = 0; i <= steps; i++) {
      const row: number[] = [];
      for (let j = 0; j <= steps - i; j++) {
        point.copy(a).multiplyScalar(1 - (i + j) / steps).addScaledVector(b, i / steps).addScaledVector(c, j / steps);
        row.push(vertices.length / 3);
        vertices.push(point.x, point.y, point.z + lunarDetailHeight(point.x, point.y, hit.point));
        uvs.push(point.x / 24, point.y / 24);
      }
      rows.push(row);
    }
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps - i; j++) {
        faces.push(rows[i]![j]!, rows[i + 1]![j]!, rows[i]![j + 1]!);
        if (j < steps - i - 1) faces.push(rows[i + 1]![j]!, rows[i + 1]![j + 1]!, rows[i]![j + 1]!);
      }
    }
  }
  if (!faces.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(faces);
  const welded = mergeVertices(geometry, .001);
  geometry.dispose();
  welded.computeVertexNormals();
  welded.computeBoundingSphere();
  return welded;
}
