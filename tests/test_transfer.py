import math
import numpy as np
import pytest
import spiceypy as spice
from fastapi.testclient import TestClient
from backend.app import app
from backend.calculations.lambert import TransferError, minimum_transfer_radius, solve_lambert
from backend.transfer_api import EARTH_MU, EARTH_RADIUS_KM
from backend.spice_kernels import SPICE_LOCK


def test_lambert_matches_analytic_circular_arc():
    radius, angle = 7000., math.pi/3
    duration = angle*math.sqrt(radius**3/EARTH_MU)
    r1 = np.array([radius, 0, 0]); r2 = radius*np.array([math.cos(angle), math.sin(angle), 0])
    v1, v2, _ = solve_lambert(r1, r2, duration, EARTH_MU)
    speed = math.sqrt(EARTH_MU/radius)
    np.testing.assert_allclose(v1, [0, speed, 0], atol=1e-8)
    np.testing.assert_allclose(v2, [-speed*math.sin(angle), speed*math.cos(angle), 0], atol=1e-8)


@pytest.mark.parametrize('seconds', [1200, 3600, 12000])
def test_lambert_independently_closes_with_spice_prop2b(seconds):
    r1 = np.array([5000., 10000., 2100.]); r2 = np.array([-14600., 2500., 7000.])
    v1, v2, _ = solve_lambert(r1, r2, seconds, EARTH_MU)
    with SPICE_LOCK:
        end = spice.prop2b(EARTH_MU, np.r_[r1,v1], seconds)
    np.testing.assert_allclose(end[:3], r2, atol=0.001)
    np.testing.assert_allclose(end[3:], v2, atol=1e-6)


def test_analytic_radius_detects_earth_crossing_between_endpoints():
    # Ellipse with periapsis 5000 km, sampled 90 degrees either side of periapsis.
    p, e = 7500., .5
    speed = math.sqrt(EARTH_MU/p)
    r1, r2 = np.array([0.,-p,0]), np.array([0.,p,0])
    v1, v2 = speed*np.array([1., e, 0]), speed*np.array([-1., e, 0])
    assert minimum_transfer_radius(r1,v1,r2,v2,EARTH_MU) == pytest.approx(5000)
    assert 5000 < EARTH_RADIUS_KM


@pytest.mark.parametrize('r2,seconds', [([7000,0,0],3600), ([-7000,0,0],3600), ([0,7000,0],0), ([0,float('nan'),0],3600)])
def test_singular_or_invalid_lambert_inputs_fail(r2, seconds):
    with pytest.raises(TransferError): solve_lambert([7000,0,0],r2,seconds,EARTH_MU)


BODY = {'departure_utc':'2026-11-15T12:00:00Z','arrival_utc':'2026-11-19T12:00:00Z','parking_altitude_km':200}


def test_real_date_targeted_transfer_and_conservation():
    response = TestClient(app).post('/api/transfer/calculate',json=BODY)
    assert response.status_code == 200, response.text
    data = response.json(); summary = data['summary']
    assert len(data['samples']) == 257
    assert data['arrival_target']['is_capture_or_landing'] is False
    assert data['arrival_target']['altitude_km'] == 1000
    arrival_range = np.linalg.norm(np.array(data['samples'][-1]['spacecraft_position_km'])-data['samples'][-1]['moon_position_km'])
    assert abs(arrival_range-data['constants']['moon_radius_km']-1000) < .01
    assert summary['endpoint_error_km'] < .01
    assert summary['max_relative_energy_drift'] < 1e-9
    assert summary['max_relative_angular_momentum_drift'] < 1e-9
    assert summary['minimum_earth_altitude_km'] >= 120
    assert 2 < summary['injection_delta_v_km_s'] < 5
    assert summary['moon_motion_degrees'] > 20
    assert summary['sampled_moon_clearance_km'] >= 100
    first, last = data['samples'][0], data['samples'][-1]
    assert np.linalg.norm(np.array(last['spacecraft_position_km'])-data['arrival_target']['position_km']) < .01
    assert np.linalg.norm(np.array(first['moon_position_km'])-last['moon_position_km']) > 100000
    assert response.headers['cache-control'] == 'no-store'


def test_different_dates_change_ephemeris_and_transfer():
    client = TestClient(app)
    a = client.post('/api/transfer/calculate',json=BODY).json()
    b = client.post('/api/transfer/calculate',json={**BODY,'departure_utc':'2026-11-22T12:00:00Z','arrival_utc':'2026-11-26T12:00:00Z'}).json()
    assert a['arrival_target']['position_km'] != b['arrival_target']['position_km']
    assert a['summary']['injection_delta_v_km_s'] != b['summary']['injection_delta_v_km_s']


@pytest.mark.parametrize('change', [
    {'arrival_utc':'2026-11-14T12:00:00Z'}, {'arrival_utc':'2026-11-15T13:00:00Z'},
    {'arrival_utc':'2027-01-01T00:00:00Z'}, {'departure_utc':'2026-11-15T12:00:00'},
    {'parking_altitude_km':159}, {'parking_altitude_km':2001},
    {'departure_utc':'2200-01-01T00:00:00Z','arrival_utc':'2200-01-05T00:00:00Z'},
])
def test_invalid_transfer_requests_fail_visibly(change):
    response = TestClient(app).post('/api/transfer/calculate',json={**BODY,**change})
    assert response.status_code == 422, response.text
    assert 'samples' not in response.json()


@pytest.mark.parametrize('hours', [24, 48, 72, 120, 240])
def test_supported_duration_extremes_are_calculated_or_explicitly_rejected(hours):
    from datetime import datetime, timedelta
    start = datetime.fromisoformat(BODY['departure_utc'].replace('Z','+00:00'))
    response = TestClient(app).post('/api/transfer/calculate',json={**BODY,'arrival_utc':(start+timedelta(hours=hours)).isoformat()})
    assert response.status_code in (200,422), response.text
    if response.status_code == 200:
        data = response.json()
        assert data['summary']['endpoint_error_km'] < .01
        assert data['summary']['minimum_earth_altitude_km'] >= 120
    else:
        assert 'samples' not in response.json()
        assert 'detail' in response.json()


def test_nonconvergence_has_no_decorative_path(monkeypatch):
    from backend import transfer_api
    transfer_api._calculate.cache_clear()
    def fail(*args, **kwargs):
        raise TransferError('No converged candidate')
    monkeypatch.setattr(transfer_api,'solve_lambert',fail)
    response = TestClient(app).post('/api/transfer/calculate',json=BODY)
    assert response.status_code == 422
    assert 'No admissible' in response.json()['detail']
    assert 'samples' not in response.json()


def test_earth_intersection_is_rejected_by_the_api(monkeypatch):
    from backend import transfer_api
    transfer_api._calculate.cache_clear()
    monkeypatch.setattr(transfer_api,'minimum_transfer_radius',lambda *args:EARTH_RADIUS_KM-10)
    response = TestClient(app).post('/api/transfer/calculate',json=BODY)
    assert response.status_code == 422
    assert 'samples' not in response.json()
