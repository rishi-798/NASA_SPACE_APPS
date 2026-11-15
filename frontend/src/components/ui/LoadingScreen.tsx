import { useEffect, useState } from "react";
import { LunarLanderGame } from "./LunarLanderGame";

const NASA_LUNAR_FACTS = [
  "⚡ Radiation Belts: Earth's Van Allen belts end at ~60,000 km altitude, crossed within the first 4 hours of TLI long before reaching the Moon (384,400 km).",
  "🌑 Lunar Gravity: The Moon's surface gravity is 1.62 m/s² (16.6% of Earth's), requiring approximately 1,750 m/s delta-v for powered descent.",
  "📐 Orbital Phase Alignment: Because the Moon moves at 1.02 km/s, spacecraft launch with a ~110° orbital lead angle to intercept where the Moon will be in 3 days.",
  "❄️ Cryogenic Cold Traps: Permanently Shadowed Regions (PSRs) at the South Pole plummet to 35 K (-238°C), preserving billions of tons of ancient water ice.",
  "📡 Deep Space Network: NASA's DSN spans Goldstone, Madrid, and Canberra, ensuring continuous 24/7 direct-to-Earth communication coverage.",
  "☀️ Low Grazing Sunlight: Near the lunar South Pole, the Sun skims the horizon at 1.5°–3.0° elevation, casting 20-kilometer shadow expanses.",
];

export function LoadingScreen({ visible, message = "Calculating Sun and Earth geometry" }: { visible: boolean; message?: string }) {
  const [factIndex, setFactIndex] = useState(0);
  const [showGame, setShowGame] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % NASA_LUNAR_FACTS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-orbit" aria-hidden="true">
        <span className="loading-moon" />
        <span className="loading-ring loading-ring-a"><i /></span>
        <span className="loading-ring loading-ring-b"><i /></span>
      </div>
      <p className="loading-title">{message}</p>
      <p className="loading-sub">SPICE ephemeris · terrain horizon</p>
      <span className="loading-bar" aria-hidden="true" />

      {/* Rotating NASA Lunar Mission Facts */}
      <div style={{
        marginTop: "1rem",
        maxWidth: "460px",
        background: "rgba(15, 23, 42, 0.75)",
        border: "1px solid rgba(56, 189, 248, 0.25)",
        borderRadius: "8px",
        padding: "0.6rem 0.9rem",
        fontSize: "0.82rem",
        lineHeight: "1.4",
        color: "#94a3b8",
        backdropFilter: "blur(8px)",
      }}>
        <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#38bdf8", marginBottom: "0.25rem", fontWeight: 600 }}>
          NASA Lunar Mission Fact
        </div>
        <p style={{ margin: 0, color: "#e2e8f0" }}>{NASA_LUNAR_FACTS[factIndex]}</p>
      </div>

      {/* Optional Interactive Mini-Game Easter Egg */}
      {!showGame ? (
        <button
          onClick={() => setShowGame(true)}
          style={{
            marginTop: "0.75rem",
            background: "rgba(30, 41, 59, 0.6)",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#38bdf8",
            fontSize: "0.76rem",
            padding: "0.35rem 0.75rem",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            transition: "all 0.2s ease",
          }}
        >
          🎮 Play Asteroid Evader / Lunar Lander (Mini-Game)
        </button>
      ) : (
        <LunarLanderGame onClose={() => setShowGame(false)} />
      )}
    </div>
  );
}
