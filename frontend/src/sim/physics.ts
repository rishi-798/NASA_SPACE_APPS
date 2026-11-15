/**
 * Lunar final-descent physics (educational prototype). SI units throughout. See docs/LANDING_SIM.md.
 *
 * Model: point-mass translational motion in a local flat frame (x east, y north, z up) under constant lunar
 * gravity, plus thrust along a commanded direction. Attitude is simplified: the thrust direction follows the
 * commanded tilt at a limited rate, with no rotational dynamics. Landing legs are rigid, stay level for
 * contact, and the run stops at first contact (no bounce, tipping, suspension or damage model).
 */
import type { Terrain, SlopeEstimate } from "./terrain.ts";

/** Standard gravity: ONLY for converting specific impulse in seconds to exhaust velocity (Isp·g0). */
export const G0 = 9.80665;
/** Lunar surface gravity, m/s² (NASA Moon facts). Used in the equations of motion. */
export const MOON_G = 1.62;

export type Vec3 = [number, number, number];

export type VehicleConfig = {
  name: string;
  dryMassKg: number;
  propellantKg: number;
  maxThrustN: number;
  /** Lowest non-zero throttle the engine can hold (fraction of max thrust). */
  minThrottle: number;
  ispS: number;
  /** Largest thrust tilt from vertical, degrees. */
  maxTiltDeg: number;
  /** How fast the thrust direction can follow the command, degrees per second. */
  tiltRateDegS: number;
  /** Footpad distance from the centre line, metres (4 pads: east, west, north, south). */
  padRadiusM: number;
};

export type InitialConditions = {
  /** Start position relative to the target, metres. */
  eastM: number;
  northM: number;
  /** Height of the lowest footpad above the terrain directly below, metres. */
  altitudeM: number;
  velocity: Vec3;
};

export type SimSettings = { dtS: number; maxDurationS: number; maxAltitudeM: number; gravity: number };

export const DEFAULT_SETTINGS: SimSettings = { dtS: 0.01, maxDurationS: 600, maxAltitudeM: 3000, gravity: MOON_G };

/** ILLUSTRATIVE LANDER: plausible round numbers for a small robotic lander, not any real vehicle. */
export const ILLUSTRATIVE_LANDER: VehicleConfig = {
  name: "Illustrative lander", dryMassKg: 1000, propellantKg: 150, maxThrustN: 4500, minThrottle: 0.1,
  ispS: 310, maxTiltDeg: 20, tiltRateDegS: 15, padRadiusM: 2,
};
export const DEFAULT_INITIAL: InitialConditions = { eastM: -300, northM: 120, altitudeM: 400, velocity: [12, -4, -15] };

export type Input = { throttle: number; tiltEastDeg: number; tiltNorthDeg: number };
export const NO_INPUT: Input = { throttle: 0, tiltEastDeg: 0, tiltNorthDeg: 0 };

export type SimState = {
  step: number;
  t: number;
  pos: Vec3;
  vel: Vec3;
  propellantKg: number;
  massKg: number;
  /** Applied (not commanded) values. */
  throttle: number;
  thrustN: number;
  tilt: [number, number];
  /** Clearance of the lowest footpad above terrain, metres (the altitude reference). */
  altitudeM: number;
};

export type SimEventKind = "insufficient_thrust" | "thrust_restored" | "fuel_exhausted" | "contact" | "left_area"
  | "above_supported_altitude" | "terrain_missing" | "time_limit" | "ended_by_user";
export type SimEvent = { kind: SimEventKind; t: number; detail: string };

export type Contact = { t: number; pos: Vec3; vel: Vec3; verticalSpeed: number; horizontalSpeed: number; slope: SlopeEstimate; propellantKg: number };

// ---------------------------------------------------------------- validation

