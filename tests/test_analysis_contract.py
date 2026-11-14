"""Analysis bundle, comparison, readiness and failure behaviour (real kernels, real Athena profile)."""
import json
import os
import shutil

import pytest
from fastapi.testclient import TestClient

from backend import analysis
from backend.app import app
from backend.calculations.sun_earth import calculate_visibility
from backend.spice_kernels import KERNEL_FILES, kernel_directory
from tests.conftest import needs_kernels, synthetic_profile, write_athena_profile

pytestmark = needs_kernels
client = TestClient(app)
DAY = {"start": "2026-10-12T00:00:00Z", "end": "2026-10-13T00:00:00Z", "step_minutes": 30}


def get(path="/api/analysis", **params):
    return client.get(path, params=params)


# ---------------------------------------------------------------- readiness

def test_ready_reports_calculations_and_terrain_capabilities():
    body = client.get("/api/ready").json()
    assert body["ready"] is True and body["calculations"]["available"] is True
    assert {k["filename"] for k in body["calculations"]["kernels"]} == set(KERNEL_FILES)
    assert all(k["sha256"] for k in body["calculations"]["kernels"])
    status = {p["site_id"]: p["status"] for p in body["terrain_profiles"]}
    assert status == {"athena-im2": "profile_loaded", "odysseus-im1": "no_profile_for_location"}
    assert body["cloud_terrain"]["remote_reads_probed"] is False
    assert client.get("/health").json() == {"ok": True}


def test_ready_is_503_when_kernels_missing_and_hides_paths(monkeypatch, tmp_path):
    monkeypatch.setenv("SPICE_KERNELS_DIR", str(tmp_path))
    response = client.get("/api/ready")
    assert response.status_code == 503 and response.json()["ready"] is False
    assert "Missing SPICE kernels" in response.json()["calculations"]["reason"]
    analysis_response = get(site_id="odysseus-im1", **DAY)
    assert analysis_response.status_code == 503
    assert analysis_response.json()["error"]["code"] == "kernels_unavailable"
    assert str(tmp_path) not in response.text + analysis_response.text


def test_corrupt_kernel_is_detected_by_manifest_hash(monkeypatch, tmp_path):
    real = kernel_directory()
    for name in KERNEL_FILES:
        (tmp_path / name).symlink_to(real / name)
    shutil.copy(real / "manifest.json", tmp_path / "manifest.json")
    (tmp_path / "naif0012.tls").unlink()
    (tmp_path / "naif0012.tls").write_text("\\begindata\nDELTET/DELTA_T_A = 0\n")
    monkeypatch.setenv("SPICE_KERNELS_DIR", str(tmp_path))
    response = client.get("/api/ready")
    assert response.status_code == 503 and "SHA-256" in response.json()["calculations"]["reason"]


# ------------------------------------------------------------ bundle shape

def test_athena_bundle_is_terrain_aware_and_internally_consistent():
    body = get(site_id="athena-im2", **DAY).json()
    assert body["schema_version"] == 1
    assert body["request"] == {**DAY, "sample_count": 49, "defaults_applied": []}
    assert body["terrain"]["mode"] == "terrain_profile" and body["terrain"]["terrain_obstruction_assessed"]
    assert body["terrain"]["profile_metadata"]["pixel_resolution_m"] == 80.0
    assert body["horizon"]["azimuth_step"] == 0.5 and len(body["horizon"]["horizon"]) == 720
    assert body["provenance"]["horizon_mode"] == "LOLA terrain"
    assert body["provenance"]["kernels"] == list(KERNEL_FILES)
    assert "abcorr NONE" in body["provenance"]["geometry"]
    assert body["engineering_checks"]["power_generation"] == "not assessed"
    assert "does not by itself prove" in body["engineering_checks"]["note"]
    assert "safe_to_land" not in json.dumps(body) and "mission_viable" not in json.dumps(body)
    for sample in body["samples"]:
        for name in ("sun", "earth"):
            b = sample[name]
            assert b["terrain_clearance"] == pytest.approx(b["elevation"] - b["terrain_horizon"])
            assert b["visible"] is (b["terrain_clearance"] > 0)
            assert b["flat_visible"] is (b["elevation"] > 0)
    # Summary derived from exactly these samples (sample-and-hold, 30 min each, end sample 0 min).
    held = body["samples"][:-1]
    for key, pick in (("sunlight_percent", lambda s: s["sun"]["visible"]),
                      ("earth_visible_percent", lambda s: s["earth"]["visible"]),
                      ("both_available_percent", lambda s: s["both_visible"])):
        assert body["summary"][key] == round(100 * sum(map(pick, held)) / len(held), 1)


