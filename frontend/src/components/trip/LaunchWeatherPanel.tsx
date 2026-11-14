import { useEffect, useRef, useState } from 'react';
import { getLaunchWeather, type LaunchWeather } from '../../lib/launchWeather';

const formatTime = (value: string) => new Intl.DateTimeFormat('en', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hourCycle: 'h23',
}).format(new Date(value));
const reading = (value: number | null, unit: string) => value === null ? 'Unavailable' : `${value.toFixed(1)} ${unit}`;

export function LaunchWeatherPanel({ siteId }: { siteId: string }) {
  const [weather, setWeather] = useState<LaunchWeather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function load() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const timeout = window.setTimeout(() => controller.abort('timeout'), 20000);
    setLoading(true); setError(''); setWeather(null);
    try {
      const result = await getLaunchWeather(siteId, controller.signal);
      if (!controller.signal.aborted) setWeather(result);
    } catch (cause) {
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
        setError(controller.signal.reason === 'timeout' ? 'Weather request timed out. Please retry.' : cause instanceof Error ? cause.message : 'Weather unavailable. Please retry.');
      }
    } finally {
      window.clearTimeout(timeout);
      if (active.current === controller && (!controller.signal.aborted || controller.signal.reason === 'timeout')) setLoading(false);
    }
  }
  const first = weather?.samples[0];
  return <section className="launch-weather" aria-label="Launch-site weather" aria-busy={loading}>
    <p className="trip-section-label">Earth departure / Meteomatics</p>
    <h3>Launch-site weather</h3>
    <p className="trip-note">Latest 24-hour forecast, independent of your lunar observation date. Approximate pad location; not a launch clearance.</p>
    {loading && <p role="status">Fetching the hourly forecast…</p>}
    {error && <p className="trip-notice" role="alert">{error}</p>}
    {weather && first && <>
      <p className="trip-note">{weather.site_name}<br /><time dateTime={weather.start}>{formatTime(weather.start)}</time> – <time dateTime={weather.end}>{formatTime(weather.end)}</time> UTC</p>
      <dl className="trip-stat-list">
        <div><dt>Temperature at 2 m</dt><dd>{reading(first.temperature_c, '°C')}</dd></div>
        <div><dt>Wind speed at 10 m</dt><dd>{reading(first.wind_speed_ms, 'm/s')}</dd></div>
        <div><dt>Preceding hour’s precipitation</dt><dd>{reading(first.precipitation_mm, 'mm')}</dd></div>
      </dl>
      <p className="trip-note">First hourly forecast: {formatTime(first.time)} UTC. {weather.partial && 'Some readings are unavailable.'}</p>
      <details><summary>View hourly forecast</summary>
        <div className="launch-weather-table" tabIndex={0} role="region" aria-label="Hourly forecast table, scroll horizontally">
          <table><caption>Earth weather forecast · all times UTC</caption><thead><tr><th scope="col">UTC</th><th scope="col">°C</th><th scope="col">Wind m/s</th><th scope="col">Rain/snow water equivalent mm / 1 h</th></tr></thead>
            <tbody>{weather.samples.map(sample => <tr key={sample.time}><th scope="row"><time dateTime={sample.time}>{formatTime(sample.time)}</time></th><td>{reading(sample.temperature_c, '')}</td><td>{reading(sample.wind_speed_ms, '')}</td><td>{reading(sample.precipitation_mm, '')}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
      <p className="trip-note">Fetched {formatTime(weather.fetched_at)} UTC. {weather.generated_at && `Provider generated ${formatTime(weather.generated_at)} UTC.`} Forecasts are cached for the current UTC hour.</p>
    </>}
    <button className="trip-secondary" disabled={loading} onClick={() => void load()}>{loading ? 'Loading weather…' : error ? 'Retry weather' : weather ? 'Reload weather' : 'Load launch-site weather'}</button>
    <a className="source-link" href="https://www.meteomatics.com/en/weather-api/" target="_blank" rel="noreferrer">Weather data: Meteomatics</a>
  </section>;
}
