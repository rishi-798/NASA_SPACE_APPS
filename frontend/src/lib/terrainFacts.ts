import type { CatalogueState, HorizonProfile, TerrainStatus } from "../types";

/** The single source for how a location's point elevation is described, on every panel. */
export type PointElevation =
  | { state: "loading"; text: string }
  | { state: "available"; valueM: number; text: string; source: string; datum: string; resolution: string }
  | { state: "unavailable"; text: string; reason: string };

const metres = (v: number) => `${v.toLocaleString("en", { maximumFractionDigits: 1 })} m`;

export function pointElevation(state: CatalogueState): PointElevation {
  if (state.status === "loading") return { state: "loading", text: "Looking up…" };
  if (state.status === "error") {
    return { state: "unavailable", text: "Unavailable", reason: state.message };
  }
  const { data } = state;
  const t = data.point_terrain;
  if (typeof data.point_elevation_m === "number" && Number.isFinite(data.point_elevation_m) && t) {
    return {
      state: "available", valueM: data.point_elevation_m, text: metres(data.point_elevation_m),
      source: t.source_id,
      datum: `Moon reference sphere, ${t.vertical_reference_radius_m.toLocaleString("en")} m radius`,
      resolution: `nearest original pixel, ${metres(t.sample_spacing_x_m)} × ${metres(t.sample_spacing_y_m)} spacing`,
    };
  }
  return { state: "unavailable", text: "Unavailable", reason: data.point_elevation_note || "The catalogue has no valid elevation sample at this point." };
}

export type HorizonModel = {
  label: "TERRAIN-AWARE" | "FLAT HORIZON" | "DEGRADED" | "NOT ANALYSED";
  detail: string;
  /** Height of the DEM the horizon was built from, at the site. A different product than the catalogue point sample. */
  demHeight: string | null;
  source: string | null;
  resolution: string | null;
  limits: string | null;
};

export function horizonModel(terrain: TerrainStatus | null, horizon: HorizonProfile | null): HorizonModel {
  if (!terrain) return { label: "NOT ANALYSED", detail: "Run an analysis to see which horizon model was used.", demHeight: null, source: null, resolution: null, limits: null };
  const meta = terrain.profile_metadata ?? null;
  const label = terrain.mode === "terrain_profile" ? "TERRAIN-AWARE" : terrain.mode === "flat_horizon_degraded" ? "DEGRADED" : "FLAT HORIZON";
  const elevation = meta?.site_elevation_m ?? horizon?.site_elevation_m;
  const res = meta?.pixel_resolution_m ?? horizon?.pixel_resolution_m;
  const reach = meta?.max_distance_m ?? horizon?.max_distance_m;
  const obs = meta?.observer_height_m ?? horizon?.observer_height_m;
  return {
    label, detail: terrain.message,
    demHeight: typeof elevation === "number" ? metres(elevation) : null,
    source: meta?.source ?? horizon?.source ?? null,
    resolution: typeof res === "number" ? `${res} m per pixel` : null,
    limits: terrain.mode === "terrain_profile"
      ? `Terrain out to ${typeof reach === "number" ? `${reach / 1000} km` : "the profile limit"}, ${obs ?? 2} m observer height. Relief smaller than a pixel, and anything inside the near-field cutoff, is not represented.`
      : "Nearby terrain is not assessed. Sun and Earth visibility use a flat horizon.",
  };
}
