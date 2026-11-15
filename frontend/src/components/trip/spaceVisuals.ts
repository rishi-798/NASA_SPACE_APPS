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

/** Shared gallery/flight orientation and sizing for the exact selected catalogue asset. */
export function prepareRocketModel(model:THREE.Object3D,url:string,height:number) {
  if(/\/ares-i-[ab]\.glb$/.test(url)){
    for(const child of [...model.children])if(child instanceof THREE.Mesh){model.remove(child);disposeObjects(child);}
  }
  let bounds=new THREE.Box3().setFromObject(model);
  const size=bounds.getSize(new THREE.Vector3());
  if(size.z>size.y&&size.z>size.x)model.rotateX(-Math.PI/2);
  else if(size.x>size.y)model.rotateZ(Math.PI/2);
  bounds=new THREE.Box3().setFromObject(model);
  const span=bounds.getSize(new THREE.Vector3()).y;
  if(!Number.isFinite(span)||span<=0)throw new Error('Selected model has no usable geometry.');
  model.scale.multiplyScalar(height/span);
  bounds=new THREE.Box3().setFromObject(model);
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
  return model;
}
