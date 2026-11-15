export type WeatherSample = {
  time: string;
  temperature_c: number | null;
  wind_speed_ms: number | null;
  precipitation_mm: number | null;
  cloud_cover_pct?: number | null;
};
export type LaunchWeather = {
  site_id: string;
  site_name: string;
  latitude: number;
  longitude: number;
  provider: string;
  fetched_at: string;
  generated_at: string | null;
  start: string;
  end: string;
  partial: boolean;
  note: string;
  samples: WeatherSample[];
};

export async function getLaunchWeather(siteId: string, signal: AbortSignal): Promise<LaunchWeather> {
  const base = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/api/weather/launch-sites/${encodeURIComponent(siteId)}?include_cloud=true`, {signal, headers: {Accept: 'application/json'}});
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Launch-site weather cannot be reached. Please retry.', {cause: error});
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Launch-site weather is unavailable.');
  if (!body || body.site_id !== siteId || !Array.isArray(body.samples) || body.samples.length !== 25
      || !body.samples.every((sample: WeatherSample) => typeof sample.time === 'string' && Number.isFinite(Date.parse(sample.time))
        && [sample.temperature_c, sample.wind_speed_ms, sample.precipitation_mm].every(value => value === null || (typeof value === 'number' && Number.isFinite(value)))
        && (sample.cloud_cover_pct == null || (Number.isFinite(sample.cloud_cover_pct) && sample.cloud_cover_pct >= 0 && sample.cloud_cover_pct <= 100)))) {
    throw new Error('Launch-site weather returned invalid data. Please retry.');
  }
  return body as LaunchWeather;
}
