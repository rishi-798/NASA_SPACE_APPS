from pathlib import Path
import json
import sqlite3
import math

from fastapi.testclient import TestClient
from backend.app import app
from terrain.catalogue import catalogue_selection, dataset_root
from terrain.grid_scheme import identify


def test_catalogue_summaries_work_without_raster_or_manifest(monkeypatch, tmp_path):
    monkeypatch.setenv('LUNAR_DATASET_DIR', str(tmp_path))
    parent = identify(0, 0)['parent_grid_id']
    record = {'grid_id': parent, 'native_elevation_min_m': -123.4,
              'native_elevation_max_m': 456.7, 'native_statistics_spacing_m': 60}
    with sqlite3.connect(tmp_path / 'moon-grid-index.sqlite') as connection:
        connection.execute('CREATE TABLE grids (grid_id TEXT PRIMARY KEY, record_json TEXT)')
        connection.execute('INSERT INTO grids VALUES (?,?)', (parent, json.dumps(record)))
    result = TestClient(app).get('/api/terrain/catalogue?lat=0&lon=0')
    assert result.status_code == 200
    value = result.json()
    assert value['statistics']['native_elevation_min_m'] == -123.4
    assert value['statistics_grid_id'] == parent
    assert value['statistics_scope'] == 'parent grid (about 10 km)'
    assert value['point_elevation_m'] is None
    assert value['scene_available'] is False
    assert value['local_elevation_files'] == 0
    assert TestClient(app).get('/api/terrain/lookup?lat=0&lon=0').status_code == 503


def test_catalogue_missing_index_and_invalid_coordinates_are_explicit(monkeypatch, tmp_path):
    monkeypatch.setenv('LUNAR_DATASET_DIR', str(tmp_path))
    client = TestClient(app)
    assert client.get('/api/terrain/catalogue?lat=0&lon=0').status_code == 503
    assert client.get('/api/terrain/catalogue?lat=91&lon=0').status_code == 422
    assert client.get('/api/terrain/catalogue?lat=nan&lon=0').status_code == 422


def test_imported_catalogue_has_expected_records_and_actual_missing_files(monkeypatch):
    root = Path(__file__).resolve().parents[1] / 'data' / 'lunar'
    if not (root / 'moon-grid-index.sqlite').exists():
        import pytest
        pytest.skip('External catalogue not installed')
    monkeypatch.setenv('LUNAR_DATASET_DIR', str(root))
    assert dataset_root() == root
    with sqlite3.connect(root / 'moon-grid-index.sqlite') as connection:
        assert connection.execute('SELECT COUNT(*) FROM grids').fetchone()[0] == 379987
        assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    point = catalogue_selection(.67416, 23.47314)
    assert point['grid_id'] == 'MISSION-APOLLO-11'
    assert math.isclose(point['statistics']['source_resolution_m'], 2, abs_tol=1e-9)
    assert point['local_elevation_files'] == 0
    assert point['expected_elevation_files'] > 0
    assert point['latitude'] == .67416
    assert abs(point['longitude'] - 23.47314) < 1e-10
    global_point = catalogue_selection(0, 0)
    assert global_point['grid_id'].startswith('MOON-')
    assert global_point['statistics']['native_statistics_spacing_m'] is not None


def test_new_models_and_local_draco_are_available():
    client = TestClient(app)
    for model in ('sls-block-1.glb', 'ares-i-a.glb', 'ares-i-b.glb'):
        result = client.get('/' + model)
        source = Path(__file__).resolve().parents[1] / 'frontend' / 'public' / model
        assert source.read_bytes()[:4] == b'glTF'
        assert result.status_code == 200
        assert result.content[:4] == b'glTF'
    for decoder in ('draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'):
        result = client.get('/draco/' + decoder)
        assert result.status_code == 200
        assert len(result.content) > 1000
        if decoder.endswith('.wasm'):
            assert result.content[:4] == b'\x00asm'
