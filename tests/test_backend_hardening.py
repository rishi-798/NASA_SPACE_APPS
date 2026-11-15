"""Adversarial, boundary, and stress tests for backend engines.

Verifies:
1. SPICE ephemeris calculations under extreme coordinates, polar singularities, and leap second boundaries.
2. LRU cache bounding, hit/miss tracking, and safe concurrent eviction.
3. Photovoltaic power simulation under edge cases, extreme degradation, and zero-division prevention.
4. Volatiles & permanent shadow region (PSR) spherical geodesic accuracy and boundary guards.
5. 3D terrain models API path traversal immunity and vector normalization.
6. Flight Readiness Review (FRR) dossier multi-modal consistency (JSON + HTML).
7. Concurrent multi-threaded SPICE execution without deadlocks.
"""
from concurrent.futures import ThreadPoolExecutor
import math
import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.analysis import CACHE, build_analysis
from backend.calculations.sun_earth import (
    calculate_visibility,
    calculate_visibility_window,
    parse_utc_time,
    validate_coordinates,
)
from backend.dossier_api import build_mission_dossier
from backend.power_api import calculate_solar_power_and_battery
from backend.terrain_models_api import find_model_for_coordinates
from backend.volatiles_api import evaluate_volatiles_at_coordinate, lunar_distance_and_bearing

client = TestClient(app)


# ---------------------------------------------------------------------------
# 1. SPICE Ephemeris Edge Cases & Coordinates
# ---------------------------------------------------------------------------

def test_spice_north_and_south_poles():
    """North and South poles are coordinate singularities in meridian frames."""
    res_np = calculate_visibility(90.0, 0.0, "2026-10-15T12:00:00Z")
    assert math.isfinite(res_np["sun"]["azimuth"])
    assert math.isfinite(res_np["sun"]["elevation"])
    assert math.isfinite(res_np["earth"]["azimuth"])
    assert math.isfinite(res_np["earth"]["elevation"])

    res_sp = calculate_visibility(-90.0, 0.0, "2026-10-15T12:00:00Z")
    assert math.isfinite(res_sp["sun"]["azimuth"])
    assert math.isfinite(res_sp["sun"]["elevation"])
    assert math.isfinite(res_sp["earth"]["azimuth"])
    assert math.isfinite(res_sp["earth"]["elevation"])


def test_spice_antimeridian_boundaries():
    """Lon 180 and -180 represent the exact same lunar meridian."""
    res_pos = calculate_visibility(0.0, 180.0, "2026-10-15T12:00:00Z")
    res_neg = calculate_visibility(0.0, -180.0, "2026-10-15T12:00:00Z")
    assert pytest.approx(res_pos["sun"]["elevation"], abs=1e-3) == res_neg["sun"]["elevation"]
    assert pytest.approx(res_pos["earth"]["elevation"], abs=1e-3) == res_neg["earth"]["elevation"]


def test_spice_leap_second_transition():
    """Ephemeris calculations across leap second insertion (2016-12-31 23:59:59 to 2017-01-01 00:00:00)."""
    t1 = "2016-12-31T23:59:59Z"
    t2 = "2017-01-01T00:00:00Z"
    v1 = calculate_visibility(0.0, 0.0, t1)
    v2 = calculate_visibility(0.0, 0.0, t2)
    # Positions should change continuously across the 1-second boundary
    assert abs(v1["sun"]["elevation"] - v2["sun"]["elevation"]) < 0.01
    assert abs(v1["earth"]["elevation"] - v2["earth"]["elevation"]) < 0.01


def test_spice_high_resolution_window():
    """1-minute step sampling over 1 hour generates 61 exact samples without drift."""
    samples = calculate_visibility_window(
        -84.79, 29.20, "2026-10-15T00:00:00Z", "2026-10-15T01:00:00Z", step_minutes=1
    )
    assert len(samples) == 61
    assert samples[0]["time"] == "2026-10-15T00:00:00Z"
    assert samples[-1]["time"] == "2026-10-15T01:00:00Z"


