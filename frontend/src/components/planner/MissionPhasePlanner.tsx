import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Play, Pause, ArrowCounterClockwise } from "@phosphor-icons/react";
import { MISSION_PHASES, type MissionPhase } from "./missionPhaseData";
import { CislunarOrbitalCanvas } from "./CislunarOrbitalCanvas";
import "./planner.css";

const TOTAL_MISSION_SECONDS = MISSION_PHASES.at(-1)!.endMetSeconds; // 80 hours in seconds

export function MissionPhasePlanner() {
  const [activePhaseId, setActivePhaseId] = useState<MissionPhase["id"]>("ascent");
  const [isPlaying, setIsPlaying] = useState(false);
  const [simMetSeconds, setSimMetSeconds] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 5 | 20 | 100>(5);
  const [activeTab, setActiveTab] = useState<"overview" | "mechanics" | "milestones" | "equations">("overview");
  const [cameraPreset, setCameraPreset] = useState<"system" | "earth" | "vehicle" | "moon">("earth");

  const timeRef = useRef(0);
  const lastTimestampRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  const activePhase = useMemo(
    () => MISSION_PHASES.find((p) => p.id === activePhaseId) ?? MISSION_PHASES[0]!,
    [activePhaseId]
  );

  // Jump to start of phase when selecting from rail
  const selectPhase = useCallback((phaseId: MissionPhase["id"]) => {
    setIsPlaying(false);
    setActivePhaseId(phaseId);
    const phase = MISSION_PHASES.find((p) => p.id === phaseId);
    if (phase) {
      timeRef.current = phase.startMetSeconds;
      setSimMetSeconds(phase.startMetSeconds);
    }
  }, []);

  // Format seconds to MET string T+DDd HH:MM:SS
  const formatMet = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `T+${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Interpolate active phase telemetry based on simMetSeconds
  const telemetry = useMemo(() => {
    const p = activePhase;
    const progress = Math.max(0, Math.min(1, (simMetSeconds - p.startMetSeconds) / Math.max(1, p.endMetSeconds - p.startMetSeconds)));

    const alt = p.initialAltitudeKm + (p.finalAltitudeKm - p.initialAltitudeKm) * progress;
    const vel = p.initialVelocityKmS + (p.finalVelocityKmS - p.initialVelocityKmS) * progress;

    let prevDeltaV = 0;
    for (const ph of MISSION_PHASES) {
      if (ph.phaseNumber < p.phaseNumber) {
        prevDeltaV += ph.deltaVBudgetMS;
      }
    }
    const currentDeltaV = prevDeltaV + p.deltaVBudgetMS * progress;

    let distEarthKm: number;
    let distMoonKm: number;
    if (p.id === "ascent" || p.id === "parking") {
      distEarthKm = 6371 + alt;
      distMoonKm = 384400 - alt;
    } else if (p.id === "tli" || p.id === "cruise") {
      const cruiseProg = (simMetSeconds - 9900) / (257400 - 9900);
      distEarthKm = 6371 + 380000 * Math.max(0, Math.min(1, Math.pow(cruiseProg, 0.75)));
      distMoonKm = Math.max(1837, 384400 - distEarthKm);
    } else {
      distEarthKm = 384400;
      distMoonKm = 1737 + alt;
    }

    return {
      progress,
      altitudeKm: alt,
      velocityKmS: vel,
      deltaVMs: currentDeltaV,
      distEarthKm,
      distMoonKm,
    };
  }, [activePhase, simMetSeconds]);

  // Main interactive playback ticker
  useEffect(() => {
    if (!isPlaying) {
      lastTimestampRef.current = 0;
      return;
    }

    const step = (timestamp: number) => {
      if (!lastTimestampRef.current) lastTimestampRef.current = timestamp;
      // Avoid a hidden-tab jump; all telemetry reads the same elapsed-time cursor.
      const deltaMs = Math.min(100, timestamp - lastTimestampRef.current);
      lastTimestampRef.current = timestamp;
      const speedMultiplier = playbackSpeed === 100 ? 7500 : playbackSpeed === 20 ? 1400 : playbackSpeed === 5 ? 280 : 60;
      const next = Math.min(TOTAL_MISSION_SECONDS, timeRef.current + (deltaMs / 1000) * speedMultiplier);
      timeRef.current = next;
      setSimMetSeconds(next);
      const matchingPhase = MISSION_PHASES.find((p) => next >= p.startMetSeconds && next < p.endMetSeconds) ?? MISSION_PHASES.at(-1)!;
      setActivePhaseId(matchingPhase.id);
      if (next >= TOTAL_MISSION_SECONDS) { setIsPlaying(false); return; }

      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      lastTimestampRef.current = 0;
    };
  }, [isPlaying, playbackSpeed]);

  return (
    <div className="planner-container">
      {/* 6-Phase Stepper Rail */}
      <nav className="planner-stepper" aria-label="Mission flight phases">
        {MISSION_PHASES.map((p) => {
          const isActive = p.id === activePhaseId;
          return (
            <button
              key={p.id}
              type="button"
              className={`planner-step-tab ${isActive ? "active" : ""}`}
              onClick={() => selectPhase(p.id)}
              aria-current={isActive ? "step" : undefined}
            >
              <span className="step-num">0{p.phaseNumber}</span>
              <span className="step-name">{p.shortName}</span>
              <span className="step-badge">
                {p.deltaVBudgetMS > 0 ? `${p.deltaVBudgetMS.toLocaleString()} m/s` : "Coast"}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Main Grid: 3D Viewport on Left, Telemetry & Dossier on Right */}
      <div className="planner-grid">
        {/* Left Column: 3D Trajectory Canvas */}
        <div className="planner-viewport">
          <CislunarOrbitalCanvas
            activePhaseId={activePhaseId}
            simMetSeconds={simMetSeconds}
            telemetry={telemetry}
            cameraPreset={cameraPreset}
            onCameraPresetChange={setCameraPreset}
          />

          {/* Top Viewport Header */}
          <div className="planner-vp-top">
            <div className="planner-vp-badge" aria-label="Illustrative flight scenario">
              <span className="vp-dot" />
              <span className="vp-label">
                Phase 0{activePhase.phaseNumber} · {activePhase.shortName.toUpperCase()} · {activePhase.durationLabel}
              </span>
            </div>

            {/* Camera Presets Segmented Bar */}
            <div className="planner-cam-bar" role="group" aria-label="Camera perspective">
              {(["system", "earth", "vehicle", "moon"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`cam-btn ${cameraPreset === preset ? "active" : ""}`}
                  aria-pressed={cameraPreset === preset}
                  onClick={() => setCameraPreset(preset)}
                >
                  {preset === "system" && "System"}
                  {preset === "earth" && "Earth"}
                  {preset === "vehicle" && "Craft"}
                  {preset === "moon" && "Moon"}
                </button>
              ))}
            </div>
          </div>

          {/* Floating Lower Telemetry Strip */}
          <div className="planner-vp-hud" aria-label="Illustrative flight telemetry">
            <div className="hud-metric">
              <span className="hud-title">REFERENCE MET</span>
              <span className="hud-val">{formatMet(simMetSeconds)}</span>
            </div>
            <div className="hud-metric">
              <span className="hud-title">VELOCITY</span>
              <span className="hud-val">
                {telemetry.velocityKmS.toFixed(2)} km/s
              </span>
            </div>
            <div className="hud-metric">
              <span className="hud-title">ALTITUDE</span>
              <span className="hud-val">
                {telemetry.altitudeKm >= 1000 ? `${(telemetry.altitudeKm / 1000).toFixed(1)}k km` : `${telemetry.altitudeKm.toFixed(1)} km`}
              </span>
            </div>
            <div className="hud-metric">
              <span className="hud-title">PROPULSION</span>
              <span className="hud-val hud-propulsion">
                {activePhase.telemetryProfile.engineStatus}
              </span>
            </div>
          </div>

          {/* Bottom Timeline Controls */}
          <div className="planner-timeline-bar">
            <div className="timeline-playback">
              <button
                type="button"
                className="btn-play"
                onClick={() => { if (timeRef.current >= TOTAL_MISSION_SECONDS) { timeRef.current = 0; setSimMetSeconds(0); setActivePhaseId("ascent"); } setIsPlaying((p) => !p); }}
                aria-label={isPlaying ? "Pause simulation" : "Play flight simulation"}
              >
                {isPlaying ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
                <span>{isPlaying ? "Pause" : "Play"}</span>
              </button>
              <button
                type="button"
                className="btn-reset"
                onClick={() => { setIsPlaying(false); timeRef.current = activePhase.startMetSeconds; setSimMetSeconds(activePhase.startMetSeconds); }}
                aria-label="Reset to start of active phase"
                title="Reset to start of active phase"
              >
                <ArrowCounterClockwise size={14} />
              </button>
            </div>

            <div className="timeline-track-wrap">
              <input
                type="range"
                className="timeline-slider"
                min={0}
                max={TOTAL_MISSION_SECONDS}
                step={30}
                value={simMetSeconds}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setIsPlaying(false);
                  timeRef.current = val;
                  setSimMetSeconds(val);
                  const matching = MISSION_PHASES.find((p) => val >= p.startMetSeconds && val < p.endMetSeconds) ?? MISSION_PHASES.at(-1);
                  if (matching && matching.id !== activePhaseId) {
                    setActivePhaseId(matching.id);
                  }
                }}
                aria-label="Mission Elapsed Time Scrubber"
              />
            </div>

            <div className="timeline-rates" role="group" aria-label="Simulation speed">
              {([1, 5, 20, 100] as const).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  className={`rate-btn ${playbackSpeed === spd ? "active" : ""}`}
                  aria-pressed={playbackSpeed === spd}
                  onClick={() => setPlaybackSpeed(spd)}
                >
                  {spd}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Mission Intelligence & Telemetry Dossier */}
        <aside className="planner-dossier">
          {/* Header */}
          <p className="pw-reference-note">REFERENCE SCENARIO · Estimates below are educational. The date-based SPICE transfer is available in Plan a trip.</p>
          <div className="dossier-head">
            <span className="dossier-tag">
              FLIGHT STAGE 0{activePhase.phaseNumber} · CISLUNAR ARCHITECTURE
            </span>
            <h2 className="dossier-title">{activePhase.name}</h2>
            <p className="dossier-tagline">{activePhase.tagline}</p>
          </div>

          {/* High-Density Telemetry Metrics Grid */}
          <div className="dossier-metrics-grid">
            <div className="metric-box">
              <span className="m-label">Δv BUDGET</span>
              <strong className="m-val">{activePhase.deltaVBudgetMS.toLocaleString()} <small>m/s</small></strong>
              <span className="m-sub">Cumulative: {Math.round(telemetry.deltaVMs).toLocaleString()} m/s</span>
            </div>

            <div className="metric-box">
              <span className="m-label">VELOCITY RANGE</span>
              <strong className="m-val">{activePhase.initialVelocityKmS} → {activePhase.finalVelocityKmS} <small>km/s</small></strong>
              <span className="m-sub">Current: {telemetry.velocityKmS.toFixed(2)} km/s</span>
            </div>

            <div className="metric-box">
              <span className="m-label">ALTITUDE</span>
              <strong className="m-val">
                {telemetry.altitudeKm >= 1000 ? `${(telemetry.altitudeKm / 1000).toFixed(1)}k` : telemetry.altitudeKm.toFixed(1)} <small>km</small>
              </strong>
              <span className="m-sub">Range: {activePhase.initialAltitudeKm} → {activePhase.finalAltitudeKm} km</span>
            </div>

            <div className="metric-box">
              <span className="m-label">EARTH DISTANCE</span>
              <strong className="m-val">{Math.round(telemetry.distEarthKm).toLocaleString()} <small>km</small></strong>
              <span className="m-sub">Geocentric radius</span>
            </div>

            <div className="metric-box">
              <span className="m-label">MOON DISTANCE</span>
              <strong className="m-val">{Math.round(telemetry.distMoonKm).toLocaleString()} <small>km</small></strong>
              <span className="m-sub">Illustrative distance to Moon centre</span>
            </div>

            <div className="metric-box">
              <span className="m-label">GRAVITY DOMAIN</span>
              <strong className="m-val text-accent">{activePhase.telemetryProfile.gravitationalDominance}</strong>
              <span className="m-sub">{activePhase.telemetryProfile.engineStatus}</span>
            </div>
          </div>

          {/* Segmented Scientific Tabs */}
          <div className="dossier-tabs" role="group" aria-label="Dossier categories">
            <button
              type="button"
              className={`tab-btn ${activeTab === "overview" ? "active" : ""}`}
              aria-pressed={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "mechanics" ? "active" : ""}`}
              aria-pressed={activeTab === "mechanics"}
              onClick={() => setActiveTab("mechanics")}
            >
              Mechanics
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "milestones" ? "active" : ""}`}
              aria-pressed={activeTab === "milestones"}
              onClick={() => setActiveTab("milestones")}
            >
              Milestones
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "equations" ? "active" : ""}`}
              aria-pressed={activeTab === "equations"}
              onClick={() => setActiveTab("equations")}
            >
              Equations
            </button>
          </div>

          {/* Tab Content Panes */}
          <div className="dossier-tab-body">
            {activeTab === "overview" && (
              <div className="tab-pane">
                <p className="pane-lead">{activePhase.overview}</p>
                <div className="pane-card">
                  <h4>Critical Engineering Challenges</h4>
                  <p>{activePhase.engineeringChallenges}</p>
                </div>
              </div>
            )}

            {activeTab === "mechanics" && (
              <div className="tab-pane">
                <p className="pane-lead">{activePhase.orbitalMechanics}</p>
                <div className="pane-card">
                  <div className="metric-kv">
                    <span className="kv-label">Primary Orbital Metric:</span>
                    <strong className="kv-val">{activePhase.telemetryProfile.primaryMetric}</strong>
                  </div>
                  <div className="metric-kv">
                    <span className="kv-label">Benchmark Value:</span>
                    <strong className="kv-val text-accent">{activePhase.telemetryProfile.primaryValue}</strong>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "milestones" && (
              <div className="tab-pane milestones-pane">
                <div className="milestones-track">
                  {activePhase.milestones.map((m, idx) => (
                    <div key={idx} className="milestone-row">
                      <div className="m-node">
                        <span className="m-dot" />
                      </div>
                      <div className="m-content">
                        <div className="m-header">
                          <span className="m-time">{m.timeMet}</span>
                          <strong className="m-name">{m.name}</strong>
                          <span className="m-telemetry">
                            {m.altitudeKm} km · {m.velocityKmS} km/s
                          </span>
                        </div>
                        <p className="m-desc">{m.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "equations" && (
              <div className="tab-pane equations-pane">
                {activePhase.keyEquations.map((eq, idx) => (
                  <div key={idx} className="equation-card">
                    <div className="eq-top">
                      <strong className="eq-name">{eq.name}</strong>
                    </div>
                    <div className="eq-formula-box">
                      <code>{eq.formula || eq.latex}</code>
                    </div>
                    <p className="eq-meaning">{eq.meaning}</p>
                    {eq.variables && eq.variables.length > 0 && (
                      <dl className="eq-vars-list">
                        {eq.variables.map((v, vIdx) => (
                          <div key={vIdx} className="eq-var-item">
                            <dt>{v.symbol}</dt>
                            <dd>{v.label}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workflow Handoff Link Button */}
          <div className="dossier-handoff">
            {activePhase.id === "descent" && (
              <Link to="/landing" className="btn-handoff">
                Launch 6DOF Landing Simulator <ArrowRight size={16} />
              </Link>
            )}
            {(activePhase.id === "tli" || activePhase.id === "cruise") && (
              <Link to="/trip" className="btn-handoff">
                Plan Numerical Transfer Route <ArrowRight size={16} />
              </Link>
            )}
            {activePhase.id === "arrival" && (
              <Link to="/explorer" className="btn-handoff">
                Explore Lunar Landing Sites <ArrowRight size={16} />
              </Link>
            )}
            {activePhase.id === "ascent" && (
              <Link to="/trip" className="btn-handoff">
                Plan a trip <ArrowRight size={16} />
              </Link>
            )}
            {activePhase.id === "parking" && (
              <Link to="/trip" className="btn-handoff">
                Review Orbital Mission Profile <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
