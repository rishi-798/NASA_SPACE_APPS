import { DownloadSimple, Pause, Play, ArrowRight, ArrowCounterClockwise, Warning, Robot, GameController } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LandingScene } from "../components/landing/LandingScene";
import { loadBlenderTerrain } from "../components/landing/blenderTerrain";
import { hostedRemotely, sceneForLanding, sizeMb, TERRAIN_SCENES } from "../sim/terrainScenes";
import type * as THREE from "three";
import { SimCharts } from "../components/landing/SimCharts";
import { assistedInput } from "../sim/autopilot";
import { DEFAULT_INITIAL, DEFAULT_SETTINGS, DEMO_LIMITS, G0, ILLUSTRATIVE_LANDER, MOON_G, initialState, massFlow, validateConfig,
  type InitialConditions, type Input, type Limits, type VehicleConfig } from "../sim/physics";
import { createSim, recordedInputs, runHeadless, stepsFor, type RunRecord } from "../sim/runner";
import { createSnapshotStore, type SimPhase } from "../sim/store";
import { gridTerrain, syntheticPlane, type Terrain, type TerrainPatch } from "../sim/terrain";
import type { RocketChoice } from "../data/tripCatalogue";
import "../components/landing/landing.css";

/** Where the terrain comes from: a team measured-terrain model at this point, the LOLA 80 m grid, or a synthetic plane. */
type Scenario = "synthetic" | "scene" | "dem80";

/** The landing point chosen in the trip planner. The simulator is embedded as the trip's landing step. */
export type SimLanding = { latitude: number; longitude: number; name: string };
const DEM80_LATITUDE_LIMIT = -80.1;   // the LOLA 80 m grid covers poleward of about 80° S
function initialScenario(landing: SimLanding): { scenario: Scenario; note: string | null } {
  if (sceneForLanding(landing.latitude, landing.longitude)) return { scenario: "scene", note: null };
  if (landing.latitude <= DEM80_LATITUDE_LIMIT) return { scenario: "dem80", note: null };
  return { scenario: "synthetic", note: `Measured terrain is not available at ${landing.name}: the team's terrain models cover ${TERRAIN_SCENES.length} specific sites, and the LOLA elevation grid covers south of 80° S. You are on a synthetic training surface, not your chosen point.` };
}

