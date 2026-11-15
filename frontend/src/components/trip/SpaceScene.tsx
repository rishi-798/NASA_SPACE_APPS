import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { LandingPoint } from "../../lib/missionState";
import type { LaunchSite } from "../../data/tripCatalogue";
import type { CelestialPosition, VisibilityResponse, VisibilitySample } from "../../types";

const MOON_RADIUS_KM = 1737.4;
const SUN_RADIUS_KM = 695700;
const EARTH_MOON_VIEW_DISTANCE = 8.5;
const SUN_VIEW_DISTANCE = 42;
const SUN_ANGULAR_RADIUS = Math.asin(SUN_RADIUS_KM / 149_598_262);

function disposeObjects(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => { if (value instanceof THREE.Texture) value.dispose(); });
      material.dispose();
    });
  });
}

/** Convert east-positive lunar coordinates into the Moon ME frame used by the map. */
function globePoint(lat: number, lon: number, radius: number) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
  return new THREE.Vector3(radius * Math.cos(p) * Math.cos(l), radius * Math.sin(p), -radius * Math.cos(p) * Math.sin(l));
}

function bodyDirection(body: CelestialPosition | undefined, landing?: LandingPoint) {
  const fixed = body?.moon_fixed_position_km;
  if (fixed?.length === 3 && fixed.every(Number.isFinite)) {
    // SPICE MOON_ME is Z-up; the map's Three.js scene is Y-up with east toward -Z.
    return new THREE.Vector3(fixed[0], fixed[2], -fixed[1]).normalize();
  }
  const azimuth = (body?.azimuth ?? 0) * Math.PI / 180;
  const elevation = (body?.elevation ?? 20) * Math.PI / 180;
  const lat = (landing?.latitude ?? 0) * Math.PI / 180;
  const lon = (landing?.longitude ?? 0) * Math.PI / 180;
  const east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon));
  const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon));
  const up = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
  // SPICE local azimuth is clockwise from north; its Y component becomes Three.js Z.
  const local = up.multiplyScalar(Math.sin(elevation))
    .addScaledVector(north, Math.cos(elevation) * Math.cos(azimuth))
    .addScaledVector(east, Math.cos(elevation) * Math.sin(azimuth));
  return local.normalize();
}

function fitToRadius(root: THREE.Object3D, targetRadius: number) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const factor = targetRadius / Math.max(sphere.radius, 1e-5);
  root.scale.multiplyScalar(factor);
  root.position.addScaledVector(sphere.center, -factor);
}

function createAtmosphere(radius: number) {
  const geometry = new THREE.SphereGeometry(radius, 64, 48);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { glowColor: { value: new THREE.Color(0x439bff) } },
    vertexShader: `varying vec3 vNormal; varying vec3 vViewPosition;
      void main() { vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal); vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition; }`,
    fragmentShader: `uniform vec3 glowColor; varying vec3 vNormal; varying vec3 vViewPosition;
      void main() { float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0), 3.0);
      gl_FragColor = vec4(glowColor, rim * 0.8); }`,
  });
  const atmosphere = new THREE.Mesh(geometry, material);
  atmosphere.renderOrder = 2;
  atmosphere.userData.isDecoration = true;
  return atmosphere;
}

function createStarPoints() {
  let seed = 0x3a5f219;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const positions: number[] = [];
  const colors: number[] = [];
  for (let index = 0; index < 1150; index += 1) {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(Math.max(0, 1 - z * z));
    const radius = 92 + random() * 62;
    positions.push(radius * ring * Math.cos(angle), radius * z, radius * ring * Math.sin(angle));
    const temperature = random();
    const color = new THREE.Color().setHSL(0.58 + temperature * 0.12, 0.18 + random() * 0.2, 0.65 + random() * 0.32);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 1.05, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  stars.frustumCulled = false;
  return stars;
}

function createSunGlow() {
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,244,210,0.78)");
    gradient.addColorStop(0.16, "rgba(255,197,122,0.30)");
    gradient.addColorStop(0.48, "rgba(255,132,62,0.08)");
    gradient.addColorStop(1, "rgba(255,112,45,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false,
  }));
  glow.scale.set(3.0, 3.0, 1);
  glow.userData.isDecoration = true;
  return glow;
}

function makePin(color: number, radius = 0.075) {
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.32 });
  const pin = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), material);
  pin.castShadow = true;
  return pin;
}

function setSpacecraftOpacity(root: THREE.Object3D, alpha: number) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material.userData.baseOpacity === undefined) {
          material.userData.baseOpacity = material.opacity ?? 1.0;
        }
        material.transparent = true;
        material.opacity = (material.userData.baseOpacity as number) * alpha;
      });
    }
  });
}

