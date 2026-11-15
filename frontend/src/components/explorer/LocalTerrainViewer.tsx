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

const detailedRegions = new Set(['REGION-APOLLO-17', 'REGION-LUNA-21', 'REGION-LUNOKHOD-1', 'REGION-LUNOKHOD-2', 'REGION-SURVEYOR-1', 'REGION-SURVEYOR-5', 'REGION-SURVEYOR-6', 'REGION-SURVEYOR-7']);

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

function scatterRocks(scene: THREE.Scene, previous: THREE.Group | null, hit: THREE.Intersection, enriched = false, scans: THREE.Mesh[] = []) {
  if (!(hit.object instanceof THREE.Mesh) || hit.faceIndex == null) return previous;
  const capacity = enriched ? 7500 : 1800;
  const mesh = hit.object, positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
  if (!positions || !indices) return previous;
  const makeRockGeometry = (variant: number) => {
    const source = new THREE.IcosahedronGeometry(1, 2);
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
      const stones = new THREE.InstancedMesh(template ? template.geometry.clone() : makeRockGeometry(variant), material, capacity);
      stones.castShadow = stones.receiveShadow = true;
      stones.frustumCulled = false;
      rocks.add(stones);
    }
    scene.add(rocks);
  }
  const batches = rocks.children as THREE.InstancedMesh[];
  const samplesBySlot: { matrix: THREE.Matrix4; shade: number; scale: number }[] = [];
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
    const samples = Math.min(enriched ? 600 : 120, Math.max(1, Math.ceil(area * (enriched ? .65 : .09))));
    for (let i = 0; i < samples; i++) {
      const u = Math.sqrt(random()), v = random();
      point.copy(a).multiplyScalar(1-u).addScaledVector(b, u*(1-v)).addScaledVector(c, u*v);
      const distance = point.distanceToSquared(hit.point);
      if (distance > 4900 || distance < 4) continue;
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
        ? (sizeRoll < .90 ? .012 + Math.pow(random(), 3) * .13 : sizeRoll < .99 ? .18 + random() * .40 : .65 + random() * .65)
        : .035 + Math.pow(random(), 3) * .42;
      transform.scale.set(scale, scale * (.65 + random() * .7), scale * (.35 + random() * .38));
      transform.updateMatrix();
      samplesBySlot[slot] = { matrix: transform.matrix.clone(), shade: .65 + random() * .35, scale };
    }
  }
  batches.forEach(batch => { batch.count = 0; });
  samplesBySlot.forEach((sample, slot) => {
    // Reserve photographed geometry for visible stones; fine gravel uses cheaper fragments.
    const variant = scans.length && enriched
      ? sample.scale >= .18 ? slot % scans.length : scans.length + slot % (variants - scans.length)
      : slot % variants;
    const batch = batches[variant]!;
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
  const count = 3200;
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
    const phi = Math.acos(2 * v - 1);
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

function buildLunarHorizonSkirt(center: THREE.Vector3, extent: number, box: THREE.Box3, isSquare = false) {
  const diag = Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y);
  const innerRadius = isSquare ? diag * 0.495 : extent * 0.46;
  const outerRadius = Math.max(innerRadius * 15, extent * 20, 95000);
  const radialRings = 52;
  const angularSegments = 100;
  const vertexCount = (radialRings + 1) * (angularSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  const baseZ = box.min.z + (box.max.z - box.min.z) * 0.18;
  const moonRadius = 1737400; // Physical radius of the Moon in meters

  let vIdx = 0;
  for (let r = 0; r <= radialRings; r++) {
    const frac = r / radialRings;
    const t = Math.pow(frac, 1.35);
    const radius = innerRadius + (outerRadius - innerRadius) * t;
    const distFromEdge = radius - innerRadius;
    const curvatureDrop = (distFromEdge * distFromEdge) / (2 * moonRadius);
    const blendRelief = Math.min(1.0, Math.pow(frac, 0.7));

    for (let a = 0; a <= angularSegments; a++) {
      const angle = (a / angularSegments) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const x = center.x + radius * cosA;
      const y = center.y + radius * sinA;

      const proceduralRelief = (
        Math.sin(x * 0.00065 + y * 0.00045) * 35 +
        Math.cos(x * 0.00016 - y * 0.00021) * 62 +
        Math.sin(angle * 6 + radius * 0.0003) * 22
      ) * blendRelief;

      const z = baseZ - curvatureDrop + proceduralRelief;

      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      uvs[vIdx * 2] = (x - center.x) * 0.0008;
      uvs[vIdx * 2 + 1] = (y - center.y) * 0.0008;

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

function buildSealingRim(center: THREE.Vector3, innerRadius: number, baseZ: number, depth: number, box?: THREE.Box3, isSquare = false) {
  if (isSquare && box) {
    const minX = box.min.x, maxX = box.max.x;
    const minY = box.min.y, maxY = box.max.y;
    const edgeSegments = 24;
    const totalPts = edgeSegments * 4;
    const positions = new Float32Array((totalPts + 1) * 2 * 3);
    const uvs = new Float32Array((totalPts + 1) * 2 * 2);
    const indices: number[] = [];

    const getPerimeterPoint = (i: number) => {
      const edge = Math.floor(i / edgeSegments);
      const t = (i % edgeSegments) / edgeSegments;
      if (edge === 0) return { x: minX + (maxX - minX) * t, y: minY };
      if (edge === 1) return { x: maxX, y: minY + (maxY - minY) * t };
      if (edge === 2) return { x: maxX - (maxX - minX) * t, y: maxY };
      return { x: minX, y: maxY - (maxY - minY) * t };
    };

    for (let i = 0; i <= totalPts; i++) {
      const pt = getPerimeterPoint(i % totalPts);
      positions[i * 6] = pt.x;
      positions[i * 6 + 1] = pt.y;
      positions[i * 6 + 2] = baseZ;
      uvs[i * 4] = i / totalPts;
      uvs[i * 4 + 1] = 1;

      positions[i * 6 + 3] = pt.x;
      positions[i * 6 + 4] = pt.y;
      positions[i * 6 + 5] = baseZ - depth;
      uvs[i * 4 + 2] = i / totalPts;
      uvs[i * 4 + 3] = 0;

      if (i < totalPts) {
        const t1 = i * 2, b1 = i * 2 + 1;
        const t2 = (i + 1) * 2, b2 = (i + 1) * 2 + 1;
        indices.push(t1, b1, t2);
        indices.push(t2, b1, b2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  const segments = 96;
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = center.x + innerRadius * Math.cos(angle);
    const y = center.y + innerRadius * Math.sin(angle);

    positions[i * 6] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = baseZ;
    uvs[i * 4] = i / segments;
    uvs[i * 4 + 1] = 1;

    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = baseZ - depth;
    uvs[i * 4 + 2] = i / segments;
    uvs[i * 4 + 3] = 0;

    if (i < segments) {
      const t1 = i * 2;
      const b1 = i * 2 + 1;
      const t2 = (i + 1) * 2;
      const b2 = (i + 1) * 2 + 1;
      indices.push(t1, b1, t2);
      indices.push(t2, b1, b2);
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x010204);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = detailedRegions.has(region.id) ? 1.35 : 2.6;
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

    // Primary astronomical Sun
    const sunLight = new THREE.DirectionalLight(0xfffaec, 0);
    sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.00012; sunLight.shadow.normalBias = 0.05;

    // Earthshine directional light
    const earthLight = new THREE.DirectionalLight(0x8cb5df, 0);

    // Baseline ambient light (deep space high-contrast)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.08);
    const hemiLight = new THREE.HemisphereLight(0xdde5ed, 0x1e2430, 0.55);
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
      const aerialAltitude = (sz.z || 50) * 0.5 + ext * 0.18;
      camera.position.set(c.x - ext * 0.28, c.y - ext * 0.42, c.z + aerialAltitude);
      controls.target.set(c.x + ext * 0.08, c.y + ext * 0.12, c.z + (sz.z || 50) * 0.1);
      controls.minDistance = Math.max(10, ext * 0.05);
      controls.maxDistance = ext * 1.8;
      controls.maxPolarAngle = Math.PI * 0.478;
      controls.minPolarAngle = Math.PI * 0.12;
      controls.update();
    }

    function setOrbitCamera() {
      const b = value.terrain ? new THREE.Box3().setFromObject(value.terrain) : new THREE.Box3();
      const sz = b.getSize(new THREE.Vector3());
      const c = b.getCenter(new THREE.Vector3());
      const ext = Math.max(100, sz.x, sz.y);
      camera.position.set(c.x + ext * 0.45, c.y - ext * 0.75, b.max.z + ext * 0.45);
      controls.target.copy(c);
      controls.minDistance = Math.max(10, ext * 0.08);
      controls.maxDistance = ext * 2.2;
      controls.maxPolarAngle = Math.PI * 0.48;
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
        rocks = scatterRocks(scene, rocks, hit, detailedRegions.has(region.id), rockScans);
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
        if (data) {
          focusSun();
          const sunElev = data.sun.elevation_deg;
          if (sunElev > 0) {
            sunLight.intensity = 3.2;
          } else if (!detailedRegions.has(region.id) && sunElev > -6) {
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
            ? (earthElev > 0 ? .12 * data.earth.illuminated_fraction : 0)
            : (earthElev > -10 ? (0.24 + earthIllum * 0.45) : 0.08);
          earthMaterial.uniforms.sunDirection!.value.set(...data.earth.sun_direction_local_z_up);
        } else {
          sunLight.intensity = detailedRegions.has(region.id) ? 0 : 2.4;
          earthLight.intensity = detailedRegions.has(region.id) ? 0 : .35;
        }
        value.inspect(inspectActive);
        render();
      },
      inspect(on) {
        inspectActive = on;
        ambientLight.intensity = on ? .95 : (detailedRegions.has(region.id) ? 0 : .45);
        hemiLight.intensity = on ? .85 : (detailedRegions.has(region.id) ? 0 : .55);
        render();
      },
    };
    runtime.current = value;

    function focusSun() {
      if (!sky) return;
      const target = value.mode === 'eye' && value.selectedPoint ? value.selectedPoint : center;
      sunLight.target.position.copy(target);
      sunLight.position.copy(target).addScaledVector(new THREE.Vector3(...sky.sun.directional_vector_local_z_up), lightDistance);
      const radius = value.mode === 'eye' ? 125 : extent * .75;
      const shadow = sunLight.shadow.camera;
      shadow.left = shadow.bottom = -radius; shadow.right = shadow.top = radius;
      sunLight.shadow.normalBias = value.mode === 'eye' ? .015 : .08;
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
        geometry.scale(2 / Math.max(span.x,span.y,span.z),2 / Math.max(span.x,span.y,span.z),2 / Math.max(span.x,span.y,span.z));
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

      // Add seamless surrounding lunar horizon landscape skirt
      const isSquare = region.model_url.toLowerCase().includes('site04') || region.model_url.toLowerCase().includes('g7');
      const skirtGeo = buildLunarHorizonSkirt(center, extent, box, isSquare);
      const rimGeo = buildSealingRim(center, extent * 0.465, box.min.z + (box.max.z - box.min.z) * 0.18, extent * 0.25, box, isSquare);
      const defaultMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xb0b4bc),
        roughness: 0.94,
        metalness: 0.02,
      });
      const skirtMesh = new THREE.Mesh(skirtGeo, defaultMat);
      skirtMesh.receiveShadow = true;
      const rimMesh = new THREE.Mesh(rimGeo, defaultMat);
      rimMesh.receiveShadow = true;
      scene.add(skirtMesh);
      scene.add(rimMesh);

      const isYUp = region.gltf_up === 'Y';
      const minX = box.min.x, maxX = box.max.x;
      const spanX = Math.max(1, maxX - minX);
      const minY = isYUp ? -box.max.z : box.min.y;
      const maxY = isYUp ? -box.min.z : box.max.y;
      const spanY = Math.max(1, maxY - minY);

      terrain.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const positions = child.geometry.getAttribute('position');
        if (positions) {
          const uv = new Float32Array(positions.count * 2);
          for (let i = 0; i < positions.count; i++) {
            const px = positions.getX(i);
            const py = isYUp ? -positions.getZ(i) : positions.getY(i);
            uv[i * 2] = detailedRegions.has(region.id) ? px / 24 : (px - minX) / spanX;
            uv[i * 2 + 1] = detailedRegions.has(region.id) ? py / 24 : (py - minY) / spanY;
          }
          child.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }
      });

      const texLoader = new THREE.TextureLoader();
      const loadFallbackTextures = () => {
        if (cancelled) return;
        try {
          const isDetailed = detailedRegions.has(region.id);
          const regolithTextures = createRegolithTextures(extent, isDetailed);
          terrainTextures.add(regolithTextures.map);
          terrainTextures.add(regolithTextures.normalMap);
          const rep = isDetailed ? 1 : 1.6;
          regolithTextures.map.repeat.set(rep, rep);
          regolithTextures.normalMap.repeat.set(rep, rep);
          const fallbackMat = new THREE.MeshStandardMaterial({
            map: regolithTextures.map,
            color: new THREE.Color(0xb0b4bc),
            normalMap: regolithTextures.normalMap,
            normalScale: new THREE.Vector2(0.85, 0.85),
            roughness: 0.95,
            metalness: 0.0,
          });
          terrain.traverse(child => {
            if (child instanceof THREE.Mesh && child.material) {
              child.material = fallbackMat;
              if (detail && detailSource === child) detail.material = child.material;
            }
          });
          skirtMesh.material = fallbackMat;
          rimMesh.material = fallbackMat;
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
          const material = new THREE.MeshStandardMaterial({map,normalMap,roughnessMap,roughness:1,metalness:0,normalScale:new THREE.Vector2(.65,.65)});
          // Preserve texture structure but keep illustrative regolith neutral gray.
          material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));');
          };
          material.customProgramCacheKey = () => 'lunar-neutral-regolith-v1';
          terrain.traverse(child => { if(child instanceof THREE.Mesh) child.material=material; });
          for (const context of [skirtMesh,rimMesh]) {
            const positions=context.geometry.getAttribute('position');
            const uv=new Float32Array(positions.count*2);
            for(let i=0;i<positions.count;i++){uv[i*2]=positions.getX(i)/24;uv[i*2+1]=positions.getY(i)/24;}
            context.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));context.material=material;
          }
          if(detail) detail.material=material;
          render();
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
          const repeatScale = detailedRegions.has(region.id) ? extent / 24 : Math.max(8, Math.min(64, Math.round(extent / 160)));
          colTex.repeat.set(repeatScale, repeatScale);

          texLoader.load(
            `${import.meta.env.BASE_URL}terrain/lunar-regolith-normal.png`,
            normTex => {
              if (cancelled) { normTex.dispose(); return; }
              terrainTextures.add(normTex);
              normTex.wrapS = normTex.wrapT = THREE.RepeatWrapping;
              normTex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
              normTex.repeat.set(repeatScale, repeatScale);

              const normScale = detailedRegions.has(region.id) ? 0.35 : 1.8;
              const mat = new THREE.MeshStandardMaterial({
                map: colTex,
                color: new THREE.Color(0xd2d6dc),
                normalMap: normTex,
                normalScale: new THREE.Vector2(normScale, normScale),
                roughness: 0.92,
                metalness: 0.02,
              });
              terrain.traverse(child => {
                if (child instanceof THREE.Mesh && child.material) {
                  child.material = mat;
                  if (detail && detailSource === child) detail.material = mat;
                  mat.needsUpdate = true;
                }
              });
              skirtMesh.material = mat;
              rimMesh.material = mat;
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

      camera.far = skyDistance * 2 + extent * 5;
      camera.updateProjectionMatrix();
      setAerialCamera();

      const shadow = sunLight.shadow.camera;
      const radius = size.length() * 0.65;
      shadow.left = shadow.bottom = -radius;
      shadow.right = shadow.top = radius;
      shadow.near = 10;
      shadow.far = lightDistance + radius * 2;
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
            className={`hud-mode-btn ${mode === 'aerial' ? 'hud-mode-active' : ''}`}
            aria-pressed={mode === 'aerial'}
            onClick={() => setMode('aerial')}
          >
            🚁 Epic Aerial Flyover
          </button>
          <button
            type="button"
            className={`hud-mode-btn ${mode === 'eye' && onMesh ? 'hud-mode-active' : ''}`}
            disabled={!onMesh}
            aria-pressed={mode === 'eye' && onMesh}
            onClick={() => setMode('eye')}
          >
            👨‍🚀 Lander Eye-Level (1.8m)
          </button>
          <button
            type="button"
            className={`hud-mode-btn ${mode === 'orbit' ? 'hud-mode-active' : ''}`}
            aria-pressed={mode === 'orbit'}
            onClick={() => setMode('orbit')}
          >
            🛰️ Orbital Overview
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
            <span>🚁 Aerial Reconnaissance · Continuous 3D lunar landscape · Drag to glide</span>
          ) : (
            <span>🛰️ Orbital Overview · 1:1 Measured Topography · Drag to orbit</span>
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
          {lighting.includes('Sun') ? lighting : 'SPICE DE440 Solar & Earth Ephemeris'}
        </span>
      </div>
    </div>
  );
}
