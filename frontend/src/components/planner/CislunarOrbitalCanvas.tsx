import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MissionPhase } from "./missionPhaseData";

interface CislunarOrbitalCanvasProps {
  activePhaseId: MissionPhase["id"];
  simMetSeconds: number;
  telemetry: {
    progress: number;
    altitudeKm: number;
    velocityKmS: number;
    deltaVMs: number;
    distEarthKm: number;
    distMoonKm: number;
  };
  cameraPreset: "system" | "earth" | "vehicle" | "moon";
  onCameraPresetChange: (preset: "system" | "earth" | "vehicle" | "moon") => void;
}

// Proportional Cislunar Coordinates (Framed to fit comfortably inside canvas)
const EARTH_POS = new THREE.Vector3(-3.2, 0, 0);
const EARTH_RADIUS = 1.15;
const PARKING_RADIUS = 1.38;

const MOON_POS = new THREE.Vector3(3.2, 0.22, 0);
const MOON_RADIUS = 0.32;
const LLO_RADIUS = 0.46;

const L1_POS = new THREE.Vector3(1.85, 0.1736, 0);

// Atmospheric Rim Glow Shader (Subtle Rayleigh Scattering)
function createAtmosphereMesh(radius: number) {
  const geometry = new THREE.SphereGeometry(radius, 64, 48);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      glowColor: { value: new THREE.Color(0x38bdf8) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0), 3.2);
        gl_FragColor = vec4(glowColor, rim * 0.65);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}

// Subtle Deep Space Starfield
function createStarfield() {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let seed = 0x82f109;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const u = rand();
    const v = rand();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = 40 + rand() * 30;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const color = new THREE.Color();
    const temp = rand();
    if (temp > 0.88) {
      color.setHSL(0.58, 0.40, 0.85); // Soft blue-white
    } else if (temp > 0.68) {
      color.setHSL(0.12, 0.35, 0.82); // Soft solar sand
    } else {
      color.setHSL(0.60, 0.10, 0.90); // Crisp pure white
    }

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.70,
  });

  return new THREE.Points(geometry, material);
}

// Elegant Detailed 3D Spacecraft (Properly Scaled)
function createSpacecraftMesh() {
  const shipGroup = new THREE.Group();

  // Command Module (silver aerodynamic capsule)
  const cmGeo = new THREE.ConeGeometry(0.05, 0.09, 16);
  const cmMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.85,
    roughness: 0.22,
  });
  const cmMesh = new THREE.Mesh(cmGeo, cmMat);
  cmMesh.position.y = 0.05;
  shipGroup.add(cmMesh);

  // Heat Shield Base Ring
  const shieldGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.012, 16);
  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.9,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.position.y = 0.005;
  shipGroup.add(shieldMesh);

  // Service Module (cylindrical avionics and propulsion bay)
  const smGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.10, 16);
  const smMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.5,
    roughness: 0.45,
  });
  const smMesh = new THREE.Mesh(smGeo, smMat);
  smMesh.position.y = -0.05;
  shipGroup.add(smMesh);

  // Solar Array Panels (Dark blue photovoltaic cells)
  const solarGroup = new THREE.Group();
  const panelGeo = new THREE.BoxGeometry(0.28, 0.006, 0.045);
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a,
    metalness: 0.75,
    roughness: 0.25,
  });

  const wingLeft = new THREE.Mesh(panelGeo, panelMat);
  wingLeft.position.set(-0.19, -0.05, 0);
  solarGroup.add(wingLeft);

  const wingRight = new THREE.Mesh(panelGeo, panelMat);
  wingRight.position.set(0.19, -0.05, 0);
  solarGroup.add(wingRight);

  shipGroup.add(solarGroup);

  // Engine Bell Nozzle
  const nozzleGeo = new THREE.ConeGeometry(0.03, 0.048, 12);
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    metalness: 0.92,
    roughness: 0.18,
  });
  const nozzleMesh = new THREE.Mesh(nozzleGeo, nozzleMat);
  nozzleMesh.position.y = -0.12;
  shipGroup.add(nozzleMesh);

  // Engine Exhaust Plume (Dynamic Flame Cone)
  const plumeGeo = new THREE.ConeGeometry(0.038, 0.22, 12);
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
  });
  const plumeMesh = new THREE.Mesh(plumeGeo, plumeMat);
  plumeMesh.rotation.x = Math.PI;
  plumeMesh.position.y = -0.22;
  plumeMesh.name = "enginePlume";
  plumeMesh.visible = false;
  shipGroup.add(plumeMesh);

  // Scaled cleanly relative to orbits
  shipGroup.scale.set(0.35, 0.35, 0.35);

  return shipGroup;
}

