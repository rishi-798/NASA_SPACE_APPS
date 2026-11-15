"""2026-11-14 — cache, endpoint allow-list and credential-safe failures."""
import pytest
import requests
from fastapi import HTTPException
from backend.media20261114 import gateway20261114 as gateway


def test_upstream_credentials_are_not_exposed(monkeypatch):
    gateway._read.cache_clear()
    def failure(*args, **kwargs):
        raise requests.RequestException('api_key=private-value')
    monkeypatch.setattr(gateway.requests, 'get', failure)
    with pytest.raises(HTTPException) as caught:
        gateway.nasa_json('https://api.nasa.gov/planetary/apod', {'api_key': 'private-value'})
    assert caught.value.status_code == 502
    assert 'private-value' not in caught.value.detail
    with pytest.raises(ValueError):
        gateway.nasa_json('https://untrusted.test', {})


def test_successful_requests_share_a_bounded_cache(monkeypatch):
    gateway._read.cache_clear()
    calls = []
    class Reply:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {'title': 'Moon'}
    def reply(*args, **kwargs):
        calls.append(1)
        return Reply()
    monkeypatch.setattr(gateway.requests, 'get', reply)
    for _ in range(2):
        assert gateway.nasa_json('https://images-api.nasa.gov/search', {'q': 'moon'})['title'] == 'Moon'
    assert len(calls) == 1
    gateway._read.cache_clear()
