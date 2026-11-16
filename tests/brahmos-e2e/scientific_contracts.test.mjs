import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = (process.env.BRAHMOS_BASE_URL || 'https://brahm0s.earth').replace(/\/$/, '');

async function fetchJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, json, text };
}

test('WP-D0: /build-info.json and /api/ready report deployed metadata, verified SPICE kernels, and pinned HF terrain release', async () => {
  const buildInfo = await fetchJson('/build-info.json');
  assert.equal(buildInfo.status, 200);
  assert.match(buildInfo.json.source_commit, /^[0-9a-f]{40}$/);
  assert.ok(Date.parse(buildInfo.json.built_at_utc));

  const ready = await fetchJson('/api/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.json.ready, true);
  assert.equal(ready.json.calculations.available, true);

  const expectedKernels = [
    'naif0012.tls',
    'de440s.bsp',
    'pck00011.tpc',
    'moon_pa_de440_200625.bpc',
    'moon_de440_220930.tf',
  ];
  const presentKernels = ready.json.calculations.kernels.map((k) => k.filename);
  for (const name of expectedKernels) {
    assert.ok(presentKernels.includes(name), `Expected SPICE kernel ${name} in /api/ready`);
  }
  assert.ok(
    ready.json.calculations.kernels.every((k) => k.present === true && k.integrity === 'verified against manifest'),
    'All kernels should report present=true and verified integrity',
  );

  assert.equal(ready.json.cloud_terrain.remote_cog_configured, true);
  assert.equal(ready.json.cloud_terrain.remote_host, 'huggingface.co');
  assert.equal(ready.json.cloud_terrain.release_pinned, true);
});

test('WP-D1: named-site SPICE /api/analysis preserves schema, units, provenance, and matches single-epoch /visibility', async () => {
  const analysisRes = await fetchJson(
    '/api/analysis?site_id=athena-im2&start=2026-10-23T12:00:00Z&end=2026-10-23T13:00:00Z&step_minutes=60',
  );
  assert.equal(analysisRes.status, 200);
  const body = analysisRes.json;

  assert.equal(body.schema_version, 1);
  assert.equal(body.site.id, 'athena-im2');
  assert.equal(body.site.latitude, -84.79);
  assert.equal(body.site.longitude, 29.2);
  assert.equal(body.site.terrain_status, 'profile_loaded');
  assert.equal(body.request.sample_count, 2);
  assert.equal(body.samples.length, 2);

  // Check provenance frames, units, observer model, and non-sample flag
  assert.ok(body.provenance.frame.includes('MOON_ME_DE440_ME421'));
  assert.ok(body.provenance.coordinates.includes('East-positive'));
  assert.ok(body.provenance.angles.includes('Azimuth clockwise from local north'));
  assert.equal(body.provenance.horizon_mode, 'LOLA terrain');
  assert.equal(body.provenance.sample_values, false);
  assert.equal(body.horizon.datum_radius_m, 1737400.0);
  assert.equal(body.horizon.horizon.length, 720);

  const sample0 = body.samples[0];
  assert.equal(sample0.time, '2026-10-23T12:00:00Z');
  for (const target of ['sun', 'earth']) {
    assert.ok(sample0[target].azimuth >= 0 && sample0[target].azimuth < 360);
    assert.ok(sample0[target].elevation >= -90 && sample0[target].elevation <= 90);
    assert.ok(sample0[target].distance_km > 0);
    assert.equal(typeof sample0[target].visible, 'boolean');
    assert.equal(typeof sample0[target].terrain_horizon, 'number');
    // Verify clearance math matches elevation - terrain_horizon within float precision
    assert.ok(
      Math.abs(sample0[target].terrain_clearance - (sample0[target].elevation - sample0[target].terrain_horizon)) < 1e-9,
    );
  }

  // Compare single-epoch /visibility against /api/analysis at the exact same epoch, frame, and site coordinates
  const visRes = await fetchJson('/api/sites/athena-im2/visibility?time=2026-10-23T12:00:00Z');
  assert.equal(visRes.status, 200);
  assert.equal(visRes.json.latitude, body.site.latitude);
  assert.equal(visRes.json.longitude, body.site.longitude);
  assert.ok(Math.abs(visRes.json.sun.azimuth - sample0.sun.azimuth) < 1e-6);
  assert.ok(Math.abs(visRes.json.sun.elevation - sample0.sun.elevation) < 1e-6);
  assert.ok(Math.abs(visRes.json.earth.azimuth - sample0.earth.azimuth) < 1e-6);
  assert.ok(Math.abs(visRes.json.earth.elevation - sample0.earth.elevation) < 1e-6);
});

test('WP-D2: regional terrain catalogue and local-scene preserve query coordinates and vertical datum', async () => {
  const lat = 38.315;
  const lon = -35.0081;
  const catRes = await fetchJson(`/api/terrain/catalogue?lat=${lat}&lon=${lon}`);
  assert.equal(catRes.status, 200);
  const cat = catRes.json;

  assert.equal(cat.latitude, lat);
  assert.ok(
    Math.abs(cat.longitude - lon) < 1e-12,
    `Expected longitude near ${lon}, got ${cat.longitude}`,
  );
  assert.equal(cat.local_elevation_files, 41);
  assert.equal(cat.expected_elevation_files, 41);
  assert.equal(cat.statistics.coordinate_frame, 'ME/DE421');
  assert.equal(cat.statistics.vertical_reference_radius_m, 1737400.0);
  assert.equal(typeof cat.point_elevation_m, 'number');
  assert.equal(cat.point_terrain.vertical_reference_radius_m, 1737400.0);

  const sceneRes = await fetchJson(`/api/terrain/local-scene?lat=${lat}&lon=${lon}`);
  assert.equal(sceneRes.status, 200);
  assert.ok(sceneRes.json.available === true || sceneRes.json.scene !== undefined);
});

test('WP-D3: launch weather works without visitor login, respects include_cloud toggle, and leaks no credentials', async () => {
  const withCloud = await fetchJson('/api/weather/launch-sites/kennedy-39a?include_cloud=true');
  assert.ok([200, 502, 503].includes(withCloud.status), `Unexpected HTTP status ${withCloud.status}`);

  // Guard against credential/token leakage in any response status
  const lowered = withCloud.text.toLowerCase();
  for (const forbidden of ['authorization', 'bearer ', 'password', 'meteomatics_user', 'secret']) {
    assert.equal(lowered.includes(forbidden), false, `Response must not expose '${forbidden}'`);
  }

  if (withCloud.status === 200) {
    const w = withCloud.json;
    assert.equal(w.site_id, 'kennedy-39a');
    assert.equal(w.provider, 'Meteomatics');
    assert.ok(Date.parse(w.fetched_at));
    assert.ok(Date.parse(w.start));
    assert.ok(Date.parse(w.end));
    assert.equal(w.samples.length, 25, '24h hourly window (0..24h inclusive) yields 25 samples');

    const first = w.samples[0];
    assert.ok('temperature_c' in first && 'wind_speed_ms' in first && 'precipitation_mm' in first && 'cloud_cover_pct' in first);
    assert.ok(typeof w.partial === 'boolean');

    // Verify include_cloud=false behavior omits or nulls optional cloud cover
    const withoutCloud = await fetchJson('/api/weather/launch-sites/kennedy-39a?include_cloud=false');
    assert.equal(withoutCloud.status, 200);
    assert.equal(withoutCloud.json.samples.length, 25);
    assert.equal(withoutCloud.json.samples[0].cloud_cover_pct, null);
  }
});
