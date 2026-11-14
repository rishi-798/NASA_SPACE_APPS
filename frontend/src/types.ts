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
};

export type AnalysisResult = {
  conditions: VisibilityResponse;
  samples: VisibilitySample[];
  summary: MissionSummary;
  horizon: HorizonProfile | null;
};
