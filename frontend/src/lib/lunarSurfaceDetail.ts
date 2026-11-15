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

export function lunarDetailHeight(x: number, y: number, anchor: THREE.Vector3, enriched = false, detailRadius = enriched ? 24 : 45): number {
  const fade = THREE.MathUtils.smoothstep(detailRadius - Math.hypot(x - anchor.x, y - anchor.y), 0, enriched ? 8 : 12);
  if (enriched) {
    // An optional presentation skin, never a replacement elevation product.
    // Jittered cells are a Voronoi-style seed field; radial curves form bowls/rims.
    let craters = 0;
    for (const spacing of [1.6, 4.7, 11]) {
      const cellX = Math.floor(x / spacing), cellY = Math.floor(y / spacing);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const cx = cellX + dx, cy = cellY + dy;
        const seed = noise(cx * 31.7 + 11, cy * 27.3 - 5);
        const threshold = spacing < 2 ? .72 : spacing < 6 ? .79 : .86;
        const cluster = noise(cx * spacing * .035 + 71, cy * spacing * .035 - 29);
        if (seed < threshold || cluster < .33) continue;
        const px = (cx + .2 + .6 * noise(cx + 7, cy - 9)) * spacing;
        const py = (cy + .2 + .6 * noise(cx - 17, cy + 29)) * spacing;
        const radius = spacing * (.13 + seed * .16);
        const angle = Math.atan2(y - py, x - px);
        const warpedRadius = radius * (1 + .09 * Math.sin(angle * 5 + seed * 20) + .05 * Math.sin(angle * 9 - seed * 13));
        const d = Math.hypot(x - px, y - py) / warpedRadius;
        if (d > 1.5) continue;
        const rim = Math.exp(-Math.pow((d - .95) * 5, 2));
        const bowl = Math.exp(-Math.pow(d / .72, 4));
        const depth = Math.min(.30, radius * .42);
        craters += depth * (.40 * rim - bowl);
      }
    }
    const roughMask = noise(x * .07 + 7, y * .07 - 13);
    const relief = .10 * noise(x * .7, y * .7)
      + .075 * roughMask * noise(x * 3.3 + 19, y * 3.3 - 3)
      + .022 * noise(x * 9.1 - 5, y * 9.1 + 17);
    return .015 + fade * THREE.MathUtils.clamp(.32 + craters + relief, .005, .58);
  }
  return .015 + fade * (.35 * noise(x * .13, y * .13)
    + .25 * noise(x * .37 + 17, y * .37 - 11)
    + .06 * noise(x * .9 - 9, y * .9 + 4));
}

function buildDenseDetail(hit: THREE.Intersection, radius = 24): THREE.BufferGeometry | null {
  const mesh = hit.object as THREE.Mesh, source = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
  if (!source || !indices || hit.faceIndex == null) return null;
  const steps = 384, spacing = radius * 2 / steps, stride = steps + 1;
  const minX = hit.point.x - radius, minY = hit.point.y - radius;
  const heights = new Float64Array(stride * stride); heights.fill(NaN);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const first = Math.max(0,hit.faceIndex-16384), last = Math.min(indices.count/3,hit.faceIndex+16385);
  for(let face=first;face<last;face++) {
    a.fromBufferAttribute(source,indices.getX(face*3)).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(source,indices.getX(face*3+1)).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(source,indices.getX(face*3+2)).applyMatrix4(mesh.matrixWorld);
    const x0=Math.max(0,Math.ceil((Math.min(a.x,b.x,c.x)-minX)/spacing));
    const x1=Math.min(steps,Math.floor((Math.max(a.x,b.x,c.x)-minX)/spacing));
    const y0=Math.max(0,Math.ceil((Math.min(a.y,b.y,c.y)-minY)/spacing));
    const y1=Math.min(steps,Math.floor((Math.max(a.y,b.y,c.y)-minY)/spacing));
    const determinant=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
    if(Math.abs(determinant)<1e-9) continue;
    for(let iy=y0;iy<=y1;iy++) for(let ix=x0;ix<=x1;ix++) {
      const x=minX+ix*spacing,y=minY+iy*spacing;
      const u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/determinant;
      const v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/determinant;
      if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001) heights[iy*stride+ix]=u*a.z+v*b.z+(1-u-v)*c.z;
    }
  }
  const vertices:number[]=[],uvs:number[]=[],faces:number[]=[],lookup=new Int32Array(heights.length);lookup.fill(-1);
  for(let iy=0;iy<=steps;iy++) for(let ix=0;ix<=steps;ix++) {
    const index=iy*stride+ix,z=heights[index]!;
    if(!Number.isFinite(z)) continue;
    const x=minX+ix*spacing,y=minY+iy*spacing;
    lookup[index]=vertices.length/3;
    vertices.push(x,y,z+lunarDetailHeight(x,y,hit.point,true,radius));uvs.push(x/24,y/24);
  }
  for(let iy=0;iy<steps;iy++) for(let ix=0;ix<steps;ix++) {
    const a=lookup[iy*stride+ix]!,b=lookup[iy*stride+ix+1]!,c=lookup[(iy+1)*stride+ix]!,d=lookup[(iy+1)*stride+ix+1]!;
    if(a>=0&&b>=0&&c>=0) faces.push(a,b,c);
    if(b>=0&&d>=0&&c>=0) faces.push(b,d,c);
  }
  if(!faces.length) return null;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(faces);
  geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

export function buildLunarSurfaceDetail(hit: THREE.Intersection, enriched = false, detailRadius = 24): THREE.BufferGeometry | null {
  if (!(hit.object instanceof THREE.Mesh) || hit.faceIndex == null) return null;
  if (enriched) return buildDenseDetail(hit, detailRadius);
  const mesh = hit.object, source = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
  if (!source || !indices) return null;
  const vertices: number[] = [], uvs: number[] = [], faces: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), point = new THREE.Vector3();
  const first = Math.max(0, hit.faceIndex - 16384), last = Math.min(indices.count / 3, hit.faceIndex + 16385);
  const radius = 45, maxVertices = enriched ? 180000 : 90000;
  for (let face = first; face < last; face++) {
    a.fromBufferAttribute(source, indices.getX(face * 3)).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(source, indices.getX(face * 3 + 1)).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(source, indices.getX(face * 3 + 2)).applyMatrix4(mesh.matrixWorld);
    const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x);
    const minY = Math.min(a.y, b.y, c.y), maxY = Math.max(a.y, b.y, c.y);
    if (hit.point.x < minX - radius || hit.point.x > maxX + radius ||
        hit.point.y < minY - radius || hit.point.y > maxY + radius) continue;
    const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const steps = Math.max(1, Math.min(enriched ? 96 : 48, Math.ceil(edge / (enriched ? .65 : 1.3))));
    const required = (steps + 1) * (steps + 2) / 2;
    if (vertices.length / 3 + required > maxVertices) break;
    const rows: number[][] = [];
    for (let i = 0; i <= steps; i++) {
      const row: number[] = [];
      for (let j = 0; j <= steps - i; j++) {
        point.copy(a).multiplyScalar(1 - (i + j) / steps).addScaledVector(b, i / steps).addScaledVector(c, j / steps);
        row.push(vertices.length / 3);
        vertices.push(point.x, point.y, point.z + lunarDetailHeight(point.x, point.y, hit.point, enriched));
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
