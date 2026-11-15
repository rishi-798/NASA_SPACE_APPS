import landingSiteRecords from "../../../data/landing_sites.json";
import missionRecords from "../../../data/missions.json";
import type { LandingSite, Mission } from "../types";

export const landingSites = landingSiteRecords as LandingSite[];
export const missions = missionRecords as Mission[];
export const missionRecordCount = missions.length;
