"""Glenar et al. spring-season spectral Earthshine approximation.

Coefficient data: https://doi.org/10.17632/xfjm6nmh3m.2, CC BY 4.0.
The result is solar-band irradiance, not a calibrated Blender RGB light.
"""
from functools import lru_cache
from pathlib import Path
import math

import numpy as np


@lru_cache(maxsize=1)
def coefficients():
    path = Path(__file__).parent / 'data' / 'Earthshine_Spring_Approximation_Revised_Sept2018.txt'
    text = path.read_text(encoding='utf-8')
    grid_text = text.split('The 37 X 11 array of fL values:')[1].split('Coefficient values')[0]
    grid = np.array([[float(x) for x in line.split()] for line in grid_text.splitlines()
                     if len(line.split()) == 37])
    table_text = text.split('    Wvl     Ibar00')[1]
    rows = []
    for line in table_text.splitlines()[1:]:
        try:
            values = [float(x) for x in line.split()]
        except ValueError:
            continue
        if len(values) == 11:
            rows.append(values)
    table = np.array(rows)
    if grid.shape != (11, 37) or table.shape != (733, 11):
        raise ValueError('Unexpected Glenar coefficient file format')
    return grid, table


def spring_solar_band(phase_deg, subobserver_lat_deg, subobserver_lon_east_deg, distance_km):
    """Estimate 0.3003–2.487562 µm reflected irradiance on a normal plane.

    The source fit is spring-season, with one summer-solstice comparison;
    it does not represent actual date-specific clouds. The tabulated land
    grid spans -20 to +30 degrees, narrower than the stated model range.
    """
    if not all(math.isfinite(x) for x in (phase_deg, subobserver_lat_deg, subobserver_lon_east_deg, distance_km)):
        raise ValueError('Inputs must be finite')
    if not 0 <= phase_deg < 60 or not -20 <= subobserver_lat_deg <= 30 or distance_km <= 6371:
        raise ValueError('Outside validated phase, tabulated latitude, or distance range')
    grid, table = coefficients()
    west = (-subobserver_lon_east_deg) % 360
    position = (subobserver_lat_deg + 20) / 5
    lo = min(int(position), 9)
    weight = position - lo
    land0 = np.interp(west, np.arange(37)*10, grid[lo])
    land1 = np.interp(west, np.arange(37)*10, grid[lo+1])
    land = land0*(1-weight) + land1*weight
    mean_land = .181 + 7.578e-4*subobserver_lat_deg + 1.1517e-5*subobserver_lat_deg**2
    b = table[:, 3]
    cosine = math.cos(math.radians(phase_deg))
    phase = 0.5 * ((1-b)**-3 + (1+b)**-3)**-1 * (
        (1-2*b*cosine+b*b)**-1.5 + (1+2*b*cosine+b*b)**-1.5) * (1+cosine)
    radiance = table[:, 1] * phase * (1 + table[:, 5]*(mean_land-.190)) * (1 + table[:, 8]*(land-mean_land))
    integrated_radiance = float(np.trapezoid(radiance, table[:, 0]))
    # Insert the band endpoints so no partial interval is silently discarded.
    visible_wavelengths = np.concatenate(([.4], table[(table[:, 0] > .4) & (table[:, 0] < .7), 0], [.7]))
    visible_radiance = float(np.trapezoid(np.interp(visible_wavelengths, table[:, 0], radiance), visible_wavelengths))
    projected_solid_angle = math.pi*(6371/distance_km)**2
    return {'irradiance_w_m2': integrated_radiance * projected_solid_angle,
            'integrated_radiance_w_m2_sr': integrated_radiance,
            'visible_0_4_to_0_7_um_irradiance_w_m2': visible_radiance * projected_solid_angle,
            'visible_band_note': 'Unweighted 0.4–0.7 µm radiant energy; not photopic illuminance or calibrated RGB.',
            'land_fraction': float(land),
            'wavelength_um': [float(table[0, 0]), float(table[-1, 0])],
            'limits': 'Spring-season approximation; one summer-solstice comparison; unknown historical clouds, season dependence and eclipse effects. Solar band only; not bolometric or calibrated RGB.',
            'source': 'https://doi.org/10.17632/xfjm6nmh3m.2'}
