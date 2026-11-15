"""2026-11-14: direct production links work without masking missing APIs/assets."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.frontend import SPAStaticFiles


def test_discovery_deep_link_and_missing_resources(tmp_path):
    (tmp_path / 'index.html').write_text('<main>discovery-client</main>')
    app = FastAPI()
    app.mount('/', SPAStaticFiles(directory=tmp_path))
    client = TestClient(app)
    direct = client.get('/discover')
    assert direct.status_code == 200 and 'discovery-client' in direct.text
    assert client.get('/api/discover/unknown').status_code == 404
    assert client.get('/assets/missing.js').status_code == 404