def test_terrain_blocks_positive_elevation_sun_and_summary_follows_authoritative_flag():
    # Real LOLA case from the existing tests: Sun above 0 deg but behind Athena's terrain.
    params = {"start": "2026-10-15T00:00:00Z", "end": "2026-10-15T03:00:00Z", "step_minutes": 30}
    body = get(site_id="athena-im2", **params).json()
    first = body["samples"][0]["sun"]
    assert first["elevation"] > 0 and first["flat_visible"] is True and first["visible"] is False
    blocked = [s for s in body["samples"][:-1] if s["sun"]["flat_visible"] and not s["sun"]["visible"]]
    assert blocked
    expected = 100 * sum(s["sun"]["visible"] for s in body["samples"][:-1]) / 6
    assert body["summary"]["sunlight_percent"] == round(expected, 1)


def test_synthetic_high_horizon_hides_everything(profile_dir, monkeypatch):
    monkeypatch.setenv("ALLOW_SYNTHETIC_TERRAIN", "1")
    write_athena_profile(profile_dir, synthetic_profile(89.0))
    body = get(site_id="athena-im2", **DAY).json()
    assert body["summary"]["sunlight_percent"] == 0 and body["summary"]["earth_visible_percent"] == 0
    assert body["summary"]["windows"]["sunlight"] == []
    assert body["summary"]["longest_darkness_minutes"] == 1440


def test_synthetic_profile_refused_without_test_flag(profile_dir, monkeypatch):
    monkeypatch.delenv("ALLOW_SYNTHETIC_TERRAIN", raising=False)
    write_athena_profile(profile_dir, synthetic_profile(10.0))
    response = get(site_id="athena-im2", **DAY)
    assert response.status_code == 503 and "synthetic" in response.json()["detail"]


def test_odysseus_flat_mode_is_explicit_and_lower_confidence():
    body = get(site_id="odysseus-im1", **DAY).json()
    assert body["terrain"]["mode"] == "flat_horizon"
    assert body["terrain"]["status"] == "no_profile_for_location"
    assert body["terrain"]["terrain_obstruction_assessed"] is False
    assert "80 S coverage edge" in body["terrain"]["message"]
    assert body["horizon"] is None and body["warnings"]
    assert "terrain unavailable" in body["provenance"]["horizon_mode"]
    sun = body["samples"][0]["sun"]
    assert "terrain_horizon" not in sun and "flat_visible" not in sun
    assert sun["visible"] is (sun["elevation"] > 0)
    assert sun == calculate_visibility(-80.13, 1.44, DAY["start"])["sun"]


def test_custom_coordinate_and_post_form():
    g = get(lat=-83, lon=24, name="Ridge", **DAY).json()
    p = client.post("/api/analysis", json={"lat": -83, "lon": 24, "name": "Ridge", **DAY}).json()
    assert g == p
    assert g["site"]["kind"] == "custom" and g["site"]["id"] is None and g["site"]["name"] == "Ridge"
    assert g["terrain"]["status"] == "no_profile_for_location"


# ----------------------------------------------------- configured terrain failures

def test_missing_configured_profile_is_visible_error_or_explicitly_degraded(profile_dir):
    (profile_dir / "athena-im2.json").unlink()
    response = get(site_id="athena-im2", **DAY)
    assert response.status_code == 503 and response.json()["error"]["code"] == "terrain_unavailable"
    assert "missing" in response.json()["detail"] and str(profile_dir) not in response.text
    assert client.get("/api/sites/athena-im2/horizon").status_code == 503  # never a silent null
    assert client.get("/api/sites/athena-im2/visibility", params={"time": DAY["start"]}).status_code == 503
    degraded = get(site_id="athena-im2", allow_flat_fallback=True, **DAY).json()
    assert degraded["terrain"]["mode"] == "flat_horizon_degraded"
    assert degraded["terrain"]["status"] == "configured_profile_missing"
    assert "DEGRADED" in degraded["warnings"][0] and "DEGRADED" in degraded["provenance"]["horizon_mode"]
    ready = client.get("/api/ready").json()
    assert {p["site_id"]: p["status"] for p in ready["terrain_profiles"]}["athena-im2"] == "configured_profile_missing"


