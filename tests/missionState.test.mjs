import test from 'node:test';
import assert from 'node:assert/strict';
import { newMission, missionReducer, missionReady, restoreMission } from '../frontend/src/lib/missionState.ts';

function planned() {
  let state = missionReducer(newMission(), {type:'departure', id:'earth', compatibleRocketIds:['rocket']});
  state = missionReducer(state, {type:'rocket', id:'rocket'});
  return missionReducer(state, {type:'landing', point:{latitude:-80.123456, longitude:1.456789, name:'Exact chosen point'}});
}
test('stages require earlier choices', () => {
  const state=newMission();
  assert.equal(missionReducer(state,{type:'stage',stage:'moon'}),state);
  assert.equal(missionReady(state),false);
});
test('back and edit navigation preserve the exact landing point', () => {
  const state=planned();
  const back=missionReducer(state,{type:'stage',stage:'earth'});
  assert.deepEqual(back.landing,state.landing);
  assert.equal(back.rocketId,'rocket');
  assert.equal(missionReady(back),true);
});
test('only matching frozen request revisions can start the flight', () => {
  const state=missionReducer(planned(),{type:'prepare'});
  const changed=missionReducer(state,{type:'time',time:'2026-10-11T18:00:00Z'});
  assert.equal(missionReducer(changed,{type:'result',revision:state.revision,result:{}}),changed);
  assert.equal(missionReducer(state,{type:'result',revision:state.revision,result:{conditions:{latitude:-80.123456}}}).stage,'flight');   // step 5: flight animation
});
test('any changed input invalidates scientific output', () => {
  const state=missionReducer(planned(),{type:'prepare'});
  const result=missionReducer(state,{type:'result',revision:state.revision,result:{}});
  const changed=missionReducer(result,{type:'departure',id:'other',compatibleRocketIds:[]});
  assert.equal(changed.result,null);
  assert.equal(changed.resultRevision,null);
  assert.equal(changed.rocketId,null);
});
test('invalid coordinates are rejected; restoration does not replay stale analysis', () => {
  const state=planned();
  assert.equal(missionReducer(state,{type:'landing',point:{latitude:NaN,longitude:0}}),state);
  assert.equal(missionReducer(state,{type:'landing',point:{latitude:91,longitude:0}}),state);
  assert.equal(restoreMission('{bad', ['earth'], ['rocket']).departureId,null);
  const restored=restoreMission(JSON.stringify({...state,stage:'reveal',result:{}}),['earth'],['rocket']);
  assert.equal(restored.stage,'landing');
  assert.deepEqual(restored.landing,state.landing);
  assert.equal(restored.result,null);
});
test('refresh restores editable progress and requires fresh analysis for completed stages', () => {
  const state=missionReducer(planned(),{type:'time',time:'2026-10-11T18:00:00Z'});
  for (const stage of ['earth','rocket','moon','landing','preparing','flight','simulate','reveal']) {
    const restored=restoreMission(JSON.stringify({...state,stage,result:{},resultRevision:state.revision}),['earth'],['rocket']);
    assert.equal(restored.stage, ['preparing','flight','simulate','reveal'].includes(stage) ? 'landing' : stage);
    assert.equal(restored.departureId,state.departureId);
    assert.equal(restored.rocketId,state.rocketId);
    assert.deepEqual(restored.landing,state.landing);
    assert.equal(restored.utcTime,state.utcTime);
    assert.equal(restored.result,null);
    assert.equal(restored.resultRevision,null);
  }
  const departureOnly=restoreMission(JSON.stringify({...newMission(),departureId:'earth'}),['earth'],['rocket']);
  assert.equal(departureOnly.stage,'earth');
  assert.equal(departureOnly.departureId,'earth');
});

