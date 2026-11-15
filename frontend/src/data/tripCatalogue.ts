import launchSiteRecords from "../../../data/launch_sites.json";
import { moonMapSites } from "./moonMapSites";

export const launchSites = launchSiteRecords;

const communityModels: Record<string, string> = {
  "falcon-9": "/falcon-9-block-5.glb",
  vulcan: "/vulcan-centaur-vc2s.glb",
  "long-march-5": "/long-march-5-cz-5.glb",
};
const communitySource = "https://github.com/johnmorrisdotca/uchusen-rockets";
const referenceModels: Record<string, string> = {
  proton: "/proton-k-reference.glb",
  "long-march-3b": "/long-march-3b-reference.glb",
  lvm3: "/lvm3-reference.glb",
  "h-iia": "/h-iia-202-reference.glb",
};

export interface RocketSpecs {
  payloadTli: string;
  liftoffThrust: string;
  stages: number;
  propellants: string;
}

const originalRockets = [
  { id: "saturn-v", name: "Saturn V", category: "Historical crewed lunar launcher", mission: "Apollo programme", note: "NASA's verified GLB. Historical prototype default, not an available launch service.", model: "/saturn-v.glb", source: "https://science.nasa.gov/3d-resources/saturn-v/", specs: { payloadTli: "48,600 kg", liftoffThrust: "34,500 kN", stages: 3, propellants: "RP-1 / LOX & LH2 / LOX" } },
  { id: "sls", name: "SLS", category: "Heavy-lift lunar launcher", mission: "Artemis programme", note: "Catalogue choice; mission feasibility is not assessed.", model: null, source: "https://science.nasa.gov/3d-resources/space-launch-system-block-1/", specs: { payloadTli: "27,000 kg", liftoffThrust: "39,100 kN", stages: 2, propellants: "Solid & LH2 / LOX" } },
  { id: "proton", name: "Proton-K/D", category: "Historical robotic launcher", mission: "Soviet lunar exploration", note: "", model: null, source: "https://sma.nasa.gov/LaunchVehicle/assets/proton-kd.pdf", specs: { payloadTli: "5,700 kg", liftoffThrust: "10,530 kN", stages: 4, propellants: "UDMH / N2O4" } },
  { id: "long-march-3b", name: "Long March 3B/E", category: "Robotic lunar launcher", mission: "Chang'e programme", note: "", model: null, source: "https://www.cnsa.gov.cn/english/n6465715/n6465718/c6476890/content.html", specs: { payloadTli: "3,800 kg", liftoffThrust: "5,920 kN", stages: 3, propellants: "UDMH / N2O4 & LH2 / LOX" } },
  { id: "lvm3", name: "LVM3", category: "Heavy-lift launcher", mission: "Chandrayaan programme", note: "", model: null, source: "https://www.isro.gov.in/GSLVmk3_CON.html", specs: { payloadTli: "4,000 kg", liftoffThrust: "10,200 kN", stages: 3, propellants: "Solid, UDMH/N2O4, LH2/LOX" } },
  { id: "h-iia", name: "H-IIA 202", category: "Historical robotic launcher", mission: "Japanese lunar exploration", note: "", model: null, source: "https://global.jaxa.jp/projects/rockets/h2a/index.html", specs: { payloadTli: "2,500 kg", liftoffThrust: "2,245 kN", stages: 2, propellants: "Solid & LH2 / LOX" } },
  { id: "falcon-9", name: "Falcon 9", category: "Reusable orbital launcher", mission: "Commercial lunar delivery", note: "Selecting this rocket does not provide a lunar crew vehicle.", model: null, source: "https://www.spacex.com/vehicles/falcon-9/", specs: { payloadTli: "4,020 kg", liftoffThrust: "7,607 kN", stages: 2, propellants: "RP-1 / LOX" } },
  { id: "vulcan", name: "Vulcan Centaur", category: "Orbital launcher", mission: "Commercial lunar delivery", note: "Catalogue choice; mission feasibility is not assessed.", model: null, source: "https://www.ulalaunch.com/rockets/vulcan-centaur", specs: { payloadTli: "12,100 kg", liftoffThrust: "4,900 kN", stages: 2, propellants: "LCH4 / LOX & LH2 / LOX" } },
  { id: "long-march-5", name: "Long March 5", category: "Heavy-lift robotic launcher", mission: "Chang'e programme", note: "No crew capability is implied.", model: null, source: "https://www.cnsa.gov.cn/english/", specs: { payloadTli: "8,200 kg", liftoffThrust: "10,620 kN", stages: 2, propellants: "RP-1, LH2 / LOX" } },
];

