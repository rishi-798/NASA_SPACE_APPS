import test from 'node:test';
import assert from 'node:assert/strict';
import {getLaunchWeather} from '../frontend/src/lib/launchWeather.ts';

const forecast = () => ({site_id:'kennedy-39a', samples:Array.from({length:25}, (_, i) => ({
  time:new Date(Date.UTC(2026,10,14,i)).toISOString(), temperature_c:22, wind_speed_ms:4.2, precipitation_mm:0, cloud_cover_pct:35,
}))});
async function withFetch(handler, action) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {await action();} finally {globalThis.fetch = original;}
}
test('Launch weather requests cloud cover through the backend, with no provider credentials', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, '/api/weather/launch-sites/kennedy-39a?include_cloud=true');
    assert.equal(options.headers.Authorization, undefined);
    return Response.json(forecast());
  }, async () => {
    const result = await getLaunchWeather('kennedy-39a', new AbortController().signal);
    assert.equal(result.samples[0].cloud_cover_pct, 35);
    assert.equal(result.samples[0].precipitation_mm, 0);
  });
});
test('Cloud subscription fallback remains usable; invalid cloud percentages are rejected', async () => {
  const body = forecast();
  for (const cloud of [undefined, null, 0, 100, 101, -1, 'cloudy']) {
    for (const sample of body.samples) sample.cloud_cover_pct = cloud;
    await withFetch(async () => Response.json(body), async () => {
      const request = getLaunchWeather('kennedy-39a', new AbortController().signal);
      if ([undefined, null, 0, 100].includes(cloud)) assert.equal((await request).samples.length, 25);
      else await assert.rejects(request, /invalid data/);
    });
  }
});
test('Backend setup and provider errors remain visible to the user', async () => {
  await withFetch(async () => Response.json({detail:'Launch-site weather is not connected yet.'}, {status:503}), async () => {
    await assert.rejects(getLaunchWeather('kennedy-39a', new AbortController().signal), /not connected yet/);
  });
});
