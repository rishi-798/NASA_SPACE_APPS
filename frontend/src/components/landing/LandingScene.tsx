import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { thrustDirection, type Vec3 } from "../../sim/physics";
import type { SnapshotStore } from "../../sim/store";
import type { Terrain } from "../../sim/terrain";
import { createDustEffect } from "./dustEffect";
import { macroAlbedo, starField } from "./regolith";

import { createRegolithTextures } from "../../lib/regolithTexture";

type Props = { terrain: Terrain; store: SnapshotStore; exaggeration: number; targetRadiusM: number; padRadiusM: number; overview: boolean;
  /** Visual size multiplier for the vehicle model only (physics and contact are unchanged). */
  landerScale: number;
  /** Prepared terrain mesh in glTF axes (x east, y = height above datum, z = −north), when the terrain is a model. */
  terrainModel?: THREE.Object3D | null;
  /** Real 3D vehicle model (NASA GLB) drawn at the simulated position. Display only. */
  vehicleModelUrl: string;
  onVehicleStatus?: (status: "loading" | "ready" | "failed") => void };

/**
 * Draws the simulation state from the shared snapshot. Simulation axes (x east, y north, z up) map to
 * three.js as (x, z·exaggeration, −y). The terrain mesh uses exactly the physics heights; exaggeration
 * (visual only) scales every z the same way, so the lander, trail and surface stay aligned.
 */
