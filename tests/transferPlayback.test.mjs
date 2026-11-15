import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceTransferCursor,clampTransferCursor,transferFrame,transferProgress} from '../frontend/src/lib/transferPlayback.ts';
const data={samples:[0,1,2].map(i=>({time:new Date(Date.parse('2026-11-15T00:00:00Z')+i*3600000).toISOString(),
  elapsed_seconds:i*3600,spacecraft_position_km:[i*100,0,0],spacecraft_velocity_km_s:[1+i,2,3],
  moon_position_km:[400000,i*1000,0],moon_velocity_km_s:[0,1+i,0],sun_direction:[1,i*.01,0],
  earth_orientation:[1,0,0,0,1,0,0,0,1],moon_orientation:[1,0,0,0,1,0,0,0,1]}))};
test('one fractional flight cursor synchronizes rocket, Moon, sunlight and UTC',()=>{
  const frame=transferFrame(data,.5);
  assert.equal(frame.time,'2026-11-15T00:30:00.000Z');
  assert.equal(frame.elapsed_seconds,1800);
  assert.deepEqual(frame.spacecraft_position_km,[50,0,0]);
  assert.deepEqual(frame.moon_position_km,[400000,500,0]);
  assert.deepEqual(frame.spacecraft_velocity_km_s,[1.5,2,3]);
  assert.deepEqual(frame.moon_velocity_km_s,[0,1.5,0]);
  assert.deepEqual(frame.sun_direction,[1,.005,0]);
  assert.deepEqual(data.samples[0].spacecraft_position_km,[0,0,0]);
});
test('scrubbing clamps to departure and exact arrival instead of extrapolating capture',()=>{
  for(const cursor of [-1,NaN,-Infinity])assert.deepEqual(transferFrame(data,cursor),data.samples[0]);
  for(const cursor of [2,100])assert.deepEqual(transferFrame(data,cursor),data.samples[2]);
  assert.equal(clampTransferCursor(1.25,3),1.25);
});
test('playback advances smoothly and stops at arrival without looping or background leaps',()=>{
  assert.ok(advanceTransferCursor(0,.05,257)>0);
  assert.ok(advanceTransferCursor(0,.05,257)<.05*256/35);
  assert.equal(advanceTransferCursor(255.9999,.1,257),256);
  assert.equal(advanceTransferCursor(256,.1,257),256);
  assert.ok(Math.abs(advanceTransferCursor(10,-1,257)-10)<1e-12);
  assert.equal(advanceTransferCursor(10,3600,257),advanceTransferCursor(10,.1,257));
});

test('lunar arrival status is tied to the exact calculated endpoint and physical Moon range',()=>{
  const mission={...data,constants:{moon_radius_km:1737.4}};
  assert.equal(transferProgress(mission,0).phase,'Earth departure');
  assert.equal(transferProgress(mission,1).phase,'Translunar coast');
  assert.equal(transferProgress(mission,1.8).phase,'Lunar approach');
  const end=transferProgress(mission,2);
  assert.equal(end.phase,'Lunar arrival reached');assert.equal(end.progress,1);
  assert.equal(end.moonRangeKm,Math.hypot(400000-200,2000));
  assert.equal(end.lunarAltitudeKm,end.moonRangeKm-1737.4);
  assert.equal(transferProgress(mission,1.999).phase,'Lunar approach');
});

test('eased cinematic clock is monotonic and reaches the exact endpoint in 35 seconds',()=>{
  let cursor=0;
  for(let i=0;i<350;i++){
    const next=advanceTransferCursor(cursor,.1,257);
    assert.ok(next>=cursor);assert.ok(next<=256);cursor=next;
    if(i===174)assert.ok(Math.abs(cursor-128)<1e-7);
  }
  assert.ok(Math.abs(cursor-256)<1e-8);
});