@pytest.mark.parametrize("content", [b"{not json", b"\x00\xff", json.dumps({"site_id": "athena-im2"}).encode()])
def test_corrupt_configured_profile(profile_dir, content):
    write_athena_profile(profile_dir, content)
    response = get(site_id="athena-im2", **DAY)
    assert response.status_code == 503 and str(profile_dir) not in response.text
    degraded = get(site_id="athena-im2", allow_flat_fallback=True, **DAY).json()
    assert degraded["terrain"]["status"] == "configured_profile_invalid"


# --------------------------------------------------------------- validation

@pytest.mark.parametrize("params,status,code", [
    ({}, 422, "invalid_request"),                                                  # neither site nor coordinates
    ({"site_id": "athena-im2", "lat": 0, "lon": 0}, 422, "invalid_request"),        # both
    ({"lat": 0}, 422, "invalid_request"),                                           # lon missing
    ({"site_id": "nope"}, 404, "unknown_site"),
    ({"lat": 91, "lon": 0}, 422, "invalid_request"),
    ({"lat": 0, "lon": 181}, 422, "invalid_request"),
    ({"lat": "nan", "lon": 0}, 422, "invalid_request"),
    ({"lat": 0, "lon": "inf"}, 422, "invalid_request"),
    ({"site_id": "athena-im2", "start": "2026-10-12T00:00:00"}, 422, "invalid_request"),   # naive
    ({"site_id": "athena-im2", "start": "yesterday"}, 422, "invalid_request"),
    ({"site_id": "athena-im2", "start": DAY["end"], "end": DAY["start"]}, 422, "invalid_request"),
    ({"site_id": "athena-im2", "start": DAY["start"], "end": DAY["start"]}, 422, "invalid_request"),
    ({"site_id": "athena-im2", "step_minutes": 0}, 422, "invalid_request"),
    ({"site_id": "athena-im2", "step_minutes": 1441}, 422, "invalid_request"),
    ({"site_id": "athena-im2", "step_minutes": 2.5}, 422, "invalid_request"),
    ({"site_id": "athena-im2", "start": "2026-10-12T00:00:00Z", "end": "2026-10-13T09:20:00Z", "step_minutes": 1},
     422, "too_many_samples"),
    ({"site_id": "athena-im2", "start": "2300-01-01T00:00:00Z"}, 422, "outside_kernel_coverage"),
])
def test_invalid_requests_return_typed_errors(params, status, code):
    response = get(**params)
    assert response.status_code == status, response.text
    assert response.json()["error"]["code"] == code
    assert response.json()["detail"]


def test_sample_limit_boundary_is_inclusive():
    ok = get(site_id="odysseus-im1", start="2026-10-12T00:00:00Z", end="2026-10-13T09:19:00Z", step_minutes=1)
    assert ok.status_code == 200 and ok.json()["request"]["sample_count"] == 2000


def test_post_rejects_unknown_fields():
    assert client.post("/api/analysis", json={"site_id": "athena-im2", "sitee": 1}).status_code == 422


def test_defaults_single_utc_day_30_minutes():
    body = get(site_id="odysseus-im1").json()
    assert body["request"]["step_minutes"] == 30 and body["request"]["sample_count"] == 49
    assert body["request"]["defaults_applied"] == ["start", "end", "step_minutes"]
    assert body["request"]["start"].endswith("T00:00:00Z")


# ---------------------------------------------------------- time handling

def test_equivalent_iso_representations_give_identical_results():
    base = get(site_id="athena-im2", **DAY).json()
    for start, end in (("2026-10-12T00:00:00+00:00", "2026-10-13T00:00:00+00:00"),
                       ("2026-10-11T20:00:00-04:00", "2026-10-13T05:30:00+05:30"),
                       ("2026-10-12T00:00:00.000Z", "2026-10-13T00:00:00Z")):
        other = get(site_id="athena-im2", start=start, end=end, step_minutes=30).json()
        assert other["request"]["start"] == DAY["start"] and other["request"]["end"] == DAY["end"]
        assert other["samples"] == base["samples"] and other["summary"] == base["summary"]


