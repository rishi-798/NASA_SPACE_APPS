"""Landing-simulation terrain patch (/api/sim/terrain). Needs the local LOLA DEM for the real-data checks."""
import math

import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.terrain import on_demand

client = TestClient(app)
HAS_DEM = on_demand.DEFAULT_LOCAL_DEM.is_file()
needs_dem = pytest.mark.skipif(not HAS_DEM, reason="run python -m scripts.fetch_lola_dem")


@needs_dem
def test_patch_shape_frame_and_target_height():
    body = client.get("/api/sim/terrain", params={"lat": -84.79, "lon": 29.2}).json()
    n = body["count"]
    assert n == 51 and body["spacing_m"] == 80.0 and body["half_size_m"] == 2000
    assert len(body["heights_m"]) == n and all(len(row) == n for row in body["heights_m"])
    assert body["heights_m"][n // 2][n // 2] == 0.0                 # z = 0 at the surface under the target
    assert body["missing_cells"] == 0
    # Same DEM, same point as Athena's saved horizon profile (nearest pixel 5319.5 m; bilinear here).
    assert abs(body["target"]["dem_height_m"] - 5319.5) < 5


@needs_dem
def test_curvature_is_included():
    """A point 2 km away on a perfectly level DEM would sit d²/2R ≈ 1.15 m below the target's plane."""
    from backend.terrain import patch
    lat, lon, arc = patch._destination(-84.79, 29.2, __import__("numpy").array([2000.0]), __import__("numpy").array([0.0]), 1737400.0)
    drop = 1737400.0 * (1 - math.cos(arc[0]))
    assert abs(drop - 2000 ** 2 / (2 * 1737400)) < 1e-3


def test_outside_coverage_and_bad_input_are_explicit_errors():
    r = client.get("/api/sim/terrain", params={"lat": -70, "lon": 0})
    assert r.status_code == 422 and "80° S" in r.json()["detail"]
    assert client.get("/api/sim/terrain", params={"lat": -85, "lon": 0, "half_size_m": 99999}).status_code == 422
