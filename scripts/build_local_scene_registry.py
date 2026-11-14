"""Index unchanged Blender GLBs and their supplied Moon-fixed transforms."""
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PIN = 'fa21e7f373ecc198ee48eac1c79554171de9e7de'


def build():
    scenes = []
    for path in sorted((ROOT / 'outputs').glob('*measured terrain metadata.json')):
        data = json.loads(path.read_text())
        candidate = data['candidate_glb']
        asset = ROOT / 'outputs' / candidate['filename']
        matrix = np.array(data['local_to_moon_fixed_matrix_row_major'])
        assert np.allclose(matrix[:3, :3].T @ matrix[:3, :3], np.eye(3), atol=1e-9)
        assert np.linalg.det(matrix[:3, :3]) > .999999
        anchor = data['anchor']
        scenes.append({
            'id': data['region_id'], 'name': data['scene'].replace(' - Measured terrain', ''),
            'anchor': {'latitude': anchor['latitude_planetocentric_deg'], 'longitude': anchor['longitude_east_deg']},
            'grid_id': data['grid_id'], 'coverage': {'kind': 'circle', 'radius_m': 10000},
            'model_url': f'https://raw.githubusercontent.com/rishi-798/NASA_SPACE_APPS/{PIN}/outputs/{quote(asset.name)}',
            'model_bytes': asset.stat().st_size, 'sha256': hashlib.sha256(asset.read_bytes()).hexdigest(),
            'local_to_moon_fixed': matrix.tolist(), 'gltf_up': 'Z',
            'reference_radius_m': data['vertical_reference_radius_m'], 'coordinate_frame': data['coordinate_frame'],
            'source_id': data['source_id'], 'source_spacing_m': data['source_pixel_spacing_m']['north_south'],
            'source_mismatch': data.get('api_center_uses_different_source', False),
            'height_delta_m': data.get('api_center_sample_delta_m'),
            'asset_metadata_url': f'https://raw.githubusercontent.com/rishi-798/NASA_SPACE_APPS/{PIN}/outputs/{quote(path.name)}',
            'view_state': 'measured terrain preview', 'source_production_ready': False,
        })
    g7 = json.loads((ROOT / 'metadata/alignment/SITE04-G7.scene.json').read_text())
    # The pilot is Y-up (east, up, -north); normalize to the same ENU as new exports.
    turn = np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]])
    world = np.array(g7['gltf_to_moon_fixed_column_major']).reshape(4, 4).T @ turn.T
    asset = ROOT / 'frontend/public/terrain/SITE04-G7.glb'
    scenes.insert(0, {
        'id': 'SITE04-G7', 'name': 'G7', 'grid_id': 'SITE04-G7',
        'anchor': {'latitude': g7['anchor']['latitude'], 'longitude': g7['anchor']['longitude']},
        'coverage': {'kind': 'grid', 'grid_id': 'SITE04-G7'},
        'model_url': '/terrain/SITE04-G7.glb', 'model_bytes': asset.stat().st_size,
        'sha256': hashlib.sha256(asset.read_bytes()).hexdigest(),
        'local_to_moon_fixed': world.tolist(), 'gltf_up': 'Y',
        'reference_radius_m': g7['reference_radius_m'], 'coordinate_frame': g7['coordinate_frame'],
        'source_id': g7['source_dem'], 'source_spacing_m': 5,
        'source_mismatch': False, 'height_delta_m': None,
        'view_state': 'measured terrain preview', 'source_production_ready': False,
        'appearance_note': 'Measured G7 alignment export; decorative rocks and procedural materials are not baked into this model.',
    })
    (ROOT / 'data/local-scenes.json').write_text(json.dumps({'scenes': scenes}, indent=2) + '\n')
    print(f'Indexed {len(scenes)} unchanged terrain models, including G7.')


if __name__ == '__main__':
    build()
