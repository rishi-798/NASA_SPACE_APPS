"""
Tests for Lunar Surface Thermal Equilibrium and Cryogenic Survival Engine.
"""
from fastapi.testclient import TestClient
import pytest

from backend.app import app

client = TestClient(app)


def test_thermal_point_sunlit_equator():
    res = client.get("/api/thermal/point?lat=0.0&lon=0.0&time=2026-10-03T18:00:00Z")
    assert res.status_code == 200
    data = res.json()
    assert data["latitude"] == 0.0
    assert data["longitude"] == 0.0
    assert "surface_temperature_kelvin" in data
    assert "surface_temperature_celsius" in data
    assert data["thermal_regime"] in ("DIRECT_SUNLIGHT", "GRAZING_TWILIGHT", "DEEP_LUNAR_NIGHT")
    assert data["thermal_status"] in ("NOMINAL", "ELEVATED_HEAT", "COLD_WARNING", "CRYOGENIC_FREEZING_HAZARD")


def test_thermal_point_polar_south():
    res = client.get("/api/thermal/point?lat=-89.9&lon=0.0&time=2026-10-03T18:00:00Z")
    assert res.status_code == 200
    data = res.json()
    assert -89.9 == pytest.approx(data["latitude"])
    # Polar temperatures are cold
    assert data["surface_temperature_kelvin"] < 250.0
    assert data["survival_heater_required_watts"] >= 0.0


def test_thermal_timeseries_profile():
    payload = {
        "latitude": -84.79,
        "longitude": 29.20,
        "start_time": "2026-10-03T18:00:00Z",
        "end_time": "2026-10-04T18:00:00Z",
        "step_minutes": 120,
    }
    res = client.post("/api/thermal/timeseries", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["samples_count"] == 13
    assert data["min_temperature_c"] <= data["max_temperature_c"]
    assert "cryogenic_exposure_hours" in data
    assert len(data["samples"]) == 13


def test_thermal_timeseries_invalid_order():
    payload = {
        "latitude": 0.0,
        "longitude": 0.0,
        "start_time": "2026-10-05T00:00:00Z",
        "end_time": "2026-10-04T00:00:00Z",
        "step_minutes": 60,
    }
    res = client.post("/api/thermal/timeseries", json=payload)
    assert res.status_code == 400
