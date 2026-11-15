from datetime import datetime, timedelta, timezone
import logging
import math

import numpy as np
import spiceypy
from spiceypy.utils.exceptions import SpiceyError

from backend.spice_kernels import SPICE_LOCK, load_spice_kernels, spice_code


log = logging.getLogger("backend.calculations")

MOON_FRAME = "MOON_ME"
MAX_WINDOW_SAMPLES = 2000


class SpiceCalculationError(RuntimeError):
    pass


def validate_coordinates(latitude: float, longitude: float) -> tuple[float, float]:
    if not math.isfinite(latitude) or not -90 <= latitude <= 90:
        raise ValueError("lat must be between -90 and 90 degrees")
    if not math.isfinite(longitude) or not -180 <= longitude <= 180:
        raise ValueError("lon must be between -180 and 180 degrees")
    return latitude, longitude


def parse_utc_time(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except (AttributeError, ValueError) as exc:
        raise ValueError("time must be an ISO 8601 timestamp with a timezone") from exc

    if parsed.tzinfo is None:
        raise ValueError("time must include a timezone, for example 2026-10-03T18:00:00Z")
    return parsed.astimezone(timezone.utc)


def _local_angles(vector: np.ndarray, latitude: float, longitude: float) -> tuple[float, float]:
    distance = float(np.linalg.norm(vector))
    if not math.isfinite(distance) or distance == 0:
        raise SpiceCalculationError("SPICE returned an invalid position vector")

    lat = math.radians(latitude)
    lon = math.radians(longitude)
    direction = vector / distance

    # Azimuth is measured clockwise from north in the local east/north/up basis.
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array(
        [-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)]
    )
    up = np.array(
        [math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)]
    )

    east_component = float(np.dot(direction, east))
    north_component = float(np.dot(direction, north))
    up_component = float(np.dot(direction, up))
    # atan2 stays well-conditioned at zenith/nadir, unlike asin near +/-1.
    elevation = math.degrees(math.atan2(up_component, math.hypot(east_component, north_component)))
    azimuth = math.degrees(math.atan2(east_component, north_component)) % 360
    return azimuth, elevation


def calculate_visibility(latitude: float, longitude: float, utc_time: str) -> dict:
    latitude, longitude = validate_coordinates(latitude, longitude)
    time = parse_utc_time(utc_time)
    output_time = time.isoformat().replace("+00:00", "Z")

    with SPICE_LOCK:
        load_spice_kernels()
        try:
            et = spiceypy.utc2et(output_time)
            _, radii = spiceypy.bodvrd("MOON", "RADII", 3)
            equatorial_radius = float(radii[0])
            flattening = (equatorial_radius - float(radii[2])) / equatorial_radius
            site_fixed = spiceypy.georec(
                math.radians(longitude), math.radians(latitude), 0.0, equatorial_radius, flattening
            )

            # SPICE rotates the surface point between the lunar fixed frame and inertial J2000.
            fixed_to_j2000 = spiceypy.pxform(MOON_FRAME, "J2000", et)
            j2000_to_fixed = spiceypy.pxform("J2000", MOON_FRAME, et)
            site_j2000 = fixed_to_j2000 @ site_fixed

            bodies = {}
            for name, target in (("sun", "SUN"), ("earth", "EARTH")):
                moon_to_body, _light_time_seconds = spiceypy.spkpos(
                    target, et, "J2000", "NONE", "MOON"
                )
                distance_km = float(np.linalg.norm(moon_to_body))
                body_from_site_fixed = j2000_to_fixed @ (moon_to_body - site_j2000)
                moon_center_to_body_fixed = j2000_to_fixed @ moon_to_body
                azimuth, elevation = _local_angles(body_from_site_fixed, latitude, longitude)
                bodies[name] = {
                    "azimuth": azimuth,
                    "elevation": elevation,
                    "visible": elevation > 0,
                    "distance_km": float(distance_km),
                    "moon_fixed_position_km": [
                        float(component) for component in moon_center_to_body_fixed
                    ],
                }
        except SpiceyError as exc:
            # Full SPICE text can include local kernel paths: log it, return only the short code.
            log.error("SPICE calculation failed at %s (%s, %s): %s", output_time, latitude, longitude, exc)
            raise SpiceCalculationError(
                f"SPICE could not calculate the Sun/Earth position ({spice_code(exc)})."
            ) from exc

    return {
        "site": None,
        "latitude": latitude,
        "longitude": longitude,
        "time": output_time,
        "sun": bodies["sun"],
        "earth": bodies["earth"],
    }


