"""CLPS Lunar Browser API.

Run from the repository root:   uvicorn backend.app:app --reload
Interactive docs:                http://127.0.0.1:8000/docs

Existing routes are preserved unchanged in shape (fields are only added).
Routes are synchronous ``def`` functions, so FastAPI runs them in its
threadpool and SPICE work never blocks the event loop; SPICE itself is
serialised by ``backend.spice_kernels.SPICE_LOCK``.
"""
import logging
import os
from urllib.parse import urlparse

from fastapi import Body as RequestBody, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware

from backend import analysis, methodology
from backend.calculations.sun_earth import (
    calculate_visibility,
    calculate_visibility_window,
    parse_utc_time,
)
from backend.errors import ApiError, api_errors, install_handlers
from backend.frontend import SPAStaticFiles, DIST_DIR
from backend.landing_sites import get_landing_site, load_landing_sites
from backend.mission_summary import summarize_window
from backend.models import (
    ERRORS, AnalysisRequest, AnalysisResponse, CompareRequest, CompareResponse, ReadyResponse,
)
from backend.spice_kernels import kernel_provenance, kernel_status
from backend.terrain.horizon import apply_horizon, load_profile, resolve_horizon
from backend.terrain_api import router as terrain_router
from backend.local_scenes import router as local_scenes_router
from backend.viewer_config20261114 import router as viewer_config_router
from backend.weather.meteomatics import router as weather_router
from backend.media20261114.routes20261114 import router as discovery_router
from backend.media20261114 import apod20261114  # Registers the 2026-11-14 APOD route.
from backend.media20261114 import rovers20261114  # Registers the 2026-11-14 raw rover feed.
from backend.media20261114 import library20261114  # Registers the 2026-11-14 NASA library search.

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="CLPS Lunar Browser API",
    version="2.0",
    description=(
        "Sun and Earth visibility for Athena (IM-2), Odysseus (IM-1) or a custom lunar coordinate, computed "
        "with NAIF SPICE. " + methodology.VIABILITY_STATEMENT
    ),
)
install_handlers(app)
app.include_router(terrain_router)
app.include_router(local_scenes_router)
app.include_router(viewer_config_router)
app.include_router(discovery_router)
app.include_router(weather_router)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
    ).split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type"],
)

NEW = {"responses": ERRORS, "response_model_exclude_unset": True}


# ------------------------------------------------------------- service ---

@app.get("/health", tags=["service"], summary="Liveness only (web server is up)")
def health():
    return {"ok": True}


@app.get("/api/health", tags=["service"], summary="Liveness only (same as /health, under the /api proxy)")
def api_health():
    return {"ok": True}


def _cloud_terrain_status() -> dict:
    """Configuration only: no network calls, no downloads."""
    from terrain import streaming
    from terrain.catalogue import TerrainUnavailable, dataset_root
    status = {"purpose": "Point elevations and regional statistics (/api/terrain/*). Not a horizon profile; "
                         "not used for visibility.",
              "remote_reads_probed": False}
    try:
        base = streaming.base_url()
        status["remote_cog_configured"] = bool(base)
        status["remote_host"] = urlparse(base).hostname if base else None
        status["release_pinned"] = "/resolve/" in base and not base.rstrip("/").endswith("/main") if base else False
    except ValueError as exc:
        status.update(remote_cog_configured=False, remote_error=str(exc))
    try:
        root = dataset_root()
        status["dataset_manifest_present"] = (root / "moon-dataset.json").is_file()
        status["catalogue_index_present"] = (root / "moon-grid-index.sqlite").is_file()
    except TerrainUnavailable as exc:
        status.update(dataset_manifest_present=False, catalogue_index_present=False, dataset_error=str(exc))
    status["point_elevation_available"] = bool(status.get("dataset_manifest_present"))
    return status


@app.get("/api/ready", response_model=ReadyResponse, tags=["service"],
         responses={503: {"model": ReadyResponse, "description": "Calculations cannot run"}},
         summary="Scientific readiness: kernels, terrain profiles, cloud terrain configuration")
def ready():
    calc = kernel_status()
    calc["kernels"] = kernel_provenance()["files"]
    profiles = []
    for site in load_landing_sites():
        try:
            _, info = resolve_horizon(site, allow_flat_fallback=True)
        except Exception as exc:  # noqa: BLE001
            info = {"mode": "unknown", "status": "error", "terrain_obstruction_assessed": False, "message": str(exc)}
        profiles.append({"site_id": site["id"], **{k: info[k] for k in
                         ("mode", "status", "terrain_obstruction_assessed", "message")}})
    body = {"ready": calc["available"], "calculations": calc, "terrain_profiles": profiles,
            "cloud_terrain": _cloud_terrain_status(), "cache": analysis.CACHE.stats()}
    return JSONResponse(status_code=200 if calc["available"] else 503, content=body)


@app.get("/api/methodology", tags=["service"], summary="Model, assumptions, limitations, what 'viability' means")
def get_methodology():
    return {
        "viability_statement": methodology.VIABILITY_STATEMENT,
        "viability_detail": methodology.VIABILITY_DETAIL,
        "engineering_checks": methodology.ENGINEERING_CHECKS,
        "model": methodology.MODEL,
        "assumptions": methodology.ASSUMPTIONS,
        "limitations": methodology.LIMITATIONS,
        "sources": methodology.SOURCES,
        "limits": {"max_samples_per_location": analysis.MAX_WINDOW_SAMPLES,
                   "step_minutes": [1, analysis.MAX_STEP_MINUTES], "default_step_minutes": analysis.DEFAULT_STEP_MINUTES},
    }


# --------------------------------------------------------------- sites ---

