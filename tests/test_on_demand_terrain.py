"""On-demand LOLA horizons for custom coordinates.

Offline: a small SYNTHETIC polar-stereographic DEM (tests/test_terrain.make_dem) stands in for
the PGDA file via LOLA_80S_DEM_PATH, with a 2.5 km radius so it fits. The real-data check
(Athena regenerated from PGDA, bit-for-bit) runs only with RUN_NETWORK_TESTS=1.
"""
import json
import os
import threading
import time

import pytest
from fastapi.testclient import TestClient

from backend import analysis
from backend.app import app
from backend.terrain import horizon, on_demand, preprocess
from tests.conftest import needs_kernels
from tests.test_terrain import SITE, make_dem

client = TestClient(app)
DAY = {"start": "2026-10-12T00:00:00Z", "end": "2026-10-13T00:00:00Z", "step_minutes": 30}
SMALL = {"max_distance_m": 2500.0, "azimuth_step": 10.0, "observer_height_m": 0.0, "min_distance_m": 150.0}


@pytest.fixture
def synthetic_dem(tmp_path, monkeypatch):
    dem = tmp_path / "synthetic-lola.tif"
    make_dem(dem, ridges=[(90, 1000, 200)])  # a 200 m ridge 1 km east of the site
    monkeypatch.setenv("TERRAIN_ON_DEMAND", "1")
    monkeypatch.setenv("LOLA_80S_DEM_PATH", str(dem))
    monkeypatch.setattr(on_demand, "SETTINGS", dict(SMALL))
    return dem


@pytest.fixture
def builds(monkeypatch):
    calls = []
    real = preprocess.build_profile

    def counting(*args, **kwargs):
        calls.append(args[1]["latitude"])
        return real(*args, **kwargs)

    monkeypatch.setattr(preprocess, "build_profile", counting)
    return calls


def custom(lat=SITE["latitude"], lon=SITE["longitude"], **params):
    return client.get("/api/analysis", params={"lat": lat, "lon": lon, **DAY, **params})


def test_coverage_rule():
    assert on_demand.in_coverage(-84.79) and on_demand.in_coverage(-89.9) and on_demand.in_coverage(-90)
    assert on_demand.in_coverage(-81.32)          # limit is ~81.311 S for a 40 km radius
    assert not on_demand.in_coverage(-81.30)      # 40 km radius would leave the DEM
    assert not on_demand.in_coverage(-80.13)      # Odysseus: ~4 km from the DEM edge
    assert not on_demand.in_coverage(-30) and not on_demand.in_coverage(85)


def test_profile_is_the_existing_generator_output(synthetic_dem):
    profile, info = on_demand.get_profile(SITE["latitude"], SITE["longitude"])
    direct = preprocess.build_profile(str(synthetic_dem), {"id": "custom", **{k: SITE[k] for k in ("latitude", "longitude")}},
                                      on_demand.PGDA_DEM_URL, **{k: SMALL[k] for k in SMALL})
    assert info["status"] == "profile_generated" and info["cache"] == "miss"
    assert profile["horizon"] == direct["horizon"]
    assert horizon.horizon_at(profile, 90) > 5          # the ridge
    assert profile["generated"]["by"].startswith("backend.terrain.on_demand")


@needs_kernels
def test_custom_point_analysis_is_terrain_aware(synthetic_dem):
    body = custom().json()
    assert body["terrain"]["mode"] == "terrain_profile" and body["terrain"]["status"] == "profile_generated"
    assert body["terrain"]["terrain_obstruction_assessed"] is True
    assert body["provenance"]["horizon_mode"] == "LOLA terrain (generated for this coordinate)"
    assert body["horizon"]["site_id"] == "custom" and body["horizon"]["azimuth_step"] == 10.0
    for sample in body["samples"]:
        for name in ("sun", "earth"):
            b = sample[name]
            assert b["visible"] is (b["elevation"] > b["terrain_horizon"])
            assert b["terrain_clearance"] == pytest.approx(b["elevation"] - b["terrain_horizon"])
    assert body["warnings"] == []


