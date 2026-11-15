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

export type ComparisonRow = {
  site_id: string;
  name: string;
  mission: string;
  horizon_mode: TerrainStatus["mode"];
  terrain_obstruction_assessed: boolean;
  sunlight_percent: number;
  earth_visible_percent: number;
  both_available_percent: number;
  longest_darkness_minutes: number;
  longest_earth_hidden_minutes: number;
  longest_joint_window_minutes: number;
};

export type ComparisonSiteResult = {
  site_id: string;
  ok: boolean;
  analysis: AnalysisBundle | null;
  error: { code: string; message: string } | null;
};

/** Response of GET /api/compare. Failed sites are listed in `sites` with their error, never omitted. */
export type ComparisonResult = {
  schema_version: 1;
  request: { start: string; end: string; step_minutes: number; sample_count: number };
  shared_sample_times: boolean;
  sites: ComparisonSiteResult[];
  table: ComparisonRow[];
  comparison_notes: string[];
};

export type PowerAssessment = {
  site: { name: string; latitude: number; longitude: number; terrain_mode: string };
  mission_window: { start: string; end: string; step_minutes: number; duration_hours: number };
  payload_configuration: {
    solar_array_area_m2: number;
    cell_efficiency_pct: number;
    array_orientation: string;
    base_power_load_w: number;
    battery_capacity_wh: number;
    initial_soc_pct: number;
  };
  summary: {
    total_energy_generated_kwh: number;
    total_energy_consumed_kwh: number;
    net_energy_balance_kwh: number;
    peak_generation_w: number;
    minimum_battery_soc_pct: number;
    final_battery_soc_pct: number;
    power_survivable: boolean;
    assessment: string;
  };
};

export type VolatilesAssessment = {
  coordinates: { lat: number; lon: number };
  is_polar_region: boolean;
  volatile_potential_score: number;
  classification: string;
  thermal_regime: string;
  estimated_diurnal_range_k: { min_k: number; max_k: number };
  ice_stability: {
    regime: string;
    estimated_depth_to_ice_table_m: number | null;
    drilling_feasibility: string;
  };
  nearest_cold_trap: {
    id: string;
    name: string;
    distance_km: number;
    distance_m: number;
    azimuth_deg: number;
    crater_diameter_km: number;
    crater_depth_km: number;
    psr_area_km2: number;
    min_measured_temperature_k: number;
    water_ice_confirmed: boolean;
    confirmation_source: string;
  };
  scientific_disclaimer: string;
};