const TARGET_RADIUS_M = 50;
const SPEEDS = [0.5, 1, 2, 4];
const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const simClock = (t: number) => `T+${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;

function NumberField({ label, unit, value, onChange, step = 1, min, max, hint }: { label: string; unit: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; hint?: string }) {
  return <label className="sim-field">
    <span>{label} <small>{unit}</small></span>
    <input type="number" value={Number.isFinite(value) ? value : ""} step={step} min={min} max={max}
      onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} title={hint} />
  </label>;
}

export function LandingSimPage({ landing, rocket, onContinue, onBack }: { landing: SimLanding; rocket: RocketChoice; onContinue?: () => void; onBack?: () => void }) {
  // ---------------------------------------------------------------- preflight configuration
  const [entry] = useState(() => initialScenario(landing));
  const scene = useMemo(() => sceneForLanding(landing.latitude, landing.longitude), [landing.latitude, landing.longitude]);
  const [scenario, setScenario] = useState<Scenario>(entry.scenario);
  const [slopeDeg, setSlopeDeg] = useState(0);
  const [slopeAzimuth, setSlopeAzimuth] = useState(90);
  const [vehicle, setVehicle] = useState<VehicleConfig>(ILLUSTRATIVE_LANDER);
  const [initial, setInitial] = useState<InitialConditions>(DEFAULT_INITIAL);
  const [limits, setLimits] = useState<Limits>(DEMO_LIMITS);
  const [mode, setMode] = useState<"manual" | "assisted">("assisted");
  const [patch, setPatch] = useState<{ scenario: Scenario; terrain?: Terrain; model?: THREE.Object3D; error?: string } | null>(null);
  const settings = DEFAULT_SETTINGS;
  const [vehicleStatus, setVehicleStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    if (scenario === "synthetic") return;
    const controller = new AbortController();
    const fail = (e: unknown) => { if (!controller.signal.aborted) setPatch({ scenario, error: e instanceof Error ? e.message : "Terrain unavailable." }); };
    if (scenario === "dem80") {
      const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
      fetch(`${base}/api/sim/terrain?lat=${landing.latitude}&lon=${landing.longitude}&half_size_m=2000`, { signal: controller.signal })
        .then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body?.detail ?? `Terrain service returned ${r.status}.`); return body as TerrainPatch; })
        .then((p) => setPatch({ scenario, terrain: gridTerrain(p, landing.name) }))
        .catch(fail);
    } else if (scene) {
      loadBlenderTerrain(scene, landing.name, controller.signal).then(({ terrain, model }) => setPatch({ scenario, terrain, model })).catch(fail);
    }
    return () => controller.abort();
  }, [scenario, landing, scene]);

  const synthetic = useMemo(() => { try { return syntheticPlane(slopeDeg, slopeAzimuth); } catch { return null; } }, [slopeDeg, slopeAzimuth]);
  const currentPatch = patch?.scenario === scenario ? patch : null;
  const terrain: Terrain | null = scenario === "synthetic" ? synthetic : currentPatch?.terrain ?? null;
  const terrainError = scenario === "synthetic" ? (synthetic ? null : "Synthetic slope must be 0–45°.") : currentPatch?.error ?? null;
  const errors = useMemo(() => validateConfig(vehicle, initial, settings, terrain), [vehicle, initial, settings, terrain]);

  // ---------------------------------------------------------------- one authoritative state
  const store = useMemo(() => createSnapshotStore({ state: initialState(ILLUSTRATIVE_LANDER, DEFAULT_INITIAL, syntheticPlane(0)), trail: [], events: [], phase: "idle", source: "preview" }), []);
  const snap = useSyncExternalStore(store.subscribe, store.get, store.get);
  const simRef = useRef<ReturnType<typeof createSim> | null>(null);
  const manual = useRef<Input>({ throttle: 0, tiltEastDeg: 0, tiltNorthDeg: 0 });
  const [manualView, setManualView] = useState<Input>(manual.current);
  const keys = useRef(new Set<string>());
  const [speed, setSpeed] = useState(1);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [replayCheck, setReplayCheck] = useState<Record<number, boolean>>({});
  const [replayT, setReplayT] = useState<number | null>(null);
  const [exaggeration, setExaggeration] = useState(1);
  const [overview, setOverview] = useState(false);
  const [landerScale, setLanderScale] = useState(4);
  const nextId = useRef(1);
  const phase: SimPhase = snap.phase;
  const record = runs.find((r) => r.id === selectedRun) ?? null;

  // Preview the start position whenever the configuration changes (not while running or replaying).
  useEffect(() => {
    if (!terrain || errors.length || phase === "running" || phase === "paused" || phase === "replay") return;
    if (phase === "ended") return;
    store.set({ state: initialState(vehicle, initial, terrain), trail: [], events: [], phase: "idle", source: "preview" });
  }, [terrain, vehicle, initial, errors.length, phase, store]);

  const publishLive = useCallback((p: SimPhase) => {
    const sim = simRef.current;
    if (!sim) return;
    const trail = store.get().trail;
    const last = trail.at(-1), s = sim.state;
    const nextTrail = !last || Math.hypot(s.pos[0] - last[0], s.pos[1] - last[1], s.pos[2] - last[2]) > 1 ? [...trail.slice(-3000), s.pos] : trail;
    store.set({ state: s, trail: nextTrail, events: [...sim.events], phase: p, source: "live" });
  }, [store]);

  const finishRun = useCallback(() => {
    const sim = simRef.current!;
    const id = nextId.current++;
    const rec = sim.record(id, `Run ${id}`, mode);
    // Determinism check: re-simulate the recorded inputs headlessly and compare.
    const again = runHeadless(rec.vehicle, rec.initial, rec.settings, terrain!, rec.limits, recordedInputs(rec.inputs)).record(0, "check", "recorded-inputs");
    setReplayCheck((m) => ({ ...m, [id]: JSON.stringify(again.final) === JSON.stringify(rec.final) && JSON.stringify(again.contact) === JSON.stringify(rec.contact) }));
    setRuns((list) => [...list, rec].slice(-8));
    setSelectedRun(id);
    publishLive("ended");
  }, [mode, terrain, publishLive]);

  // ---------------------------------------------------------------- live loop (fixed steps, render-rate independent)
  useEffect(() => {
    if (phase !== "running") return;
    let frame = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      const elapsed = Math.min(0.25, (now - last) / 1000);
      last = now;
      const sim = simRef.current;
      if (!sim) return;
      if (mode === "manual") {
        const k = keys.current, m = { ...manual.current };
        if (k.has("w")) m.throttle = Math.min(1, m.throttle + 0.6 * elapsed);
        if (k.has("s")) m.throttle = Math.max(0, m.throttle - 0.6 * elapsed);
        const rate = 20 * elapsed, lim = vehicle.maxTiltDeg;
        if (k.has("arrowright")) m.tiltEastDeg = Math.min(lim, m.tiltEastDeg + rate);
        if (k.has("arrowleft")) m.tiltEastDeg = Math.max(-lim, m.tiltEastDeg - rate);
        if (k.has("arrowup")) m.tiltNorthDeg = Math.min(lim, m.tiltNorthDeg + rate);
        if (k.has("arrowdown")) m.tiltNorthDeg = Math.max(-lim, m.tiltNorthDeg - rate);
        if (m.throttle !== manual.current.throttle || m.tiltEastDeg !== manual.current.tiltEastDeg || m.tiltNorthDeg !== manual.current.tiltNorthDeg) { manual.current = m; setManualView(m); }
      }
      const r = stepsFor(acc, elapsed, speed, settings.dtS);
      acc = r.accumulatorS;
      for (let i = 0; i < r.steps && !sim.ended; i++) sim.advance(mode === "assisted" ? assistedInput(sim.state, vehicle, settings.gravity) : manual.current);
      if (sim.ended) { finishRun(); return; }
      publishLive("running");
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, speed, mode, vehicle, settings, finishRun, publishLive]);

  // ---------------------------------------------------------------- replay of a recorded run (plays stored states)
  useEffect(() => {
    if (phase !== "replay" || !record) return;
    let frame = 0, last = performance.now();
    let t = replayT ?? 0;
    const loop = (now: number) => {
      t = Math.min(record.final.t, t + ((now - last) / 1000) * speed);
      last = now;
      showReplayAt(record, t);
      if (t >= record.final.t) { store.set({ ...store.get(), phase: "ended" }); return; }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, record, speed]);

  function showReplayAt(rec: RunRecord, t: number) {
    let lo = 0, hi = rec.samples.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (rec.samples[mid]!.t <= t) lo = mid; else hi = mid - 1; }
    const s = rec.samples[lo]!;
    const trail = rec.samples.slice(0, lo + 1).filter((_, i) => i % 10 === 0).map((x) => x.pos);
    store.set({ state: s, trail: [...trail, s.pos], events: rec.events.filter((e) => e.t <= s.t), phase: store.get().phase === "replay" ? "replay" : "ended", source: "replay" });
    setReplayT(t);
  }

  // ---------------------------------------------------------------- controls
  const start = () => {
    if (!terrain || errors.length) return;
    if (phase === "paused") { store.set({ ...store.get(), phase: "running" }); return; }
    manual.current = { throttle: 0, tiltEastDeg: 0, tiltNorthDeg: 0 };
    setManualView(manual.current);
    simRef.current = createSim(vehicle, initial, settings, terrain, limits);
    setReplayT(null);
    store.set({ state: simRef.current.state, trail: [simRef.current.state.pos], events: [], phase: "running", source: "live" });
  };
  const pause = () => { if (phase === "running") store.set({ ...store.get(), phase: "paused" }); };
  const reset = () => {
    simRef.current = null;
    setReplayT(null);
    if (terrain && !errors.length) store.set({ state: initialState(vehicle, initial, terrain), trail: [], events: [], phase: "idle", source: "preview" });
  };
  const stopRun = () => { const sim = simRef.current; if (sim && (phase === "running" || phase === "paused")) { sim.stop(); finishRun(); } };
  const replay = () => { if (!record) return; setReplayT(0); store.set({ ...store.get(), phase: "replay" }); };

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k) && (phase === "running" || phase === "paused")) e.preventDefault();
      if (k === " ") { if (phase === "running") pause(); else if (phase === "paused" || phase === "idle") start(); return; }
      if (k === "x") { manual.current = { ...manual.current, throttle: 0 }; setManualView(manual.current); }
      if (k === "z") { manual.current = { ...manual.current, throttle: 1 }; setManualView(manual.current); }
      if (k === "c") { manual.current = { ...manual.current, tiltEastDeg: 0, tiltNorthDeg: 0 }; setManualView(manual.current); }
      keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });

  // ---------------------------------------------------------------- one-change comparison
  const [changeParam, setChangeParam] = useState<"propellantKg" | "maxThrustN" | "dryMassKg" | "altitudeM" | "vz">("propellantKg");
  const [changeValue, setChangeValue] = useState(30);
  const rerun = () => {
    if (!record || !terrain || !Number.isFinite(changeValue)) return;
    const v = { ...record.vehicle }, init = structuredClone(record.initial);
    if (changeParam === "altitudeM") init.altitudeM = changeValue;
    else if (changeParam === "vz") init.velocity[2] = changeValue;
    else v[changeParam] = changeValue;
    const problems = validateConfig(v, init, record.settings, terrain);
    if (problems.length) { alert(problems.join("\n")); return; }
    const assisted = record.mode === "assisted";
    const sim = runHeadless(v, init, record.settings, terrain, record.limits, assisted ? (s) => assistedInput(s, v, record.settings.gravity) : recordedInputs(record.inputs));
    const id = nextId.current++;
    const label = `Run ${id}: ${CHANGE_LABEL[changeParam]} ${changeValue} (from run ${record.id})`;
    setRuns((list) => [...list, sim.record(id, label, assisted ? "assisted" : "recorded-inputs")].slice(-8));
    setSelectedRun(id);
    setReplayCheck((m) => ({ ...m, [id]: true }));
  };

  const exportRun = (rec: RunRecord) => {
    const blob = new Blob([JSON.stringify({ ...rec, model: modelSummary(terrain?.halfSizeM ?? null), notice: rec.terrainKind === "synthetic" ? "SYNTHETIC TRAINING SCENARIO: not a real lunar site." : `${rec.terrainLabel}: regional slope only.` }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `landing-sim-run-${rec.id}${rec.terrainKind === "synthetic" ? "-SYNTHETIC" : ""}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const s = snap.state;
  const hSpeed = Math.hypot(s.vel[0], s.vel[1]);
  const twr = vehicle.maxThrustN / (s.massKg * MOON_G);
  const running = phase === "running" || phase === "paused";
  const lockedConfig = running || phase === "replay";

  return <article className="sim-page sim-embedded">
    <header className="sim-header">
      <div>
        <p className="eyebrow">Educational prototype · not a validated flight simulator</p>
        <h2 className="sim-embedded-title">Descent over {landing.name}</h2>
        <p className="sim-lede">Final descent over a small square of terrain ({terrain ? `${(2 * terrain.halfSizeM) / 1000} km` : "up to 4 km"} across): lunar gravity, lander mass, thrust, fuel and terrain. 3-D point-mass motion with a simplified thrust-direction model.</p>
      </div>
      <p className="sim-timebase"><strong>Simulation time (T+)</strong> counts from the start of the descent. It is not linked to the UTC observation time chosen in the previous step.</p>
    </header>
    {onContinue && <nav className="sim-step-nav sim-step-nav-top" aria-label="Landing next step"><button type="button" className="sim-primary" onClick={onContinue}>Next: Overview <ArrowRight aria-hidden="true" /></button></nav>}
    {entry.note && <div className="sim-alert" role="status"><Warning aria-hidden="true" /> {entry.note}</div>}

    <div className="sim-layout">
      {/* ------------------------------------------------ preflight */}
      <aside className="sim-panel" aria-labelledby="preflight-title">
        <h2 id="preflight-title">Preflight</h2>
        <fieldset disabled={lockedConfig}>
          <label className="sim-field sim-field-wide"><span>Terrain</span>
            <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
              <option value="synthetic">Synthetic training scenario</option>
              {scene && <option value="scene">Real terrain: {landing.name} (team model, {scene.source_id.startsWith("sldem") ? "SLDEM2015" : scene.source_id.startsWith("ldem") ? "LOLA" : "measured DEM"} {Math.round(scene.source_spacing_m)} m, ≈{sizeMb(scene)} MB)</option>}
              {landing.latitude <= DEM80_LATITUDE_LIMIT && <option value="dem80">Real terrain: {landing.name} (LOLA 80 m grid)</option>}
            </select>
          </label>
          {scenario === "synthetic" && <div className="sim-grid2">
            <NumberField label="Slope" unit="°" value={slopeDeg} onChange={setSlopeDeg} min={0} max={45} />
            <NumberField label="Downhill toward" unit="° az" value={slopeAzimuth} onChange={setSlopeAzimuth} min={0} max={360} step={15} />
          </div>}
          {terrainError && <div className="sim-alert" role="alert"><Warning aria-hidden="true" /> {terrainError}
            {scenario === "scene" && landing.latitude <= DEM80_LATITUDE_LIMIT && <button type="button" onClick={() => setScenario("dem80")}>Use the LOLA 80 m grid for this point instead</button>}
            {scenario !== "synthetic" && <button type="button" onClick={() => setScenario("synthetic")}>Use the synthetic training scenario instead</button>}</div>}
          {scenario !== "synthetic" && !terrain && !terrainError && <p role="status" className="analysis-note">{scenario === "dem80" ? "Loading LOLA terrain…" : `Loading the measured terrain model (≈${scene ? sizeMb(scene) : 0} MB${scene && hostedRemotely(scene) ? ", from the team's GitHub" : ""}) and building its surface…`}</p>}

          <h3>{vehicle.name} <span className="sim-tag">illustrative</span></h3>
          <div className="sim-grid2">
            <NumberField label="Dry mass" unit="kg" value={vehicle.dryMassKg} onChange={(v) => setVehicle({ ...vehicle, dryMassKg: v })} step={50} />
            <NumberField label="Propellant" unit="kg" value={vehicle.propellantKg} onChange={(v) => setVehicle({ ...vehicle, propellantKg: v })} step={5} />
            <NumberField label="Max thrust" unit="N" value={vehicle.maxThrustN} onChange={(v) => setVehicle({ ...vehicle, maxThrustN: v })} step={100} />
            <NumberField label="Min throttle" unit="0–1" value={vehicle.minThrottle} onChange={(v) => setVehicle({ ...vehicle, minThrottle: v })} step={0.05} />
            <NumberField label="Specific impulse" unit="s" value={vehicle.ispS} onChange={(v) => setVehicle({ ...vehicle, ispS: v })} step={5} />
            <NumberField label="Max tilt" unit="°" value={vehicle.maxTiltDeg} onChange={(v) => setVehicle({ ...vehicle, maxTiltDeg: v })} />
          </div>
          <p className="sim-derived">Thrust-to-weight at start: <strong className={vehicle.maxThrustN < (vehicle.dryMassKg + vehicle.propellantKg) * MOON_G ? "bad" : ""}>{fmt(vehicle.maxThrustN / ((vehicle.dryMassKg + vehicle.propellantKg) * MOON_G), 2)}</strong> (lunar) · full-throttle burn {fmt(vehicle.propellantKg / massFlow(vehicle.maxThrustN, vehicle.ispS), 0)} s · Δv {fmt(vehicle.ispS * G0 * Math.log((vehicle.dryMassKg + vehicle.propellantKg) / vehicle.dryMassKg), 0)} m/s</p>

          <h3>Start</h3>
          <div className="sim-grid2">
            <NumberField label="Altitude" unit="m" value={initial.altitudeM} onChange={(v) => setInitial({ ...initial, altitudeM: v })} step={10} />
            <NumberField label="East of target" unit="m" value={initial.eastM} onChange={(v) => setInitial({ ...initial, eastM: v })} step={10} />
            <NumberField label="North of target" unit="m" value={initial.northM} onChange={(v) => setInitial({ ...initial, northM: v })} step={10} />
            <NumberField label="Velocity east" unit="m/s" value={initial.velocity[0]} onChange={(v) => setInitial({ ...initial, velocity: [v, initial.velocity[1], initial.velocity[2]] })} />
            <NumberField label="Velocity north" unit="m/s" value={initial.velocity[1]} onChange={(v) => setInitial({ ...initial, velocity: [initial.velocity[0], v, initial.velocity[2]] })} />
            <NumberField label="Vertical velocity" unit="m/s" value={initial.velocity[2]} onChange={(v) => setInitial({ ...initial, velocity: [initial.velocity[0], initial.velocity[1], v] })} />
          </div>

          <h3>Touchdown limits <span className="sim-tag">demonstration setting</span></h3>
          <div className="sim-grid2">
            <NumberField label="Vertical speed ≤" unit="m/s" value={limits.maxVerticalSpeed} onChange={(v) => setLimits({ ...limits, maxVerticalSpeed: v })} step={0.1} />
            <NumberField label="Horizontal speed ≤" unit="m/s" value={limits.maxHorizontalSpeed} onChange={(v) => setLimits({ ...limits, maxHorizontalSpeed: v })} step={0.1} />
            <NumberField label="Slope ≤" unit="°" value={limits.maxSlopeDeg} onChange={(v) => setLimits({ ...limits, maxSlopeDeg: v })} />
            <NumberField label="Impact above" unit="m/s down" value={limits.impactVerticalSpeed} onChange={(v) => setLimits({ ...limits, impactVerticalSpeed: v })} step={0.5} />
          </div>

          <h3>Control</h3>
          <div className="sim-toggle" role="radiogroup" aria-label="Control mode">
            <button type="button" role="radio" aria-checked={mode === "manual"} onClick={() => setMode("manual")}><GameController aria-hidden="true" /> Manual</button>
            <button type="button" role="radio" aria-checked={mode === "assisted"} onClick={() => setMode("assisted")}><Robot aria-hidden="true" /> Assisted descent</button>
          </div>
          <p className="analysis-note">{mode === "assisted" ? "Idealised autopilot with perfect knowledge of position and velocity; it obeys the same throttle and tilt limits." : "You fly: W/S throttle, arrow keys tilt the thrust, X cut, Z full, C centre tilt."}</p>
        </fieldset>
        {errors.length > 0 && terrain && <ul className="sim-errors" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      </aside>

      {/* ------------------------------------------------ scene + controls */}
      <section className="sim-main" aria-label="Simulation view">
        <div className="sim-stage">
          {terrain ? <LandingScene terrain={terrain} store={store} exaggeration={exaggeration} targetRadiusM={TARGET_RADIUS_M} padRadiusM={vehicle.padRadiusM} overview={overview} landerScale={landerScale}
            terrainModel={scenario === "scene" ? currentPatch?.model ?? null : null}
            vehicleModelUrl={rocket.model} onVehicleStatus={setVehicleStatus} />
            : <div className="sim-scene sim-scene-empty">{terrainError ?? "Loading terrain…"}</div>}
          {vehicleStatus !== "ready" && terrain && <p className="sim-model-status" role="status">{vehicleStatus === "loading" ? `Loading selected ${rocket.name} model…` : `The selected ${rocket.name} model is unavailable; contact discs show the position. No substitute rocket is shown.`}</p>}
          {terrain && <p className={`sim-badge ${terrain.kind === "synthetic" ? "sim-badge-synthetic" : ""}`}>{terrain.kind === "synthetic" ? "SYNTHETIC TRAINING SCENARIO · not a real site" : terrain.label}</p>}
          <dl className="sim-hud" aria-live="off">
            <div><dt>Sim time</dt><dd>{simClock(s.t)}</dd></div>
            <div><dt>Altitude</dt><dd>{fmt(Math.max(0, s.altitudeM))} m</dd></div>
            <div><dt>Vertical</dt><dd className={-s.vel[2] > limits.maxVerticalSpeed && s.altitudeM < 30 ? "warn" : ""}>{-s.vel[2] >= 0 ? `${fmt(-s.vel[2])} m/s ↓` : `${fmt(s.vel[2])} m/s ↑`}</dd></div>
            <div><dt>Horizontal</dt><dd>{fmt(hSpeed)} m/s</dd></div>
            <div><dt>Thrust</dt><dd>{fmt(s.thrustN, 0)} N ({fmt(s.throttle * 100, 0)}%)</dd></div>
            <div><dt>Mass</dt><dd>{fmt(s.massKg, 1)} kg</dd></div>
            <div><dt>Fuel</dt><dd className={s.propellantKg <= vehicle.propellantKg * 0.15 ? "warn" : ""}>{fmt(s.propellantKg, 1)} kg</dd></div>
            <div><dt>To target</dt><dd>{fmt(Math.hypot(s.pos[0], s.pos[1]), 0)} m</dd></div>
            <div><dt>Tilt</dt><dd>{fmt(Math.hypot(s.tilt[0], s.tilt[1]), 1)}°</dd></div>
            <div><dt>T/W (lunar)</dt><dd className={twr < 1 && s.propellantKg > 0 ? "warn" : ""}>{fmt(s.thrustN / (s.massKg * MOON_G), 2)} / {fmt(twr, 2)}</dd></div>
          </dl>
          {snap.source === "replay" && <p className="sim-replay-flag">REPLAY · recorded states</p>}
        </div>

        <div className="sim-controls">
          {!running && phase !== "replay" && <button type="button" className="sim-primary" onClick={start} disabled={!terrain || errors.length > 0}><Play weight="fill" aria-hidden="true" /> Start</button>}
          {phase === "running" && <button type="button" className="sim-primary" onClick={pause}><Pause weight="fill" aria-hidden="true" /> Pause</button>}
          {phase === "paused" && <button type="button" className="sim-primary" onClick={start}><Play weight="fill" aria-hidden="true" /> Resume</button>}
          {running && <button type="button" onClick={stopRun}>End run</button>}
          <button type="button" onClick={reset} disabled={phase === "replay"}><ArrowCounterClockwise aria-hidden="true" /> Reset</button>
          <label className="sim-inline">Speed <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{SPEEDS.map((v) => <option key={v} value={v}>{v}×</option>)}</select></label>
          <label className="sim-inline">Height exaggeration <select value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))}>{[1, 2, 5].map((v) => <option key={v} value={v}>{v}× {v === 1 ? "(true scale)" : "(visual only)"}</option>)}</select></label>
          <label className="sim-inline">Model size <select value={landerScale} onChange={(e) => setLanderScale(Number(e.target.value))}>{[1, 2, 4, 6].map((v) => <option key={v} value={v}>{v === 1 ? "1× (6 m display height)" : `${v}× (visual only)`}</option>)}</select></label>
          <label className="sim-inline"><input type="checkbox" checked={overview} onChange={(e) => setOverview(e.target.checked)} /> Overview camera</label>
        </div>

        <p className="analysis-note">Neutral-gray dust and clustered gravel are illustrative shading and decoration; contact uses the underlying terrain. Low-angle sunlight in this simulator is illustrative, not date-calculated.</p>
        <p className="analysis-note sim-model-note"><strong>Visual only: {rocket.name}</strong> ({rocket.modelCredit}), the same selected model as the flight, drawn {6 * landerScale} m tall. It does not set the mass, thrust or fuel. The physics always uses the illustrative lander in Preflight.</p>

        {mode === "manual" && <div className="sim-manual" aria-label="Manual controls">
          <label>Throttle <strong>{fmt(manualView.throttle * 100, 0)}%</strong>
            <input type="range" min={0} max={1} step={0.01} value={manualView.throttle} onChange={(e) => { manual.current = { ...manual.current, throttle: Number(e.target.value) }; setManualView(manual.current); }} /></label>
          <label>Tilt east (+) / west (−) <strong>{fmt(manualView.tiltEastDeg, 1)}°</strong>
            <input type="range" min={-vehicle.maxTiltDeg} max={vehicle.maxTiltDeg} step={0.5} value={manualView.tiltEastDeg} onChange={(e) => { manual.current = { ...manual.current, tiltEastDeg: Number(e.target.value) }; setManualView(manual.current); }} /></label>
          <label>Tilt north (+) / south (−) <strong>{fmt(manualView.tiltNorthDeg, 1)}°</strong>
            <input type="range" min={-vehicle.maxTiltDeg} max={vehicle.maxTiltDeg} step={0.5} value={manualView.tiltNorthDeg} onChange={(e) => { manual.current = { ...manual.current, tiltNorthDeg: Number(e.target.value) }; setManualView(manual.current); }} /></label>
          <p className="sim-keys"><kbd>W</kbd>/<kbd>S</kbd> throttle · <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> tilt thrust · <kbd>Z</kbd> full · <kbd>X</kbd> cut · <kbd>C</kbd> centre tilt · <kbd>Space</kbd> start/pause. Thrust tilted east pushes the lander east. Commanded tilt is reached at ≤ {vehicle.tiltRateDegS}°/s; throttle below {vehicle.minThrottle * 100}% (but above 0) is raised to {vehicle.minThrottle * 100}%.</p>
        </div>}

        <section className="sim-events" aria-label="Events">
          <h3>Events</h3>
          {snap.events.length === 0 ? <p className="analysis-note">None yet.</p> : <ol>{snap.events.map((e, i) => <li key={i} className={`sim-event-${e.kind}`}><time>{simClock(e.t)}</time> {e.detail}</li>)}</ol>}
        </section>
      </section>
    </div>

    {/* ------------------------------------------------ outcome, plots, replay */}
    {record && <section className="sim-report" aria-labelledby="report-title">
      <div className="sim-report-head">
        <div><p className="eyebrow">{record.label} · {record.terrainLabel} · {record.mode === "assisted" ? "assisted descent" : record.mode === "manual" ? "manual control" : "same recorded pilot inputs"}</p>
          <h2 id="report-title" className={`outcome outcome-${record.outcome?.kind}`}>{record.outcome?.title}</h2></div>
        <div className="sim-report-actions">
          <button type="button" onClick={replay} disabled={running || phase === "replay"}><Play aria-hidden="true" /> Replay</button>
          <button type="button" onClick={() => exportRun(record)}><DownloadSimple aria-hidden="true" /> Export JSON</button>
        </div>
      </div>
      <p>{record.outcome?.explanation}</p>
      {record.outcome && record.outcome.checks.length > 0 && <table className="sim-checks">
        <thead><tr><th>Configured limit</th><th>Recorded</th><th>Limit</th><th>Result</th></tr></thead>
        <tbody>{record.outcome.checks.map((c) => <tr key={c.name}><th scope="row">{c.name}</th><td>{c.value === null ? "unknown" : `${c.value.toFixed(2)} ${c.unit}`}</td><td>{c.limit} {c.unit}</td>
          <td className={c.met === null ? "unknown" : c.met ? "met" : "exceeded"}>{c.met === null ? "not assessed" : c.met ? "met" : "exceeded"}</td></tr>)}</tbody>
      </table>}
      <dl className="sim-facts">
        {record.contact ? <>
          <div><dt>Touchdown</dt><dd>{simClock(record.contact.t)} at {fmt(record.contact.pos[0], 1)} m east, {fmt(record.contact.pos[1], 1)} m north ({fmt(Math.hypot(record.contact.pos[0], record.contact.pos[1]), 1)} m from target{Math.hypot(record.contact.pos[0], record.contact.pos[1]) <= TARGET_RADIUS_M ? ", inside the 50 m target area" : ""})</dd></div>
          <div><dt>Touchdown speeds</dt><dd>{fmt(record.contact.verticalSpeed, 2)} m/s down · {fmt(record.contact.horizontalSpeed, 2)} m/s across</dd></div>
          <div><dt>Terrain slope</dt><dd>{record.contact.slope ? `${fmt(record.contact.slope.deg, 2)}° — ${record.contact.slope.method}${Number.isFinite(record.contact.slope.scaleM) ? `, ${record.contact.slope.scaleM} m across` : ""}` : "not available at this point"}</dd></div>
        </> : <div><dt>Ended</dt><dd>{simClock(record.final.t)} without touchdown</dd></div>}
        <div><dt>Propellant</dt><dd>{fmt(record.vehicle.propellantKg - record.final.propellantKg, 1)} kg used · {fmt(record.final.propellantKg, 1)} kg left of {record.vehicle.propellantKg}</dd></div>
        <div><dt>Replay check</dt><dd>{replayCheck[record.id] ? "Re-simulated from the recorded inputs: identical trajectory" : "Re-simulation differed"}</dd></div>
        <div><dt>Limits source</dt><dd>{record.limits.source}</dd></div>
      </dl>
      {record.terrainKind !== "synthetic" && <p className="analysis-note">Slope is a regional estimate from {record.terrainKind === "blender" ? "the terrain model's" : "80 m LOLA"} samples. Boulders and craters smaller than a few hundred metres are not resolved, so this is not a landing-hazard assessment.</p>}
      <SimCharts samples={record.samples} cursorT={snap.source === "replay" ? snap.state.t : null} />
      {snap.source === "replay" && <label className="sim-scrub">Replay position
        <input type="range" min={0} max={record.final.t} step={0.02} value={replayT ?? 0} onChange={(e) => { store.set({ ...store.get(), phase: "ended" }); showReplayAt(record, Number(e.target.value)); }} /></label>}
    </section>}

    {runs.length > 0 && <section className="sim-compare" aria-labelledby="compare-title">
      <h2 id="compare-title">Compare runs</h2>
      {record && <div className="sim-rerun">
        <span>Repeat the selected run with one change:</span>
        <select value={changeParam} onChange={(e) => setChangeParam(e.target.value as typeof changeParam)} aria-label="Parameter to change">
          {Object.entries(CHANGE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input type="number" value={changeValue} onChange={(e) => setChangeValue(Number(e.target.value))} aria-label="New value" />
        <button type="button" onClick={rerun} disabled={running || phase === "replay"}>Run</button>
        <small>{record.mode === "assisted" ? "Uses the same assisted-descent controller." : "Replays the same recorded pilot inputs with the changed vehicle."}</small>
      </div>}
      <div className="comparison-scroll"><table className="sim-runs">
        <thead><tr><th>Run</th><th>Terrain</th><th>Propellant</th><th>Max thrust</th><th>Outcome</th><th>Down m/s</th><th>Across m/s</th><th>Fuel left</th><th>To target</th></tr></thead>
        <tbody>{runs.map((r) => <tr key={r.id} className={r.id === selectedRun ? "selected" : ""} onClick={() => setSelectedRun(r.id)}>
          <td><button type="button" onClick={() => setSelectedRun(r.id)} aria-pressed={r.id === selectedRun}>{r.label}</button></td>
          <td>{r.terrainKind === "synthetic" ? "Synthetic" : r.terrainLabel.replace("Real terrain: ", "")}</td>
          <td>{r.vehicle.propellantKg} kg</td><td>{r.vehicle.maxThrustN} N</td>
          <td className={`outcome-${r.outcome?.kind}`}>{r.outcome?.title}</td>
          <td>{r.contact ? fmt(r.contact.verticalSpeed, 2) : "—"}</td><td>{r.contact ? fmt(r.contact.horizontalSpeed, 2) : "—"}</td>
          <td>{fmt(r.final.propellantKg, 1)} kg</td><td>{r.contact ? `${fmt(Math.hypot(r.contact.pos[0], r.contact.pos[1]), 0)} m` : "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    <div className="sim-step-nav">
      {onBack && <button type="button" onClick={onBack}>Back to flight</button>}
      {onContinue && <button type="button" className="sim-primary" onClick={onContinue}>Next: Overview <ArrowRight aria-hidden="true" /></button>}
      <small>The simulation is optional: you can continue at any time.</small>
    </div>

    <section className="sim-assumptions" aria-labelledby="assumptions-title">
      <h2 id="assumptions-title">Model, assumptions and sources</h2>
      <ul>{modelSummary(terrain?.halfSizeM ?? null).map((line) => <li key={line}>{line}</li>)}</ul>
      {terrain && <p className="analysis-note">Terrain: {terrain.label}. Source: {terrain.source}. {terrain.sampleSpacingM ? `Sample spacing ${terrain.sampleSpacingM} m; slope from a 3×3 neighbourhood (${2 * terrain.sampleSpacingM} m across). ${terrain.kind === "blender" ? "Points without mesh coverage (100 m check grid)" : "Missing cells"}: ${terrain.missingCells}.` : "Exact plane; no data gaps."} {terrain.notes.join(" ")}</p>}
    </section>
  </article>;
}

const CHANGE_LABEL = { propellantKg: "Propellant (kg)", maxThrustN: "Max thrust (N)", dryMassKg: "Dry mass (kg)", altitudeM: "Start altitude (m)", vz: "Start vertical velocity (m/s)" } as const;

const modelSummary = (halfSizeM: number | null) => [
  `3-D point-mass translation in a local flat frame centred on the target (x east, y north, z up), SI units, fixed ${DEFAULT_SETTINGS.dtS} s timestep, classical RK4.`,
  `Constant lunar gravity ${MOON_G} m/s² (NASA Moon facts), straight down. Over 3 km of altitude, real gravity changes by under 0.4%, and over the 4 km area its direction by under 0.07°. No atmosphere, so no drag.`,
  `Propellant flow ṁ = F / (Isp · g0) with g0 = ${G0} m/s², the standard-gravity convention for Isp in seconds (NASA GRC). Lunar gravity appears only in the motion.`,
  "Mass = dry mass + remaining propellant. Throttle is bounded 0–1, with a minimum non-zero setting. The engine stops at the exact moment the propellant runs out, and the lander keeps moving under gravity.",
  "Simplified attitude: the thrust direction follows the commanded tilt at a limited rate. No rotational dynamics, moments of inertia, RCS or attitude errors.",
  "Contact: four rigid footpads held level; the run stops at the first pad contact, found inside the timestep. No leg suspension, bounce, tipping, structural damage, plume–surface interaction, dust or sensor uncertainty.",
  `Supported domain: ${halfSizeM ? (2 * halfSizeM) / 1000 : 4} km × ${halfSizeM ? (2 * halfSizeM) / 1000 : 4} km around the target (smaller where a terrain model covers less), altitude up to 3 km, up to 600 s.`,
  "Real terrain: the team's measured-terrain Blender models (LOLA 60 m near the south pole, SLDEM2015 59 m elsewhere, a 5 m DEM at G7; each checksum-verified; contact uses the drawn triangles) or the LOLA 80 m grid (NASA GSFC PGDA). All include lunar curvature. Slope is regional (two sample spacings across) and does not resolve footprint-scale hazards.",
  "Vehicle physics: an illustrative lander, not any real spacecraft. The selected rocket model is visual only; its mass and engines are not used. Touchdown limits are demonstration settings.",
];
