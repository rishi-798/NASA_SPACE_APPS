import hashlib
import json
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient
from backend.app import app
from backend.local_scenes import contains, scenes

ROOT = Path(__file__).resolve().parents[1]


def test_all_fourteen_centres_match_real_grid_handoff():
    client = TestClient(app)
    assert len(scenes()) == 14
    for scene in scenes():
        anchor = scene['anchor']
        response = client.get('/api/terrain/local-scene', params={
            'lat': anchor['latitude'], 'lon': anchor['longitude'],
        })
        assert response.status_code == 200
        result = response.json()
        assert result['scene_available'] and result['scene']['id'] == scene['id']
        assert result['grid_id'] == scene['grid_id']


def test_uncovered_points_do_not_claim_a_finished_scene():
    client = TestClient(app)
    result = client.get('/api/terrain/local-scene?lat=0&lon=0').json()
    assert result['scene_available'] is False and result['scene'] is None
    assert client.get('/api/terrain/local-scene?lat=91&lon=0').status_code == 422


def test_g7_axis_conversion_places_actual_control_points_in_moon_frame():
    g7 = scenes()[0]
    meta = json.loads((ROOT / 'metadata/alignment/SITE04-G7.scene.json').read_text())
    matrix = np.array(g7['local_to_moon_fixed'])
    assert contains(g7, meta['anchor']['latitude'], meta['anchor']['longitude'])
    assert not contains(g7, -89.5, 0)
    for control in meta['controls']:
        x, up, minus_north = control['gltf_m']
        position = matrix @ np.array([x, -minus_north, up, 1])
        assert np.linalg.norm(position[:3] - control['moon_fixed_m']) < .0001


def test_models_are_unmodified_and_anchors_have_correct_scale_orientation():
    for scene in scenes():
        matrix = np.array(scene['local_to_moon_fixed'])
        assert np.allclose(matrix[:3, :3].T @ matrix[:3, :3], np.eye(3), atol=1e-9)
        assert np.linalg.det(matrix[:3, :3]) > .999999
        origin = matrix[:3, 3]
        lat = np.degrees(np.arctan2(origin[2], np.hypot(*origin[:2])))
        lon = np.degrees(np.arctan2(origin[1], origin[0]))
        assert abs(lat-scene['anchor']['latitude']) < 1e-9
        assert abs(lon-scene['anchor']['longitude']) < 1e-9
        if scene['id'] == 'SITE04-G7':
            file = ROOT / 'frontend/public/terrain/SITE04-G7.glb'
        else:
            from urllib.parse import unquote
            file = ROOT / 'outputs' / unquote(scene['model_url'].split('/')[-1])
        assert hashlib.sha256(file.read_bytes()).hexdigest() == scene['sha256']