@app.get("/api/sites", tags=["sites"], summary="Landing sites (data/landing_sites.json)")
def landing_sites():
    return load_landing_sites()


@app.get("/api/sites/{site_id}", tags=["sites"], responses=ERRORS, summary="One site with its terrain status")
def landing_site(site_id: str):
    with api_errors():
        site = get_landing_site(site_id)
        _, info = resolve_horizon(site, allow_flat_fallback=True)
        return {**site, "terrain": info}


@app.get("/api/sites/{site_id}/horizon", tags=["sites"], responses=ERRORS,
         summary="Terrain-horizon bins used by the calculation, or null when the site has no profile")
def site_horizon(site_id: str):
    """Returns the same profile used by visibility; `null` = genuinely no profile;
    503 = a configured profile is missing or corrupt (never silently null)."""
    with api_errors():
        return load_profile(get_landing_site(site_id))


# ------------------------------------------- existing calculation routes ---

@app.get("/api/sites/{site_id}/visibility", tags=["legacy"], responses=ERRORS)
def site_visibility(site_id: str, time: str = Query(...)):
    with api_errors():
        site = get_landing_site(site_id)
        result = calculate_visibility(site["latitude"], site["longitude"], time)
        result["site"] = site_id
        return apply_horizon(result, load_profile(site))


def _site_window(site: dict, start: str, end: str, step_minutes: int) -> list[dict]:
    profile = load_profile(site)
    samples = calculate_visibility_window(
        site["latitude"], site["longitude"], start, end, step_minutes
    )
    return [apply_horizon(sample, profile) for sample in samples]


@app.get("/api/sites/{site_id}/visibility/window", tags=["legacy"], responses=ERRORS)
def site_visibility_window(
    site_id: str,
    start: str = Query(...),
    end: str = Query(...),
    step_minutes: int = Query(30, ge=1),
):
    with api_errors():
        return _site_window(get_landing_site(site_id), start, end, step_minutes)


@app.get("/api/sites/{site_id}/summary", tags=["legacy"], responses=ERRORS)
def site_summary(
    site_id: str,
    start: str = Query(...),
    end: str = Query(...),
    step_minutes: int = Query(30, ge=1),
):
    with api_errors():
        site = get_landing_site(site_id)
        if parse_utc_time(end) <= parse_utc_time(start):
            raise ValueError("summary end must be after start")
        samples = _site_window(site, start, end, step_minutes)
        return summarize_window(site_id, samples, start, end, step_minutes)


@app.get("/api/visibility", tags=["legacy"], responses=ERRORS)
def visibility(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    time: str = Query(...),
):
    with api_errors():
        return calculate_visibility(lat, lon, time)


@app.get("/api/visibility/window", tags=["legacy"], responses=ERRORS)
def visibility_window(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    start: str = Query(...),
    end: str = Query(...),
    step_minutes: int = Query(30, ge=1),
):
    with api_errors():
        return calculate_visibility_window(lat, lon, start, end, step_minutes)


@app.get("/api/summary", tags=["legacy"], responses=ERRORS)
def coordinate_summary(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    start: str = Query(...),
    end: str = Query(...),
    step_minutes: int = Query(30, ge=1),
):
    with api_errors():
        if parse_utc_time(end) <= parse_utc_time(start):
            raise ValueError("summary end must be after start")
        samples = calculate_visibility_window(lat, lon, start, end, step_minutes)
        return summarize_window(None, samples, start, end, step_minutes)


# ------------------------------------------------- analysis & comparison ---

@app.get("/api/analysis", response_model=AnalysisResponse, tags=["analysis"], **NEW,
         summary="One bundle: request, site, samples, summary, horizon, terrain status, provenance")
def get_analysis(
    site_id: str | None = None,
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    start: str | None = Query(None, description="ISO-8601 with timezone. Default: 00:00 UTC today."),
    end: str | None = Query(None, description="Default: start + 24 h."),
    step_minutes: int | None = Query(None, ge=1, le=analysis.MAX_STEP_MINUTES, description="Default 30."),
    allow_flat_fallback: bool = False,
    name: str | None = Query(None, max_length=80),
):
    with api_errors():
        return analysis.build_analysis(site_id, lat, lon, start, end, step_minutes,
                                       allow_flat_fallback=allow_flat_fallback, name=name)


@app.post("/api/analysis", response_model=AnalysisResponse, tags=["analysis"], **NEW,
          summary="Same as GET /api/analysis with a JSON body")
def post_analysis(body: AnalysisRequest = RequestBody(...)):
    with api_errors():
        return analysis.build_analysis(body.site_id, body.lat, body.lon, body.start, body.end, body.step_minutes,
                                       allow_flat_fallback=body.allow_flat_fallback, name=body.name)


@app.get("/api/compare", response_model=CompareResponse, tags=["analysis"], **NEW,
         summary="Athena vs Odysseus over one shared range and sample grid")
def get_compare(
    start: str | None = None,
    end: str | None = None,
    step_minutes: int | None = Query(None, ge=1, le=analysis.MAX_STEP_MINUTES),
):
    with api_errors():
        return analysis.build_comparison(start, end, step_minutes)


@app.post("/api/compare", response_model=CompareResponse, tags=["analysis"], **NEW,
          summary="Same as GET /api/compare with a JSON body")
def post_compare(body: CompareRequest = RequestBody(...)):
    with api_errors():
        return analysis.build_comparison(body.start, body.end, body.step_minutes, body.site_ids)


# Register last so API errors stay JSON. Build with `npm run build` first.
app.mount("/", SPAStaticFiles(directory=DIST_DIR, html=True, check_dir=False), name="frontend")
