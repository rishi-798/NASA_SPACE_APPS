import * as THREE from "three";

export function disposeObjects(root: THREE.Object3D) {
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

export function fitToRadius(root: THREE.Object3D, targetRadius: number) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  // A box diagonal would shrink a spherical body by sqrt(3). Fit its diameter instead.
  const size = bounds.getSize(new THREE.Vector3());
  const factor = targetRadius / Math.max(Math.max(size.x, size.y, size.z) / 2, 1e-5);
  root.scale.multiplyScalar(factor);
  root.position.addScaledVector(bounds.getCenter(new THREE.Vector3()), -factor);
}

export function createAtmosphere(radius: number) {
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

export function createStarPoints() {
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

export function createSunGlow() {
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

export function createSpacecraftMesh(): THREE.Group {
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
