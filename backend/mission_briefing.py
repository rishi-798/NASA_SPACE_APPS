"""Print-only planning briefing assembled from the existing analysis/provenance API."""
from datetime import datetime, timedelta, timezone
from html import escape
import math
from typing import Optional

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from backend.analysis import build_analysis, resolve_site
from backend.weather.meteomatics import SITES, launch_weather

router = APIRouter(prefix="/api/mission", tags=["dossier"])


class BriefingRequest(BaseModel):
    site_id: Optional[str] = Field(None, max_length=100)
    lat: Optional[float] = Field(None, ge=-90, le=90, allow_inf_nan=False)
    lon: Optional[float] = Field(None, ge=-180, le=180, allow_inf_nan=False)
    start: datetime
    end: Optional[datetime] = None
    step_minutes: int = Field(30, ge=1, le=1440)
    launch_site_id: Optional[str] = Field(None, max_length=100)
    launch_vehicle: Optional[str] = Field(None, max_length=100)
    liftoff_utc: Optional[datetime] = None
    mission_name: Optional[str] = Field(None, max_length=160)


def safe(value):
    return escape(str(value if value is not None else "Not supplied"), quote=True)


def visibility_chart(samples):
    if len(samples) < 2:
        return '<p>No visibility samples available.</p>'
    start = datetime.fromisoformat(samples[0]['time'].replace('Z', '+00:00'))
    end = datetime.fromisoformat(samples[-1]['time'].replace('Z', '+00:00'))
    duration = (end - start).total_seconds()
    if duration <= 0:
        return '<p>No visibility interval available.</p>'
    bars = []
    for row, body in enumerate(('sun', 'earth')):
        bars.append(f'<text x="0" y="{28 + row * 38}">{body.title()}</text>')
        for a, b in zip(samples, samples[1:]):
            left = (datetime.fromisoformat(a['time'].replace('Z', '+00:00')) - start).total_seconds() / duration
            width = (datetime.fromisoformat(b['time'].replace('Z', '+00:00')) - datetime.fromisoformat(a['time'].replace('Z', '+00:00'))).total_seconds() / duration
            color = '#187c70' if a[body]['visible'] else '#c7cdd4'
            bars.append(f'<rect x="{80 + left * 620:.2f}" y="{10 + row * 38}" width="{width * 620:.2f}" height="24" fill="{color}"/>')
    return '<svg role="img" aria-label="Sampled Sun and Earth visibility across analysis window" viewBox="0 0 720 95">' + ''.join(bars) + '</svg><p class="caption">Green: visible · gray: obstructed. Left to right: window start to end. State held per sample interval; transitions are limited by sampling cadence.</p>'


def horizon_chart(profile):
    if not profile:
        return '<p class="notice">No measured horizon profile available. A flat-horizon result does not assess terrain obstruction.</p>'
    angles = profile['horizon']
    low, high = min(0, min(angles)), max(5, max(angles))
    points = []
    for i, value in enumerate(angles):
        theta = math.radians(i * profile['azimuth_step'])
        radius = 20 + 105 * (value - low) / (high - low)
        points.append(f'{160 + radius * math.sin(theta):.2f},{150 - radius * math.cos(theta):.2f}')
    return f'''<svg role="img" aria-label="LOLA polar terrain horizon, {len(angles)} bins" viewBox="0 0 320 310">
    <circle cx="160" cy="150" r="125" fill="none" stroke="#bcc6d0"/><circle cx="160" cy="150" r="72.5" fill="none" stroke="#dbe1e7"/>
    <path d="M160 25V275M35 150H285" stroke="#dbe1e7"/><polygon points="{' '.join(points)}" fill="#187c7033" stroke="#187c70" stroke-width="1"/>
    <g text-anchor="middle"><text x="160" y="17">N / 0°</text><text x="300" y="155">E</text><text x="160" y="294">S / 180°</text><text x="20" y="155">W</text></g></svg>
    <p class="caption">{len(angles)} bins · {safe(profile['azimuth_step'])}° azimuth spacing. Radial elevation scale: {low:.1f}° (inner 20 px) to {high:.1f}° (outer ring). Observer height: {safe(profile.get('observer_height_m'))} m. Terrain profile, not an elevation map.</p>'''


