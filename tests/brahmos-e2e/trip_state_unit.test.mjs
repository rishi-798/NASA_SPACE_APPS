import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newMission,
  missionReducer,
  missionReady,
  restoreMission,
} from '../../frontend/src/lib/missionState.ts';

const VALID_DEPARTURES = ['cape-lc39a', 'ksc-lc39a', 'vandenberg-slc4e'];
const VALID_ROCKETS = ['saturn-v', 'sls', 'falcon-9', 'vulcan'];

function createCompletedSelections() {
  let state = missionReducer(newMission(), {
    type: 'departure',
    id: VALID_DEPARTURES[0],
    compatibleRocketIds: VALID_ROCKETS,
  });
  state = missionReducer(state, { type: 'rocket', id: VALID_ROCKETS[1] });
  state = missionReducer(state, {
    type: 'landing',
    point: {
      latitude: -84.79,
      longitude: 29.2,
      name: 'Athena IM-2',
      destinationId: 'athena-im2',
    },
  });
  return state;
}

test('WP-B1: editable steps resume at saved stage; execution steps return to landing (Conditions) without stale results', () => {
  const base = missionReducer(createCompletedSelections(), {
    type: 'time',
    time: '2026-10-23T12:00:00Z',
  });
  const withTransfer = missionReducer(base, {
    type: 'transfer-departure',
    time: '2026-10-19T12:00:00Z',
  });
  const withAlt = missionReducer(withTransfer, {
    type: 'parking-altitude',
    altitude: 250,
  });

  const expectedEditable = ['earth', 'rocket', 'moon', 'landing'];
  for (const stage of expectedEditable) {
    const raw = JSON.stringify({
      ...withAlt,
      stage,
      result: { stale: true },
      resultRevision: withAlt.revision,
    });
    const restored = restoreMission(raw, VALID_DEPARTURES, VALID_ROCKETS);
    assert.equal(restored.stage, stage, `Editable stage '${stage}' should resume cleanly`);
    assert.equal(restored.departureId, withAlt.departureId);
    assert.equal(restored.rocketId, withAlt.rocketId);
    assert.deepEqual(restored.landing, withAlt.landing);
    assert.equal(restored.utcTime, '2026-10-23T12:00:00Z');
    assert.equal(restored.transferDepartureUtcTime, '2026-10-19T12:00:00Z');
    assert.equal(restored.parkingAltitudeKm, 250);
    assert.equal(restored.result, null, 'Persisted result must never be treated as fresh');
    assert.equal(restored.resultRevision, null);
  }

  const executionStages = ['preparing', 'flight', 'simulate', 'reveal'];
  for (const stage of executionStages) {
    const raw = JSON.stringify({
      ...withAlt,
      stage,
      result: { stale: true },
      resultRevision: withAlt.revision,
    });
    const restored = restoreMission(raw, VALID_DEPARTURES, VALID_ROCKETS);
    assert.equal(
      restored.stage,
      'landing',
      `Execution stage '${stage}' should return to 'landing' (Conditions) for fresh analysis`,
    );
    assert.equal(restored.departureId, withAlt.departureId);
    assert.equal(restored.rocketId, withAlt.rocketId);
    assert.deepEqual(restored.landing, withAlt.landing);
    assert.equal(restored.result, null);
    assert.equal(restored.resultRevision, null);
  }
});

test('WP-B2: removed vehicle or departure site IDs fall back safely to earliest missing prerequisite', () => {
  const full = createCompletedSelections();

  const removedSite = restoreMission(
    JSON.stringify({ ...full, stage: 'landing', departureId: 'removed-pad-99' }),
    VALID_DEPARTURES,
    VALID_ROCKETS,
  );
  assert.equal(removedSite.stage, 'earth');
  assert.equal(removedSite.departureId, null);

  const removedRocket = restoreMission(
    JSON.stringify({ ...full, stage: 'reveal', rocketId: 'retired-rocket-x' }),
    VALID_DEPARTURES,
    VALID_ROCKETS,
  );
  assert.equal(removedRocket.stage, 'rocket');
  assert.equal(removedRocket.departureId, VALID_DEPARTURES[0]);
  assert.equal(removedRocket.rocketId, null);
  assert.deepEqual(removedRocket.landing, full.landing);
});

