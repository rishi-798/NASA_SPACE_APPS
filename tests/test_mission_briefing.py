from unittest.mock import MagicMock

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from backend.app import app
from backend import mission_briefing as briefing


@pytest.fixture
def bundle(monkeypatch):
    data = {
        'site': {'name': 'Athena <test>', 'latitude': -85.4, 'longitude': 30.5},
        'request': {'start': '2025-03-06T12:00:00Z', 'end': '2025-03-07T12:00:00Z', 'step_minutes': 30},
        'summary': {'sunlight_percent': 50, 'earth_visible_percent': 100, 'longest_darkness_minutes': 720, 'longest_comm_blackout_minutes': 0},
        'samples': [{'time': f'2025-03-0{day}T12:00:00Z', 'sun': {'visible': day == 6}, 'earth': {'visible': True}} for day in (6, 7)],
        'terrain': {'message': 'Measured terrain <audit>'},
        'horizon': {'horizon': [2.0] * 720, 'azimuth_step': .5, 'observer_height_m': 2},
        'warnings': ['Example <warning>'],
        'provenance': {'engine': 'SPICE', 'frame': 'MOON_ME', 'limitations': ['Sampling <limit>'], 'terrain_source': {'source': 'LOLA'},
            'kernel_details': {'files': [{'filename': 'de440s.bsp', 'role': 'DE440 ephemeris', 'sha256': 'a' * 64, 'integrity': 'verified against manifest', 'present': True}]}},
    }
    mock = MagicMock(return_value=data)
    monkeypatch.setattr(briefing, 'build_analysis', mock)
    return data, mock


BODY = {'lat': -85.4, 'lon': 30.5, 'start': '2025-03-06T12:00:00Z', 'mission_name': '<script>alert(1)</script>'}


def test_printable_briefing_has_real_charts_audit_and_escaped_labels(bundle):
    response = TestClient(app).post('/api/mission/briefing/html', json=BODY)
    assert response.status_code == 200
    html = response.text
    assert '<script>' not in html and '&lt;script&gt;' in html
    for expected in ['720 bins', 'SHA-256', 'a' * 64, 'MOON_ME', 'DE440', 'Earth blackout', 'Not supplied', 'not a flight readiness certification']:
        assert expected in html
    assert html.count('<svg') == 2
    assert response.headers['cache-control'] == 'no-store'
    assert bundle[1].call_args.kwargs['end'] == '2025-03-07T12:00:00+00:00'


def test_missing_terrain_and_weather_stay_explicit(bundle, monkeypatch):
    bundle[0]['horizon'] = None
    def unavailable(*args, **kwargs):
        raise HTTPException(503, 'Launch-site weather is not connected yet.')
    monkeypatch.setattr(briefing, 'launch_weather', unavailable)
    response = TestClient(app).post('/api/mission/briefing/html', json={**BODY, 'launch_site_id': 'kennedy-39a', 'launch_vehicle': 'SLS'})
    assert response.status_code == 200
    assert 'No measured horizon' in response.text
    assert 'Weather unavailable' in response.text
    assert 'SLS' in response.text and 'Kennedy' in response.text


@pytest.mark.parametrize('change', [{'lat': 91}, {'lon': None}, {'start': '2025-03-06T12:00:00'}, {'launch_site_id': 'unknown'}, {'liftoff_utc': '2025-03-06T12:00:00'}, {'mission_name': 'x' * 161}])
def test_invalid_briefing_requests_do_not_compute(bundle, change):
    assert TestClient(app).post('/api/mission/briefing/html', json={**BODY, **change}).status_code == 422
    bundle[1].assert_not_called()


def test_weather_prints_forecast_nearest_liftoff_with_cloud(bundle, monkeypatch):
    monkeypatch.setattr(briefing, 'launch_weather', lambda *args, **kwargs: {
        'start': '2025-03-06T00:00:00Z', 'end': '2025-03-07T00:00:00Z', 'fetched_at': '2025-03-06T11:00:00Z',
        'samples': [{'time': '2025-03-06T12:00:00Z', 'temperature_c': 22, 'wind_speed_ms': 4.2, 'cloud_cover_pct': 35}]})
    client = TestClient(app)
    request = {**BODY, 'launch_site_id': 'kennedy-39a', 'liftoff_utc': '2025-03-06T14:00:00+02:00'}
    response = client.post('/api/mission/briefing/html', json=request)
    assert '4.2 m/s' in response.text and '35 %' in response.text and '22 °C' in response.text
    response = client.post('/api/mission/briefing/html', json={**request, 'liftoff_utc': '2025-04-06T12:00:00Z'})
    assert 'No forecast for the requested liftoff epoch' in response.text
    assert '4.2 m/s' not in response.text


def test_named_site_reuses_saved_horizon_only_for_matching_coordinates(bundle):
    body = {**BODY, 'site_id': 'athena-im2', 'lat': -84.79, 'lon': 29.2}
    client = TestClient(app)
    assert client.post('/api/mission/briefing/html', json=body).status_code == 200
    assert bundle[1].call_args.kwargs['site_id'] == 'athena-im2'
    assert bundle[1].call_args.kwargs['lat'] is None
    assert client.post('/api/mission/briefing/html', json={**body, 'lat': -85}).status_code == 200
    assert bundle[1].call_args.kwargs['site_id'] is None
    assert bundle[1].call_args.kwargs['lat'] == -85
    assert client.post('/api/mission/briefing/html', json={**body, 'site_id': 'apollo-12'}).status_code == 200
    assert bundle[1].call_args.kwargs['site_id'] is None


def test_custom_analysis_range_and_cadence_are_preserved(bundle):
    response = TestClient(app).post('/api/mission/briefing/html', json={**BODY, 'end': '2025-03-09T12:00:00Z', 'step_minutes': 60})
    assert response.status_code == 200
    assert bundle[1].call_args.kwargs['end'] == '2025-03-09T12:00:00+00:00'
    assert bundle[1].call_args.kwargs['step_minutes'] == 60