@needs_kernels
def test_profiles_are_cached_and_never_shared_between_points(synthetic_dem, builds, tmp_path):
    custom()
    analysis.CACHE.clear()
    custom()
    assert builds == [SITE["latitude"]]                    # second request: disk cache, no rebuild
    other = custom(lat=SITE["latitude"] + 0.001).json()    # ~30 m away: its own profile
    assert len(builds) == 2 and other["terrain"]["status"] == "profile_generated"
    assert len(list(on_demand.cache_dir().glob("*.json"))) == 2


def test_corrupt_cache_file_is_regenerated(synthetic_dem, builds):
    on_demand.get_profile(SITE["latitude"], SITE["longitude"])
    (cached,) = on_demand.cache_dir().glob("*.json")
    cached.write_text("{broken")
    profile, info = on_demand.get_profile(SITE["latitude"], SITE["longitude"])
    assert info["cache"] == "miss" and len(builds) == 2 and profile["horizon"]


def test_cache_is_bounded(synthetic_dem, monkeypatch):
    monkeypatch.setenv("TERRAIN_CACHE_MAX_FILES", "2")
    for offset in (0, 0.001, 0.002):
        on_demand.get_profile(SITE["latitude"] + offset, SITE["longitude"])
    assert len(list(on_demand.cache_dir().glob("*.json"))) == 2


