"""Pydantic models documenting the API contract in OpenAPI (/docs).

Models allow extra fields so existing response keys pass through unchanged.
Units: degrees, kilometres, minutes; timestamps ISO-8601 UTC ending in 'Z'.
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Open(BaseModel):
    model_config = ConfigDict(extra="allow")


class ErrorInfo(_Open):
    code: str = Field(description="invalid_request | too_many_samples | outside_kernel_coverage | unknown_site | "
                                  "kernels_unavailable | terrain_unavailable | terrain_data_unavailable | "
                                  "external_data_timeout | calculation_failed | internal_error")
    message: str
    details: Optional[dict] = None


class ErrorResponse(_Open):
    detail: object = Field(description="User-safe message (string), or FastAPI's list for validation errors.")
    error: ErrorInfo


ERRORS = {
    404: {"model": ErrorResponse, "description": "Unknown site"},
    422: {"model": ErrorResponse, "description": "Invalid request, too many samples, or outside kernel coverage"},
    502: {"model": ErrorResponse, "description": "SPICE calculation failed"},
    503: {"model": ErrorResponse, "description": "Kernels unavailable, or configured terrain profile unavailable"},
}


class Body(_Open):
    azimuth: float = Field(description="Degrees clockwise from local north, [0, 360).")
    elevation: float = Field(description="Geometric centre elevation above the local horizontal plane, degrees.")
    visible: bool = Field(description="AUTHORITATIVE: elevation above the horizon in use (terrain or flat).")
    distance_km: Optional[float] = None
    moon_fixed_position_km: Optional[list[float]] = Field(None, description="Moon-centre-to-body vector in MOON_ME, km.")
    flat_visible: Optional[bool] = Field(None, description="Terrain mode only: elevation > 0, ignoring terrain.")
    terrain_horizon: Optional[float] = Field(None, description="Terrain mode only: horizon elevation at this azimuth, degrees.")
    terrain_clearance: Optional[float] = Field(None, description="Terrain mode only: elevation - terrain_horizon, degrees.")


class Sample(_Open):
    time: str
    sun: Body
    earth: Body
    both_visible: Optional[bool] = Field(None, description="Analysis bundle only.")
    status: Optional[str] = Field(None, description="Analysis bundle only, e.g. 'both visible at this sample'.")


class Window(_Open):
    start: str
    end: str
    duration_minutes: float
    starts_at_range_start: bool
    ends_at_range_end: bool


class Windows(_Open):
    sunlight: list[Window]
    earth_visible: list[Window]
    both: list[Window]


class Summary(_Open):
    site: Optional[str]
    start: str
    end: str
    step_minutes: int
    total_minutes: float
    sunlight_percent: float
    earth_visible_percent: float
    both_available_percent: float
    longest_darkness_minutes: float
    longest_earth_hidden_minutes: float
    longest_comm_blackout_minutes: float = Field(description="Legacy alias of longest_earth_hidden_minutes. No link is modelled.")
    longest_joint_window_minutes: float
    windows: Windows


class Terrain(_Open):
    mode: Literal["terrain_profile", "flat_horizon", "flat_horizon_degraded"]
    status: Literal["profile_loaded", "profile_generated", "no_profile_for_location", "configured_profile_missing",
                    "configured_profile_invalid", "on_demand_failed", "on_demand_disabled", "not_requested"]
    terrain_obstruction_assessed: bool
    message: str
    profile_metadata: Optional[dict]


class RequestEcho(_Open):
    start: str
    end: str
    step_minutes: int
    sample_count: int
    defaults_applied: list[str]


class AnalysisResponse(_Open):
    schema_version: Literal[1]
    request: RequestEcho
    site: dict
    samples: list[Sample]
    summary: Summary
    horizon: Optional[dict] = Field(description="Raw terrain-horizon profile (azimuth_step, horizon[] bins, metadata) or null.")
    terrain: Terrain
    engineering_checks: dict
    provenance: dict
    assumptions: list[str]
    limitations: list[str]
    warnings: list[str]


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    site_id: Optional[str] = Field(None, examples=["athena-im2"])
    lat: Optional[float] = Field(None, ge=-90, le=90, allow_inf_nan=False)
    lon: Optional[float] = Field(None, ge=-180, le=180, allow_inf_nan=False, description="East-positive.")
    name: Optional[str] = Field(None, max_length=80, description="Label for a custom coordinate.")
    start: Optional[str] = Field(None, examples=["2026-10-12T00:00:00Z"], description="Timezone-aware ISO-8601. Default 00:00 UTC today.")
    end: Optional[str] = Field(None, examples=["2026-10-13T00:00:00Z"], description="Default start + 24 h.")
    step_minutes: Optional[int] = Field(None, ge=1, le=1440, description="Default 30.")
    allow_flat_fallback: bool = Field(False, description="If a configured terrain profile is unusable, return an explicitly DEGRADED flat-horizon result instead of 503.")
    terrain_mode: Literal["auto", "flat"] = Field("auto", description="auto: best available horizon (saved LOLA profile, or an on-demand LOLA profile for custom points south of ~81.3 S). flat: explicitly skip terrain.")


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: Optional[str] = None
    end: Optional[str] = None
    step_minutes: Optional[int] = Field(None, ge=1, le=1440)
    site_ids: Optional[list[str]] = Field(None, description="Must be exactly athena-im2 and odysseus-im1 (default).")


class SiteResult(_Open):
    site_id: str
    ok: bool
    analysis: Optional[AnalysisResponse]
    error: Optional[ErrorInfo]


class CompareResponse(_Open):
    schema_version: Literal[1]
    request: RequestEcho
    shared_sample_times: bool
    sites: list[SiteResult]
    table: list[dict]
    comparison_notes: list[str]


class ReadyResponse(_Open):
    ready: bool
    calculations: dict
    terrain_profiles: list[dict]
    cloud_terrain: dict
    cache: dict
