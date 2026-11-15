import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TerrainRegion } from './terrainTypes';
import type { MoonLocation } from '../../MoonMap';
import { eyePosition, lookDirection, type Vec3 } from '../../lib/surfaceViewMath';
import { createRegolithTextures } from '../../lib/regolithTexture';
import { buildLunarSurfaceDetail, lunarDetailHeight } from '../../lib/lunarSurfaceDetail';

const detailedRegions = new Set(['SITE04-G7', 'REGION-APOLLO-11', 'REGION-APOLLO-12', 'REGION-APOLLO-14', 'REGION-APOLLO-15', 'REGION-APOLLO-16', 'REGION-ATHENA', 'REGION-ODYSSEUS', 'REGION-APOLLO-17', 'REGION-LUNA-21', 'REGION-LUNOKHOD-1', 'REGION-LUNOKHOD-2', 'REGION-SURVEYOR-1', 'REGION-SURVEYOR-5', 'REGION-SURVEYOR-6', 'REGION-SURVEYOR-7']);

const api = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
type SkyBody = { directional_vector_local_z_up: Vec3; angular_radius_deg: number; elevation_deg: number };
type Lighting = { model_id: string; time: string; sun: SkyBody; earth: SkyBody & { illuminated_fraction: number; sun_direction_local_z_up: Vec3 } };
type CameraMode = 'aerial' | 'orbit' | 'eye';
type Runtime = {
  terrain: THREE.Group | null; inverse: THREE.Matrix4; marker: THREE.Mesh;
  selectedPoint?: THREE.Vector3; up: THREE.Vector3;
  faceBody: (name: 'sun' | 'earth' | 'north') => void;
  mode: CameraMode; setMode: (mode: CameraMode) => boolean;
  render: () => void; setLighting: (data: Lighting | null) => void; inspect: (on: boolean) => void;
  placeRocks: (hit: THREE.Intersection) => void; setRocksVisible: (on: boolean) => void;
};

// Smooth seeded pockets for the approved eight-region artistic gravel layer.
function lunarDustPocket(x:number,y:number):number {
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const hash=(a:number,b:number)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),sx),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),sx),sy);
}

function scatterRocks(scene: THREE.Scene, previous: THREE.Group | null, hit: THREE.Intersection, enriched = false, scans: THREE.Mesh[] = [], hero = false) {
  if (!(hit.object instanceof THREE.Mesh) || hit.faceIndex == null) return previous;
  const capacity = enriched ? 45000 : 1800;
  const mesh = hit.object, positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
  if (!positions || !indices) return previous;
  const makeRockGeometry = (variant: number) => {
    const source = new THREE.IcosahedronGeometry(1, enriched ? (variant >= 5 ? 0 : 1) : 2);
    source.deleteAttribute('normal');
    source.deleteAttribute('uv');
    const geometry = mergeVertices(source);
    source.dispose();
    const vertex = geometry.getAttribute('position');
    for (let i = 0; i < vertex.count; i++) {
      const x = vertex.getX(i), y = vertex.getY(i), z = vertex.getZ(i);
      const irregularity = .85 + .16 * Math.sin(x * (3.7 + variant * .7) + y * 5.3 + z * 4.1 + variant * 2.1)
        + .08 * Math.sin(x * 8.1 - y * 6.4 + z * 7.3)
        + .035 * Math.sin(x * 18.1 + y * 13.4 - z * 16.3);
      const cut = enriched ? Math.min(1, .83 / Math.max(.001, Math.abs(x + .24 * y)), .88 / Math.max(.001, Math.abs(y - .17 * z))) : 1;
      vertex.setXYZ(i, x * irregularity * cut, y * irregularity * cut, z * irregularity * cut);
    }
    geometry.computeVertexNormals();
    const rockUv = new Float32Array(vertex.count * 2);
    for (let i = 0; i < vertex.count; i++) {
      rockUv[i * 2] = Math.atan2(vertex.getY(i), vertex.getX(i)) / (Math.PI * 2) + .5;
      rockUv[i * 2 + 1] = Math.acos(THREE.MathUtils.clamp(vertex.getZ(i) / Math.hypot(vertex.getX(i), vertex.getY(i), vertex.getZ(i)), -1, 1)) / Math.PI;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(rockUv, 2));
    return geometry;
  };
  const rocks = previous ?? new THREE.Group();
  const variants = enriched ? 8 : 1;
  if (!previous) {
    const grit = enriched ? createRegolithTextures(24, true) : null;
    if (grit) { grit.map.repeat.set(1, 1); grit.normalMap.repeat.set(1, 1); }
    for (let variant = 0; variant < variants; variant++) {
      const template = scans.length && variant < scans.length ? scans[variant] : null;
      const material = template ? (template.material as THREE.MeshStandardMaterial).clone() : new THREE.MeshStandardMaterial({
        color: enriched ? 0xb8b6b0 : 0x41413f, roughness: .94, metalness: 0,
        map: grit?.map, normalMap: grit?.normalMap,
        normalScale: new THREE.Vector2(.25, .25), flatShading: enriched,
      });
      if (enriched) {
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));');
        };
        material.customProgramCacheKey = () => 'lunar-neutral-fragments-v1';
      }
      if(hero && new URLSearchParams(window.location.search).get('l1diagnostic') === 'rock-neutral') {
        material.map=null;material.normalMap=null;material.aoMap=null;material.roughnessMap=null;
        material.color.set(0xaaaaaa);material.roughness=.95;
      }
      const stoneGeometry=template ? template.geometry.clone() : makeRockGeometry(variant);
      if(hero && new URLSearchParams(window.location.search).get('l1diagnostic') !== 'rock-neutral') {
        stoneGeometry.computeBoundingBox();
        const bounds=stoneGeometry.boundingBox!,vertices=stoneGeometry.getAttribute('position');
        const covers=new Float32Array(vertices.count);
        for(let i=0;i<vertices.count;i++) {
          const height=(vertices.getZ(i)-bounds.min.z)/Math.max(.001,bounds.max.z-bounds.min.z);
          covers[i]=.5+.30*(1-THREE.MathUtils.smoothstep(height,.05,.65));
        }
        stoneGeometry.setAttribute('l1DustCover',new THREE.BufferAttribute(covers,1));
        material.normalScale.multiplyScalar(.6);
        const originalCompile=material.onBeforeCompile;
        material.onBeforeCompile=(shader,renderer)=>{
          originalCompile(shader,renderer);
          shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n attribute float l1DustCover; varying float vL1DustCover;');
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vL1DustCover=l1DustCover;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n varying float vL1DustCover;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.215),vL1DustCover);');
        };
        material.customProgramCacheKey=()=> 'lunokhod1-dust-coated-stones-v1';
      }
      const stones = new THREE.InstancedMesh(stoneGeometry, material, hero ? capacity + 20000 : capacity);
      stones.castShadow = stones.receiveShadow = true;
      stones.frustumCulled = false;
      rocks.add(stones);
    }
    scene.add(rocks);
  }
  const batches = rocks.children as THREE.InstancedMesh[];
  batches.forEach(batch => { if (!batch.geometry.boundingBox) batch.geometry.computeBoundingBox(); });
  const samplesBySlot: { matrix: THREE.Matrix4; shade: number; scale: number }[] = [];
  const fineGravel: { matrix: THREE.Matrix4; shade: number; scale: number }[]=[];
  let gravelSeed=(hit.faceIndex+77123)>>>0;
  const gravelRandom=()=>{gravelSeed=(1664525*gravelSeed+1013904223)>>>0;return gravelSeed/4294967296;};
  const transform = new THREE.Object3D();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), point = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1), spin = new THREE.Quaternion();
  const tint = new THREE.Color();
  let seed = (hit.faceIndex + 1) >>> 0, count = 0, candidates = 0;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const first = Math.max(0, hit.faceIndex - 16384), last = Math.min(indices.count / 3, hit.faceIndex + 16385);
  for (let face = first; face < last; face++) {
    a.fromBufferAttribute(positions, indices.getX(face * 3)).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(positions, indices.getX(face * 3 + 1)).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(positions, indices.getX(face * 3 + 2)).applyMatrix4(mesh.matrixWorld);
    if (Math.min(a.distanceToSquared(hit.point), b.distanceToSquared(hit.point), c.distanceToSquared(hit.point)) > 10000) continue;
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const area = normal.length() / 2;
    normal.normalize();
    if (normal.z < 0) normal.negate();
    if(hero && fineGravel.length<20000) {
      for(let i=0,n=Math.min(24000,Math.ceil(area*24));i<n&&fineGravel.length<20000;i++) {
        const u=Math.sqrt(gravelRandom()),v=gravelRandom();
        point.copy(a).multiplyScalar(1-u).addScaledVector(b,u*(1-v)).addScaledVector(c,u*v);
        const d=point.distanceToSquared(hit.point);
        if(d>400||d<.0625) continue;
        const pocket=lunarDustPocket(point.x*.1+19,point.y*.1-7);
        if(gravelRandom()>.3+.7*pocket) continue;
        transform.position.copy(point);transform.position.z+=lunarDetailHeight(point.x,point.y,hit.point,true);
        transform.quaternion.setFromUnitVectors(up,normal);
        transform.quaternion.multiply(spin.setFromAxisAngle(up,gravelRandom()*Math.PI*2));
        const scale=.006+gravelRandom()*.012;
        transform.scale.set(scale,scale*(.7+gravelRandom()*.5),scale*(.6+gravelRandom()*.35));
        transform.updateMatrix();fineGravel.push({matrix:transform.matrix.clone(),shade:.8+gravelRandom()*.2,scale});
      }
    }
    const samples = Math.min(enriched ? 24000 : 120, Math.max(1, Math.ceil(area * (enriched ? 12 : .09))));
    for (let i = 0; i < samples; i++) {
      const u = Math.sqrt(random()), v = random();
      point.copy(a).multiplyScalar(1-u).addScaledVector(b, u*(1-v)).addScaledVector(c, u*v);
      const distance = point.distanceToSquared(hit.point);
      if (distance > 4900 || distance < (enriched ? .0625 : 4)) continue;
      if (enriched) {
        let probability=.08+.92*Math.exp(-distance/500);
        if(hero) probability*=.2+1.6*lunarDustPocket(point.x*.1+19,point.y*.1-7);
        if(random()>probability) continue;
      }
      candidates++;
      const slot = count < capacity ? count++ : Math.floor(random() * candidates);
      if (slot >= capacity) continue;
      transform.position.copy(point);
      transform.position.z += lunarDetailHeight(point.x, point.y, hit.point, enriched);
      transform.quaternion.setFromUnitVectors(up, normal);
      transform.quaternion.multiply(spin.setFromAxisAngle(up, random() * Math.PI * 2));
      // Many small fragments and occasional larger rocks, mostly buried in dust.
      const sizeRoll = random();
      const scale = enriched
        ? (sizeRoll < .90 ? .006 + Math.pow(random(), 2) * .018 : sizeRoll < .985 ? .025 + random() * .045 : sizeRoll < .999 ? .09 + random() * .11 : .20 + random() * .20)
        : .035 + Math.pow(random(), 3) * .42;
      transform.scale.set(scale, scale * (.65 + random() * .7), scale * (enriched && scans.length ? .75 + random() * .45 : .35 + random() * .38));
      transform.updateMatrix();
      samplesBySlot[slot] = { matrix: transform.matrix.clone(), shade: .65 + random() * .35, scale };
    }
  }
  samplesBySlot.push(...fineGravel);
  batches.forEach(batch => { batch.count = 0; });
  samplesBySlot.forEach((sample, slot) => {
    // Reserve photographed geometry for visible stones; fine gravel uses cheaper fragments.
    const variant = scans.length && enriched
      ? sample.scale >= .09 ? slot % scans.length : scans.length + slot % (variants - scans.length)
      : slot % variants;
    const batch = batches[variant]!;
    // Keep most of each stone above the regolith, with its lower portion embedded.
    const lift = enriched ? -.65 * batch.geometry.boundingBox!.min.z : 0;
    const elements = sample.matrix.elements;
    elements[12] += elements[8] * lift;
    elements[13] += elements[9] * lift;
    elements[14] += elements[10] * lift;
    batch.setMatrixAt(batch.count, sample.matrix);
    tint.setRGB(sample.shade, sample.shade, sample.shade * .98);
    batch.setColorAt(batch.count++, tint);
  });
  batches.forEach(batch => {
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
  });
  return rocks;
}

