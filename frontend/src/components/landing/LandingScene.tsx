import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { thrustDirection, type Vec3 } from "../../sim/physics";
import type { SnapshotStore } from "../../sim/store";
import type { Terrain } from "../../sim/terrain";

type Props = { terrain: Terrain; store: SnapshotStore; exaggeration: number; targetRadiusM: number; padRadiusM: number; overview: boolean };

/**
 * Draws the simulation state from the shared snapshot. Simulation axes (x east, y north, z up) map to
 * three.js as (x, z·exaggeration, −y). The terrain mesh uses exactly the physics heights; exaggeration
 * (visual only) scales every z the same way, so the lander, trail and surface stay aligned.
 */
export function LandingScene({ terrain, store, exaggeration, targetRadiusM, padRadiusM, overview }: Props) {
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
    scene.background = new THREE.Color(0x05070a);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 20000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(-3000, 900, 1500);
    scene.add(sun);

    // Terrain mesh from the same grid the physics samples.
    const { count, spacingM, heights } = terrain.grid;
    const half = ((count - 1) * spacingM) / 2;
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [], colors: number[] = [], index: number[] = [];
    const finite = heights.flat().filter((v): v is number => typeof v === "number");
    const low = finite.length ? Math.min(...finite) : 0;
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) {
      const v = heights[r]![c];
      const ok = typeof v === "number";
      const p = toThree([-half + c * spacingM, -half + r * spacingM, ok ? v : low]);
      positions.push(p.x, p.y, p.z);
      if (ok) colors.push(0.55, 0.56, 0.58); else colors.push(0.75, 0.2, 0.2);   // missing data drawn red
    }
    for (let r = 0; r < count - 1; r++) for (let c = 0; c < count - 1; c++) {
      const a = r * count + c, b = a + 1, d = a + count, e = d + 1;
      index.push(a, b, d, b, e, d);   // counter-clockwise seen from above: faces point up
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x8ebfce, transparent: true, opacity: 0.08 }));
    scene.add(wire);

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

    // Lander: legs and pads stay level (as in the contact model); body + plume tilt to show thrust direction.
    const lander = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 0.3, roughness: 0.5 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a54a, metalness: 0.6, roughness: 0.4 });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12), metal);
      pad.position.set(dx * padRadiusM, 0.04, -dy * padRadiusM);
      lander.add(pad);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), metal);
      leg.position.set(dx * padRadiusM * 0.6, 0.9, -dy * padRadiusM * 0.6);
      leg.lookAt(new THREE.Vector3(0, 1.7, 0));
      leg.rotateX(Math.PI / 2);
      lander.add(leg);
    }
    const tiltGroup = new THREE.Group();
    tiltGroup.position.set(0, 1.7, 0);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.4, 16), gold);
    body.position.y = 0.4;
    tiltGroup.add(body);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
    plume.rotation.x = Math.PI;
    tiltGroup.add(plume);
    lander.add(tiltGroup);
    lander.scale.set(1, exaggeration, 1);
    scene.add(lander);

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
    controls.target.copy(toThree(start));
    camera.position.copy(toThree(start)).add(new THREE.Vector3(-45, 25, 55));
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
      const len = s.thrustN > 0 ? 0.8 + 5 * s.throttle : 0;
      plume.visible = len > 0;
      plume.scale.set(1, len, 1);
      plume.position.y = -0.3 - len / 2;
      if (snap.trail.length !== lastTrailLength) {
        trailGeo.setFromPoints(snap.trail.map(toThree));
        lastTrailLength = snap.trail.length;
      }
      // Follow the lander while preserving the user's orbit offset (free camera stays usable).
      if (overviewRef.current !== wasOverview) {
        wasOverview = overviewRef.current;
        if (wasOverview) { controls.target.set(0, p.y * 0.3, 0); camera.position.set(-1600, 1400, 1800); }
        else { controls.target.copy(p); camera.position.copy(p).add(new THREE.Vector3(-45, 25, 55)); }
        lastTarget = controls.target.clone();
      } else if (!wasOverview) {
        const delta = p.clone().sub(lastTarget);
        controls.target.add(delta);
        camera.position.add(delta);
        lastTarget = controls.target.clone();
      }
      controls.update();
      renderer.render(scene, camera);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      geometry.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [terrain, store, exaggeration, targetRadiusM, padRadiusM]);
  return <div ref={host} className="sim-scene" aria-label="3D view of the simulated descent. Drag to orbit, scroll to zoom." role="img" />;
}