test('WP-B3: invalid coordinates are rejected by reducer and reset destination stage on restore', () => {
  const full = createCompletedSelections();
  const invalidPoints = [
    { latitude: NaN, longitude: 0 },
    { latitude: Infinity, longitude: 0 },
    { latitude: 90.001, longitude: 0 },
    { latitude: -91, longitude: 10 },
    { latitude: 0, longitude: 180.5 },
    { latitude: 0, longitude: -181 },
    { latitude: 'not-a-number', longitude: 0 },
  ];

  for (const point of invalidPoints) {
    assert.equal(
      missionReducer(full, { type: 'landing', point }),
      full,
      `Reducer must reject invalid landing point: ${JSON.stringify(point)}`,
    );
    const restored = restoreMission(
      JSON.stringify({ ...full, stage: 'landing', landing: point }),
      VALID_DEPARTURES,
      VALID_ROCKETS,
    );
    assert.equal(
      restored.stage,
      'moon',
      `Restore with invalid coordinates ${JSON.stringify(point)} should drop back to 'moon'`,
    );
    assert.equal(restored.landing, null);
  }
});

test('WP-B4: malformed JSON, null, wrong version, and unknown stages degrade safely', () => {
  const malformedInputs = [null, '', '{not valid json', '[]', 'null', '42', '{"version":2,"departureId":"cape-lc39a"}'];
  for (const raw of malformedInputs) {
    const restored = restoreMission(raw, VALID_DEPARTURES, VALID_ROCKETS);
    assert.equal(restored.stage, 'earth');
    assert.equal(restored.departureId, null);
    assert.equal(restored.result, null);
  }

  const full = createCompletedSelections();
  for (const weirdStage of ['nonexistent-stage', '', null, 123, '__proto__']) {
    const restored = restoreMission(
      JSON.stringify({ ...full, stage: weirdStage }),
      VALID_DEPARTURES,
      VALID_ROCKETS,
    );
    assert.equal(restored.stage, 'earth');
    assert.equal(restored.departureId, full.departureId);
    assert.equal(restored.rocketId, full.rocketId);
  }
});

test('WP-B5: cross-year departure/arrival timestamps restore intact and changed inputs invalidate prior results', () => {
  let state = createCompletedSelections();
  state = missionReducer(state, {
    type: 'transfer-departure',
    time: '2026-12-30T22:00:00Z',
  });
  state = missionReducer(state, {
    type: 'time',
    time: '2027-01-03T06:00:00Z',
  });
  state = missionReducer(state, { type: 'prepare' });
  state = missionReducer(state, {
    type: 'result',
    revision: state.revision,
    result: { schema_version: 1, samples: [] },
  });
  assert.equal(state.stage, 'flight');
  assert.ok(state.result !== null);

  // Restore from serialized string across year boundary
  const restored = restoreMission(JSON.stringify(state), VALID_DEPARTURES, VALID_ROCKETS);
  assert.equal(restored.stage, 'landing');
  assert.equal(restored.transferDepartureUtcTime, '2026-12-30T22:00:00Z');
  assert.equal(restored.utcTime, '2027-01-03T06:00:00Z');
  assert.equal(restored.result, null);

  // Any input change after a computed result invalidates result & resultRevision
  const changedParking = missionReducer(state, { type: 'parking-altitude', altitude: 320 });
  assert.equal(changedParking.result, null);
  assert.equal(changedParking.resultRevision, null);
  assert.ok(changedParking.revision > state.revision);

  const changedTime = missionReducer(state, { type: 'time', time: '2027-01-04T06:00:00Z' });
  assert.equal(changedTime.result, null);
  assert.equal(changedTime.resultRevision, null);

  const changedDeparture = missionReducer(state, {
    type: 'departure',
    id: VALID_DEPARTURES[1],
    compatibleRocketIds: [],
  });
  assert.equal(changedDeparture.result, null);
  assert.equal(changedDeparture.rocketId, null);
  assert.equal(missionReady(changedDeparture), false);
});
