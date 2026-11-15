"""2026-11-14: curated NASA image/video library search; no user-supplied URLs."""
from typing import Literal
from urllib.parse import quote
from fastapi import HTTPException, Query
from .apod20261114 import https_url, plain
from .gateway20261114 import nasa_json
from .routes20261114 import router


@router.get('/library')
def library(q: str = Query(..., min_length=2, max_length=100),
            kind: Literal['image', 'video'] = 'image', page: int = Query(1, ge=1, le=1000)):
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(422, 'Enter at least two search characters.')
    payload = nasa_json('https://images-api.nasa.gov/search', {
        'q': query, 'media_type': kind, 'page': page, 'page_size': 24})
    collection = payload.get('collection') if isinstance(payload, dict) else None
    if not isinstance(collection, dict) or not isinstance(collection.get('items'), list):
        raise HTTPException(502, 'NASA returned an unexpected image-library response.')
    items = []
    for item in collection['items']:
        metadata = item.get('data', [{}])[0] if item.get('data') else {}
        nasa_id = str(metadata.get('nasa_id', ''))
        if not nasa_id:
            continue
        preview = next((https_url(link.get('href')) for link in item.get('links', [])
                        if link.get('render') == 'image' and https_url(link.get('href'))), '')
        source = 'https://images.nasa.gov/details/' + quote(nasa_id, safe='')
        items.append({'id': 'library:' + nasa_id, 'title': plain(metadata.get('title', nasa_id)),
            'description': plain(metadata.get('description', '')), 'previewUrl': preview,
            'assetUrl': preview if kind == 'image' and preview else source, 'sourceUrl': source,
            'credit': plain(metadata.get('photographer') or metadata.get('secondary_creator') or metadata.get('center') or 'NASA'),
            'day': str(metadata.get('date_created', ''))[:10], 'kind': kind, 'source': 'library'})
    has_next = any(link.get('rel') == 'next' for link in collection.get('links', []))
    return {'items': items, 'total': collection.get('metadata', {}).get('total_hits', len(items)),
            'nextPage': page + 1 if has_next else None, 'note': 'NASA Image and Video Library; source links include usage information.'}