export function validateConfig(v: VehicleConfig, init: InitialConditions, settings: SimSettings, terrain: Terrain | null): string[] {
  const errors: string[] = [];
  const pos = (name: string, value: number) => { if (!(Number.isFinite(value) && value > 0)) errors.push(`${name} must be greater than zero.`); };
  pos("Dry mass", v.dryMassKg); pos("Maximum thrust", v.maxThrustN); pos("Specific impulse", v.ispS); pos("Footpad radius", v.padRadiusM);
  pos("Tilt rate", v.tiltRateDegS); pos("Timestep", settings.dtS);
  if (!(Number.isFinite(v.propellantKg) && v.propellantKg >= 0)) errors.push("Propellant must be zero or more.");
  if (!(v.minThrottle >= 0 && v.minThrottle < 1)) errors.push("Minimum throttle must be from 0 to less than 1.");
  if (!(v.maxTiltDeg >= 0 && v.maxTiltDeg <= 45)) errors.push("Maximum tilt must be 0–45°.");
  if (!(settings.dtS <= 0.1)) errors.push("Timestep must be 0.1 s or less.");
  if (!(init.altitudeM > 0 && init.altitudeM <= settings.maxAltitudeM)) errors.push(`Initial altitude must be above 0 and at most ${settings.maxAltitudeM} m.`);
  if (!init.velocity.every(Number.isFinite) || ![init.eastM, init.northM].every(Number.isFinite)) errors.push("Initial position and velocity must be numbers.");
  if (!terrain) { errors.push("No terrain selected."); return errors; }
  if (Math.abs(init.eastM) > terrain.halfSizeM * 0.9 || Math.abs(init.northM) > terrain.halfSizeM * 0.9) errors.push(`Start must lie within ${Math.round(terrain.halfSizeM * 0.9)} m of the target.`);
  else if (!Number.isFinite(footClearance(init.eastM, init.northM, 0, v.padRadiusM, terrain))) errors.push("No terrain data under the start position.");
  return errors;
}

// ---------------------------------------------------------------- core physics

/** Lowest footpad clearance above terrain (NaN if any pad is over missing data). Pads assumed level. */
export function footClearance(x: number, y: number, z: number, padRadius: number, terrain: Terrain): number {
  const pads: [number, number][] = [[padRadius, 0], [-padRadius, 0], [0, padRadius], [0, -padRadius]];
  let lowest = Infinity;
  for (const [dx, dy] of pads) {
    const h = terrain.heightAt(x + dx, y + dy);
    if (!Number.isFinite(h)) return NaN;
    lowest = Math.min(lowest, z - h);
  }
  return lowest;
}

export function thrustDirection(tiltEastDeg: number, tiltNorthDeg: number): Vec3 {
  const theta = (Math.hypot(tiltEastDeg, tiltNorthDeg) * Math.PI) / 180;
  if (theta === 0) return [0, 0, 1];
  const az = Math.atan2(tiltEastDeg, tiltNorthDeg);
  return [Math.sin(theta) * Math.sin(az), Math.sin(theta) * Math.cos(az), Math.cos(theta)];
}

/** Mass flow for thrust F: ṁ = F / (Isp · g0). g0 is the standard-gravity convention, not lunar gravity. */
export const massFlow = (thrustN: number, ispS: number) => thrustN / (ispS * G0);

type Y = [number, number, number, number, number, number, number]; // x y z vx vy vz m

/** dY/dt for constant thrust F along `dir`. */
export function derivative(y: Y, thrustN: number, dir: Vec3, ispS: number, g: number): Y {
  const m = y[6];
  const a = thrustN / m;
  return [y[3], y[4], y[5], a * dir[0], a * dir[1], a * dir[2] - g, -massFlow(thrustN, ispS)];
}

/** Classical RK4 over duration h with constant thrust. Exact for free fall (quadratic) and for linear mass loss. */
function rk4(y: Y, h: number, F: number, dir: Vec3, isp: number, g: number): Y {
  const add = (p: Y, k: Y, s: number) => p.map((v, i) => v + s * k[i]!) as Y;
  const k1 = derivative(y, F, dir, isp, g);
  const k2 = derivative(add(y, k1, h / 2), F, dir, isp, g);
  const k3 = derivative(add(y, k2, h / 2), F, dir, isp, g);
  const k4 = derivative(add(y, k3, h), F, dir, isp, g);
  return y.map((v, i) => v + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!)) as Y;
}