def test_concurrent_requests_for_one_point_build_once(synthetic_dem, monkeypatch):
    calls = []
    real = preprocess.build_profile

    def slow(*args, **kwargs):
        calls.append(1)
        time.sleep(0.3)
        return real(*args, **kwargs)

    monkeypatch.setattr(preprocess, "build_profile", slow)
    results = []
    threads = [threading.Thread(target=lambda: results.append(
        on_demand.get_profile(SITE["latitude"], SITE["longitude"]))) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(calls) == 1 and len(results) == 4
    assert {r[1]["cache"] for r in results} == {"miss", "hit"}


@needs_kernels
def test_outside_coverage_is_flat_without_reading_the_dem(synthetic_dem, builds):
    body = custom(lat=-79.5, lon=10).json()  # beyond the DEM even for the small test radius
    assert body["terrain"]["mode"] == "flat_horizon" and body["terrain"]["status"] == "no_profile_for_location"
    assert "outside the LOLA 80 S DEM coverage" in body["terrain"]["message"] and builds == []
    assert "terrain_horizon" not in body["samples"][0]["sun"]


@needs_kernels
def test_unreadable_dem_is_an_error_or_explicitly_degraded(monkeypatch, tmp_path):
    monkeypatch.setenv("TERRAIN_ON_DEMAND", "1")
    monkeypatch.setenv("LOLA_80S_DEM_PATH", str(tmp_path / "missing.tif"))
    response = custom()
    assert response.status_code == 503 and response.json()["error"]["code"] == "terrain_unavailable"
    assert str(tmp_path) not in response.text
    degraded = custom(allow_flat_fallback=True).json()
    assert degraded["terrain"]["mode"] == "flat_horizon_degraded"
    assert degraded["terrain"]["status"] == "on_demand_failed"
    assert "DEGRADED" in degraded["warnings"][0]
    assert degraded["provenance"]["horizon_mode"].startswith("Flat horizon — DEGRADED")


@needs_kernels
def test_remote_timeout_maps_to_504(monkeypatch):
    monkeypatch.setenv("TERRAIN_ON_DEMAND", "1")

    def timeout(_site):
        raise on_demand.OnDemandTerrainError("The LOLA elevation data did not respond in time.", timeout=True)

    monkeypatch.setattr(on_demand, "_generate", timeout)
    response = custom()
    assert response.status_code == 504 and response.json()["error"]["code"] == "external_data_timeout"


@needs_kernels
def test_flat_mode_disabled_mode_and_validation(synthetic_dem, builds, monkeypatch):
    flat = custom(terrain_mode="flat").json()
    assert flat["terrain"]["status"] == "not_requested" and builds == []
    assert flat["provenance"]["horizon_mode"] == "Flat horizon — terrain not requested"
    assert custom(terrain_mode="sideways").status_code == 422
    monkeypatch.setenv("TERRAIN_ON_DEMAND", "0")
    analysis.CACHE.clear()
    assert custom().json()["terrain"]["status"] == "on_demand_disabled"


@needs_kernels
def test_named_sites_keep_their_saved_profiles(synthetic_dem, builds):
    assert client.get("/api/analysis", params={"site_id": "athena-im2", **DAY}).json()["terrain"]["status"] == "profile_loaded"
    assert client.get("/api/analysis", params={"site_id": "odysseus-im1", **DAY}).json()["terrain"]["status"] == "no_profile_for_location"
    assert builds == []
    ready = client.get("/api/ready").json()["on_demand_terrain"]
    assert ready["enabled"] is True and ready["remote_reads_probed"] is False


@pytest.mark.skipif(os.environ.get("RUN_NETWORK_TESTS") != "1", reason="set RUN_NETWORK_TESTS=1 to read the PGDA DEM")
def test_real_pgda_regeneration_reproduces_athena_exactly(monkeypatch):
    monkeypatch.setenv("TERRAIN_ON_DEMAND", "1")
    monkeypatch.delenv("LOLA_80S_DEM_PATH", raising=False)
    saved = json.loads((horizon.PROFILE_DIR / "athena-im2.json").read_text())
    profile, info = on_demand.get_profile(saved["latitude"], saved["longitude"])
    assert info["status"] == "profile_generated"
    assert profile["horizon"] == saved["horizon"]
    assert profile["peak_distance_m"] == saved["peak_distance_m"]
    assert profile["site_elevation_m"] == saved["site_elevation_m"]


def test_transient_dem_read_failures_are_retried(synthetic_dem, monkeypatch):
    from rasterio.errors import RasterioIOError
    monkeypatch.setattr(on_demand.time, "sleep", lambda _s: None)
    monkeypatch.setattr(on_demand, "is_remote", lambda: True)  # retries apply to remote reads only
    real, calls = preprocess.build_profile, []

    def flaky(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise RasterioIOError("TIFFReadEncodedTile() failed: got 0 bytes")
        return real(*args, **kwargs)

    monkeypatch.setattr(preprocess, "build_profile", flaky)
    profile, info = on_demand.get_profile(SITE["latitude"], SITE["longitude"])
    assert info["status"] == "profile_generated" and len(calls) == 2


def test_persistent_dem_read_failure_is_reported_after_bounded_retries(synthetic_dem, monkeypatch):
    from rasterio.errors import RasterioIOError
    monkeypatch.setattr(on_demand.time, "sleep", lambda _s: None)
    monkeypatch.setattr(on_demand, "is_remote", lambda: True)
    monkeypatch.setenv("TERRAIN_READ_ATTEMPTS", "3")
    calls = []

    def broken(*_args, **_kwargs):
        calls.append(1)
        raise RasterioIOError("TIFFReadEncodedTile() failed: got 0 bytes")

    monkeypatch.setattr(preprocess, "build_profile", broken)
    with pytest.raises(on_demand.OnDemandTerrainError, match="could not be read"):
        on_demand.get_profile(SITE["latitude"], SITE["longitude"])
    assert len(calls) == 3


def test_local_dem_failures_are_not_retried(synthetic_dem, monkeypatch):
    from rasterio.errors import RasterioIOError
    calls = []

    def broken(*_args, **_kwargs):
        calls.append(1)
        raise RasterioIOError("corrupt local file")

    monkeypatch.setattr(preprocess, "build_profile", broken)
    with pytest.raises(on_demand.OnDemandTerrainError) as info:
        on_demand.get_profile(SITE["latitude"], SITE["longitude"])
    assert len(calls) == 1 and "fetch_lola_dem" not in str(info.value)