export function CislunarOrbitalCanvas({
  activePhaseId,
  telemetry,
  cameraPreset,
  onCameraPresetChange,
}: CislunarOrbitalCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const spacecraftRef = useRef<THREE.Group | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const cloudsMeshRef = useRef<THREE.Mesh | null>(null);
  const moonMeshRef = useRef<THREE.Mesh | null>(null);

  const targetCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 2.8, 9.2));
  const targetCamLookRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.05, 0));
  const isUserInteractingRef = useRef(false);

  const transferCurveRef = useRef<THREE.CatmullRomCurve3 | null>(null);

  // Initialize Scene & WebGL Context
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#05070a");
    sceneRef.current = scene;

    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 200);
    camera.position.set(0, 2.8, 9.2);
    cameraRef.current = camera;

    // 2. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 3. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.4;
    controls.maxDistance = 24.0;
    controls.target.set(0, 0.05, 0);
    controls.addEventListener("start", () => { isUserInteractingRef.current = true; });
    controls.addEventListener("end", () => {
      isUserInteractingRef.current = false;
      targetCamPosRef.current.copy(camera.position);
      targetCamLookRef.current.copy(controls.target);
    });
    controlsRef.current = controls;

    // 4. Directional Sun + Ambient Light
    const sunLight = new THREE.DirectionalLight(0xfffbf0, 2.8);
    sunLight.position.set(10, 12, 14);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x111827, 0.38);
    scene.add(ambientLight);

    // 5. Starfield Background
    const stars = createStarfield();
    scene.add(stars);

    // 6. Textures
    const textureLoader = new THREE.TextureLoader();

    // 7. Earth & Atmosphere
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 48);
    const earthMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.80,
      metalness: 0.08,
    });
    textureLoader.load(
      "/earth/2k-daymap.jpg",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        earthMat.map = texture;
        earthMat.color.set(0xffffff);
        earthMat.needsUpdate = true;
      },
      undefined,
      () => {
        earthMat.color.setHex(0x1d4ed8);
      }
    );
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthMesh.position.copy(EARTH_POS);
    earthMesh.rotation.z = THREE.MathUtils.degToRad(-23.4);
    scene.add(earthMesh);
    earthMeshRef.current = earthMesh;

    // Earth Clouds Layer
    const cloudsGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 64, 48);
    const cloudsMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
    });
    textureLoader.load("/earth/2k-clouds.jpg", (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      cloudsMat.map = tex;
      cloudsMat.needsUpdate = true;
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    cloudsMesh.position.copy(EARTH_POS);
    scene.add(cloudsMesh);
    cloudsMeshRef.current = cloudsMesh;

    // Atmospheric Rayleigh Scattering Glow
    const atmosphere = createAtmosphereMesh(EARTH_RADIUS * 1.055);
    atmosphere.position.copy(EARTH_POS);
    scene.add(atmosphere);

    // 8. Moon
    const moonGeo = new THREE.SphereGeometry(MOON_RADIUS, 48, 36);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.94,
    });
    textureLoader.load(
      "/moon-lroc-2k.jpg",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        moonMat.map = texture;
        moonMat.color.set(0xffffff);
        moonMat.needsUpdate = true;
      },
      undefined,
      () => {
        moonMat.color.setHex(0xcbd5e1);
      }
    );
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.copy(MOON_POS);
    scene.add(moonMesh);
    moonMeshRef.current = moonMesh;

    // 9. Trajectory Splines & Orbit Rings
    // Earth Parking Orbit Ring
    const parkingCurve = new THREE.EllipseCurve(
      EARTH_POS.x,
      EARTH_POS.y,
      PARKING_RADIUS,
      PARKING_RADIUS,
      0,
      2 * Math.PI,
      false,
      0
    );
    const parkingPoints = parkingCurve.getPoints(80).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const parkingGeo = new THREE.BufferGeometry().setFromPoints(parkingPoints);
    const parkingMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
    });
    const parkingLine = new THREE.Line(parkingGeo, parkingMat);
    scene.add(parkingLine);

    // Translunar Transfer Ellipse Curve
    const p0 = new THREE.Vector3(EARTH_POS.x + PARKING_RADIUS, 0, 0);
    const p1 = new THREE.Vector3(-1.2, 1.6, 0.25);
    const p2 = new THREE.Vector3(0.5, 1.8, 0.4);
    const p3 = new THREE.Vector3(2.2, 1.0, 0.2);
    const p4 = new THREE.Vector3(MOON_POS.x - LLO_RADIUS, MOON_POS.y, 0);
    const transferCurve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4], false, "centripetal", 0.5);
    transferCurveRef.current = transferCurve;

    const transferPoints = transferCurve.getPoints(120);
    const transferGeo = new THREE.BufferGeometry().setFromPoints(transferPoints);
    const transferMat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
    });
    const transferLine = new THREE.Line(transferGeo, transferMat);
    scene.add(transferLine);

    // Low Lunar Orbit Ring
    const lloCurve = new THREE.EllipseCurve(
      MOON_POS.x,
      MOON_POS.y,
      LLO_RADIUS,
      LLO_RADIUS,
      0,
      2 * Math.PI,
      false,
      0
    );
    const lloPoints = lloCurve.getPoints(60).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const lloGeo = new THREE.BufferGeometry().setFromPoints(lloPoints);
    const lloMat = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.65,
    });
    const lloLine = new THREE.Line(lloGeo, lloMat);
    scene.add(lloLine);

    // Powered Descent Arc (Deorbit to lunar surface)
    const descentCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(MOON_POS.x - LLO_RADIUS, MOON_POS.y, 0),
      new THREE.Vector3(MOON_POS.x - LLO_RADIUS * 0.7, MOON_POS.y + 0.22, 0.12),
      new THREE.Vector3(MOON_POS.x - MOON_RADIUS * 0.65, MOON_POS.y + MOON_RADIUS * 0.72, 0.08),
    ]);
    const descentPoints = descentCurve.getPoints(40);
    const descentGeo = new THREE.BufferGeometry().setFromPoints(descentPoints);
    const descentMat = new THREE.LineBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.85,
    });
    const descentLine = new THREE.Line(descentGeo, descentMat);
    scene.add(descentLine);

    // Earth-Moon L1 Lagrange Point Marker
    const l1RingGeo = new THREE.RingGeometry(0.06, 0.08, 24);
    const l1RingMat = new THREE.MeshBasicMaterial({
      color: 0x858d98,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
    });
    const l1RingMesh = new THREE.Mesh(l1RingGeo, l1RingMat);
    l1RingMesh.position.copy(L1_POS);
    scene.add(l1RingMesh);

    // 10. Spacecraft
    const spacecraft = createSpacecraftMesh();
    scene.add(spacecraft);
    spacecraftRef.current = spacecraft;

    // Resize Observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Main 60 FPS Render Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (earthMeshRef.current) earthMeshRef.current.rotation.y += 0.0006;
      if (cloudsMeshRef.current) cloudsMeshRef.current.rotation.y += 0.0008;
      if (moonMeshRef.current) moonMeshRef.current.rotation.y += 0.0002;

      // Smooth camera interpolation towards target when user is not manually interacting
      if (cameraPreset === "vehicle" && spacecraftRef.current) {
        const pos = spacecraftRef.current.position;
        targetCamPosRef.current.set(pos.x + 0.28, pos.y + 0.18, pos.z + 0.55);
        targetCamLookRef.current.copy(pos);
      }

      if (cameraRef.current && controlsRef.current) {
        if (!isUserInteractingRef.current) {
          cameraRef.current.position.lerp(targetCamPosRef.current, 0.05);
          controlsRef.current.target.lerp(targetCamLookRef.current, 0.05);
        }
        controlsRef.current.update();
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update Camera Target based on Preset
  useEffect(() => {
    if (cameraPreset === "earth") {
      targetCamPosRef.current.set(EARTH_POS.x + 1.5, 0.9, 2.5);
      targetCamLookRef.current.copy(EARTH_POS);
    } else if (cameraPreset === "moon") {
      targetCamPosRef.current.set(MOON_POS.x + 0.9, 0.5, 1.4);
      targetCamLookRef.current.copy(MOON_POS);
    } else if (cameraPreset === "vehicle" && spacecraftRef.current) {
      const pos = spacecraftRef.current.position;
      targetCamPosRef.current.set(pos.x + 0.28, pos.y + 0.18, pos.z + 0.55);
      targetCamLookRef.current.copy(pos);
    } else {
      // System View (Complete Earth-Moon Balcony)
      targetCamPosRef.current.set(0, 2.8, 9.2);
      targetCamLookRef.current.set(0, 0.05, 0);
    }
  }, [cameraPreset]);

  // Automatic Camera Alignment on Phase Change
  useEffect(() => {
    if (cameraPreset !== "vehicle") {
      if (activePhaseId === "ascent" || activePhaseId === "parking") {
        onCameraPresetChange("earth");
      } else if (activePhaseId === "tli" || activePhaseId === "cruise") {
        onCameraPresetChange("system");
      } else if (activePhaseId === "arrival" || activePhaseId === "descent") {
        onCameraPresetChange("moon");
      }
    }
  }, [activePhaseId, onCameraPresetChange]);

  // Update Spacecraft Position, Orientation & Engine Burn Plume
  useEffect(() => {
    const craft = spacecraftRef.current;
    if (!craft) return;

    const prog = telemetry.progress;
    let hasPlume = false;
    const craftPos = new THREE.Vector3();
    const forwardVec = new THREE.Vector3(1, 0, 0);

    if (activePhaseId === "ascent") {
      const theta = -Math.PI * 0.5 + prog * (Math.PI * 0.5);
      const r = EARTH_RADIUS + prog * (PARKING_RADIUS - EARTH_RADIUS);
      craftPos.set(EARTH_POS.x + Math.cos(theta) * r, EARTH_POS.y + Math.sin(theta) * r, 0);
      const radialUp = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
      const orbitalTangent = new THREE.Vector3(-Math.sin(theta), Math.cos(theta), 0);
      forwardVec.copy(radialUp).lerp(orbitalTangent, Math.min(1, Math.pow(prog, 0.65))).normalize();
      hasPlume = true;
    } else if (activePhaseId === "parking") {
      const theta = prog * Math.PI * 4;
      craftPos.set(EARTH_POS.x + Math.cos(theta) * PARKING_RADIUS, EARTH_POS.y + Math.sin(theta) * PARKING_RADIUS, 0);
      forwardVec.set(-Math.sin(theta), Math.cos(theta), 0).normalize();
      hasPlume = false;
    } else if (activePhaseId === "tli") {
      if (transferCurveRef.current) {
        const t = Math.max(0, Math.min(0.14, prog * 0.14));
        transferCurveRef.current.getPoint(t, craftPos);
        const tangent = transferCurveRef.current.getTangent(t);
        forwardVec.copy(tangent).normalize();
      }
      hasPlume = true;
    } else if (activePhaseId === "cruise") {
      if (transferCurveRef.current) {
        const t = 0.14 + prog * 0.86;
        transferCurveRef.current.getPoint(t, craftPos);
        const tangent = transferCurveRef.current.getTangent(t);
        forwardVec.copy(tangent).normalize();
      }
      hasPlume = false;
    } else if (activePhaseId === "arrival") {
      const theta = -Math.PI + prog * Math.PI * 1.5;
      craftPos.set(MOON_POS.x + Math.cos(theta) * LLO_RADIUS, MOON_POS.y + Math.sin(theta) * LLO_RADIUS, 0);
      forwardVec.set(-Math.sin(theta), Math.cos(theta), 0).normalize();
      hasPlume = prog < 0.65;
      // In LOI retro-burn, vehicle rotates 180° so main engine bells point in prograde direction (+v) to decelerate
      if (hasPlume) forwardVec.negate();
    } else if (activePhaseId === "descent") {
      const theta = Math.PI * 0.5 - prog * (Math.PI * 0.38);
      const r = LLO_RADIUS - prog * (LLO_RADIUS - MOON_RADIUS * 1.02);
      craftPos.set(MOON_POS.x + Math.cos(theta) * r, MOON_POS.y + Math.sin(theta) * r, 0.10 * prog);
      const flightTangent = new THREE.Vector3(Math.sin(theta), -Math.cos(theta), 0.1).normalize();
      const surfaceNormal = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0).normalize();
      forwardVec.copy(flightTangent).lerp(surfaceNormal, prog * 0.85).normalize();
      hasPlume = true;
    }

    craft.position.copy(craftPos);

    // Smoothly align vehicle with flight vector (aligning +Y nose to forwardVec)
    craft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forwardVec);

    // Toggle and pulse engine burn plume
    const plume = craft.getObjectByName("enginePlume");
    if (plume) {
      plume.visible = hasPlume;
      if (hasPlume) {
        plume.scale.set(
          0.95 + Math.random() * 0.20,
          0.95 + Math.random() * 0.30,
          0.95 + Math.random() * 0.20
        );
      }
    }
  }, [activePhaseId, telemetry.progress]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "440px",
        position: "relative",
        overflow: "hidden",
        cursor: "grab",
      }}
    />
  );
}
