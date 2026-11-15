import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSION_PHASES } from '../frontend/src/components/planner/missionPhaseData.ts';

test('mission phases cover the complete flight sequence in exact chronological order', () => {
  assert.equal(MISSION_PHASES.length, 6);
  const expectedOrder = ['ascent', 'parking', 'tli', 'cruise', 'arrival', 'descent'];
  const actualOrder = MISSION_PHASES.map((p) => p.id);
  assert.deepEqual(actualOrder, expectedOrder);

  for (let i = 0; i < MISSION_PHASES.length; i++) {
    const phase = MISSION_PHASES[i];
    assert.equal(phase.phaseNumber, i + 1);
    assert.ok(phase.name.length > 5);
    assert.ok(phase.tagline.length > 10);
    assert.ok(phase.overview.length > 50);
    assert.ok(phase.orbitalMechanics.length > 50);
    assert.ok(phase.engineeringChallenges.length > 30);
  }
});

test('mission phases have monotonic timeline bounds and positive delta-V budgets', () => {
  let prevEnd = 0;
  let totalDeltaV = 0;

  for (const phase of MISSION_PHASES) {
    assert.ok(phase.startMetSeconds >= prevEnd, `Phase ${phase.id} starts at or after previous phase end`);
    assert.ok(phase.endMetSeconds > phase.startMetSeconds, `Phase ${phase.id} has positive duration`);
    assert.ok(phase.deltaVBudgetMS >= 0, `Phase ${phase.id} has non-negative delta-V budget`);
    totalDeltaV += phase.deltaVBudgetMS;
    prevEnd = phase.endMetSeconds;
  }

  // Realistic translunar expedition delta-V budget ~14,000 to 16,000 m/s
  assert.ok(totalDeltaV >= 14000 && totalDeltaV <= 16500, `Total mission delta-V ${totalDeltaV} is physically realistic`);
  assert.equal(prevEnd, 288000, 'Mission ends at 80 hours (288,000 seconds)');
});

test('every mission phase has structured milestones and governing physical equations', () => {
  for (const phase of MISSION_PHASES) {
    assert.ok(phase.milestones.length >= 3, `Phase ${phase.id} has at least 3 critical milestones`);
    for (const m of phase.milestones) {
      assert.ok(m.timeMet.startsWith('T+'), `Milestone ${m.name} has valid MET timestamp`);
      assert.ok(typeof m.altitudeKm === 'number' && Number.isFinite(m.altitudeKm));
      assert.ok(typeof m.velocityKmS === 'number' && Number.isFinite(m.velocityKmS));
    }

    assert.ok(phase.keyEquations.length >= 1, `Phase ${phase.id} has governing mathematical equations`);
    for (const eq of phase.keyEquations) {
      assert.ok(eq.name.length > 0);
      assert.ok(eq.latex.length > 0);
      assert.ok(eq.meaning.length > 15);
    }

    assert.ok(phase.telemetryProfile.primaryMetric.length > 0);
    assert.ok(phase.telemetryProfile.primaryValue.length > 0);
    assert.ok(phase.telemetryProfile.engineStatus.length > 0);
  }
});
