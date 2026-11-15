"""Tests for NASA Deep Space Network (DSN) Telemetry & RF Comm Link Budget API."""
import pytest
from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)


def test_link_budget_nominal_x_band():
    """Verify nominal X-band telemetry link budget calculation."""
    response = client.get(
        "/api/telemetry/link-budget",
        params={
            "lat": -89.8,
            "lon": -155.5,
            "time": "2026-10-03T18:00:00Z",
            "band": "X-band",
            "telemetry_rate_kbps": 1000.0,
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()

    # Ephemeris & Light-time checks
    eph = data["ephemeris_range"]
    assert 350000.0 < eph["earth_distance_km"] < 410000.0
    assert 1.15 < eph["one_way_light_time_sec"] < 1.40
    assert 2.30 < eph["round_trip_light_time_sec"] < 2.80

    # Path loss checks
    path = data["path_losses"]
    assert 218.0 < path["free_space_path_loss_db"] < 226.0

    # DSN Ground segment checks
    dsn = data["ground_segment_dsn"]
    assert dsn["primary_station_code"] in ["GDSCC", "MDSCC", "CDSCC"]
    assert len(dsn["all_stations"]) == 3

    # Link performance checks
    perf = data["link_budget_performance"]
    assert perf["carrier_to_noise_density_c_n0_dbhz"] > 70.0
    assert perf["link_margin_db"] > 10.0
    assert perf["max_sustainable_downlink_rate_kbps"] > 1000.0
    assert perf["comm_status"] in ["NOMINAL_HIGH_RATE_DTE", "DEGRADED_MARGIN_REDUCE_BITRATE"]


def test_link_budget_ka_band_higher_gain():
    """Verify Ka-band calculations have higher free space path loss but high throughput."""
    response = client.get(
        "/api/telemetry/link-budget",
        params={
            "lat": -89.8,
            "lon": -155.5,
            "time": "2026-10-03T18:00:00Z",
            "band": "Ka-band",
            "telemetry_rate_kbps": 10000.0,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["rf_configuration"]["carrier_frequency_ghz"] == 32.0
    assert data["path_losses"]["free_space_path_loss_db"] > 230.0


def test_link_budget_post_custom_parameters():
    """Verify POST endpoint with custom RF parameters (e.g. 20W transmitter, 0.8m dish)."""
    payload = {
        "lat": -89.8,
        "lon": -155.5,
        "time": "2026-10-03T18:00:00Z",
        "band": "X-band",
        "tx_power_w": 25.0,
        "dish_diam_m": 0.75,
        "telemetry_rate_kbps": 5000.0,
        "use_70m_dish": True,
    }
    response = client.post("/api/telemetry/link-budget/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["rf_configuration"]["transmitter_power_w"] == 25.0
    assert data["rf_configuration"]["dish_diameter_m"] == 0.75
    assert "70-meter" in data["ground_segment_dsn"]["receiving_antenna"]


def test_link_budget_unsupported_band_error():
    """Verify validation error on unsupported frequency band."""
    response = client.get(
        "/api/telemetry/link-budget",
        params={
            "lat": 0.0,
            "lon": 0.0,
            "time": "2026-10-03T18:00:00Z",
            "band": "S-band-unsupported",
        },
    )
    assert response.status_code == 422


def test_mission_dossier_includes_thermal_and_telemetry():
    """Verify Flight Readiness Review (FRR) dossier includes cryogenic and telemetry metrics."""
    response = client.get("/api/mission/dossier", params={"site_id": "athena-im2"})
    assert response.status_code == 200
    dossier = response.json()

    assert "cryogenic_thermal_survival" in dossier
    thermal = dossier["cryogenic_thermal_survival"]
    assert "surface_temperature_k" in thermal
    assert "survival_heater_watts" in thermal

    assert "deep_space_telemetry_link_budget" in dossier
    telemetry = dossier["deep_space_telemetry_link_budget"]
    assert "comm_status" in telemetry
    assert "link_margin_db" in telemetry
    assert "primary_dsn_station" in telemetry
