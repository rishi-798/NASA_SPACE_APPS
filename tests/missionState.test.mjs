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
test('only matching frozen request revisions can produce a reveal', () => {
  const state=missionReducer(planned(),{type:'prepare'});
  const changed=missionReducer(state,{type:'time',time:'2026-10-11T18:00:00Z'});
  assert.equal(missionReducer(changed,{type:'result',revision:state.revision,result:{}}),changed);
  assert.equal(missionReducer(state,{type:'result',revision:state.revision,result:{conditions:{latitude:-80.123456}}}).stage,'reveal');
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
  assert.equal(restored.stage,'earth');
  assert.deepEqual(restored.landing,state.landing);
  assert.equal(restored.result,null);
});
test('refresh starts at departure for every saved stage while retaining choices', () => {
  const state=missionReducer(planned(),{type:'time',time:'2026-10-11T18:00:00Z'});
  for (const stage of ['earth','rocket','moon','landing','preparing','reveal']) {
    const restored=restoreMission(JSON.stringify({...state,stage,result:{},resultRevision:state.revision}),['earth'],['rocket']);
    assert.equal(restored.stage,'earth');
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
