"""Preliminary date-targeted Earth two-body transfer, not a launch or landing solver."""
from copy import deepcopy
from datetime import datetime, timezone
from functools import lru_cache
import math

import numpy as np
import spiceypy as spice
from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from backend.calculations.lambert import TransferError, minimum_transfer_radius, solve_lambert
from backend.calculations.time_scales import utc_to_et
from backend.errors import api_errors
from backend.spice_kernels import SPICE_LOCK, coverage, kernel_fingerprint, kernel_provenance

router = APIRouter(prefix='/api/transfer', tags=['preliminary transfer'])
# JPL DE440 astrodynamic parameters; spherical Earth exclusion uses equatorial radius.
EARTH_MU = 398600.435507
EARTH_RADIUS_KM = 6378.1363
MOON_RADIUS_KM = 1737.4
ARRIVAL_ALTITUDE_KM = 10000.0
SAMPLE_COUNT = 257
LIMITATIONS = [
    'Earth-centered two-body approximation: lunar and Solar perturbing gravity are omitted.',
    'Arrival is an Earth-facing reference point 10,000 km above the mean lunar radius, not capture, orbit insertion or landing.',
    'Circular parking orbit lies in the Moon orbital plane at arrival. Its departure phase is freely selected from a finite candidate set; launch-site accessibility and ascent are not solved.',
    'Injection is an instantaneous vector burn from that assumed circular orbit. Finite burns, fuel, staging and selected vehicle capability are not assessed.',
    'A converged numerical solution and small endpoint error do not establish real-world mission feasibility or physical prediction accuracy.',
    'Lunar surface destination and its visibility analysis are separate from this arrival reference point. Transfer dates are not a launch-window recommendation.',
    'The displayed polyline and scrubbed states sample the propagated orbit; no decorative curve is substituted on failure.',
]


class TransferRequest(BaseModel):
    departure_utc: datetime
    arrival_utc: datetime
    parking_altitude_km: float = Field(200, ge=160, le=2000, allow_inf_nan=False)


def _iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def validate_dates(request):
    if request.departure_utc.tzinfo is None or request.arrival_utc.tzinfo is None:
        raise TransferError('Departure and arrival must include UTC or an explicit timezone offset.')
    hours = (request.arrival_utc-request.departure_utc).total_seconds()/3600
    if not 24 <= hours <= 240:
        raise TransferError('Choose arrival 24–240 hours after transfer departure.')
    low, high = coverage()
    if request.departure_utc < low or request.arrival_utc > high:
        raise TransferError(f'Dates must lie within SPICE coverage: {_iso(low)} to {_iso(high)}.')


def segment_minimum_norm(a, b):
    delta = b-a
    denominator = float(np.dot(delta, delta))
    fraction = float(np.clip(-np.dot(a, delta)/denominator, 0, 1)) if denominator else 0
    return float(np.linalg.norm(a+fraction*delta))


