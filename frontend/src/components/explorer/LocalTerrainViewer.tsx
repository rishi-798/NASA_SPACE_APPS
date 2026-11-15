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
  faceBody: (name: 'sun' | 'earth') => void;
  mode: CameraMode; setMode: (mode: CameraMode) => boolean;
  render: () => void; setLighting: (data: Lighting | null) => void; inspect: (on: boolean) => void;
};

export default function LocalTerrainViewer({ region, latitude, longitude, observationTime, onPick }: {
  region: TerrainRegion; latitude: number; longitude: number; observationTime: string;
  onPick: (point: MoonLocation) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const pickRef = useRef(onPick);
  const [state, setState] = useState('Loading measured terrain…');
  const [lighting, setLighting] = useState('Calculating SPICE sky…');
  const [inspection, setInspection] = useState(true);
  const [loaded, setLoaded] = useState(0);
  const [mode, setMode] = useState<CameraMode>('orbit');
  const [onMesh, setOnMesh] = useState(false);
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
    renderer.setClearColor(0x000000);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', `${region.name} terrain. In eye-level mode drag or use arrow keys to look around.`);
    canvas.tabIndex = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, .05, 1000000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, canvas);
    controls.minDistance = 3; controls.maxPolarAngle = Math.PI * .49;
    const world = new THREE.Matrix4().set(...region.local_to_moon_fixed.flat() as Parameters<THREE.Matrix4['set']>);
    const inverse = world.clone().invert();
    const light = new THREE.DirectionalLight(0xffffff, 0);
    light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
    light.shadow.bias = -.0001; light.shadow.normalBias = .05;
    const fill = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(light, light.target, fill);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x76ffd0 }));
    marker.visible = false; scene.add(marker);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xfff5dd, toneMapped: false }));
    sun.visible = false;
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
    earth.visible = false; scene.add(sun, earth);
    let cancelled = false, extent = 1000, skyDistance = 100000, lightDistance = 50000;
    let sky: Lighting | null = null, yaw = 0, pitch = 0;
    const center = new THREE.Vector3();
    const savedPosition = new THREE.Vector3(), savedTarget = new THREE.Vector3();
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
        if (next === 'eye') { savedPosition.copy(camera.position); savedTarget.copy(controls.target); }
        value.mode = next; controls.enabled = next === 'orbit'; marker.visible = next === 'orbit' && !!value.selectedPoint;
        if (next === 'orbit') { camera.up.set(0, 0, 1); camera.position.copy(savedPosition); controls.target.copy(savedTarget); controls.update(); }
        render(); return true;
      },
      faceBody(name) {
        if (!sky || value.mode !== 'eye') return;
        const direction = new THREE.Vector3(...sky[name].directional_vector_local_z_up);
        direction.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(value.up, new THREE.Vector3(0, 0, 1)));
        yaw = Math.atan2(direction.x, direction.y); pitch = THREE.MathUtils.clamp(Math.atan2(direction.z, Math.hypot(direction.x, direction.y)), -1.45, 1.45);
        render();
      },
      render: () => render(),
      setLighting(data) {
        sky = data;
        light.intensity = data && data.sun.elevation_deg > 0 ? 3 : 0;
        if (data) {
          light.target.position.copy(center);
          light.position.copy(center).addScaledVector(new THREE.Vector3(...data.sun.directional_vector_local_z_up), lightDistance);
          earthMaterial.uniforms.sunDirection!.value.set(...data.earth.sun_direction_local_z_up);
        }
        render();
      },
      inspect(on) { fill.intensity = on ? 1.0 : .08; render(); },
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
      for (const [mesh, body] of [[sun, sky?.sun], [earth, sky?.earth]] as const) {
        mesh.visible = !!body && body.elevation_deg + body.angular_radius_deg > 0;
        if (body) {
          mesh.position.copy(camera.position).addScaledVector(new THREE.Vector3(...body.directional_vector_local_z_up), skyDistance);
          mesh.scale.setScalar(skyDistance * Math.sin(THREE.MathUtils.degToRad(body.angular_radius_deg)));
        }
      }
      sun.lookAt(camera.position);
      renderer.render(scene, camera);
    }
    const resize = () => {
      const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
    };
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
    controls.addEventListener('change', render);
    const dispose = (object: THREE.Object3D) => object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
    });
    const download = new AbortController();
    const modelUrl = region.model_url.startsWith('/') ? `${import.meta.env.BASE_URL}${region.model_url.slice(1)}` : region.model_url;
    void fetch(modelUrl, {signal: download.signal}).then(async response => {
      if (!response.ok) throw new Error('Terrain download failed.');
      const buffer = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b => b.toString(16).padStart(2, '0')).join('');
      if (digest !== region.sha256) throw new Error('Terrain file does not match its verified metadata.');
      return new GLTFLoader().parseAsync(buffer, '');
    }).then(gltf => {
      if (cancelled) { dispose(gltf.scene); return; }
      const terrain = new THREE.Group(); terrain.add(gltf.scene);
      if (region.gltf_up === 'Y') gltf.scene.rotation.x = Math.PI / 2;
      terrain.updateMatrixWorld(true); value.terrain = terrain; scene.add(terrain);
      const box = new THREE.Box3().setFromObject(terrain), size = box.getSize(new THREE.Vector3());
      box.getCenter(center); extent = Math.max(size.x, size.y);
      terrain.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const positions = child.geometry.getAttribute('position');
        if (positions && !child.geometry.getAttribute('uv')) {
          const uv = new Float32Array(positions.count * 2);
          for (let i = 0; i < positions.count; i++) {
            uv[i * 2] = positions.getX(i) / 64;
            uv[i * 2 + 1] = (region.gltf_up === 'Y' ? -positions.getZ(i) : positions.getY(i)) / 64;
          }
          child.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }
      });
      const texLoader = new THREE.TextureLoader();
      texLoader.load(
        `${import.meta.env.BASE_URL}terrain/lunar-detail-color.png`,
        colTex => {
          if (cancelled) { colTex.dispose(); return; }
          colTex.wrapS = colTex.wrapT = THREE.RepeatWrapping;
          colTex.colorSpace = THREE.SRGBColorSpace;
          colTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          texLoader.load(
            `${import.meta.env.BASE_URL}terrain/lunar-detail-normal.png`,
            normTex => {
              if (cancelled) { normTex.dispose(); return; }
              normTex.wrapS = normTex.wrapT = THREE.RepeatWrapping;
              normTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
              terrain.traverse(child => {
                if (child instanceof THREE.Mesh && child.material) {
                  const mat = child.material as THREE.MeshStandardMaterial;
                  mat.map = colTex;
                  mat.color.set(0xffffff);
                  mat.normalMap = normTex;
                  mat.normalScale = new THREE.Vector2(1.5, 1.5);
                  mat.roughness = 0.90;
                  mat.metalness = 0.0;
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
                const mat = child.material as THREE.MeshStandardMaterial;
                mat.map = regolithTextures.map;
                mat.normalMap = regolithTextures.normalMap;
                mat.normalScale = new THREE.Vector2(0.9, 0.9);
                mat.roughness = 0.94;
                mat.metalness = 0.0;
                mat.needsUpdate = true;
              }
            });
            render();
          } catch { /* ignore fallback error */ }
        }
      );
      const centerRay = new THREE.Raycaster(new THREE.Vector3(center.x, center.y, 100000), new THREE.Vector3(0, 0, -1));
      const centerHits = centerRay.intersectObject(terrain, true);
      if (centerHits.length > 0) {
        value.selectedPoint = centerHits[0].point.clone();
        value.up.set(0, 0, 1);
        value.marker.position.copy(centerHits[0].point);
        setOnMesh(true);
      }
      skyDistance = Math.max(100000, extent * 4); lightDistance = Math.max(50000, size.length() * 2);
      controls.target.copy(center); controls.maxDistance = extent * 3;
      camera.position.set(center.x, center.y - extent * .6, box.max.z + extent * .32);
      camera.far = skyDistance * 2 + extent * 5; camera.updateProjectionMatrix();
      const shadow = light.shadow.camera, radius = size.length() / 2;
      shadow.left = shadow.bottom = -radius; shadow.right = shadow.top = radius;
      shadow.near = 1; shadow.far = lightDistance + radius * 2; shadow.updateProjectionMatrix();
      marker.scale.setScalar(Math.max(1, extent / 600));
      value.setLighting(sky); controls.update(); resize();
      setState('Measured terrain ready. Choose a point in Orbit Camera, then switch to Lander Eye-Level.');
      setLoaded(v => v + 1);
    }).catch(error => { if (!cancelled) setState(error instanceof Error ? error.message : 'Could not load terrain.'); });
    let down: {x: number; y: number; lastX: number; lastY: number; id: number} | null = null;
    const start = (event: PointerEvent) => {
      down = {x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, id: event.pointerId};
      if (value.mode === 'eye') { canvas.focus({preventScroll: true}); canvas.setPointerCapture(event.pointerId); }
    };
    const move = (event: PointerEvent) => {
      if (value.mode !== 'eye' || !down || down.id !== event.pointerId) return;
      yaw -= (event.clientX - down.lastX) * .004;
      pitch = THREE.MathUtils.clamp(pitch + (event.clientY - down.lastY) * .004, -1.45, 1.45);
      down.lastX = event.clientX; down.lastY = event.clientY; render();
    };
    const pick = (event: PointerEvent) => {
      const drag = down; down = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!drag || value.mode !== 'orbit' || !value.terrain || Math.hypot(event.clientX-drag.x, event.clientY-drag.y) > 4) return;
      const bounds = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1, -(event.clientY-bounds.top)/bounds.height*2+1), camera);
      const hit = ray.intersectObject(value.terrain, true)[0]; if (!hit) return;
      const fixed = hit.point.clone().applyMatrix4(world);
      pickRef.current({ latitude: THREE.MathUtils.radToDeg(Math.atan2(fixed.z, Math.hypot(fixed.x, fixed.y))),
        longitude: THREE.MathUtils.radToDeg(Math.atan2(fixed.y, fixed.x)), name: `${region.name} surface` });
    };
    const cancelPointer = () => { down = null; };
    const key = (event: KeyboardEvent) => {
      if (value.mode !== 'eye' || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault(); yaw += event.key === 'ArrowRight' ? .06 : event.key === 'ArrowLeft' ? -.06 : 0;
      pitch = THREE.MathUtils.clamp(pitch + (event.key === 'ArrowUp' ? .04 : event.key === 'ArrowDown' ? -.04 : 0), -1.45, 1.45); render();
    };
    canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', pick); canvas.addEventListener('pointercancel', cancelPointer); canvas.addEventListener('keydown', key);
    resize();
    return () => {
      cancelled = true; download.abort(); resizeObserver.disconnect(); controls.dispose();
      canvas.removeEventListener('pointerdown', start); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', pick); canvas.removeEventListener('pointercancel', cancelPointer); canvas.removeEventListener('keydown', key);
      dispose(scene); earthMap.dispose(); light.shadow.dispose(); renderer.dispose(); canvas.remove(); runtime.current = null;
    };
  }, [region]);

  useEffect(() => {
    const value = runtime.current; if (!value?.terrain) return;
    const lat = THREE.MathUtils.degToRad(latitude), lon = THREE.MathUtils.degToRad(longitude);
    const up = new THREE.Vector3(Math.cos(lat)*Math.cos(lon), Math.cos(lat)*Math.sin(lon), Math.sin(lat));
    const origin = up.clone().multiplyScalar(region.reference_radius_m + 100000).applyMatrix4(value.inverse);
    const direction = up.clone().negate().transformDirection(value.inverse);
    const hit = new THREE.Raycaster(origin, direction).intersectObject(value.terrain, true)[0];
    value.selectedPoint = hit?.point.clone(); value.up.copy(direction).negate();
    if (hit) value.marker.position.copy(hit.point).addScaledVector(direction, -value.marker.scale.x);
    value.marker.visible = !!hit && value.mode === 'orbit';
    value.setMode(hit ? mode : 'orbit');
    setOnMesh(!!hit); value.render();
  }, [latitude, longitude, loaded, region, mode]);

  useEffect(() => { if (loaded) { runtime.current?.setMode(mode); runtime.current?.inspect(inspection); } }, [mode, loaded, inspection]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLighting('Updating SPICE sky… previous frame retained until the calculation completes.');
      void fetch(`${api}/api/terrain/models/${encodeURIComponent(region.id)}/lighting?${new URLSearchParams({time: observationTime})}`, {signal: controller.signal})
        .then(async response => { if (!response.ok) throw new Error('SPICE sky unavailable. Sunlight is off; inspection light remains optional.'); return response.json(); })
        .then((data: Lighting) => {
          if (controller.signal.aborted) return;
          if (data.model_id !== region.id || Date.parse(data.time) !== Date.parse(observationTime) || ![data.sun, data.earth].every(body => Number.isFinite(body.elevation_deg) && body.angular_radius_deg > 0 && body.angular_radius_deg < 90 && body.directional_vector_local_z_up?.length === 3 && body.directional_vector_local_z_up.every(Number.isFinite)) || !Number.isFinite(data.earth.illuminated_fraction) || data.earth.illuminated_fraction < 0 || data.earth.illuminated_fraction > 1 || data.earth.sun_direction_local_z_up?.length !== 3 || !data.earth.sun_direction_local_z_up.every(Number.isFinite)) throw new Error('Invalid SPICE sky response.');
          runtime.current?.setLighting(data);
          setLighting(`Sun ${data.sun.elevation_deg.toFixed(2)}° · Earth ${data.earth.elevation_deg.toFixed(2)}° · Earth illuminated ${(data.earth.illuminated_fraction * 100).toFixed(1)}% · ${data.time}`);
        }).catch(error => { if (!controller.signal.aborted) { runtime.current?.setLighting(null); setLighting(error instanceof Error ? error.message : 'SPICE sky unavailable.'); } });
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [region, observationTime]);

  return <div className="local-terrain-viewer">
    <div className="local-view-modes" role="group" aria-label="Surface camera mode">
      <button type="button" aria-pressed={mode === 'orbit' || !onMesh} onClick={() => setMode('orbit')}>Orbit Camera</button>
      <button type="button" disabled={!onMesh} aria-pressed={mode === 'eye' && onMesh} onClick={() => setMode('eye')}>Lander Eye-Level (1.8m)</button>
    </div>
    {mode === 'eye' && onMesh && <div className="local-sky-tools">
      <button type="button" onClick={() => runtime.current?.faceBody('sun')}>Look toward Sun</button>
      <button type="button" onClick={() => runtime.current?.faceBody('earth')}>Look toward Earth</button>
    </div>}
    <p>{mode === 'eye' && onMesh ? 'Camera fixed 1.8 m above the selected mesh point. Drag or use arrow keys to look around; switch to Orbit Camera to choose another point.' : 'Drag to orbit, scroll to zoom, and click the mesh to choose an eye-level position.'}</p>
    <div className="local-terrain-canvas" ref={host} />
    <p role="status">{state}</p><p role="status">{lighting}</p>
    <label><input type="checkbox" checked={inspection} onChange={e => setInspection(e.target.checked)} /> Inspection light (illustrative, +1.2 lux)</label>
    <p>{region.source_id} · {region.source_spacing_m.toFixed(1)} m source sampling · 1:1 scale. Horizon and shadows are limited to this exported patch.</p>
    <p style={{ fontSize: '0.82rem', color: '#8ec5fc', marginTop: '0.35rem' }}>Surface: Illustrative regolith micro-relief (procedural Voronoi &amp; noise bump). Measured 1:1 SLDEM2015 elevation geometry and coordinates are preserved strictly.</p>
    {region.source_mismatch && <p>The elevation API uses a different, higher-resolution source here; this context mesh is not a blend of both datasets.</p>}
    {region.appearance_note && <p>{region.appearance_note}</p>}
  </div>;
}