export function initialState(v: VehicleConfig, init: InitialConditions, terrain: Terrain): SimState {
  const ground = Math.max(...[[v.padRadiusM, 0], [-v.padRadiusM, 0], [0, v.padRadiusM], [0, -v.padRadiusM]]
    .map(([dx, dy]) => terrain.heightAt(init.eastM + dx!, init.northM + dy!)));
  const pos: Vec3 = [init.eastM, init.northM, ground + init.altitudeM];
  return { step: 0, t: 0, pos, vel: [...init.velocity] as Vec3, propellantKg: v.propellantKg, massKg: v.dryMassKg + v.propellantKg,
    throttle: 0, thrustN: 0, tilt: [0, 0], altitudeM: init.altitudeM };
}

/** Throttle actually applied: bounded to [0, 1], raised to the minimum when non-zero, zero without propellant. */
export function appliedThrottle(command: number, v: VehicleConfig, propellantKg: number): number {
  if (!(propellantKg > 0) || !(command > 0)) return 0;
  return Math.min(1, Math.max(v.minThrottle, command));
}

/** Move the thrust tilt toward the command by at most rate·dt, within the tilt limit. */
export function nextTilt(current: [number, number], input: Input, v: VehicleConfig, dt: number): [number, number] {
  let [te, tn] = [input.tiltEastDeg, input.tiltNorthDeg];
  const mag = Math.hypot(te, tn);
  if (mag > v.maxTiltDeg) { te *= v.maxTiltDeg / mag; tn *= v.maxTiltDeg / mag; }
  const de = te - current[0], dn = tn - current[1], d = Math.hypot(de, dn), maxStep = v.tiltRateDegS * dt;
  if (d <= maxStep) return [te, tn];
  return [current[0] + (de * maxStep) / d, current[1] + (dn * maxStep) / d];
}

export type StepResult = { state: SimState; events: SimEvent[]; contact: Contact | null; ended: boolean };

/**
 * Advance one fixed timestep. Throttle and tilt are held constant over the step. Fuel exhaustion and terrain
 * contact are located inside the step: thrust stops exactly when propellant reaches zero, and the run ends
 * at the moment of first contact (found by bisection), so the vehicle never passes through the surface.
 */
