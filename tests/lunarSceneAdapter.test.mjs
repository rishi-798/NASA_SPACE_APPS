import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLunarCoordinates, searchLunarSites, createLunarSelection} from '../frontend/lunarSceneAdapter.mjs';
test('Lunar coordinate search handles southern/western locations and rejects invalid inputs', () => {
  assert.deepEqual(parseLunarCoordinates(' -3.64589, -17.47194 '), {latitude: -3.64589, longitude: -17.47194});
  assert.deepEqual(parseLunarCoordinates('-90,180'), {latitude:-90, longitude:180});
  for (const bad of ['91,0','0,181','NaN,0','0,','0,1,2','0x10,0','Infinity,0']) assert.equal(parseLunarCoordinates(bad), null);
});
test('Mission search preserves the mission object and supports coordinate selection', () => {
  const site={id:'apollo-14', name:'Apollo 14', latitude:-3.64589, longitude:-17.47194};
  assert.deepEqual(searchLunarSites('APOLLO 14',[site]), [site]);
  assert.equal(searchLunarSites('0,23.5',[site])[0].longitude, 23.5);
  assert.deepEqual(searchLunarSites('',[site]), []);
});
test('Local handoff requires explicit timezone, carries selected coordinates and uses supplied Moon transform', () => {
  const calls=[];const entity={}; const ellipsoid={};
  const api=createLunarSelection({Cesium:{Cartesian3:{fromDegrees:(lon,lat,height,e)=>{assert.equal(e,ellipsoid);return [lon,lat,height];}},Color:{YELLOW:'yellow'}},viewer:{entities:{add:args=>{calls.push(args);return entity;},remove:()=>{}},scene:{requestRender:()=>{}}},moonEllipsoid:ellipsoid,toWorld:p=>p.map(n=>n+1),onLocalRequest:p=>p});
  const site={name:'Apollo 14',latitude:-3.64589,longitude:-17.47194};
  assert.equal(api.select(site),entity);assert.deepEqual(calls[0].position,[-16.47194,-2.64589,1]);
  assert.throws(()=>api.requestLocal(site,'2026-10-07T12:00:00'));
  assert.equal(api.requestLocal(site,'2026-10-07T12:00:00+02:00').utcTime,'2026-10-07T10:00:00.000Z');
});
