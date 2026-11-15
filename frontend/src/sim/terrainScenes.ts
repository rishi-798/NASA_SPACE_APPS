import registry from "../data/blenderTerrain.json" with { type: "json" };

/**
 * The team's measured-terrain scenes (Blender exports). Every scene is a triangle mesh in a local frame at its
 * anchor point whose rotation matrix equals the exact east/north/up directions there (verified in the tests).
 * Heights are metres above the 1,737,400 m reference sphere and already include lunar curvature (verified against
 * the team's terrain lookup service, see docs/LANDING_SIM.md).
 */
export type TerrainScene = (typeof registry.scenes)[number];
export const TERRAIN_SCENES: readonly TerrainScene[] = registry.scenes;
const R = 1_737_400;
/** A landing point counts as "at" a scene when it is within this ground distance of the scene's anchor. */
export const ANCHOR_MATCH_M = 150;

export function groundDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180, dl = ((lon2 - lon1) * Math.PI) / 180;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return R * Math.acos(Math.max(-1, Math.min(1, c)));
}

/** The measured-terrain scene whose anchor is at the landing point, if any. Points elsewhere get no scene. */
export function sceneForLanding(latitude: number, longitude: number): TerrainScene | null {
  let best: TerrainScene | null = null, bestD = Infinity;
  for (const scene of TERRAIN_SCENES) {
    const d = groundDistanceM(latitude, longitude, scene.anchor.latitude, scene.anchor.longitude);
    if (d < bestD) { best = scene; bestD = d; }
  }
  return best && bestD <= ANCHOR_MATCH_M ? best : null;
}

/** Convert a raw glTF vertex to the simulation frame (east, north, up). "Y": x east, y up, z −north. "Z": x east, y north, z up. */
export function rawToEnu(up: string, x: number, y: number, z: number): [number, number, number] {
  return up === "Y" ? [x, -z, y] : [x, y, z];
}

/**
 * Half-width of the square the simulation may use: up to 2 km, but never more than 90% of what the mesh covers
 * (G7, a 5 m grid, is only about 1.3 km wide). Rounded down to 10 m.
 */
export function supportedHalfSizeM(minEast: number, maxEast: number, minNorth: number, maxNorth: number, preferred = 2000): number {
  const reach = Math.min(-minEast, maxEast, -minNorth, maxNorth);
  return Math.max(0, Math.min(preferred, Math.floor((reach * 0.9) / 10) * 10));
}

export const hostedRemotely = (scene: TerrainScene) => scene.model_url.startsWith("http");
export const sizeMb = (scene: TerrainScene) => Math.round(scene.model_bytes / 1_048_576);
