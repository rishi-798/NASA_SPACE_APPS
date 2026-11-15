"""Download the full original raster release, verify it and safely extract it.

Requires requests. Private repository access uses GITHUB_TOKEN or your existing
Git credential manager; credentials are never written into the dataset.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile
import requests

REPO = 'itsmetapasvi-glitch/NASA-APP'
TAG = 'moon-rasters-v1'

def token():
    if os.environ.get('GITHUB_TOKEN'):
        return os.environ['GITHUB_TOKEN']
    result = subprocess.run(['git', 'credential', 'fill'],
                            input='protocol=https\nhost=github.com\n\n',
                            text=True, capture_output=True, check=True)
    return dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)['password']

def validate_inventory(inventory):
    parts = inventory['parts']
    if not parts or sum(p['bytes'] for p in parts) != inventory['archive_bytes']:
        raise ValueError('Incomplete release inventory')
    for number, part in enumerate(parts, 1):
        if part['name'] != f'moon-rasters.zip.part{number:03d}':
            raise ValueError('Release parts are not in sequence')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset-dir', required=True, type=Path)
    args = parser.parse_args()
    root = args.dataset_dir.resolve()
    root.mkdir(parents=True, exist_ok=True)
    headers = {'Authorization': 'Bearer ' + token(), 'Accept': 'application/vnd.github+json',
               'X-GitHub-Api-Version': '2022-11-28'}
    session = requests.Session()
    response = session.get(f'https://api.github.com/repos/{REPO}/releases/tags/{TAG}', headers=headers, timeout=90)
    response.raise_for_status()
    release = response.json()
    if release['draft']:
        raise RuntimeError('Dataset is still uploading; wait for publication')
    assets = {a['name']: a for a in release['assets']}
    binary_headers = {**headers, 'Accept': 'application/octet-stream'}
    response = session.get(assets['raster-release-manifest.json']['url'], headers=binary_headers, timeout=90)
    response.raise_for_status()
    inventory = response.json()
    validate_inventory(inventory)
    archive = root / 'full-moon-rasters.zip'
    pending = root / 'full-moon-rasters.zip.partial'
    if archive.exists() or pending.exists():
        raise FileExistsError('Preserving existing archive/download. Choose another dataset directory or inspect it first.')
    if shutil.disk_usage(root).free < inventory['archive_bytes'] * 2 + 1024**3:
        raise RuntimeError('Allow about 111 GB free for the archive and extracted files')
    whole = hashlib.sha256()
    with pending.open('xb') as output:
        for part in inventory['parts']:
            asset = assets[part['name']]
            if asset['size'] != part['bytes'] or asset['state'] != 'uploaded':
                raise ValueError('Missing or incomplete release asset: ' + part['name'])
            digest = hashlib.sha256()
            size = 0
            with session.get(asset['url'], headers=binary_headers, stream=True, timeout=(30, 180)) as download:
                download.raise_for_status()
                for chunk in download.iter_content(4 * 1024 * 1024):
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > part['bytes']:
                        raise ValueError('Release asset exceeded its declared size')
                    digest.update(chunk)
                    whole.update(chunk)
                    output.write(chunk)
            if size != part['bytes'] or digest.hexdigest() != part['sha256']:
                raise ValueError('Checksum/size mismatch: ' + part['name'])
            print('Verified ' + part['name'], flush=True)
    if whole.hexdigest() != inventory['archive_sha256']:
        raise ValueError('Whole archive checksum mismatch')
    if archive.exists():
        raise FileExistsError('Preserving existing archive')
    pending.rename(archive)
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            destination = (root / member.filename).resolve()
            if not destination.is_relative_to(root):
                raise ValueError('Unsafe archive path')
            if destination.exists():
                raise FileExistsError('Preserving existing dataset file: ' + member.filename)
        for member in bundle.infolist():
            destination = root / member.filename
            if member.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(member) as source, destination.open('xb') as output:
                    shutil.copyfileobj(source, output)
    project = Path(__file__).resolve().parents[1]
    manifest = root / 'moon-dataset.json'
    if not manifest.exists():
        with (project / 'metadata/handoff-20261011/moon-dataset.json').open('rb') as source, manifest.open('xb') as output:
            shutil.copyfileobj(source, output)
    os.environ['LUNAR_DATASET_DIR'] = str(root)
    from terrain.catalogue import manifest as read_manifest, source_ready
    elevation = [s for s in read_manifest()['sources'] if s.get('role') == 'elevation']
    missing = [s['path'] for s in elevation if not source_ready(s)]
    if missing:
        raise RuntimeError('Required elevation files missing or wrong size: ' + ', '.join(missing))
    print(f'All {len(elevation)} elevation files verified. Original archive retained.')
    print('Add the catalogue/index from the existing team handoff to this directory, then set LUNAR_DATASET_DIR to it.')

if __name__ == '__main__':
    # Permit running the script directly from any directory.
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    main()