@lru_cache(maxsize=16)
def _calculate(departure, arrival, altitude, fingerprint):
    del fingerprint  # Included in cache identity so replaced kernels cannot reuse old results.
    dep, arr = datetime.fromisoformat(departure.replace('Z', '+00:00')), datetime.fromisoformat(arrival.replace('Z', '+00:00'))
    with SPICE_LOCK:
        et0, et1 = utc_to_et(dep), utc_to_et(arr)
        seconds = et1-et0  # TDB seconds, not naive subtraction across leap seconds.
        start_moon = np.asarray(spice.spkezr('MOON', et0, 'J2000', 'NONE', 'EARTH')[0])
        end_moon = np.asarray(spice.spkezr('MOON', et1, 'J2000', 'NONE', 'EARTH')[0])
        offsets = np.linspace(0, seconds, SAMPLE_COUNT)
        moon_states = [np.asarray(spice.spkezr('MOON', et0+t, 'J2000', 'NONE', 'EARTH')[0]) for t in offsets]
    direction = end_moon[:3]/np.linalg.norm(end_moon[:3])
    normal = np.cross(end_moon[:3], end_moon[3:])
    normal /= np.linalg.norm(normal)
    tangent = np.cross(normal, direction)
    target = end_moon[:3]-direction*(MOON_RADIUS_KM+ARRIVAL_ALTITUDE_KM)
    radius = EARTH_RADIUS_KM+altitude
    candidates = []
    for angle in range(100, 176, 5):
        theta = math.radians(angle)
        r1 = radius*(math.cos(theta)*direction-math.sin(theta)*tangent)
        try:
            v1, v2, diagnostics = solve_lambert(r1, target, seconds, EARTH_MU)
            minimum = minimum_transfer_radius(r1, v1, target, v2, EARTH_MU)
            # Reject an inward departure and any intersection with Earth/120 km atmosphere.
            if np.dot(r1, v1) < -1e-6 or minimum < EARTH_RADIUS_KM+120:
                continue
            circular = np.cross(normal, r1/radius)*math.sqrt(EARTH_MU/radius)
            injection = float(np.linalg.norm(v1-circular))
            with SPICE_LOCK:
                states = [np.asarray(spice.prop2b(EARTH_MU, np.r_[r1, v1], float(t))) for t in offsets]
            closure = float(np.linalg.norm(states[-1][:3]-target))
            if closure > 0.01:
                continue  # Independent propagation must close to 10 metres or better.
            relative = [state[:3]-moon[:3] for state, moon in zip(states, moon_states)]
            moon_clearance = min(segment_minimum_norm(a, b) for a, b in zip(relative, relative[1:]))-MOON_RADIUS_KM
            if moon_clearance < 100:
                continue
            candidates.append((injection, angle, r1, v1, v2, diagnostics, states, minimum, closure, moon_clearance))
        except TransferError:
            continue
    if not candidates:
        raise TransferError('No admissible outbound short-way transfer in the bounded parking-phase search. Try a different arrival date or duration; no illustrative path is used.')
    injection, angle, r1, v1, v2, diagnostics, states, minimum, closure, moon_clearance = min(candidates, key=lambda item: item[0])
    energy0 = float(np.dot(v1, v1)/2-EARTH_MU/np.linalg.norm(r1))
    h0 = np.cross(r1, v1)
    energy_drift = max(abs(float(np.dot(s[3:], s[3:])/2-EARTH_MU/np.linalg.norm(s[:3]))-energy0)/max(abs(energy0), 1e-12) for s in states)
    momentum_drift = max(float(np.linalg.norm(np.cross(s[:3], s[3:])-h0)/np.linalg.norm(h0)) for s in states)
    if energy_drift > 1e-7 or momentum_drift > 1e-7:
        raise TransferError('Propagation failed conservation checks; no flight path is returned.')
    samples = []
    with SPICE_LOCK:
        for t, state, moon in zip(offsets, states, moon_states):
            et = et0+float(t)
            sun = np.asarray(spice.spkpos('SUN', et, 'J2000', 'NONE', 'EARTH')[0])
            samples.append({'time': spice.et2utc(et, 'ISOC', 3)+'Z', 'elapsed_seconds':float(t),
                'spacecraft_position_km':state[:3].tolist(), 'spacecraft_velocity_km_s':state[3:].tolist(),
                'moon_position_km':moon[:3].tolist(), 'moon_velocity_km_s':moon[3:].tolist(),
                'sun_direction':(sun/np.linalg.norm(sun)).tolist(),
                'earth_orientation':spice.pxform('IAU_EARTH', 'J2000', et).reshape(-1).tolist(),
                'moon_orientation':spice.pxform('MOON_ME', 'J2000', et).reshape(-1).tolist()})
    motion = math.degrees(math.acos(float(np.clip(np.dot(start_moon[:3], end_moon[:3])/(np.linalg.norm(start_moon[:3])*np.linalg.norm(end_moon[:3])), -1, 1))))
    return {'schema_version':1, 'model':'Preliminary two-body transfer',
        'request':{'departure_utc':departure, 'arrival_utc':arrival, 'parking_altitude_km':altitude},
        'frame':'Earth-centered J2000; geometric SPICE states (NONE)', 'units':{'distance':'km','time':'s','velocity':'km/s'},
        'arrival_target':{'definition':'Earth-facing radial reference point at arrival epoch', 'altitude_km':ARRIVAL_ALTITUDE_KM, 'position_km':target.tolist(), 'is_capture_or_landing':False},
        'summary':{'flight_duration_hours':seconds/3600, 'departure_earth_moon_distance_km':float(np.linalg.norm(start_moon[:3])),
            'arrival_earth_moon_distance_km':float(np.linalg.norm(end_moon[:3])), 'moon_motion_degrees':motion,
            'injection_delta_v_km_s':injection, 'arrival_moon_relative_speed_km_s':float(np.linalg.norm(v2-end_moon[3:])),
            'endpoint_error_km':closure, 'minimum_earth_altitude_km':minimum-EARTH_RADIUS_KM,
            'sampled_moon_clearance_km':moon_clearance, 'parking_phase_angle_degrees':angle,
            'candidate_count':len(candidates), 'max_relative_energy_drift':energy_drift,
            'max_relative_angular_momentum_drift':momentum_drift, **diagnostics},
        'constants':{'earth_mu_km3_s2':EARTH_MU,'earth_radius_km':EARTH_RADIUS_KM,'moon_radius_km':MOON_RADIUS_KM},
        'samples':samples, 'limitations':LIMITATIONS,
        'provenance':{'kernel_details':kernel_provenance(), 'constants_source':'https://ssd.jpl.nasa.gov/astro_par.html',
            'propagator':'NAIF SPICE prop2b', 'ephemeris':'de440s.bsp',
            'parking_phase_search':'100–175 degrees in 5 degree increments; lowest injection delta-v among admissible candidates, not a global optimum',
            'solver':'Universal-variable Lambert; short-way, zero revolutions; <=500 bracket evaluations and <=80 bisections per candidate'}}


@router.post('/calculate')
def calculate_transfer(request: TransferRequest, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    with api_errors():
        validate_dates(request)
        return deepcopy(_calculate(_iso(request.departure_utc), _iso(request.arrival_utc), request.parking_altitude_km, kernel_fingerprint()))
