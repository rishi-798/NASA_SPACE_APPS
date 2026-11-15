"""Contract checks for the geometry used by the Blender lighting rig."""
import math

import pytest

from backend.calculations.sun_earth import calculate_visibility, calculate_visibility_window
from backend.spice_kernels import KERNEL_FILES, kernel_directory
from scripts.blender.rig_ephemeris_sun import calculate, visible_disc_fraction, orient_for_site04_plane, earth_visual_hg_phase, earth_visual_fractional_variability


pytestmark = pytest.mark.skipif(
    not all((kernel_directory() / name).is_file() for name in KERNEL_FILES),
    reason="SPICE kernels not installed",
)


@pytest.mark.parametrize("lat,lon,time", [
    (0.67408, 23.47297, "1969-07-20T20:17:40Z"),
    (-3.0128, -23.4219, "1969-11-19T06:54:35Z"),
    (-43.3, -11.22, "2026-10-03T18:00:00Z"),
])
def test_rig_directions_match_existing_visibility_calculation(lat, lon, time):
    metadata = {"anchor": {"latitude_planetocentric_deg": lat, "longitude_east_deg": lon},
                "vertical_reference_radius_m": 1737400}
    rig = calculate(metadata, time, 'NONE')
    reference = calculate_visibility(lat, lon, time)
    for name in ("sun", "earth"):
        body = rig[name]
        assert body["azimuth_deg"] == pytest.approx(reference[name]["azimuth"], abs=1e-8)
        assert body["elevation_deg"] == pytest.approx(reference[name]["elevation"], abs=1e-8)
        assert math.sqrt(sum(x*x for x in body["direction_enu"])) == pytest.approx(1)
    assert 0 <= rig["earth_lambert_phase"] <= 1
    assert 0 <= rig['solar_disc_visible_fraction'] <= 1
    assert rig['direct_solar_irradiance_w_m2'] == pytest.approx(rig['solar_irradiance_w_m2'] * rig['solar_disc_visible_fraction'])
    assert rig["solar_irradiance_w_m2"] > rig["earthshine_irradiance_w_m2_approx"] >= 0
    assert 0.5 < rig['sun']['angular_diameter_deg'] < 0.56
    assert 1.7 < rig['earth']['angular_diameter_deg'] < 2.2


def test_crater_metadata_anchor_matches_landing_site_shape():
    base = {"vertical_reference_radius_m": 1737400}
    feature = {**base, "feature": {"latitude_deg": -43.3, "longitude_east_deg": -11.22}}
    anchor = {**base, "anchor": {"latitude_planetocentric_deg": -43.3, "longitude_east_deg": -11.22}}
    assert calculate(feature, "2026-10-03T18:00:00Z") == calculate(anchor, "2026-10-03T18:00:00Z")


def test_anchor_height_changes_topocentric_geometry():
    metadata = {"anchor": {"latitude_planetocentric_deg": -3.0128, "longitude_east_deg": -23.4219},
                "vertical_reference_radius_m": 1737400}
    reference = calculate(metadata, '1969-11-19T06:54:35Z')
    elevated = calculate({**metadata, 'anchor_sample_height_m': 10000}, '1969-11-19T06:54:35Z')
    assert elevated['anchor_height_m'] == 10000
    assert elevated['earth']['distance_km'] < reference['earth']['distance_km']
    assert elevated['earth']['elevation_deg'] != reference['earth']['elevation_deg']


def test_pre_1972_utc_drift_against_horizons():
    # JPL Horizons airless apparent Sun at this Surveyor 1 mesh anchor.
    metadata = {'anchor': {'latitude_planetocentric_deg': -2.4745,
                           'longitude_east_deg': -43.3398},
                'vertical_reference_radius_m': 1737400,
                'anchor_sample_height_m': -1885.656982421875}
    rig = calculate(metadata, '1966-06-02T06:17:36Z')
    assert rig['sun']['elevation_deg'] == pytest.approx(28.899852, abs=2e-6)
    assert rig['historical_tai_minus_utc_seconds'] == pytest.approx(4.70783368, abs=1e-7)


