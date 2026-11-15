"""2026-11-14 — source-based camera filters, empty sols and input boundaries."""
from fastapi.testclient import TestClient
from backend.app import app
from backend.media20261114 import rovers20261114 as rovers


def test_rover_filters_and_pages_source_records(monkeypatch):
    records = [{'sol': 1000, 'imageid': str(i), 'camera': {'instrument': 'MAST_LEFT' if i < 25 else 'NAV_LEFT_B'},
                'image_files': {'full_res': 'http://mars.nasa.gov/image.jpg'}} for i in range(30)]
    monkeypatch.setattr(rovers, 'nasa_json', lambda *args, **kwargs: {'images': records})
    client = TestClient(app)
    result = client.get('/api/discover/rovers?camera=MAST_LEFT').json()
    assert result['total'] == 25 and len(result['items']) == 24 and result['nextPage'] == 2
    assert result['cameras'] == ['MAST_LEFT', 'NAV_LEFT_B']
    assert result['items'][0]['assetUrl'].startswith('https:')
    assert len(client.get('/api/discover/rovers?camera=MAST_LEFT&page=2').json()['items']) == 1
    assert client.get('/api/discover/rovers?sol=999').json()['items'] == []
    assert client.get('/api/discover/rovers?rover=invalid').status_code == 422
    assert client.get('/api/discover/rovers?sol=-1').status_code == 422
