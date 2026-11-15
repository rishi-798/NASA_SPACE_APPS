"""Experimental broadband Earthshine estimate from NOAA reanalysis fluxes.

This is not measured historical radiance and is not an input to the Blender rig.
See README_ephemeris.md for assumptions, NOAA inputs, and invocation.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from numpy.polynomial.legendre import leggauss

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
EARTH_RADIUS_KM = 6371.0
SOLAR_CONSTANT = 1361.0
AU_KM = 149597870.7


def effective_albedo(upward, downward, threshold=5.0, fallback=0.30):
    """Estimate reflectance from six-hour fluxes and mark unreliable cells."""
    upward = np.asarray(upward, dtype=float)
    downward = np.asarray(downward, dtype=float)
    if upward.shape != downward.shape or threshold <= 0 or not 0 <= fallback <= 1:
        raise ValueError('Flux grids, threshold, or fallback are invalid')
    valid = np.isfinite(upward) & np.isfinite(downward) & (downward > threshold)
    ratio = np.divide(upward, downward, out=np.zeros_like(upward), where=valid)
    valid &= (ratio >= 0) & (ratio <= 1)
    return np.where(valid, ratio, fallback), valid


def integrate_reflected_flux(latitudes, longitudes, albedo, valid, sun, observer,
                             solar_flux, distance_km):
    """Integrate a Lambertian sphere using the Gaussian grid's quadrature."""
    lat = np.asarray(latitudes, dtype=float)
    lon = np.asarray(longitudes, dtype=float)
    albedo = np.asarray(albedo, dtype=float)
    valid = np.asarray(valid, dtype=bool)
    if lat.ndim != 1 or lon.ndim != 1 or len(lat) < 2 or len(lon) < 2:
        raise ValueError('Expected one-dimensional latitude and longitude grids')
    if albedo.shape != (len(lat), len(lon)) or valid.shape != albedo.shape:
        raise ValueError('Grid shape does not match coordinates')
    if not np.isfinite(albedo).all() or np.any((albedo < 0) | (albedo > 1)):
        raise ValueError('Albedo must be finite and between zero and one')
    if not math.isfinite(solar_flux) or solar_flux < 0 or not math.isfinite(distance_km) or distance_km <= EARTH_RADIUS_KM:
        raise ValueError('Solar flux or Earth-observer distance is invalid')
    nodes, weights = leggauss(len(lat))
    if np.allclose(np.sin(np.radians(lat)), nodes[::-1], atol=2e-5):
        weights = weights[::-1]
    elif not np.allclose(np.sin(np.radians(lat)), nodes, atol=2e-5):
        raise ValueError('Latitude grid is not Gaussian')
    spacing = 360.0 / len(lon)
    if not np.allclose(np.diff(lon), spacing, atol=1e-5):
        raise ValueError('Longitude grid must be regularly spaced over 360 degrees')
    vectors = []
    for vector in (sun, observer):
        vector = np.asarray(vector, dtype=float)
        if vector.shape != (3,) or not np.isfinite(vector).all() or np.linalg.norm(vector) == 0:
            raise ValueError('Sun and observer must be finite nonzero three-vectors')
        vectors.append(vector / np.linalg.norm(vector))
    phi, lam = np.radians(lat)[:, None], np.radians(lon)[None, :]
    normals = np.stack(np.broadcast_arrays(np.cos(phi)*np.cos(lam),
                        np.cos(phi)*np.sin(lam), np.sin(phi)), axis=-1)
    illumination = np.maximum(normals @ vectors[0], 0)
    visibility = np.maximum(normals @ vectors[1], 0)
    kernel = weights[:, None] * (2*math.pi/len(lon)) * illumination * visibility
    total = float(np.sum(kernel))
    irradiance = solar_flux/math.pi * (EARTH_RADIUS_KM/distance_km)**2 * float(np.sum(kernel*albedo))
    return {'irradiance_w_m2': irradiance,
            'fallback_illumination_weight_fraction': float(np.sum(kernel * ~valid)/total) if total else 0.0}


