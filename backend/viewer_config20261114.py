"""Browser-safe viewer configuration, supplied at runtime rather than baked in."""
import os

from fastapi import APIRouter, Response

router = APIRouter()


@router.get('/api/viewer-config')
def viewer_config(response: Response):
    # This variable must contain only an assets:read browser token, never an
    # account-management token. Other environment variables are not exposed.
    response.headers['Cache-Control'] = 'no-store'
    return {
        'moonAssetId': 2684829,
        'cesiumIonAccessToken': os.environ.get('CESIUM_PUBLIC_ION_TOKEN', '').strip() or None,
    }
