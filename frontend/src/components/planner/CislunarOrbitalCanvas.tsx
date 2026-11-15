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
    machNumber: number;
  };
  cameraPreset: "system" | "earth" | "vehicle" | "moon";
  onCameraPresetChange: (preset: "system" | "earth" | "vehicle" | "moon") => void;
}

// Coordinate constants
const EARTH_POS = new THREE.Vector3(-5.0, 0, 0);
const EARTH_RADIUS = 1.35;
const PARKING_RADIUS = 1.62;

const MOON_POS = new THREE.Vector3(6.5, 0.4, 0);
const MOON_RADIUS = 0.42;
const LLO_RADIUS = 0.62;

const L1_POS = new THREE.Vector3(4.66, 0.34, 0);

// Atmospheric Rim Glow Shader
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
        float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0), 3.0);
        gl_FragColor = vec4(glowColor, rim * 0.72);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}

// Starfield Generator
function createStarfield() {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let seed = 0x5a1f28;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const u = rand();
    const v = rand();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = 50 + rand() * 30;

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Spectral temperature variations
    const color = new THREE.Color();
    const temp = rand();
    if (temp > 0.85) {
      color.setHSL(0.58, 0.45, 0.85); // Blue-white
    } else if (temp > 0.65) {
      color.setHSL(0.12, 0.40, 0.85); // Warm solar yellow
    } else {
      color.setHSL(0.60, 0.15, 0.90); // Crisp pure white
    }

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.18,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
  });

  return new THREE.Points(geometry, material);
}

