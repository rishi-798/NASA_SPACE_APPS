"""NASA discovery endpoints, started 2026-11-14."""
from fastapi import APIRouter

router = APIRouter(prefix='/api/discover', tags=['NASA discovery'])


@router.get('/status')
def status():
    return {'ok': True, 'storage': 'browser-local', 'credentials': 'server-side'}
