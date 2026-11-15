import type {TransferInput} from '../../lib/transfer';
import type {useTransferCalculation} from '../../lib/useTransferCalculation';

type Props = {input: TransferInput; altitudeText:string; calculation:ReturnType<typeof useTransferCalculation>;
  onDeparture: (time: string)=>void; onArrival: (time: string)=>void; onAltitudeText:(value:string)=>void; frozen?:boolean};
export function TransferPlanner({input,altitudeText,calculation,onDeparture,onArrival,onAltitudeText,frozen=false}:Props) {
  const {data,loading,error,problem,calculate}=calculation;
  return <section className="transfer-planner transfer-planner-compact" aria-labelledby="transfer-title">
    <header><p className="trip-section-label">Calculated mission animation</p><h2 id="transfer-title">Flight timing</h2>
      <p>The flight calculates and plays automatically when this section opens. The rocket animation uses an Earth-gravity-only trajectory targeting the Moon’s future SPICE position. Lunar and Solar perturbations are omitted; rocket and launch-pad feasibility are not assessed.</p></header>
    <div className="transfer-inputs">
      <label className="trip-field">Transfer departure (UTC)<input aria-label="Transfer departure (UTC)" type="datetime-local" disabled={frozen} value={input.departureUtc.slice(0,16)} onChange={e=>{if(e.target.value)onDeparture(`${e.target.value}:00Z`);}} /></label>
      <label className="trip-field">Lunar arrival / observation (UTC)<input aria-label="Lunar arrival / observation (UTC)" type="datetime-local" disabled={frozen} value={input.arrivalUtc.slice(0,16)} onChange={e=>{if(e.target.value)onArrival(`${e.target.value}:00Z`);}} /></label>
      <label className="trip-field">Circular parking altitude (km)<input aria-label="Circular parking altitude (km)" type="number" min={160} max={2000} step={10} disabled={frozen} value={altitudeText} onChange={e=>onAltitudeText(e.target.value)} /></label>
    </div>
    <p className="trip-note">Departure means the injection burn from an assumed Earth parking orbit, not launch-pad liftoff. Choose a 24–240 hour flight. The assumed orbit lies in the Moon’s orbital plane at arrival; its departure phase is selected freely. Reaching it from the chosen pad is not solved. {frozen && 'Use “Edit mission dates” to change these inputs.'}</p>
    {problem && <p className="trip-error" role="alert">{problem}</p>}
    <button type="button" className="trip-primary" disabled={!!problem||loading} onClick={()=>void calculate()}>{loading?'Solving date-based transfer…':data?'Recalculate transfer':'Calculate Earth–Moon transfer'}</button>
    {loading && <p role="status">Solving bounded Lambert candidates and verifying the result with SPICE propagation…</p>}
    {error && <p className="trip-error" role="alert">{error}</p>}
    {!data && !loading && <p className="trip-note">No calculated flight path is displayed until a valid solution is returned.</p>}
    {data && <>
      <p className="transfer-target">Arrival target: an Earth-facing point <strong>{data.arrival_target.altitude_km.toLocaleString()} km above the Moon’s mean radius</strong> at {data.request.arrival_utc}. This is separate from the selected surface coordinate; capture and descent are not calculated.</p>
      <details className="transfer-science-details"><summary>Flight metrics</summary><dl className="transfer-metrics">
        <div><dt>Flight duration</dt><dd>{data.summary.flight_duration_hours.toFixed(2)} h</dd></div>
        <div><dt>Earth–Moon distance at departure</dt><dd>{data.summary.departure_earth_moon_distance_km.toLocaleString(undefined,{maximumFractionDigits:0})} km</dd></div>
        <div><dt>Earth–Moon distance at arrival</dt><dd>{data.summary.arrival_earth_moon_distance_km.toLocaleString(undefined,{maximumFractionDigits:0})} km</dd></div>
        <div><dt>Moon movement during flight</dt><dd>{data.summary.moon_motion_degrees.toFixed(2)}°</dd></div>
        <div><dt>Estimated injection Δv</dt><dd>{data.summary.injection_delta_v_km_s.toFixed(3)} km/s</dd></div>
        <div><dt>Moon-relative speed at reference point</dt><dd>{data.summary.arrival_moon_relative_speed_km_s.toFixed(3)} km/s</dd></div>
        <div><dt>Numerical endpoint error</dt><dd>{data.summary.endpoint_error_km < .000001 ? '<0.001' : (data.summary.endpoint_error_km*1000).toFixed(3)} m</dd></div>
        <div><dt>Minimum Earth altitude on model arc</dt><dd>{data.summary.minimum_earth_altitude_km.toFixed(1)} km</dd></div>
      </dl></details>
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
