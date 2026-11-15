import * as THREE from "three";
import type { Terrain } from "../../sim/terrain";
import { scatterRocks } from "../../lib/lunarRockScatter";
import { buildLunarSurfaceDetail } from "../../lib/lunarSurfaceDetail";
import { createRegolithTextures } from "../../lib/regolithTexture";

/** Presentation only: shared approved powder palette; never changes contact heights. */
export function landingSurfaceMaterial() {
  const dust = createRegolithTextures(24, true, true);
  const fines = createRegolithTextures(24, true);
  dust.map.repeat.set(1, 1);
  dust.normalMap.dispose();
  fines.map.repeat.set(6, 6);
  fines.map.colorSpace = THREE.NoColorSpace;
  fines.normalMap.dispose();
  const normal = new THREE.TextureLoader().load("/terrain/pbr/nor_gl.jpg");
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(6, 6);
  for (const texture of [dust.map, fines.map, normal]) texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({
    map: dust.map, normalMap: normal, normalScale: new THREE.Vector2(.5, .5),
    bumpMap: fines.map, bumpScale: .16, roughness: 1, metalness: 0, vertexColors: false,
  });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
      "#include <map_fragment>\n diffuseColor.rgb=vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));");
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>",
      "vec3 measuredNormal=normal;\n #include <normal_fragment_maps>\n #ifdef USE_BUMPMAP\n normal=perturbNormalArb(-vViewPosition,normal,dHdxy_fwd(),faceDirection);\n #endif\n normal=normalize(mix(measuredNormal,normal,1.0-smoothstep(6.0,32.0,length(vViewPosition))));");
  };
  material.customProgramCacheKey = () => "landing-approved-neutral-dust-v1";
  return { material, dispose: () => { material.dispose(); dust.map.dispose(); fines.map.dispose(); normal.dispose(); } };
}

/** Adapter from landing Y-up axes to the approved Explorer Z-up detail workflow. */
export function landingGravel(terrain: Terrain, exaggeration: number, material: THREE.Material) {
  const scene = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(140, 140, 140, 140);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i);
    const height = terrain.heightAt(x, y);
    positions.setZ(i, Number.isFinite(height) ? height * exaggeration : NaN);
  }
  geometry.computeVertexNormals();
  const measured = new THREE.Mesh(geometry);
  measured.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 100000), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(measured)[0];
  if (hit) {
    scatterRocks(scene, null, hit, true, [], true);
    const skin = buildLunarSurfaceDetail(hit, true);
    if (skin) { const mesh = new THREE.Mesh(skin, material); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); }
  }
  geometry.dispose();
  (measured.material as THREE.Material).dispose();
  const group = new THREE.Group();
  for (const child of [...scene.children]) group.add(child);
  group.rotation.x = -Math.PI / 2;
  group.name = "Approved illustrative dust and gravel — not measured hazards";
  return { group, dispose: () => {
    const textures = new Set<THREE.Texture>();
    const materials = new Set<THREE.Material>();
    group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      if (child instanceof THREE.InstancedMesh) child.dispose();
      for (const m of Array.isArray(child.material) ? child.material : [child.material]) {
        if (m === material) continue;
        materials.add(m);
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  } };
}
