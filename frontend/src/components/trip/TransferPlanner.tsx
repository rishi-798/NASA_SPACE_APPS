import {lazy, Suspense, useEffect, useRef, useState} from 'react';
import {createRequestGate} from '../../lib/requestGate';
import {getTransfer, transferInputError, transferKey, type TransferInput, type TransferResult} from '../../lib/transfer';
const Viewer = lazy(()=>import('./TransferTrajectoryViewer').then(module=>({default:module.TransferTrajectoryViewer})));

type Props = {input: TransferInput; onDeparture: (time: string)=>void; onArrival: (time: string)=>void;
  onAltitude: (value: number)=>void; frozen?: boolean};
export function TransferPlanner({input,onDeparture,onArrival,onAltitude,frozen=false}: Props) {
  const [altitudeText,setAltitudeText] = useState(String(input.parkingAltitudeKm));
  const effectiveInput = {...input,parkingAltitudeKm:altitudeText.trim() ? Number(altitudeText) : NaN};
  const key = transferKey(effectiveInput);
  const gate = useRef(createRequestGate());
  const [response,setResponse] = useState<{key:string;data?:TransferResult;loading?:boolean;error?:string}|null>(null);
  const current = response?.key === key ? response : null;
  const problem = transferInputError(effectiveInput);
  // Both navigation/unmount and any parameter change invalidate the in-flight response.
  useEffect(()=>()=>gate.current.invalidate(),[key]);
  const calculate = async () => {
    if (problem) return;
    const ticket=gate.current.begin();setResponse({key,loading:true});
    try {
      const data=await getTransfer(effectiveInput,ticket.signal);
      if (ticket.current()) setResponse({key,data});
    } catch (error) {
      if (ticket.current()) setResponse({key,error:error instanceof Error?error.message:'Transfer calculation failed.'});
    }
  };
  const data=current?.data;
  return <section className="transfer-planner" aria-labelledby="transfer-title">
    <header><p className="trip-section-label">Calendar-based Earth–Moon flight model</p><h2 id="transfer-title">Preliminary two-body transfer</h2>
      <p>An Earth-gravity-only trajectory targeting the Moon’s future SPICE position. Lunar and Solar perturbations are omitted; rocket and launch-pad feasibility are not assessed.</p></header>
    <div className="transfer-inputs">
      <label className="trip-field">Transfer departure (UTC)<input aria-label="Transfer departure (UTC)" type="datetime-local" disabled={frozen} value={input.departureUtc.slice(0,16)} onChange={e=>{if(e.target.value)onDeparture(`${e.target.value}:00Z`);}} /></label>
      <label className="trip-field">Lunar arrival / observation (UTC)<input aria-label="Lunar arrival / observation (UTC)" type="datetime-local" disabled={frozen} value={input.arrivalUtc.slice(0,16)} onChange={e=>{if(e.target.value)onArrival(`${e.target.value}:00Z`);}} /></label>
      <label className="trip-field">Circular parking altitude (km)<input aria-label="Circular parking altitude (km)" type="number" min={160} max={2000} step={10} disabled={frozen} value={altitudeText} onChange={e=>{setAltitudeText(e.target.value); const n=e.target.valueAsNumber; if(Number.isFinite(n)&&n>=160&&n<=2000)onAltitude(n);}} /></label>
    </div>
    <p className="trip-note">Departure means the injection burn from an assumed Earth parking orbit, not launch-pad liftoff. Choose a 24–240 hour flight. The assumed orbit lies in the Moon’s orbital plane at arrival; its departure phase is selected freely. Reaching it from the chosen pad is not solved. {frozen && 'Use “Edit mission dates” to change these inputs.'}</p>
    {problem && <p className="trip-error" role="alert">{problem}</p>}
    <button type="button" className="trip-primary" disabled={!!problem||current?.loading} onClick={()=>void calculate()}>{current?.loading?'Solving date-based transfer…':data?'Recalculate transfer':'Calculate Earth–Moon transfer'}</button>
    {current?.loading && <p role="status">Solving bounded Lambert candidates and verifying the result with SPICE propagation…</p>}
    {current?.error && <p className="trip-error" role="alert">{current.error}</p>}
    {!data && !current?.loading && <p className="trip-note">No calculated flight path is displayed until a valid solution is returned.</p>}
    {data && <>
      <p className="transfer-target">Arrival target: an Earth-facing point <strong>{data.arrival_target.altitude_km.toLocaleString()} km above the Moon’s mean radius</strong> at {data.request.arrival_utc}. This is separate from the selected surface coordinate; capture and descent are not calculated.</p>
      <dl className="transfer-metrics">
        <div><dt>Flight duration</dt><dd>{data.summary.flight_duration_hours.toFixed(2)} h</dd></div>
        <div><dt>Earth–Moon distance at departure</dt><dd>{data.summary.departure_earth_moon_distance_km.toLocaleString(undefined,{maximumFractionDigits:0})} km</dd></div>
        <div><dt>Earth–Moon distance at arrival</dt><dd>{data.summary.arrival_earth_moon_distance_km.toLocaleString(undefined,{maximumFractionDigits:0})} km</dd></div>
        <div><dt>Moon movement during flight</dt><dd>{data.summary.moon_motion_degrees.toFixed(2)}°</dd></div>
        <div><dt>Estimated injection Δv</dt><dd>{data.summary.injection_delta_v_km_s.toFixed(3)} km/s</dd></div>
        <div><dt>Moon-relative speed at reference point</dt><dd>{data.summary.arrival_moon_relative_speed_km_s.toFixed(3)} km/s</dd></div>
        <div><dt>Numerical endpoint error</dt><dd>{data.summary.endpoint_error_km < .000001 ? '<0.001' : (data.summary.endpoint_error_km*1000).toFixed(3)} m</dd></div>
        <div><dt>Minimum Earth altitude on model arc</dt><dd>{data.summary.minimum_earth_altitude_km.toFixed(1)} km</dd></div>
      </dl>
      <Suspense fallback={<p role="status">Opening the calculated trajectory…</p>}><Viewer key={key} data={data} /></Suspense>
      <details><summary>Assumptions, provenance and numerical checks</summary>
        <ul>{data.limitations.map(note=><li key={note}>{note}</li>)}</ul>
        <p>{data.frame}. Ephemeris: {data.provenance.ephemeris}. Propagator: {data.provenance.propagator}.</p>
        <p>{data.provenance.parking_phase_search}. Selected phase: {data.summary.parking_phase_angle_degrees}°. {data.summary.candidate_count} admissible candidates.</p>
        <p>Maximum relative energy drift: {data.summary.max_relative_energy_drift.toExponential(2)}; angular-momentum drift: {data.summary.max_relative_angular_momentum_drift.toExponential(2)}. Endpoint error measures numerical closure within this approximation, not real-world arrival accuracy.</p>
        <a href={data.provenance.constants_source} target="_blank" rel="noreferrer">JPL constants and data reference</a>
      </details>
    </>}
  </section>;
}
