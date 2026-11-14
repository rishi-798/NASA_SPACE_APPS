"""Install the terrain manifest while keeping elevation rasters in cloud storage."""

import json
import os
from pathlib import Path

import requests

from terrain.streaming import base_url


def main():
    dataset_url = base_url()
    if not dataset_url:
        raise ValueError('Set LUNAR_COG_BASE_URL to the published dataset resolve URL')

    response = requests.get(dataset_url + '/moon-dataset.json', timeout=30)
    response.raise_for_status()
    if len(response.content) > 2 * 1024 * 1024:
        raise ValueError('Unexpected manifest size')

    manifest = response.json()
    sources = manifest.get('sources')
    if not sources or any(not source.get('cloud_path', '').startswith('cogs/') for source in sources):
        raise ValueError('Manifest is not a verified COG release')

    dataset_directory = Path(os.environ.get('LUNAR_DATASET_DIR', 'data/lunar-cloud'))
    dataset_directory.mkdir(parents=True, exist_ok=True)
    manifest_path = dataset_directory / 'moon-dataset.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print('Small terrain manifest installed; raster bytes remain remote')


if __name__ == '__main__':
    main()
