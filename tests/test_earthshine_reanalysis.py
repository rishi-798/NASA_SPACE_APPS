import math

import numpy as np
import pytest
from numpy.polynomial.legendre import leggauss

from scripts.blender.earthshine_reanalysis import effective_albedo, integrate_reflected_flux


def grid():
    nodes, _ = leggauss(94)
    lat = np.degrees(np.arcsin(nodes[::-1]))
    lon = np.arange(192) * 360 / 192
    return lat, lon


@pytest.mark.parametrize('phase_deg', [0, 70, 120, 150])
def test_uniform_reflectance_matches_lambert_sphere(phase_deg):
    lat, lon = grid()
    albedo = np.full((len(lat), len(lon)), .3)
    phase = math.radians(phase_deg)
    result = integrate_reflected_flux(lat, lon, albedo, np.ones_like(albedo, dtype=bool),
                                      [1, 0, 0], [math.cos(phase), math.sin(phase), 0], 1361, 384400)
    lambert = (math.sin(phase)+(math.pi-phase)*math.cos(phase))/math.pi
    expected = 1361*(2/3)*.3*(6371/384400)**2*lambert
    assert result['irradiance_w_m2'] == pytest.approx(expected, rel=.005)
    assert result['fallback_illumination_weight_fraction'] == 0


def test_bad_flux_cells_use_explicit_fallback():
    albedo, valid = effective_albedo([100, 0, 30, float('nan')], [200, 1, 10, 200])
    assert albedo.tolist() == pytest.approx([.5, .3, .3, .3])
    assert valid.tolist() == [True, False, False, False]
    with pytest.raises(ValueError):
        effective_albedo([1, 2], [1])


def test_rejects_invalid_grid_and_vectors():
    lat, lon = grid()
    data = np.full((len(lat), len(lon)), .3)
    mask = np.ones_like(data, dtype=bool)
    with pytest.raises(ValueError, match='Latitude grid'):
        integrate_reflected_flux(lat + 1, lon, data, mask, [1, 0, 0], [1, 0, 0], 1361, 384400)
    with pytest.raises(ValueError, match='three-vectors'):
        integrate_reflected_flux(lat, lon, data, mask, [0, 0, 0], [1, 0, 0], 1361, 384400)


def test_unlit_visible_hemisphere_is_dark():
    lat, lon = grid()
    data = np.full((len(lat), len(lon)), .3)
    result = integrate_reflected_flux(lat, lon, data, np.zeros_like(data, dtype=bool),
                                      [1, 0, 0], [-1, 0, 0], 1361, 384400)
    assert result['irradiance_w_m2'] == 0
    assert result['fallback_illumination_weight_fraction'] == 0
