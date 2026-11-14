"""On-demand LOLA terrain-horizon profiles for custom south-polar coordinates.

Reuses ``backend.terrain.preprocess.build_profile`` unchanged (the generator that
produced Athena's checked-in profile; regenerating Athena reproduces it exactly).

* Coverage: PGDA ``LDEM_80S_80MPP_ADJ`` (LOLA, 80 m/pixel, south polar
  stereographic, +/-304 km square around the pole). A profile is generated only
  when the full ``max_distance`` radius lies inside that square's inscribed circle,
  i.e. ``rho(point) + max_distance <= 304 km`` (about 81.3 S and poleward).
  Outside it there is genuinely no profile for the location.
* Source restriction: the PGDA URL is fixed, or a local copy given by
  ``LOLA_80S_DEM_PATH``. Nothing in a request can change the source.
* Bounded work: only a window around the point is read through GDAL /vsicurl,
  with HTTP timeouts and retries; at most ``TERRAIN_ON_DEMAND_MAX_CONCURRENT``
  generations run at once; one lock per point prevents duplicate work.
* Bounded disk cache: ``TERRAIN_CACHE_DIR`` (default backend/terrain/cache),
  at most ``TERRAIN_CACHE_MAX_FILES`` profiles, oldest evicted first.
* Failures (unreadable DEM, timeouts) raise ``OnDemandTerrainError``; they are
  never reported as "no terrain".
"""
import hashlib
import json
import logging
import math
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from backend.terrain.horizon import HorizonError, validate_profile

log = logging.getLogger("backend.terrain.on_demand")

PGDA_DEM_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF"
DEM_HALF_WIDTH_M = 304_000.0   # LDEM_80S_80MPP_ADJ bounds: +/-304 km in polar stereographic
MOON_RADIUS_M = 1_737_400.0    # the DEM's spherical datum
GENERATOR_VERSION = 1
SETTINGS = {"max_distance_m": 40_000.0, "azimuth_step": 0.5, "observer_height_m": 2.0, "min_distance_m": 160.0}

# Messages from build_profile that mean "the dataset genuinely has no complete profile here".
_NO_COVERAGE = ("outside the DEM", "missing pixels", "no terrain pixels", "every azimuth bin", "no DEM elevation",
                "does not reach")

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()
_slots: threading.BoundedSemaphore | None = None
_slots_guard = threading.Lock()


class OnDemandTerrainError(HorizonError):
    """The DEM should cover this point but could not be read. ``timeout`` marks network timeouts."""

    def __init__(self, message: str, *, timeout: bool = False):
        super().__init__(message)
        self.timeout = timeout


def enabled() -> bool:
    return os.environ.get("TERRAIN_ON_DEMAND", "1") != "0"


DEFAULT_LOCAL_DEM = Path(__file__).resolve().parent / "dem" / "LDEM_80S_80MPP_ADJ.TIF"


def dem_source() -> tuple[str, str]:
    """(path GDAL opens, public source URL recorded in the profile).

    Order: LOLA_80S_DEM_PATH, then the local copy from scripts/fetch_lola_dem.py, then remote
    windowed reads from PGDA. PGDA intermittently answers GDAL's tile requests with HTTP 403, so a
    local copy (189 MB, downloaded once) is the reliable choice for demos and deployments.
    """
    local = os.environ.get("LOLA_80S_DEM_PATH")
    if local:
        return local, PGDA_DEM_URL
    if DEFAULT_LOCAL_DEM.is_file():
        return str(DEFAULT_LOCAL_DEM), PGDA_DEM_URL
    return "/vsicurl/" + PGDA_DEM_URL, PGDA_DEM_URL


def is_remote() -> bool:
    return dem_source()[0].startswith("/vsicurl/")


def cache_dir() -> Path:
    return Path(os.environ.get("TERRAIN_CACHE_DIR", Path(__file__).resolve().parent / "cache"))


def polar_distance_m(latitude: float) -> float:
    """Polar stereographic radius (true scale at the pole) of a south-polar latitude."""
    return 2 * MOON_RADIUS_M * math.tan(math.radians(90 + latitude) / 2)


def in_coverage(latitude: float) -> bool:
    if latitude > -60:
        return False
    return polar_distance_m(latitude) + SETTINGS["max_distance_m"] <= DEM_HALF_WIDTH_M


def coverage_note() -> str:
    limit = -90 + math.degrees(2 * math.atan((DEM_HALF_WIDTH_M - SETTINGS["max_distance_m"]) / (2 * MOON_RADIUS_M)))
    return (f"On-demand LOLA horizons cover points where a full {SETTINGS['max_distance_m'] / 1000:.0f} km radius "
            f"lies inside the 80 S DEM, about {abs(limit):.2f} S to the pole.")


