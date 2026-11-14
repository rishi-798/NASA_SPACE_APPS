from fastapi import APIRouter, HTTPException, Query
from terrain.catalogue import TerrainUnavailable, grid_record, lookup

router=APIRouter(prefix='/api/terrain',tags=['terrain'])

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
