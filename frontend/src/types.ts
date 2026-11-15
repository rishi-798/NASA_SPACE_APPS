export type LandingSite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  mission: string;
  source: string;
};

export type CelestialPosition = {
  azimuth: number;
  elevation: number;
  visible: boolean;
  flat_visible?: boolean;
  terrain_horizon?: number;
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

export type VisibilityInterval = { start: string; end: string };

export type MissionSummary = {
  site: string | null;
  start: string;
  end: string;
  step_minutes: number;
  sunlight_percent: number;
  earth_visible_percent: number;
  both_available_percent: number;
  longest_darkness_minutes: number;
  longest_comm_blackout_minutes: number;
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
  source_frame: string;
  pixel_resolution_m: number;
  max_distance_m: number;
  min_distance_m: number;
};

export type AnalysisRange = { start: string; end: string; stepMinutes: number };
export type AnalysisResult = {
  schema_version: 1;
  site: { id: string | null; name: string; latitude: number; longitude: number; source: string | null };
  samples: VisibilitySample[];
  summary: MissionSummary;
  horizon: HorizonProfile | null;
  provenance: {
    engine: string; kernels: string[]; frame: string; coordinates: string; geometry: string;
    visibility_rule: string; horizon_mode: string; sampling: string;
    limitations: string[]; sources: string[]; sample_values: boolean;
  };
};
