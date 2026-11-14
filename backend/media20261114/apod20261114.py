"""2026-11-14: APOD normalization preserves image/video identity and credits."""
from datetime import date, datetime, timedelta, timezone
import os
from urllib.parse import urlparse
from fastapi import HTTPException, Query
from .gateway20261114 import nasa_json
from .routes20261114 import router


def https_url(value):
    return value if isinstance(value, str) and urlparse(value).scheme == 'https' else ''


def apod_entry(item):
    day = str(item.get('date', ''))
    kind = 'video' if item.get('media_type') == 'video' else 'image'
    asset = https_url(item.get('hdurl') or item.get('url'))
    preview = https_url(item.get('thumbnail_url') if kind == 'video' else item.get('url'))
    return {'id': 'apod:' + day, 'title': str(item.get('title', 'Astronomy picture')),
            'description': str(item.get('explanation', '')), 'previewUrl': preview,
            'assetUrl': asset, 'sourceUrl': 'https://apod.nasa.gov/apod/ap' + day.replace('-', '')[2:] + '.html',
            'credit': str(item.get('copyright', 'NASA / APOD')), 'day': day,
            'kind': kind, 'source': 'apod'}


@router.get('/apod')
def apod(end: date | None = None, days: int = Query(7, ge=1, le=7)):
    today = datetime.now(timezone.utc).date()
    last = end or today
    first = last - timedelta(days=days - 1)
    if last > today or first < date(1995, 6, 16):
        raise HTTPException(422, 'Choose dates between June 16, 1995 and today (UTC).')
    payload = nasa_json('https://api.nasa.gov/planetary/apod', {
        'api_key': os.environ.get('NASA_API_KEY', 'DEMO_KEY'),
        'start_date': first.isoformat(), 'end_date': last.isoformat(), 'thumbs': 'true'}, ttl=21600)
    if not isinstance(payload, list):
        raise HTTPException(502, 'NASA returned an unexpected APOD response.')
    items = [apod_entry(item) for item in payload if isinstance(item, dict)]
    items.sort(key=lambda item: item['day'], reverse=True)
    return {'items': items, 'total': len(items), 'nextPage': None}
