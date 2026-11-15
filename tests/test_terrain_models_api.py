"""Unit and contract tests for the 3D Lunar Terrain Models API."""
import math
import pytest
from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)


def test_list_models_returns_all_models_and_glbs():
    response = client.get("/api/terrain/models")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 20
    assert data["glb_count"] == 16

    models = data["models"]
    model_ids = {m["id"] for m in models}
    assert "apollo-12" in model_ids
    assert "apollo-11" in model_ids
    assert "tycho" in model_ids
    assert "site04-block-a" in model_ids

    # Verify model structure
    for m in models:
        assert "id" in m
        assert "name" in m
        assert "kind" in m
        assert "latitude_deg" in m
        assert "longitude_deg" in m
        assert "source" in m
        assert m["coordinate_frame"] == "ME/DE421"


def test_get_single_model_success_and_404():
    # Landing site
    res1 = client.get("/api/terrain/models/apollo-12")
    assert res1.status_code == 200
    m1 = res1.json()
    assert m1["id"] == "apollo-12"
    assert m1["name"] == "Apollo 12"
    assert m1["kind"] == "landing_site"
    assert m1["has_glb"] is True
    assert m1["glb_url"] == "/api/terrain/models/apollo-12/glb"

    # Crater overview
    res2 = client.get("/api/terrain/models/tycho")
    assert res2.status_code == 200
    m2 = res2.json()
    assert m2["id"] == "tycho"
    assert m2["kind"] == "crater_overview"
    assert m2["has_glb"] is True

    # 404 for non-existent model
    res3 = client.get("/api/terrain/models/non-existent-site-xyz")
    assert res3.status_code == 404


def test_get_model_glb_streams_valid_gltf_binary():
    response = client.get("/api/terrain/models/apollo-12/glb")
    assert response.status_code == 200
    assert response.headers.get("content-type") == "model/gltf-binary"
    assert len(response.content) > 10_000_000  # ~10.7 MB
    # GLB binary magic header check: 0x46546C67 ("glTF")
    assert response.content[:4] == b"glTF"


def test_get_model_preview_streams_png():
    response = client.get("/api/terrain/models/apollo-12/preview")
    assert response.status_code == 200
    assert response.headers.get("content-type") == "image/png"
    assert len(response.content) > 500_000
    # PNG binary magic header check
    assert response.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_get_model_metadata_returns_provenance():
    response = client.get("/api/terrain/models/apollo-12/metadata")
    assert response.status_code == 200
    data = response.json()
    assert data["region_id"] == "REGION-APOLLO-12"
    assert data["scene"] == "Apollo 12 - Measured terrain"
    assert "source_id" in data


def test_get_model_lighting_returns_valid_vectors():
    time_iso = "2026-11-15T12:00:00Z"
    response = client.get(f"/api/terrain/models/apollo-12/lighting?time={time_iso}")
    assert response.status_code == 200
    data = response.json()
    assert data["model_id"] == "apollo-12"
    assert data["time"] == time_iso

    sun = data["sun"]
    assert "azimuth_deg" in sun
    assert "elevation_deg" in sun
    assert "visible" in sun
    vec = sun["directional_vector_local_z_up"]
    assert len(vec) == 3
    # Check unit vector normalization (x^2 + y^2 + z^2 ≈ 1.0)
    norm = math.sqrt(vec[0]**2 + vec[1]**2 + vec[2]**2)
    assert norm == pytest.approx(1.0, abs=1e-4)

    # Invalid time format returns 422
    err_res = client.get("/api/terrain/models/apollo-12/lighting?time=invalid-date")
    assert err_res.status_code == 422


def test_terrain_identity_matches_model_and_site04():
    # Apollo 12 coordinates (-3.0128, -23.4219)
    res_ap12 = client.get("/api/terrain/identity?lat=-3.0128&lon=-23.4219")
    assert res_ap12.status_code == 200
    data_ap12 = res_ap12.json()
    assert data_ap12["scene_available"] is True
    assert data_ap12["model_available"] is True
    assert data_ap12["model_id"] == "apollo-12"
    assert data_ap12["model_url"] == "/api/terrain/models/apollo-12/glb"
    assert "Apollo 12" in data_ap12["note"]

    # Tycho coordinates (-43.3, -11.22)
    res_tycho = client.get("/api/terrain/identity?lat=-43.3&lon=-11.22")
    assert res_tycho.status_code == 200
    data_tycho = res_tycho.json()
    assert data_tycho["scene_available"] is False
    assert data_tycho["model_available"] is True
    assert data_tycho["model_id"] == "tycho"

    # South Pole coordinates inside Site04 (-89.835, 180.0) -> Site04 polar stereographic block
    res_pole = client.get("/api/terrain/identity?lat=-89.835&lon=180.0")
    assert res_pole.status_code == 200
    data_pole = res_pole.json()
    assert data_pole["model_available"] is True
    assert "Site04" in data_pole["note"]
    assert data_pole["model_id"] == "site04-block-c"

    # Far side location without local model (lat: 0, lon: 180)
    res_far = client.get("/api/terrain/identity?lat=0.0&lon=180.0")
    assert res_far.status_code == 200
    data_far = res_far.json()
    assert data_far["scene_available"] is False
    assert data_far["model_available"] is False
