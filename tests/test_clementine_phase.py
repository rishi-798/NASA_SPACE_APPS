import pytest

from scripts.blender.clementine_phase import spectral_phase_diagnostic


def test_ninety_degree_fit_and_lambert_convention():
    result = spectral_phase_diagnostic(90)
    assert result['lambert_phase'] == pytest.approx(1 / 3.141592653589793)
    for band in result['bands'].values():
        assert band['geometric_albedo_times_phase'] == pytest.approx(
            2/3 * band['apparent_albedo'] * result['lambert_phase'])
    assert result['bands']['412.9_nm']['apparent_albedo'] == pytest.approx(.409, abs=.002)


def test_crescent_has_wavelength_dependent_scattering():
    result = spectral_phase_diagnostic(132)
    assert result['bands']['750.5_nm']['apparent_albedo'] > .8
    assert result['bands']['1000.2_nm']['apparent_albedo'] != pytest.approx(result['bands']['412.9_nm']['apparent_albedo'])


@pytest.mark.parametrize('angle', [-1, 0, 3.3, 139.2, 180, float('nan'), float('inf')])
def test_rejects_outside_observed_phase_range(angle):
    with pytest.raises(ValueError):
        spectral_phase_diagnostic(angle)
