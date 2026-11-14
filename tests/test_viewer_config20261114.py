from fastapi.testclient import TestClient

from backend.app import app


def test_missing_token_is_explicit_and_never_exposes_other_secrets(monkeypatch):
    monkeypatch.delenv('CESIUM_PUBLIC_ION_TOKEN', raising=False)
    monkeypatch.setenv('NASA_API_KEY', 'private-test-value')
    response = TestClient(app).get('/api/viewer-config')
    assert response.status_code == 200
    assert response.json() == {'moonAssetId': 2684829, 'cesiumIonAccessToken': None}
    assert response.headers['cache-control'] == 'no-store'
    assert 'private-test-value' not in response.text


def test_only_explicit_browser_token_is_returned(monkeypatch):
    monkeypatch.setenv('CESIUM_PUBLIC_ION_TOKEN', '  test-browser-read-token  ')
    assert TestClient(app).get('/api/viewer-config').json() == {
        'moonAssetId': 2684829, 'cesiumIonAccessToken': 'test-browser-read-token',
    }
