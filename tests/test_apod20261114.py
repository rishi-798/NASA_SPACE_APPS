"""2026-11-14 — validate APOD boundaries, video handling and source identity."""
from fastapi.testclient import TestClient
from backend.app import app
from backend.media20261114 import apod20261114 as apod


def test_apod_keeps_videos_and_credits_and_rejects_future_dates(monkeypatch):
    monkeypatch.setattr(apod, 'nasa_json', lambda *args, **kwargs: [
        {'date': '2026-11-12', 'title': 'Moon', 'media_type': 'image', 'url': 'https://science.nasa.gov/moon',
         'hdurl': 'https://example.test/moon.jpg', 'credit': '<a>Artist</a>'},
        {'date': '2026-11-13', 'title': 'Film', 'media_type': 'iframe', 'url': 'https://example.test/movie'}])
    client = TestClient(app)
    response = client.get('/api/discover/apod?end=2026-11-13&days=2')
    assert response.status_code == 200
    first, second = response.json()['items']
    assert first['kind'] == 'video' and first['previewUrl'] == ''
    assert second['credit'] == 'Artist'
    assert second['sourceUrl'] == 'https://science.nasa.gov/moon'
    assert second['previewUrl'] == 'https://example.test/moon.jpg'
    assert client.get('/api/discover/apod?end=2999-01-01').status_code == 422
    assert client.get('/api/discover/apod?days=20').status_code == 422
