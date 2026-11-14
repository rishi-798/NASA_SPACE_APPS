import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from backend.calculations.sun_earth import (
    SpiceCalculationError,
    calculate_visibility,
    calculate_visibility_window,
    parse_utc_time,
)
from backend.landing_sites import get_landing_site, load_landing_sites
from backend.mission_summary import summarize_window
from backend.spice_kernels import KernelError
from backend.terrain.horizon import HorizonError, apply_horizon, load_profile
from backend.frontend import SPAStaticFiles, DIST_DIR
from backend.terrain_api import router as terrain_router
from backend.viewer_config20261114 import router as viewer_config_router
from backend.media20261114.routes20261114 import router as discovery_router
from backend.media20261114 import apod20261114  # Registers the 2026-11-14 APOD route.
from backend.media20261114 import rovers20261114  # Registers the 2026-11-14 raw rover feed.
from backend.media20261114 import library20261114  # Registers the 2026-11-14 NASA library search.

app = FastAPI(title="CLPS Lunar Browser API")
app.include_router(terrain_router)
app.include_router(viewer_config_router)
app.include_router(discovery_router)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
    ).split(",") if origin.strip()],
    allow_methods=["GET"],
    allow_headers=["Accept"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/sites")
def landing_sites():
    return load_landing_sites()


@app.get("/api/sites/{site_id}/horizon")
def site_horizon(site_id: str):
    """Return the same terrain bins used by the visibility calculation, or null."""
    try:
        site = get_landing_site(site_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="landing site not found") from exc
    try:
        return load_profile(site)
    except HorizonError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/sites/{site_id}/visibility")
def site_visibility(site_id: str, time: str = Query(...)):
    try:
        site = get_landing_site(site_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="landing site not found") from exc

    try:
        result = calculate_visibility(site["latitude"], site["longitude"], time)
        result["site"] = site_id
        return apply_horizon(result, load_profile(site))
    except HorizonError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except KernelError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SpiceCalculationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _site_window(site: dict, start: str, end: str, step_minutes: int) -> list[dict]:
    profile = load_profile(site)
    samples = calculate_visibility_window(
        site["latitude"], site["longitude"], start, end, step_minutes
    )
    return [apply_horizon(sample, profile) for sample in samples]


@app.get("/api/sites/{site_id}/visibility/window")
def site_visibility_window(
    site_id: str,
    start: str = Query(...),
    end: str = Query(...),
    step_minutes: int = Query(30, ge=1),
):
    try:
        site = get_landing_site(site_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="landing site not found") from exc
    try:
        return _site_window(site, start, end, step_minutes)
    except HorizonError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except KernelError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SpiceCalculationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/sites/{site_id}/summary")
def site_summary(
    site_id: str,
    start: str = Query(...),
    end: str = Query(...),
    step_minutes: int = Query(30, ge=1),
):
    try:
        site = get_landing_site(site_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="landing site not found") from exc
    try:
        if parse_utc_time(end) <= parse_utc_time(start):
            raise ValueError("summary end must be after start")
        samples = _site_window(site, start, end, step_minutes)
        return summarize_window(site_id, samples, start, end, step_minutes)
    except HorizonError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except KernelError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SpiceCalculationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/visibility")
def visibility(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    time: str = Query(...),
):
    try:
        return calculate_visibility(lat, lon, time)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except KernelError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SpiceCalculationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/visibility/window")
def visibility_window(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    start: str = Query(...),
    end: str = Query(...),
    step_minutes: int = Query(30, ge=1),
):
    try:
        return calculate_visibility_window(lat, lon, start, end, step_minutes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except KernelError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SpiceCalculationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/summary")
def coordinate_summary(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    start: str = Query(...),
    end: str = Query(...),
    step_minutes: int = Query(30, ge=1),
):
    try:
        if parse_utc_time(end) <= parse_utc_time(start):
            raise ValueError("summary end must be after start")
        samples = calculate_visibility_window(lat, lon, start, end, step_minutes)
        return summarize_window(None, samples, start, end, step_minutes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except KernelError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SpiceCalculationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# Register last so API errors stay JSON. Build with `npm run build` first.
app.mount("/", SPAStaticFiles(directory=DIST_DIR, html=True, check_dir=False), name="frontend")
