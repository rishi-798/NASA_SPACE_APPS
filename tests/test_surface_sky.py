import math
import numpy as np
import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.local_scenes import scenes
from backend.calculations.sun_earth import calculate_visibility

client=TestClient(app)

def test_local_scene_lighting_uses_scene_anchor_and_real_mesh_axes():
    scene=scenes()[0]
    result=client.get('/api/terrain/models/SITE04-G7/lighting?time=2026-11-14T18:00:00Z')
    assert result.status_code==200
    sky=result.json()
    assert sky['model_id']=='SITE04-G7'
    transform=np.array(scene['local_to_moon_fixed'])
    vis=calculate_visibility(**dict(latitude=scene['anchor']['latitude'],longitude=scene['anchor']['longitude'],utc_time=sky['time']))
    for name in ['sun','earth']:
        fixed=np.array(vis[name]['moon_fixed_position_km'])-transform[:3,3]/1000
        expected=transform[:3,:3].T @ (fixed/np.linalg.norm(fixed))
        assert np.allclose(expected,sky[name]['directional_vector_local_z_up'],atol=1e-10)
    assert .2<sky['sun']['angular_radius_deg']<.3
    assert .8<sky['earth']['angular_radius_deg']<1.1
    sun=np.array(vis['sun']['moon_fixed_position_km']); earth=np.array(vis['earth']['moon_fixed_position_km'])
    observer=transform[:3,3]/1000-earth; light=sun-earth
    expected_phase=(1+np.dot(observer,light)/np.linalg.norm(observer)/np.linalg.norm(light))/2
    assert sky['earth']['illuminated_fraction']==pytest.approx(expected_phase)
    assert np.linalg.norm(sky['earth']['sun_direction_local_z_up'])==pytest.approx(1)

def test_sky_changes_with_scrub_and_supports_existing_model_routes():
    first=client.get('/api/terrain/models/REGION-APOLLO-12/lighting?time=2026-11-14T18:00:00Z').json()
    last=client.get('/api/terrain/models/REGION-APOLLO-12/lighting?time=2026-11-15T18:00:00Z').json()
    assert first['sun']['directional_vector_local_z_up']!=last['sun']['directional_vector_local_z_up']
    assert first['earth']['illuminated_fraction']!=last['earth']['illuminated_fraction']
    for name in ['sun','earth']:
        assert math.isfinite(last[name]['angular_radius_deg'])
    assert client.get('/api/terrain/models/apollo-12/lighting?time=2026-11-14T18:00:00Z').status_code==200
    assert client.get('/api/terrain/models/missing/lighting').status_code==404
    assert client.get('/api/terrain/models/SITE04-G7/lighting?time=bad').status_code==422
