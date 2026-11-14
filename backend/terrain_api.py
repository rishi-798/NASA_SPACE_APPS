"""Cloud/local terrain catalogue routes (unchanged reads; see terrain/ and docs/CLOUD_TERRAIN.md).

These return point elevations and regional statistics. They are NOT a terrain
horizon and are not used by the visibility calculation.
"""
from fastapi import APIRouter, Query
from terrain.catalogue import catalogue_selection, grid_record, lookup
from terrain.grid_scheme import coordinates, identify, site04_id

from backend.errors import ApiError, api_errors

router=APIRouter(prefix='/api/terrain',tags=['terrain'])

@router.get('/catalogue')
def terrain_catalogue(lat:float=Query(...,ge=-90,le=90),lon:float=Query(...,ge=-180,le=180)):
    """Available regional summaries, independently of missing raster/scene files."""
    with api_errors():
        return catalogue_selection(lat,lon)

@router.get('/identity')
def terrain_identity(lat:float=Query(...,ge=-90,le=90),lon:float=Query(...,ge=-180,le=180)):
    """Indexing geometry remains available without claiming a sampled elevation."""
    with api_errors():
        latitude, longitude = coordinates(lat, lon)
        cell = identify(latitude, longitude)
        local = site04_id(latitude, longitude)
        return {**cell, 'latitude': latitude, 'longitude': longitude,
                'legacy_grid_id': local, 'blender_object_name': local or cell['grid_id'],
                'elevation_m': None, 'scene_available': False,
                'note': 'Grid identity only. Detailed Blender scenes are deferred; no measured height is supplied.'}

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