function createStarfield(skyRadius: number) {
  const count = 3600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const palette = [
    new THREE.Color(0xdce9ff),
    new THREE.Color(0xffffff),
    new THREE.Color(0xfff5ea),
    new THREE.Color(0xffe8d0),
    new THREE.Color(0x99bbff),
  ];
  for (let i = 0; i < count; i++) {
    const u = rnd(), v = rnd();
    const theta = u * 2 * Math.PI;
    // CRITICAL: Stars exist strictly in the upper celestial hemisphere (z > 0 above the lunar horizon).
    // No stars can EVER be positioned below the horizon or under the ground!
    const phi = Math.acos(Math.max(0.04, 0.04 + 0.94 * v));
    const r = skyRadius * (0.92 + rnd() * 0.12);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    const c = palette[Math.floor(rnd() * palette.length)]!;
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.25, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false,
  });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  return stars;
}

function createSunVisual() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.18, 'rgba(255, 246, 222, 0.85)');
    grad.addColorStop(0.42, 'rgba(255, 228, 165, 0.38)');
    grad.addColorStop(0.75, 'rgba(255, 195, 110, 0.09)');
    grad.addColorStop(1, 'rgba(255, 175, 80, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    })
  );
  group.add(core, glow);
  return { group, core, glow };
}

function extractBoundaryProfile(terrain: THREE.Group, center: THREE.Vector3, fallbackZ: number) {
  const bins = new Float32Array(360);
  const maxR = new Float32Array(360);
  bins.fill(fallbackZ);
  maxR.fill(0);

  terrain.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.updateWorldMatrix(true, false);
    const pos = child.geometry.getAttribute('position');
    if (!pos) return;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.applyMatrix4(child.matrixWorld);
      // Skip vertical base skirt/box floor vertices to only capture the true top surface perimeter
      if (v.z <= fallbackZ - 8.0) continue;
      const dx = v.x - center.x;
      const dy = v.y - center.y;
      const r = Math.hypot(dx, dy);
      if (r < 10) continue;
      const angle = Math.atan2(dy, dx);
      const deg = Math.floor((THREE.MathUtils.radToDeg(angle) + 360) % 360);
      if (r > maxR[deg]) {
        maxR[deg] = r;
        bins[deg] = v.z;
      }
    }
  });

  return {
    getZ: (angle: number) => {
      const deg = (THREE.MathUtils.radToDeg(angle) + 360) % 360;
      const d0 = Math.floor(deg) % 360;
      const d1 = (d0 + 1) % 360;
      const frac = deg - Math.floor(deg);
      return bins[d0] * (1 - frac) + bins[d1] * frac;
    },
    getR: (angle: number) => {
      const deg = (THREE.MathUtils.radToDeg(angle) + 360) % 360;
      const d0 = Math.floor(deg) % 360;
      const d1 = (d0 + 1) % 360;
      const frac = deg - Math.floor(deg);
      return maxR[d0] * (1 - frac) + maxR[d1] * frac;
    }
  };
}

