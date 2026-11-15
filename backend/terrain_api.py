"""Cloud/local terrain catalogue routes (unchanged reads; see terrain/ and docs/CLOUD_TERRAIN.md).

These return point elevations and regional statistics. They are NOT a terrain
horizon and are not used by the visibility calculation.
"""
import re
from fastapi import APIRouter, Query
from terrain.catalogue import catalogue_selection, grid_record, lookup
from terrain.grid_scheme import coordinates, identify, site04_id
from backend.local_scenes import local_scene

from backend.errors import ApiError, api_errors
from backend.terrain_models_api import find_model_for_coordinates

router=APIRouter(prefix='/api/terrain',tags=['terrain'])

@router.get('/catalogue')
def terrain_catalogue(lat:float=Query(...,ge=-90,le=90),lon:float=Query(...,ge=-180,le=180)):
    """Available regional summaries, independently of missing raster/scene files."""
    with api_errors():
        result = catalogue_selection(lat,lon)
        selected = local_scene(lat, lon)
        result['scene_available'] = selected['scene_available']
        result['local_scene_id'] = selected['scene']['id'] if selected['scene'] else None
        return result

@router.get('/identity')
def terrain_identity(lat:float=Query(...,ge=-90,le=90),lon:float=Query(...,ge=-180,le=180)):
    """Indexing geometry and 3D measured model discovery."""
    with api_errors():
        latitude, longitude = coordinates(lat, lon)
        cell = identify(latitude, longitude)
        local = site04_id(latitude, longitude)
        selected = local_scene(latitude, longitude)
        matched_model = find_model_for_coordinates(latitude, longitude)
        model_available = False
        model_id = None
        model_url = None
        preview_url = None
        note = 'Grid identity only; measured model previews are available only within exported footprints.'
        
        if matched_model:
            model_available = True
            model_id = matched_model["id"]
            model_url = matched_model["glb_url"]
            preview_url = matched_model["preview_url"]
            note = f"High-resolution 3D measured terrain model available for {matched_model['name']}"
        elif local:
            m = re.match(r"SITE04-([A-P])(\d+)", local)
            if m:
                col_letter, row_num = m.group(1), int(m.group(2))
                block_letter = 'A' if col_letter <= 'H' and row_num <= 8 else (
                    'B' if col_letter <= 'H' and row_num > 8 else (
                        'C' if col_letter > 'H' and row_num <= 8 else 'D'
                    )
                )
                model_available = True
                model_id = f"site04-block-{block_letter.lower()}"
                note = f"Polar stereographic measured terrain in Site04 Grid Block {block_letter}"

        res = {
            **cell,
            'latitude': latitude,
            'longitude': longitude,
            'legacy_grid_id': local,
            'blender_object_name': local or cell['grid_id'],
            'elevation_m': None,
            'scene_available': selected['scene_available'],
            'model_available': model_available,
            'local_scene_id': selected['scene']['id'] if selected['scene'] else None,
            'note': note,
        }
        if model_id:
            res['model_id'] = model_id
        if model_url:
            res['model_url'] = model_url
        if preview_url:
            res['preview_url'] = preview_url
        return res

@router.get('/lookup')
def terrain_lookup(lat:float=Query(...,ge=-90,le=90),lon:float=Query(...,ge=-180,le=180)):
    with api_errors():
        return lookup(lat,lon)

@router.get('/grids/{grid_id}')
def terrain_grid(grid_id:str):
    try:
        with api_errors():
            return grid_record(grid_id)
    except ApiError as exc:
        if exc.code == 'invalid_request':  # unknown/invalid grid id
            raise ApiError(404, 'unknown_grid', exc.message) from exc
        raise
