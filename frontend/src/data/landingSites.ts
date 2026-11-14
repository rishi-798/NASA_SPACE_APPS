import landingSiteRecords from "../../../data/landing_sites.json";
import missionRecords from "../../../data/missions.json";
import type { LandingSite } from "../types";

export const landingSites = landingSiteRecords as LandingSite[];
export const missionRecordCount = (missionRecords as unknown[]).length;