// Procedural crater with bowl depression, central uplift peak, and raised ejecta rim
function evalLunarCrater(px: number, py: number, cx: number, cy: number, radius: number, depth: number, rim: number) {
  const d = Math.hypot(px - cx, py - cy) / radius;
  if (d > 2.4) return 0;
  if (d < 1.0) {
    const bowl = -depth * (1.0 - Math.pow(d, 2.0));
    const centralPeak = d < 0.22 ? (depth * 0.35) * (1.0 - d / 0.22) : 0;
    return bowl + centralPeak;
  }
  const t = (d - 1.0) / 1.4;
  return rim * Math.pow(Math.max(0, 1.0 - t), 2.2);
}

// Sinuous lunar rille (volcanic lava tube collapse canyon like Hadley Rille)
function evalLunarRille(px: number, py: number, x0: number, y0: number, len: number, width: number, depth: number) {
  const dx = px - x0, dy = py - y0;
  if (dx < -1000 || dx > len + 1000) return 0;
  const rilleY = Math.sin(dx * 0.00028) * 1600 + Math.sin(dx * 0.00085) * 520;
  const dist = Math.abs(dy - rilleY);
  if (dist > width) return 0;
  const p = Math.cos((dist / width) * Math.PI * 0.5);
  return -depth * Math.pow(p, 1.8);
}

// Towering mountain massif (e.g. Apennine Mountains / Massifs)
function evalLunarMassif(px: number, py: number, mx: number, my: number, sx: number, sy: number, height: number) {
  const nx = (px - mx) / sx, ny = (py - my) / sy;
  const d2 = nx * nx + ny * ny;
  if (d2 > 4.0) return 0;
  const ridge = Math.exp(-d2 * 0.85);
  const rug = Math.sin(px * 0.0004 + py * 0.0003) * 0.22 + Math.cos(px * 0.0009 - py * 0.0007) * 0.14;
  return height * ridge * (1.0 + rug);
}

