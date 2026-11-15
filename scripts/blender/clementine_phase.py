"""Experimental Clementine Earth phase-curve diagnostic.

Cooper et al. (2026), Table 3: https://arxiv.org/abs/2609.36291
arXiv preprint, CC BY 4.0. The fitted coefficients describe average apparent
albedo in narrow bands, not date-specific broadband irradiance or Blender RGB.
"""
import math

# Polynomial coefficients are in descending degree order. Units of phase: degrees.
COEFFICIENTS = {
    '412.9_nm': (8.803e-11, -2.258e-8, 2.445e-6, -1.061e-4, -3.614e-4, .480),
    '750.5_nm': (1.517e-10, -3.759e-8, 3.552e-6, -1.322e-4, 2.092e-4, .334),
    '897_nm': (1.759e-10, -4.470e-8, 4.285e-6, -1.629e-4, 6.037e-4, .338),
    '951.4_nm': (1.166e-10, -3.084e-8, 3.003e-6, -1.171e-4, 8.265e-4, .179),
    '1000.2_nm': (2.314e-10, -6.125e-8, 6.043e-6, -2.418e-4, 1.925e-3, .337),
}


def spectral_phase_diagnostic(phase_deg):
    """Return observed-fit narrow-band apparent albedos within the data range.

    The conservative upper limit is the abstract's 139.1 degrees. Values
    outside the observations are rejected instead of extrapolating a polynomial.
    """
    phase_deg = float(phase_deg)
    if not math.isfinite(phase_deg) or not 3.4 <= phase_deg <= 139.1:
        raise ValueError('Clementine diagnostic requires phase from 3.4 to 139.1 degrees')
    angle = math.radians(phase_deg)
    lambert_phase = (math.sin(angle)+(math.pi-angle)*math.cos(angle))/math.pi
    bands = {}
    for label, coefficients in COEFFICIENTS.items():
        apparent = 0.0
        for coefficient in coefficients:
            apparent = apparent * phase_deg + coefficient
        if apparent < 0:
            raise ValueError('Rounded published coefficients yielded negative apparent albedo')
        bands[label] = {'apparent_albedo': apparent,
                        'geometric_albedo_times_phase': (2/3)*apparent*lambert_phase}
    return {'phase_deg': phase_deg, 'lambert_phase': lambert_phase, 'bands': bands,
            'source': 'Cooper et al. 2026, Table 3, https://arxiv.org/abs/2609.36291',
            'limitations': ['1994 average narrow-band fits, not the historical landing weather or broadband flux.',
                            'Preprint; observed scatter, calibration, polarization, ocean glint and spectral-band differences remain.',
                            'Not calibrated for Blender RGB and not a substitute for a validated directional reflectance model.']}
