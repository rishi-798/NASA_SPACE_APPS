import type { Input, SimState, VehicleConfig } from "./physics.ts";

/**
 * ASSISTED DESCENT (idealised): a simple feedback law with perfect knowledge of position and velocity.
 *  - Horizontal: desired velocity toward the target, proportional to distance (capped), then desired
 *    acceleration proportional to the velocity error (capped by the tilt limit).
 *  - Vertical: desired descent rate shrinking with altitude (≤ 25 m/s, ≥ 0.8 m/s near the ground),
 *    desired acceleration = gain × rate error + lunar gravity.
 *  - The desired thrust vector m·a gives throttle and tilt, which then pass through the same throttle limits
 *    and tilt-rate limit as manual control. No sensor noise, delay or estimation is modelled.
 */
export function assistedInput(s: SimState, v: VehicleConfig, g: number, target: [number, number] = [0, 0]): Input {
  const ex = target[0] - s.pos[0], ey = target[1] - s.pos[1];
  const dist = Math.hypot(ex, ey);
  const vMax = Math.min(12, 0.08 * dist);
  const vdx = dist > 0 ? (ex / dist) * vMax : 0, vdy = dist > 0 ? (ey / dist) * vMax : 0;
  let ax = 0.5 * (vdx - s.vel[0]), ay = 0.5 * (vdy - s.vel[1]);
  const alt = Math.max(0, s.altitudeM);
  // Hold some altitude while still far from the target, then descend.
  const vzTarget = -Math.max(0.8, Math.min(25, 0.12 * alt)) * (dist > 60 && alt < 60 ? 0.2 : 1);
  const az = 1.2 * (vzTarget - s.vel[2]) + g;
  const aHmax = Math.max(0, az) * Math.tan((v.maxTiltDeg * Math.PI) / 180);
  const aH = Math.hypot(ax, ay);
  if (aH > aHmax && aH > 0) { ax *= aHmax / aH; ay *= aHmax / aH; }
  const thrust = s.massKg * Math.hypot(ax, ay, Math.max(az, 0));
  const tilt = (Math.atan2(Math.hypot(ax, ay), Math.max(az, 1e-9)) * 180) / Math.PI;
  const azim = Math.atan2(ax, ay);
  return { throttle: Math.min(1, thrust / v.maxThrustN), tiltEastDeg: tilt * Math.sin(azim), tiltNorthDeg: tilt * Math.cos(azim) };
}
