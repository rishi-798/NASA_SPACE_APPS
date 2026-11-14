import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.spice_kernels import KERNEL_FILES

client = TestClient(app)
RANGE = {"start": "2026-10-12T00:00:00Z", "end": "2026-10-13T00:00:00Z", "step_minutes": 30}

@pytest.mark.parametrize("site_id", ["athena-im2", "odysseus-im1"])
def test_bundle_matches_existing_calculation_routes(site_id):
    response = client.get("/api/analysis", params={**RANGE, "site_id": site_id})
    assert response.status_code == 200
    result = response.json()
    legacy = client.get(f"/api/sites/{site_id}/visibility/window", params=RANGE).json()
    # The bundle adds per-sample both_visible/status labels; time/sun/earth must equal the legacy route exactly.
    assert [{k: s[k] for k in ("time", "sun", "earth")} for s in result["samples"]] == legacy
    assert all(s["both_visible"] is (s["sun"]["visible"] and s["earth"]["visible"]) for s in result["samples"])
    assert result["summary"] == client.get(f"/api/sites/{site_id}/summary", params=RANGE).json()
    assert result["provenance"]["kernels"] == list(KERNEL_FILES)
    assert result["provenance"]["sample_values"] is False
    assert (result["horizon"] is not None) == (site_id == "athena-im2")
    assert len(result["samples"]) == 49


def test_custom_point_explicit_flat_horizon_and_partial_final_step():
    params = {**RANGE, "end": "2026-10-12T00:40:00Z", "lat": -83, "lon": 24}
    response = client.get("/api/analysis", params=params)
    assert response.status_code == 200
    result = response.json()
    assert result["horizon"] is None
    assert "terrain unavailable" in result["provenance"]["horizon_mode"]
    assert len(result["samples"]) == 2
    assert result["summary"] == client.get("/api/summary", params=params).json()

@pytest.mark.parametrize("extra", [
    {}, {"site_id": "bad"}, {"site_id": "athena-im2", "lat": 0, "lon": 0},
    {"lat": 91, "lon": 0}, {"site_id": "athena-im2", "end": RANGE["start"]},
    {"site_id": "athena-im2", "step_minutes": 0},
    {"site_id": "athena-im2", "end": "2027-01-01T00:00:00Z", "step_minutes": 1},
])
def test_invalid_bundle_requests(extra):
    assert client.get("/api/analysis", params={**RANGE, **extra}).status_code in (404, 422)


def test_missing_kernel_is_visible_error(monkeypatch, tmp_path):
    monkeypatch.setenv("SPICE_KERNELS_DIR", str(tmp_path))
    response = client.get("/api/analysis", params={**RANGE, "site_id": "odysseus-im1"})
    assert response.status_code == 503
    assert "Missing SPICE kernels" in response.json()["detail"]