def _key(latitude: float, longitude: float) -> str:
    _, source = dem_source()
    raw = json.dumps({"lat": latitude, "lon": longitude, "source": source, "v": GENERATOR_VERSION, **SETTINGS},
                     sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def _lock_for(key: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(key, threading.Lock())


def _slot() -> threading.BoundedSemaphore:
    global _slots
    with _slots_guard:
        if _slots is None:
            _slots = threading.BoundedSemaphore(int(os.environ.get("TERRAIN_ON_DEMAND_MAX_CONCURRENT", "2")))
        return _slots


def _read_cached(path: Path, site: dict) -> dict | None:
    try:
        return validate_profile(json.loads(path.read_text(encoding="utf-8")), site)
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as exc:  # our own cache file is damaged: regenerate from the source
        log.warning("Discarding unusable cached horizon %s: %s", path.name, exc)
        path.unlink(missing_ok=True)
        return None


def _evict(directory: Path) -> None:
    limit = int(os.environ.get("TERRAIN_CACHE_MAX_FILES", "300"))
    files = sorted(directory.glob("*.json"), key=lambda p: p.stat().st_mtime)
    for old in files[:max(0, len(files) - limit)]:
        old.unlink(missing_ok=True)


def gdal_env() -> dict:
    """Bounded GDAL settings for remote DEM reads."""
    env = {"GDAL_HTTP_TIMEOUT": os.environ.get("GDAL_HTTP_TIMEOUT", "20"),
           "GDAL_HTTP_MAX_RETRY": os.environ.get("GDAL_HTTP_MAX_RETRY", "2"),
           "GDAL_HTTP_RETRY_DELAY": "1", "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
           "GDAL_CACHEMAX": int(os.environ.get("GDAL_CACHEMAX", "64")),
           "CPL_VSIL_CURL_CACHE_SIZE": os.environ.get("CPL_VSIL_CURL_CACHE_SIZE", str(16 * 1024 * 1024))}
    try:
        import certifi  # python.org macOS builds ship without a CA bundle for GDAL's curl
        env["CURL_CA_BUNDLE"] = certifi.where()
    except ImportError:
        pass
    return env


def with_retries(read, attempts: int | None = None):
    """Run a remote DEM read, retrying I/O failures (PGDA occasionally returns 0-byte tiles,
    which GDAL's HTTP retries do not cover). ValueErrors (coverage) are never retried."""
    from rasterio.errors import RasterioError

    # Local files are not retried: a missing or corrupt local copy will not fix itself.
    attempts = attempts or (int(os.environ.get("TERRAIN_READ_ATTEMPTS", "2")) if is_remote() else 1)
    for attempt in range(1, attempts + 1):
        try:
            return read()
        except (RasterioError, OSError) as exc:
            if attempt == attempts:
                raise
            log.warning("LOLA DEM read failed (attempt %d/%d), retrying: %s", attempt, attempts, exc)
            time.sleep(attempt)


def _generate(site: dict) -> dict:
    import rasterio
    from rasterio.errors import RasterioError

    from backend.terrain.preprocess import build_profile

    path, source_url = dem_source()
    def read():
        with rasterio.Env(**gdal_env()):
            return build_profile(path, site, source_url, SETTINGS["max_distance_m"], SETTINGS["azimuth_step"],
                                 SETTINGS["observer_height_m"], SETTINGS["min_distance_m"])

    try:
        return with_retries(read)
    except (RasterioError, OSError) as exc:
        text = str(exc).lower()
        log.error("LOLA DEM read failed for %s,%s: %s", site["latitude"], site["longitude"], exc)
        timeout = "timed out" in text or "timeout" in text
        hint = (" The PGDA server refused or failed the remote read; run python -m scripts.fetch_lola_dem once "
                "to use a local copy." if is_remote() else "")
        raise OnDemandTerrainError(
            "The LOLA elevation data needed for this point's terrain horizon "
            + ("did not respond in time." if timeout else "could not be read.") + hint,
            timeout=timeout,
        ) from exc


def get_profile(latitude: float, longitude: float) -> tuple[dict | None, dict]:
    """Return (profile | None, info). info: {"status", "cache", "message"}.

    status: "profile_generated" | "no_profile_for_location" | "disabled".
    Raises OnDemandTerrainError when a covered point cannot be read.
    """
    if not in_coverage(latitude):  # genuinely no profile, whether or not generation is enabled
        return None, {"status": "no_profile_for_location", "cache": None,
                      "message": "This point is outside the LOLA 80 S DEM coverage needed for a full terrain horizon. "
                                 + coverage_note()}
    if not enabled():
        return None, {"status": "disabled", "cache": None,
                      "message": "On-demand terrain horizons are disabled on this server (TERRAIN_ON_DEMAND=0)."}
    site = {"id": "custom", "latitude": latitude, "longitude": longitude}
    key = _key(latitude, longitude)
    directory = cache_dir()
    path = directory / f"{key}.json"
    with _lock_for(key):
        cached = _read_cached(path, site)
        if cached is not None:
            return cached, {"status": "profile_generated", "cache": "hit", "key": key, "message": ""}
        with _slot():
            try:
                profile = _generate(site)
            except ValueError as exc:
                if isinstance(exc, OnDemandTerrainError) or not any(m in str(exc) for m in _NO_COVERAGE):
                    raise
                return None, {"status": "no_profile_for_location", "cache": None,
                              "message": f"The LOLA DEM has no complete horizon for this point ({exc})."}
        profile["generated"] = {
            "by": f"backend.terrain.on_demand v{GENERATOR_VERSION} (backend.terrain.preprocess.build_profile)",
            "utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        try:
            directory.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".part")
            temporary.write_text(json.dumps(profile), encoding="utf-8")
            temporary.replace(path)
            _evict(directory)
        except OSError as exc:  # caching is an optimisation; the profile itself is valid
            log.warning("Could not cache horizon %s: %s", path.name, exc)
        return profile, {"status": "profile_generated", "cache": "miss", "key": key, "message": ""}
