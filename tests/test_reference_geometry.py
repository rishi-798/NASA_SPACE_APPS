"""Independent cross-checks of the EXISTING geometry (backend.calculations.sun_earth).

Complements the JPL Horizons cases in test_spice_calculations.py:
* NAIF's own azlcpo routine (constant-position observer, abcorr NONE) must agree
  with the hand-built east/north/up projection in sun_earth.py.
* A target must be at the zenith directly beneath it (no parallax on the
  Moon-centre/target line), and at the nadir at the antipode.
* An equatorial site must be sunlit about half of a synodic month.
These are verification aids only; the API never calls azlcpo.
"""
import math
from datetime import datetime, timedelta, timezone

import pytest
import spiceypy

from backend.calculations.sun_earth import calculate_visibility, calculate_visibility_window
from backend.spice_kernels import SPICE_LOCK, load_spice_kernels
from tests.conftest import needs_kernels

pytestmark = needs_kernels
TIME = "2026-10-12T06:00:00Z"


def _angle_difference(a, b):
    return abs((a - b + 180) % 360 - 180)


@pytest.mark.parametrize("lat,lon", [(-84.79, 29.2), (-80.13, 1.44), (0, 0), (45, -120), (-89.9, 0)])
def test_existing_geometry_matches_naif_azlcpo(lat, lon):
    result = calculate_visibility(lat, lon, TIME)
    load_spice_kernels()
    with SPICE_LOCK:
        et = spiceypy.utc2et(TIME[:-1])
        radius = spiceypy.bodvrd("MOON", "RADII", 3)[1][0]
        observer = spiceypy.latrec(radius, math.radians(lon), math.radians(lat))
        for name, target in (("sun", "SUN"), ("earth", "EARTH")):
            state, _ = spiceypy.azlcpo("ELLIPSOID", target, et, "NONE", False, True, observer, "MOON", "MOON_ME")
            assert _angle_difference(result[name]["azimuth"], math.degrees(state[1])) < 1e-6
            assert result[name]["elevation"] == pytest.approx(math.degrees(state[2]), abs=1e-6)


@pytest.mark.parametrize("target", ["SUN", "EARTH"])
def test_target_at_zenith_beneath_it_and_nadir_at_antipode(target):
    load_spice_kernels()
    with SPICE_LOCK:
        vector, _ = spiceypy.spkpos(target, spiceypy.utc2et(TIME[:-1]), "MOON_ME", "NONE", "MOON")
        _, lon, lat = spiceypy.reclat(vector)
    lat, lon = math.degrees(lat), math.degrees(lon)
    above = calculate_visibility(lat, lon, TIME)[target.lower()]
    anti_lon = (lon + 360) % 360 - 180
    below = calculate_visibility(-lat, anti_lon, TIME)[target.lower()]
    assert above["elevation"] == pytest.approx(90, abs=1e-6)
    assert below["elevation"] == pytest.approx(-90, abs=1e-6)


def test_equator_is_sunlit_about_half_a_synodic_month():
    start = datetime(2026, 10, 1, tzinfo=timezone.utc)
    end = start + timedelta(days=29.5)
    samples = calculate_visibility_window(0, 0, start.isoformat(), end.isoformat(), 120)
    fraction = sum(s["sun"]["visible"] for s in samples) / len(samples)
    assert fraction == pytest.approx(0.5, abs=0.03)


def test_near_side_sees_earth_far_side_never():
    for day in range(0, 28, 4):
        time = f"2026-10-{1 + day:02d}T00:00:00Z"
        assert calculate_visibility(0, 0, time)["earth"]["elevation"] > 75
        assert calculate_visibility(0, 180, time)["earth"]["elevation"] < -75
