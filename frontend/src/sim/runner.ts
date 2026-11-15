import { evaluate, initialState, step, type Contact, type InitialConditions, type Input, type Limits, type Outcome, type SimEvent, type SimSettings, type SimState, type VehicleConfig } from "./physics.ts";
import type { Terrain } from "./terrain.ts";

/** One recorded run: everything needed to explain, replay and compare it. */
export type RunRecord = {
  id: number;
  label: string;
  terrainLabel: string;
  terrainKind: Terrain["kind"];
  vehicle: VehicleConfig;
  initial: InitialConditions;
  settings: SimSettings;
  limits: Limits;
  mode: "manual" | "assisted" | "recorded-inputs";
  /** Inputs that changed, keyed by step: re-simulating them reproduces the run exactly. */
  inputs: { step: number; input: Input }[];
  /** States recorded every `sampleEvery` steps, plus the final state: the replay plays these back. */
  samples: SimState[];
  events: SimEvent[];
  contact: Contact | null;
  outcome: Outcome | null;
  final: SimState;
};
export const SAMPLE_EVERY = 2;   // 50 Hz at dt = 0.01 s

/** A live simulation: the single authoritative state, advanced only in whole fixed steps. */
export function createSim(vehicle: VehicleConfig, initial: InitialConditions, settings: SimSettings, terrain: Terrain, limits: Limits) {
  let state = initialState(vehicle, initial, terrain);
  const events: SimEvent[] = [];
  const inputs: { step: number; input: Input }[] = [];
  const samples: SimState[] = [state];
  let contact: Contact | null = null;
  let ended = false;
  let lastInput: Input | null = null;
  return {
    get state() { return state; },
    get ended() { return ended; },
    get events() { return events; },
    get contact() { return contact; },
    /** Advance one fixed step with `input` (recorded when it changes). */
    advance(input: Input) {
      if (ended) return;
      if (!lastInput || input.throttle !== lastInput.throttle || input.tiltEastDeg !== lastInput.tiltEastDeg || input.tiltNorthDeg !== lastInput.tiltNorthDeg) {
        inputs.push({ step: state.step, input: { ...input } });
        lastInput = { ...input };
      }
      const r = step(state, input, vehicle, settings, terrain);
      state = r.state;
      events.push(...r.events);
      if (r.contact) contact = r.contact;
      ended = r.ended;
      if (ended || state.step % SAMPLE_EVERY === 0) samples.push(state);
    },
    stop(detail = "Stopped by the user before touchdown.") {
      if (ended) return;
      events.push({ kind: "ended_by_user", t: state.t, detail });
      ended = true;
      if (samples.at(-1) !== state) samples.push(state);
    },
    record(id: number, label: string, mode: RunRecord["mode"]): RunRecord {
      return { id, label, terrainLabel: terrain.label, terrainKind: terrain.kind, vehicle: { ...vehicle }, initial: structuredClone(initial), settings: { ...settings },
        limits: { ...limits }, mode, inputs: [...inputs], samples: [...samples], events: [...events], contact,
        outcome: ended ? evaluate(contact, events, limits) : null, final: state };
    },
  };
}

/**
 * Fixed-step clock: converts elapsed real time × playback speed into a whole number of physics steps.
 * Frame rate and speed only change how many steps run per frame, never the steps themselves.
 */
export function stepsFor(accumulatorS: number, elapsedS: number, speed: number, dtS: number, maxSteps = 2000): { steps: number; accumulatorS: number } {
  let acc = accumulatorS + Math.max(0, elapsedS) * speed;
  const steps = Math.min(maxSteps, Math.floor(acc / dtS + 1e-9));
  acc -= steps * dtS;
  if (steps === maxSteps) acc = 0;   // drop backlog after a long pause instead of spiralling
  return { steps, accumulatorS: acc };
}

/** Run to the end without rendering, with inputs chosen per step (autopilot, a script, or recorded inputs). */
export function runHeadless(vehicle: VehicleConfig, initial: InitialConditions, settings: SimSettings, terrain: Terrain, limits: Limits,
  inputFor: (state: SimState) => Input) {
  const sim = createSim(vehicle, initial, settings, terrain, limits);
  const maxSteps = Math.ceil(settings.maxDurationS / settings.dtS) + 2;
  for (let i = 0; i < maxSteps && !sim.ended; i++) sim.advance(inputFor(sim.state));
  return sim;
}

/** Input function that replays recorded inputs by step number. */
export function recordedInputs(inputs: RunRecord["inputs"]): (state: SimState) => Input {
  let i = 0, current: Input = { throttle: 0, tiltEastDeg: 0, tiltNorthDeg: 0 };
  return (state) => {
    while (i < inputs.length && inputs[i]!.step <= state.step) current = inputs[i++]!.input;
    return current;
  };
}
