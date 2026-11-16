import type { AnalysisResult } from "../types";

/** earth, rocket, moon, landing (conditions) → preparing → flight → simulate (landing simulation) → reveal (overview). */
export type TripStage = "earth" | "rocket" | "moon" | "landing" | "preparing" | "flight" | "simulate" | "reveal";
export type LandingPoint = { latitude: number; longitude: number; name?: string; destinationId?: string };
export type MissionRecord = {
  version: 1; stage: TripStage; departureId: string | null; rocketId: string | null;
  landing: LandingPoint | null; utcTime: string; transferDepartureUtcTime: string; parkingAltitudeKm: number; revision: number;
  result: AnalysisResult | null; resultRevision: number | null; error: string | null;
};
export type MissionAction =
  | { type: "departure"; id: string; compatibleRocketIds: string[] }
  | { type: "rocket"; id: string }
  | { type: "landing"; point: LandingPoint }
  | { type: "time"; time: string }
  | { type: "transfer-departure"; time: string }
  | { type: "parking-altitude"; altitude: number }
  | { type: "stage"; stage: TripStage }
  | { type: "prepare" }
  /** Finalize with a preview result already computed for this exact revision (no new request). */
  | { type: "plan"; revision: number; result: AnalysisResult }
  | { type: "result"; revision: number; result: AnalysisResult }
  | { type: "error"; revision: number; error: string }
  | { type: "reset" };

export function newMission(): MissionRecord {
  const now = new Date().toISOString().slice(0, 16) + ":00Z";
  return { version: 1, stage: "earth", departureId: null, rocketId: null, landing: null,
    utcTime: new Date(Date.parse(now)+96*3600000).toISOString(), transferDepartureUtcTime: now, parkingAltitudeKm: 200, revision: 0, result: null, resultRevision: null, error: null };
}
export function missionReady(mission: MissionRecord) {
  return Boolean(mission.departureId && mission.rocketId && mission.landing && Number.isFinite(Date.parse(mission.utcTime)));
}
function invalidate(mission: MissionRecord): MissionRecord {
  return { ...mission, revision: mission.revision + 1, result: null, resultRevision: null, error: null };
}
export function missionReducer(mission: MissionRecord, action: MissionAction): MissionRecord {
  switch (action.type) {
    case "departure": return { ...invalidate(mission), departureId: action.id,
      rocketId: mission.rocketId && action.compatibleRocketIds.includes(mission.rocketId) ? mission.rocketId : null, stage: "earth" };
    case "rocket": return { ...invalidate(mission), rocketId: action.id, stage: "rocket" };
    case "landing": {
      const { latitude, longitude } = action.point;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return mission;
      return { ...invalidate(mission), landing: { ...action.point }, stage: "moon" };
    }
    case "transfer-departure": return Number.isFinite(Date.parse(action.time)) ? { ...invalidate(mission), transferDepartureUtcTime: action.time } : mission;
    case "parking-altitude": return Number.isFinite(action.altitude) && action.altitude >= 160 && action.altitude <= 2000
      ? { ...invalidate(mission), parkingAltitudeKm: action.altitude } : mission;
    case "time": return Number.isFinite(Date.parse(action.time)) ? { ...invalidate(mission), utcTime: action.time } : mission;
    case "stage": {
      if (action.stage !== "earth" && !mission.departureId) return mission;
      if (["moon", "landing", "preparing", "flight", "simulate", "reveal"].includes(action.stage) && !mission.rocketId) return mission;
      if (["landing", "preparing", "flight", "simulate", "reveal"].includes(action.stage) && !mission.landing) return mission;
      if (["flight", "simulate", "reveal"].includes(action.stage) && mission.resultRevision !== mission.revision) return mission;
      return { ...mission, stage: action.stage, error: null };
    }
    case "prepare": return missionReady(mission) ? { ...mission, stage: "preparing", result: null, resultRevision: null, error: null } : mission;
    case "plan": return action.revision === mission.revision && missionReady(mission)
      ? { ...mission, result: action.result, resultRevision: action.revision, stage: "flight", error: null } : mission;
    case "result": return action.revision === mission.revision && mission.stage === "preparing"
      ? { ...mission, result: action.result, resultRevision: action.revision, stage: "flight", error: null } : mission;
    case "error": return action.revision === mission.revision && mission.stage === "preparing"
      ? { ...mission, stage: "landing", error: action.error, result: null, resultRevision: null } : mission;
    case "reset": return { ...newMission(), revision: mission.revision + 1 };
  }
}

export function restoreMission(raw: string | null, departures: string[], rocketIds: string[]): MissionRecord {
  const empty = newMission();
  if (!raw) return empty;
  try {
    const data = JSON.parse(raw) as Partial<MissionRecord>;
    if (data.version !== 1 || !data.departureId || !departures.includes(data.departureId)) return empty;
    let mission: MissionRecord = { ...empty, departureId: data.departureId };
    if (data.rocketId && rocketIds.includes(data.rocketId)) mission.rocketId = data.rocketId;
    if (data.landing && typeof data.landing === "object") mission = missionReducer(mission, { type: "landing", point: data.landing });
    if (typeof data.utcTime === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(data.utcTime)) mission = missionReducer(mission, { type: "time", time: data.utcTime });
    if (typeof data.transferDepartureUtcTime === "string" && Number.isFinite(Date.parse(data.transferDepartureUtcTime)))
      mission = missionReducer(mission, {type:"transfer-departure", time:data.transferDepartureUtcTime});
    else mission.transferDepartureUtcTime = new Date(Date.parse(mission.utcTime)-96*3600000).toISOString();
    if (typeof data.parkingAltitudeKm === "number") mission = missionReducer(mission, {type:"parking-altitude", altitude:data.parkingAltitudeKm});
    // Restore editable progress, never persisted calculations. Completed/active
    // simulations return to conditions so results are recalculated for this session.
    const stages: TripStage[] = ["earth", "rocket", "moon", "landing", "preparing", "flight", "simulate", "reveal"];
    const savedStage = stages.includes(data.stage as TripStage) ? data.stage! : "earth";
    let stage: TripStage = ["preparing", "flight", "simulate", "reveal"].includes(savedStage) ? "landing" : savedStage;
    if (stage !== "earth" && stage !== "rocket" && !mission.rocketId) stage = "rocket";
    if (stage === "landing" && !mission.landing) stage = "moon";
    return missionReducer({ ...mission, stage: "earth" }, { type: "stage", stage });
  } catch { return empty; }
}
