import { moonMapSites } from "./moonMapSites";

export const launchSites = [
  { id: "kennedy-39a", name: "Kennedy Space Center", pad: "LC-39A", country: "United States", latitude: 28.61, longitude: -80.60, rockets: ["saturn-v", "falcon-9"], historical: false, source: "https://www.nasa.gov/kennedy/" },
  { id: "kennedy-39b", name: "Kennedy Space Center", pad: "LC-39B", country: "United States", latitude: 28.63, longitude: -80.62, rockets: ["sls"], historical: false, source: "https://www.nasa.gov/kennedy/" },
  { id: "cape-41", name: "Cape Canaveral", pad: "SLC-41", country: "United States", latitude: 28.58, longitude: -80.58, rockets: ["vulcan"], historical: false, source: "https://www.ulalaunch.com/" },
  { id: "sriharikota", name: "Satish Dhawan Space Centre", pad: "Second Launch Pad", country: "India", latitude: 13.72, longitude: 80.23, rockets: ["lvm3"], historical: false, source: "https://www.isro.gov.in/SDSC.html" },
  { id: "tanegashima", name: "Tanegashima Space Center", pad: "Yoshinobu launch complex", country: "Japan", latitude: 30.40, longitude: 130.98, rockets: ["h-iia"], historical: true, source: "https://global.jaxa.jp/about/centers/tnsc/" },
  { id: "xichang", name: "Xichang", pad: "Launch complex (approximate)", country: "China", latitude: 28.25, longitude: 102.03, rockets: ["long-march-3b"], historical: false, source: "https://www.cnsa.gov.cn/english/" },
  { id: "wenchang", name: "Wenchang", pad: "Launch complex (approximate)", country: "China", latitude: 19.61, longitude: 110.95, rockets: ["long-march-5"], historical: false, source: "https://www.cnsa.gov.cn/english/" },
  { id: "baikonur", name: "Baikonur Cosmodrome", pad: "Proton complex (approximate)", country: "Kazakhstan / Soviet heritage", latitude: 45.92, longitude: 63.34, rockets: ["proton"], historical: true, source: "https://www.esa.int/Enabling_Support/Space_Transportation/Europe_s_Spaceport/Baikonur_Cosmodrome" },
];

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
];

export const destinations = moonMapSites.map((site) => ({ ...site,
  category: "analysisSiteId" in site ? "CLPS landing" : site.id.startsWith("apollo") ? "Historic landing" : "Historic rover",
  surfaceAvailable: false,
}));
export type LaunchSite = typeof launchSites[number];
export type RocketChoice = typeof rockets[number];
