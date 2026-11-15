import pytest

from scripts.blender.earthshine_spring import coefficients, spring_solar_band


def test_published_solar_band_magnitude_and_distance_scaling():
    # Glenar et al. report roughly 77 W m-2 sr-1 near full Earth.
    full = spring_solar_band(0, 0, 0, 384400)
    farther = spring_solar_band(0, 0, 0, 768800)
    assert full['integrated_radiance_w_m2_sr'] == pytest.approx(77, abs=5)
    assert full['irradiance_w_m2'] == pytest.approx(4*farther['irradiance_w_m2'])
    assert 0 < full['visible_0_4_to_0_7_um_irradiance_w_m2'] < full['irradiance_w_m2']
    assert full['visible_0_4_to_0_7_um_irradiance_w_m2'] == pytest.approx(
        4*farther['visible_0_4_to_0_7_um_irradiance_w_m2'])
    assert full['land_fraction'] == pytest.approx(.23050)


def test_grid_periodicity_and_phase():
    zero = spring_solar_band(0, 10, 0, 384400)
    wrapped = spring_solar_band(0, 10, 360, 384400)
    quarter = spring_solar_band(45, 10, 0, 384400)
    assert zero == wrapped
    assert 0 < quarter['irradiance_w_m2'] < zero['irradiance_w_m2']
    assert coefficients()[0].shape == (11, 37)


@pytest.mark.parametrize('phase,lat', [(60, 0), (-1, 0), (0, -21), (0, 31)])
def test_rejects_unvalidated_ranges(phase, lat):
    with pytest.raises(ValueError):
        spring_solar_band(phase, lat, 0, 384400)
