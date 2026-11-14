import { landingSites } from "./landingSites";
import historicalSites from "../../../metadata/handoff-20261011/historical-mission-sites.json";

// Terrain and historic marker coordinates from Cesium's Moon showcase:
// https://sandcastle.cesium.com/gallery/moon/main.js
export const MOON_TERRAIN_ASSET_ID = 2684829;

export const featuredMoonSites = [
  { id: "odysseus-im1", name: "Odysseus", mission: "IM-1", region: "Malapert A", color: "#a2ecd3", side: "left" },
  { id: "athena-im2", name: "Athena", mission: "IM-2", region: "Mons Mouton", color: "#ffb578", side: "right" },
] as const;

export const moonMapSites = [
  ...landingSites.map((site) => ({
    id: site.id,
    name: site.mission,
    latitude: site.latitude,
    longitude: site.longitude,
    analysisSiteId: site.id,
  })),
  // The new handoff uses lunar-module coordinates and rover final positions.
  // Keep the supplied source coordinates, rather than older showcase approximations.
  ...historicalSites.map((site) => ({ id: site.id, name: site.name,
    latitude: site.latitude, longitude: site.longitude })),
];