test('restoration falls back to the missing prerequisite and rejects unknown stages', () => {
  const complete=planned();
  const restore=patch=>restoreMission(JSON.stringify({...complete,...patch}),['earth'],['rocket']);
  assert.equal(restore({stage:'flight',rocketId:'removed-vehicle'}).stage,'rocket');
  assert.equal(restore({stage:'landing',landing:null}).stage,'moon');
  assert.equal(restore({stage:'simulate',landing:{latitude:99,longitude:0}}).stage,'moon');
  assert.equal(restore({stage:'not-a-stage'}).stage,'earth');
  assert.equal(restore({stage:'reveal',departureId:'removed-site'}).stage,'earth');
});
test('plan reuses the preview result for the unchanged revision without a new request', () => {
  const state=planned();
  const result={conditions:{latitude:-80.123456}};
  const planned_=missionReducer(state,{type:'plan',revision:state.revision,result});
  assert.equal(planned_.stage,'flight');
  assert.equal(planned_.result,result);
  assert.equal(planned_.resultRevision,state.revision);
});
test('plan ignores a preview from an older revision', () => {
  const state=planned();
  const changed=missionReducer(state,{type:'time',time:'2026-10-11T18:00:00Z'});
  assert.equal(missionReducer(changed,{type:'plan',revision:state.revision,result:{}}),changed);
  assert.equal(missionReducer(newMission(),{type:'plan',revision:0,result:{}}).stage,'earth');
});

test('Transfer departure, arrival and parking altitude persist through navigation and refresh', () => {
  let state = planned();
  state = missionReducer(state, {type:'transfer-departure', time:'2026-12-30T23:00:00Z'});
  state = missionReducer(state, {type:'time', time:'2027-01-03T23:00:00Z'});
  state = missionReducer(state, {type:'parking-altitude', altitude:400});
  const restored = restoreMission(JSON.stringify(state), ['earth'], ['rocket']);
  assert.equal(restored.transferDepartureUtcTime, state.transferDepartureUtcTime);
  assert.equal(restored.utcTime, state.utcTime);
  assert.equal(restored.parkingAltitudeKm, 400);
  assert.equal(missionReducer(state,{type:'stage',stage:'earth'}).transferDepartureUtcTime,state.transferDepartureUtcTime);
  assert.equal(missionReducer(state,{type:'parking-altitude',altitude:100}),state);
});
test('Legacy saved trips receive an explicit transfer departure four days before observation', () => {
  const state=planned(); delete state.transferDepartureUtcTime; delete state.parkingAltitudeKm;
  const restored=restoreMission(JSON.stringify(state),['earth'],['rocket']);
  assert.equal(Date.parse(restored.utcTime)-Date.parse(restored.transferDepartureUtcTime),96*3600000);
  assert.equal(restored.parkingAltitudeKm,200);
});
test('Transfer edits invalidate previously finalized mission output', () => {
  const state=missionReducer(planned(),{type:'plan',revision:planned().revision,result:{}});
  for (const action of [{type:'transfer-departure',time:'2026-12-30T23:00:00Z'}, {type:'parking-altitude',altitude:500}]) {
    const updated=missionReducer(state,action);
    assert.equal(updated.result,null); assert.equal(updated.resultRevision,null); assert.ok(updated.revision>state.revision);
  }
});
test('flight, landing, then overview require a current result', () => {
  const state=missionReducer(planned(),{type:'prepare'});
  assert.equal(missionReducer(state,{type:'stage',stage:'flight'}),state);
  assert.equal(missionReducer(state,{type:'stage',stage:'simulate'}),state);           // no result yet
  const done=missionReducer(state,{type:'result',revision:state.revision,result:{}});
  assert.equal(done.stage,'flight');
  const landed=missionReducer(done,{type:'stage',stage:'simulate'});
  assert.equal(landed.stage,'simulate');
  assert.equal(missionReducer(landed,{type:'stage',stage:'flight'}).stage,'flight');
  assert.equal(missionReducer(done,{type:'stage',stage:'reveal'}).stage,'reveal');    // Continue to overview
  assert.equal(missionReducer(done,{type:'stage',stage:'landing'}).stage,'landing');  // back to conditions
  const changed=missionReducer(done,{type:'time',time:'2026-10-11T18:00:00Z'});
  assert.equal(missionReducer(changed,{type:'stage',stage:'flight'}),changed);
  assert.equal(missionReducer(changed,{type:'stage',stage:'simulate'}),changed);      // stale result: blocked
  assert.equal(missionReducer(changed,{type:'stage',stage:'reveal'}),changed);
});
