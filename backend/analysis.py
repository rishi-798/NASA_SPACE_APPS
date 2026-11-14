"""Analysis bundle and Athena/Odysseus comparison.

One authoritative sample set per location: the samples come from the existing
``calculate_visibility_window`` + ``apply_horizon``, and the summary/windows are
computed by ``summarize_window`` from exactly those samples. Nothing here
re-implements the geometry.
"""
import copy
import hashlib
import logging
import threading
from collections import OrderedDict
from datetime import datetime, timedelta, timezone

from backend import methodology
from backend.calculations.sun_earth import (
    MAX_WINDOW_SAMPLES,
    calculate_visibility_window,
    parse_utc_time,
    validate_coordinates,
)
from backend.errors import ApiError, classify
from backend.landing_sites import comparison_site_ids, get_landing_site
from backend.mission_summary import summarize_window
from backend.spice_kernels import KERNEL_FILES, coverage, kernel_fingerprint, kernel_provenance, load_spice_kernels
from backend.terrain import on_demand
from backend.terrain.horizon import apply_horizon, profile_metadata, profile_path, resolve_horizon

log = logging.getLogger("backend.analysis")

ANALYSIS_SCHEMA_VERSION = 1  # additive changes only; the existing frontend checks for 1
DEFAULT_STEP_MINUTES = 30
MAX_STEP_MINUTES = 1440

HORIZON_MODE_LABELS = {
    "terrain_profile": "LOLA terrain",
    "flat_horizon": "Flat horizon — terrain unavailable",
    "flat_horizon_degraded": "Flat horizon — DEGRADED: terrain horizon unavailable",
}
STATUS_LABELS = {  # more specific labels where the status adds information
    "profile_generated": "LOLA terrain (generated for this coordinate)",
    "not_requested": "Flat horizon — terrain not requested",
}


# ----------------------------------------------------------------- request

def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def normalize_range(start: str | None, end: str | None, step_minutes: int | None) -> dict:
    """Validate and normalise a UTC range. Defaults: today 00:00 UTC, +24 h, 30 min."""
    defaults = []
    if start is None:
        start_time = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        defaults.append("start")
    else:
        start_time = parse_utc_time(start)
    if end is None:
        end_time = start_time + timedelta(days=1)
        defaults.append("end")
    else:
        end_time = parse_utc_time(end)
    if step_minutes is None:
        step_minutes = DEFAULT_STEP_MINUTES
        defaults.append("step_minutes")
    if isinstance(step_minutes, bool) or not isinstance(step_minutes, int) or not 1 <= step_minutes <= MAX_STEP_MINUTES:
        raise ValueError(f"step_minutes must be an integer from 1 to {MAX_STEP_MINUTES}")
    if end_time <= start_time:
        raise ValueError("end must be after start")
    count = (end_time - start_time) // timedelta(minutes=step_minutes) + 1
    if count > MAX_WINDOW_SAMPLES:
        raise ApiError(422, "too_many_samples",
                       f"This range needs {count} samples per location; the limit is {MAX_WINDOW_SAMPLES}. "
                       "Shorten the range or increase step_minutes.",
                       {"sample_count": count, "max_samples": MAX_WINDOW_SAMPLES})
    low, high = coverage()  # loads kernels; KernelError -> 503
    if start_time < low or end_time > high:
        raise ApiError(422, "outside_kernel_coverage",
                       f"The range must lie within the loaded ephemeris coverage, {low:%Y-%m-%d} to {high:%Y-%m-%d} UTC.",
                       {"coverage_start": _iso(low), "coverage_end": _iso(high)})
    return {"start": _iso(start_time), "end": _iso(end_time), "step_minutes": step_minutes,
            "sample_count": count, "defaults_applied": defaults}


def resolve_site(site_id: str | None, lat: float | None, lon: float | None, name: str | None = None) -> dict:
    if site_id is not None:
        if lat is not None or lon is not None:
            raise ValueError("choose a site or coordinates, not both")
        site = get_landing_site(site_id)  # KeyError -> 404
        return {**site, "kind": "named"}
    if lat is None or lon is None:
        raise ValueError("choose a site or provide lat and lon")
    lat, lon = validate_coordinates(float(lat), float(lon))
    return {"id": None, "name": name or "Selected map coordinate", "latitude": lat, "longitude": lon,
            "source": None, "kind": "custom", "horizon_profile": None,
            "coordinate_source": "User-selected coordinate (MOON_ME, planetocentric latitude, east-positive longitude)."}


# ------------------------------------------------------------------- cache

class _LRU:
    def __init__(self, size: int):
        self.size, self.data, self.lock = size, OrderedDict(), threading.Lock()
        self.hits = self.misses = 0

    def get(self, key):
        with self.lock:
            if key in self.data:
                self.data.move_to_end(key)
                self.hits += 1
                return self.data[key]
            self.misses += 1
            return None

    def put(self, key, value):
        with self.lock:
            self.data[key] = value
            self.data.move_to_end(key)
            while len(self.data) > self.size:
                self.data.popitem(last=False)

    def clear(self):
        with self.lock:
            self.data.clear()
            self.hits = self.misses = 0

    def stats(self):
        with self.lock:
            return {"entries": len(self.data), "max_entries": self.size, "hits": self.hits, "misses": self.misses}


