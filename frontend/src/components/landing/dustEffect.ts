import * as THREE from "three";
import type { Vec3 } from "../../sim/physics";
import type { Snapshot } from "../../sim/store";

/**
 * Plume–surface dust (VISUAL ONLY: it never feeds back into the simulation).
 *
 * Behaviour follows what lunar landings show: dust starts lifting when the engine fires within about 30 m of the
 * surface and grows with throttle as the lander gets lower. With no air, grains fly on ballistic arcs under lunar
 * gravity: most go out in a thin, fast sheet at a few degrees above the ground; a slower, puffier component near the
 * impingement point gives the visible cloud. A short burst marks touchdown. Particles move in simulation time, so they
 * freeze when paused and follow replays; after a run ends they settle in real time.
 */
export type DustOptions = {
  heightAt: (x: number, y: number) => number;
  toThree: (p: Vec3) => THREE.Vector3;
  gravity: number;
  /** Visual scale of the drawn vehicle; spreads the source footprint and grain size to match. */
  scale: number;
  maxParticles?: number;
};

const START_ALTITUDE_M = 30;
const SHEET_RATE = 1400;   // particles per second at full throttle on the ground
const CLOUD_RATE = 260;

export function createDustEffect({ heightAt, toThree, gravity, scale, maxParticles = 7000 }: DustOptions) {
  const n = maxParticles;
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);   // simulation frame (east, north, up)
  const age = new Float32Array(n), life = new Float32Array(n), size0 = new Float32Array(n);
  const drawPos = new Float32Array(n * 3), alpha = new Float32Array(n), size = new Float32Array(n);
  const tint = new Float32Array(n);
  let alive = 0, emitCarry = 0, lastSimT: number | null = null, lastReal = performance.now(), wasLive = false;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(drawPos, 3));
  geometry.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  geometry.setAttribute("size", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("tint", new THREE.BufferAttribute(tint, 1));
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { colour: { value: new THREE.Color(0xc8bfb0) }, pixelScale: { value: 600 } },
    vertexShader: `
      attribute float alpha; attribute float size; attribute float tint;
      varying float vAlpha; varying float vTint;
      uniform float pixelScale;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(size * pixelScale / max(1.0, -mv.z), 1.0, 90.0);
        vAlpha = alpha; vTint = tint;
      }`,
    fragmentShader: `
      uniform vec3 colour; varying float vAlpha; varying float vTint;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c) * 4.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(colour * vTint, vAlpha * (1.0 - d) * (1.0 - d));
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;

  function spawn(cx: number, cy: number, ground: number, kind: "sheet" | "cloud" | "burst") {
    if (alive >= n) return;
    const i = alive++;
    const az = Math.random() * Math.PI * 2;
    const r0 = (1.5 + Math.random() * 3.5) * scale;
    const speed = kind === "sheet" ? 18 + Math.random() * 45 : kind === "cloud" ? 1.5 + Math.random() * 7 : 1 + Math.random() * 4;
    const elev = ((kind === "sheet" ? 1 + Math.random() * 7 : 10 + Math.random() * 30) * Math.PI) / 180;
    pos[i * 3] = cx + Math.cos(az) * r0;
    pos[i * 3 + 1] = cy + Math.sin(az) * r0;
    pos[i * 3 + 2] = ground + 0.05;
    vel[i * 3] = Math.cos(az) * Math.cos(elev) * speed;
    vel[i * 3 + 1] = Math.sin(az) * Math.cos(elev) * speed;
    vel[i * 3 + 2] = Math.sin(elev) * speed;
    age[i] = 0;
    life[i] = kind === "sheet" ? 1.2 + Math.random() * 1.8 : 2.2 + Math.random() * 2.5;
    size0[i] = (kind === "sheet" ? 0.25 + Math.random() * 0.4 : 0.9 + Math.random() * 1.6) * scale;
    tint[i] = 0.75 + Math.random() * 0.35;
  }

  function step(dt: number) {
    let w = 0;
    for (let i = 0; i < alive; i++) {
      age[i] += dt;
      vel[i * 3 + 2] -= gravity * dt;                       // ballistic: no air drag on the Moon
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const g = heightAt(pos[i * 3], pos[i * 3 + 1]);
      if (Number.isFinite(g) && pos[i * 3 + 2] < g) { pos[i * 3 + 2] = g; vel[i * 3] *= 0.3; vel[i * 3 + 1] *= 0.3; vel[i * 3 + 2] = 0; age[i] = Math.max(age[i], life[i] * 0.8); }
      if (age[i] >= life[i] || !Number.isFinite(g)) continue;
      if (w !== i) {                                       // compact the live particles to the front
        for (let k = 0; k < 3; k++) { pos[w * 3 + k] = pos[i * 3 + k]; vel[w * 3 + k] = vel[i * 3 + k]; }
        age[w] = age[i]; life[w] = life[i]; size0[w] = size0[i]; tint[w] = tint[i];
      }
      w++;
    }
    alive = w;
  }

  function writeGeometry() {
    for (let i = 0; i < alive; i++) {
      const p = toThree([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
      drawPos[i * 3] = p.x; drawPos[i * 3 + 1] = p.y; drawPos[i * 3 + 2] = p.z;
      const f = age[i] / life[i];
      alpha[i] = Math.min(1, age[i] * 8) * (1 - f) * 0.55;     // quick fade-in, slow fade-out
      size[i] = size0[i] * (1 + 1.6 * f);                         // spreads as it travels
    }
    geometry.setDrawRange(0, alive);
    for (const name of ["position", "alpha", "size", "tint"]) (geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  return {
    points,
    update(snap: Snapshot) {
      const now = performance.now();
      const realDt = Math.min(0.1, (now - lastReal) / 1000);
      lastReal = now;
      const s = snap.state;
      const live = snap.phase === "running" || snap.phase === "replay";
      let dt: number;
      if (lastSimT === null || snap.phase === "idle") dt = 0;
      else if (live || snap.phase === "paused") dt = s.t - lastSimT;
      else dt = realDt;                                     // run over: let the dust settle
      if (dt < 0 || snap.phase === "idle") { alive = 0; dt = 0; }   // scrubbed back, reset or new run
      lastSimT = s.t;
      dt = Math.min(dt, 0.25);
      if (dt > 0) {
        step(dt);
        const altitude = Math.max(0, s.altitudeM);
        const ground = heightAt(s.pos[0], s.pos[1]);
        if (live && s.thrustN > 0 && altitude < START_ALTITUDE_M && Number.isFinite(ground)) {
          const strength = s.throttle * (1 - altitude / START_ALTITUDE_M) ** 2;
          emitCarry += (SHEET_RATE + CLOUD_RATE) * strength * dt;
          while (emitCarry >= 1) {
            spawn(s.pos[0], s.pos[1], ground, Math.random() < SHEET_RATE / (SHEET_RATE + CLOUD_RATE) ? "sheet" : "cloud");
            emitCarry -= 1;
          }
        }
      }
      // Touchdown puff: the run has just ended at the surface.
      if (wasLive && snap.phase === "ended" && snap.source === "live" && s.altitudeM <= 0.01) {
        const ground = heightAt(s.pos[0], s.pos[1]);
        if (Number.isFinite(ground)) for (let k = 0; k < 450; k++) spawn(s.pos[0], s.pos[1], ground, "burst");
      }
      wasLive = live;
      writeGeometry();
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
