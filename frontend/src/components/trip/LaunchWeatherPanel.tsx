import { useEffect, useRef, useState } from 'react';
import { getLaunchWeather, type LaunchWeather } from '../../lib/launchWeather';

const formatTime = (value: string) => new Intl.DateTimeFormat('en', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hourCycle: 'h23',
}).format(new Date(value));
const reading = (value: number | null, unit: string) => value === null ? 'Unavailable' : `${value.toFixed(1)} ${unit}`;

const revealRows = [
  ['Temperature at 2 m', 'temperature_c', '°C'],
  ['Wind speed at 10 m', 'wind_speed_ms', 'm/s'],
  ['Cloud cover', 'cloud_cover_pct', '%'],
  ["Preceding hour’s precipitation", 'precipitation_mm', 'mm'],
] as const;

export function LaunchWeatherPanel({ siteId, liftoffUtc }: { siteId: string; liftoffUtc: string }) {
  const [weather, setWeather] = useState<LaunchWeather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current?.abort();
    setWeather(null); setError(''); setRevealed(0); setLoadingStep(0);
    if (!liftoffUtc || !Number.isFinite(Date.parse(`${liftoffUtc}:00Z`))) { setLoading(false); return; }
    const controller = new AbortController();
    active.current = controller;
    const timeout = window.setTimeout(() => controller.abort('timeout'), 35000);
    setLoading(true);
    const stepTimer = window.setInterval(() => setLoadingStep(step => Math.min(step + 1, 2)), 850);
    void (async () => {
      try {
        const result = await getLaunchWeather(siteId, controller.signal);
        if (!controller.signal.aborted) setWeather(result);
      } catch (cause) {
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
          setError(controller.signal.reason === 'timeout' ? 'Weather request timed out. Change the date or time to try again.' : cause instanceof Error ? cause.message : 'Weather unavailable. Change the date or time to try again.');
        }
      } finally {
        window.clearTimeout(timeout); window.clearInterval(stepTimer);
        if (active.current === controller) setLoading(false);
      }
    })();
    return () => { window.clearTimeout(timeout); window.clearInterval(stepTimer); controller.abort(); };
  }, [siteId, liftoffUtc]);
  useEffect(() => {
    if (!weather) return;
    setRevealed(0);
    const timer = window.setInterval(() => setRevealed(count => {
      if (count >= revealRows.length) { window.clearInterval(timer); return count; }
      return count + 1;
    }), 420);
    return () => window.clearInterval(timer);
  }, [weather]);
  const first = weather?.samples[0];
  return <section className="launch-weather" aria-label="Launch-site weather" aria-busy={loading}>
    <p className="trip-section-label">Earth departure / Meteomatics</p>
    <h3>Launch-site weather</h3>
    <p className="trip-note">Set a liftoff date and time to load the latest 24-hour forecast. Approximate pad location; not a launch clearance.</p>
    {!liftoffUtc && <p className="trip-weather-progress">Choose a liftoff date and time to load weather.</p>}
    {loading && <p className="trip-weather-progress" role="status" aria-live="polite">{['Connecting to the weather service…', 'Reading temperature, wind, and cloud cover…', 'Preparing the forecast…'][loadingStep]}</p>}
    {error && <p className="trip-notice" role="alert">{error}</p>}
    {weather && first && <>
      <p className="trip-note">{weather.site_name}<br /><time dateTime={weather.start}>{formatTime(weather.start)}</time> – <time dateTime={weather.end}>{formatTime(weather.end)}</time> UTC</p>
      <dl className="trip-stat-list" aria-live="polite">
        {revealRows.map(([label, field, unit], index) => revealed > index && <div className="trip-weather-reading" key={field} style={{ animationDelay: '0ms' }}><dt>{label}</dt><dd>{reading(first[field] ?? null, unit)}</dd></div>)}
      </dl>
      <p className="trip-note">First hourly forecast: {formatTime(first.time)} UTC. {weather.partial && 'Some readings are unavailable.'}</p>
      <details><summary>View hourly forecast</summary>
        <div className="launch-weather-table" tabIndex={0} role="region" aria-label="Hourly forecast table, scroll horizontally">
          <table><caption>Earth weather forecast · all times UTC</caption><thead><tr><th scope="col">UTC</th><th scope="col">°C</th><th scope="col">Wind m/s</th><th scope="col">Cloud %</th><th scope="col">Rain/snow water equivalent mm / 1 h</th></tr></thead>
            <tbody>{weather.samples.map(sample => <tr key={sample.time}><th scope="row"><time dateTime={sample.time}>{formatTime(sample.time)}</time></th><td>{reading(sample.temperature_c, '')}</td><td>{reading(sample.wind_speed_ms, '')}</td><td>{reading(sample.cloud_cover_pct ?? null, '')}</td><td>{reading(sample.precipitation_mm, '')}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
      <p className="trip-note">Fetched {formatTime(weather.fetched_at)} UTC. {weather.generated_at && `Provider generated ${formatTime(weather.generated_at)} UTC.`} Forecasts are cached for the current UTC hour.</p>
    </>}
    <a className="source-link" href="https://www.meteomatics.com/en/weather-api/" target="_blank" rel="noreferrer">Weather data: Meteomatics</a>
  </section>;
}
