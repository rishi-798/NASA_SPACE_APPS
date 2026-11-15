import launchSiteRecords from "../../../data/launch_sites.json";
import { moonMapSites } from "./moonMapSites";

export const launchSites = launchSiteRecords;

const originalRockets = [
  { id: "saturn-v", name: "Saturn V", category: "Historical crewed lunar launcher", mission: "Apollo programme", note: "NASA's verified GLB. Historical prototype default, not an available launch service.", model: "/saturn-v.glb", source: "https://science.nasa.gov/3d-resources/saturn-v/" },
  { id: "sls", name: "SLS", category: "Heavy-lift lunar launcher", mission: "Artemis programme", note: "Model verification pending. Conceptual choice only.", model: null, source: "https://science.nasa.gov/3d-resources/space-launch-system-block-1/" },
  { id: "proton", name: "Proton-K/D", category: "Historical robotic launcher", mission: "Soviet lunar exploration", note: "Exact model variant pending. No crew capability implied.", model: null, source: "https://science.nasa.gov/moon/missions/" },
  { id: "long-march-3b", name: "Long March 3B/E", category: "Robotic lunar launcher", mission: "Chang'e programme", note: "Model verification pending. No crew capability implied.", model: null, source: "https://www.cnsa.gov.cn/english/" },
  { id: "lvm3", name: "LVM3", category: "Heavy-lift launcher", mission: "Chandrayaan programme", note: "Model verification pending. This selection is not a mission feasibility check.", model: null, source: "https://www.isro.gov.in/" },
  { id: "h-iia", name: "H-IIA 202", category: "Historical robotic launcher", mission: "Japanese lunar exploration", note: "Model verification pending. Museum / concept selection.", model: null, source: "https://global.jaxa.jp/" },
  { id: "falcon-9", name: "Falcon 9", category: "Reusable orbital launcher", mission: "Commercial lunar delivery", note: "Model verification pending. Selecting this rocket does not provide a lunar crew vehicle.", model: null, source: "https://www.spacex.com/vehicles/falcon-9/" },
  { id: "vulcan", name: "Vulcan Centaur", category: "Orbital launcher", mission: "Commercial lunar delivery", note: "Model verification pending. Conceptual choice only.", model: null, source: "https://www.ulalaunch.com/rockets/vulcan-centaur" },
  { id: "long-march-5", name: "Long March 5", category: "Heavy-lift robotic launcher", mission: "Chang'e programme", note: "Model verification pending. No crew capability implied.", model: null, source: "https://www.cnsa.gov.cn/english/" },
];

export const rockets = [
  ...originalRockets.map((rocket) => ({ ...rocket,
    isNasa: ["saturn-v", "sls"].includes(rocket.id),
    model: rocket.id === "sls" ? "/sls-block-1.glb" : rocket.model,
    note: rocket.id === "sls" ? "Official NASA Block 1 printable geometry. Neutral display material; not a textured flight model. The detailed Blender source still needs a web export." : rocket.note,
    source: rocket.id === "sls" ? "https://science.nasa.gov/3d-resources/space-launch-system-sls-block-1/" : rocket.source,
    modelCredit: rocket.id === "saturn-v" ? "NASA / Michael D. Carbajal" : rocket.id === "sls" ? "NASA / Marshall Space Flight Center · neutral material" : "NASA",
    modelLabel: rocket.id === "saturn-v" ? "NASA GLB" : rocket.id === "sls" ? "NASA mesh / neutral material" : "Model pending",
  })),
  { id: "ares-i-a", name: "Ares I · Variant A", category: "Canceled-program crew launcher", mission: "Constellation concept", note: "Official NASA model. Historical concept only: this configuration did not carry astronauts to the Moon. Not a standalone lunar mission vehicle.", model: "/ares-i-a.glb", isNasa: true, modelCredit: "NASA · Ares I variant A", modelLabel: "NASA GLB / canceled programme", source: "https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Ares%201%20(A)" },
  { id: "ares-i-b", name: "Ares I · Variant B", category: "Canceled-program crew launcher", mission: "Constellation concept", note: "Official NASA model. Historical concept only: this configuration did not carry astronauts to the Moon. Not a standalone lunar mission vehicle.", model: "/ares-i-b.glb", isNasa: true, modelCredit: "NASA · Ares I variant B", modelLabel: "NASA GLB / canceled programme", source: "https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Ares%201%20(B)" },
  { id: "jupiter-c", name: "Jupiter-C · Explorer 1", category: "Historical orbital launcher", mission: "Explorer 1", note: "Historical satellite launcher; this vehicle is not a lunar transport vehicle.", model: "/jupiter-c.glb", isNasa: true, modelCredit: "NASA · Explorer Jupiter-C Rocket", modelLabel: "NASA GLB / historical", source: "https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Explorer%20Jupiter-C%20Rocket" },
];

export const destinations = moonMapSites.map((site) => ({ ...site,
  category: "analysisSiteId" in site ? "CLPS landing" : site.id.startsWith("apollo") ? "Historic landing" : "Historic rover",
  surfaceAvailable: false,
}));
export type LaunchSite = typeof launchSites[number];
export type RocketChoice = typeof rockets[number];
