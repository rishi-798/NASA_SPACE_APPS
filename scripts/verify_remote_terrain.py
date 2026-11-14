"""Compare public COG range samples with the owner's original scientific rasters."""
import argparse
import json
import os
from pathlib import Path
from unittest.mock import patch
import requests
from terrain import catalogue, streaming

SITES = {
    'SITE04-5M': (-89.9, 180),
    'NAC_DTM_APOLLO11': (0.67416, 23.47314),
    'NAC_DTM_APOLLO14': (-3.64589, -17.47194),
    'NAC_DTM_APOLLO15': (26.13222, 3.63386),
    'LUNOKHOD1-NATIVE-CROP': (38.315, -35.0081),
    'NAC_DTM_LUNOKHOD2_2': (25.8307, 30.9221),
}

def point(source):
    if source['id'] in SITES:
        return SITES[source['id']]
    if source['format'] == 'sldem-float32':
        return ((source['south'] + source['north']) / 2,
                ((source['west'] + source['east']) / 2 + 180) % 360 - 180)
    if source['format'] == 'polar-float32':
        return (85 if source['pole'] == 'n' else -85, 0)
    return (0, 0)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--folder', type=Path, required=True)
    parser.add_argument('--base-url', required=True)
    args = parser.parse_args()
    os.environ['LUNAR_COG_BASE_URL'] = args.base_url
    base = streaming.base_url()
    original = json.loads((args.source_root / 'moon-dataset.json').read_text())
    converted = json.loads((args.folder / 'moon-dataset.json').read_text())
    sources = {s['id']: s for s in original['sources']}
    # This empty root ensures the backend cannot silently read local COGs.
    remote_root = args.folder / 'remote-only-verification'
    checks = []
    for source in converted['sources']:
        with requests.get(base + '/' + source['cloud_path'],
                          headers={'Range': 'bytes=0-16383'}, stream=True, timeout=30) as response:
            response.raise_for_status()
            if response.status_code != 206 or not response.headers.get('Content-Range', '').startswith('bytes 0-'):
                raise AssertionError('Public host did not honour range request: ' + source['id'])
            header_bytes = response.raw.read(16385)
            if len(header_bytes) > 16384:
                raise AssertionError('Range response exceeded requested bytes')
        lat, lon = point(source)
        with patch.object(catalogue, 'dataset_root', return_value=args.source_root):
            expected = catalogue.sample_source(sources[source['id']], lat, lon)
        with patch.object(catalogue, 'dataset_root', return_value=remote_root):
            actual = catalogue.sample_source(source, lat, lon)
        if actual is None or actual != expected:
            raise AssertionError((source['id'], expected, actual))
        checks.append({'source': source['id'], 'latitude': lat, 'longitude': lon,
                       'matches_original': True, 'elevation_m': actual['elevation_m'],
                       'http_range_status': 206})
        print('Public range and original elevation match: ' + source['id'], flush=True)
    report = {'base_url': base, 'checks': checks, 'transport': 'public HTTPS; local raster fallback excluded'}
    (args.folder / 'remote-verification.json').write_text(json.dumps(report, indent=2) + '\n')

if __name__ == '__main__':
    main()
