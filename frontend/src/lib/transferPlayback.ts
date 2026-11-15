import type {TransferResult,TransferSample} from './transfer.ts';
export function clampTransferCursor(cursor:number,count:number) {
  return Number.isFinite(cursor)?Math.max(0,Math.min(count-1,cursor)):0;
}
/** Display interpolation between propagated samples; never invents a new path or capture. */
export function transferFrame(data:TransferResult,cursor:number):TransferSample {
  const at=clampTransferCursor(cursor,data.samples.length),i=Math.floor(at),f=at-i;
  const a=data.samples[i]!,b=data.samples[Math.min(i+1,data.samples.length-1)]!;
  const vector=(key:'spacecraft_position_km'|'spacecraft_velocity_km_s'|'moon_position_km'|'moon_velocity_km_s'|'sun_direction')=>a[key].map((v,j)=>v+(b[key][j]!-v)*f);
  return {...a,time:new Date(Date.parse(a.time)+(Date.parse(b.time)-Date.parse(a.time))*f).toISOString(),
    elapsed_seconds:a.elapsed_seconds+(b.elapsed_seconds-a.elapsed_seconds)*f,
    spacecraft_position_km:vector('spacecraft_position_km'),spacecraft_velocity_km_s:vector('spacecraft_velocity_km_s'),
    moon_position_km:vector('moon_position_km'),moon_velocity_km_s:vector('moon_velocity_km_s'),sun_direction:vector('sun_direction')};
}
export const TRANSFER_PLAYBACK_SECONDS=35;
export function advanceTransferCursor(cursor:number,deltaSeconds:number,count:number,durationSeconds=TRANSFER_PLAYBACK_SECONDS) {
  // Ease the display clock near departure/arrival so both bodies remain visible longer.
  // UTC and every physical state still come from the same resulting sample cursor.
  const fraction=clampTransferCursor(cursor,count)/(count-1);
  const clock=Math.acos(1-2*fraction)/Math.PI;
  const next=Math.min(1,clock+Math.max(0,Math.min(deltaSeconds,.1))/durationSeconds);
  return clampTransferCursor((1-Math.cos(Math.PI*next))*.5*(count-1),count);
}

/** Arrival uses the solved endpoint, never an extra surface/capture animation. */
export function transferProgress(data:TransferResult,cursor:number) {
  const frame=transferFrame(data,cursor);
  const progress=clampTransferCursor(cursor,data.samples.length)/(data.samples.length-1);
  const moonRangeKm=Math.hypot(...frame.spacecraft_position_km.map((v,i)=>v-frame.moon_position_km[i]!));
  const phase=progress>=1?'Lunar arrival reached':progress>=.8?'Lunar approach':progress<.035?'Earth departure':'Translunar coast';
  return {progress,moonRangeKm,lunarAltitudeKm:moonRangeKm-data.constants.moon_radius_km,phase};
}

/** Playback seconds at 1x, independent of the mission's physical flight duration. */
export function transferPlaybackClock(cursor:number,count:number,speed=1) {
  const elapsed=Math.acos(1-2*clampTransferCursor(cursor,count)/(count-1))/Math.PI*TRANSFER_PLAYBACK_SECONDS;
  return {elapsed,remaining:(TRANSFER_PLAYBACK_SECONDS-elapsed)/speed};
}
export function formatPlaybackTime(seconds:number) {
  const value=Math.max(0,Math.round(seconds));
  return `${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`;
}