def test_utc_handling_across_us_dst_change():
    # US DST began 2026-03-08 02:00 local: 01:30 PST -> 03:30 PDT is ONE elapsed hour.
    body = get(site_id="odysseus-im1", start="2026-03-08T01:30:00-08:00", end="2026-03-08T03:30:00-07:00",
               step_minutes=30).json()
    assert body["request"]["start"] == "2026-03-08T09:30:00Z" and body["request"]["end"] == "2026-03-08T10:30:00Z"
    assert len(body["samples"]) == 3 and body["summary"]["total_minutes"] == 60


def test_off_grid_end_gives_partial_final_interval():
    body = get(site_id="odysseus-im1", start="2026-10-12T00:00:00Z", end="2026-10-12T01:40:00Z",
               step_minutes=30).json()
    assert [s["time"][11:16] for s in body["samples"]] == ["00:00", "00:30", "01:00", "01:30"]
    assert body["summary"]["total_minutes"] == 100
    windows = body["summary"]["windows"]["earth_visible"]
    assert windows[-1]["end"] == "2026-10-12T01:40:00Z" and windows[-1]["ends_at_range_end"] is True


# --------------------------------------------------------------- comparison

def test_compare_uses_one_grid_and_reports_confidence():
    body = client.get("/api/compare", params={**DAY, "end": "2026-10-19T00:00:00Z"}).json()
    assert body["shared_sample_times"] is True
    assert [s["site_id"] for s in body["sites"]] == ["odysseus-im1", "athena-im2"]
    times = [[x["time"] for x in s["analysis"]["samples"]] for s in body["sites"]]
    assert times[0] == times[1] and len(times[0]) == body["request"]["sample_count"]
    assert {row["horizon_mode"] for row in body["table"]} == {"terrain_profile", "flat_horizon"}
    assert any("NOT equal-confidence" in n for n in body["comparison_notes"])
    solo = get(site_id="athena-im2", start=DAY["start"], end="2026-10-19T00:00:00Z", step_minutes=30).json()
    assert body["sites"][1]["analysis"]["summary"] == solo["summary"]
    assert client.post("/api/compare", json={**DAY}).json()["table"] == client.get("/api/compare", params=DAY).json()["table"]


def test_compare_lists_failed_site_instead_of_omitting_it(profile_dir):
    (profile_dir / "athena-im2.json").unlink()
    body = client.get("/api/compare", params=DAY).json()
    by_id = {s["site_id"]: s for s in body["sites"]}
    assert by_id["athena-im2"]["ok"] is False and by_id["athena-im2"]["error"]["code"] == "terrain_unavailable"
    assert by_id["odysseus-im1"]["ok"] is True
    assert [row["site_id"] for row in body["table"]] == ["odysseus-im1"]
    assert any("failed" in n for n in body["comparison_notes"])


@pytest.mark.parametrize("body,status", [
    ({"site_ids": ["athena-im2"]}, 422),
    ({"site_ids": ["athena-im2", "athena-im2"]}, 422),
    ({"site_ids": ["athena-im2", "nope"]}, 404),
    ({"start": DAY["start"], "end": "2026-10-20T00:00:00Z", "step_minutes": 1}, 422),
])
def test_compare_validation_fails_whole_request(body, status):
    assert client.post("/api/compare", json=body).status_code == status


# -------------------------------------------------------------------- cache

def test_cache_never_mixes_locations_ranges_steps_or_terrain(profile_dir, monkeypatch):
    a = get(site_id="athena-im2", **DAY).json()
    assert get(site_id="athena-im2", **DAY).json() == a and analysis.CACHE.hits == 1
    o = get(site_id="odysseus-im1", **DAY).json()
    assert o["samples"][0]["sun"]["azimuth"] != a["samples"][0]["sun"]["azimuth"]
    c1, c2 = get(lat=-83, lon=24, **DAY).json(), get(lat=-83, lon=24.01, **DAY).json()
    assert c1["samples"][0]["sun"]["azimuth"] != c2["samples"][0]["sun"]["azimuth"]
    assert len(get(site_id="athena-im2", **{**DAY, "step_minutes": 60}).json()["samples"]) == 25
    assert get(site_id="athena-im2", **{**DAY, "end": "2026-10-12T12:00:00Z"}).json()["summary"]["total_minutes"] == 720
    lit = {"start": "2026-10-22T00:00:00Z", "end": "2026-10-23T00:00:00Z", "step_minutes": 30}
    real = get(site_id="athena-im2", **lit).json()
    assert real["summary"]["sunlight_percent"] > 0
    monkeypatch.setenv("ALLOW_SYNTHETIC_TERRAIN", "1")
    write_athena_profile(profile_dir, synthetic_profile(89.0))  # terrain changed -> must recompute
    changed = get(site_id="athena-im2", **lit).json()
    assert changed["horizon"]["horizon"][0] == 89.0
    assert changed["summary"]["sunlight_percent"] == 0 and changed["summary"]["earth_visible_percent"] == 0