// 3D Spacecraft Model
function createSpacecraftMesh() {
  const shipGroup = new THREE.Group();

  // Command Module (silver-white cone)
  const cmGeo = new THREE.ConeGeometry(0.07, 0.12, 16);
  const cmMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.75,
    roughness: 0.25,
  });
  const cmMesh = new THREE.Mesh(cmGeo, cmMat);
  cmMesh.position.y = 0.08;
  shipGroup.add(cmMesh);

  // Service Module (cylindrical hull)
  const smGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16);
  const smMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.45,
    roughness: 0.55,
  });
  const smMesh = new THREE.Mesh(smGeo, smMat);
  smMesh.position.y = -0.04;
  shipGroup.add(smMesh);

  // Solar Array Wings (blue textured panels)
  const wingGeo = new THREE.BoxGeometry(0.48, 0.01, 0.06);
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    metalness: 0.8,
    roughness: 0.2,
  });
  const wingMesh = new THREE.Mesh(wingGeo, wingMat);
  wingMesh.position.y = -0.04;
  shipGroup.add(wingMesh);

  // Engine Bell Nozzle
  const nozzleGeo = new THREE.ConeGeometry(0.04, 0.06, 12);
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.9,
    roughness: 0.2,
  });
  const nozzleMesh = new THREE.Mesh(nozzleGeo, nozzleMat);
  nozzleMesh.position.y = -0.13;
  shipGroup.add(nozzleMesh);

  // Engine Exhaust Plume (visible during burns)
  const plumeGeo = new THREE.ConeGeometry(0.06, 0.32, 12);
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
  });
  const plumeMesh = new THREE.Mesh(plumeGeo, plumeMat);
  plumeMesh.rotation.x = Math.PI;
  plumeMesh.position.y = -0.28;
  plumeMesh.name = "enginePlume";
  plumeMesh.visible = false;
  shipGroup.add(plumeMesh);

  // Ship scale
  shipGroup.scale.set(1.4, 1.4, 1.4);

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

  const targetCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0.8, 5.0, 15.0));
  const targetCamLookRef = useRef<THREE.Vector3>(new THREE.Vector3(0.8, 0.2, 0));

  // Trajectory Splines
  const transferCurveRef = useRef<THREE.CatmullRomCurve3 | null>(null);

  // Calculate transfer trajectory spline
  useEffect(() => {
    // Elegant cislunar transfer ellipse
    const p0 = new THREE.Vector3(EARTH_POS.x + PARKING_RADIUS, 0, 0);
    const p1 = new THREE.Vector3(-1.8, 2.0, 0.4);
    const p2 = new THREE.Vector3(1.2, 2.2, 0.6);
    const p3 = new THREE.Vector3(4.5, 1.4, 0.3);
    const p4 = new THREE.Vector3(MOON_POS.x - LLO_RADIUS, MOON_POS.y, 0);

    transferCurveRef.current = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4], false, "centripetal", 0.5);
  }, []);

  // Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#05070a");
    sceneRef.current = scene;

    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 200);
    camera.position.set(0.8, 5.0, 15.0);
    cameraRef.current = camera;

    // 2. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 3. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.8;
    controls.maxDistance = 30.0;
    controls.target.set(0.8, 0.2, 0);
    controlsRef.current = controls;

    // 4. Lighting (Warm Sun + Soft Cislunar Radiance)
    const sunLight = new THREE.DirectionalLight(0xfffbf0, 2.7);
    sunLight.position.set(14, 18, 16);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x182030, 0.45);
    scene.add(ambientLight);

    // 5. Starfield Background
    const stars = createStarfield();
    scene.add(stars);

    // 6. Texture Loader
    const textureLoader = new THREE.TextureLoader();

    // 7. Earth & Atmosphere
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 48);
    const earthMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.75,
      metalness: 0.1,
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
        // Fallback color if texture unready
        earthMat.color.setHex(0x1d4ed8);
      }
    );
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthMesh.position.copy(EARTH_POS);
    earthMesh.rotation.z = THREE.MathUtils.degToRad(-23.4); // Earth axial tilt
    scene.add(earthMesh);
    earthMeshRef.current = earthMesh;

    // Earth Clouds Layer
    const cloudsGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 64, 48);
    const cloudsMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
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

    // Atmosphere Rim Glow
    const atmosphere = createAtmosphereMesh(EARTH_RADIUS * 1.06);
    atmosphere.position.copy(EARTH_POS);
    scene.add(atmosphere);

    // 8. Moon
    const moonGeo = new THREE.SphereGeometry(MOON_RADIUS, 48, 36);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.92,
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
      linewidth: 1,
    });
    const parkingLine = new THREE.Line(parkingGeo, parkingMat);
    scene.add(parkingLine);

    // Translunar Transfer Ellipse Curve
    const p0 = new THREE.Vector3(EARTH_POS.x + PARKING_RADIUS, 0, 0);
    const p1 = new THREE.Vector3(-1.8, 2.0, 0.4);
    const p2 = new THREE.Vector3(1.2, 2.2, 0.6);
    const p3 = new THREE.Vector3(4.5, 1.4, 0.3);
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

    // Powered Descent Arc (curve to lunar landing site)
    const descentCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(MOON_POS.x - LLO_RADIUS, MOON_POS.y, 0),
      new THREE.Vector3(MOON_POS.x - LLO_RADIUS * 0.7, MOON_POS.y + 0.35, 0.2),
      new THREE.Vector3(MOON_POS.x - MOON_RADIUS * 0.6, MOON_POS.y + MOON_RADIUS * 0.7, 0.15),
    ]);
    const descentPoints = descentCurve.getPoints(40);
    const descentGeo = new THREE.BufferGeometry().setFromPoints(descentPoints);
    const descentMat = new THREE.LineBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.8,
    });
    const descentLine = new THREE.Line(descentGeo, descentMat);
    scene.add(descentLine);

    // 10. Earth-Moon L1 Lagrange Point Marker
    const l1RingGeo = new THREE.RingGeometry(0.12, 0.14, 24);
    const l1RingMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
    });
    const l1RingMesh = new THREE.Mesh(l1RingGeo, l1RingMat);
    l1RingMesh.position.copy(L1_POS);
    scene.add(l1RingMesh);

    // 11. Spacecraft
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

    // 12. Main Render Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Rotate Earth slowly
      if (earthMeshRef.current) {
        earthMeshRef.current.rotation.y += 0.0006;
      }
      if (cloudsMeshRef.current) {
        cloudsMeshRef.current.rotation.y += 0.0008;
      }
      if (moonMeshRef.current) {
        moonMeshRef.current.rotation.y += 0.0002;
      }

      // Smooth camera transition toward target preset
      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.lerp(targetCamPosRef.current, 0.04);
        controlsRef.current.target.lerp(targetCamLookRef.current, 0.04);
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

  // Update Camera Target based on Preset or Active Phase
  useEffect(() => {
    if (cameraPreset === "earth") {
      targetCamPosRef.current.set(EARTH_POS.x + 2.2, 1.4, 3.8);
      targetCamLookRef.current.copy(EARTH_POS);
    } else if (cameraPreset === "moon") {
      targetCamPosRef.current.set(MOON_POS.x + 1.2, 0.8, 2.2);
      targetCamLookRef.current.copy(MOON_POS);
    } else if (cameraPreset === "vehicle" && spacecraftRef.current) {
      const pos = spacecraftRef.current.position;
      targetCamPosRef.current.set(pos.x + 0.6, pos.y + 0.5, pos.z + 1.4);
      targetCamLookRef.current.copy(pos);
    } else {
      // System View
      targetCamPosRef.current.set(0.8, 5.0, 15.0);
      targetCamLookRef.current.set(0.8, 0.2, 0);
    }
  }, [cameraPreset]);

  // Auto camera focus transition when selecting phases
  useEffect(() => {
    if (activePhaseId === "ascent" || activePhaseId === "parking") {
      onCameraPresetChange("earth");
    } else if (activePhaseId === "tli" || activePhaseId === "cruise") {
      onCameraPresetChange("system");
    } else if (activePhaseId === "arrival" || activePhaseId === "descent") {
      onCameraPresetChange("moon");
    }
  }, [activePhaseId, onCameraPresetChange]);

  // Update Spacecraft Position, Orientation, and Plume
  useEffect(() => {
    const craft = spacecraftRef.current;
    if (!craft) return;

    const prog = telemetry.progress;
    let hasPlume = false;
    const craftPos = new THREE.Vector3();
    const forwardVec = new THREE.Vector3(1, 0, 0);

    if (activePhaseId === "ascent") {
      // Ascent: liftoff from surface to parking orbit
      const theta = -Math.PI * 0.5 + prog * (Math.PI * 0.45);
      const r = EARTH_RADIUS + prog * (PARKING_RADIUS - EARTH_RADIUS);
      craftPos.set(EARTH_POS.x + Math.cos(theta) * r, EARTH_POS.y + Math.sin(theta) * r, 0);
      forwardVec.set(-Math.sin(theta), Math.cos(theta), 0).normalize();
      hasPlume = true;
    } else if (activePhaseId === "parking") {
      // Circular parking orbit revolutions
      const theta = prog * Math.PI * 4;
      craftPos.set(EARTH_POS.x + Math.cos(theta) * PARKING_RADIUS, EARTH_POS.y + Math.sin(theta) * PARKING_RADIUS, 0);
      forwardVec.set(-Math.sin(theta), Math.cos(theta), 0).normalize();
      hasPlume = false;
    } else if (activePhaseId === "tli") {
      // TLI burn starting from perigee
      if (transferCurveRef.current) {
        const t = Math.max(0, Math.min(0.14, prog * 0.14));
        transferCurveRef.current.getPoint(t, craftPos);
        const tangent = transferCurveRef.current.getTangent(t);
        forwardVec.copy(tangent).normalize();
      }
      hasPlume = true;
    } else if (activePhaseId === "cruise") {
      // Coasting along transfer curve
      if (transferCurveRef.current) {
        const t = 0.14 + prog * 0.82;
        transferCurveRef.current.getPoint(t, craftPos);
        const tangent = transferCurveRef.current.getTangent(t);
        forwardVec.copy(tangent).normalize();
      }
      hasPlume = false;
    } else if (activePhaseId === "arrival") {
      // Hyperbolic approach and circular capture in LLO
      const theta = -Math.PI + prog * Math.PI * 1.5;
      craftPos.set(MOON_POS.x + Math.cos(theta) * LLO_RADIUS, MOON_POS.y + Math.sin(theta) * LLO_RADIUS, 0);
      // Retrograde braking orientation
      forwardVec.set(Math.sin(theta), -Math.cos(theta), 0).normalize();
      hasPlume = prog < 0.65;
    } else if (activePhaseId === "descent") {
      // Powered descent braking down to surface
      const theta = Math.PI * 0.5 - prog * (Math.PI * 0.38);
      const r = LLO_RADIUS - prog * (LLO_RADIUS - MOON_RADIUS * 1.02);
      craftPos.set(MOON_POS.x + Math.cos(theta) * r, MOON_POS.y + Math.sin(theta) * r, 0.15 * prog);
      // Retrograde braking pitch
      forwardVec.set(Math.sin(theta), -Math.cos(theta), -0.1).normalize();
      hasPlume = true;
    }

    craft.position.copy(craftPos);

    // Orient craft along flight vector
    const rotMatrix = new THREE.Matrix4().lookAt(
      new THREE.Vector3(0, 0, 0),
      forwardVec,
      new THREE.Vector3(0, 0, 1)
    );
    craft.quaternion.setFromRotationMatrix(rotMatrix);

    // Toggle engine burn plume
    const plume = craft.getObjectByName("enginePlume");
    if (plume) {
      plume.visible = hasPlume;
      if (hasPlume) {
        // Subtle engine flame pulsing
        plume.scale.set(
          1.0 + Math.random() * 0.25,
          1.0 + Math.random() * 0.35,
          1.0 + Math.random() * 0.25
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
        minHeight: "580px",
        position: "relative",
        overflow: "hidden",
        cursor: "grab",
      }}
    />
  );
}