CACHE = _LRU(32)


def _profile_fingerprint(site: dict) -> str:
    path, _ = profile_path(site)
    if path is None:
        return "none"
    if not path.is_file():
        return f"missing:{path.name}"
    stat = path.stat()
    return hashlib.sha256(f"{path}:{stat.st_mtime_ns}:{stat.st_size}".encode()).hexdigest()[:16]


# ---------------------------------------------------------------- analysis

def _label(sun: bool, earth: bool) -> str:
    if sun and earth:
        return "both visible at this sample"
    if sun:
        return "sun visible, earth hidden at this sample"
    if earth:
        return "earth visible, sun hidden at this sample"
    return "neither visible at this sample"


TERRAIN_MODES = ("auto", "flat")
FLAT_MESSAGE = (
    "Visibility uses a flat local horizon (elevation > 0 deg). Terrain obstruction is NOT assessed: nearby ridges "
    "or crater rims may hide the Sun or Earth when this says visible. Lower confidence than a terrain-aware result."
)


def _custom_terrain(site: dict, allow_flat_fallback: bool):
    """On-demand LOLA horizon for a custom coordinate. Returns (profile | None, terrain_info)."""
    try:
        profile, info = on_demand.get_profile(site["latitude"], site["longitude"])
    except on_demand.OnDemandTerrainError as exc:
        if not allow_flat_fallback:
            raise
        return None, {
            "mode": "flat_horizon_degraded", "status": "on_demand_failed", "terrain_obstruction_assessed": False,
            "message": f"{exc} This point is inside the LOLA DEM coverage, so a terrain horizon exists but could not "
                       "be computed now. Results use a flat local horizon and are DEGRADED.",
            "profile_metadata": None,
        }
    if profile is None:
        status = "on_demand_disabled" if info["status"] == "disabled" else "no_profile_for_location"
        return None, {"mode": "flat_horizon", "status": status, "terrain_obstruction_assessed": False,
                      "message": f"{info['message']} {FLAT_MESSAGE}", "profile_metadata": None}
    log.info("On-demand horizon for %s,%s (cache %s)", site["latitude"], site["longitude"], info["cache"])
    meta = profile_metadata(profile)
    return profile, {
        "mode": "terrain_profile", "status": "profile_generated", "terrain_obstruction_assessed": True,
        "message": (
            f"LOLA terrain-horizon profile generated for this exact coordinate from LDEM_80S_80MPP_ADJ "
            f"({meta['pixel_resolution_m']:.0f} m/pixel, {meta['max_distance_m'] / 1000:.0f} km radius, "
            f"terrain within {meta['min_distance_m']:.0f} m excluded, {meta['observer_height_m']:g} m observer). "
            "A target is visible only when its centre is above the terrain horizon at its azimuth."
        ),
        "profile_metadata": meta,
        "profile_key": info["key"],
    }


def build_analysis(site_id=None, lat=None, lon=None, start=None, end=None, step_minutes=None, *,
                   allow_flat_fallback: bool = False, name: str | None = None, terrain_mode: str = "auto") -> dict:
    """Synchronous; FastAPI runs it in its threadpool. SPICE calls take SPICE_LOCK.

    terrain_mode: "auto" uses the best available horizon (a site's saved LOLA profile, or an on-demand
    LOLA profile for a custom south-polar coordinate); "flat" explicitly skips terrain.
    """
    if terrain_mode not in TERRAIN_MODES:
        raise ValueError(f"terrain_mode must be one of: {', '.join(TERRAIN_MODES)}")
    site = resolve_site(site_id, lat, lon, name)
    request = normalize_range(start, end, step_minutes)
    if terrain_mode == "flat":
        profile, terrain = None, {
            "mode": "flat_horizon", "status": "not_requested", "terrain_obstruction_assessed": False,
            "message": f"Terrain horizon not requested (terrain_mode=flat). {FLAT_MESSAGE}", "profile_metadata": None}
    elif site["kind"] == "custom":
        profile, terrain = _custom_terrain(site, allow_flat_fallback)
    else:
        profile, terrain = resolve_horizon(site, allow_flat_fallback=allow_flat_fallback)

    key = (site.get("id"), site["latitude"], site["longitude"], _profile_fingerprint(site), terrain["status"],
           terrain.pop("profile_key", None), request["start"], request["end"], request["step_minutes"],
           kernel_fingerprint())
    cached = CACHE.get(key)
    if cached is None:
        cached = _compute(site, request, profile, terrain)
        CACHE.put(key, cached)
    result = copy.deepcopy(cached)  # callers may mutate; the cache must not change
    result["request"]["defaults_applied"] = request["defaults_applied"]
    return result


