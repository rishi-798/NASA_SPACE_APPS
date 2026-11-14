from fastapi import APIRouter, HTTPException, Query
from terrain.catalogue import TerrainUnavailable, catalogue_selection, grid_record, lookup
from terrain.grid_scheme import coordinates, identify, site04_id

router=APIRouter(prefix='/api/terrain',tags=['terrain'])

@router.get('/catalogue')
def terrain_catalogue(lat:float=Query(...,ge=-90,le=90),lon:float=Query(...,ge=-180,le=180)):
    """Available regional summaries, independently of missing raster/scene files."""
    try:
        return catalogue_selection(lat,lon)
    except TerrainUnavailable as exc:
        raise HTTPException(503,detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422,detail=str(exc)) from exc

@router.get('/identity')
def terrain_identity(lat:float=Query(...,ge=-90,le=90),lon:float=Query(...,ge=-180,le=180)):
    """Indexing geometry remains available without claiming a sampled elevation."""
    try:
        latitude, longitude = coordinates(lat, lon)
        cell = identify(latitude, longitude)
        local = site04_id(latitude, longitude)
        return {**cell, 'latitude': latitude, 'longitude': longitude,
                'legacy_grid_id': local, 'blender_object_name': local or cell['grid_id'],
                'elevation_m': None, 'scene_available': False,
                'note': 'Grid identity only. Detailed Blender scenes are deferred; no measured height is supplied.'}
    except ValueError as exc:
        raise HTTPException(422,detail=str(exc)) from exc

@router.get('/lookup')
def terrain_lookup(lat:float=Query(...,ge=-90,le=90),lon:float=Query(...,ge=-180,le=180)):
    try:
        return lookup(lat,lon)
    except TerrainUnavailable as exc:
        raise HTTPException(503,detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422,detail=str(exc)) from exc

@router.get('/grids/{grid_id}')
def terrain_grid(grid_id:str):
    try:
        return grid_record(grid_id)
    except TerrainUnavailable as exc:
        raise HTTPException(503,detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(404,detail=str(exc)) from exc
