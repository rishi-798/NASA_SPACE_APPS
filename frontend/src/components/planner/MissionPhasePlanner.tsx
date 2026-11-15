import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { MISSION_PHASES, type MissionPhase } from "./missionPhaseData";
import { CislunarOrbitalCanvas } from "./CislunarOrbitalCanvas";
import "./planner.css";

const TOTAL_MISSION_SECONDS = 288000; // 80 hours in seconds

export function MissionPhasePlanner() {
  const [activePhaseId, setActivePhaseId] = useState<MissionPhase["id"]>("ascent");
  const [isPlaying, setIsPlaying] = useState(false);
  const [simMetSeconds, setSimMetSeconds] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 5 | 20 | 100>(5);
  const [activeTab, setActiveTab] = useState<"overview" | "mechanics" | "milestones" | "equations">("overview");
  const [cameraPreset, setCameraPreset] = useState<"system" | "earth" | "vehicle" | "moon">("earth");

  const lastTimestampRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  const activePhase = useMemo(
    () => MISSION_PHASES.find((p) => p.id === activePhaseId) ?? MISSION_PHASES[0]!,
    [activePhaseId]
  );

  // Jump to start of phase when selecting from rail
  const selectPhase = useCallback((phaseId: MissionPhase["id"]) => {
    setActivePhaseId(phaseId);
    const phase = MISSION_PHASES.find((p) => p.id === phaseId);
    if (phase) {
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
      const cruiseProg = (simMetSeconds - 9900) / (259200 - 9900);
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
      machNumber: (vel * 1000) / 340,
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
      const deltaMs = timestamp - lastTimestampRef.current;
      lastTimestampRef.current = timestamp;

      const speedMultiplier = playbackSpeed === 100 ? 7500 : playbackSpeed === 20 ? 1400 : playbackSpeed === 5 ? 280 : 60;
      const stepSeconds = (deltaMs / 1000) * speedMultiplier;

      setSimMetSeconds((prev) => {
        const next = prev + stepSeconds;
        if (next >= TOTAL_MISSION_SECONDS) {
          setIsPlaying(false);
          return TOTAL_MISSION_SECONDS;
        }

        const matchingPhase = MISSION_PHASES.find((p) => next >= p.startMetSeconds && next < p.endMetSeconds);
        if (matchingPhase && matchingPhase.id !== activePhaseId) {
          setActivePhaseId(matchingPhase.id);
        }

        return next;
      });

      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, playbackSpeed, activePhaseId]);

  return (
    <div className="planner-workspace">
      {/* 6-Phase Stepper Rail */}
      <nav className="planner-progress" aria-label="Mission flight phases">
        {MISSION_PHASES.map((p) => {
          const isActive = p.id === activePhaseId;
          return (
            <button
              key={p.id}
              type="button"
              aria-current={isActive ? "step" : undefined}
              onClick={() => selectPhase(p.id)}
            >
              <span className="planner-step-badge">0{p.phaseNumber}</span>
              <span>{p.shortName}</span>
              <span className="planner-step-deltav">
                {p.deltaVBudgetMS > 0 ? `${p.deltaVBudgetMS.toLocaleString()} m/s` : "Coast"}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Main Grid Layout: Visual Viewport + Phase Panel */}
      <div className="trip-layout">
        {/* Left Visual Column */}
        <div className="trip-visual trip-space-scene-mission">
          <CislunarOrbitalCanvas
            activePhaseId={activePhaseId}
            simMetSeconds={simMetSeconds}
            telemetry={telemetry}
            cameraPreset={cameraPreset}
            onCameraPresetChange={setCameraPreset}
          />

          {/* Top Overlaid Labels */}
          <div className="trip-overview-labels">
            <span>{activePhase.name}</span>
            <span>{activePhase.durationLabel}</span>
          </div>

          {/* Floating Telemetry Pills */}
          <div className="trip-space-data">
            <span>
              <span className="trip-space-sun-dot" />
              {formatMet(simMetSeconds)}
            </span>
            <span>
              VEL: {telemetry.velocityKmS.toFixed(2)} km/s (Mach {telemetry.machNumber.toFixed(1)})
            </span>
            <span>
              ALT: {telemetry.altitudeKm >= 1000 ? `${(telemetry.altitudeKm / 1000).toFixed(1)}k km` : `${telemetry.altitudeKm.toFixed(1)} km`}
            </span>
            <span>
              ENGINE: {activePhase.telemetryProfile.engineStatus}
            </span>
            <span>
              GRAV: {activePhase.telemetryProfile.gravitationalDominance}
            </span>
          </div>

          {/* Camera Focus Selector */}
          <div className="planner-camera-tools" role="group" aria-label="Camera focus mode">
            {(["system", "earth", "vehicle", "moon"] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                className={`planner-cam-btn ${cameraPreset === preset ? "active" : ""}`}
                onClick={() => setCameraPreset(preset)}
              >
                {preset === "system" && "🌐 System"}
                {preset === "earth" && "🌍 Earth"}
                {preset === "vehicle" && "🚀 Craft"}
                {preset === "moon" && "🌕 Moon"}
              </button>
            ))}
          </div>

          {/* Bottom Scrubbing Timeline */}
          <div className="trip-space-timeline">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              aria-label={isPlaying ? "Pause simulation" : "Play flight simulation"}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={TOTAL_MISSION_SECONDS}
              step={30}
              value={simMetSeconds}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSimMetSeconds(val);
                const matching = MISSION_PHASES.find((p) => val >= p.startMetSeconds && val < p.endMetSeconds);
                if (matching && matching.id !== activePhaseId) {
                  setActivePhaseId(matching.id);
                }
              }}
              aria-label="Mission Elapsed Time Scrubber"
            />
            <output>{formatMet(simMetSeconds)}</output>
          </div>

          <p className="trip-globe-hint">
            Interactive 3D cislunar ephemeris. Drag to orbit, scroll to zoom. Camera presets automatically align with active flight maneuvers.
          </p>
        </div>

        {/* Right Panel: Phase Intelligence & Telemetry */}
        <aside className="trip-panel">
          <span className="trip-section-label">
            PHASE 0{activePhase.phaseNumber} OF 06 · {activePhase.shortName.toUpperCase()}
          </span>
          <h2>{activePhase.name}</h2>
          <p>{activePhase.tagline}</p>

          <dl className="trip-stat-list">
            <div>
              <dt>Δv Budget</dt>
              <dd>
                <strong>{activePhase.deltaVBudgetMS.toLocaleString()} m/s</strong> (Cumulative: {Math.round(telemetry.deltaVMs).toLocaleString()} m/s)
              </dd>
            </div>
            <div>
              <dt>Velocity</dt>
              <dd>
                {activePhase.initialVelocityKmS} → {activePhase.finalVelocityKmS} km/s
              </dd>
            </div>
            <div>
              <dt>Altitude</dt>
              <dd>
                {activePhase.initialAltitudeKm >= 1000 ? `${(activePhase.initialAltitudeKm / 1000).toFixed(1)}k km` : `${activePhase.initialAltitudeKm} km`} → {activePhase.finalAltitudeKm >= 1000 ? `${(activePhase.finalAltitudeKm / 1000).toFixed(1)}k km` : `${activePhase.finalAltitudeKm} km`}
              </dd>
            </div>
            <div>
              <dt>Earth Dist</dt>
              <dd>{Math.round(telemetry.distEarthKm).toLocaleString()} km</dd>
            </div>
            <div>
              <dt>Moon Dist</dt>
              <dd>{Math.round(telemetry.distMoonKm).toLocaleString()} km</dd>
            </div>
            <div>
              <dt>Gravity Domain</dt>
              <dd>{activePhase.telemetryProfile.gravitationalDominance}</dd>
            </div>
          </dl>

          {/* Simulation Rate Control */}
          <div className="planner-rate-row">
            <span className="trip-note">Sim Rate:</span>
            <div className="planner-rate-pills">
              {([1, 5, 20, 100] as const).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  className={`rate-pill ${playbackSpeed === spd ? "active" : ""}`}
                  onClick={() => setPlaybackSpeed(spd)}
                >
                  {spd}×
                </button>
              ))}
              <button
                type="button"
                className="rate-pill reset"
                onClick={() => setSimMetSeconds(activePhase.startMetSeconds)}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Scientific Tabs */}
          <div className="planner-tab-bar" role="tablist" aria-label="Phase technical details">
            <button
              type="button"
              className={`planner-tab-btn ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={`planner-tab-btn ${activeTab === "mechanics" ? "active" : ""}`}
              onClick={() => setActiveTab("mechanics")}
            >
              Mechanics
            </button>
            <button
              type="button"
              className={`planner-tab-btn ${activeTab === "milestones" ? "active" : ""}`}
              onClick={() => setActiveTab("milestones")}
            >
              Milestones
            </button>
            <button
              type="button"
              className={`planner-tab-btn ${activeTab === "equations" ? "active" : ""}`}
              onClick={() => setActiveTab("equations")}
            >
              Equations
            </button>
          </div>

          {/* Tab Content Display */}
          <div className="planner-tab-content">
            {activeTab === "overview" && (
              <div>
                <p>{activePhase.overview}</p>
                <h3>Primary Engineering Challenges</h3>
                <p>{activePhase.engineeringChallenges}</p>
              </div>
            )}

            {activeTab === "mechanics" && (
              <div>
                <h3>Astrodynamical Regime</h3>
                <p>{activePhase.orbitalMechanics}</p>
                <div style={{ marginTop: "10px", padding: "10px 12px", background: "#0b0d12", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ fontSize: "11px", color: "#858d98", display: "block" }}>Key Indicator:</span>
                  <strong style={{ color: "var(--accent)" }}>{activePhase.telemetryProfile.primaryMetric}:</strong>{" "}
                  <span style={{ color: "var(--text)" }}>{activePhase.telemetryProfile.primaryValue}</span>
                </div>
              </div>
            )}

            {activeTab === "milestones" && (
              <div className="planner-milestones-list">
                {activePhase.milestones.map((m, idx) => (
                  <div key={idx} className="planner-milestone-item">
                    <span className="planner-milestone-time">{m.timeMet}</span>
                    <div className="planner-milestone-body">
                      <strong>{m.name}</strong>
                      <span>{m.description} ({m.altitudeKm} km · {m.velocityKmS} km/s)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "equations" && (
              <div className="planner-equations-container">
                <p className="trip-note">Governing astrodynamical and propulsion equations for this flight phase.</p>
                {activePhase.keyEquations.map((eq, idx) => (
                  <div key={idx} className="planner-equation-card">
                    <div className="planner-eq-header">
                      <strong>{eq.name}</strong>
                    </div>
                    <div className="planner-eq-formula">
                      <code>{eq.formula || eq.latex}</code>
                    </div>
                    <p className="planner-eq-meaning">{eq.meaning}</p>
                    {eq.variables && eq.variables.length > 0 && (
                      <dl className="planner-eq-vars">
                        {eq.variables.map((v, vIdx) => (
                          <div key={vIdx}>
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

          {/* Contextual Action Handoffs */}
          {activePhase.id === "descent" && (
            <Link to="/landing" className="trip-primary" style={{ marginTop: "12px" }}>
              Launch 6DOF Landing Simulator <ArrowRight />
            </Link>
          )}
          {(activePhase.id === "tli" || activePhase.id === "cruise") && (
            <Link to="/trip" className="trip-primary" style={{ marginTop: "12px" }}>
              Plan Cislunar Transfer Route <ArrowRight />
            </Link>
          )}
          {activePhase.id === "arrival" && (
            <Link to="/explorer" className="trip-primary" style={{ marginTop: "12px" }}>
              Explore Lunar Surface Landing Site <ArrowRight />
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