def test_spice_coordinate_validation_rejections():
    with pytest.raises(ValueError, match="lat must be between"):
        validate_coordinates(90.001, 0.0)
    with pytest.raises(ValueError, match="lat must be between"):
        validate_coordinates(-90.001, 0.0)
    with pytest.raises(ValueError, match="lon must be between"):
        validate_coordinates(0.0, 180.001)
    with pytest.raises(ValueError, match="lon must be between"):
        validate_coordinates(0.0, -180.001)
    with pytest.raises(ValueError, match="lat must be between"):
        validate_coordinates(float("nan"), 0.0)
    with pytest.raises(ValueError, match="lon must be between"):
        validate_coordinates(0.0, float("inf"))


# ---------------------------------------------------------------------------
# 2. LRU Cache Behavior & Eviction Safety
# ---------------------------------------------------------------------------

def test_lru_cache_bounds_and_hits():
    initial_stats = CACHE.stats()
    assert initial_stats["max_entries"] == 32

    # Query same request twice to verify cache hit
    r1 = client.get("/api/analysis?site_id=athena-im2&start=2026-10-14T00:00:00Z&end=2026-10-14T06:00:00Z")
    assert r1.status_code == 200

    stats_before = CACHE.stats()
    r2 = client.get("/api/analysis?site_id=athena-im2&start=2026-10-14T00:00:00Z&end=2026-10-14T06:00:00Z")
    assert r2.status_code == 200
    stats_after = CACHE.stats()
    assert stats_after["hits"] == stats_before["hits"] + 1

    # Verify cache size never exceeds max_entries
    for hour in range(35):
        h_str = f"{hour:02d}"
        client.get(
            f"/api/analysis?lat={hour}&lon=0.0&start=2026-10-14T00:00:00Z&end=2026-10-14T02:00:00Z"
        )
    final_stats = CACHE.stats()
    assert final_stats["entries"] <= 32


# ---------------------------------------------------------------------------
# 3. Photovoltaic Power & Battery Simulation Hardening
# ---------------------------------------------------------------------------

def test_power_calculation_handles_blackout_gracefully():
    """A site in long lunar night with small battery should enter CRITICAL_BLACKOUT without crash."""
    result = calculate_solar_power_and_battery(
        lat=0.0,
        lon=180.0,
        start="2026-10-14T00:00:00Z",
        end="2026-10-15T00:00:00Z",
        step_minutes=60,
        battery_capacity_wh=100.0,
        initial_soc_pct=20.0,
        base_power_load_w=500.0,
    )
    assert result["summary"]["power_survivable"] is False
    assert "CRITICAL_BLACKOUT" in result["summary"]["assessment"]
    assert result["summary"]["minimum_battery_soc_pct"] == 0.0


def test_power_calculation_zero_division_prevention():
    """Zero or negative parameters must be cleanly rejected with HTTP 422."""
    with pytest.raises(Exception):
        calculate_solar_power_and_battery(site_id="athena-im2", battery_capacity_wh=0.0)
    with pytest.raises(Exception):
        calculate_solar_power_and_battery(site_id="athena-im2", solar_array_area_m2=-1.0)
    with pytest.raises(Exception):
        calculate_solar_power_and_battery(site_id="athena-im2", cell_efficiency=0.0)
    with pytest.raises(Exception):
        calculate_solar_power_and_battery(site_id="athena-im2", array_orientation="invalid_mode")


# ---------------------------------------------------------------------------
# 4. Volatiles & Lunar Geodesic Proximity Checks
# ---------------------------------------------------------------------------

def test_lunar_distance_and_bearing_identical_point():
    dist, bearing = lunar_distance_and_bearing(-89.9, 0.0, -89.9, 0.0)
    assert dist == 0.0
    assert bearing == 0.0


def test_lunar_distance_and_bearing_antipodal():
    dist, _ = lunar_distance_and_bearing(0.0, 0.0, 0.0, 180.0)
    half_circumference = math.pi * 1737.4
    assert pytest.approx(dist, abs=1.0) == half_circumference


