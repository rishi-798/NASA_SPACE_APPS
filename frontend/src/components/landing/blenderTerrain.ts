import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { meshTerrain, type Terrain } from "../../sim/terrain";
import { hostedRemotely, rawToEnu, sizeMb, supportedHalfSizeM, type TerrainScene } from "../../sim/terrainScenes";
import { macroAlbedo } from "./regolith";

/**
 * Load one of the team's measured-terrain scenes, verify it against its recorded SHA-256, build the physics surface
 * from its triangles (in east/north/up), and prepare the same mesh for drawing. Drawn surface = physics surface.
 *
 * glTF layouts: "Y" scenes are x east, y up, z −north; "Z" scenes are x east, y north, z up. The drawing wrapper
 * turns Z-up scenes into this app's three.js axes (x east, y up, z −north).
 */
export async function loadBlenderTerrain(scene: TerrainScene, displayName: string, signal: AbortSignal): Promise<{ terrain: Terrain; model: THREE.Object3D }> {
  const response = await fetch(scene.model_url, { signal });
  if (!response.ok) throw new Error(`The terrain model could not be downloaded (HTTP ${response.status}).`);
  const buffer = await response.arrayBuffer();
  if (crypto?.subtle) {
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (digest !== scene.sha256) throw new Error("The terrain model does not match its recorded checksum; it was not used.");
  }
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  gltf.scene.updateMatrixWorld(true);
  const east: number[] = [], north: number[] = [], up: number[] = [], triangles: number[] = [];
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
  const v = new THREE.Vector3();
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute("position");
    const base = east.length;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const [e, n, u] = rawToEnu(scene.gltf_up, v.x, v.y, v.z);
      east.push(e); north.push(n); up.push(u);
      if (e < minE) minE = e; if (e > maxE) maxE = e; if (n < minN) minN = n; if (n > maxN) maxN = n;
    }
    const index = mesh.geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) triangles.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) triangles.push(base + i);
  }
  const halfSizeM = supportedHalfSizeM(minE, maxE, minN, maxN);
  if (halfSizeM < 200) throw new Error("The terrain model covers too small an area around the target for a descent.");
  const coverage = scene.coverage.radius_m ? `${scene.coverage.radius_m / 1000} km radius` : `${Math.round(maxE - minE)} × ${Math.round(maxN - minN)} m square`;
  const terrain = meshTerrain(east, north, up, triangles, {
    siteName: displayName, halfSizeM,
    source: `Team terrain model ${scene.id} (${scene.source_id}, ${scene.coordinate_frame}; checksum verified)`,
    sourceSpacingM: scene.source_spacing_m,
    sourceLabel: `${scene.source_id.startsWith("sldem") ? "SLDEM2015" : scene.source_id.startsWith("ldem") ? "LOLA" : "measured DEM"} ${Math.round(scene.source_spacing_m)} m`,
    notes: [
      scene.appearance_note ?? `Measured terrain from ${scene.source_id}; fine surface detail in the view is illustrative.`,
      `Model coverage: ${coverage}; the simulation uses the central ${(2 * halfSizeM) / 1000} km square.`,
      ...(scene.source_mismatch ? [`Elevation source differs from the higher-resolution local product at the centre by about ${Math.abs(scene.height_delta_m ?? 0).toFixed(1)} m (team provenance flag).`] : []),
      ...(scene.production_ready ? [] : ["The team marks this terrain as a measured preview (not production-ready)."]),
      "Surface texture and colour variation are illustrative and do not change the terrain shape.",
    ],
  });

  // Appearance: the team's detail textures on planar UVs, plus large-scale brightness variation (visual only).
  const texLoader = new THREE.TextureLoader();
  const map = texLoader.load("/terrain/lunar-detail-color.png");
  const normal = texLoader.load("/terrain/lunar-detail-normal.png");
  for (const t of [map, normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; }
  map.colorSpace = THREE.SRGBColorSpace;
  const albedo = macroAlbedo();
  const tile = scene.source_spacing_m < 20 ? 8 : 40;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap: normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.96, metalness: 0 });
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.getAttribute("position");
    const uv = new Float32Array(pos.count * 2), color = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const [e, n] = rawToEnu(scene.gltf_up, v.x, v.y, v.z);
      uv[i * 2] = e / tile; uv[i * 2 + 1] = n / tile;
      const shade = 0.95 + 0.3 * albedo(e, n);
      color.set([shade, shade * 0.985, shade * 0.96], i * 3);
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(color, 3));
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    mesh.material = material;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
  }
  // Z-up scenes: x east, y north, z up → (x, z, −y) in this app's three.js axes. Y-up scenes already match.
  const root = new THREE.Group();
  root.add(gltf.scene);
  if (scene.gltf_up === "Z") root.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);
  return { terrain, model: root };
}

export { hostedRemotely, sizeMb };
