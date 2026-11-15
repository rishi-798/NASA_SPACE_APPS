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
export function advanceTransferCursor(cursor:number,deltaSeconds:number,count:number,durationSeconds=35) {
  return clampTransferCursor(cursor+Math.max(0,Math.min(deltaSeconds,.1))*(count-1)/durationSeconds,count);
}