export function step(s: SimState, input: Input, v: VehicleConfig, settings: SimSettings, terrain: Terrain): StepResult {
  const dt = settings.dtS, g = settings.gravity;
  const events: SimEvent[] = [];
  const tilt = nextTilt(s.tilt, input, v, dt);
  const dir = thrustDirection(tilt[0], tilt[1]);
  const throttle = appliedThrottle(input.throttle, v, s.propellantKg);
  const F = throttle * v.maxThrustN;
  const mdot = massFlow(F, v.ispS);
  // Sub-intervals: powered until the tank empties (if within this step), then coasting.
  const segments: { h: number; F: number }[] = [];
  if (F > 0 && mdot * dt >= s.propellantKg) {
    const tb = s.propellantKg / mdot;
    if (tb > 0) segments.push({ h: tb, F });
    segments.push({ h: dt - tb, F: 0 });
  } else segments.push({ h: dt, F });

  let y: Y = [...s.pos, ...s.vel, s.massKg] as Y;
  let t = s.t, propellant = s.propellantKg;
  const clearanceOf = (yy: Y) => footClearance(yy[0], yy[1], yy[2], v.padRadiusM, terrain);
  for (const seg of segments) {
    if (seg.h <= 0) continue;
    const next = rk4(y, seg.h, seg.F, dir, v.ispS, g);
    const c = clearanceOf(next);
    if (!Number.isFinite(c)) {
      events.push({ kind: "terrain_missing", t: t + seg.h, detail: "No terrain data under the vehicle; the run cannot continue." });
      return finish(next, t + seg.h, propellantAfter(propellant, seg), tilt, throttle, F, events, null);
    }
    if (c <= 0) {
      // Bisection on the sub-step length for the first contact (clearance = 0).
      let lo = 0, hi = seg.h;
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (clearanceOf(rk4(y, mid, seg.F, dir, v.ispS, g)) > 0) lo = mid; else hi = mid; }
      const atContact = rk4(y, lo, seg.F, dir, v.ispS, g);
      const tc = t + lo, prop = propellantAfter(propellant, { h: lo, F: seg.F });
      const vel: Vec3 = [atContact[3], atContact[4], atContact[5]];
      const contact: Contact = { t: tc, pos: [atContact[0], atContact[1], atContact[2]], vel, verticalSpeed: Math.abs(Math.min(0, vel[2])),
        horizontalSpeed: Math.hypot(vel[0], vel[1]), slope: terrain.slopeAt(atContact[0], atContact[1]), propellantKg: prop };
      events.push({ kind: "contact", t: tc, detail: `Footpad contact at ${contact.verticalSpeed.toFixed(2)} m/s down, ${contact.horizontalSpeed.toFixed(2)} m/s across.` });
      return finish(atContact, tc, prop, tilt, throttle, seg.F, events, contact);
    }
    propellant = propellantAfter(propellant, seg);
    y = next;
    t += seg.h;
    if (seg.F > 0 && propellant === 0) {
      events.push({ kind: "fuel_exhausted", t, detail: "Propellant exhausted: engine shut down. The lander keeps moving under gravity." });
      y[6] = v.dryMassKg;
    }
  }
  t = s.t + dt;   // avoid drift from summing sub-steps
  const state = makeState(y, s.step + 1, t, propellant, tilt, throttle, F, clearanceOf(y));
  // Insufficient thrust: even full throttle cannot balance lunar weight at the current mass.
  const weak = propellant > 0 && v.maxThrustN < state.massKg * g, wasWeak = propellant > 0 && v.maxThrustN < s.massKg * g;
  if (s.step === 0 ? weak : weak && !wasWeak) events.push({ kind: "insufficient_thrust", t, detail: `Full thrust (${v.maxThrustN} N) is below lunar weight (${(state.massKg * g).toFixed(0)} N): the lander cannot hover.` });
  if (!weak && wasWeak && s.step > 0) events.push({ kind: "thrust_restored", t, detail: "Full thrust now exceeds lunar weight (the lander has become lighter)." });
  let ended = false;
  if (Math.abs(state.pos[0]) > terrain.halfSizeM || Math.abs(state.pos[1]) > terrain.halfSizeM) { events.push({ kind: "left_area", t, detail: `Left the supported ${terrain.halfSizeM * 2 / 1000} km square around the target.` }); ended = true; }
  else if (state.altitudeM > settings.maxAltitudeM) { events.push({ kind: "above_supported_altitude", t, detail: `Climbed above the supported ${settings.maxAltitudeM} m altitude.` }); ended = true; }
  else if (t >= settings.maxDurationS - 1e-9) { events.push({ kind: "time_limit", t, detail: `Reached the ${settings.maxDurationS} s simulation limit without touchdown.` }); ended = true; }
  return { state, events, contact: null, ended };

  function finish(yy: Y, tt: number, prop: number, tl: [number, number], thr: number, f: number, ev: SimEvent[], contact: Contact | null): StepResult {
    return { state: makeState(yy, s.step + 1, tt, prop, tl, thr, f, contact ? 0 : clearanceOf(yy)), events: ev, contact, ended: true };
  }
  function makeState(yy: Y, n: number, tt: number, prop: number, tl: [number, number], thr: number, f: number, alt: number): SimState {
    return { step: n, t: tt, pos: [yy[0], yy[1], yy[2]], vel: [yy[3], yy[4], yy[5]], propellantKg: prop, massKg: v.dryMassKg + prop,
      throttle: prop > 0 ? thr : 0, thrustN: prop > 0 ? f : 0, tilt: tl, altitudeM: alt };
  }
  function propellantAfter(p: number, seg: { h: number; F: number }) {
    return Math.max(0, p - massFlow(seg.F, v.ispS) * seg.h);
  }
}

