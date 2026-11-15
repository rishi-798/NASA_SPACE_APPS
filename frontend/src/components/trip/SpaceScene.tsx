import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { LandingPoint } from "../../lib/missionState";
import type { LaunchSite } from "../../data/tripCatalogue";

function disposeObjects(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => { if (value instanceof THREE.Texture) value.dispose(); });
      material.dispose();
    });
  });
}
function globePoint(lat: number, lon: number, radius: number) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
  return new THREE.Vector3(radius * Math.cos(p) * Math.cos(l), radius * Math.sin(p), -radius * Math.cos(p) * Math.sin(l));
}

export function SpaceScene({ modelUrl, modelName, modelCredit, landing, departure }: { modelUrl?: string; modelName?: string; modelCredit?: string; landing?: LandingPoint; departure?: LaunchSite }) {
  const root = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch {
      // External renderer status.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true); return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    host.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, .01, 100);
    camera.position.set(modelUrl ? 6 : 1, modelUrl ? 2 : 5, modelUrl ? 9 : 18);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = modelUrl ? 4 : 10;
    controls.maxDistance = modelUrl ? 20 : 35;
    scene.add(new THREE.HemisphereLight(0xdceaff, 0x242323, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(-5, 8, 6); scene.add(light);
    let disposed = false;
    let path: THREE.CubicBezierCurve3 | undefined;
    const decoder = new DRACOLoader().setDecoderPath("/draco/");
    let vehicle: THREE.Mesh | undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pullback = !modelUrl && !reduce;
    controls.addEventListener("start", () => { pullback = false; });
    if (pullback) { camera.position.set(4.7, 1.8, 4); controls.target.set(4.7, 0, 0); }
    if (modelUrl) {
      new GLTFLoader().setDRACOLoader(decoder).load(modelUrl, (asset) => {
        if (disposed) { disposeObjects(asset.scene); return; }
        const model = asset.scene;
        let bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        if (size.z > size.y && size.z > size.x) model.rotateX(-Math.PI / 2);
        else if (size.x > size.y) model.rotateZ(Math.PI / 2);
        bounds = new THREE.Box3().setFromObject(model);
        model.scale.setScalar(7 / bounds.getSize(new THREE.Vector3()).y);
        bounds = new THREE.Box3().setFromObject(model);
        model.position.sub(bounds.getCenter(new THREE.Vector3()));
        scene.add(model); setReady(true);
      }, undefined, () => { if (!disposed) setFailed(true); });
    } else if (landing && departure) {
      // Schematic composition, NOT a time-resolved astronomical frame or flight solution.
      const earthCenter = new THREE.Vector3(-4.7, 0, 0);
      const moonCenter = new THREE.Vector3(4.7, 0, 0);
      const earth = new THREE.Mesh(new THREE.SphereGeometry(1.9, 48, 32), new THREE.MeshStandardMaterial({ color: 0x386f92, roughness: .9 }));
      earth.position.copy(earthCenter); scene.add(earth);
      const moon = new THREE.Mesh(new THREE.SphereGeometry(.72, 48, 32), new THREE.MeshStandardMaterial({ color: 0xb8b7b3, roughness: 1 }));
      moon.position.copy(moonCenter); scene.add(moon);
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load("/moon-lroc-2k.jpg", (texture) => {
        if (disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        moon.material.map = texture; moon.material.needsUpdate = true;
      });
      const from = globePoint(departure.latitude, departure.longitude, 1.95).add(earthCenter);
      const to = globePoint(landing.latitude, landing.longitude, .77).add(moonCenter);
      [from, to].forEach((position) => {
        const pin = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff8b52 }));
        pin.position.copy(position); scene.add(pin);
      });
      path = new THREE.CubicBezierCurve3(from, new THREE.Vector3(-2, 4, 2), new THREE.Vector3(2, 3, 1), to);
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getPoints(160)), new THREE.LineBasicMaterial({ color: 0xff8b52 })));
      vehicle = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf5f4f0 }));
      scene.add(vehicle);
      setReady(true);
    }
    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix();
    });
    resize.observe(host);
    const started = performance.now();
    renderer.setAnimationLoop(() => {
      if (pullback) {
        const t = Math.min(1, (performance.now() - started) / 1800);
        const eased = 1 - (1 - t) ** 3;
        camera.position.lerpVectors(new THREE.Vector3(4.7, 1.8, 4), new THREE.Vector3(1, 5, 18), eased);
        controls.target.set(4.7 * (1 - eased), 0, 0);
        if (t === 1) pullback = false;
      }
      controls.update();
      if (vehicle && path) vehicle.position.copy(path.getPoint(Math.min(1, reduce ? 1 : (performance.now() - started) / 4000)));
      renderer.render(scene, camera);
    });
    return () => { disposed = true; resize.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); decoder.dispose(); disposeObjects(scene); renderer.dispose(); renderer.domElement.remove(); };
  }, [modelUrl, landing, departure]);
  return <div className="trip-space-scene"><div ref={root} className="trip-space-canvas" aria-label={modelUrl ? `Interactive ${modelName ?? "NASA rocket"} model. Drag to orbit and scroll to zoom.` : "Schematic Earth-Moon mission overview with selected departure and landing pins."} />
    {failed ? <p className="trip-scene-message" role="status">3D preview unavailable. Your mission choices remain usable.</p> : !ready && <p className="trip-scene-message" role="status">Loading NASA model...</p>}
    {!modelUrl && <div className="trip-overview-labels"><span>Earth / {departure?.pad}</span><span>Moon / {landing?.name}</span></div>}
    <p className="trip-globe-hint">{modelUrl ? `${modelCredit ?? "NASA"}. Drag to inspect.` : "Illustrative trajectory. Sizes, spacing and animation time are compressed; not a flight solution."}</p></div>;
}
