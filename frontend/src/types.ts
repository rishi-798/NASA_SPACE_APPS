export type LandingSite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  mission: string;
  source: string;
};

export type Mission = {
  id: string;
  name: string;
  provider: string;
  lander?: string;
  launchVehicle?: string;
  missionType: "surface" | "flyby" | "orbital-demo";
  lastVerified: string;
  dateLabel: string;
  scheduleNote: string;
  sources: string[];
  year: number;
  landingDate: string;
  siteId: string | null;
  latitude?: number;
  longitude?: number;
  landingArea: string;
  status: "Completed" | "Scheduled" | "In Development" | "Concluded" | "Cancelled";
  objective: string;
  payloads: string[];
  description: string;
  source: string;
};

export type CelestialPosition = {
  azimuth: number;
  elevation: number;
  visible: boolean;
  flat_visible?: boolean;
  terrain_horizon?: number;
  /** Terrain mode only: elevation - terrain_horizon, degrees. */
  terrain_clearance?: number;
  distance_km?: number;
  /** JPL SPICE vector in the Moon ME frame, from the lunar center to the body. */
  moon_fixed_position_km?: [number, number, number];
};

export type VisibilityResponse = {
  site: string | null;
  latitude: number;
  longitude: number;
  time: string;
  sun: CelestialPosition;
  earth: CelestialPosition;
};

export type AnalysisState = "idle" | "loading" | "success" | "error";

export type VisibilitySample = Pick<VisibilityResponse, "time" | "sun" | "earth">;

export type VisibilityInterval = {
  start: string;
  end: string;
  duration_minutes?: number;
  starts_at_range_start?: boolean;
  ends_at_range_end?: boolean;
};

export type MissionSummary = {
  site: string | null;
  start: string;
  end: string;
  step_minutes: number;
  sunlight_percent: number;
  earth_visible_percent: number;
  both_available_percent: number;
  longest_darkness_minutes: number;
  /** Legacy alias of longest_earth_hidden_minutes; no communications link is modelled. */
  longest_comm_blackout_minutes: number;
  longest_earth_hidden_minutes?: number;
  total_minutes?: number;
  windows: {
    sunlight: VisibilityInterval[];
    earth_visible: VisibilityInterval[];
    both: VisibilityInterval[];
  };
};

export type HorizonProfile = {
  site_id: string;
  source: string;
  azimuth_step: number;
  observer_height_m: number;
  horizon: number[];
};

export type TerrainStatus = {
  mode: "terrain_profile" | "flat_horizon" | "flat_horizon_degraded";
  status: string;
  terrain_obstruction_assessed: boolean;
  message: string;
};

/** Response of GET /api/analysis: one sample set behind samples, windows and summary. */
export type AnalysisBundle = {
  schema_version: 1;
  request: { start: string; end: string; step_minutes: number; sample_count: number };
  site: { id: string | null; name: string; latitude: number; longitude: number };
  samples: VisibilitySample[];
  summary: MissionSummary;
  horizon: HorizonProfile | null;
  terrain: TerrainStatus;
};

export type AnalysisResult = {
  /** Conditions at the selected time: the first sample of the analysis window. */
  conditions: VisibilityResponse;
  samples: VisibilitySample[];
  summary: MissionSummary;
  horizon: HorizonProfile | null;
  terrain: TerrainStatus | null;
};
