"""Offline regressions: cache isolation, setup work, validation and file refresh."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from backend.calculations import sun_earth as engine
from backend import landing_sites
from backend.mission_summary import summarize_window
from backend.terrain.horizon import HorizonError, load_profile, validate_profile


class BackendPolishTests(unittest.TestCase):
    def setUp(self):
        engine._cached_visibility.cache_clear()

    def test_window_reuses_positions_and_does_not_share_mutable_results(self):
        with patch.object(engine, 'load_spice_kernels') as setup, \
             patch.object(engine.spiceypy, 'utc2et', return_value=0), \
             patch.object(engine.spiceypy, 'bodvrd', return_value=(3, [1737.4]*3)), \
             patch.object(engine.spiceypy, 'georec', return_value=np.array([1737.4, 0, 0])), \
             patch.object(engine.spiceypy, 'pxform', return_value=np.eye(3)) as rotation, \
             patch.object(engine.spiceypy, 'spkpos', return_value=(np.array([400000., 0, 0]), 0)) as position:
            args = (0, 0, '2026-10-03T00:00:00Z', '2026-10-03T02:00:00Z', 30)
            first = engine.calculate_visibility_window(*args)
            self.assertEqual(setup.call_count, 1)
            self.assertEqual(position.call_count, 10)
            self.assertEqual(rotation.call_count, 5)
            first[0]['sun']['visible'] = False
            first[0]['sun']['moon_fixed_position_km'][0] = -1
            second = engine.calculate_visibility_window(*args)
            self.assertEqual(position.call_count, 10)
            self.assertTrue(second[0]['sun']['visible'])
            self.assertEqual(second[0]['sun']['moon_fixed_position_km'][0], 400000)
            single = engine.calculate_visibility(0, 0, '2026-10-02T17:00:00-07:00')
            self.assertEqual(single['sun'], second[0]['sun'])
            self.assertEqual(position.call_count, 10)
            self.assertAlmostEqual(single['sun']['elevation'], 90)

    def test_cached_files_refresh_and_are_isolated(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sites.json'
            site = {'id':'test', 'name':'First', 'source':'https://example.org',
                    'latitude':0, 'longitude':0}
            path.write_text(json.dumps([site]))
            landing_sites.load_landing_sites(path)[0]['name'] = 'mutated'
            self.assertEqual(landing_sites.load_landing_sites(path)[0]['name'], 'First')
            site['name'] = 'Changed name'
            path.write_text(json.dumps([site]))
            self.assertEqual(landing_sites.load_landing_sites(path)[0]['name'], 'Changed name')
            profile = {'site_id':'test', 'latitude':0, 'longitude':0,
                       'source':'https://example.org', 'source_frame':'MOON_ME_DE421',
                       'datum_radius_m':1737400, 'max_distance_m':2500,
                       'azimuth_step':90, 'observer_height_m':2, 'horizon':[0,0,0,0]}
            profile_path = Path(directory) / 'test.json'
            profile_path.write_text(json.dumps(profile))
            load_profile(site, Path(directory))['horizon'][0] = 42
            self.assertEqual(load_profile(site, Path(directory))['horizon'][0], 0)
            profile['horizon'][0] = 12
            profile_path.write_text(json.dumps(profile))
            self.assertEqual(load_profile(site, Path(directory))['horizon'][0], 12)
            profile['azimuth_step'] = 0
            with self.assertRaises(HorizonError):
                validate_profile(profile)

    def test_incomplete_summary_is_rejected(self):
        sample = {'time':'2026-10-03T00:00:00Z', 'sun':{'visible':True}, 'earth':{'visible':True}}
        with self.assertRaisesRegex(ValueError, 'cover'):
            summarize_window(None, [sample], sample['time'], '2026-10-03T02:00:00Z', 30)
        with self.assertRaisesRegex(ValueError, 'positive integer'):
            summarize_window(None, [sample], sample['time'], '2026-10-03T02:00:00Z', 0)

    def test_extreme_timezone_is_a_validation_error(self):
        with self.assertRaises(ValueError):
            engine.parse_utc_time('0001-01-01T00:00:00+01:00')

    def test_summary_preserves_partial_intervals_and_transitions(self):
        samples = [
            {'time':f'2026-10-03T{hour:02d}:{minute:02d}:00Z',
             'sun':{'visible':sun}, 'earth':{'visible':earth}}
            for hour, minute, sun, earth in ((0,0,True,True), (0,30,False,True),
                                           (1,0,False,False), (1,30,True,False),
                                           (2,0,True,True))
        ]
        result = summarize_window(None, samples, samples[0]['time'], samples[-1]['time'], 30)
        self.assertEqual(result['sunlight_percent'], 50)
        self.assertEqual(result['earth_visible_percent'], 50)
        self.assertEqual(result['both_available_percent'], 25)
        self.assertEqual(result['longest_darkness_minutes'], 60)
        self.assertEqual(result['longest_comm_blackout_minutes'], 60)
        result = summarize_window(None, samples[:3], samples[0]['time'], '2026-10-03T01:10:00Z', 30)
        self.assertEqual(result['sunlight_percent'], 42.9)

    def test_reduced_rotation_matches_original_geometry(self):
        theta = 0.4
        rotation = np.array([[np.cos(theta), -np.sin(theta), 0],
                             [np.sin(theta), np.cos(theta), 0], [0,0,1]])
        site = np.array([1000., 400., -1200.])
        vector = np.array([350000., -80000., 10000.])
        old_vector = rotation @ (vector - rotation.T @ site)
        new_vector = rotation @ vector - site
        np.testing.assert_allclose(old_vector, new_vector, atol=1e-8)
        np.testing.assert_allclose(engine._local_angles(old_vector, -40, 20),
                                   engine._local_angles(new_vector, -40, 20), atol=1e-10)


if __name__ == '__main__':
    unittest.main()
