"""Coordinate/grid handoff to measured Blender models; never changes DEM heights."""
import json
import math
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Query
from terrain.grid_scheme import coordinates, identify, site04_id, RADIUS_M

router = APIRouter(prefix='/api/terrain', tags=['local scenes'])


@lru_cache(maxsize=1)
def scenes():
    path = Path(__file__).resolve().parents[1] / 'data/local-scenes.json'
    return json.loads(path.read_text())['scenes']


def contains(scene, lat, lon):
    coverage = scene['coverage']
    if coverage['kind'] == 'grid':
        return site04_id(lat, lon) == coverage['grid_id']
    p, a = map(math.radians, [lat, scene['anchor']['latitude']])
    d = math.radians(lon - scene['anchor']['longitude'])
    hav = math.sin((p-a)/2)**2 + math.cos(p)*math.cos(a)*math.sin(d/2)**2
    return 2*RADIUS_M*math.asin(min(1, math.sqrt(max(0, hav)))) <= coverage['radius_m']


@router.get('/local-scenes')
def local_scene_index():
    return {'scenes': scenes(), 'note': 'Measured source meshes; crater overview registration remains provisional.'}


@router.get('/local-scene')
def local_scene(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    lat, lon = coordinates(lat, lon)
    matches = [s for s in scenes() if contains(s, lat, lon)]
    return {
        'latitude': lat, 'longitude': lon,
        'grid_id': site04_id(lat, lon) or identify(lat, lon)['grid_id'],
        'scene_available': bool(matches), 'scene': matches[0] if matches else None,
        'alternatives': [s['id'] for s in matches[1:]],
        'note': 'The selected point is preserved; model heights can differ from higher-resolution API sources.',
    }
