"""
Tests for Autonomous Rover & Astronaut Traverse Planning Engine.
"""
from fastapi.testclient import TestClient
import pytest

from backend.app import app

client = TestClient(app)


def test_traverse_analysis_nominal_route():
    payload = {
        "waypoints": [
            {"name": "Touchdown LZ", "latitude": -89.80, "longitude": -155.55},
            {"name": "Ridge Crest Alpha", "latitude": -89.82, "longitude": -155.60},
            {"name": "Sampling Station B", "latitude": -89.85, "longitude": -155.70},
        ],
        "epoch": "2026-10-03T18:00:00Z",
        "rover_speed_kmh": 0.15,
        "rover_mass_kg": 35.0,
        "sample_spacing_m": 50.0,
    }
    res = client.post("/api/traverse/analyze", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["total_waypoints"] == 3
    assert data["total_distance_km"] > 0.0
    assert data["total_duration_hours"] > 0.0
    assert len(data["legs"]) == 2
    assert len(data["path_points"]) > 0
    assert data["route_safety_grade"] in ("OPTIMAL", "ACCEPTABLE_CAUTION", "HIGH_HAZARD", "CRITICAL_NO_GO")
    assert "total_energy_wh" in data


def test_traverse_analysis_shackleton_psr_cold_trap():
    payload = {
        "waypoints": [
            {"name": "Shackleton Rim Peak", "latitude": -89.9, "longitude": 0.0},
            {"name": "Interior Cold Trap", "latitude": -89.92, "longitude": 0.0},
        ],
        "epoch": "2026-10-03T18:00:00Z",
        "rover_speed_kmh": 0.1,
    }
    res = client.post("/api/traverse/analyze", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "Shackleton" in data["psr_craters_entered"]
    assert any(pt["inside_psr_trap"] == "Shackleton" for pt in data["path_points"])


def test_traverse_requires_minimum_two_waypoints():
    payload = {
        "waypoints": [
            {"name": "Solo Site", "latitude": 0.0, "longitude": 0.0}
        ],
        "epoch": "2026-10-03T18:00:00Z",
    }
    res = client.post("/api/traverse/analyze", json=payload)
    assert res.status_code == 422
