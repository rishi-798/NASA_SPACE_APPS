"""2026-11-14: preserve NASA IDs, decode text and validate search filters."""
from fastapi.testclient import TestClient
from backend.app import app
from backend.media20261114 import library20261114 as library


def test_search_preserves_source_identity_and_pagination(monkeypatch):
    def reply(url, parameters):
        assert parameters['q'] == 'Apollo 12' and parameters['page_size'] == 24
        return {'collection': {'items': [{'data': [{'nasa_id': 'AS12-1', 'title': 'Moon &amp; Earth',
            'description': '<b>Measured</b> view', 'date_created': '1969-11-19T00:00:00Z'}],
            'links': [{'render': 'image', 'href': 'https://images-assets.nasa.gov/image.jpg'}]}],
            'metadata': {'total_hits': 40}, 'links': [{'rel': 'next'}]}}
    monkeypatch.setattr(library, 'nasa_json', reply)
    client = TestClient(app)
    data = client.get('/api/discover/library?q=Apollo%2012').json()
    assert data['nextPage'] == 2 and data['total'] == 40
    assert data['items'][0]['title'] == 'Moon & Earth'
    assert data['items'][0]['description'] == 'Measured view'
    assert data['items'][0]['sourceUrl'].endswith('/AS12-1')
    assert client.get('/api/discover/library?q=%20%20').status_code == 422
    assert client.get('/api/discover/library?q=moon&kind=invalid').status_code == 422
