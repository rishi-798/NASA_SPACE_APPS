import test from 'node:test';
import assert from 'node:assert/strict';
import {eyePosition, lookDirection, surfaceTime} from '../frontend/src/lib/surfaceViewMath.ts';
test('Eye height is exactly 1.8 metres above a selected surface point, including tilted up',()=>{
 for(const up of [[0,0,1],[.1,.2,1]]) {
  const point=[10,20,-30], eye=eyePosition(point,up);
  assert.ok(Math.abs(Math.hypot(...eye.map((v,i)=>v-point[i]))-1.8)<1e-12);
 }
 assert.throws(()=>eyePosition([0,0,0],[0,0,0]));
});
test('Eye camera looks toward north horizon initially and has independent yaw/pitch',()=>{
 assert.deepEqual(lookDirection(0,0),[0,1,0]);
 for(const yaw of [0,Math.PI/2,Math.PI]) for(const pitch of [-1,0,1]) assert.ok(Math.abs(Math.hypot(...lookDirection(yaw,pitch))-1)<1e-12);
 assert.ok(Math.abs(lookDirection(Math.PI/2,0)[0]-1)<1e-12);
 assert.ok(lookDirection(0,.5)[2]>0);
});
test('Surface slider spans exactly 24 hours from the observation time across UTC midnight',()=>{
 assert.equal(surfaceTime('2026-11-14T18:30:00Z',0),'2026-11-14T18:30:00.000Z');
 assert.equal(surfaceTime('2026-11-14T18:30:00Z',1440),'2026-11-15T18:30:00.000Z');
 assert.throws(()=>surfaceTime('bad',0)); assert.throws(()=>surfaceTime('2026-11-14T18:30:00Z',1441));
});