function buildSeamlessContinuousLandscape(
  center: THREE.Vector3,
  extent: number,
  box: THREE.Box3,
  regionId: string,
  boundary?: { getZ: (a: number) => number; getR: (a: number) => number },
  isSquare = false
) {
  const hx = Math.max(1, (box.max.x - box.min.x) * 0.5);
  const hy = Math.max(1, (box.max.y - box.min.y) * 0.5);
  const circRadius = extent * 0.495;
  const outerRadius = Math.max(extent * 30, 480000); // 480 km vast curved lunar horizon
  const radialRings = 108;
  const angularSegments = 200;
  const vertexCount = (radialRings + 1) * (angularSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  const baseZ = box.min.z + (box.max.z - box.min.z) * 0.05;
  const moonRadius = 1737400; // Physical radius of the Moon in meters

  // Computes perimeter radius for any angle with a tight 1.2% tuck under the mesh edge
  const getPerimeterRadius = (angle: number, cosA: number, sinA: number) => {
    if (boundary) {
      const br = boundary.getR(angle);
      if (br > 10) return br * 0.988; // 1.2% tuck under mesh perimeter so zero crack or seam can ever appear
    }
    if (!isSquare) return circRadius;
    const absCos = Math.max(0.0001, Math.abs(cosA));
    const absSin = Math.max(0.0001, Math.abs(sinA));
    return Math.min(hx / absCos, hy / absSin);
  };

  const id = regionId.toUpperCase();
  const isAp15 = id.includes('APOLLO-15');
  const isG7 = id.includes('G7') || id.includes('SITE04');
  const isAp11 = id.includes('APOLLO-11');
  const isAp16 = id.includes('APOLLO-16');
  const isAp17 = id.includes('APOLLO-17');
  const isPolar = isG7 || id.includes('ODYSSEUS');

  let vIdx = 0;
  for (let r = 0; r <= radialRings; r++) {
    const frac = r / radialRings;
    const ringT = Math.pow(frac, 1.45);

    for (let a = 0; a <= angularSegments; a++) {
      const angle = (a / angularSegments) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const perimR = getPerimeterRadius(angle, cosA, sinA);
      const bZ = boundary ? boundary.getZ(angle) : baseZ;

      const radius = r === 0 ? perimR : perimR + (outerRadius - perimR) * ringT;
      const distFromPerim = Math.max(0, radius - perimR);
      const curvatureDrop = (distFromPerim * distFromPerim) / (2 * moonRadius);

      const x = center.x + radius * cosA;
      const y = center.y + radius * sinA;

      // Smooth Hermite blend out from the boundary elevation over 18,000 meters
      const blendT = Math.min(1.0, Math.max(0.0, distFromPerim / 18000));
      const blendRelief = blendT * blendT * (3.0 - 2.0 * blendT);

      // Multi-octave natural lunar macro and micro rolling topography
      const macroWaves = (
        Math.sin(x * 0.00007 + y * 0.00005) * 220 +
        Math.cos(x * 0.00003 - y * 0.00004) * 310 +
        Math.sin(angle * 4 + radius * 0.00006) * 110
      ) * blendRelief;

      const midWaves = (
        Math.sin(x * 0.00042 + y * 0.00032) * 58 +
        Math.cos(x * 0.00072 - y * 0.00054) * 42
      ) * blendRelief;

      // Geological feature elevation tailored for each landing spot biome
      let siteFeatures = 0;
      if (isAp15) {
        // Hadley Rille winding canyon + Mount Hadley Delta mountain massif
        siteFeatures += evalLunarRille(x, y, center.x + 800, center.y - 14000, 32000, 1400, 340);
        siteFeatures += evalLunarMassif(x, y, center.x + 8500, center.y - 7000, 14000, 18000, 3600);
        siteFeatures += evalLunarMassif(x, y, center.x + 16000, center.y + 5000, 18000, 24000, 4100);
      } else if (isPolar) {
        // High polar illuminated ridge overlooking deep permanently shadowed crater basin
        siteFeatures += evalLunarMassif(x, y, center.x - 4500, center.y + 3500, 20000, 10000, 2200);
        siteFeatures += evalLunarCrater(x, y, center.x + 8500, center.y - 6000, 11000, 2800, 620);
      } else if (isAp11) {
        // Mare Tranquillitatis swells + West Crater rim + distant Sabine crater
        siteFeatures += evalLunarCrater(x, y, center.x + 950, center.y + 600, 210, 35, 14);
        siteFeatures += evalLunarCrater(x, y, center.x - 16000, center.y + 9000, 7500, 1400, 320);
      } else if (isAp16) {
        // Descartes Highlands: Stone Mountain massif + North Ray crater
        siteFeatures += evalLunarMassif(x, y, center.x - 2800, center.y + 3800, 7000, 7000, 1800);
        siteFeatures += evalLunarCrater(x, y, center.x + 4800, center.y + 5800, 1200, 260, 75);
      } else if (isAp17) {
        // Taurus-Littrow Valley flanked by North Massif and South Massif
        siteFeatures += evalLunarMassif(x, y, center.x - 2200, center.y + 7000, 10000, 14000, 2200);
        siteFeatures += evalLunarMassif(x, y, center.x - 1800, center.y - 7000, 10000, 14000, 2400);
      }

      // Universal prominent impact craters distributed across the surrounding landscape
      const universalCraters = (
        evalLunarCrater(x, y, center.x - 28000, center.y - 32000, 8500, 1600, 380) +
        evalLunarCrater(x, y, center.x + 42000, center.y + 24000, 12000, 2200, 480) +
        evalLunarCrater(x, y, center.x - 65000, center.y + 55000, 18000, 3100, 720) +
        evalLunarCrater(x, y, center.x + 95000, center.y - 85000, 24000, 3800, 890)
      );

      const geologicalRelief = (macroWaves + midWaves + siteFeatures + universalCraters) * blendRelief;

      // Zero-seam continuous elevation: exactly matches boundary profile at r = 0 with ZERO vertical step
      const z = bZ - curvatureDrop + geologicalRelief;

      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      uvs[vIdx * 2] = (x - center.x) / 240;
      uvs[vIdx * 2 + 1] = (y - center.y) / 240;

      vIdx++;
    }
  }

  for (let r = 0; r < radialRings; r++) {
    for (let a = 0; a < angularSegments; a++) {
      const row1 = r * (angularSegments + 1);
      const row2 = (r + 1) * (angularSegments + 1);
      const p1 = row1 + a;
      const p2 = row1 + a + 1;
      const p3 = row2 + a;
      const p4 = row2 + a + 1;

      indices.push(p1, p3, p2);
      indices.push(p2, p3, p4);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export default function LocalTerrainViewer({ region, latitude, longitude, observationTime, onPick }: {
  region: TerrainRegion; latitude: number; longitude: number; observationTime: string;
  onPick: (point: MoonLocation) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const pickRef = useRef(onPick);
  const [state, setState] = useState('Loading measured terrain…');
  const [lighting, setLighting] = useState('Calculating SPICE sky…');
  const [skyReady, setSkyReady] = useState(false);
  const [inspection, setInspection] = useState(!detailedRegions.has(region.id));
  const [showRocks, setShowRocks] = useState(true);
  const [loaded, setLoaded] = useState(0);
  const [mode, setMode] = useState<CameraMode>('aerial');
  const [onMesh, setOnMesh] = useState(false);
  const [camHeading, setCamHeading] = useState(0);
  const [camPitch, setCamPitch] = useState(0);

  useEffect(() => { pickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch { queueMicrotask(() => setState('WebGL could not start. Try another browser.')); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x010204);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', `${region.name} terrain. In eye-level mode drag or use arrow keys to look around.`);
    canvas.tabIndex = 0;

    const scene = new THREE.Scene();
    const terrainTextures = new Set<THREE.Texture>();
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, canvas);
    controls.minDistance = 3; controls.maxPolarAngle = Math.PI * 0.49;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const world = new THREE.Matrix4().set(...region.local_to_moon_fixed.flat() as Parameters<THREE.Matrix4['set']>);
    const inverse = world.clone().invert();

    // Primary astronomical Sun (high-contrast raking solar illumination)
    const sunLight = new THREE.DirectionalLight(0xfffaec, 0);
    sunLight.castShadow = true;
    const shadowResolution = detailedRegions.has(region.id) ? 4096 : 2048;
    sunLight.shadow.mapSize.set(shadowResolution, shadowResolution);
    sunLight.shadow.bias = -0.00006; sunLight.shadow.normalBias = 0.025;

    // Earthshine directional light
    const earthLight = new THREE.DirectionalLight(0x7da4d6, 0);

    // Baseline ambient light (deep space high-contrast - lunar vacuum has zero atmospheric fill)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.04);
    const hemiLight = new THREE.HemisphereLight(0x1a2230, 0x030508, 0.05);
    scene.add(sunLight, sunLight.target, earthLight, earthLight.target, ambientLight, hemiLight);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    marker.visible = false; scene.add(marker);

    // Solar visual with corona glare
    const sunVisual = createSunVisual();
    sunVisual.group.visible = false;
    scene.add(sunVisual.group);

    // Earth globe with terminator
    const earthMap = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}earth/2k-daymap.jpg`, () => render());
    earthMap.colorSpace = THREE.SRGBColorSpace;
    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: { dayMap: {value: earthMap}, sunDirection: {value: new THREE.Vector3()} },
      vertexShader: `varying vec2 texUv; varying vec3 skyNormal;
        void main(){texUv=uv;skyNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform sampler2D dayMap;uniform vec3 sunDirection;varying vec2 texUv;varying vec3 skyNormal;
        void main(){float lit=max(0.0,dot(normalize(skyNormal),normalize(sunDirection)));
        gl_FragColor=vec4(texture2D(dayMap,texUv).rgb*lit,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment> }`,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), earthMaterial);
    earth.visible = false; scene.add(earth);

    let cancelled = false, extent = 1000, skyDistance = 100000, lightDistance = 50000;
    let sky: Lighting | null = null, yaw = 0, pitch = 0;
    const center = new THREE.Vector3();
    const savedPosition = new THREE.Vector3(), savedTarget = new THREE.Vector3();
    let starfield: THREE.Points | null = null;
    let inspectActive = !detailedRegions.has(region.id);
    let rocks: THREE.Group | null = null;
    let rockScans: THREE.Mesh[] = [];
    let lastRockHit: THREE.Intersection | null = null;
    let rocksVisible = true;
    let detail: THREE.Mesh | null = null;
    let detailSource: THREE.Mesh | null = null;
    const detailAnchor = new THREE.Vector3(Infinity, Infinity, Infinity);

    function setAerialCamera() {
      const b = value.terrain ? new THREE.Box3().setFromObject(value.terrain) : new THREE.Box3();
      const sz = b.getSize(new THREE.Vector3());
      const c = b.getCenter(new THREE.Vector3());
      const ext = Math.max(100, sz.x, sz.y);
      const aerialAltitude = Math.max(160, (sz.z || 50) * 0.55 + ext * 0.15);
      // Position camera inside the terrain looking forward across the dramatic landscape
      camera.position.set(c.x - ext * 0.30, c.y - ext * 0.45, c.z + aerialAltitude);
      controls.target.set(c.x + ext * 0.15, c.y + ext * 0.25, c.z + (sz.z || 50) * 0.02);
      controls.minDistance = Math.max(10, ext * 0.04);
      controls.maxDistance = Math.min(32000, ext * 2.5);
      controls.maxPolarAngle = 1.48; // ~85 deg: never below terrain
      controls.minPolarAngle = 0.10;
      controls.update();
    }

    function setOrbitCamera() {
      const b = value.terrain ? new THREE.Box3().setFromObject(value.terrain) : new THREE.Box3();
      const sz = b.getSize(new THREE.Vector3());
      const c = b.getCenter(new THREE.Vector3());
      const ext = Math.max(100, sz.x, sz.y);
      const orbitAltitude = Math.max(1600, (sz.z || 50) + ext * 0.75);
      camera.position.set(c.x + ext * 0.35, c.y - ext * 0.65, c.z + orbitAltitude);
      controls.target.set(c.x, c.y + ext * 0.15, c.z);
      controls.minDistance = Math.max(15, ext * 0.06);
      controls.maxDistance = Math.min(48000, ext * 3.5);
      controls.maxPolarAngle = 1.48;
      controls.update();
    }

    const value: Runtime = {
      terrain: null, inverse, marker, up: new THREE.Vector3(0, 0, 1), mode: 'aerial',
      setMode(next) {
        if (next === 'eye' && !value.selectedPoint) {
          if (value.terrain) {
            const b = new THREE.Box3().setFromObject(value.terrain);
            const c = b.getCenter(new THREE.Vector3());
            const h = new THREE.Raycaster(new THREE.Vector3(c.x, c.y, 100000), new THREE.Vector3(0, 0, -1)).intersectObject(value.terrain, true)[0];
            if (h) {
              value.selectedPoint = h.point.clone();
              value.up.set(0, 0, 1);
              value.marker.position.copy(h.point);
              setOnMesh(true);
            }
          }
        }
        if (next === 'eye' && !value.selectedPoint) return false;
        if (next === value.mode) {
          if (detail) detail.visible = next === 'eye' && !!value.selectedPoint && rocksVisible;
          focusSun(); render(); return true;
        }
        if (next === 'eye') {
          savedPosition.copy(camera.position); savedTarget.copy(controls.target);
          yaw = 0; pitch = -0.08;
          setCamHeading(0); setCamPitch(-5);
        }
        value.mode = next;
        if (detail) detail.visible = next === 'eye' && !!value.selectedPoint && rocksVisible;
        controls.enabled = next !== 'eye';
        marker.visible = next !== 'eye' && !!value.selectedPoint;
        if (next === 'aerial') {
          camera.up.set(0, 0, 1);
          setAerialCamera();
        } else if (next === 'orbit') {
          camera.up.set(0, 0, 1);
          setOrbitCamera();
        }
        focusSun();
        render();
        return true;
      },
      faceBody(name) {
        if (value.mode !== 'eye') return;
        if (name === 'north') {
          yaw = 0; pitch = 0;
          setCamHeading(0); setCamPitch(0);
          render();
          return;
        }
        if (!sky) return;
        const direction = new THREE.Vector3(...sky[name].directional_vector_local_z_up);
        direction.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(value.up, new THREE.Vector3(0, 0, 1)));
        yaw = Math.atan2(direction.x, direction.y);
        pitch = THREE.MathUtils.clamp(Math.atan2(direction.z, Math.hypot(direction.x, direction.y)), -1.45, 1.45);
        setCamHeading(Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360));
        setCamPitch(Math.round(pitch * 180 / Math.PI));
        render();
      },
      render: () => render(),
      placeRocks(hit) {
        lastRockHit = hit;
        if (detailAnchor.distanceToSquared(hit.point) < .0001 && detailSource === hit.object) return;
        rocks = scatterRocks(scene, rocks, hit, detailedRegions.has(region.id), rockScans, detailedRegions.has(region.id));
        if (rocks) rocks.visible = rocksVisible;
        if (detail) { scene.remove(detail); detail.geometry.dispose(); detail = null; }
        detailAnchor.copy(hit.point);
        detailSource = hit.object instanceof THREE.Mesh ? hit.object : null;
        const geometry = buildLunarSurfaceDetail(hit, detailedRegions.has(region.id));
        if (geometry && detailSource) {
          detail = new THREE.Mesh(geometry, detailSource.material);
          detail.castShadow = true; detail.receiveShadow = true;
          detail.visible = value.mode === 'eye' && rocksVisible;
          scene.add(detail);
        }
      },
      setRocksVisible(on) {
        rocksVisible = on;
        if (rocks) rocks.visible = on;
        if (detail) detail.visible = on && value.mode === 'eye' && !!value.selectedPoint;
        render();
      },
      setLighting(data) {
        sky = data;
        focusSun();
        if (data) {
          const sunElev = data.sun.elevation_deg;
          if (sunElev > 0) {
            sunLight.intensity = Math.max(2.6, 3.8 * Math.sin(THREE.MathUtils.degToRad(Math.min(90, Math.max(15, sunElev * 2.2)))));
          } else if (inspectActive) {
            sunLight.intensity = 3.6;
          } else if (sunElev > -6) {
            sunLight.intensity = 1.0 * (1 - Math.abs(sunElev) / 6);
          } else {
            sunLight.intensity = 0.0;
          }

          const earthDir = new THREE.Vector3(...data.earth.directional_vector_local_z_up);
          earthLight.target.position.copy(center);
          earthLight.position.copy(center).addScaledVector(earthDir, lightDistance);
          const earthElev = data.earth.elevation_deg;
          const earthIllum = Math.max(0.18, data.earth.illuminated_fraction);
          earthLight.intensity = detailedRegions.has(region.id)
            ? (earthElev > 0 ? .004 * data.earth.illuminated_fraction : 0)
            : (earthElev > -10 ? (0.24 + earthIllum * 0.45) : 0.08);
          earthMaterial.uniforms.sunDirection!.value.set(...data.earth.sun_direction_local_z_up);
        } else {
          sunLight.intensity = 3.6;
          earthLight.intensity = 0.25;
        }
        value.inspect(inspectActive);
        render();
      },
      inspect(on) {
        inspectActive = on;
        focusSun();
        const isNight = !sky || sky.sun.elevation_deg <= 0;
        if (isNight) {
          sunLight.intensity = on ? 3.6 : 0.0;
        }
        ambientLight.intensity = on ? 0.22 : 0.03;
        hemiLight.intensity = on ? 0.18 : 0.04;
        render();
      },
    };
    runtime.current = value;

    function focusSun() {
      const target = value.mode === 'eye' && value.selectedPoint ? value.selectedPoint : center;
      sunLight.target.position.copy(target);
      const defaultSunDir = new THREE.Vector3(0.72, 0.52, 0.32).normalize();
      const isNight = !sky || sky.sun.elevation_deg <= 0;
      const sunDir = (inspectActive && isNight) || !sky
        ? defaultSunDir
        : new THREE.Vector3(...sky.sun.directional_vector_local_z_up);

      sunLight.position.copy(target).addScaledVector(sunDir, lightDistance);
      const radius = value.mode === 'eye' ? 160 : Math.max(1200, extent * 1.35);
      const shadow = sunLight.shadow.camera;
      shadow.left = shadow.bottom = -radius; shadow.right = shadow.top = radius;
      shadow.near = 10; shadow.far = lightDistance + radius * 3.0;
      sunLight.shadow.normalBias = value.mode === 'eye' ? .015 : .05;
      shadow.updateProjectionMatrix();
    }

    function render() {
      if (cancelled) return;
      if (starfield) starfield.visible = !sky || sky.sun.elevation_deg <= 0;
      if (value.mode === 'eye' && value.selectedPoint) {
        camera.position.fromArray(eyePosition(value.selectedPoint.toArray() as Vec3, value.up.toArray() as Vec3));
        camera.up.copy(value.up);
        const direction = new THREE.Vector3(...lookDirection(yaw, pitch));
        direction.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), value.up));
        camera.lookAt(camera.position.clone().add(direction));
      }
      if (value.mode !== 'eye' && value.terrain) {
        const floor = new THREE.Raycaster(new THREE.Vector3(camera.position.x, camera.position.y, 100000), new THREE.Vector3(0, 0, -1)).intersectObject(value.terrain, true)[0];
        if (floor && camera.position.z < floor.point.z + 2) camera.position.z = floor.point.z + 2;
      }

      // Position astronomical bodies
      for (const [bodyMesh, body] of [[sunVisual.group, sky?.sun], [earth, sky?.earth]] as const) {
        bodyMesh.visible = !!body && body.elevation_deg + body.angular_radius_deg > 0;
        if (body) {
          bodyMesh.position.copy(camera.position).addScaledVector(new THREE.Vector3(...body.directional_vector_local_z_up), skyDistance);
          bodyMesh.scale.setScalar(skyDistance * Math.sin(THREE.MathUtils.degToRad(body.angular_radius_deg)));
        }
      }
      sunVisual.group.lookAt(camera.position);
      renderer.render(scene, camera);
    }

    const resize = () => {
      const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    controls.addEventListener('change', render);

    const dispose = (object: THREE.Object3D) => object.traverse(child => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.LineSegments)) return;
      child.geometry.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (child instanceof THREE.InstancedMesh && material instanceof THREE.MeshStandardMaterial) {
          material.map?.dispose(); material.normalMap?.dispose();
        }
        material.dispose();
      }
    });

    if (detailedRegions.has(region.id)) {
      void Promise.all(['moon_rock_01', 'moon_rock_04'].map(async name => {
        const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}terrain/pbr/${name}/${name}.gltf`);
        gltf.scene.updateMatrixWorld(true);
        const candidates: THREE.Mesh[] = [];
        gltf.scene.traverse(object => { if (object instanceof THREE.Mesh) candidates.push(object); });
        candidates.sort((a,b) => (a.geometry.index?.count ?? a.geometry.getAttribute('position').count) - (b.geometry.index?.count ?? b.geometry.getAttribute('position').count));
        const source = candidates[0];
        if (!source) throw new Error('Rock scan has no geometry');
        const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
        geometry.rotateX(Math.PI / 2); geometry.computeBoundingBox();
        const bounds = geometry.boundingBox!, middle = bounds.getCenter(new THREE.Vector3());
        const span = bounds.getSize(new THREE.Vector3());
        geometry.translate(-middle.x,-middle.y,-middle.z);
        const normalize = 2 / Math.max(span.x,span.y,span.z);
        // Selected scans are thin fragments. Broaden their vertical relief for the
        // illustrative boulder layer instead of further flattening them at placement.
        const verticalRelief = Math.max(1, .55 * Math.max(span.x,span.y) / Math.max(.001,span.z));
        geometry.scale(normalize,normalize,normalize * verticalRelief);
        geometry.computeBoundingBox();
        const material = (source.material as THREE.MeshStandardMaterial).clone();
        material.color.set(0xffffff); material.metalness = 0;
        dispose(gltf.scene);
        const result = new THREE.Mesh(geometry,material);
        if (cancelled) { dispose(result); throw new Error('Viewer closed'); }
        return result;
      })).then(scans => {
        rockScans = scans;
        if (rocks) { scene.remove(rocks); dispose(rocks); rocks = null; }
        detailAnchor.set(Infinity,Infinity,Infinity);
        if (lastRockHit) value.placeRocks(lastRockHit);
        render();
      }).catch(() => { /* Procedural rocks remain available when scans cannot load. */ });
    }

    const download = new AbortController();
    const modelUrl = region.model_url.startsWith('/') ? `${import.meta.env.BASE_URL}${region.model_url.slice(1)}` : region.model_url;

    void fetch(modelUrl, { signal: download.signal }).then(async response => {
      if (!response.ok) throw new Error('Terrain download failed.');
      const buffer = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b => b.toString(16).padStart(2, '0')).join('');
      if (digest !== region.sha256) throw new Error('Terrain file does not match its verified metadata.');
      return new GLTFLoader().parseAsync(buffer, '');
    }).then(gltf => {
      if (cancelled) { dispose(gltf.scene); return; }
      const terrain = new THREE.Group();
      terrain.add(gltf.scene);
      if (region.gltf_up === 'Y') gltf.scene.rotation.x = Math.PI / 2;
      terrain.updateMatrixWorld(true);
      value.terrain = terrain;
      scene.add(terrain);

      const box = new THREE.Box3().setFromObject(terrain);
      const size = box.getSize(new THREE.Vector3());
      box.getCenter(center);
      extent = Math.max(size.x, size.y);

      // Add high-resolution stellar cosmos
      skyDistance = Math.max(100000, extent * 5);
      lightDistance = Math.max(50000, size.length() * 2);
      starfield = createStarfield(skyDistance);
      scene.add(starfield);

      // Add expansive, seamless surrounding lunar horizon landscape
      const boundary = extractBoundaryProfile(terrain, center, box.min.z + (box.max.z - box.min.z) * 0.05);
      const isSquare = region.model_url.toLowerCase().includes('site04') || region.model_url.toLowerCase().includes('g7');
      const landscapeGeo = buildSeamlessContinuousLandscape(center, extent, box, region.id, boundary, isSquare);
      const defaultMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x6e7078),
        roughness: 0.94,
        metalness: 0.0,
      });
      const landscapeMesh = new THREE.Mesh(landscapeGeo, defaultMat);
      landscapeMesh.receiveShadow = true;
      scene.add(landscapeMesh);

      // Add full underlying planetary lunar sphere tangent at baseZ so the Moon extends endlessly in all directions
      const moonRadius = 1737400;
      const baseZ = box.min.z + (box.max.z - box.min.z) * 0.05;
      const moonSphereGeo = new THREE.SphereGeometry(moonRadius, 128, 96);
      const moonSphereMesh = new THREE.Mesh(moonSphereGeo, defaultMat);
      moonSphereMesh.position.set(center.x, center.y, baseZ - moonRadius);
      moonSphereMesh.receiveShadow = true;
      scene.add(moonSphereMesh);

      const isYUp = region.gltf_up === 'Y';

      terrain.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const positions = child.geometry.getAttribute('position');
        if (positions && detailedRegions.has(region.id)) {
          // Smooth duplicated GLB seam vertices through normals only. Keep positions,
          // indices and all coordinate transforms byte-for-byte unchanged.
          child.geometry.computeVertexNormals();
          const normals = child.geometry.getAttribute('normal');
          const sums = new Map<string,THREE.Vector3>();
          const keys:string[]=[];
          for(let i=0;i<positions.count;i++) {
            const key=`${positions.getX(i).toFixed(3)},${positions.getY(i).toFixed(3)},${positions.getZ(i).toFixed(3)}`;
            keys.push(key);const sum=sums.get(key) ?? new THREE.Vector3();
            sum.add(new THREE.Vector3().fromBufferAttribute(normals,i));sums.set(key,sum);
          }
          sums.forEach(normal=>normal.normalize());
          keys.forEach((key,i)=>{const normal=sums.get(key)!;normals.setXYZ(i,normal.x,normal.y,normal.z);});
          normals.needsUpdate=true;
        }
        if (positions) {
          const uv = new Float32Array(positions.count * 2);
          for (let i = 0; i < positions.count; i++) {
            const px = positions.getX(i);
            const py = isYUp ? -positions.getZ(i) : positions.getY(i);
            uv[i * 2] = (px - center.x) / 240;
            uv[i * 2 + 1] = (py - center.y) / 240;
          }
          child.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }
      });

      const texLoader = new THREE.TextureLoader();
      const loadFallbackTextures = () => {
        if (cancelled) return;
        try {
          const regolithTextures = createRegolithTextures(extent, true);
          terrainTextures.add(regolithTextures.map);
          terrainTextures.add(regolithTextures.normalMap);
          regolithTextures.map.wrapS = regolithTextures.map.wrapT = THREE.RepeatWrapping;
          regolithTextures.normalMap.wrapS = regolithTextures.normalMap.wrapT = THREE.RepeatWrapping;
          regolithTextures.map.repeat.set(1, 1);
          regolithTextures.normalMap.repeat.set(1, 1);
          const fallbackMat = new THREE.MeshStandardMaterial({
            map: regolithTextures.map,
            color: new THREE.Color(0x6e7078),
            normalMap: regolithTextures.normalMap,
            normalScale: new THREE.Vector2(2.2, 2.2),
            roughness: 0.95,
            metalness: 0.0,
          });
          terrain.traverse(child => {
            if (child instanceof THREE.Mesh && child.material) {
              child.material = fallbackMat;
              if (detail && detailSource === child) detail.material = child.material;
            }
          });
          landscapeMesh.material = fallbackMat;
          moonSphereMesh.material = fallbackMat;
          render();
        } catch { /* Retain the model's original material if canvas textures are unavailable. */ }
      };
      if (detailedRegions.has(region.id)) {
        void Promise.all(['Diffuse','nor_gl','Rough'].map(name => texLoader.loadAsync(`${import.meta.env.BASE_URL}terrain/pbr/${name}.jpg`))).then(([map,normalMap,roughnessMap]) => {
          for (const texture of [map!,normalMap!,roughnessMap!]) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(6,6); // 24 m coordinate tile / 4 m photographed tile.
            texture.anisotropy = Math.min(8,renderer.capabilities.getMaxAnisotropy());
            terrainTextures.add(texture);
          }
          if (cancelled) { terrainTextures.forEach(t=>t.dispose()); return; }
          map!.colorSpace = THREE.SRGBColorSpace;
          const fines=createRegolithTextures(24,true);
          fines.map.repeat.set(6,6);fines.map.colorSpace=THREE.NoColorSpace;
          fines.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
          terrainTextures.add(fines.map);fines.normalMap.dispose();
          const hero = detailedRegions.has(region.id);
          const dust = hero ? createRegolithTextures(24,true,true) : null;
          if(dust) {
            dust.map.repeat.set(1,1);
            dust.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
            terrainTextures.add(dust.map);dust.normalMap.dispose();
          }
          const material = new THREE.MeshStandardMaterial({map:dust?.map ?? map,normalMap,roughnessMap,bumpMap:fines.map,bumpScale:.16,roughness:1,metalness:0,normalScale:new THREE.Vector2(hero ? .5 : .8,hero ? .5 : .8)});
          if(hero) { material.roughnessMap=null; }
          // Preserve texture structure but keep illustrative regolith neutral gray.
          material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));');
          };
          const neutralColorCompile=material.onBeforeCompile;
          material.onBeforeCompile=(shader,renderer)=>{
            neutralColorCompile(shader,renderer);
            // Chain the fine dust/pit bump after the photographed normal map,
            // matching the tutorials' layered-bump structure.
            shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n #ifdef USE_BUMPMAP\n normal=perturbNormalArb(-vViewPosition,normal,dHdxy_fwd(),faceDirection);\n #endif');
          };
          if(hero) {
            const layeredCompile=material.onBeforeCompile;
            material.onBeforeCompile=(shader,renderer)=>{
              layeredCompile(shader,renderer);
              shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','vec3 l1GeometricNormal=normal;\n #include <normal_fragment_maps>');
              shader.fragmentShader=shader.fragmentShader.replace('#include <clearcoat_normal_fragment_begin>','normal=normalize(mix(l1GeometricNormal,normal,1.0-smoothstep(6.0,32.0,length(vViewPosition))));\n #include <clearcoat_normal_fragment_begin>');
            };
          }
          material.customProgramCacheKey = () => hero ? 'lunokhod1-layered-dust-v1' : 'lunar-layered-regolith-v2';
          terrain.traverse(child => { if(child instanceof THREE.Mesh) child.material=material; });
          landscapeMesh.material = material;
          moonSphereMesh.material = material;
          if(detail) detail.material=material;
          render();
          if(hero) canvas.dataset.lunokhodMaterial="dust-pass";
        }).catch(loadFallbackTextures);
      }
      else texLoader.load(
        `${import.meta.env.BASE_URL}terrain/lunar-detail-color.png`,
        colTex => {
          if (cancelled) { colTex.dispose(); return; }
          terrainTextures.add(colTex);
          colTex.wrapS = colTex.wrapT = THREE.RepeatWrapping;
          colTex.colorSpace = THREE.SRGBColorSpace;
          colTex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
          colTex.repeat.set(1, 1);

          texLoader.load(
            `${import.meta.env.BASE_URL}terrain/lunar-regolith-normal.png`,
            normTex => {
              if (cancelled) { normTex.dispose(); return; }
              terrainTextures.add(normTex);
              normTex.wrapS = normTex.wrapT = THREE.RepeatWrapping;
              normTex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
              normTex.repeat.set(1, 1);

              const mat = new THREE.MeshStandardMaterial({
                map: colTex,
                color: new THREE.Color(0x6e7078),
                normalMap: normTex,
                normalScale: new THREE.Vector2(2.4, 2.4),
                roughness: 0.94,
                metalness: 0.0,
              });
              terrain.traverse(child => {
                if (child instanceof THREE.Mesh && child.material) {
                  child.material = mat;
                  if (detail && detailSource === child) detail.material = mat;
                  mat.needsUpdate = true;
                }
              });
              landscapeMesh.material = mat;
              moonSphereMesh.material = mat;
              render();
            },
            undefined,
            loadFallbackTextures
          );
        },
        undefined,
        loadFallbackTextures
      );

      // Auto-sample center landing point
      const centerRay = new THREE.Raycaster(new THREE.Vector3(center.x, center.y, 100000), new THREE.Vector3(0, 0, -1));
      const centerHits = centerRay.intersectObject(terrain, true);
      if (centerHits.length > 0) {
        value.selectedPoint = centerHits[0].point.clone();
        value.up.set(0, 0, 1);
        value.marker.position.copy(centerHits[0].point);
        setOnMesh(true);
      }

      camera.near = 1.0;
      camera.far = Math.max(1200000, skyDistance * 3);
      camera.updateProjectionMatrix();
      setAerialCamera();

      const shadow = sunLight.shadow.camera;
      const radius = Math.max(1200, size.length() * 0.95);
      shadow.left = shadow.bottom = -radius;
      shadow.right = shadow.top = radius;
      shadow.near = 10;
      shadow.far = lightDistance + radius * 3.0;
      shadow.updateProjectionMatrix();

      marker.scale.setScalar(Math.max(1, extent / 600));
      value.setLighting(sky);
      resize();
      setState('Ready. Drag to pan aerial view or click mesh to set eye-level position.');
      setLoaded(v => v + 1);
    }).catch(error => {
      if (!cancelled) setState(error instanceof Error ? error.message : 'Could not load terrain.');
    });

    let down: { x: number; y: number; lastX: number; lastY: number; id: number } | null = null;
    const start = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, id: event.pointerId };
      if (value.mode === 'eye') {
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
      }
    };
    const move = (event: PointerEvent) => {
      if (value.mode !== 'eye' || !down || down.id !== event.pointerId) return;
      yaw -= (event.clientX - down.lastX) * 0.004;
      pitch = THREE.MathUtils.clamp(pitch + (event.clientY - down.lastY) * 0.004, -1.45, 1.45);
      down.lastX = event.clientX; down.lastY = event.clientY;
      setCamHeading(Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360));
      setCamPitch(Math.round(pitch * 180 / Math.PI));
      render();
    };
    const pick = (event: PointerEvent) => {
      const drag = down; down = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!drag || value.mode === 'eye' || !value.terrain || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) return;
      const bounds = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
      const hit = ray.intersectObject(value.terrain, true)[0];
      if (!hit) return;
      const fixed = hit.point.clone().applyMatrix4(world);
      pickRef.current({
        latitude: THREE.MathUtils.radToDeg(Math.atan2(fixed.z, Math.hypot(fixed.x, fixed.y))),
        longitude: THREE.MathUtils.radToDeg(Math.atan2(fixed.y, fixed.x)),
        name: `${region.name} surface`,
      });
    };
    const cancelPointer = () => { down = null; };
    const key = (event: KeyboardEvent) => {
      if (value.mode !== 'eye' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      yaw += event.key === 'ArrowRight' ? 0.06 : event.key === 'ArrowLeft' ? -0.06 : 0;
      pitch = THREE.MathUtils.clamp(pitch + (event.key === 'ArrowUp' ? 0.04 : event.key === 'ArrowDown' ? -0.04 : 0), -1.45, 1.45);
      setCamHeading(Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360));
      setCamPitch(Math.round(pitch * 180 / Math.PI));
      render();
    };

    canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', pick); canvas.addEventListener('pointercancel', cancelPointer); canvas.addEventListener('keydown', key);
    resize();

    return () => {
      cancelled = true; download.abort(); resizeObserver.disconnect(); controls.dispose();
      canvas.removeEventListener('pointerdown', start); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', pick); canvas.removeEventListener('pointercancel', cancelPointer); canvas.removeEventListener('keydown', key);
      dispose(scene); rockScans.forEach(scan=>dispose(scan)); terrainTextures.forEach(texture => texture.dispose());
      earthMap.dispose(); sunLight.shadow.dispose(); renderer.dispose(); canvas.remove(); runtime.current = null;
    };
  }, [region]);

  useEffect(() => {
    const value = runtime.current; if (!value?.terrain) return;
    const lat = THREE.MathUtils.degToRad(latitude), lon = THREE.MathUtils.degToRad(longitude);
    const up = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
    const origin = up.clone().multiplyScalar(region.reference_radius_m + 100000).applyMatrix4(value.inverse);
    const direction = up.clone().negate().transformDirection(value.inverse);
    const hit = new THREE.Raycaster(origin, direction).intersectObject(value.terrain, true)[0];
    value.selectedPoint = hit?.point.clone(); value.up.copy(direction).negate();
    if (hit) value.placeRocks(hit); else value.setRocksVisible(false);
    if (hit) value.marker.position.copy(hit.point).addScaledVector(direction, -value.marker.scale.x);
    value.marker.visible = !!hit && value.mode !== 'eye';
    value.setMode(hit ? mode : 'aerial');
    setOnMesh(!!hit); value.render();
  }, [latitude, longitude, loaded, region, mode]);

  useEffect(() => { runtime.current?.setRocksVisible(showRocks && onMesh); }, [showRocks, onMesh, loaded]);

  useEffect(() => {
    if (loaded) {
      runtime.current?.setMode(mode);
      runtime.current?.inspect(inspection);
    }
  }, [mode, loaded, inspection]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLighting('Updating SPICE sky… previous frame retained until the calculation completes.');
      void fetch(`${api}/api/terrain/models/${encodeURIComponent(region.id)}/lighting?${new URLSearchParams({ time: observationTime, apparent: 'true' })}`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error('SPICE sky unavailable.');
          return response.json();
        })
        .then((data: Lighting) => {
          if (controller.signal.aborted) return;
          if (data.model_id !== region.id || Date.parse(data.time) !== Date.parse(observationTime) ||
            ![data.sun, data.earth].every(body => Number.isFinite(body.elevation_deg) && body.angular_radius_deg > 0 && body.angular_radius_deg < 90 && body.directional_vector_local_z_up?.length === 3 && body.directional_vector_local_z_up.every(Number.isFinite)) ||
            !Number.isFinite(data.earth.illuminated_fraction) || data.earth.illuminated_fraction < 0 || data.earth.illuminated_fraction > 1 ||
            data.earth.sun_direction_local_z_up?.length !== 3 || !data.earth.sun_direction_local_z_up.every(Number.isFinite)) throw new Error('Invalid SPICE sky response.');
          runtime.current?.setLighting(data);
          setSkyReady(true);
          setLighting(`Sun ${data.sun.elevation_deg.toFixed(2)}° · Earth ${data.earth.elevation_deg.toFixed(2)}° · Earth illuminated ${(data.earth.illuminated_fraction * 100).toFixed(1)}% · ${data.time}`);
        }).catch(error => {
          if (!controller.signal.aborted) {
            runtime.current?.setLighting(null);
            setSkyReady(false);
            setLighting(error instanceof Error ? error.message : 'SPICE sky unavailable.');
          }
        });
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [region, observationTime]);

  return (
    <div className="local-terrain-viewer">
      {/* Top HUD Controls Overlay Bar */}
      <div className="surface-hud-bar">
        <div className="surface-hud-modes" role="group" aria-label="Surface camera mode">

          <button
            type="button"
            className={`hud-mode-btn ${mode === 'eye' && onMesh ? 'hud-mode-active' : ''}`}
            disabled={!onMesh}
            aria-pressed={mode === 'eye' && onMesh}
            onClick={() => setMode(mode === 'eye' ? 'aerial' : 'eye')}
          >
            {mode === 'eye' ? 'Return to terrain view' : 'Lander Eye-Level (1.8m)'}
          </button>

        </div>

        {mode === 'eye' && onMesh && (
          <div className="surface-hud-targets">
            <button type="button" className="hud-target-btn" disabled={!skyReady} onClick={() => runtime.current?.faceBody('sun')}>
              ☀️ Face Sun
            </button>
            <button type="button" className="hud-target-btn" disabled={!skyReady} onClick={() => runtime.current?.faceBody('earth')}>
              🌍 Face Earth
            </button>
            <button type="button" className="hud-target-btn" onClick={() => runtime.current?.faceBody('north')}>
              🧭 North (0°)
            </button>
          </div>
        )}

        <div className="surface-hud-telemetry">
          {mode === 'eye' && onMesh ? (
            <span>🔭 Heading {camHeading.toString().padStart(3, '0')}° · Pitch {camPitch}° · Drag or use arrows to look</span>
          ) : mode === 'aerial' ? (
            <span>Terrain view · Drag to pan</span>
          ) : (
            <span>Terrain view · Drag to orbit</span>
          )}
        </div>
      </div>

      {/* Main 3D Canvas */}
      <div className="local-terrain-canvas" ref={host} />

      <label><input type="checkbox" checked={showRocks} onChange={e => setShowRocks(e.target.checked)} /> Illustrative rocks and fine relief</label>
      <p>Nearby rocks and fine surface relief are illustrative. Selected coordinates use the measured terrain.</p>
      <p role="status">{mode === 'eye' && state.startsWith('Ready.') ? 'Eye-level view · 1.8 m above the selected point' : state}</p>
      <label><input type="checkbox" checked={inspection} onChange={e => setInspection(e.target.checked)} /> Topographic relief light (illustrative)</label>
      {/* Sleek Bottom Metadata & Ephemeris Strip */}
      <div className="surface-footer-strip">
        <span className="surface-meta-tag">
          {region.name} · {region.source_spacing_m.toFixed(1)}m source sampling · 1:1 scale
        </span>
        <span className="surface-sky-tag">
          {lighting}
        </span>
      </div>
    </div>
  );
}