def test_historical_window_uses_same_corrected_epoch_as_single_and_blender():
    time = '1966-06-02T06:17:36Z'
    metadata = {'anchor': {'latitude_planetocentric_deg': -2.4745, 'longitude_east_deg': -43.3398},
                'vertical_reference_radius_m': 1737400}
    single = calculate_visibility(-2.4745, -43.3398, time)
    window = calculate_visibility_window(-2.4745, -43.3398, time, time, 30)[0]
    rig = calculate(metadata, time, 'NONE')
    for name in ('sun', 'earth'):
        assert window[name] == single[name]
        assert rig[name]['elevation_deg'] == pytest.approx(single[name]['elevation'], abs=1e-8)
        assert rig[name]['azimuth_deg'] == pytest.approx(single[name]['azimuth'], abs=1e-8)


@pytest.mark.parametrize('time', ['1966-06-02T06:17:36Z', '2026-10-03T18:00:00Z'])
def test_apparent_visibility_matches_blender_at_same_anchor(time):
    metadata = {'anchor': {'latitude_planetocentric_deg': -89.5, 'longitude_east_deg': 135.0},
                'vertical_reference_radius_m': 1737400}
    vis = calculate_visibility(-89.5, 135.0, time, apparent=True)
    rig = calculate(metadata, time)
    for name in ('sun', 'earth'):
        assert vis[name]['azimuth'] == pytest.approx(rig[name]['azimuth_deg'], abs=1e-8)
        assert vis[name]['elevation'] == pytest.approx(rig[name]['elevation_deg'], abs=1e-8)


def test_light_time_and_aberration_are_applied():
    metadata = {"anchor": {"latitude_planetocentric_deg": -3.0128, "longitude_east_deg": -23.4219},
                "vertical_reference_radius_m": 1737400}
    time = '1969-11-19T06:54:35Z'
    apparent = calculate(metadata, time)
    geometric = calculate(metadata, time, 'NONE')
    assert apparent['aberration'] == 'CN+S'
    assert 480 < apparent['sun']['light_time_seconds'] < 510
    assert 1 < apparent['earth']['light_time_seconds'] < 2
    assert apparent['sun']['direction_enu'] != geometric['sun']['direction_enu']


def test_earth_phase_agrees_with_moon_center_within_parallax():
    import spiceypy as spice
    from backend.spice_kernels import SPICE_LOCK, load_spice_kernels

    metadata = {"anchor": {"latitude_planetocentric_deg": -3.0128, "longitude_east_deg": -23.4219},
                "vertical_reference_radius_m": 1737400}
    time = '1969-11-19T06:54:35Z'
    result = calculate(metadata, time)
    with SPICE_LOCK:
        load_spice_kernels()
        center_phase = math.degrees(spice.phaseq(spice.utc2et(time), 'EARTH', 'SUN', 'MOON', 'CN+S'))
    # Moon-center and surface-observer phase differ by lunar parallax.
    assert abs(result['earth_phase_angle_deg'] - center_phase) < 0.4


@pytest.mark.parametrize('source,occluder,separation,expected', [
    (1, 2, 4, 1), (1, 2, 0, 0), (2, 1, 0, .75), (1, 1, 2, 1),
    (1, 1, 0, 0),
])
def test_disc_visibility_edge_cases(source, occluder, separation, expected):
    assert visible_disc_fraction(source, occluder, separation) == pytest.approx(expected)


def test_partial_eclipse_is_continuous_and_bounded():
    values = [visible_disc_fraction(1, 1, d) for d in (.25, .5, 1, 1.5, 1.75)]
    assert values == sorted(values)
    assert all(0 < value < 1 for value in values)


def test_documented_2025_lunar_eclipse_at_apollo12():
    # NASA: total eclipse midpoint approximately 06:58 UTC on 2025-03-14.
    metadata = {"anchor": {"latitude_planetocentric_deg": -3.0128, "longitude_east_deg": -23.4219},
                "vertical_reference_radius_m": 1737400}
    eclipsed = calculate(metadata, '2025-03-14T06:58:00Z')
    later = calculate(metadata, '2025-03-14T12:00:00Z')
    assert eclipsed['sun']['elevation_deg'] > 0
    assert eclipsed['solar_disc_visible_fraction'] == 0
    assert later['solar_disc_visible_fraction'] == 1


