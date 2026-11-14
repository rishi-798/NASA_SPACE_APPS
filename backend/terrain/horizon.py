"""Terrain-horizon profiles (LOLA-derived) and their application to Sun/Earth samples.

A horizon profile is a precomputed table of terrain horizon elevation per
azimuth bin for ONE observer point. It is a different product from Cesium's
visual terrain or a single sampled DEM elevation; neither of those is used here.

Outcomes are explicit:
* site configures ``"horizon_profile": null``   -> genuinely no profile (flat horizon)
* site configures a filename that is missing    -> HorizonProfileMissing
* configured file unreadable / fails validation -> HorizonError
A configured-but-broken profile never silently becomes "no terrain".
"""
import json
import logging
import math
import os
import threading
from pathlib import Path


log = logging.getLogger("backend.terrain")

PROFILE_DIR = Path(__file__).resolve().parent / "profiles"

MODE_TERRAIN = "terrain_profile"
MODE_FLAT = "flat_horizon"
MODE_DEGRADED = "flat_horizon_degraded"


class HorizonError(ValueError):
    """A configured profile is unusable. Messages are user-safe (filenames only, no paths)."""


class HorizonProfileMissing(HorizonError):
    """The site is configured with a profile file that does not exist."""


def validate_profile(profile: dict, site: dict | None = None) -> dict:
    if not isinstance(profile, dict):
        raise HorizonError("horizon profile must be an object")
    if profile.get("synthetic") and os.environ.get("ALLOW_SYNTHETIC_TERRAIN") != "1":
        # Test fixtures are marked synthetic and must never be served as real analysis.
        raise HorizonError("horizon profile is a synthetic test fixture and cannot be used for real analysis")
    try:
        step = float(profile["azimuth_step"])
        angles = profile["horizon"]
        latitude = float(profile["latitude"])
        longitude = float(profile["longitude"])
        height = float(profile["observer_height_m"])
        radius = float(profile["datum_radius_m"])
        distance = float(profile["max_distance_m"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HorizonError("horizon profile is missing valid metadata") from exc

    count = 360 / step if math.isfinite(step) and step > 0 else 0
    if not (count.is_integer() and 1 <= count <= 3600):
        raise HorizonError("azimuth step must divide 360 degrees")
    if not isinstance(angles, list) or len(angles) != int(count):
        raise HorizonError("horizon profile has the wrong number of bins")
    if any(
        isinstance(angle, bool)
        or not isinstance(angle, (int, float))
        or not math.isfinite(angle)
        or not -90 <= angle <= 90
        for angle in angles
    ):
        raise HorizonError("horizon profile contains an invalid angle")
    peak_distances = profile.get("peak_distance_m")
    if peak_distances is not None and (
        not isinstance(peak_distances, list)
        or len(peak_distances) != int(count)
        or any(
            not isinstance(value, (int, float))
            or isinstance(value, bool)
            or not math.isfinite(value)
            or value <= 0
            or value > distance
            for value in peak_distances
        )
    ):
        raise HorizonError("horizon profile contains an invalid peak distance")
    if not all(math.isfinite(value) for value in (latitude, longitude, height, radius, distance)):
        raise HorizonError("horizon profile contains non-finite metadata")
    if not (
        -90 <= latitude <= 90
        and -180 <= longitude <= 180
        and height >= 0
        and radius > 0
        and distance > 0
    ):
        raise HorizonError("horizon profile contains invalid coordinates or distances")
    if profile.get("source_frame") != "MOON_ME_DE421":
        raise HorizonError("horizon profile has an unsupported lunar frame")
    if not isinstance(profile.get("source"), str) or not profile["source"].startswith("https://"):
        raise HorizonError("horizon profile needs a source URL")
    if not isinstance(profile.get("site_id"), str) or not profile["site_id"]:
        raise HorizonError("horizon profile needs a site ID")
    if site and (
        profile["site_id"] != site["id"]
        or abs(latitude - site["latitude"]) > 1e-8
        or abs(longitude - site["longitude"]) > 1e-8
    ):
        raise HorizonError("horizon profile does not match the landing site")
    return profile


_profile_cache: dict[tuple[str, int, int], dict] = {}
_cache_lock = threading.Lock()


def _read_profile(path: Path) -> dict:
    """Parse + validate, cached by (path, mtime, size) so edited files are re-read."""
    try:
        stat = path.stat()
        key = (str(path), stat.st_mtime_ns, stat.st_size)
        with _cache_lock:
            if key in _profile_cache:
                return _profile_cache[key]
        with path.open(encoding="utf-8") as file:
            profile = validate_profile(json.load(file))
    except HorizonError as exc:
        log.error("Horizon profile %s rejected: %s", path, exc)
        raise HorizonError(f"horizon profile {path.name} is invalid: {exc}") from exc
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        log.error("Horizon profile %s unreadable: %s", path, exc)
        raise HorizonError(f"could not read horizon profile {path.name}: file is unreadable or not valid JSON") from exc
    with _cache_lock:
        for old in [k for k in _profile_cache if k[0] == key[0]]:
            del _profile_cache[old]
        _profile_cache[key] = profile
    return profile


def profile_path(site: dict, directory: Path | None = None) -> tuple[Path | None, bool]:
    """(path, configured). configured=True means the site explicitly names a profile file."""
    directory = directory or PROFILE_DIR
    if "horizon_profile" in site:
        name = site["horizon_profile"]
        return (directory / name, True) if name else (None, False)
    if not site.get("id"):
        return None, False
    # Legacy behaviour for site records without the key: look for <id>.json.
    return directory / f"{site['id']}.json", False


def load_profile(site: dict, directory: Path | None = None) -> dict | None:
    path, configured = profile_path(site, directory)
    if path is None:
        return None
    if not path.is_file():
        if configured:
            log.error("Configured horizon profile for %s missing at %s", site.get("id"), path)
            raise HorizonProfileMissing(
                f"The configured terrain-horizon profile for {site.get('name') or site.get('id')} "
                f"({path.name}) is missing."
            )
        return None
    try:
        return validate_profile(_read_profile(path), site)
    except HorizonError as exc:
        if isinstance(exc, HorizonProfileMissing):
            raise
        raise HorizonError(
            f"The terrain-horizon profile for {site.get('name') or site.get('id')} is unusable: {exc}"
        ) from exc


def horizon_at(profile: dict, azimuth: float) -> float:
    angles = profile["horizon"]
    position = (azimuth % 360) / profile["azimuth_step"]
    left = int(math.floor(position))
    fraction = position - left
    return angles[left] * (1 - fraction) + angles[(left + 1) % len(angles)] * fraction


def apply_horizon(result: dict, profile: dict | None) -> dict:
    """Terrain mode adds flat_visible, terrain_horizon and terrain_clearance (all degrees).

    ``visible`` stays authoritative: elevation > terrain_horizon.
    ``terrain_clearance`` = elevation - terrain_horizon; > 0 means the target centre clears terrain.
    Flat mode (profile None) leaves the SPICE result untouched (visible = elevation > 0).
    """
    if profile is None:
        return result
    for name in ("sun", "earth"):
        body = result[name]
        boundary = horizon_at(profile, body["azimuth"])
        body["flat_visible"] = body["elevation"] > 0
        body["terrain_horizon"] = boundary
        body["terrain_clearance"] = body["elevation"] - boundary
        body["visible"] = body["elevation"] > boundary
    return result


PROFILE_METADATA_KEYS = (
    "site_id", "latitude", "longitude", "source", "source_frame", "runtime_frame", "datum_radius_m",
    "site_elevation_m", "pixel_resolution_m", "max_distance_m", "min_distance_m", "azimuth_step",
    "observer_height_m", "binning",
)


def profile_metadata(profile: dict) -> dict:
    """Profile provenance without the large arrays (or the long projection WKT)."""
    meta = {key: profile.get(key) for key in PROFILE_METADATA_KEYS if key in profile}
    meta["bins"] = len(profile["horizon"])
    meta["has_peak_distances"] = profile.get("peak_distance_m") is not None
    return meta


def resolve_horizon(site: dict, directory: Path | None = None, *, allow_flat_fallback: bool = False):
    """Return (profile | None, terrain_info). Raises HorizonError unless allow_flat_fallback.

    terrain_info states the mode, status, whether terrain obstruction was assessed, and why.
    """
    try:
        profile = load_profile(site, directory)
    except HorizonError as exc:
        if not allow_flat_fallback:
            raise
        status = "configured_profile_missing" if isinstance(exc, HorizonProfileMissing) else "configured_profile_invalid"
        return None, {
            "mode": MODE_DEGRADED, "status": status, "terrain_obstruction_assessed": False,
            "message": f"{exc} Results use a flat local horizon and are DEGRADED: terrain obstruction is not assessed.",
            "profile_metadata": None,
        }
    if profile is not None:
        return profile, {
            "mode": MODE_TERRAIN, "status": "profile_loaded", "terrain_obstruction_assessed": True,
            "message": (
                "LOLA terrain-horizon profile applied: a target is visible only when its centre is above the "
                "terrain horizon at its azimuth."
            ),
            "profile_metadata": profile_metadata(profile),
        }
    reason = site.get("horizon_note") or (
        "No terrain-horizon profile exists for arbitrary map coordinates."
        if not site.get("id") else "No terrain-horizon profile exists for this site."
    )
    return None, {
        "mode": MODE_FLAT, "status": "no_profile_for_location", "terrain_obstruction_assessed": False,
        "message": (
            f"{reason} Visibility uses a flat local horizon (elevation > 0 deg). Terrain obstruction is NOT "
            "assessed: nearby ridges or crater rims may hide the Sun or Earth when this says visible. Lower "
            "confidence than a terrain-aware result."
        ),
        "profile_metadata": None,
    }
