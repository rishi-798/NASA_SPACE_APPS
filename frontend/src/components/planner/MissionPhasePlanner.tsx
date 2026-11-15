import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Play, Pause, ArrowCounterClockwise, ArrowRight, Compass, Gauge, RocketLaunch, Planet } from "@phosphor-icons/react";
import { MISSION_PHASES, type MissionPhase } from "./missionPhaseData";
import "./planner.css";

const TOTAL_MISSION_SECONDS = 288000; // 80 hours in seconds

export function MissionPhasePlanner() {
  const [activePhaseId, setActivePhaseId] = useState<MissionPhase["id"]>("ascent");
  const [isPlaying, setIsPlaying] = useState(false);
  const [simMetSeconds, setSimMetSeconds] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 5 | 20 | 100>(5);
  const [activeTab, setActiveTab] = useState<"overview" | "mechanics" | "milestones" | "equations">("overview");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number>(0);

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

  // Format seconds to MET string T+DD:HH:MM:SS
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
    
    // Smooth interpolations
    const alt = p.initialAltitudeKm + (p.finalAltitudeKm - p.initialAltitudeKm) * progress;
    const vel = p.initialVelocityKmS + (p.finalVelocityKmS - p.initialVelocityKmS) * progress;
    
    // Cumulative deltaV up to active phase + current progress
    let prevDeltaV = 0;
    for (const ph of MISSION_PHASES) {
      if (ph.phaseNumber < p.phaseNumber) {
        prevDeltaV += ph.deltaVBudgetMS;
      }
    }
    const currentDeltaV = prevDeltaV + p.deltaVBudgetMS * progress;

    // Distance to Earth / Moon
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

      // Advance MET based on playback rate
      // 1x = 100 s / sec real time; 5x = 500 s / sec; 20x = 2000 s / sec; 100x = 10000 s / sec
      const speedMultiplier = playbackSpeed === 100 ? 8000 : playbackSpeed === 20 ? 1500 : playbackSpeed === 5 ? 300 : 60;
      const stepSeconds = (deltaMs / 1000) * speedMultiplier;

      setSimMetSeconds((prev) => {
        const next = prev + stepSeconds;
        if (next >= TOTAL_MISSION_SECONDS) {
          setIsPlaying(false);
          return TOTAL_MISSION_SECONDS;
        }

        // Auto-advance active phase if scrubber crosses into next phase
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

  // 60 FPS Canvas Orbital Flight Path & Spacecraft Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Dark cosmos space background
      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, w, h);

      // Starfield background
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      for (let i = 0; i < 45; i++) {
        const sx = (Math.sin(i * 12.3) * 0.5 + 0.5) * w;
        const sy = (Math.cos(i * 34.5) * 0.5 + 0.5) * h;
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }

      // Orbital Coordinate Center
      // Earth at (w * 0.22, h * 0.5), Moon at (w * 0.82, h * 0.5)
      const earthX = w * 0.20;
      const earthY = h * 0.52;
      const earthR = 38;

      const moonX = w * 0.82;
      const moonY = h * 0.46;
      const moonR = 18;

      // 1. Draw Earth and Atmosphere
      const earthGlow = ctx.createRadialGradient(earthX, earthY, earthR * 0.8, earthX, earthY, earthR * 1.6);
      earthGlow.addColorStop(0, "rgba(56, 189, 248, 0.35)");
      earthGlow.addColorStop(1, "rgba(56, 189, 248, 0)");
      ctx.fillStyle = earthGlow;
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthR * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Earth Globe
      const earthFill = ctx.createLinearGradient(earthX - earthR, earthY - earthR, earthX + earthR, earthY + earthR);
      earthFill.addColorStop(0, "#0284c7");
      earthFill.addColorStop(0.6, "#0369a1");
      earthFill.addColorStop(1, "#082f49");
      ctx.fillStyle = earthFill;
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
      ctx.fill();

      // Earth Continent Accents
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.ellipse(earthX - 8, earthY - 6, 12, 18, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(earthX + 12, earthY + 10, 8, 14, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Earth Label
      ctx.fillStyle = "#93c5fd";
      ctx.font = "600 11px system-ui";
      ctx.fillText("EARTH", earthX - 18, earthY + earthR + 18);

      // 2. Draw Moon & Lunar Orbit
      const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.8, moonX, moonY, moonR * 1.5);
      moonGlow.addColorStop(0, "rgba(226, 232, 240, 0.25)");
      moonGlow.addColorStop(1, "rgba(226, 232, 240, 0)");
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Moon Globe
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      ctx.fill();

      // Moon Craters
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(moonX - 4, moonY - 3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(moonX + 5, moonY + 4, 3, 0, Math.PI * 2);
      ctx.fill();

      // Moon Label
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 11px system-ui";
      ctx.fillText("MOON", moonX - 16, moonY + moonR + 16);

      // 3. Draw Earth Parking Orbit Ring
      const parkingR = earthR + 18;
      ctx.strokeStyle = activePhase.id === "parking" ? "#38bdf8" : "rgba(56, 189, 248, 0.25)";
      ctx.lineWidth = activePhase.id === "parking" ? 2 : 1;
      ctx.setLineDash(activePhase.id === "parking" ? [] : [3, 4]);
      ctx.beginPath();
      ctx.arc(earthX, earthY, parkingR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4. Draw Translunar Transfer Ellipse Arc
      ctx.strokeStyle = activePhase.id === "cruise" || activePhase.id === "tli" ? "#facc15" : "rgba(250, 204, 21, 0.3)";
      ctx.lineWidth = activePhase.id === "cruise" || activePhase.id === "tli" ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(earthX + parkingR, earthY);
      // Beautiful Bezier translunar transfer trajectory
      const cp1X = earthX + 160;
      const cp1Y = earthY - 130;
      const cp2X = moonX - 120;
      const cp2Y = moonY - 110;
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, moonX - moonR - 8, moonY);
      ctx.stroke();

      // 5. Draw Lunar Capture Orbit & Descent Path
      const lunarOrbitR = moonR + 12;
      ctx.strokeStyle = activePhase.id === "arrival" ? "#10b981" : "rgba(16, 185, 129, 0.3)";
      ctx.lineWidth = activePhase.id === "arrival" ? 2 : 1;
      ctx.beginPath();
      ctx.arc(moonX, moonY, lunarOrbitR, 0, Math.PI * 2);
      ctx.stroke();

      // Descent Arc
      if (activePhase.id === "descent") {
        ctx.strokeStyle = "#e11d48";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(moonX, moonY, lunarOrbitR, -Math.PI * 0.2, Math.PI * 0.15);
        ctx.stroke();
      }

      // 6. Draw L1 Neutral Gravity Point Indicator
      const l1X = earthX + (moonX - earthX) * 0.84;
      const l1Y = earthY + (moonY - earthY) * 0.84 - 24;
      ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.strokeRect(l1X - 6, l1Y - 6, 12, 12);
      ctx.setLineDash([]);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 9px monospace";
      ctx.fillText("L1 Neutral", l1X - 22, l1Y - 10);

      // 7. Calculate Animated Spacecraft Position
      let craftX = earthX;
      let craftY = earthY;
      let craftHeading = 0;
      let hasPlume = false;

      const pId = activePhase.id;
      const prog = telemetry.progress;

      if (pId === "ascent") {
        const theta = -Math.PI * 0.5 + prog * (Math.PI * 0.45);
        const r = earthR + prog * 18;
        craftX = earthX + Math.cos(theta) * r;
        craftY = earthY + Math.sin(theta) * r;
        craftHeading = theta + Math.PI * 0.5;
        hasPlume = true;
      } else if (pId === "parking") {
        const theta = prog * Math.PI * 4; // 2 revolutions
        craftX = earthX + Math.cos(theta) * parkingR;
        craftY = earthY + Math.sin(theta) * parkingR;
        craftHeading = theta + Math.PI * 0.5;
        hasPlume = false;
      } else if (pId === "tli") {
        const t = prog * 0.12;
        craftX = (1 - t) * (1 - t) * (1 - t) * (earthX + parkingR) +
                 3 * (1 - t) * (1 - t) * t * cp1X +
                 3 * (1 - t) * t * t * cp2X +
                 t * t * t * (moonX - moonR - 8);
        craftY = (1 - t) * (1 - t) * (1 - t) * earthY +
                 3 * (1 - t) * (1 - t) * t * cp1Y +
                 3 * (1 - t) * t * t * cp2Y +
                 t * t * t * moonY;
        craftHeading = Math.atan2(cp1Y - earthY, cp1X - (earthX + parkingR));
        hasPlume = true;
      } else if (pId === "cruise") {
        const t = 0.12 + prog * 0.80;
        craftX = (1 - t) * (1 - t) * (1 - t) * (earthX + parkingR) +
                 3 * (1 - t) * (1 - t) * t * cp1X +
                 3 * (1 - t) * t * t * cp2X +
                 t * t * t * (moonX - moonR - 8);
        craftY = (1 - t) * (1 - t) * (1 - t) * earthY +
                 3 * (1 - t) * (1 - t) * t * cp1Y +
                 3 * (1 - t) * t * t * cp2Y +
                 t * t * t * moonY;
        craftHeading = Math.atan2(moonY - craftY, moonX - craftX);
        hasPlume = false;
      } else if (pId === "arrival") {
        const theta = -Math.PI + prog * Math.PI * 1.5;
        craftX = moonX + Math.cos(theta) * lunarOrbitR;
        craftY = moonY + Math.sin(theta) * lunarOrbitR;
        craftHeading = theta + Math.PI * 0.5;
        hasPlume = prog < 0.6; // LOI braking burn
      } else if (pId === "descent") {
        const theta = Math.PI * 0.5 - prog * (Math.PI * 0.4);
        const r = lunarOrbitR - prog * (lunarOrbitR - moonR);
        craftX = moonX + Math.cos(theta) * r;
        craftY = moonY + Math.sin(theta) * r;
        craftHeading = theta - Math.PI * 0.5;
        hasPlume = true; // Throttling descent burn
      }

      // 8. Draw Spacecraft at Position
      ctx.save();
      ctx.translate(craftX, craftY);
      ctx.rotate(craftHeading);

      // Rocket Hull
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = activePhase.trajectoryColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -4);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-6, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Active Engine Exhaust Plume
      if (hasPlume) {
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.moveTo(-5, -2.5);
        ctx.lineTo(-15 - Math.random() * 8, 0);
        ctx.lineTo(-5, 2.5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();

      // Spacecraft Identifier Pill on Canvas
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.strokeStyle = activePhase.trajectoryColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(craftX + 12, craftY - 14, 80, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = activePhase.trajectoryColor;
      ctx.font = "bold 9px monospace";
      ctx.fillText(activePhase.shortName.toUpperCase(), craftX + 16, craftY);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [activePhase, telemetry]);

  return (
    <div className="phase-planner-container">
      {/* Planner Header */}
      <header className="phase-planner-header">
        <div className="planner-title-row">
          <div>
            <div className="planner-badge">
              <RocketLaunch size={14} weight="fill" />
              <span>Lunar Mission Architecture · End-to-End Flight Profile</span>
            </div>
            <h2 className="planner-title">Interactive Mission Phase Planner</h2>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link to="/trip" className="handoff-btn" style={{ background: "rgba(56, 189, 248, 0.15)", border: "1px solid rgba(56, 189, 248, 0.4)", color: "#38bdf8" }}>
              <Planet size={16} /> Plan a Trip
            </Link>
            <Link to="/landing" className="handoff-btn">
              <Compass size={16} /> 6DOF Landing Sim <ArrowRight size={14} />
            </Link>
          </div>
        </div>
        <p className="planner-subtitle">
          Explore all six primary phases of a crewed lunar expedition: atmospheric liftoff, orbital circularization, the translunar injection burn, three-day cislunar cruise, lunar capture, and powered terminal descent.
        </p>

        {/* 6-Phase Stepper Rail */}
        <nav className="phase-stepper-rail" aria-label="Mission phases">
          {MISSION_PHASES.map((p) => {
            const isActive = p.id === activePhaseId;
            return (
              <button
                key={p.id}
                type="button"
                className={`phase-step-btn ${isActive ? "active" : ""}`}
                style={{ "--phase-color": p.trajectoryColor } as React.CSSProperties}
                onClick={() => selectPhase(p.id)}
                aria-pressed={isActive}
              >
                <span className="phase-step-idx">Phase 0{p.phaseNumber}</span>
                <span className="phase-step-name">{p.shortName}</span>
                <span className="phase-step-met">Δv: {p.deltaVBudgetMS.toLocaleString()} m/s</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Workspace: Interactive Viewport + Telemetry Panel */}
      <div className="planner-workspace-grid">
        {/* Left Column: Orbital Canvas & Telemetry HUD */}
        <section className="planner-viewport-card" aria-label="Orbital trajectory view">
          <div className="planner-canvas-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: activePhase.trajectoryColor }} />
              <strong>{activePhase.name}</strong>
            </div>
            <span style={{ fontFamily: "var(--font-mono, monospace)", color: "#38bdf8" }}>
              {activePhase.durationLabel}
            </span>
          </div>

          <div className="planner-canvas-wrapper">
            <canvas ref={canvasRef} width={820} height={480} className="planner-canvas" />

            {/* Top-Left Telemetry HUD */}
            <div className="planner-hud-topleft">
              <div className="planner-hud-pill">
                <Gauge size={14} color="#38bdf8" />
                <span>{formatMet(simMetSeconds)}</span>
              </div>
              <div className="planner-hud-pill">
                <span style={{ color: "#94a3b8" }}>VEL:</span>
                <strong style={{ color: "#38bdf8" }}>{telemetry.velocityKmS.toFixed(2)} km/s</strong>
                <small style={{ color: "#64748b" }}>(Mach {telemetry.machNumber.toFixed(1)})</small>
              </div>
              <div className="planner-hud-pill">
                <span style={{ color: "#94a3b8" }}>ALT:</span>
                <strong style={{ color: "#facc15" }}>
                  {telemetry.altitudeKm >= 1000 ? `${(telemetry.altitudeKm / 1000).toFixed(1)}k km` : `${telemetry.altitudeKm.toFixed(1)} km`}
                </strong>
              </div>
            </div>

            {/* Bottom-Right HUD */}
            <div className="planner-hud-bottomright">
              <div className="planner-hud-pill">
                <span style={{ color: "#94a3b8" }}>ENGINE:</span>
                <span style={{ color: activePhase.telemetryProfile.engineStatus.includes("Ignition") || activePhase.telemetryProfile.engineStatus.includes("Throttling") ? "#f59e0b" : "#38bdf8" }}>
                  {activePhase.telemetryProfile.engineStatus}
                </span>
              </div>
              <div className="planner-hud-pill">
                <span style={{ color: "#94a3b8" }}>GRAV:</span>
                <span>{activePhase.telemetryProfile.gravitationalDominance}</span>
              </div>
            </div>
          </div>

          {/* Scrubber & Simulation Speed Controls */}
          <div className="planner-scrubber-bar">
            <div className="scrubber-slider-row">
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.74rem", color: "#64748b" }}>T+0d</span>
              <input
                type="range"
                className="scrubber-slider"
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
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.74rem", color: "#64748b" }}>T+80h</span>
            </div>

            <div className="scrubber-controls-row">
              <div className="scrubber-btns">
                <button
                  type="button"
                  className="scrubber-action-btn"
                  onClick={() => setIsPlaying((p) => !p)}
                  aria-label={isPlaying ? "Pause simulation" : "Play simulation"}
                >
                  {isPlaying ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
                  <span>{isPlaying ? "Pause" : "Play Flight"}</span>
                </button>
                <button
                  type="button"
                  className="scrubber-action-btn"
                  onClick={() => setSimMetSeconds(activePhase.startMetSeconds)}
                  title="Reset to start of phase"
                >
                  <ArrowCounterClockwise size={16} />
                  <span>Reset Phase</span>
                </button>
              </div>

              <div className="scrubber-rate-group" role="group" aria-label="Playback speed">
                <span style={{ fontSize: "0.7rem", color: "#64748b", paddingLeft: "0.3rem" }}>Rate:</span>
                {([1, 5, 20, 100] as const).map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    className={`rate-btn ${playbackSpeed === spd ? "active" : ""}`}
                    onClick={() => setPlaybackSpeed(spd)}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Telemetry Summary & Scientific Breakdown */}
        <aside className="planner-info-panel">
          {/* Phase Telemetry Card */}
          <div className="planner-telemetry-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>
                Phase Telemetry
              </span>
              <span className="planner-badge" style={{ borderColor: activePhase.trajectoryColor, color: activePhase.trajectoryColor }}>
                Phase 0{activePhase.phaseNumber} · {activePhase.shortName}
              </span>
            </div>

            <div className="planner-metrics-grid">
              <div className="metric-cell">
                <span className="metric-label">Phase Δv Budget</span>
                <span className="metric-val" style={{ color: "#38bdf8" }}>
                  {activePhase.deltaVBudgetMS.toLocaleString()} m/s
                </span>
              </div>
              <div className="metric-cell">
                <span className="metric-label">Cumulative Δv</span>
                <span className="metric-val" style={{ color: "#facc15" }}>
                  {Math.round(telemetry.deltaVMs).toLocaleString()} m/s
                </span>
              </div>
              <div className="metric-cell">
                <span className="metric-label">Earth Distance</span>
                <span className="metric-val">
                  {Math.round(telemetry.distEarthKm).toLocaleString()} km
                </span>
              </div>
              <div className="metric-cell">
                <span className="metric-label">Moon Distance</span>
                <span className="metric-val" style={{ color: "#10b981" }}>
                  {Math.round(telemetry.distMoonKm).toLocaleString()} km
                </span>
              </div>
            </div>
          </div>

          {/* Deep Scientific Explanation Card */}
          <div className="planner-explanation-card">
            <div className="phase-tabs-row" role="tablist" aria-label="Explanation tabs">
              <button
                type="button"
                className={`phase-tab-btn ${activeTab === "overview" ? "active" : ""}`}
                onClick={() => setActiveTab("overview")}
              >
                Overview
              </button>
              <button
                type="button"
                className={`phase-tab-btn ${activeTab === "mechanics" ? "active" : ""}`}
                onClick={() => setActiveTab("mechanics")}
              >
                Orbital Mechanics
              </button>
              <button
                type="button"
                className={`phase-tab-btn ${activeTab === "milestones" ? "active" : ""}`}
                onClick={() => setActiveTab("milestones")}
              >
                Milestones
              </button>
              <button
                type="button"
                className={`phase-tab-btn ${activeTab === "equations" ? "active" : ""}`}
                onClick={() => setActiveTab("equations")}
              >
                Equations
              </button>
            </div>

            <div className="phase-explanation-content">
              {activeTab === "overview" && (
                <div>
                  <p>{activePhase.overview}</p>
                  <h4>Primary Engineering Challenges</h4>
                  <p>{activePhase.engineeringChallenges}</p>
                </div>
              )}

              {activeTab === "mechanics" && (
                <div>
                  <h4>Keplerian &amp; 3-Body Dynamics</h4>
                  <p>{activePhase.orbitalMechanics}</p>
                  <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.8rem", background: "rgba(30, 41, 59, 0.4)", borderRadius: 6 }}>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block" }}>Key Indicator:</span>
                    <strong style={{ color: "#38bdf8" }}>{activePhase.telemetryProfile.primaryMetric}:</strong>{" "}
                    <span>{activePhase.telemetryProfile.primaryValue}</span>
                  </div>
                </div>
              )}

              {activeTab === "milestones" && (
                <div>
                  <h4>Critical Flight Events</h4>
                  <div className="phase-milestones-list">
                    {activePhase.milestones.map((m, idx) => (
                      <div key={idx} className="milestone-item" style={{ "--phase-color": activePhase.trajectoryColor } as React.CSSProperties}>
                        <span className="milestone-time">{m.timeMet}</span>
                        <div className="milestone-info">
                          <span className="milestone-title">{m.name}</span>
                          <span className="milestone-desc">{m.description} ({m.altitudeKm} km · {m.velocityKmS} km/s)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "equations" && (
                <div>
                  <h4>Governing Mathematical Physics</h4>
                  {activePhase.keyEquations.map((eq, idx) => (
                    <div key={idx} style={{ marginTop: "0.75rem", padding: "0.75rem", background: "rgba(30, 41, 59, 0.5)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                      <strong style={{ color: "#38bdf8", fontSize: "0.85rem" }}>{eq.name}</strong>
                      <div style={{ fontFamily: "var(--font-mono, monospace)", color: "#facc15", margin: "0.35rem 0", fontSize: "0.95rem" }}>
                        {eq.latex}
                      </div>
                      <p style={{ margin: 0, fontSize: "0.78rem", color: "#94a3b8" }}>{eq.meaning}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Seamless Phase Handoffs to Other App Workflows */}
            {activePhase.id === "descent" && (
              <div className="phase-handoff-banner">
                <span className="handoff-text">Ready to fly the terminal descent yourself?</span>
                <Link to="/landing" className="handoff-btn">
                  Fly 6DOF Simulator <ArrowRight size={14} />
                </Link>
              </div>
            )}
            {(activePhase.id === "tli" || activePhase.id === "cruise") && (
              <div className="phase-handoff-banner">
                <span className="handoff-text">Inspect real numeric SPICE ephemeris transfer trajectories:</span>
                <Link to="/trip" className="handoff-btn">
                  Open Trip Planner <ArrowRight size={14} />
                </Link>
              </div>
            )}
            {activePhase.id === "arrival" && (
              <div className="phase-handoff-banner">
                <span className="handoff-text">Examine measured topography at target lunar landing sites:</span>
                <Link to="/explorer" className="handoff-btn">
                  Open Surface Explorer <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