def read_flux_grids(upward_path, downward_path, timestamp):
    # Optional dependency, deliberately not needed by the Blender rig itself.
    from netCDF4 import Dataset, date2num
    base = timestamp.replace(hour=timestamp.hour//6*6, minute=0, second=0, microsecond=0, tzinfo=None)
    with Dataset(str(upward_path)) as up, Dataset(str(downward_path)) as down:
        for dataset, variable_name in ((up, 'uswrf'), (down, 'dswrf')):
            variable = dataset[variable_name]
            if (getattr(variable, 'units', '') != 'W/m^2' or
                    getattr(variable, 'level_desc', '').lower() != 'nominal top of atmosphere' or
                    getattr(variable, 'dataset', '') != 'NCEP Reanalysis' or
                    getattr(dataset['time'], 'delta_t', '') != '0000-00-00 06:00:00'):
                raise ValueError('Expected NCEP Reanalysis six-hour mean top-of-atmosphere flux in W/m^2')
        lat, lon = np.asarray(up['lat'][:]), np.asarray(up['lon'][:])
        if not np.allclose(lat, down['lat'][:]) or not np.allclose(lon, down['lon'][:]):
            raise ValueError('Flux grids use different coordinates')
        times = np.asarray(up['time'][:])
        if (up['time'].units != down['time'].units or
                getattr(up['time'], 'calendar', 'standard') != getattr(down['time'], 'calendar', 'standard') or
                not np.array_equal(times, down['time'][:])):
            raise ValueError('Flux grids use different time axes')
        expected = date2num(base, up['time'].units, getattr(up['time'], 'calendar', 'standard'))
        index = int(np.argmin(np.abs(times-expected)))
        if abs(float(times[index])-float(expected)) > 1e-5:
            raise ValueError('Six-hour forecast period is not present in both files')
        def values(variable):
            return np.asarray(np.ma.filled(variable[index], np.nan), dtype=float)
        return lat, lon, values(up['uswrf']), values(down['dswrf']), base.isoformat()+'Z'


def earth_geometry(metadata, timestamp, earth_orientation_pck):
    import spiceypy as spice
    from backend.calculations.time_scales import utc_to_et
    from backend.spice_kernels import SPICE_LOCK, load_spice_kernels

    anchor = metadata['anchor']
    lat, lon = map(math.radians, (anchor['latitude_planetocentric_deg'], anchor['longitude_east_deg']))
    up = np.array([math.cos(lat)*math.cos(lon), math.cos(lat)*math.sin(lon), math.sin(lat)])
    height = float(metadata.get('anchor_sample_height_m', 0.0))
    site = up * ((float(metadata['vertical_reference_radius_m']) + height)/1000)
    kernel = str(Path(earth_orientation_pck).resolve(strict=True))
    with SPICE_LOCK:
        load_spice_kernels()
        loaded = any(spice.kdata(i, 'PCK')[0] == kernel for i in range(spice.ktotal('PCK')))
        if not loaded:
            spice.furnsh(kernel)
        try:
            et = utc_to_et(timestamp)
            earth, light_time = spice.spkcpo('EARTH', et, 'J2000', 'OBSERVER', 'CN+S', site, 'MOON', 'MOON_ME')
            earth_et = et - light_time
            sun, _ = spice.spkpos('SUN', earth_et, 'J2000', 'CN+S', 'EARTH')
            rotation = spice.pxform('J2000', 'ITRF93', earth_et)
            distance = float(np.linalg.norm(earth[:3]))
            return rotation @ sun, rotation @ -earth[:3], SOLAR_CONSTANT*(AU_KM/np.linalg.norm(sun))**2, distance
        finally:
            if not loaded:
                spice.unload(kernel)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024*1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('metadata', 'time', 'upward', 'downward', 'earth-orientation-pck', 'output'):
        parser.add_argument('--'+name, required=True)
    args = parser.parse_args()
    from backend.calculations.sun_earth import parse_utc_time
    timestamp = parse_utc_time(args.time)
    metadata = json.loads(Path(args.metadata).read_text(encoding='utf-8'))
    lat, lon, upward, downward, period = read_flux_grids(args.upward, args.downward, timestamp)
    albedo, valid = effective_albedo(upward, downward)
    sun, observer, solar_flux, distance = earth_geometry(metadata, timestamp, args.earth_orientation_pck)
    result = integrate_reflected_flux(lat, lon, albedo, valid, sun, observer, solar_flux, distance)
    result.update({'time_utc': timestamp.isoformat().replace('+00:00', 'Z'),
                   'forecast_start_utc': period, 'upward_sha256': sha256(args.upward),
                   'downward_sha256': sha256(args.downward), 'earth_orientation_sha256': sha256(args.earth_orientation_pck),
                   'model': 'NCEP/NCAR six-hour mean effective albedo, instantaneous SPICE geometry, Lambertian scattering',
                   'limitations': ['Experimental modeled broadband flux, not measured historical Moon-view radiance or calibrated RGB.',
                                   'Six-hour forecast-averaged clouds and isotropic scattering do not resolve actual instantaneous directional radiance.',
                                   'Terrain horizon and eclipse effects are not modeled; do not treat this as a production-ready light.']})
    with Path(args.output).open('x', encoding='utf-8') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
