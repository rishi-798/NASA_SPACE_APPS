"""Tests for advanced scientific extensions:

1. Volatiles & Polar Cold Trap Proximity API (/api/terrain/volatiles, /api/terrain/psrs)
2. Photovoltaic Solar Power & Battery Budget Calculator (/api/analysis/power)
3. Flight Readiness Review (FRR) Dossier Generator (/api/mission/dossier, /api/mission/dossier/html)
"""
import pytest
from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)


def test_volatiles_psrs_catalog():
    res = client.get("/api/terrain/psrs")
    assert res.status_code == 200
    data = res.json()
    assert data["count"] >= 10
    ids = [t["id"] for t in data["cold_traps"]]
    assert "shackleton" in ids
    assert "cabeus" in ids
    assert "faustini" in ids
    assert "nobile" in ids


def test_volatiles_at_south_pole_shackleton():
    # Shackleton rim (-89.9, 0.0)
    res = client.get("/api/terrain/volatiles?lat=-89.9&lon=0.0")
    assert res.status_code == 200
    data = res.json()
    assert data["is_polar_region"] is True
    assert data["classification"] == "inside_cold_trap"
    assert data["volatile_potential_score"] >= 90
    assert data["nearest_cold_trap"]["id"] == "shackleton"
    assert data["ice_stability"]["estimated_depth_to_ice_table_m"] == 0.0


def test_volatiles_at_athena_mons_mouton():
    # Athena coordinates (-84.79, 29.20)
    res = client.get("/api/terrain/volatiles?lat=-84.79&lon=29.20")
    assert res.status_code == 200
    data = res.json()
    assert data["is_polar_region"] is True
    assert data["nearest_cold_trap"]["name"] == "Mons Mouton (PRIME-1/Athena)"
    assert data["ice_stability"]["drilling_feasibility"] == "Viable for 1m drills (e.g. TRIDENT)"


def test_volatiles_at_equator_apollo11():
    # Apollo 11 (0.674, 23.473)
    res = client.get("/api/terrain/volatiles?lat=0.674&lon=23.473")
    assert res.status_code == 200
    data = res.json()
    assert data["is_polar_region"] is False
    assert data["classification"] == "distal"
    assert data["volatile_potential_score"] <= 20
    assert "Unstable" in data["ice_stability"]["regime"]


def test_solar_power_and_battery_athena():
    # Test Athena site with vertical array during sunlit window (sun clears LOLA rim on Oct 17+)
    res = client.get(
        "/api/analysis/power?site_id=athena-im2&start=2026-10-18T00:00:00Z&end=2026-10-19T00:00:00Z"
        "&solar_array_area_m2=2.0&cell_efficiency=0.30&base_power_load_w=50.0&battery_capacity_wh=1200.0"
    )
    assert res.status_code == 200
    data = res.json()
    assert "Athena" in data["site"]["name"]
    assert "summary" in data
    assert "total_energy_generated_kwh" in data["summary"]
    assert data["summary"]["peak_generation_w"] > 0
    assert len(data["timeline"]) == 49  # 24h at 30 min step = 49 samples
    first_step = data["timeline"][0]
    assert "generated_power_w" in first_step
    assert "battery_soc_pct" in first_step


def test_solar_power_custom_coordinates():
    res = client.get(
        "/api/analysis/power?lat=-85.0&lon=0.0&start=2026-10-12T00:00:00Z&end=2026-10-12T12:00:00Z"
        "&array_orientation=horizontal"
    )
    assert res.status_code == 200
    data = res.json()
    assert data["site"]["latitude"] == -85.0
    assert data["payload_configuration"]["array_orientation"] == "horizontal"


def test_solar_power_invalid_site_raises_404():
    res = client.get("/api/analysis/power?site_id=nonexistent-site")
    assert res.status_code == 404


def test_mission_dossier_json():
    res = client.get(
        "/api/mission/dossier?site_id=athena-im2&start=2026-10-12T00:00:00Z&end=2026-10-13T00:00:00Z"
    )
    assert res.status_code == 200
    data = res.json()
    assert "Flight Readiness Review" in data["document_type"]
    assert data["mission_overview"]["site_name"] == "Athena landing site"
    assert "scientific_visibility_summary" in data
    assert "polar_volatiles_assessment" in data
    assert "power_and_energy_summary" in data
    assert "provenance_and_verification" in data
    assert data["flight_readiness_certification"]["ephemeris_verified"] is True


def test_mission_dossier_html():
    res = client.get(
        "/api/mission/dossier/html?site_id=athena-im2&start=2026-10-12T00:00:00Z&end=2026-10-13T00:00:00Z"
    )
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "Flight Readiness Review" in res.text
    assert "Athena" in res.text
    assert "window.print()" in res.text