export function LandingScene({ terrain, store, exaggeration, targetRadiusM, padRadiusM, overview, landerScale, terrainModel, vehicleModelUrl, onVehicleStatus }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const overviewRef = useRef(overview);
  useEffect(() => { overviewRef.current = overview; }, [overview]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const toThree = (p: Vec3) => new THREE.Vector3(p[0], p[2] * exaggeration, -p[1]);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020306);
    scene.add(starField());
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 40000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    // ILLUSTRATIVE LIGHTING: a low Sun (~12° up), typical near the lunar south pole, plus faint fill so
    // shadowed ground is not pure black. Not computed for a specific date.
    scene.add(new THREE.HemisphereLight(0x8fa3c0, 0x1a1712, 0.35));
    const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    const sunDir = new THREE.Vector3(-0.78, 0.21, 0.59).normalize();
    sun.position.copy(sunDir.clone().multiplyScalar(4000));
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -2300, right: 2300, top: 2300, bottom: -2300, near: 100, far: 9000 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 1.5;
    scene.add(sun, sun.target);

    const disposables: { dispose: () => void }[] = [];
    const dust = createRegolithTextures(24, true);
    dust.map.repeat.set(1, 1); dust.normalMap.repeat.set(1, 1);
    dust.map.anisotropy = dust.normalMap.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    const surfaceMaterial = new THREE.MeshStandardMaterial({map: dust.map, normalMap: dust.normalMap,
      normalScale: new THREE.Vector2(.85, .85), color: 0x858585, roughness: .97, metalness: 0});
    disposables.push(dust, surfaceMaterial);
    // Actual Blender shader-node bakes, with procedural fallback while loading.
    const nodeLoader = new THREE.TextureLoader();
    for (const [filename, normal] of [['landing-node-color.png', false], ['landing-node-normal.png', true]] as const) {
      const texture = nodeLoader.load(`${import.meta.env.BASE_URL}terrain/${filename}`, loaded => {
        if (normal) surfaceMaterial.normalMap = loaded;
        else surfaceMaterial.map = loaded;
        surfaceMaterial.needsUpdate = true;
      });
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = normal ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      disposables.push(texture);
    }

    let holder: THREE.Group | null = null;
    if (terrain.grid) {
      // Terrain mesh: sampled from terrain.heightAt — the SAME surface the physics uses — on a 4× finer grid,
      // so the bilinear facets of the 80 m DEM are drawn smoothly without inventing new relief.
      const { count, spacingM, heights } = terrain.grid;
      const half = ((count - 1) * spacingM) / 2;
      const fine = Math.min(4 * (count - 1), 240) + 1;
      const step = (2 * half) / (fine - 1);
      const finite = heights.flat().filter((v): v is number => typeof v === "number");
      const low = finite.length ? Math.min(...finite) : 0, high = finite.length ? Math.max(...finite) : 1;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(fine * fine * 3), colors = new Float32Array(fine * fine * 3), uvs = new Float32Array(fine * fine * 2);
      const index: number[] = [];
      const tile = 24;   // metres per texture repeat
      const albedo = macroAlbedo();
      for (let r = 0; r < fine; r++) for (let c = 0; c < fine; c++) {
        const x = -half + c * step, y = -half + r * step;
        const h = terrain.heightAt(x, y);
        const ok = Number.isFinite(h);
        const p = toThree([x, y, ok ? h : low]);
        const i = r * fine + c;
        positions.set([p.x, p.y, p.z], i * 3);
        uvs.set([x / tile, y / tile], i * 2);
        // Subtle albedo: brighter highlands, a little darker low ground, fading toward the patch edge.
        const t = (ok ? h : low) - low, span = Math.max(1, high - low);
        const edge = Math.min(1, (half - Math.max(Math.abs(x), Math.abs(y))) / 250);
        const shade = (0.7 + 0.12 * (t / span) + 0.3 * albedo(x, y)) * (0.45 + 0.55 * edge);
        if (ok) colors.set([shade, shade * 0.985, shade * 0.96], i * 3); else colors.set([0.8, 0.22, 0.2], i * 3);  // missing data: red
      }
      for (let r = 0; r < fine - 1; r++) for (let c = 0; c < fine - 1; c++) {
        const a = r * fine + c, b = a + 1, d = a + fine, e = d + 1;
        index.push(a, b, d, b, e, d);   // counter-clockwise from above: faces point up
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      const ground = new THREE.Mesh(geometry, surfaceMaterial);
      ground.receiveShadow = true;
      ground.castShadow = true;
      scene.add(ground);
      // Faint 80 m DEM grid lines (one line per real sample), so the data resolution stays visible.
      const gridLines: number[] = [];
      for (let k = 0; k < count; k += 1) {
        for (let j = 0; j < fine - 1; j++) {
          const a = -half + j * step, b = a + step, fixed = -half + k * spacingM;
          for (const [x1, y1, x2, y2] of [[a, fixed, b, fixed], [fixed, a, fixed, b]] as const) {
            const h1 = terrain.heightAt(x1, y1), h2 = terrain.heightAt(x2, y2);
            if (!Number.isFinite(h1) || !Number.isFinite(h2)) continue;
            const p1 = toThree([x1, y1, h1 + 0.25]), p2 = toThree([x2, y2, h2 + 0.25]);
            gridLines.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          }
        }
      }
      const gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridLines, 3));
      const wire = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x8ebfce, transparent: true, opacity: terrain.kind === "lola" ? 0.07 : 0.04 }));
      scene.add(wire);

      disposables.push(geometry, gridGeo);
    } else if (terrainModel) {
      // Team Blender terrain: glTF axes are (x east, y up, z −north) = this scene's axes. Shift by the target's
      // datum height so z = 0 at the target, and apply the same visual exaggeration as everything else.
      terrainModel.updateMatrixWorld(true);
      terrainModel.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        const uv = new Float32Array(positions.count * 2);
        const point = new THREE.Vector3();
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
          uv[i * 2] = point.x / 24;
          uv[i * 2 + 1] = -point.z / 24;
        }
        object.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        object.material = surfaceMaterial;
        object.castShadow = object.receiveShadow = true;
      });
      // The wrapper carries the shift and the vertical exaggeration in this scene's axes (y = up), whatever the
      // model's own orientation is.
      holder = new THREE.Group();
      holder.position.set(0, -(terrain.targetDatumHeightM ?? 0) * exaggeration, 0);
      holder.scale.set(1, exaggeration, 1);
      holder.add(terrainModel);
      scene.add(holder);
      // Outline of the supported simulation square.
      const h = terrain.halfSizeM, pts: THREE.Vector3[] = [];
      const edge: [number, number][] = [];
      for (let i = 0; i <= 80; i++) edge.push([-h + (2 * h * i) / 80, -h]);
      for (let i = 0; i <= 80; i++) edge.push([h, -h + (2 * h * i) / 80]);
      for (let i = 0; i <= 80; i++) edge.push([h - (2 * h * i) / 80, h]);
      for (let i = 0; i <= 80; i++) edge.push([-h, h - (2 * h * i) / 80]);
      for (const [x, y] of edge) { const z = terrain.heightAt(x, y); if (Number.isFinite(z)) pts.push(toThree([x, y, z + 1])); }
      const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x8ebfce, dashSize: 25, gapSize: 15, transparent: true, opacity: 0.6 }));
      outline.computeLineDistances();
      scene.add(outline);
      disposables.push(outline.geometry);
    }

    // Decorative fragments only: excluded from the simulation contact surface.
    const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
    const rockPositions = rockGeometry.getAttribute('position');
    for (let i = 0; i < rockPositions.count; i++) {
      const x = rockPositions.getX(i), y = rockPositions.getY(i), z = rockPositions.getZ(i);
      const f = .85 + .16 * Math.sin(x * 9 + y * 7 + z * 5);
      rockPositions.setXYZ(i, x * f, y * f, z * f);
    }
    rockGeometry.computeVertexNormals();
    const rocks = new THREE.InstancedMesh(rockGeometry, surfaceMaterial, 3500);
    let seed = 19690720, used = 0;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 3500; i++) {
      const x = (random() - .5) * 1200, y = (random() - .5) * 1200;
      const h = terrain.heightAt(x, y);
      if (!Number.isFinite(h) || Math.hypot(x, y) < targetRadiusM + 5) continue;
      const size = .08 + Math.pow(random(), 4) * 2.2;
      transform.position.copy(toThree([x, y, h]));
      transform.rotation.set(random() * .5, random() * Math.PI * 2, random() * .4);
      transform.scale.set(size, size * .65, size * (.7 + random() * .7));
      transform.updateMatrix(); rocks.setMatrixAt(used++, transform.matrix);
    }
    rocks.count = used; rocks.castShadow = rocks.receiveShadow = true;
    scene.add(rocks); disposables.push(rockGeometry);

    // Target area ring, draped by sampling terrain heights around the circle.
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2, x = Math.cos(a) * targetRadiusM, y = Math.sin(a) * targetRadiusM;
      const h = terrain.heightAt(x, y);
      ringPts.push(toThree([x, y, (Number.isFinite(h) ? h : 0) + 0.3]));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0x86b39a })));
    const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 16), new THREE.MeshBasicMaterial({ color: 0x86b39a }));
    centre.position.copy(toThree([0, 0, terrain.heightAt(0, 0) + 0.1]));
    scene.add(centre);

    // Vehicle: a real NASA 3D model (display only), standing on the contact plane. Small discs mark the four
    // contact points the physics uses. The model and plume tilt to show the thrust direction.
    const lander = new THREE.Group();
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.4, roughness: 0.6 });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16), padMat);
      pad.position.set(dx * padRadiusM, 0.03, dz * padRadiusM);
      lander.add(pad);
    }
    const tiltGroup = new THREE.Group();
    lander.add(tiltGroup);
    const displayHeight = 6 * landerScale;      // metres on screen; 1× ≈ the lander's real size
    const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/"));
    let vehicle: THREE.Object3D | null = null;
    let cancelledLoad = false;
    onVehicleStatus?.("loading");
    loader.load(vehicleModelUrl, (asset) => {
      if (cancelledLoad) return;
      const model = asset.scene;
      let box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      if (size.z > size.y && size.z > size.x) model.rotateX(-Math.PI / 2);      // stand the long axis upright
      else if (size.x > size.y) model.rotateZ(Math.PI / 2);
      box = new THREE.Box3().setFromObject(model);
      model.scale.setScalar(displayHeight / box.getSize(new THREE.Vector3()).y);
      box = new THREE.Box3().setFromObject(model);
      const centre = box.getCenter(new THREE.Vector3());
      model.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));   // base centre at the contact plane
      model.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
      const holder = new THREE.Group();
      holder.add(model);
      tiltGroup.add(holder);
      vehicle = holder;
      onVehicleStatus?.("ready");
    }, undefined, () => { if (!cancelledLoad) onVehicleStatus?.("failed"); });
    // Plume from the base of the model: bright core + soft glow (additive), plus a light on the ground.
    const additive = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const plumeScale = Math.max(1, displayHeight / 6);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.3 * plumeScale, 1, 20, 1, true), additive(0xfff1d0, 0.95));
    const glow = new THREE.Mesh(new THREE.ConeGeometry(0.75 * plumeScale, 1, 20, 1, true), additive(0xff9f4a, 0.4));
    for (const m of [core, glow]) { m.rotation.x = Math.PI; tiltGroup.add(m); }
    const engineLight = new THREE.PointLight(0xffa860, 0, 40 * plumeScale, 1.5);
    engineLight.position.y = -1;
    tiltGroup.add(engineLight);
    scene.add(lander);
    // Plume–surface dust near touchdown (visual only).
    const plumeDust = createDustEffect({ heightAt: terrain.heightAt, toThree, gravity: 1.62, scale: Math.max(1, displayHeight / 12) });
    scene.add(plumeDust.points);
    const followOffset = new THREE.Vector3(-2.1, 1.1, 2.5).multiplyScalar(Math.max(8, displayHeight));   // keeps the model ~30% of the view
    const lookHeight = new THREE.Vector3(0, displayHeight * 0.4, 0);

    // Drop line from the lander to the terrain below: keeps the lander findable and shows its height.
    const dropGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const drop = new THREE.Line(dropGeo, new THREE.LineDashedMaterial({ color: 0xe2c790, dashSize: 3, gapSize: 2 }));
    scene.add(drop);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe2c790 }));
    scene.add(beacon);

    const trailGeo = new THREE.BufferGeometry();
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x9ac9d8 }));
    scene.add(trail);

    const start = store.get().state.pos;
    controls.target.copy(toThree(start)).add(lookHeight);
    camera.position.copy(toThree(start)).add(followOffset);
    let lastTarget = controls.target.clone();
    let lastTrailLength = -1;
    let wasOverview = false;

    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      const snap = store.get();
      const s = snap.state;
      const p = toThree(s.pos);
      lander.position.copy(p);
      const ground = terrain.heightAt(s.pos[0], s.pos[1]);
      dropGeo.setFromPoints([p.clone().add(new THREE.Vector3(0, 0.1, 0)), toThree([s.pos[0], s.pos[1], Number.isFinite(ground) ? ground : s.pos[2]])]);
      drop.computeLineDistances();
      // Beacon grows with camera distance so the lander stays visible in the overview.
      const dist = camera.position.distanceTo(p);
      beacon.visible = dist > 400;
      beacon.position.copy(p).add(new THREE.Vector3(0, 4, 0));
      beacon.scale.setScalar(dist / 120);
      const dir = thrustDirection(s.tilt[0], s.tilt[1]);
      const up = new THREE.Vector3(dir[0], dir[2], -dir[1]).normalize();
      tiltGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      // Plume length follows the applied throttle; the flicker is cosmetic and never touches the simulation.
      const len = s.thrustN > 0 ? (1 + 6 * s.throttle) * plumeScale : 0;
      const flicker = 0.9 + 0.1 * Math.sin(performance.now() / 23) * Math.sin(performance.now() / 61);
      for (const [m, widen] of [[core, 1], [glow, 1.15]] as const) {
        m.visible = len > 0;
        m.scale.set(widen * flicker, len * flicker * widen, widen * flicker);
        m.position.y = -(len * flicker * widen) / 2;
      }
      engineLight.intensity = len > 0 ? (6 + 30 * s.throttle * flicker) * plumeScale : 0;
      plumeDust.update(snap);
      void vehicle;
      if (snap.trail.length !== lastTrailLength) {
        trailGeo.setFromPoints(snap.trail.map(toThree));
        lastTrailLength = snap.trail.length;
      }
      // Follow the lander while preserving the user's orbit offset (free camera stays usable).
      if (overviewRef.current !== wasOverview) {
        wasOverview = overviewRef.current;
        if (wasOverview) { controls.target.set(0, p.y * 0.3, 0); camera.position.set(-1600, 1400, 1800); }
        else { controls.target.copy(p).add(lookHeight); camera.position.copy(p).add(followOffset); }
        lastTarget = controls.target.clone();
      } else if (!wasOverview) {
        const delta = p.clone().add(lookHeight).sub(lastTarget);
        controls.target.add(delta);
        camera.position.add(delta);
        lastTarget = controls.target.clone();
      }
      controls.update();
      renderer.render(scene, camera);
    };
    render();
    return () => {
      plumeDust.dispose();
      cancelledLoad = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      disposables.forEach((d) => d.dispose());
      if (holder) { holder.remove(terrainModel!); scene.remove(holder); }
      el.removeChild(renderer.domElement);
    };
  }, [terrain, store, exaggeration, targetRadiusM, padRadiusM, landerScale, terrainModel, vehicleModelUrl, onVehicleStatus]);
  return <div ref={host} className="sim-scene" aria-label="3D view of the simulated descent. Drag to orbit, scroll to zoom." role="img" />;
}