// ---------------------------------------------------------------- touchdown evaluation

export type Limits = {
  maxVerticalSpeed: number;
  maxHorizontalSpeed: number;
  maxSlopeDeg: number;
  /** Above either value the touchdown is classed as an impact. */
  impactVerticalSpeed: number;
  impactTotalSpeed: number;
  source: string;
};
export const DEMO_LIMITS: Limits = {
  maxVerticalSpeed: 2, maxHorizontalSpeed: 1, maxSlopeDeg: 10, impactVerticalSpeed: 5, impactTotalSpeed: 6,
  source: "Demonstration setting (not taken from any specific vehicle)",
};

export type Check = { name: string; value: number | null; limit: number; unit: string; met: boolean | null };
export type Outcome = {
  kind: "within_limits" | "exceeds_limits" | "impact" | "terrain_unavailable" | "no_touchdown";
  title: string;
  explanation: string;
  checks: Check[];
};

export function evaluate(contact: Contact | null, events: SimEvent[], limits: Limits): Outcome {
  if (!contact) {
    const end = [...events].reverse().find((e) => ["left_area", "above_supported_altitude", "time_limit", "ended_by_user", "terrain_missing"].includes(e.kind));
    if (end?.kind === "terrain_missing") return { kind: "terrain_unavailable", title: "Terrain assessment unavailable", explanation: end.detail, checks: [] };
    return { kind: "no_touchdown", title: "Run ended without touchdown", explanation: end?.detail ?? "The run was stopped before contact.", checks: [] };
  }
  const total = Math.hypot(contact.verticalSpeed, contact.horizontalSpeed);
  const checks: Check[] = [
    { name: "Vertical touchdown speed", value: contact.verticalSpeed, limit: limits.maxVerticalSpeed, unit: "m/s", met: contact.verticalSpeed <= limits.maxVerticalSpeed },
    { name: "Horizontal touchdown speed", value: contact.horizontalSpeed, limit: limits.maxHorizontalSpeed, unit: "m/s", met: contact.horizontalSpeed <= limits.maxHorizontalSpeed },
    { name: contact.slope && Number.isFinite(contact.slope.scaleM) ? `Terrain slope (over ${contact.slope.scaleM} m)` : "Terrain slope", value: contact.slope?.deg ?? null, limit: limits.maxSlopeDeg, unit: "°", met: contact.slope ? contact.slope.deg <= limits.maxSlopeDeg : null },
  ];
  const fmt = (c: Check) => `${c.name.toLowerCase()} ${c.value === null ? "unknown" : c.value.toFixed(2)} ${c.unit} (limit ${c.limit} ${c.unit})`;
  if (contact.verticalSpeed > limits.impactVerticalSpeed || total > limits.impactTotalSpeed) {
    return { kind: "impact", title: "Impact", checks,
      explanation: `Contact at ${contact.verticalSpeed.toFixed(2)} m/s down and ${total.toFixed(2)} m/s total, above the impact setting (${limits.impactVerticalSpeed} m/s down or ${limits.impactTotalSpeed} m/s total). Damage and tipping are not modelled.` };
  }
  if (checks[2]!.met === null) {
    return { kind: "terrain_unavailable", title: "Terrain assessment unavailable", checks,
      explanation: `Speeds were ${checks.slice(0, 2).map(fmt).join(" and ")}, but the terrain slope could not be estimated at the contact point.` };
  }
  const failed = checks.filter((c) => c.met === false);
  if (failed.length) return { kind: "exceeds_limits", title: "Touchdown exceeded configured limits", checks, explanation: `Exceeded: ${failed.map(fmt).join("; ")}.` };
  return { kind: "within_limits", title: "Touchdown within configured simulation limits", checks,
    explanation: `All configured limits were met: ${checks.map(fmt).join("; ")}. This is not a safety verdict: tipping, legs, structure and small-scale hazards are not modelled.` };
}
