export type TerrainRegion = {
  id: string; name: string; grid_id: string;
  anchor: { latitude: number; longitude: number };
  model_url: string; model_bytes: number; sha256: string;
  local_to_moon_fixed: number[][]; gltf_up: 'Y' | 'Z'; reference_radius_m: number;
  source_id: string; source_spacing_m: number; source_mismatch: boolean;
  appearance_note?: string;
};

export type TerrainChoice = {
  latitude: number; longitude: number; grid_id: string;
  scene_available: boolean; scene: TerrainRegion | null;
};
