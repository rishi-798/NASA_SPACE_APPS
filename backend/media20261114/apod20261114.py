"""2026-11-14: APOD normalization preserves image/video identity and credits."""
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urlparse
from fastapi import HTTPException, Query
from .gateway20261114 import nasa_json
from .routes20261114 import router


def https_url(value):
    return value if isinstance(value, str) and urlparse(value).scheme == 'https' else ''


class TextAndMedia(HTMLParser):
    def __init__(self, value):
        super().__init__()
        self.text = []
        self.media = ''
        self.feed(str(value))

    def handle_data(self, data):
        self.text.append(data)

    def handle_starttag(self, tag, attrs):
        if tag in ('br', 'p'):
            self.text.append('\n')
        if tag in ('iframe', 'video'):
            self.media = https_url(dict(attrs).get('src')) or self.media


def plain(value):
    return ''.join(TextAndMedia(value).text).strip()


def apod_entry(item):
    day = str(item.get('date', ''))
    kind = 'video' if item.get('media_type') in ('video', 'iframe') else 'image'
    source = https_url(item.get('permalink') or item.get('url')) or 'https://science.nasa.gov/apod/'
    image = https_url(item.get('hdurl'))
    asset = (TextAndMedia(item.get('basic_html', '')).media or source) if kind == 'video' else image
    return {'id': 'apod:' + day, 'title': plain(item.get('title', 'Astronomy picture')),
            'description': plain(item.get('explanation', '')), 'previewUrl': image,
            'assetUrl': asset or source, 'sourceUrl': source,
            'credit': plain(item.get('credit') or item.get('copyright') or 'NASA / APOD'), 'day': day,
            'kind': kind, 'source': 'apod'}


@router.get('/apod')
def apod(end: date | None = None, days: int = Query(7, ge=1, le=7)):
    today = datetime.now(timezone.utc).date()
    last = end or today
    first = last - timedelta(days=days - 1)
    if last > today or first < date(1995, 6, 16):
        raise HTTPException(422, 'Choose dates between June 16, 1995 and today (UTC).')
    payload = nasa_json('https://science.nasa.gov/wp-json/wp/v2/apod-basic', {
        'date_from': first.strftime('%y%m%d'), 'date_to': last.strftime('%y%m%d'),
        'per_page': days}, ttl=21600)
    if not isinstance(payload, list):
        raise HTTPException(502, 'NASA returned an unexpected APOD response.')
    items = [apod_entry(item) for item in payload if isinstance(item, dict)]
    items.sort(key=lambda item: item['day'], reverse=True)
    return {'items': items, 'total': len(items), 'nextPage': None}
