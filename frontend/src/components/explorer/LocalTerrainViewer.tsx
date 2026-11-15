import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { TerrainRegion } from './terrainTypes';
import type { MoonLocation } from '../../MoonMap';
import { eyePosition, lookDirection, type Vec3 } from '../../lib/surfaceViewMath';
import { createRegolithTextures } from '../../lib/regolithTexture';

const api = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
type SkyBody = { directional_vector_local_z_up: Vec3; angular_radius_deg: number; elevation_deg: number };
type Lighting = { model_id: string; time: string; sun: SkyBody; earth: SkyBody & { illuminated_fraction: number; sun_direction_local_z_up: Vec3 } };
type CameraMode = 'orbit' | 'eye';
type Runtime = {
  terrain: THREE.Group | null; inverse: THREE.Matrix4; marker: THREE.Mesh;
  selectedPoint?: THREE.Vector3; up: THREE.Vector3;
  faceBody: (name: 'sun' | 'earth' | 'north') => void;
  mode: CameraMode; setMode: (mode: CameraMode) => boolean;
  render: () => void; setLighting: (data: Lighting | null) => void; inspect: (on: boolean) => void;
};

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
    new THREE.PlaneGeometry(6.2, 6.2),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    })
  );
  group.add(core, glow);
  return { group, core, glow };
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
  const [inspection, setInspection] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [mode, setMode] = useState<CameraMode>('orbit');
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
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', `${region.name} terrain. In eye-level mode drag or use arrow keys to look around.`);
    canvas.tabIndex = 0;

    const scene = new THREE.Scene();
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
    scene.add(sunLight, sunLight.target, earthLight, earthLight.target, ambientLight);

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
    let inspectActive = false;

    const value: Runtime = {
      terrain: null, inverse, marker, up: new THREE.Vector3(0, 0, 1), mode: 'orbit',
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
        if (next === value.mode) { render(); return true; }
        if (next === 'eye') {
          savedPosition.copy(camera.position); savedTarget.copy(controls.target);
          yaw = 0; pitch = -0.08;
          setCamHeading(0); setCamPitch(-5);
        }
        value.mode = next;
        controls.enabled = next === 'orbit';
        marker.visible = next === 'orbit' && !!value.selectedPoint;
        if (next === 'orbit') {
          camera.up.set(0, 0, 1);
          camera.position.copy(savedPosition);
          controls.target.copy(savedTarget);
          controls.update();
        }
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
      setLighting(data) {
        sky = data;
        if (data) {
          const sunDir = new THREE.Vector3(...data.sun.directional_vector_local_z_up);
          sunLight.target.position.copy(center);
          sunLight.position.copy(center).addScaledVector(sunDir, lightDistance);
          sunLight.intensity = data.sun.elevation_deg > 0 ? 3.2 : 0.0;

          const earthDir = new THREE.Vector3(...data.earth.directional_vector_local_z_up);
          earthLight.target.position.copy(center);
          earthLight.position.copy(center).addScaledVector(earthDir, lightDistance);
          earthLight.intensity = data.earth.elevation_deg > 0 ? (0.04 + data.earth.illuminated_fraction * 0.16) : 0.0;
          earthMaterial.uniforms.sunDirection!.value.set(...data.earth.sun_direction_local_z_up);
        } else {
          sunLight.intensity = 0;
          earthLight.intensity = 0;
        }
        value.inspect(inspectActive);
        render();
      },
      inspect(on) {
        inspectActive = on;
        ambientLight.intensity = on ? 0.22 : 0.08;
        render();
      },
    };
    runtime.current = value;

    function render() {
      if (cancelled) return;
      if (value.mode === 'eye' && value.selectedPoint) {
        camera.position.fromArray(eyePosition(value.selectedPoint.toArray() as Vec3, value.up.toArray() as Vec3));
        camera.up.copy(value.up);
        const direction = new THREE.Vector3(...lookDirection(yaw, pitch));
        direction.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), value.up));
        camera.lookAt(camera.position.clone().add(direction));
      }
      if (value.mode === 'orbit' && value.terrain) {
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
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
    });

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

      terrain.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const positions = child.geometry.getAttribute('position');
        if (positions && !child.geometry.getAttribute('uv')) {
          const uv = new Float32Array(positions.count * 2);
          const invX = 1 / (size.x || 1);
          const invY = 1 / (size.y || 1);
          for (let i = 0; i < positions.count; i++) {
            uv[i * 2] = (positions.getX(i) - box.min.x) * invX;
            const yCoord = region.gltf_up === 'Y' ? -positions.getZ(i) : positions.getY(i);
            uv[i * 2 + 1] = (yCoord - box.min.y) * invY;
          }
          child.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }
      });

      const texLoader = new THREE.TextureLoader();
      texLoader.load(
        `${import.meta.env.BASE_URL}terrain/lunar-detail-color.png`,
        colTex => {
          if (cancelled) { colTex.dispose(); return; }
          const repeats = Math.max(32, Math.round(extent / 25));
          colTex.wrapS = colTex.wrapT = THREE.RepeatWrapping;
          colTex.repeat.set(repeats, repeats);
          colTex.colorSpace = THREE.SRGBColorSpace;
          colTex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
          texLoader.load(
            `${import.meta.env.BASE_URL}terrain/lunar-detail-normal.png`,
            normTex => {
              if (cancelled) { normTex.dispose(); return; }
              normTex.wrapS = normTex.wrapT = THREE.RepeatWrapping;
              normTex.repeat.set(repeats, repeats);
              normTex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
              terrain.traverse(child => {
                if (child instanceof THREE.Mesh && child.material) {
                  const mat = new THREE.MeshStandardMaterial({
                    map: colTex,
                    color: new THREE.Color(0xb2b6bc),
                    normalMap: normTex,
                    normalScale: new THREE.Vector2(0.85, 0.85),
                    roughness: 0.95,
                    metalness: 0.02,
                  });
                  child.material = mat;
                  mat.needsUpdate = true;
                }
              });
              render();
            }
          );
        },
        undefined,
        () => {
          try {
            const regolithTextures = createRegolithTextures(extent);
            terrain.traverse(child => {
              if (child instanceof THREE.Mesh && child.material) {
                const mat = new THREE.MeshStandardMaterial({
                  map: regolithTextures.map,
                  color: new THREE.Color(0xa8acb2),
                  normalMap: regolithTextures.normalMap,
                  normalScale: new THREE.Vector2(0.75, 0.75),
                  roughness: 0.95,
                  metalness: 0.0,
                });
                child.material = mat;
                mat.needsUpdate = true;
              }
            });
            render();
          } catch { /* fallback */ }
        }
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

      controls.target.copy(center);
      controls.maxDistance = extent * 3.5;
      camera.position.set(center.x + extent * 0.45, center.y - extent * 0.75, box.max.z + extent * 0.45);
      camera.far = skyDistance * 2 + extent * 5;
      camera.updateProjectionMatrix();

      const shadow = sunLight.shadow.camera;
      const radius = size.length() * 0.65;
      shadow.left = shadow.bottom = -radius;
      shadow.right = shadow.top = radius;
      shadow.near = 10;
      shadow.far = lightDistance + radius * 2;
      shadow.updateProjectionMatrix();

      marker.scale.setScalar(Math.max(1, extent / 600));
      value.setLighting(sky);
      controls.update();
      resize();
      setState('Ready. Click mesh to set eye-level position.');
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
      if (!drag || value.mode !== 'orbit' || !value.terrain || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) return;
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
      dispose(scene); earthMap.dispose(); sunLight.shadow.dispose(); renderer.dispose(); canvas.remove(); runtime.current = null;
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
    if (hit) value.marker.position.copy(hit.point).addScaledVector(direction, -value.marker.scale.x);
    value.marker.visible = !!hit && value.mode === 'orbit';
    value.setMode(hit ? mode : 'orbit');
    setOnMesh(!!hit); value.render();
  }, [latitude, longitude, loaded, region, mode]);

  useEffect(() => {
    if (loaded) {
      runtime.current?.setMode(mode);
      runtime.current?.inspect(inspection);
    }
  }, [mode, loaded, inspection]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLighting('Updating SPICE sky…');
      void fetch(`${api}/api/terrain/models/${encodeURIComponent(region.id)}/lighting?${new URLSearchParams({ time: observationTime })}`, { signal: controller.signal })
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
          setLighting(`☀️ Sun ${data.sun.elevation_deg.toFixed(1)}° · 🌍 Earth ${data.earth.elevation_deg.toFixed(1)}° (${(data.earth.illuminated_fraction * 100).toFixed(0)}% lit)`);
        }).catch(error => {
          if (!controller.signal.aborted) {
            runtime.current?.setLighting(null);
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
            className={`hud-mode-btn ${mode === 'orbit' || !onMesh ? 'hud-mode-active' : ''}`}
            aria-pressed={mode === 'orbit' || !onMesh}
            onClick={() => setMode('orbit')}
          >
            🛰️ Orbit View
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
        </div>

        {mode === 'eye' && onMesh && (
          <div className="surface-hud-targets">
            <button type="button" className="hud-target-btn" onClick={() => runtime.current?.faceBody('sun')}>
              ☀️ Face Sun
            </button>
            <button type="button" className="hud-target-btn" onClick={() => runtime.current?.faceBody('earth')}>
              🌍 Face Earth
            </button>
            <button type="button" className="hud-target-btn" onClick={() => runtime.current?.faceBody('north')}>
              🧭 North (0°)
            </button>
          </div>
        )}

        <div className="surface-hud-telemetry">
          {mode === 'eye' && onMesh ? (
            <span>🔭 Heading {camHeading.toString().padStart(3, '0')}° · Pitch {camPitch}°</span>
          ) : (
            <span>🖱️ Click mesh to pick eye-level position · Drag to orbit</span>
          )}
        </div>
      </div>

      {/* Main 3D Canvas */}
      <div className="local-terrain-canvas" ref={host} />

      {/* Sleek Bottom Metadata & Ephemeris Strip */}
      <div className="surface-footer-strip">
        <span className="surface-meta-tag">
          {region.name} · {region.source_spacing_m.toFixed(1)}m SLDEM2015 Topography (1:1 scale)
        </span>
        <span className="surface-sky-tag">
          {lighting.includes('Sun') ? lighting : 'SPICE DE440 Solar & Earth Ephemeris'}
        </span>
      </div>
    </div>
  );
}