@pytest.mark.parametrize("longitude,east_expected,north_expected", [
    (0, (1, 0, 0), (0, 1, 0)),
    (90, (0, -1, 0), (1, 0, 0)),
    (-90, (0, 1, 0), (-1, 0, 0)),
])
def test_site04_projection_rotates_enu_into_map_axes(longitude, east_expected, north_expected):
    payload = {"sun": {"direction_enu": [1, 0, 0]}, "earth": {"direction_enu": [0, 1, 0]}}
    metadata = {"region_id": "SITE04-BLOCK-A", "anchor": {"longitude_east_deg": longitude}}
    result = orient_for_site04_plane(payload, metadata)
    assert result['sun']['direction_blender'] == pytest.approx(east_expected)
    assert result['earth']['direction_blender'] == pytest.approx(north_expected)
    assert result['sun']['direction_enu'] == [1, 0, 0]


def test_site04_projection_rejects_other_regions():
    with pytest.raises(ValueError):
        orient_for_site04_plane({}, {"region_id": "REGION-TYCHO"})


@pytest.mark.parametrize("x,y", [(-5000, -9000), (3000, -9000), (-5000, -1000), (3000, -1000)])
def test_site04_plane_rotation_matches_numerical_projection_tangents(x, y):
    import numpy as np
    from scripts.blender.build_site04_glb import fixed, R

    lon = math.atan2(x, y)
    lat = -math.pi / 2 + 2 * math.atan(math.hypot(x, y) / (2 * R))
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array([-math.sin(lat)*math.cos(lon), -math.sin(lat)*math.sin(lon), math.cos(lat)])
    up = np.cross(east, north)
    step = 1.0
    tangent_x = fixed(x + step, y, 0) - fixed(x - step, y, 0)
    tangent_y = fixed(x, y + step, 0) - fixed(x, y - step, 0)
    tangent_x /= np.linalg.norm(tangent_x)
    tangent_y /= np.linalg.norm(tangent_y)
    direction = np.array([.3, -.4, math.sqrt(.75)])
    fixed_direction = east * direction[0] + north * direction[1] + up * direction[2]
    expected = [np.dot(fixed_direction, tangent_x), np.dot(fixed_direction, tangent_y), np.dot(fixed_direction, up)]
    payload = {'sun': {'direction_enu': direction.tolist()}, 'earth': {'direction_enu': direction.tolist()}}
    metadata = {'region_id': 'SITE04-BLOCK-A', 'anchor': {'longitude_east_deg': math.degrees(lon)}}
    result = orient_for_site04_plane(payload, metadata)
    assert result['sun']['direction_blender'] == pytest.approx(expected, abs=1e-7)


def test_empirical_visual_earth_phase_normalization_and_limits():
    assert earth_visual_hg_phase(0) == pytest.approx(1)
    assert earth_visual_hg_phase(math.pi/2) == pytest.approx(((1-.33)**2/(1+.33**2))**1.5)
    assert earth_visual_hg_phase(math.pi) == pytest.approx(((1-.33)/(1+.33))**3)
    assert earth_visual_hg_phase(0) > earth_visual_hg_phase(math.pi/2) > earth_visual_hg_phase(math.pi)
    with pytest.raises(ValueError):
        earth_visual_hg_phase(-.1)
    with pytest.raises(ValueError):
        earth_visual_hg_phase(0, 1)


def test_visual_earthshine_is_explicitly_distinct_from_legacy_broadband():
    metadata = {"anchor": {"latitude_planetocentric_deg": -3.0128, "longitude_east_deg": -23.4219}, "vertical_reference_radius_m": 1737400}
    result = calculate(metadata, '1969-11-19T06:54:35Z')
    assert result['earth_visual_hg_phase'] > 0
    assert result['earthshine_visual_equivalent_sun_strength'] > 0
    assert result['earthshine_visual_equivalent_sun_strength'] != result['earthshine_irradiance_w_m2_approx']
    assert 'not measured broadband flux' in result['earthshine_visual_model']


def test_empirical_visual_variability_is_phase_dependent():
    assert earth_visual_fractional_variability(0) == pytest.approx(.11)
    assert earth_visual_fractional_variability(math.radians(110)) == pytest.approx(.11)
    assert earth_visual_fractional_variability(math.radians(165)) == pytest.approx(.11 * 1.5**4.6)
    with pytest.raises(ValueError):
        earth_visual_fractional_variability(math.pi + .1)
