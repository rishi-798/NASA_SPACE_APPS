"""Provider responses are mocked; no credentials or quota are required in CI."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
import pytest
import requests

from backend.app import app
from backend.weather import meteomatics as weather

START = datetime(2026, 11, 14, 22, tzinfo=timezone.utc)
SITE = weather.SITES['kennedy-39a']
URL = '/api/weather/launch-sites/kennedy-39a'


class Clock(datetime):
    @classmethod
    def now(cls, tz=None):
        return START


def payload():
    return {'status': 'OK', 'user': 'DO-NOT-EXPOSE-ACCOUNT', 'dateGenerated': '2026-11-14T21:45:00Z', 'data': [
        {'parameter': parameter, 'coordinates': [{'lat': SITE['latitude'], 'lon': SITE['longitude'],
            'dates': [{'date': weather._iso(START + timedelta(hours=i)), 'value': value} for i in range(25)]}]}
        for parameter, value in [('t_2m:C', 22.5), ('wind_speed_10m:ms', 4.2), ('precip_1h:mm', 0.0)]
    ]}


@pytest.fixture(autouse=True)
def isolate(monkeypatch):
    weather._cache.clear()
    monkeypatch.setattr(weather, 'datetime', Clock)
    monkeypatch.setenv('METEOMATICS_USERNAME', 'TEST-USERNAME')
    monkeypatch.setenv('METEOMATICS_PASSWORD', 'TEST-PASSWORD')
    yield
    weather._cache.clear()


@pytest.fixture
def upstream(monkeypatch):
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = payload()
    response.__enter__.return_value = response
    get = MagicMock(return_value=response)
    monkeypatch.setattr(weather.requests, 'get', get)
    return get, response


def test_weather_request_contract_and_no_account_leak(upstream):
    get, _ = upstream
    response = TestClient(app).get(URL)
    assert response.status_code == 200
    result = response.json()
    assert len(result['samples']) == 25
    assert result['samples'][0]['temperature_c'] == 22.5
    assert result['samples'][0]['precipitation_mm'] == 0
    assert result['provider'] == 'Meteomatics'
    assert result['partial'] is False
    assert result['start'] == '2026-11-14T22:00:00Z'
    assert result['end'] == '2026-11-15T22:00:00Z'
    assert 'TEST-' not in response.text and 'DO-NOT-EXPOSE' not in response.text
    url = get.call_args.args[0]
    assert url.startswith('https://api.meteomatics.com/2026-11-14T22:00:00Z--2026-11-15T22:00:00Z:PT1H/')
    assert '/28.61,-80.6/json' in url
    assert get.call_args.kwargs == {'auth': ('TEST-USERNAME', 'TEST-PASSWORD'), 'timeout': (3, 12), 'allow_redirects': False}
    assert response.headers['cache-control'] == 'no-store'


def test_unknown_site_and_unconfigured_access_never_call_provider(monkeypatch, upstream):
    get, _ = upstream
    client = TestClient(app)
    assert client.get('/api/weather/launch-sites/not-a-pad').status_code == 404
    monkeypatch.delenv('METEOMATICS_PASSWORD')
    assert client.get(URL).status_code == 503
    get.assert_not_called()


def test_hourly_cache_single_flight_and_credential_rotation(monkeypatch, upstream):
    get, _ = upstream
    with ThreadPoolExecutor(max_workers=4) as pool:
        codes = list(pool.map(lambda _: TestClient(app).get(URL).status_code, range(4)))
    assert codes == [200] * 4
    assert get.call_count == 1
    monkeypatch.setenv('METEOMATICS_PASSWORD', 'ROTATED-TEST-PASSWORD')
    assert TestClient(app).get(URL).status_code == 200
    assert get.call_count == 2


@pytest.mark.parametrize(('provider_code', 'expected'), [(401, 503), (403, 503), (429, 429), (500, 502), (302, 502)])
def test_provider_failures_are_sanitised_and_cooled_down(upstream, provider_code, expected):
    get, response = upstream
    response.status_code = provider_code
    response.text = 'TEST-PASSWORD provider details'
    client = TestClient(app)
    for _ in range(2):
        result = client.get(URL)
        assert result.status_code == expected
        assert 'TEST-' not in result.text
    assert get.call_count == 1


def test_timeout_is_sanitised(upstream):
    get, _ = upstream
    get.side_effect = requests.Timeout('TEST-PASSWORD')
    result = TestClient(app).get(URL)
    assert result.status_code == 504
    assert 'TEST-' not in result.text


@pytest.mark.parametrize('bad', [None, {'status': 'ERROR'}, {'status': 'OK', 'data': []}])
def test_malformed_response_is_not_success(upstream, bad):
    _, response = upstream
    response.json.return_value = bad
    assert TestClient(app).get(URL).status_code == 502


def test_reserved_and_missing_values_are_null_not_zero(upstream):
    _, response = upstream
    body = payload()
    body['data'][0]['coordinates'][0]['dates'][0]['value'] = -999
    body['data'][1]['coordinates'][0]['dates'][1]['value'] = float('nan')
    body['data'][2]['coordinates'][0]['dates'].pop()
    response.json.return_value = body
    result = TestClient(app).get(URL).json()
    assert result['partial'] is True
    assert result['samples'][0]['temperature_c'] is None
    assert result['samples'][1]['wind_speed_ms'] is None
    assert result['samples'][-1]['precipitation_mm'] is None
    assert result['samples'][0]['precipitation_mm'] == 0


@pytest.mark.parametrize('change', ['coordinates', 'timestamp', 'invalid_timestamp', 'duplicate'])
def test_mismatched_data_is_rejected(upstream, change):
    _, response = upstream
    body = payload()
    if change == 'coordinates': body['data'][0]['coordinates'][0]['lat'] = 0
    if change == 'timestamp': body['data'][0]['coordinates'][0]['dates'][0]['date'] = '2026-01-01T00:00:00Z'
    if change == 'invalid_timestamp': body['data'][0]['coordinates'][0]['dates'][0]['date'] = None
    if change == 'duplicate': body['data'].append(body['data'][0])
    response.json.return_value = body
    assert TestClient(app).get(URL).status_code == 502


def test_optional_cloud_cover_and_bounded_values(upstream):
    _, response = upstream
    content = payload()
    content['data'].append({'parameter': 'total_cloud_cover:p', 'coordinates': [{
        'lat': SITE['latitude'], 'lon': SITE['longitude'],
        'dates': [{'date': weather._iso(START + timedelta(hours=i)), 'value': 35 if i else 101} for i in range(25)]}]})
    response.json.return_value = content
    result = TestClient(app).get(URL + '?include_cloud=true').json()
    assert result['samples'][0]['cloud_cover_pct'] is None
    assert result['samples'][1]['cloud_cover_pct'] == 35
    assert result['partial'] is True


def test_cloud_subscription_denial_falls_back_to_core_forecast(upstream):
    get, response = upstream
    denied = MagicMock()
    denied.status_code = 403
    denied.__enter__.return_value = denied
    get.side_effect = [denied, response]
    result = TestClient(app).get(URL + '?include_cloud=true')
    assert result.status_code == 200
    assert result.json()['samples'][0]['cloud_cover_pct'] is None
    assert get.call_count == 2
    assert 'total_cloud_cover:p' in get.call_args_list[0].args[0]
    assert 'total_cloud_cover:p' not in get.call_args_list[1].args[0]


def test_alternating_parameter_sets_do_not_bypass_hourly_cache(upstream):
    get, _ = upstream
    client = TestClient(app)
    for _ in range(3):
        assert client.get(URL).status_code == 200
        assert client.get(URL + '?include_cloud=true').status_code == 200
    assert get.call_count == 2