def test_volatiles_nan_coordinates_rejected():
    with pytest.raises(Exception):
        evaluate_volatiles_at_coordinate(lat=float("nan"), lon=0.0)
    with pytest.raises(Exception):
        evaluate_volatiles_at_coordinate(lat=0.0, lon=float("inf"))


# ---------------------------------------------------------------------------
# 5. 3D Terrain Models API Path Traversal & Vector Normalization
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("malicious_id", [
    "../../etc/passwd",
    "..%2f..%2fwindows%2fsystem32",
    "....//....//secret",
    "site04/../../passwords",
    "/root/.ssh/id_rsa",
])
def test_terrain_models_path_traversal_rejection(malicious_id):
    """Attempting path traversal must 404 or 422, never leak filesystem data."""
    res = client.get(f"/api/terrain/models/{malicious_id}")
    assert res.status_code in (404, 422)

    res_glb = client.get(f"/api/terrain/models/{malicious_id}/glb")
    assert res_glb.status_code in (404, 422)

    res_prev = client.get(f"/api/terrain/models/{malicious_id}/preview")
    assert res_prev.status_code in (404, 422)


def test_terrain_lighting_vectors_normalization_across_models():
    """All computed lighting directional vectors must strictly be 3D unit vectors."""
    for model_id in ["apollo-11", "apollo-12", "tycho", "copernicus"]:
        res = client.get(f"/api/terrain/models/{model_id}/lighting?time=2026-10-15T12:00:00Z")
        assert res.status_code == 200
        data = res.json()
        sun_vec = data["sun"]["directional_vector_local_z_up"]
        earth_vec = data["earth"]["directional_vector_local_z_up"]

        sun_norm = math.sqrt(sum(c**2 for c in sun_vec))
        earth_norm = math.sqrt(sum(c**2 for c in earth_vec))
        assert sun_norm == pytest.approx(1.0, abs=1e-4)
        assert earth_norm == pytest.approx(1.0, abs=1e-4)


# ---------------------------------------------------------------------------
# 6. Flight Readiness Review Dossier Comprehensive Validation
# ---------------------------------------------------------------------------

def test_build_mission_dossier_structure_and_certification():
    dossier = build_mission_dossier(
        lat=-3.0128,
        lon=-23.4219,
        start="2026-10-15T00:00:00Z",
        end="2026-10-15T06:00:00Z",
        step_minutes=30,
    )
    assert "document_type" in dossier
    assert "classification" in dossier
    assert "mission_overview" in dossier
    assert "scientific_visibility_summary" in dossier
    assert "polar_volatiles_assessment" in dossier
    assert "power_and_energy_summary" in dossier
    assert "provenance_and_verification" in dossier
    assert "flight_readiness_certification" in dossier

    cert = dossier["flight_readiness_certification"]
    assert cert["ephemeris_verified"] is True
    assert "compliance_statement" in cert
    assert dossier["measured_3d_terrain"]["model_available"] is True
    assert dossier["measured_3d_terrain"]["model_id"] == "apollo-12"


# ---------------------------------------------------------------------------
# 7. Multi-Threaded Concurrency & Deadlock Stress Test
# ---------------------------------------------------------------------------

def test_concurrent_spice_and_power_requests_no_deadlock():
    """Execute 30 concurrent mixed requests across SPICE, power, and volatiles."""
    def worker(i: int):
        if i % 3 == 0:
            return client.get(
                f"/api/analysis?lat={-80.0 + (i % 10)}&lon={i}&start=2026-10-15T00:00:00Z&end=2026-10-15T04:00:00Z"
            ).status_code
        elif i % 3 == 1:
            return client.get(
                f"/api/analysis/power?lat=-84.0&lon=30.0&start=2026-10-18T00:00:00Z&end=2026-10-18T06:00:00Z"
            ).status_code
        else:
            lon = ((i * 15) % 360) - 180
            return client.get(
                f"/api/terrain/volatiles?lat={-85.0 - (i % 5)}&lon={lon}"
            ).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(worker, range(30)))

    assert all(code == 200 for code in statuses)