export const rockets = [
  ...originalRockets.map((rocket) => ({ ...rocket,
    isNasa: ["saturn-v", "sls"].includes(rocket.id),
    model: rocket.id === "sls" ? "/sls-block-1.glb" : communityModels[rocket.id] ?? referenceModels[rocket.id] ?? rocket.model,
    note: rocket.id === "sls" ? "NASA Block 1 printable geometry with separate orange insulation, white coating and metal finishes. Surface regions are illustrative, not flight-specific markings." : referenceModels[rocket.id] ? `${rocket.id === "long-march-3b" ? "Based on the 3B configuration. " : ""}Simplified reference model based on published vehicle dimensions; small details and markings are illustrative. Selecting it does not establish mission capability.` : communityModels[rocket.id] ? "Simplified 3D model; a catalogue selection does not establish lunar mission capability." : rocket.note,
    source: rocket.id === "sls" ? "https://science.nasa.gov/3d-resources/space-launch-system-sls-block-1/" : rocket.source,
    modelCredit: rocket.id === "saturn-v" ? "NASA / Michael D. Carbajal" : rocket.id === "sls" ? "NASA / Marshall Space Flight Center · PBR display conversion" : communityModels[rocket.id] ? "John Morris / Uchusen Rockets · MIT" : referenceModels[rocket.id] ? "Illustrative project reference model" : "",
    modelLabel: rocket.id === "saturn-v" ? "NASA GLB" : rocket.id === "sls" ? "NASA mesh / PBR finishes" : communityModels[rocket.id] || referenceModels[rocket.id] ? "Simplified 3D model" : "Model unavailable",
  })),
  { id: "ares-i-a", name: "Ares I · Variant A", category: "Canceled-program crew launcher", mission: "Constellation concept", note: "Official NASA model. Historical concept only: this configuration did not carry astronauts to the Moon. Not a standalone lunar mission vehicle.", model: "/ares-i-a.glb", isNasa: true, modelCredit: "NASA · Ares I variant A", modelLabel: "NASA GLB / canceled programme", source: "https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Ares%201%20(A)", specs: { payloadTli: "N/A (LEO crew)", liftoffThrust: "15,300 kN", stages: 2, propellants: "Solid & LH2 / LOX" } },
  { id: "ares-i-b", name: "Ares I · Variant B", category: "Canceled-program crew launcher", mission: "Constellation concept", note: "Official NASA model. Historical concept only: this configuration did not carry astronauts to the Moon. Not a standalone lunar mission vehicle.", model: "/ares-i-b.glb", isNasa: true, modelCredit: "NASA · Ares I variant B", modelLabel: "NASA GLB / canceled programme", source: "https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Ares%201%20(B)", specs: { payloadTli: "N/A (LEO crew)", liftoffThrust: "15,300 kN", stages: 2, propellants: "Solid & LH2 / LOX" } },
  { id: "jupiter-c", name: "Jupiter-C · Explorer 1", category: "Historical orbital launcher", mission: "Explorer 1", note: "Historical satellite launcher; this vehicle is not a lunar transport vehicle.", model: "/jupiter-c.glb", isNasa: true, modelCredit: "NASA · Explorer Jupiter-C Rocket", modelLabel: "NASA GLB / historical", source: "https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Explorer%20Jupiter-C%20Rocket", specs: { payloadTli: "N/A (LEO 11 kg)", liftoffThrust: "369 kN", stages: 4, propellants: "Hydyne / LOX & Solid" } },
  { id: "ariane-6", name: "Ariane 6 · A64", category: "Orbital launcher", mission: "Ariane 6", note: "Simplified 3D model. This catalogue choice is not a lunar mission feasibility check.", model: "/ariane-6-a64.glb", isNasa: false, modelCredit: "John Morris / Uchusen Rockets · MIT", modelLabel: "Simplified 3D model", source: communitySource, specs: { payloadTli: "8,500 kg", liftoffThrust: "8,000 kN", stages: 2, propellants: "Solid & LH2 / LOX" } },
  { id: "atlas-v", name: "Atlas V · 401", category: "Orbital launcher", mission: "Atlas V", note: "Simplified 3D model. This catalogue choice is not a lunar mission feasibility check.", model: "/atlas-v-401.glb", isNasa: false, modelCredit: "John Morris / Uchusen Rockets · MIT", modelLabel: "Simplified 3D model", source: communitySource, specs: { payloadTli: "4,750 kg", liftoffThrust: "3,827 kN", stages: 2, propellants: "RP-1 / LOX & LH2 / LOX" } },
];

export const destinations = moonMapSites.map((site) => ({ ...site,
  category: "analysisSiteId" in site ? "CLPS landing" : site.id.startsWith("apollo") ? "Historic landing" : "Historic rover",
  surfaceAvailable: false,
}));
export type LaunchSite = typeof launchSites[number];
export type RocketChoice = typeof rockets[number];