function createExhaustWake() {
  const count = 40;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const history: { pos: THREE.Vector3; age: number; maxAge: number }[] = [];

  for (let i = 0; i < count * 3; i++) {
    positions[i] = 9999;
    colors[i] = 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2.8,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "Translunar Exhaust Wake";
  points.frustumCulled = false;

  return {
    points,
    update: (emitterPos: THREE.Vector3 | null, delta: number, firing: boolean) => {
      // Age existing particles
      for (let i = history.length - 1; i >= 0; i--) {
        history[i]!.age += delta;
        if (history[i]!.age >= history[i]!.maxAge) {
          history.splice(i, 1);
        }
      }

      // Spawn new particle if firing
      if (emitterPos && firing) {
        history.unshift({
          pos: emitterPos.clone(),
          age: 0,
          maxAge: 0.55,
        });
        if (history.length > count) history.pop();
      }

      // Update GPU buffers
      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      const colAttr = geometry.attributes.color as THREE.BufferAttribute;
      const pArr = posAttr.array as Float32Array;
      const cArr = colAttr.array as Float32Array;

      for (let i = 0; i < count; i++) {
        if (i < history.length) {
          const item = history[i]!;
          const life = Math.max(0, 1.0 - item.age / item.maxAge);
          pArr[i * 3] = item.pos.x;
          pArr[i * 3 + 1] = item.pos.y;
          pArr[i * 3 + 2] = item.pos.z;

          // Electric cyan-blue to glowing warm white
          const intensity = Math.pow(life, 1.3);
          cArr[i * 3] = (0.28 + 0.72 * life) * intensity;
          cArr[i * 3 + 1] = (0.78 + 0.22 * life) * intensity;
          cArr[i * 3 + 2] = 0.98 * intensity;
        } else {
          pArr[i * 3] = 9999;
          pArr[i * 3 + 1] = 9999;
          pArr[i * 3 + 2] = 9999;
          cArr[i * 3] = 0;
          cArr[i * 3 + 1] = 0;
          cArr[i * 3 + 2] = 0;
        }
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    },
    clear: () => {
      history.length = 0;
      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      (posAttr.array as Float32Array).fill(9999);
      posAttr.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createSpacecraftMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = "Translunar Crew Vehicle";

  // Command Module (Capsule cone pointing along +Y)
  const cmGeo = new THREE.ConeGeometry(0.075, 0.14, 20);
  const cmMat = new THREE.MeshStandardMaterial({
    color: 0xf3f4f6,
    metalness: 0.35,
    roughness: 0.28,
    emissive: 0x0a101d,
    emissiveIntensity: 0.2,
    transparent: true,
  });
  const cm = new THREE.Mesh(cmGeo, cmMat);
  cm.position.set(0, 0.10, 0);
  cm.castShadow = true;
  root.add(cm);

  // Heat Shield
  const shieldGeo = new THREE.CylinderGeometry(0.075, 0.076, 0.02, 20);
  const shieldMat = new THREE.MeshStandardMaterial({ color: 0x27201c, metalness: 0.7, roughness: 0.4, transparent: true });
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  shield.position.set(0, 0.02, 0);
  root.add(shield);

  // Service Module Cylinder
  const smGeo = new THREE.CylinderGeometry(0.072, 0.072, 0.13, 20);
  const smMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.45, roughness: 0.32, transparent: true });
  const sm = new THREE.Mesh(smGeo, smMat);
  sm.position.set(0, -0.055, 0);
  sm.castShadow = true;
  root.add(sm);

  // 4 Solar Array Wings (Orion X-wing geometry)
  const wingGeo = new THREE.BoxGeometry(0.24, 0.005, 0.055);
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x0f294a,
    emissive: 0x051326,
    metalness: 0.85,
    roughness: 0.2,
    transparent: true,
  });
  const wingAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  wingAngles.forEach((angle) => {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(Math.cos(angle) * 0.15, -0.06, Math.sin(angle) * 0.15);
    wing.rotation.y = -angle;
    wing.castShadow = true;
    root.add(wing);
  });

  // Main Engine Bell
  const bellGeo = new THREE.CylinderGeometry(0.018, 0.042, 0.045, 16);
  const bellMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.9, roughness: 0.25, transparent: true });
  const bell = new THREE.Mesh(bellGeo, bellMat);
  bell.position.set(0, -0.14, 0);
  root.add(bell);

  // Thrust Flame Plume Group (pointing backward along -Y)
  const flameGroup = new THREE.Group();
  flameGroup.position.set(0, -0.16, 0);

  // Outer plume (cyan ion / hypergolic glow)
  const outerPlumeGeo = new THREE.ConeGeometry(0.046, 0.22, 16);
  outerPlumeGeo.rotateZ(Math.PI);
  outerPlumeGeo.translate(0, -0.11, 0);
  const outerPlumeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const outerPlume = new THREE.Mesh(outerPlumeGeo, outerPlumeMat);
  flameGroup.add(outerPlume);

  // Inner core flame (hot orange-white core)
  const innerPlumeGeo = new THREE.ConeGeometry(0.022, 0.14, 14);
  innerPlumeGeo.rotateZ(Math.PI);
  innerPlumeGeo.translate(0, -0.07, 0);
  const innerPlumeMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const innerPlume = new THREE.Mesh(innerPlumeGeo, innerPlumeMat);
  flameGroup.add(innerPlume);

  root.add(flameGroup);
  root.userData.flame = flameGroup;

  root.scale.setScalar(0.9);
  return root;
}

