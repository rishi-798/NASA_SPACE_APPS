"""Bounded remote terrain reads; originals and lunar coordinate conventions stay intact."""
import json
import os
from pathlib import Path
from functools import lru_cache
from urllib.parse import urlparse
import requests
import rasterio
from rasterio.windows import Window


def base_url():
    value = os.environ.get('LUNAR_COG_BASE_URL', '').rstrip('/')
    release_file = os.environ.get('LUNAR_COG_RELEASE_FILE')
    if release_file:
        release = json.loads(Path(release_file).read_text(encoding='utf-8'))
        value = release['base_url'].rstrip('/')
    if value and (urlparse(value).scheme != 'https' or urlparse(value).hostname != 'huggingface.co'):
        raise ValueError('LUNAR_COG_BASE_URL must be an HTTPS Hugging Face dataset resolve URL')
    return value


def raster_path(source, root):
    cloud = source.get('cloud_path')
    if cloud:
        local = root / cloud
        if local.is_file():
            return str(local)
        if base_url():
            return base_url() + '/' + cloud
    return str(root / source['path'])


def ready(source, root):
    return bool(source.get('cloud_path') and ((root / source['cloud_path']).is_file() or base_url()))


def read_pixel(source, root, row, col):
    with rasterio.Env(GDAL_CACHEMAX=32, CPL_VSIL_CURL_CACHE_SIZE=8 * 1024 * 1024,
                      GDAL_HTTP_TIMEOUT='20', GDAL_HTTP_MAX_RETRY='2',
                      GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', VSI_CACHE=False):
        with rasterio.open(raster_path(source, root)) as image:
            return image.read(1, window=Window(col, row, 1, 1), masked=True)[0, 0]


@lru_cache(maxsize=8)
def index_shard(name):
    # Only internal, validated grid names choose a fixed shard; no caller URL input.
    if not base_url():
        return None
    response = requests.get(base_url() + '/index/' + name + '.json', timeout=25)
    response.raise_for_status()
    if len(response.content) > 8 * 1024 * 1024:
        raise ValueError('Terrain index shard exceeds its size limit')
    return json.loads(response.content)
