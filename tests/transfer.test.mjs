import test from 'node:test';
import assert from 'node:assert/strict';
import {transferInputError, transferKey, validTransfer, getTransfer} from '../frontend/src/lib/transfer.ts';
import {createRequestGate} from '../frontend/src/lib/requestGate.ts';
const input={departureUtc:'2026-11-15T12:00:00Z',arrivalUtc:'2026-11-19T12:00:00Z',parkingAltitudeKm:200};
test('Departure/arrival order, duration, UTC and parking bounds are checked before requests', () => {
  assert.equal(transferInputError(input),null);
  for (const changed of [{departureUtc:'bad'}, {arrivalUtc:'2026-11-14T00:00:00Z'}, {arrivalUtc:'2026-11-16T00:00:00Z'},
    {arrivalUtc:'2027-01-01T00:00:00Z'}, {departureUtc:'2026-11-15T12:00:00'}, {parkingAltitudeKm:NaN}, {parkingAltitudeKm:159}, {parkingAltitudeKm:2001},
    {departureUtc:'2026-02-30T12:00:00Z',arrivalUtc:'2026-03-05T12:00:00Z'}]) assert.ok(transferInputError({...input,...changed}));
});
test('Changing any model input changes the scientific-result identity', () => {
  for (const change of [{departureUtc:'2026-11-16T12:00:00Z'},{arrivalUtc:'2026-11-20T12:00:00Z'},{parkingAltitudeKm:400}]) assert.notEqual(transferKey(input),transferKey({...input,...change}));
});
const fixture=()=>({schema_version:1, model:'Preliminary two-body transfer', frame:'J2000', request:{departure_utc:input.departureUtc,arrival_utc:input.arrivalUtc,parking_altitude_km:200},
  summary:Object.fromEntries(['flight_duration_hours','departure_earth_moon_distance_km','arrival_earth_moon_distance_km','moon_motion_degrees','injection_delta_v_km_s','arrival_moon_relative_speed_km_s','endpoint_error_km','minimum_earth_altitude_km','sampled_moon_clearance_km','parking_phase_angle_degrees','candidate_count','max_relative_energy_drift','max_relative_angular_momentum_drift'].map(k=>[k,k==='minimum_earth_altitude_km'?200:k==='endpoint_error_km'?.0001:1])),
  constants:{earth_radius_km:6378,moon_radius_km:1737,earth_mu_km3_s2:398600},provenance:{ephemeris:'de440s.bsp',propagator:'SPICE prop2b',parking_phase_search:'Finite phase search',solver:'Lambert',constants_source:'https://ssd.jpl.nasa.gov/astro_par.html'},limitations:['Educational model'],
  arrival_target:{altitude_km:10000,definition:'Earth-facing point',position_km:[1,2,3],is_capture_or_landing:false},
  samples:Array.from({length:257},(_,i)=>({time:new Date(Date.parse(input.departureUtc)+i*96*3600000/256).toISOString(),elapsed_seconds:i*1350,
    spacecraft_position_km:[1,2,3],spacecraft_velocity_km_s:[1,2,3],moon_position_km:[1,2,3],moon_velocity_km_s:[1,2,3],sun_direction:[1,0,0],earth_orientation:[1,0,0,0,1,0,0,0,1],moon_orientation:[1,0,0,0,1,0,0,0,1]}))});
test('Incomplete, mismatched and non-finite states are not displayed', () => {
  assert.equal(validTransfer(fixture(),input),true);
  const bad=fixture();bad.samples[5].moon_position_km=[NaN,0,0];assert.equal(validTransfer(bad,input),false);
  const wrong=fixture();wrong.request.arrival_utc='2026-11-20T12:00:00Z';assert.equal(validTransfer(wrong,input),false);
  const missing=fixture();missing.samples.pop();assert.equal(validTransfer(missing,input),false);
  const missingConstants=fixture();delete missingConstants.constants.earth_radius_km;assert.equal(validTransfer(missingConstants,input),false);
  const missingAltitude=fixture();delete missingAltitude.arrival_target.altitude_km;assert.equal(validTransfer(missingAltitude,input),false);
});
test('Transfer network errors surface without an illustrative fallback', async () => {
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async ()=>Response.json({detail:'No admissible transfer for these dates.'},{status:422});
    await assert.rejects(getTransfer(input,new AbortController().signal),/No admissible/);
  } finally {globalThis.fetch=original;}
});
test('A late transfer response cannot replace a newer input or request', async () => {
  const gate=createRequestGate();const old=gate.begin();let resolveOld;
  const deferred=new Promise(resolve=>{resolveOld=resolve;});
  let applied=null;const pending=deferred.then(data=>{if(old.current())applied=data;});
  gate.invalidate();const next=gate.begin();
  resolveOld('stale path');await pending;
  assert.equal(applied,null);assert.equal(old.signal.aborted,true);assert.equal(next.current(),true);
});
