"""Bounded Meteomatics gateway. Credentials and raw upstream responses stay server-side."""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import math
import os
from pathlib import Path
from threading import Lock
import time

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
import requests

router = APIRouter(prefix="/api/weather", tags=["Earth launch-site weather"])
SITES = {site["id"]: site for site in json.loads(
    (Path(__file__).resolve().parents[2] / "data/launch_sites.json").read_text()
)}
PARAMETERS = {"t_2m:C": "temperature_c", "wind_speed_10m:ms": "wind_speed_ms", "precip_1h:mm": "precipitation_mm"}
CLOUD_PARAMETER = {"total_cloud_cover:p": "cloud_cover_pct"}
RESERVED = {-999, -888, -777, -666}
_lock = Lock()
# At most two fixed parameter sets per catalogue site; no arbitrary dates or bypass.
_cache: dict[tuple[str, bool], tuple[tuple, float, dict | tuple[int, str]]] = {}


class WeatherSample(BaseModel):
    time: str
    temperature_c: float | None = None
    wind_speed_ms: float | None = None
    precipitation_mm: float | None = None
    cloud_cover_pct: float | None = None


class LaunchWeather(BaseModel):
    site_id: str
    site_name: str
    latitude: float
    longitude: float
    provider: str = "Meteomatics"
    fetched_at: str
    generated_at: str | None = None
    start: str
    end: str
    samples: list[WeatherSample]
    partial: bool
    note: str = "Earth surface forecast at approximate launch-pad coordinates. Not a launch clearance or lunar forecast."


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _utc(value: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError("invalid timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timezone missing")
    return parsed.astimezone(timezone.utc)


def _normalise(payload: dict, site: dict, start: datetime, include_cloud: bool = False) -> dict:
    parameters = {**PARAMETERS, **CLOUD_PARAMETER} if include_cloud else PARAMETERS
    if not isinstance(payload, dict) or payload.get("status") != "OK" or not isinstance(payload.get("data"), list):
        raise ValueError("invalid response")
    times = [_iso(start + timedelta(hours=i)) for i in range(25)]
    samples = {stamp: {"time": stamp, **{field: None for field in parameters.values()}} for stamp in times}
    seen = set()
    for series in payload["data"]:
        if not isinstance(series, dict) or series.get("parameter") not in parameters:
            continue
        parameter = series["parameter"]
        if parameter in seen:
            raise ValueError("duplicate parameter")
        seen.add(parameter)
        coordinates = series.get("coordinates")
        if not isinstance(coordinates, list) or len(coordinates) != 1 or not isinstance(coordinates[0], dict):
            raise ValueError("invalid coordinates")
        coordinate = coordinates[0]
        for key, expected in (("lat", site["latitude"]), ("lon", site["longitude"])):
            actual = coordinate.get(key)
            if isinstance(actual, bool) or not isinstance(actual, (int, float)) or not math.isfinite(actual) or abs(actual - expected) > 0.01:
                raise ValueError("coordinate mismatch")
        dates = coordinate.get("dates")
        if not isinstance(dates, list):
            raise ValueError("invalid dates")
        seen_dates = set()
        for point in dates:
            if not isinstance(point, dict):
                raise ValueError("invalid point")
            stamp = _iso(_utc(point["date"]))
            if stamp not in samples or stamp in seen_dates:
                raise ValueError("unexpected timestamp")
            seen_dates.add(stamp)
            value = point.get("value")
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value in RESERVED:
                continue
            if parameter != "t_2m:C" and value < 0:
                continue
            if parameter == "total_cloud_cover:p" and value > 100:
                continue
            samples[stamp][parameters[parameter]] = value
    if not any(sample[field] is not None for sample in samples.values() for field in parameters.values()):
        raise ValueError("no usable data")
    generated = payload.get("dateGenerated")
    return {
        "site_id": site["id"], "site_name": f'{site["name"]} / {site["pad"]}',
        "latitude": site["latitude"], "longitude": site["longitude"],
        "fetched_at": _iso(datetime.now(timezone.utc)),
        "generated_at": _iso(_utc(generated)) if isinstance(generated, str) else None,
        "start": times[0], "end": times[-1], "samples": list(samples.values()),
        "partial": any(sample[field] is None for sample in samples.values() for field in parameters.values()),
    }


def _fetch(site: dict, start: datetime, username: str, password: str, include_cloud: bool = False) -> dict:
    parameters = {**PARAMETERS, **CLOUD_PARAMETER} if include_cloud else PARAMETERS
    window = f'{_iso(start)}--{_iso(start + timedelta(hours=24))}:PT1H'
    url = f'https://api.meteomatics.com/{window}/{",".join(parameters)}/{site["latitude"]},{site["longitude"]}/json'
    try:
        # Fixed HTTPS host and redirects disabled; credentials never appear in URLs.
        with requests.get(url, auth=(username, password), timeout=(3, 12), allow_redirects=False) as response:
            if response.status_code == 403 and include_cloud:
                # Some subscriptions exclude cloud cover; keep the core forecast available.
                return _fetch(site, start, username, password)
            if response.status_code in (401, 403):
                raise HTTPException(503, "Weather provider access is unavailable. Contact the site administrator.")
            if response.status_code == 429:
                raise HTTPException(429, "Weather provider request limit reached. Try again later.")
            if response.status_code != 200:
                raise HTTPException(502, "Weather provider is temporarily unavailable. Try again later.")
            return _normalise(response.json(), site, start, include_cloud)
    except requests.Timeout:
        raise HTTPException(504, "Weather provider timed out. Try again later.") from None
    except (requests.RequestException, ValueError, TypeError, KeyError, OverflowError):
        raise HTTPException(502, "Weather provider returned unavailable or invalid data. Try again later.") from None


@router.get("/launch-sites/{site_id}", response_model=LaunchWeather)
def launch_weather(site_id: str, response: Response, include_cloud: bool = False):
    response.headers["Cache-Control"] = "no-store"
    site = SITES.get(site_id)
    if site is None:
        raise HTTPException(404, "Launch site not found.")
    username = os.environ.get("METEOMATICS_USERNAME", "").strip()
    password = os.environ.get("METEOMATICS_PASSWORD", "")
    if not username or not password:
        raise HTTPException(503, "Launch-site weather is not connected yet.")
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    cache_key = (site_id, include_cloud)
    identity = (_iso(start), sha256(f'{username}\0{password}'.encode()).digest())
    # Single flight per process. Success cached for this UTC hour; failures for 60 seconds.
    with _lock:
        cached = _cache.get(cache_key)
        if cached and cached[0] == identity and time.monotonic() < cached[1]:
            result = cached[2]
            if isinstance(result, tuple):
                raise HTTPException(*result)
            return result
        try:
            result = _fetch(site, start, username, password, include_cloud=True) if include_cloud else _fetch(site, start, username, password)
        except HTTPException as exc:
            _cache[cache_key] = (identity, time.monotonic() + 60, (exc.status_code, exc.detail))
            raise
        _cache[cache_key] = (identity, time.monotonic() + 3600, result)
        return result
