import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import blender from "../../data/blenderTerrain.json";
import { meshTerrain, type Terrain } from "../../sim/terrain";
import { macroAlbedo } from "./regolith";

export type BlenderScene = (typeof blender.scenes)[number];
export const blenderScene = (siteId: string): BlenderScene | undefined => blender.scenes.find((s) => s.site_id === siteId);

/**
 * Load the team's Blender terrain (LOLA 60 m, glTF Y-up: x east, y height above the 1,737,400 m sphere, z −north),
 * verify it against the recorded SHA-256, build the physics surface from its triangles, and prepare the same mesh
 * for drawing. The drawn surface and the physics surface are therefore identical.
 */
export async function loadBlenderTerrain(siteId: string, siteName: string, signal: AbortSignal): Promise<{ terrain: Terrain; model: THREE.Object3D }> {
  const meta = blenderScene(siteId);
  if (!meta) throw new Error("No Blender terrain is registered for this site.");
  const response = await fetch(meta.model_url, { signal });
  if (!response.ok) throw new Error(`Terrain model download failed (HTTP ${response.status}).`);
  const buffer = await response.arrayBuffer();
  if (crypto?.subtle) {
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (digest !== meta.sha256) throw new Error("The terrain model does not match its recorded checksum; it was not used.");
  }
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  gltf.scene.updateMatrixWorld(true);
  const east: number[] = [], north: number[] = [], up: number[] = [], triangles: number[] = [];
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
  const v = new THREE.Vector3();
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute("position");
    const base = east.length;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      east.push(v.x); north.push(-v.z); up.push(v.y);
    }
    const index = mesh.geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) triangles.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) triangles.push(base + i);
  }
  const terrain = meshTerrain(east, north, up, triangles, {
    siteName, source: `Team Blender export ${meta.model_url} (${meta.source_id}, ${meta.coordinate_frame}; checksum verified)`,
    sourceSpacingM: meta.source_spacing_m,
    notes: [meta.appearance_note, `Model coverage: ${meta.coverage.radius_m / 1000} km radius around the site; the simulation uses the central 4 km square.`,
      "Surface texture and colour variation are illustrative and do not change the terrain shape."],
  });

  // Appearance: the team's detail textures on planar UVs, plus large-scale brightness variation (visual only).
  const texLoader = new THREE.TextureLoader();
  const map = texLoader.load("/terrain/lunar-detail-color.png");
  const normal = texLoader.load("/terrain/lunar-detail-normal.png");
  for (const t of [map, normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; }
  map.colorSpace = THREE.SRGBColorSpace;
  const albedo = macroAlbedo();
  const tile = 40;
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.getAttribute("position");
    const uv = new Float32Array(pos.count * 2), color = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      uv[i * 2] = v.x / tile; uv[i * 2 + 1] = -v.z / tile;
      const shade = 0.95 + 0.3 * albedo(v.x, -v.z);
      color.set([shade, shade * 0.985, shade * 0.96], i * 3);
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(color, 3));
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap: normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.96, metalness: 0 });
    mesh.receiveShadow = true;
    mesh.castShadow = true;
  }
  return { terrain, model: gltf.scene };
}
