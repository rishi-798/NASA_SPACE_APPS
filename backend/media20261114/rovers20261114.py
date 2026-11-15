"""2026-11-14: NASA's live raw-image feed, filtered by real instrument metadata."""
from typing import Literal
from urllib.parse import urlparse
from fastapi import HTTPException, Query
from .apod20261114 import https_url, plain
from .gateway20261114 import nasa_json
from .routes20261114 import router


def image_url(value):
    if isinstance(value, str) and value.startswith('http:') and urlparse(value).hostname in ('mars.nasa.gov', 'mars.jpl.nasa.gov'):
        value = 'https:' + value[5:]
    return https_url(value)


@router.get('/rovers')
def rovers(rover: Literal['curiosity', 'perseverance'] = 'curiosity',
           sol: int = Query(1000, ge=0, le=100000),
           camera: str = Query('', max_length=40, pattern='^[A-Z0-9_]*$'),
           page: int = Query(1, ge=1, le=1000)):
    payload = nasa_json('https://mars.nasa.gov/rss/api/', {
        'feed': 'raw_images', 'feedtype': 'json', 'category': 'msl' if rover == 'curiosity' else 'mars2020',
        'sol': sol}, ttl=21600)
    if not isinstance(payload, dict) or not isinstance(payload.get('images'), list):
        raise HTTPException(502, 'NASA returned an unexpected rover response.')
    records = [x for x in payload['images'] if isinstance(x, dict) and x.get('sol') == sol]
    instruments = sorted({x.get('camera', {}).get('instrument', '') for x in records} - {''})
    selected = [x for x in records if not camera or x.get('camera', {}).get('instrument') == camera]
    items = []
    for item in selected[(page - 1) * 24:page * 24]:
        files = item.get('image_files', {})
        asset = image_url(files.get('full_res') or files.get('large') or files.get('medium'))
        if not asset:
            continue
        items.append({'id': 'rover:' + rover + ':' + str(item.get('imageid', '')),
            'title': plain(item.get('title', f'{rover.title()} / Sol {sol}')),
            'description': plain(item.get('caption', '')), 'previewUrl': image_url(files.get('medium')) or asset,
            'assetUrl': asset, 'sourceUrl': image_url(item.get('link')) or 'https://science.nasa.gov/mars/',
            'credit': plain(item.get('credit', 'NASA/JPL-Caltech')), 'day': str(item.get('date_taken_utc', ''))[:10],
            'kind': 'image', 'source': 'rover'})
    return {'items': items, 'total': len(selected), 'nextPage': page + 1 if page * 24 < len(selected) else None,
            'cameras': instruments, 'note': 'NASA raw imagery. Sol is a Martian day; instrument filters use source metadata.'}