function nearestSampleIndex(samples: VisibilitySample[] | undefined, time?: string) {
  if (!samples?.length || !time) return 0;
  const target = Date.parse(time);
  return samples.reduce((best, sample, index) =>
    Math.abs(Date.parse(sample.time) - target) < Math.abs(Date.parse(samples[best]!.time) - target) ? index : best, 0);
}

function formatDistance(distanceKm?: number, body: "sun" | "earth" = "sun") {
  if (distanceKm && Number.isFinite(distanceKm)) {
    return body === "sun" ? `${(distanceKm / 1_000_000).toFixed(1)} million km` : `${Math.round(distanceKm / 100) * 100} km`;
  }
  return body === "sun" ? "about 1 AU" : "about 384,400 km";
}

export function SpaceScene({
  modelUrl, modelName, modelCredit, landing, departure, conditions, samples, utcTime,
}: {
  modelUrl?: string;
  modelName?: string;
  modelCredit?: string;
  landing?: LandingPoint;
  departure?: LaunchSite;
  conditions?: VisibilityResponse;
  samples?: VisibilitySample[];
  utcTime?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sampleIndexRef = useRef(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [sampleIndex, setSampleIndex] = useState(() => nearestSampleIndex(samples, conditions?.time ?? utcTime));
  const [playing, setPlaying] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const currentSample = samples?.[sampleIndex] ?? conditions;
  const currentTime = currentSample?.time ?? utcTime ?? "";

  useEffect(() => {
    const next = nearestSampleIndex(samples, conditions?.time ?? utcTime);
    sampleIndexRef.current = next;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSampleIndex(next);
  }, [conditions?.time, samples, utcTime]);

  useEffect(() => {
    sampleIndexRef.current = sampleIndex;
  }, [sampleIndex]);

  useEffect(() => {
    if (!playing || !samples || samples.length < 2) return;
    const timer = window.setInterval(() => {
      setSampleIndex((index) => (index + 1) % samples.length);
    }, 1100);
    return () => window.clearInterval(timer);
  }, [playing, samples]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      // A missing WebGL context is an external browser capability, not app state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020307);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.045;
    controls.minDistance = modelUrl ? 4 : 4.2;
    controls.maxDistance = modelUrl ? 20 : 18;
    controls.autoRotate = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    let resourceCount = 0;
    const markResourceReady = () => {
      resourceCount += 1;
      if (!disposed && resourceCount >= (modelUrl ? 1 : 4)) setReady(true);
    };
    const markResourceFailed = () => {
      if (!disposed) setFailed(true);
      markResourceReady();
    };

    let transferPath: THREE.CubicBezierCurve3 | undefined;
    let transferLine: THREE.Line | undefined;
    let vehicle: THREE.Object3D | undefined;
    let sunVisualPosition: THREE.Vector3 | undefined;
    const moonCenter = new THREE.Vector3(0, 0, 0);
    const moonRadius = 0.72;
    const earthRadius = moonRadius * 6371 / MOON_RADIUS_KM;
    const selectedSample = () => samples?.[sampleIndexRef.current] ?? conditions;
    const currentSun = () => selectedSample()?.sun;
    const currentEarth = () => selectedSample()?.earth;
    const getSunDirection = () => bodyDirection(currentSun(), landing);
    const getEarthDirection = () => bodyDirection(currentEarth(), landing);

    if (modelUrl) {
      scene.add(createStarPoints());

      // Aerospace studio 3-point lighting
      scene.add(new THREE.HemisphereLight(0xd9e5f5, 0x30343e, 1.2));
      const keyLight = new THREE.DirectionalLight(0xfffaee, 2.4);
      keyLight.position.set(-6, 9, 7);
      keyLight.castShadow = true;
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xd7e5fa, 1.1);
      fillLight.position.set(7, 3, -4);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xf4f4ff, 1.5);
      rimLight.position.set(2, -4, -8);
      scene.add(rimLight);

      // Launch Platform / Holographic Staging Pedestal
      const ringGeo = new THREE.RingGeometry(1.6, 1.75, 64);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
      const stagingRing = new THREE.Mesh(ringGeo, ringMat);
      stagingRing.position.set(0, -3.5, 0);
      scene.add(stagingRing);

      const gridHelper = new THREE.GridHelper(8, 16, 0x1e3a5f, 0x0c1524);
      gridHelper.position.set(0, -3.51, 0);
      scene.add(gridHelper);

      camera.position.set(6.5, 2.2, 9.5);
      controls.minDistance = 4;
      controls.maxDistance = 20;
      controls.autoRotate = !reduceMotion;
      controls.autoRotateSpeed = 1.0;
      controls.enableDamping = true;
      controls.dampingFactor = 0.045;

      const decoder = new DRACOLoader().setDecoderPath("/draco/");
      new GLTFLoader().setDRACOLoader(decoder).load(modelUrl, (asset) => {
        if (disposed) { disposeObjects(asset.scene); return; }
        const model = asset.scene;
        if (/\/ares-i-[ab]\.glb$/.test(modelUrl)) {
          // These NASA exports contain four duplicate meshes outside the rotated rocket root.
          // They distort the bounds and push the actual vehicle out of the frame.
          for (const child of [...model.children]) {
            if (child instanceof THREE.Mesh) model.remove(child);
          }
        }
        let bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        if (size.z > size.y && size.z > size.x) model.rotateX(-Math.PI / 2);
        else if (size.x > size.y) model.rotateZ(Math.PI / 2);
        bounds = new THREE.Box3().setFromObject(model);
        model.scale.setScalar(7 / bounds.getSize(new THREE.Vector3()).y);
        bounds = new THREE.Box3().setFromObject(model);
        model.position.sub(bounds.getCenter(new THREE.Vector3()));
        model.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        scene.add(model);
        markResourceReady();
      }, undefined, markResourceFailed);
      const resize = new ResizeObserver(() => {
        if (!host.clientWidth || !host.clientHeight) return;
        renderer.setSize(host.clientWidth, host.clientHeight);
        camera.aspect = host.clientWidth / host.clientHeight;
        camera.updateProjectionMatrix();
      });
      resize.observe(host);
      renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
      return () => { disposed = true; resize.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); decoder.dispose(); disposeObjects(scene); renderer.dispose(); renderer.domElement.remove(); };
    }

    // A camera-enclosing NASA star map plus two sparse depth layers gives the sky genuine parallax.
    const starTextureLoader = new THREE.TextureLoader();
    starTextureLoader.load("/deep-star-map-4k.jpg", (texture) => {
      if (disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 96, 64), new THREE.MeshBasicMaterial({
        map: texture, side: THREE.BackSide, depthWrite: false, toneMapped: false,
      }));
      sky.renderOrder = -10;
      sky.frustumCulled = false;
      scene.add(sky);
      markResourceReady();
    }, undefined, markResourceFailed);
    scene.add(createStarPoints());

    const ambient = new THREE.HemisphereLight(0x61748e, 0x06070b, 0.075);
    scene.add(ambient);
    const sunLightData = new THREE.DirectionalLight(0xfff3df, 3.8);
    sunLightData.castShadow = true;
    sunLightData.shadow.mapSize.set(2048, 2048);
    sunLightData.shadow.camera.left = -45;
    sunLightData.shadow.camera.right = 45;
    sunLightData.shadow.camera.top = 45;
    sunLightData.shadow.camera.bottom = -45;
    sunLightData.shadow.camera.near = 0.1;
    sunLightData.shadow.camera.far = 260;
    sunLightData.shadow.bias = -0.00025;
    sunLightData.shadow.normalBias = 0.025;
    sunLightData.shadow.radius = 2;
    const directionalSun = sunLightData;
    scene.add(sunLightData);
    scene.add(sunLightData.target);

    const moonMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.0 });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(moonRadius, 128, 96), moonMaterial);
    moon.name = "NASA LROC lunar color globe";
    moon.userData.physicalRadiusKm = MOON_RADIUS_KM;
    moon.castShadow = true;
    moon.receiveShadow = true;
    scene.add(moon);
    const moonPin = makePin(0xff9b63, 0.052);
    moonPin.position.copy(globePoint(landing?.latitude ?? 0, landing?.longitude ?? 0, moonRadius + 0.025));
    moon.add(moonPin);
    const loader = new THREE.TextureLoader();
    loader.load("/moon-lroc-2k.jpg", (texture) => {
      if (disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      moonMaterial.map = texture;
      moonMaterial.needsUpdate = true;
      markResourceReady();
    }, undefined, () => { markResourceFailed(); });

    const initialSunDirection = getSunDirection();
    const initialEarthDirection = getEarthDirection();
    const earthCenter = initialEarthDirection.clone().multiplyScalar(EARTH_MOON_VIEW_DISTANCE);
    sunVisualPosition = initialSunDirection.clone().multiplyScalar(SUN_VIEW_DISTANCE);
    const targetEarthCenter = earthCenter.clone();
    const currentEarthCenter = earthCenter.clone();
    const targetSunDirection = initialSunDirection.clone();
    const currentSunDirection = initialSunDirection.clone();
    const earthSpin = (time: string) => {
      const date = new Date(time);
      if (!Number.isFinite(date.getTime())) return 0;
      const dayFraction = (date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds()) / 86400;
      return dayFraction * Math.PI * 2;
    };
    let currentEarthRotation = earthSpin(utcTime ?? "");
    let targetEarthRotation = currentEarthRotation;

    let viewNormal = initialEarthDirection.clone().cross(initialSunDirection).normalize();
    if (viewNormal.lengthSq() < 0.1) viewNormal = initialSunDirection.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    if (viewNormal.lengthSq() < 0.1) viewNormal.set(0, 0, 1);

    const departurePoint = departure
      ? globePoint(departure.latitude, departure.longitude, earthRadius + 0.08)
      : undefined;
    const landingPoint = landing
      ? globePoint(landing.latitude, landing.longitude, moonRadius + 0.09)
      : undefined;
    const makeTransferPath = (sourceEarthCenter: THREE.Vector3) => {
      if (!departurePoint || !landingPoint) return undefined;
      const from = sourceEarthCenter.clone().add(departurePoint);
      const to = moonCenter.clone().add(landingPoint);
      const chord = to.clone().sub(from);
      const chordLen = chord.length();
      let transferPlaneNormal = chord.clone().cross(viewNormal).normalize();
      if (transferPlaneNormal.lengthSq() < 0.1) transferPlaneNormal.set(0, 1, 0);
      const arcHeight = chordLen * 0.14;
      const controlA = from.clone().lerp(to, 0.32).addScaledVector(transferPlaneNormal, arcHeight);
      const controlB = from.clone().lerp(to, 0.68).addScaledVector(transferPlaneNormal, arcHeight * 0.85);
      return new THREE.CubicBezierCurve3(from, controlA, controlB, to);
    };
    transferPath = makeTransferPath(earthCenter);
    const initialTarget = transferPath?.getPoint(0.5)
      ?? earthCenter.clone().lerp(moonCenter, 0.5);
    // Frame both endpoints while keeping the camera on the transfer route's midpoint.
    // Fit the horizontal Earth-to-Moon span so Earth reads as the hero without
    // pushing the Moon offscreen; on narrow screens, move back only as needed.
    const viewAspect = host.clientWidth / Math.max(host.clientHeight, 1);
    const horizontalFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * viewAspect);
    const endpointSpan = EARTH_MOON_VIEW_DISTANCE + earthRadius + moonRadius;
    const initialViewDistance = THREE.MathUtils.clamp(endpointSpan / (2 * Math.tan(horizontalFov / 2)) * 1.08, 9.2, 17.5);
    controls.maxDistance = Math.min(18, initialViewDistance * 1.45);
    camera.position.copy(initialTarget).addScaledVector(viewNormal, initialViewDistance);
    camera.lookAt(initialTarget);
    controls.target.copy(initialTarget);

    const earthGroup = new THREE.Group();
    earthGroup.name = "NASA Earth with clouds";
    earthGroup.position.copy(earthCenter);
    scene.add(earthGroup);
    const earthAtmosphere = createAtmosphere(earthRadius * 1.025);
    earthGroup.add(earthAtmosphere);

    const departurePin = makePin(0xff8955, 0.058);
    departurePin.position.copy(globePoint(departure?.latitude ?? 0, departure?.longitude ?? 0, earthRadius + 0.03));
    earthGroup.add(departurePin);
    new GLTFLoader().load("/nasa-earth-clouds.glb", (asset) => {
      if (disposed) { disposeObjects(asset.scene); return; }
      fitToRadius(asset.scene, earthRadius);
      asset.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => { if (material instanceof THREE.MeshStandardMaterial) material.envMapIntensity = 0.35; });
      });
      earthGroup?.add(asset.scene);
      markResourceReady();
    }, undefined, () => {
      if (disposed) return;
      const fallback = new THREE.Mesh(new THREE.SphereGeometry(earthRadius, 96, 64), new THREE.MeshStandardMaterial({ color: 0x527e9f, roughness: 0.86 }));
      fallback.castShadow = true; fallback.receiveShadow = true;
      earthGroup?.add(fallback);
      markResourceFailed();
    });

    const sunRoot = new THREE.Group();
    sunRoot.name = "Visible Sun - true apparent diameter";
    sunVisualPosition = initialSunDirection.clone().multiplyScalar(SUN_VIEW_DISTANCE);
    sunRoot.position.copy(sunVisualPosition);
    scene.add(sunRoot);
    scene.add(createSunGlow());
    const sunGlow = scene.children[scene.children.length - 1] as THREE.Sprite;
    sunGlow.position.copy(sunVisualPosition);
    sunGlow.scale.set(3.2, 3.2, 1);
    new GLTFLoader().load("/nasa-sun.glb", (asset) => {
      if (disposed) { disposeObjects(asset.scene); return; }
      fitToRadius(asset.scene, 1);
      asset.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = false; object.receiveShadow = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissive = new THREE.Color(0xffbc74);
            material.emissiveIntensity = 1.5;
          }
        });
      });
      sunRoot.add(asset.scene);
      markResourceReady();
    }, undefined, () => {
      if (disposed) return;
      const fallback = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffd18e, toneMapped: false }));
      sunRoot.add(fallback);
      markResourceFailed();
    });

    const wake = createExhaustWake();
    scene.add(wake.points);

    if (transferPath) {
      const pathGeometry = new THREE.BufferGeometry().setFromPoints(transferPath.getPoints(160));
      transferLine = new THREE.Line(pathGeometry, new THREE.LineDashedMaterial({ color: 0xffa06f, dashSize: 0.12, gapSize: 0.11, transparent: true, opacity: 0.8 }));
      transferLine.computeLineDistances();
      transferLine.renderOrder = 1;
      scene.add(transferLine);
      vehicle = createSpacecraftMesh();
      scene.add(vehicle);
    }

    const decoder = new DRACOLoader().setDecoderPath("/draco/");
    let lastRenderedSample = -1;
    const applyEphemeris = () => {
      const index = sampleIndexRef.current;
      if (index === lastRenderedSample) return;
      lastRenderedSample = index;
      const sample = selectedSample();
      if (!sample) return;
      const sunDirection = bodyDirection(sample.sun, landing);
      const earthDirection = bodyDirection(sample.earth, landing);
      targetEarthCenter.copy(earthDirection.multiplyScalar(EARTH_MOON_VIEW_DISTANCE));
      targetEarthRotation = earthSpin(sample.time);
      targetSunDirection.copy(sunDirection);
      const rangeKm = sample.sun.distance_km;
      const angularRadius = rangeKm && rangeKm > SUN_RADIUS_KM ? Math.asin(SUN_RADIUS_KM / rangeKm) : SUN_ANGULAR_RADIUS;
      sunRoot.scale.setScalar(SUN_VIEW_DISTANCE * Math.tan(angularRadius));
      if (directionalSun) {
        directionalSun.userData.sourceDistanceKm = sample.sun.distance_km ?? null;
        directionalSun.userData.meanDistanceNote = "The Sun is about 1 AU from the Moon; collimated light avoids a false nearby point source.";
      }
    };

    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    });
    resize.observe(host);

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      applyEphemeris();
      controls.update();

      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      // Fluid exponential damping for astronomical coordinate updates (smooth 60/120fps)
      const smoothFactor = Math.min(1.0, 1.0 - Math.exp(-4.2 * delta));
      currentEarthCenter.lerp(targetEarthCenter, smoothFactor);
      currentSunDirection.lerp(targetSunDirection, smoothFactor).normalize();

      // Smooth Earth spin without discrete 7.5-degree jumps
      let rotDiff = targetEarthRotation - currentEarthRotation;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      currentEarthRotation += rotDiff * smoothFactor;

      if (earthGroup) {
        earthGroup.position.copy(currentEarthCenter);
        earthGroup.rotation.set(0, currentEarthRotation, 0);
      }

      const sunPos = currentSunDirection.clone().multiplyScalar(SUN_VIEW_DISTANCE);
      sunRoot.position.copy(sunPos);
      sunGlow.position.copy(sunPos);
      if (directionalSun) {
        directionalSun.position.copy(currentSunDirection.clone().multiplyScalar(180));
        directionalSun.target.position.copy(moonCenter);
        directionalSun.target.updateMatrixWorld();
      }

      // Smooth continuous transfer path update
      if (transferLine && departurePoint && landingPoint) {
        const nextPath = makeTransferPath(currentEarthCenter);
        if (nextPath) {
          transferPath = nextPath;
          const pts = transferPath.getPoints(160);
          const posAttr = transferLine.geometry.attributes.position as THREE.BufferAttribute;
          const posArr = posAttr.array as Float32Array;
          for (let i = 0; i < pts.length; i++) {
            posArr[i * 3] = pts[i]!.x;
            posArr[i * 3 + 1] = pts[i]!.y;
            posArr[i * 3 + 2] = pts[i]!.z;
          }
          posAttr.needsUpdate = true;
          transferLine.computeLineDistances();
        }
      }

      // Smooth vehicle trajectory, orientation, thruster wake and looping
      if (vehicle && transferPath) {
        if (reduceMotion) {
          // In reduced motion, park spacecraft gracefully at destination
          const destPos = transferPath.getPoint(1.0);
          vehicle.position.copy(destPos);
          setSpacecraftOpacity(vehicle, 1.0);
          wake.update(null, delta, false);
        } else {
          const cycleDuration = 9.5;
          const cycleTime = elapsed % cycleDuration;
          const phase = cycleTime / cycleDuration; // 0.0 to 1.0

          let vehiclePos = new THREE.Vector3();
          let forwardTangent = new THREE.Vector3(0, 1, 0);
          let vehicleOpacity = 1.0;
          let isThrusting = true;
          let flameIntensity = 1.0;

          if (phase < 0.74) {
            // PHASE 1: Translunar Injection & Coast (Earth to Moon)
            const u = phase / 0.74; // 0 to 1
            // Smoothstep curve for authentic acceleration & deceleration
            const progress = u * u * (3.0 - 2.0 * u);
            vehiclePos = transferPath.getPoint(progress);

            const tTang = Math.min(0.999, Math.max(0.001, progress));
            forwardTangent = transferPath.getTangent(tTang).normalize();

            // Silky fade-in when departing Earth
            vehicleOpacity = u < 0.08 ? (u / 0.08) : 1.0;

            // Full thrust during TLI, cruising pulse midcourse
            flameIntensity = u < 0.25 ? 1.0 : 0.85;
            isThrusting = true;
          } else if (phase < 0.90) {
            // PHASE 2: Lunar Orbital Insertion & Capture Arc
            const v = (phase - 0.74) / (0.90 - 0.74); // 0 to 1
            const arrivalPoint = transferPath.getPoint(1.0);
            const arrivalDir = arrivalPoint.clone().normalize();
            let orbitNormal = arrivalDir.clone().cross(viewNormal).normalize();
            if (orbitNormal.lengthSq() < 0.1) orbitNormal = new THREE.Vector3(0, 1, 0);

            const orbitRadius = moonRadius + 0.14;
            const orbitAngle = v * Math.PI * 0.75;
            vehiclePos = arrivalDir.clone().multiplyScalar(Math.cos(orbitAngle))
              .addScaledVector(orbitNormal, Math.sin(orbitAngle))
              .multiplyScalar(orbitRadius);

            forwardTangent = arrivalDir.clone().multiplyScalar(-Math.sin(orbitAngle))
              .addScaledVector(orbitNormal, Math.cos(orbitAngle))
              .normalize();

            vehicleOpacity = 1.0;
            // Pulsing retro-burn for orbital deceleration
            flameIntensity = 0.5 + Math.sin(elapsed * 24.0) * 0.3;
            isThrusting = true;
          } else {
            // PHASE 3: Seamless Dissolve & Reset
            const w = (phase - 0.90) / (1.0 - 0.90); // 0 to 1
            const arrivalPoint = transferPath.getPoint(1.0);
            const arrivalDir = arrivalPoint.clone().normalize();
            let orbitNormal = arrivalDir.clone().cross(viewNormal).normalize();
            if (orbitNormal.lengthSq() < 0.1) orbitNormal = new THREE.Vector3(0, 1, 0);

            const orbitRadius = moonRadius + 0.14;
            const orbitAngle = (1.0 + w * 0.2) * Math.PI * 0.75;
            vehiclePos = arrivalDir.clone().multiplyScalar(Math.cos(orbitAngle))
              .addScaledVector(orbitNormal, Math.sin(orbitAngle))
              .multiplyScalar(orbitRadius);

            forwardTangent = arrivalDir.clone().multiplyScalar(-Math.sin(orbitAngle))
              .addScaledVector(orbitNormal, Math.cos(orbitAngle))
              .normalize();

            // Smoothly dissolve to zero before looping
            vehicleOpacity = Math.max(0.0, 1.0 - w);
            isThrusting = false;
            flameIntensity = 0.0;
          }

          vehicle.position.copy(vehiclePos);
          setSpacecraftOpacity(vehicle, vehicleOpacity);

          // Smooth orientation SLERP without angular jitter
          const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), forwardTangent);
          vehicle.quaternion.slerp(targetQuat, Math.min(1.0, delta * 14.0));

          // Dynamic thrust flame with high-frequency plasma flicker
          const flame = vehicle.userData.flame as THREE.Object3D | undefined;
          if (flame) {
            if (isThrusting && vehicleOpacity > 0.1) {
              const flicker = (1.0 + Math.sin(elapsed * 32.0) * 0.18 + Math.cos(elapsed * 48.0) * 0.12) * flameIntensity;
              flame.scale.set(flicker, (0.8 + flicker * 0.4) * flameIntensity, flicker);
            } else {
              flame.scale.set(0, 0, 0);
            }
          }

          // Emit and update ion exhaust wake particles
          const nozzlePos = vehicle.localToWorld(new THREE.Vector3(0, -0.16, 0));
          wake.update(nozzlePos, delta, isThrusting && vehicleOpacity > 0.2);
        }

        // Animate dashed trajectory line locked to elapsed delta time
        if (transferLine && transferLine.material instanceof THREE.LineDashedMaterial) {
          transferLine.material.dashOffset -= delta * 0.38;
        }
      }

      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      resize.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      decoder.dispose();
      wake.dispose();
      disposeObjects(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelUrl, modelName, modelCredit, landing, departure, conditions, samples, utcTime]);

  const selectedTime = currentTime ? `${new Date(currentTime).toISOString().slice(0, 16).replace("T", " ")} UTC` : "Time unavailable";
  const sunDistance = formatDistance(currentSample?.sun.distance_km, "sun");
  const earthDistance = formatDistance(currentSample?.earth.distance_km, "earth");

  return <div className={`trip-space-scene${modelUrl ? " trip-space-scene-model" : " trip-space-scene-mission"}`}>
    <div ref={hostRef} className="trip-space-canvas" aria-label={modelUrl
      ? `Interactive ${modelName ?? "NASA rocket"} model. Drag to orbit and scroll to zoom.`
      : "NASA-textured Earth and Moon in a deep star field. Sunlight and the Earth position update from the selected lunar ephemeris time."} />
    {failed && <p className="trip-scene-message" role="status">A space asset could not load. The mission view remains available where possible.</p>}
    {!ready && <p className="trip-scene-message" role="status">{modelUrl ? "Loading 3D model..." : "Loading NASA Earth, Moon and deep-space sky..."}</p>}
    {!modelUrl && <>
      <div className="trip-overview-labels"><span>EARTH / {departure?.pad ?? "EARTH"}</span><span>MOON / {landing?.name ?? "SELECTED SITE"}</span></div>
      <div className="trip-space-data" aria-live="polite">
        <span><i className="trip-space-sun-dot" />SUN · {sunDistance}</span>
        <span>EARTH–MOON · {earthDistance}</span>
      </div>
      {samples && samples.length > 1 && <div className="trip-space-timeline">
        <button type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause lighting timeline" : "Play lighting timeline"}>
          {playing ? "Pause" : "Play day"}
        </button>
        <input type="range" min={0} max={samples.length - 1} step={1} value={sampleIndex}
          aria-label="Mission time. Scrub to move the Sun and Earth and update lunar shadows."
          onChange={(event) => setSampleIndex(Number(event.target.value))} />
        <output>{currentTime ? new Date(currentTime).toISOString().slice(11, 16) : "--:--"} UTC</output>
      </div>}
      <p className="trip-globe-hint">
        JPL SPICE updates the Sun, Earth and lunar shadows for {selectedTime}. The Sun is about 1 AU away; planet spacing is compressed so the whole mission fits this view. Drag to orbit, scroll to zoom.
      </p>
    </>}
    {modelUrl && <p className="trip-globe-hint">{modelCredit ?? "NASA"}. Drag to inspect.</p>}
  </div>;
}