def test_cached_result_is_not_mutated_by_callers():
    first = analysis.build_analysis("odysseus-im1", None, None, DAY["start"], DAY["end"], 30)
    first["samples"].clear()
    first["summary"]["sunlight_percent"] = -1
    again = analysis.build_analysis("odysseus-im1", None, None, DAY["start"], DAY["end"], 30)
    assert len(again["samples"]) == 49 and again["summary"]["sunlight_percent"] >= 0


# ------------------------------------------------------------- error hygiene

def test_spice_failure_returns_calculation_failed_without_internals(monkeypatch):
    from backend.calculations import sun_earth
    import spiceypy

    def boom(*_args, **_kwargs):
        raise spiceypy.utils.exceptions.SpiceyError("SPICE(TEST) /very/secret/path/kernel.bsp")

    monkeypatch.setattr(sun_earth.spiceypy, "spkpos", boom)
    response = get(lat=10, lon=10, **DAY)
    assert response.status_code == 502 and response.json()["error"]["code"] == "calculation_failed"
    assert "/very/secret" not in response.text and "Traceback" not in response.text


def test_openapi_documents_new_contract():
    schema = client.get("/openapi.json").json()
    for path in ("/api/analysis", "/api/compare", "/api/ready", "/api/methodology", "/api/sites/{site_id}"):
        assert path in schema["paths"]
    assert "AnalysisResponse" in schema["components"]["schemas"]


# ------------------------------------------------------ visibility transitions (real data)

TRANSITION = {"start": "2026-10-16T12:00:00Z", "end": "2026-10-18T00:00:00Z", "step_minutes": 30}


@pytest.mark.parametrize("site_id,before,after,terrain", [
    ("athena-im2", "2026-10-17T01:30:00Z", "2026-10-17T02:00:00Z", True),     # Sun clears LOLA ridge
    ("odysseus-im1", "2026-10-17T16:30:00Z", "2026-10-17T17:00:00Z", False),  # Sun crosses flat horizon
])
def test_real_sunrise_transition_agrees_across_samples_windows_and_summary(site_id, before, after, terrain):
    body = get(site_id=site_id, **TRANSITION).json()
    by_time = {s["time"]: s["sun"] for s in body["samples"]}
    assert by_time[before]["visible"] is False and by_time[after]["visible"] is True
    if terrain:
        # Above the flat horizon throughout: only the terrain horizon hides it.
        assert by_time[before]["flat_visible"] is True and by_time[before]["terrain_clearance"] < 0
        assert by_time[after]["terrain_clearance"] > 0
    else:
        assert by_time[before]["elevation"] < 0 < by_time[after]["elevation"]
    (window,) = body["summary"]["windows"]["sunlight"]
    assert window["start"] == after and window["starts_at_range_start"] is False
    assert window["end"] == TRANSITION["end"] and window["ends_at_range_end"] is True
    assert body["summary"]["sunlight_percent"] == round(100 * window["duration_minutes"] / (36 * 60), 1)
    assert body["summary"]["longest_darkness_minutes"] == 36 * 60 - window["duration_minutes"]


@pytest.mark.parametrize("site_id,before,after", [
    ("athena-im2", "2026-10-17T01:30:00Z", "2026-10-17T02:00:00Z"),
    ("odysseus-im1", "2026-10-17T16:30:00Z", "2026-10-17T17:00:00Z"),
])
def test_finer_sampling_places_crossing_within_the_coarse_step(site_id, before, after):
    fine = get(site_id=site_id, start=before, end=after, step_minutes=1).json()
    states = [s["sun"]["visible"] for s in fine["samples"]]
    assert states[0] is False and states[-1] is True
    first_visible = states.index(True)
    assert 0 < first_visible <= 30
    assert all(states[first_visible:])  # a single rise inside the 30-minute step, no flicker
