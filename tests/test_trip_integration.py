from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend.app import app
from terrain.grid_scheme import identify


def test_grid_identity_remains_available_without_elevation_data():
    client = TestClient(app)
    response = client.get('/api/terrain/identity?lat=0.67416&lon=23.47315')
    assert response.status_code == 200
    result = response.json()
    assert result['grid_id'] == identify(.67416, 23.47315)['grid_id']
    assert result['elevation_m'] is None
    assert result['scene_available'] is True
    assert result['local_scene_id'] == 'REGION-APOLLO-11'
    assert client.get('/api/terrain/identity?lat=91&lon=0').status_code == 422


def test_missing_raster_does_not_return_fabricated_height(monkeypatch, tmp_path):
    monkeypatch.setenv('LUNAR_DATASET_DIR', str(tmp_path))
    result = TestClient(app).get('/api/terrain/lookup?lat=0&lon=0')
    assert result.status_code == 503
    assert 'moon-dataset.json' in result.json()['detail']


@pytest.mark.skipif(not (Path(__file__).resolve().parents[1] / "frontend" / "public").is_dir(), reason="frontend not present in this checkout")
def test_trip_route_and_rocket_asset_are_served():
    client = TestClient(app)
    assert client.get('/trip').status_code == 200
    response = client.get('/saturn-v.glb')
    assert response.status_code == 200
    assert response.content[:4] == b'glTF'
