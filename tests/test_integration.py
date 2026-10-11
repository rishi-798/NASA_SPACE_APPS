from fastapi.testclient import TestClient

from backend.app import app
from backend.frontend import SPAStaticFiles


client = TestClient(app)


def test_frontend_horizon_contract():
    profile = client.get("/api/sites/athena-im2/horizon")
    assert profile.status_code == 200
    assert profile.json()["azimuth_step"] == 0.5
    assert len(profile.json()["horizon"]) == 720
    assert client.get("/api/sites/odysseus-im1/horizon").json() is None
    assert client.get("/api/sites/unknown/horizon").status_code == 404


def test_coordinate_summary_matches_named_flat_site():
    query = "start=2026-10-03T00:00:00Z&end=2026-10-04T00:00:00Z&step_minutes=30"
    coordinate = client.get("/api/summary?lat=-80.13&lon=1.44&" + query)
    named = client.get("/api/sites/odysseus-im1/summary?" + query)
    assert coordinate.status_code == named.status_code == 200
    assert coordinate.json() == {**named.json(), "site": None}


def test_coordinate_summary_validation():
    assert client.get("/api/summary?lat=91&lon=0&start=x&end=x").status_code == 422
    assert client.get("/api/summary?lat=0&lon=0&start=2026-10-03T00:00:00Z&end=2026-10-03T00:00:00Z").status_code == 422


def test_local_cors():
    response = client.get("/api/sites", headers={"Origin": "http://127.0.0.1:5174"})
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5174"
    response = client.get("/api/sites", headers={"Origin": "https://untrusted.example"})
    assert "access-control-allow-origin" not in response.headers


def test_spa_routes_and_assets(tmp_path):
    (tmp_path / "index.html").write_text("<html>NASA APP</html>", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log('NASA')", encoding="utf-8")
    static = TestClient(SPAStaticFiles(directory=tmp_path, html=True))
    for route in ("/", "/explorer", "/missions", "/timeline", "/about"):
        response = static.get(route)
        assert response.status_code == 200
        assert "NASA APP" in response.text
        assert response.headers["cache-control"] == "no-cache"
    assert static.get("/assets/app.js").status_code == 200
    assert "immutable" in static.get("/assets/app.js").headers["cache-control"]
    assert static.get("/assets/missing.js").status_code == 404
    assert static.get("/unknown").status_code == 404
    assert static.get("/api/unknown").json() == {"detail": "Not Found"}


def test_api_runs_without_frontend_build(tmp_path):
    static = TestClient(SPAStaticFiles(directory=tmp_path / "missing", check_dir=False))
    assert static.get("/").status_code == 503
    assert client.get("/health").status_code == 200
    assert client.get("/api/unknown").status_code == 404


def test_gzip_preserves_analysis_data():
    path = "/api/sites/athena-im2/horizon"
    compressed = client.get(path, headers={"Accept-Encoding": "gzip"})
    uncompressed = client.get(path, headers={"Accept-Encoding": "identity"})
    assert compressed.status_code == uncompressed.status_code == 200
    assert compressed.headers["content-encoding"] == "gzip"
    assert "content-encoding" not in uncompressed.headers
    assert compressed.json() == uncompressed.json()


def test_image_delivery_cache(tmp_path):
    (tmp_path / "hero.webp").write_bytes(b"test-image")
    static = TestClient(SPAStaticFiles(directory=tmp_path, html=True))
    response = static.get("/hero.webp")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=86400"


def test_prerender_is_home_only(tmp_path):
    (tmp_path / "index.html").write_text("<html>CLIENT SHELL</html>", encoding="utf-8")
    (tmp_path / "home.html").write_text("<html>LUNAR HOME</html>", encoding="utf-8")
    static = TestClient(SPAStaticFiles(directory=tmp_path, html=True))
    assert "LUNAR HOME" in static.get("/").text
    for route in ("/explorer", "/missions", "/timeline", "/about"):
        assert "CLIENT SHELL" in static.get(route).text
    assert static.get("/api/unknown").status_code == 404
