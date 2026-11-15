export type TransferInput = {departureUtc: string; arrivalUtc: string; parkingAltitudeKm: number};
export type TransferSample = {time: string; elapsed_seconds: number; spacecraft_position_km: number[];
  spacecraft_velocity_km_s: number[]; moon_position_km: number[]; moon_velocity_km_s: number[];
  sun_direction: number[]; earth_orientation: number[]; moon_orientation: number[]};
export type TransferResult = {
  schema_version: 1; model: string; frame: string;
  request: {departure_utc: string; arrival_utc: string; parking_altitude_km: number};
  arrival_target: {definition: string; altitude_km: number; position_km: number[]; is_capture_or_landing: false};
  summary: {flight_duration_hours: number; departure_earth_moon_distance_km: number; arrival_earth_moon_distance_km: number;
    moon_motion_degrees: number; injection_delta_v_km_s: number; arrival_moon_relative_speed_km_s: number;
    endpoint_error_km: number; minimum_earth_altitude_km: number; sampled_moon_clearance_km: number;
    parking_phase_angle_degrees: number; candidate_count: number; max_relative_energy_drift: number;
    max_relative_angular_momentum_drift: number};
  constants: {earth_radius_km: number; moon_radius_km: number; earth_mu_km3_s2: number};
  samples: TransferSample[]; limitations: string[];
  provenance: {ephemeris: string; propagator: string; constants_source: string; parking_phase_search: string; solver: string};
};

export function transferKey(input: TransferInput) {
  return JSON.stringify([input.departureUtc, input.arrivalUtc, input.parkingAltitudeKm]);
}
export function transferInputError(input: TransferInput): string | null {
  const explicit = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (![input.departureUtc, input.arrivalUtc].every(t => explicit.test(t) && Number.isFinite(Date.parse(t)) && new Date(`${t.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10) === t.slice(0,10))) return 'Choose valid departure and arrival times in UTC.';
  const hours = (Date.parse(input.arrivalUtc)-Date.parse(input.departureUtc))/3600000;
  if (hours < 24 || hours > 240) return 'Arrival must be 24–240 hours after transfer departure.';
  if (!Number.isFinite(input.parkingAltitudeKm) || input.parkingAltitudeKm < 160 || input.parkingAltitudeKm > 2000) return 'Parking altitude must be between 160 and 2,000 km.';
  return null;
}
const vector = (value: unknown, size: number) => Array.isArray(value) && value.length === size && value.every(v => typeof v === 'number' && Number.isFinite(v));
export function validTransfer(body: TransferResult, input: TransferInput): boolean {
  if (!body || body.schema_version !== 1 || typeof body.model !== 'string' || typeof body.frame !== 'string' || !body.request || !body.summary || !body.constants || !body.provenance
      || Date.parse(body.request.departure_utc) !== Date.parse(input.departureUtc)
      || Date.parse(body.request.arrival_utc) !== Date.parse(input.arrivalUtc)
      || body.request.parking_altitude_km !== input.parkingAltitudeKm
      || body.arrival_target?.is_capture_or_landing !== false || !vector(body.arrival_target.position_km, 3)
      || !Number.isFinite(body.arrival_target.altitude_km) || body.arrival_target.altitude_km <= 0
      || typeof body.arrival_target.definition !== 'string'
      || !['ephemeris','propagator','parking_phase_search','solver'].every(k=>typeof body.provenance[k as keyof TransferResult['provenance']] === 'string')
      || body.provenance.constants_source !== 'https://ssd.jpl.nasa.gov/astro_par.html'
      || !Array.isArray(body.limitations) || !body.limitations.every(t => typeof t === 'string')
      || !Array.isArray(body.samples) || body.samples.length !== 257) return false;
  const metrics = ['flight_duration_hours', 'departure_earth_moon_distance_km', 'arrival_earth_moon_distance_km',
    'moon_motion_degrees', 'injection_delta_v_km_s', 'arrival_moon_relative_speed_km_s', 'endpoint_error_km',
    'minimum_earth_altitude_km', 'sampled_moon_clearance_km', 'parking_phase_angle_degrees', 'candidate_count',
    'max_relative_energy_drift', 'max_relative_angular_momentum_drift'] as const;
  if (!metrics.every(k => typeof body.summary[k] === 'number' && Number.isFinite(body.summary[k]))
      || !['earth_radius_km','moon_radius_km','earth_mu_km3_s2'].every(k=>{const v=body.constants[k as keyof TransferResult['constants']];return typeof v === 'number' && Number.isFinite(v) && v > 0;})
      || body.summary.endpoint_error_km < 0 || body.summary.endpoint_error_km > .01 || body.summary.minimum_earth_altitude_km < 120) return false;
  const start = Date.parse(input.departureUtc), end = Date.parse(input.arrivalUtc);
  return body.samples.every((s, i) => Number.isFinite(Date.parse(s.time)) && Math.abs(Date.parse(s.time)-(start+(end-start)*i/256)) < 2000
    && Number.isFinite(s.elapsed_seconds) && s.elapsed_seconds >= 0
    && ['spacecraft_position_km', 'spacecraft_velocity_km_s', 'moon_position_km', 'moon_velocity_km_s', 'sun_direction'].every(k => vector(s[k as keyof TransferSample], 3))
    && vector(s.earth_orientation, 9) && vector(s.moon_orientation, 9));
}

export async function getTransfer(input: TransferInput, signal: AbortSignal): Promise<TransferResult> {
  const error = transferInputError(input);
  if (error) throw new Error(error);
  const base = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  const response = await fetch(`${base}/api/transfer/calculate`, {method:'POST', signal,
    headers:{'Content-Type':'application/json', Accept:'application/json'},
    body:JSON.stringify({departure_utc:input.departureUtc, arrival_utc:input.arrivalUtc, parking_altitude_km:input.parkingAltitudeKm})});
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Transfer calculation is unavailable. Please retry.');
  if (!validTransfer(body, input)) throw new Error('Transfer response was incomplete or did not match the requested dates.');
  return body;
}