def _compute(site: dict, request: dict, profile, terrain: dict) -> dict:
    samples = calculate_visibility_window(site["latitude"], site["longitude"], request["start"], request["end"],
                                          request["step_minutes"])
    samples = [apply_horizon(sample, profile) for sample in samples]
    summary = summarize_window(site.get("id"), samples, request["start"], request["end"], request["step_minutes"])
    for sample in samples:
        both = sample["sun"]["visible"] and sample["earth"]["visible"]
        sample["both_visible"] = both
        sample["status"] = _label(sample["sun"]["visible"], sample["earth"]["visible"])
    assert len(samples) == request["sample_count"], "sample grid disagrees with validated count"

    warnings = []
    if terrain["mode"] != "terrain_profile":
        warnings.append(terrain["message"])

    public_site = {k: site.get(k) for k in ("id", "name", "latitude", "longitude", "source", "mission", "kind",
                                            "coordinate_source", "coordinate_note")}
    public_site["terrain_status"] = terrain["status"]
    low, high = coverage()
    return {
        "schema_version": ANALYSIS_SCHEMA_VERSION,
        "request": dict(request),
        "site": public_site,
        "samples": samples,
        "summary": summary,
        "horizon": profile,
        "terrain": terrain,
        "engineering_checks": dict(methodology.ENGINEERING_CHECKS),
        "provenance": {
            **{k: methodology.MODEL[k] for k in ("engine", "frame", "coordinates", "observer", "geometry",
                                                  "angles", "visibility_rule", "clearance", "sampling", "time")},
            "kernels": list(KERNEL_FILES),
            "kernel_details": kernel_provenance(),
            "ephemeris_coverage": {"start": _iso(low), "end": _iso(high)},
            "horizon_mode": STATUS_LABELS.get(terrain["status"], HORIZON_MODE_LABELS[terrain["mode"]]),
            "terrain_source": terrain["profile_metadata"],
            "site_coordinates": site.get("coordinate_source"),
            "limitations": methodology.LIMITATIONS,
            "sources": methodology.SOURCES,
            # false = these are real calculated values, not placeholder/sample data.
            "sample_values": False,
        },
        "assumptions": methodology.ASSUMPTIONS,
        "limitations": methodology.LIMITATIONS,
        "warnings": warnings,
    }


# -------------------------------------------------------------- comparison

def build_comparison(start=None, end=None, step_minutes=None, site_ids=None) -> dict:
    allowed = comparison_site_ids()
    ids = list(site_ids) if site_ids else allowed
    for site_id in ids:
        get_landing_site(site_id)  # unknown id -> 404 for the whole request
    if len(ids) != len(set(ids)) or sorted(ids) != sorted(allowed):
        raise ApiError(422, "invalid_request",
                       f"Comparison currently supports exactly these sites: {', '.join(allowed)}.",
                       {"allowed_site_ids": allowed})
    load_spice_kernels()                              # missing kernels fail the whole comparison
    request = normalize_range(start, end, step_minutes)  # one shared, validated range

    results = []
    for site_id in ids:
        try:
            analysis = build_analysis(site_id, None, None, request["start"], request["end"],
                                      request["step_minutes"])
            results.append({"site_id": site_id, "ok": True, "analysis": analysis, "error": None})
        except Exception as exc:  # noqa: BLE001 - reported per site, never omitted
            err = classify(exc)
            log.warning("Comparison: %s failed: %s", site_id, err.message)
            results.append({"site_id": site_id, "ok": False, "analysis": None,
                            "error": {"code": err.code, "message": err.message, "details": err.details}})

    ok = [r["analysis"] for r in results if r["ok"]]
    grids = {tuple(s["time"] for s in a["samples"]) for a in ok}
    if len(grids) > 1:
        raise ApiError(500, "internal_error", "Sites were sampled on different grids; refusing to compare.")
    notes = ["Every site uses the identical requested range, step and sample times."]
    modes = {a["terrain"]["mode"] for a in ok}
    if len(modes) > 1 or modes - {"terrain_profile"}:
        notes.append("Sites use different horizon modes: terrain-aware and flat-horizon results are NOT "
                     "equal-confidence. Flat-horizon sites ignore terrain obstruction.")
    if any(not r["ok"] for r in results):
        notes.append("At least one site failed; see its error. Failed sites are listed, never omitted.")
    notes.append(methodology.VIABILITY_STATEMENT)
    request = {**request, "defaults_applied": request["defaults_applied"]}
    return {
        "schema_version": ANALYSIS_SCHEMA_VERSION,
        "request": request,
        "shared_sample_times": len(grids) <= 1,
        "sites": results,
        "table": [{
            "site_id": a["site"]["id"], "name": a["site"]["name"], "mission": a["site"]["mission"],
            "horizon_mode": a["terrain"]["mode"],
            "terrain_obstruction_assessed": a["terrain"]["terrain_obstruction_assessed"],
            **{k: a["summary"][k] for k in ("sunlight_percent", "earth_visible_percent", "both_available_percent",
                                             "longest_darkness_minutes", "longest_earth_hidden_minutes",
                                             "longest_joint_window_minutes")},
        } for a in ok],
        "comparison_notes": notes,
    }
