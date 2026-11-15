import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceTransferCursor,clampTransferCursor,transferFrame} from '../frontend/src/lib/transferPlayback.ts';
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
  assert.equal(advanceTransferCursor(0,.05,257),.05*256/35);
  assert.equal(advanceTransferCursor(255.9,.1,257),256);
  assert.equal(advanceTransferCursor(256,.1,257),256);
  assert.equal(advanceTransferCursor(10,-1,257),10);
  assert.equal(advanceTransferCursor(10,3600,257),advanceTransferCursor(10,.1,257));
});