def render_briefing(request, analysis, weather=None, weather_notice=None):
    site, summary, provenance = analysis['site'], analysis['summary'], analysis['provenance']
    pad = SITES.get(request.launch_site_id, {})
    pad_name = f"{pad.get('name')} / {pad.get('pad')}" if pad else 'Not supplied (Explorer-only briefing)'
    weather_html = f'<p>{safe(weather_notice or "No launch pad selected.")}</p>'
    if weather:
        target = request.liftoff_utc or datetime.now(timezone.utc)
        if weather['samples'] and datetime.fromisoformat(weather['start'].replace('Z', '+00:00')) <= target <= datetime.fromisoformat(weather['end'].replace('Z', '+00:00')):
            sample = min(weather['samples'], key=lambda s: abs((datetime.fromisoformat(s['time'].replace('Z', '+00:00')) - target).total_seconds()))
            def measurement(key, unit):
                return 'Unavailable' if sample.get(key) is None else f"{sample[key]:g} {unit}"
            weather_html = f"<p>Meteomatics · valid {safe(sample['time'])} · fetched {safe(weather['fetched_at'])}</p><p>10 m wind: {measurement('wind_speed_ms', 'm/s')} · 2 m temperature: {measurement('temperature_c', '°C')} · cloud cover: {measurement('cloud_cover_pct', '%')}</p>"
        else:
            weather_html = '<p>No forecast for the requested liftoff epoch within the current 24-hour provider window.</p>'
    kernels = ''.join(f"<tr><td>{safe(k['filename'])}<br>{safe(k.get('role'))}</td><td class='hash'>{safe(k.get('sha256'))}</td><td>{safe(k.get('integrity'))}<br>Present: {safe(k.get('present'))}</td></tr>" for k in provenance.get('kernel_details', {}).get('files', []))
    warnings = ''.join(f'<li>{safe(w)}</li>' for w in analysis.get('warnings', []))
    limitations = ''.join(f'<li>{safe(w)}</li>' for w in provenance.get('limitations', []))
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Flight Readiness Dossier</title>
    <style>@page{{size:A4;margin:14mm}}*{{box-sizing:border-box}}body{{font:14px/1.5 system-ui,sans-serif;color:#172a3a;background:white;max-width:920px;margin:auto;overflow-wrap:anywhere;padding:28px}}h1{{font-size:29px;margin:10px 0}}h2{{font-size:19px;border-bottom:1px solid #b7c5cd;padding-bottom:8px}}header{{border-bottom:4px solid #187c70}}.eyebrow{{letter-spacing:.15em;font-size:11px}}section{{margin:24px 0}}dl{{display:grid;grid-template-columns:180px 1fr;gap:8px}}dt{{color:#4b616f}}dd{{margin:0;overflow-wrap:anywhere}}.notice{{border-left:4px solid #b67a23;padding:12px;background:#fff7e7}}.metrics{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}.metrics p{{border:1px solid #c7d4db;padding:12px;margin:0}}svg{{max-width:100%;max-height:310px;display:block}}svg text{{font:12px sans-serif}}.caption,small{{font-size:11px;color:#465c69}}table{{width:100%;border-collapse:collapse;font-size:10px}}td,th{{border:1px solid #c7d4db;padding:7px;text-align:left;vertical-align:top}}.hash{{font:10px monospace;overflow-wrap:anywhere;max-width:240px}}footer{{border-top:1px solid #c7d4db;font-size:11px}}@media print{{body{{padding:0;font-size:11px}}h1{{font-size:25px}}section, tr, .metrics{{break-inside:avoid}}.audit{{break-before:page}}a{{color:inherit}}}}</style></head><body>
    <header><p class="eyebrow">CLPS LUNAR BROWSER · NASA SPACE APPS PROJECT</p><h1>Flight Readiness Dossier</h1><p>{safe(request.mission_name or site['name'])}</p></header>
    <p class="notice">Planning prototype — not a flight readiness certification, launch clearance, thermal simulation, or communications link budget.</p>
    <section><h2>Mission parameters</h2><dl><dt>Launch pad</dt><dd>{safe(pad_name)}</dd><dt>Liftoff UTC</dt><dd>{safe(request.liftoff_utc.isoformat() if request.liftoff_utc else None)}</dd><dt>Launch vehicle</dt><dd>{safe(request.launch_vehicle)}</dd><dt>Destination</dt><dd>{safe(site['name'])} · {safe(site['latitude'])}°, {safe(site['longitude'])}° east</dd><dt>Lunar observation window</dt><dd>{safe(analysis['request']['start'])} → {safe(analysis['request']['end'])}</dd><dt>Sampling</dt><dd>{safe(analysis['request']['step_minutes'])} minutes · {len(analysis['samples'])} samples</dd></dl></section>
    <section><h2>Earth launch weather</h2>{weather_html}<p class="caption">Forecast at approximate pad coordinates, distinct from lunar conditions and observation time. Missing provider credentials or unavailable fields are reported explicitly.</p></section>
    <section><h2>Sunlight &amp; direct-to-Earth windows</h2><div class="metrics"><p>Sunlight: <strong>{safe(summary['sunlight_percent'])}%</strong></p><p>Earth visible: <strong>{safe(summary['earth_visible_percent'])}%</strong></p><p>Longest darkness: <strong>{safe(summary['longest_darkness_minutes'])} min</strong></p><p>Longest Earth blackout: <strong>{safe(summary['longest_comm_blackout_minutes'])} min</strong></p></div>{visibility_chart(analysis['samples'])}<p>{safe(analysis['terrain']['message'])}</p><ul>{warnings}</ul></section>
    <section><h2>LOLA horizon obstruction</h2>{horizon_chart(analysis.get('horizon'))}<p class="caption">Terrain source metadata: {safe(provenance.get('terrain_source'))}</p></section>
    <section class="audit"><h2>Kernel &amp; provenance audit</h2><p>Frame: {safe(provenance.get('frame'))} · Engine: {safe(provenance.get('engine'))}</p><p>Hashes below are from the runtime manifest used by the kernel loader. Integrity status is reported per file, including missing manifest entries.</p><table><thead><tr><th>Kernel / role</th><th>SHA-256</th><th>Runtime status</th></tr></thead><tbody>{kernels}</tbody></table><h2>Model limits</h2><ul>{limitations}</ul><p>PSR outlines, local subsurface temperature, water abundance, and drilling depth are not inferred by this report.</p></section>
    <footer>Generated {safe(datetime.now(timezone.utc).isoformat())} · <a href="https://github.com/rishi-798/NASA_SPACE_APPS">Open-source implementation and data citations</a> · <a href="https://naif.jpl.nasa.gov/naif/">JPL NAIF SPICE</a> · <a href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm">LRO LOLA</a></footer></body></html>'''


@router.post('/briefing/html', response_class=HTMLResponse)
def generate_briefing(request: BriefingRequest):
    if any(value is not None and value.tzinfo is None for value in (request.start, request.end, request.liftoff_utc)):
        raise HTTPException(422, 'Use explicit UTC or timezone offsets for observation and liftoff times.')
    if (request.lat is None) != (request.lon is None) or (request.lat is None and not request.site_id):
        raise HTTPException(422, 'Supply a site ID or both destination coordinates.')
    if request.launch_site_id and request.launch_site_id not in SITES:
        raise HTTPException(422, 'Unknown launch pad.')
    start = request.start.astimezone(timezone.utc)
    try:
        effective_site_id = request.site_id if request.lat is None else None
        if request.site_id and request.lat is not None:
            try:
                canonical = resolve_site(request.site_id, None, None)
                if abs(canonical['latitude'] - request.lat) < 1e-8 and abs(canonical['longitude'] - request.lon) < 1e-8:
                    effective_site_id = request.site_id
            except (ValueError, KeyError):
                pass  # Trip destinations outside the analysis catalogue still use exact coordinates.
        analysis = build_analysis(site_id=effective_site_id, lat=None if effective_site_id else request.lat, lon=None if effective_site_id else request.lon,
            start=start.isoformat(), end=(request.end.astimezone(timezone.utc) if request.end else start + timedelta(hours=24)).isoformat(), step_minutes=request.step_minutes,
            allow_flat_fallback=True, name=request.mission_name)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    weather, notice = None, None
    if request.launch_site_id:
        try:
            weather = launch_weather(request.launch_site_id, Response(), include_cloud=True)
        except HTTPException as exc:
            notice = f'Weather unavailable: {exc.detail}'
    return HTMLResponse(render_briefing(request, analysis, weather, notice), headers={'Cache-Control': 'no-store'})
