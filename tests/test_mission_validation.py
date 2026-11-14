"""Regression tests for the mission validation (scripts/validate_missions.py).

Mission facts are sourced in validate_missions.MISSIONS. The Odysseus terrain check reads the PGDA
DEM and runs only with RUN_NETWORK_TESTS=1.
"""
import os

import pytest

from scripts import validate_missions as vm
from tests.conftest import needs_kernels

pytestmark = needs_kernels


def test_athena_site_was_sunlit_with_earth_in_view_while_the_lander_died():
    a = vm.athena()
    assert a["surface_window_utc"] == ["2025-03-06T17:30:00Z", "2025-03-07T06:15:00Z"]
    assert a["surface_window_sun_visible_all_samples"] is True
    assert a["surface_window_earth_visible_all_samples"] is True
    assert 2.4 < a["surface_window_sun_elevation_deg"][0] < a["surface_window_sun_elevation_deg"][1] < 3.0
    assert a["surface_window_min_terrain_clearance_deg"] > 1.5
    assert a["shadow_length_per_metre_of_relief_m"] == [19.3, 23.2]
    # The planned 10 days fit inside the predicted sunlit period; the elevated site sets after the flat horizon.
    assert a["terrain_sunset_utc"] == "2025-03-19T17:44:00Z" and a["terrain_sunlit_days_after_landing"] > 10
    assert a["flat_sunset_utc"] == "2025-03-19T11:22:00Z"


def test_odysseus_site_stays_sunlit_past_the_reported_dormancy():
    o = vm.odysseus(offline=True)
    assert o["flat_sunset_utc"] == "2024-03-03T07:13:00Z"
    days = o["daily"]
    assert days["2024-02-29"]["sun_max"] > 6            # Sun still up on the day it went dormant
    assert days["2024-02-23"]["sun_max"] > days["2024-02-29"]["sun_max"] > days["2024-03-02"]["sun_max"]
    assert all(v["earth_min"] > 0 for v in days.values())


@pytest.mark.skipif(os.environ.get("RUN_NETWORK_TESTS") != "1", reason="set RUN_NETWORK_TESTS=1 to read the PGDA DEM")
def test_odysseus_partial_lola_horizon():
    t = vm.odysseus(offline=False)["terrain"]
    assert "does not reach 40000 m" in t["full_profile_refused"]   # never silently truncated
    assert abs(t["dem_height_m"] - t["published_elevation_m"]) < 30
    assert t["complete_azimuths_deg"][0] < 90 and t["complete_azimuths_deg"][1] > 270
    assert t["first_terrain_sunset_utc"] == "2024-03-02T14:14:00Z"
    assert t["first_terrain_sunset_utc"] < "2024-03-03T07:13:00Z"   # terrain sets the Sun before the flat horizon