def calculate_visibility_window(
    latitude: float,
    longitude: float,
    start: str,
    end: str,
    step_minutes: int = 30,
) -> list[dict]:
    """Calculate visibility at regular UTC times, including end when it lands on the grid."""
    latitude, longitude = validate_coordinates(latitude, longitude)
    start_time = parse_utc_time(start)
    end_time = parse_utc_time(end)
    if (
        not isinstance(step_minutes, int)
        or isinstance(step_minutes, bool)
        or step_minutes < 1
    ):
        raise ValueError("step_minutes must be a positive integer")
    if end_time < start_time:
        raise ValueError("end must be at or after start")

    try:
        step = timedelta(minutes=step_minutes)
    except OverflowError as exc:
        raise ValueError("step_minutes is too large") from exc
    if (end_time - start_time) // step + 1 > MAX_WINDOW_SAMPLES:
        raise ValueError(f"window exceeds {MAX_WINDOW_SAMPLES} samples")

    # Pre-generate regular timestamps
    timestamps = []
    current = start_time
    while current <= end_time:
        timestamps.append(current)
        if end_time - current < step:
            break
        current += step

    samples = []
    with SPICE_LOCK:
        load_spice_kernels()
        try:
            _, radii = spiceypy.bodvrd("MOON", "RADII", 3)
            equatorial_radius = float(radii[0])
            flattening = (equatorial_radius - float(radii[2])) / equatorial_radius
            site_fixed = spiceypy.georec(
                math.radians(longitude), math.radians(latitude), 0.0, equatorial_radius, flattening
            )

            for dt in timestamps:
                output_time = dt.isoformat().replace("+00:00", "Z")
                et = spiceypy.utc2et(output_time)
                fixed_to_j2000 = spiceypy.pxform(MOON_FRAME, "J2000", et)
                j2000_to_fixed = spiceypy.pxform("J2000", MOON_FRAME, et)
                site_j2000 = fixed_to_j2000 @ site_fixed

                bodies = {}
                for name, target in (("sun", "SUN"), ("earth", "EARTH")):
                    moon_to_body, _light_time_seconds = spiceypy.spkpos(
                        target, et, "J2000", "NONE", "MOON"
                    )
                    distance_km = float(np.linalg.norm(moon_to_body))
                    body_from_site_fixed = j2000_to_fixed @ (moon_to_body - site_j2000)
                    moon_center_to_body_fixed = j2000_to_fixed @ moon_to_body
                    azimuth, elevation = _local_angles(body_from_site_fixed, latitude, longitude)
                    bodies[name] = {
                        "azimuth": azimuth,
                        "elevation": elevation,
                        "visible": elevation > 0,
                        "distance_km": float(distance_km),
                        "moon_fixed_position_km": [
                            float(component) for component in moon_center_to_body_fixed
                        ],
                    }

                samples.append(
                    {
                        "time": output_time,
                        "sun": bodies["sun"],
                        "earth": bodies["earth"],
                    }
                )
        except SpiceyError as exc:
            log.error("SPICE window calculation failed (%s, %s): %s", latitude, longitude, exc)
            raise SpiceCalculationError(
                f"SPICE could not calculate the Sun/Earth position ({spice_code(exc)})."
            ) from exc

    return samples
