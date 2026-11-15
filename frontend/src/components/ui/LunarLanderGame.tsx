import { useEffect, useRef, useState } from "react";

export function LunarLanderGame({ onClose }: { onClose?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [, setGameState] = useState<"playing" | "landed" | "crashed">("playing");
  const [, setFuel] = useState(100);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let lander = {
      x: 60,
      y: 40,
      vx: 1.2,
      vy: 0.0,
      angle: 0.0,
      fuel: 100,
      alive: true,
      landed: false,
    };

    // Lunar gravity and physics
    const gravity = 0.045;
    const thrustPower = 0.12;
    const pad = { x: 260, y: 215, width: 65, height: 10 };

    // Micrometeoroids / Asteroids
    const asteroids = [
      { x: 380, y: 70, vx: -1.4, vy: 0.2, radius: 9 },
      { x: 440, y: 130, vx: -1.8, vy: -0.1, radius: 12 },
      { x: 500, y: 100, vx: -1.2, vy: 0.3, radius: 8 },
    ];

    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      keys[e.code] = true;
      if (e.key === "a" || e.key === "A") keys["ArrowLeft"] = true;
      if (e.key === "d" || e.key === "D") keys["ArrowRight"] = true;
      if (e.key === "w" || e.key === "W" || e.code === "Space") keys["ArrowUp"] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
      if (e.key === "a" || e.key === "A") keys["ArrowLeft"] = false;
      if (e.key === "d" || e.key === "D") keys["ArrowRight"] = false;
      if (e.key === "w" || e.key === "W" || e.code === "Space") keys["ArrowUp"] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Stars background
    const stars = Array.from({ length: 45 }, () => ({
      x: Math.random() * 400,
      y: Math.random() * 240,
      size: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.7 + 0.3,
    }));

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw starry space
      ctx.fillStyle = "#06080d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }

      // Draw Lunar Terrain Horizon at bottom
      ctx.beginPath();
      ctx.moveTo(0, 225);
      ctx.lineTo(80, 220);
      ctx.lineTo(160, 226);
      ctx.lineTo(240, 225);
      ctx.lineTo(pad.x, pad.y);
      ctx.lineTo(pad.x + pad.width, pad.y);
      ctx.lineTo(340, 223);
      ctx.lineTo(400, 225);
      ctx.lineTo(400, 250);
      ctx.lineTo(0, 250);
      ctx.closePath();
      ctx.fillStyle = "#1e232d";
      ctx.fill();
      ctx.strokeStyle = "#475569";
      ctx.stroke();

      // Draw Landing Pad Beacon
      ctx.fillStyle = "#10b981";
      ctx.fillRect(pad.x, pad.y, pad.width, pad.height);
      ctx.strokeStyle = "#34d399";
      ctx.strokeRect(pad.x, pad.y, pad.width, pad.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "8px monospace";
      ctx.fillText("CLPS PAD", pad.x + 12, pad.y + 8);

      if (lander.alive && !lander.landed) {
        // Controls
        if (keys["ArrowLeft"]) lander.angle -= 0.05;
        if (keys["ArrowRight"]) lander.angle += 0.05;

        let thrusting = false;
        if (keys["ArrowUp"] && lander.fuel > 0) {
          thrusting = true;
          lander.fuel = Math.max(0, lander.fuel - 0.22);
          setFuel(Math.round(lander.fuel));
          lander.vx += Math.sin(lander.angle) * thrustPower;
          lander.vy -= Math.cos(lander.angle) * thrustPower;
        }

        // Apply lunar gravity
        lander.vy += gravity;
        lander.x += lander.vx;
        lander.y += lander.vy;

        // Screen wrap horizontal
        if (lander.x < 0) lander.x = canvas.width;
        if (lander.x > canvas.width) lander.x = 0;

        // Update asteroids
        for (const ast of asteroids) {
          ast.x += ast.vx;
          ast.y += ast.vy;
          if (ast.x < -20) {
            ast.x = canvas.width + 20;
            ast.y = 30 + Math.random() * 140;
          }

          // Draw asteroid
          ctx.beginPath();
          ctx.arc(ast.x, ast.y, ast.radius, 0, Math.PI * 2);
          ctx.fillStyle = "#64748b";
          ctx.fill();
          ctx.strokeStyle = "#94a3b8";
          ctx.stroke();

          // Collision check with lander
          const distToAsteroid = Math.hypot(lander.x - ast.x, lander.y - ast.y);
          if (distToAsteroid < ast.radius + 8) {
            lander.alive = false;
            setGameState("crashed");
          }
        }

        // Landing check on Pad
        if (lander.y >= pad.y - 6) {
          const withinPad = lander.x >= pad.x && lander.x <= pad.x + pad.width;
          const safeSpeed = Math.abs(lander.vy) < 0.85 && Math.abs(lander.vx) < 0.65;
          const safeAngle = Math.abs(lander.angle) < 0.35;

          if (withinPad && safeSpeed && safeAngle) {
            lander.landed = true;
            lander.y = pad.y - 6;
            setGameState("landed");
            setScore((s) => s + 500 + Math.round(lander.fuel * 2));
          } else {
            lander.alive = false;
            setGameState("crashed");
          }
        }

        // Draw Lander
        ctx.save();
        ctx.translate(lander.x, lander.y);
        ctx.rotate(lander.angle);

        // Rocket body
        ctx.fillStyle = "#e2e8f0";
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 6);
        ctx.lineTo(-6, 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#38bdf8";
        ctx.stroke();

        // Landing gear struts
        ctx.strokeStyle = "#cbd5e1";
        ctx.beginPath();
        ctx.moveTo(-6, 6);
        ctx.lineTo(-9, 10);
        ctx.moveTo(6, 6);
        ctx.lineTo(9, 10);
        ctx.stroke();

        // Engine flame if thrusting
        if (thrusting) {
          ctx.fillStyle = "#f97316";
          ctx.beginPath();
          ctx.moveTo(-3, 6);
          ctx.lineTo(3, 6);
          ctx.lineTo(0, 14 + Math.random() * 5);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      } else if (lander.landed) {
        ctx.fillStyle = "#10b981";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText("🎉 TOUCHDOWN! Safe Landing on Lunar Pad", 65, 110);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px sans-serif";
        ctx.fillText("Press [SPACE] or Click Restart to Fly Again", 85, 132);
        if (keys["ArrowUp"] || keys["Space"]) {
          lander = { x: 60, y: 40, vx: 1.2, vy: 0, angle: 0, fuel: 100, alive: true, landed: false };
          setGameState("playing");
          setFuel(100);
        }
      } else {
        // Crashed explosion
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText("💥 CRASHED! Impact Exceeded Structural Margin", 55, 110);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px sans-serif";
        ctx.fillText("Press [SPACE] or Click Restart to Try Again", 85, 132);
        if (keys["ArrowUp"] || keys["Space"]) {
          lander = { x: 60, y: 40, vx: 1.2, vy: 0, angle: 0, fuel: 100, alive: true, landed: false };
          setGameState("playing");
          setFuel(100);
        }
      }

      // Aerospace HUD telemetry overlay
      ctx.fillStyle = "#38bdf8";
      ctx.font = "10px monospace";
      ctx.fillText(`FUEL: ${Math.round(lander.fuel)}%`, 10, 16);
      ctx.fillText(`V_VERT: ${lander.vy.toFixed(1)} m/s`, 10, 30);
      ctx.fillText(`SCORE: ${score}`, 320, 16);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [score]);

  return (
    <div className="lunar-mini-game-container" style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      background: "#080c14",
      padding: "0.8rem",
      borderRadius: "12px",
      border: "1px solid #1e293b",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      marginTop: "0.8rem",
      maxWidth: "420px",
      width: "100%",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginBottom: "0.4rem", alignItems: "center" }}>
        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#38bdf8", letterSpacing: "0.04em" }}>
          🚀 LUNAR LANDER SIMULATOR (g = 1.62 m/s²)
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "1rem" }}
          >
            ✕
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={240}
        style={{ borderRadius: "8px", border: "1px solid #334155", width: "100%", height: "auto" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginTop: "0.5rem", fontSize: "0.75rem", color: "#94a3b8" }}>
        <span>Steer: <b>[← / →] or [A / D]</b></span>
        <span>Thrust: <b>[SPACE / ↑] or [W]</b></span>
        <span>Dodge Asteroids & Land on Green Pad</span>
      </div>
    </div>
  );
}
