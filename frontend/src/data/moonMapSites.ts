import { landingSites } from "./landingSites";

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
  { id: "apollo-11", name: "Apollo 11", latitude: 0.67416, longitude: 23.47315 },
  { id: "apollo-14", name: "Apollo 14", latitude: -3.64417, longitude: -17.47865 },
  { id: "apollo-15", name: "Apollo 15", latitude: 26.13341, longitude: 3.6285 },
  { id: "lunokhod-1", name: "Lunokhod 1", latitude: 38.2378, longitude: -35.0017 },
  { id: "lunokhod-2", name: "Lunokhod 2", latitude: 25.83232, longitude: 30.92215 },
];
