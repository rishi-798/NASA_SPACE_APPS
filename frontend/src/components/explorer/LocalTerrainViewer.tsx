import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { TerrainRegion } from './terrainTypes';
import type { MoonLocation } from '../../MoonMap';

const api = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
type Runtime = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer;
  terrain: THREE.Group | null; marker: THREE.Mesh; controls: OrbitControls;
  world: THREE.Matrix4; inverse: THREE.Matrix4; light: THREE.DirectionalLight; fill: THREE.AmbientLight;
  selectedPoint?: THREE.Vector3; ground?: () => void; overview?: () => void;
};

export default function LocalTerrainViewer({ region, latitude, longitude, observationTime, onPick }: {
  region: TerrainRegion; latitude: number; longitude: number; observationTime: string;
  onPick: (point: MoonLocation) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const pickRef = useRef(onPick);
  const [state, setState] = useState('Loading measured terrain…');
  const [lighting, setLighting] = useState('Calculating Sun direction…');
  const [inspection, setInspection] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [mode, setMode] = useState<'ground' | 'overview'>('ground');
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
    renderer.setClearColor(0x000000);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', `${region.name} interactive measured terrain`);
    renderer.domElement.tabIndex = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, .1, 1000000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minDistance = 2;
    controls.maxPolarAngle = Math.PI * .49;
    const world = new THREE.Matrix4().set(...region.local_to_moon_fixed.flat() as Parameters<THREE.Matrix4['set']>);
    const inverse = world.clone().invert();
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.near = .1;
    light.shadow.camera.far = 200000;
    const fill = new THREE.AmbientLight(0xffffff, .015);
    scene.add(light, light.target, fill);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x76ffd0 }));
    marker.visible = false;
    scene.add(marker);
    const value: Runtime = { scene, camera, renderer, controls, world, inverse, light, fill, marker, terrain: null };
    runtime.current = value;
    let cancelled = false;
    const render = () => {
      if (value.terrain) {
        const floor = new THREE.Raycaster(new THREE.Vector3(camera.position.x, camera.position.y, 100000), new THREE.Vector3(0, 0, -1)).intersectObject(value.terrain, true)[0];
        if (floor && camera.position.z < floor.point.z + 2) camera.position.z = floor.point.z + 2;
      }
      renderer.render(scene, camera);
    };
    const resize = () => {
      const width = container.clientWidth, height = container.clientHeight;
      renderer.setSize(width, height, false); camera.aspect = width / height;
      camera.updateProjectionMatrix(); render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    controls.addEventListener('change', render);
    const dispose = (object: THREE.Object3D) => object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
    });
    const modelUrl = region.model_url.startsWith('/') ? `${import.meta.env.BASE_URL}${region.model_url.slice(1)}` : region.model_url;
    void fetch(modelUrl).then(async response => {
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
      terrain.traverse(child => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
      terrain.updateMatrixWorld(true);
      value.terrain = terrain;
      scene.add(terrain);
      const box = new THREE.Box3().setFromObject(terrain);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const extent = Math.max(size.x, size.y);
      controls.target.copy(center);
      controls.maxDistance = extent * 3;
      camera.position.set(center.x, center.y - extent * .6, box.max.z + extent * .32);
      const overviewPosition = camera.position.clone();
      value.overview = () => { controls.target.copy(center); camera.position.copy(overviewPosition); controls.maxPolarAngle = Math.PI * .49; controls.update(); render(); };
      value.ground = () => {
        if (!value.selectedPoint) return;
        camera.position.copy(value.selectedPoint).add(new THREE.Vector3(0, -2, 3));
        controls.target.copy(value.selectedPoint).add(new THREE.Vector3(0, 45, 3));
        controls.maxPolarAngle = Math.PI * .52;
        marker.visible = false; controls.update(); render();
      };
      camera.far = Math.max(100000, extent * 10); camera.updateProjectionMatrix();
      const shadow = light.shadow.camera;
      shadow.left = shadow.bottom = -extent / 2; shadow.right = shadow.top = extent / 2;
      shadow.updateProjectionMatrix(); light.shadow.normalBias = .5;
      marker.scale.setScalar(3);
      controls.update(); resize();
      setState('Measured terrain ready. Drag to orbit, scroll to zoom; click a point to select its coordinates.');
      setLoaded(v => v + 1);
    }).catch(error => { if (!cancelled) setState(error instanceof Error ? error.message : 'Could not load terrain.'); });
    let down = { x: 0, y: 0 };
    const start = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
    const pick = (event: PointerEvent) => {
      if (!value.terrain || Math.hypot(event.clientX-down.x, event.clientY-down.y) > 4) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1, -(event.clientY-bounds.top)/bounds.height*2+1), camera);
      const hit = ray.intersectObject(value.terrain, true)[0];
      if (!hit) return;
      const fixed = hit.point.clone().applyMatrix4(world);
      pickRef.current({ latitude: THREE.MathUtils.radToDeg(Math.atan2(fixed.z, Math.hypot(fixed.x, fixed.y))),
        longitude: THREE.MathUtils.radToDeg(Math.atan2(fixed.y, fixed.x)), name: `${region.name} surface` });
    };
    renderer.domElement.addEventListener('pointerdown', start);
    renderer.domElement.addEventListener('pointerup', pick);
    resize();
    return () => {
      cancelled = true; resizeObserver.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', start); renderer.domElement.removeEventListener('pointerup', pick);
      dispose(scene); renderer.dispose(); renderer.domElement.remove(); runtime.current = null;
    };
  }, [region]);

  useEffect(() => {
    const value = runtime.current;
    if (!value?.terrain) return;
    const lat = THREE.MathUtils.degToRad(latitude), lon = THREE.MathUtils.degToRad(longitude);
    const up = new THREE.Vector3(Math.cos(lat)*Math.cos(lon), Math.cos(lat)*Math.sin(lon), Math.sin(lat));
    const origin = up.clone().multiplyScalar(region.reference_radius_m + 100000).applyMatrix4(value.inverse);
    const direction = up.clone().negate().transformDirection(value.inverse);
    const hit = new THREE.Raycaster(origin, direction).intersectObject(value.terrain, true)[0];
    value.marker.visible = Boolean(hit);
    if (hit) {
      value.selectedPoint = hit.point.clone();
      value.marker.position.copy(hit.point).addScaledVector(direction, -value.marker.scale.x);
    }
    value.renderer.render(value.scene, value.camera);
  }, [latitude, longitude, loaded, region]);

  useEffect(() => {
    if (loaded) runtime.current?.[mode]?.();
  }, [mode, loaded]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(region.anchor.latitude), lon: String(region.anchor.longitude), time: observationTime });
    void fetch(`${api}/api/visibility?${params}`, { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('Sun calculations unavailable; inspection light is optional.');
      return r.json();
    }).then(data => {
      if (controller.signal.aborted) return;
      const value = runtime.current;
      if (!value) return;
      const az = THREE.MathUtils.degToRad(data.sun.azimuth), el = THREE.MathUtils.degToRad(data.sun.elevation);
      value.light.position.set(Math.cos(el)*Math.sin(az), Math.cos(el)*Math.cos(az), Math.sin(el)).multiplyScalar(50000);
      value.light.target.position.set(0, 0, 0);
      value.renderer.render(value.scene, value.camera);
      setLighting(`Sun at ${observationTime} · elevation ${data.sun.elevation.toFixed(1)}°${data.sun.elevation < 0 ? ' (below the horizon)' : ''}`);
    }).catch(e => { if (!controller.signal.aborted) setLighting(e.message); });
    return () => controller.abort();
  }, [region, observationTime]);

  useEffect(() => {
    const value = runtime.current;
    if (value) { value.fill.intensity = inspection ? .9 : .015; value.renderer.render(value.scene, value.camera); }
  }, [inspection]);

  return <div className="local-terrain-viewer">
    <div className="local-view-modes">
      <button type="button" aria-pressed={mode === 'ground'} onClick={() => setMode('ground')}>Ground view</button>
      <button type="button" aria-pressed={mode === 'overview'} onClick={() => setMode('overview')}>Terrain overview</button>
    </div>
    <div className="local-terrain-canvas" ref={host} />
    <p role="status">{state}</p><p>{lighting}</p>
    <label><input type="checkbox" checked={inspection} onChange={e => setInspection(e.target.checked)} /> Inspection light (illustrative)</label>
    <p>{region.source_id} · {region.source_spacing_m.toFixed(1)} m source sampling · 1:1 scale.</p>
    {region.source_mismatch && <p>The elevation API uses a different, higher-resolution source here; this context mesh is not a blend of both datasets.</p>}
    {region.appearance_note && <p>{region.appearance_note}</p>}
  </div>;
}
