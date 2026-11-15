import { useEffect, useRef, useState, useCallback } from "react";
import { SpeakerHigh, SpeakerSlash, Pause, Play, ArrowCounterClockwise, X } from "@phosphor-icons/react";
import "../../asteroid-game.css";

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  points: number[];
  craters: { x: number; y: number; r: number }[];
  angle: number;
  vAngle: number;
  tier: 3 | 2 | 1; // 3 = large, 2 = medium, 1 = small
}

interface Laser {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

type Props = {
  onClose?: () => void;
  isOverlay?: boolean;
  onCalculationFinished?: () => void;
  calculationReady?: boolean;
};

// Web Audio API Sound Synthesizer (100% offline, zero audio files required)
class GameAudio {
  private ctx: AudioContext | null = null;
  private muted = false;
  private thrustOsc: OscillatorNode | null = null;
  private thrustGain: GainNode | null = null;

  constructor() {
    try {
      this.muted = localStorage.getItem("nasa-asteroid-muted") === "true";
    } catch { /* Storage unavailable */ }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  public isMuted() { return this.muted; }
  public setMuted(mute: boolean) {
    this.muted = mute;
    try { localStorage.setItem("nasa-asteroid-muted", String(mute)); } catch { /* Ignore */ }
    if (mute && this.thrustGain) {
      this.thrustGain.gain.setValueAtTime(0, this.ctx?.currentTime ?? 0);
    }
  }

  public playLaser() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.1);

    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.1);
  }

  public playExplosion(tier: number) {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const duration = tier === 3 ? 0.45 : tier === 2 ? 0.3 : 0.18;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    const t = this.ctx.currentTime;
    filter.frequency.setValueAtTime(tier === 3 ? 320 : 540, t);
    filter.frequency.exponentialRampToValueAtTime(40, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(tier === 3 ? 0.35 : 0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + duration);
  }

  public setThrust(active: boolean) {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    if (active) {
      if (!this.thrustOsc) {
        this.thrustOsc = this.ctx.createOscillator();
        this.thrustGain = this.ctx.createGain();
        this.thrustOsc.type = "triangle";
        this.thrustOsc.frequency.setValueAtTime(65, t);
        this.thrustGain.gain.setValueAtTime(0.001, t);
        this.thrustOsc.connect(this.thrustGain);
        this.thrustGain.connect(this.ctx.destination);
        this.thrustOsc.start(t);
      }
      this.thrustGain?.gain.setTargetAtTime(0.12, t, 0.05);
    } else if (this.thrustGain) {
      this.thrustGain.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  public playSectorClear() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const t = this.ctx!.currentTime + idx * 0.1;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  public stopAll() {
    if (this.thrustOsc) {
      try { this.thrustOsc.stop(); } catch { /* Ignore */ }
      this.thrustOsc = null;
    }
  }
}

export function AsteroidShooterGame({ onClose, isOverlay = false, onCalculationFinished, calculationReady = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<GameAudio | null>(null);

  const [gameState, setGameState] = useState<"ready" | "playing" | "paused" | "gameover">("ready");
  const [score, setScore] = useState(0);
  const [sector, setSector] = useState(1);
  const [shields, setShields] = useState(100);
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem("nasa-asteroid-highscore") || "0", 10); } catch { return 0; }
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem("nasa-asteroid-muted") !== "true"; } catch { return true; }
  });

  // Mutable game simulation loop refs
  const gameRef = useRef({
    ship: {
      x: 400,
      y: 300,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2, // point upward
      radius: 14,
      thrusting: false,
      turningLeft: false,
      turningRight: false,
      firing: false,
      lastFireTime: 0,
      invulnerableTimer: 0,
    },
    asteroids: [] as Asteroid[],
    lasers: [] as Laser[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    stars: [] as { x: number; y: number; s: number; b: number }[],
    keys: new Set<string>(),
    score: 0,
    sector: 1,
    shields: 100,
    lastTime: 0,
    combo: 1,
    comboTimer: 0,
  });

  if (audioRef.current === null) {
    audioRef.current = new GameAudio();
  }

  // Create asteroid with irregular polygon and craters
  const createAsteroid = useCallback((x: number, y: number, tier: 3 | 2 | 1, avoidX?: number, avoidY?: number): Asteroid => {
    const baseRadius = tier === 3 ? 40 : tier === 2 ? 24 : 14;
    const vertexCount = tier === 3 ? 12 : tier === 2 ? 10 : 8;
    const points: number[] = [];
    for (let i = 0; i < vertexCount; i++) {
      points.push(1 - (Math.random() * 0.38 - 0.19));
    }

    const craters: { x: number; y: number; r: number }[] = [];
    if (tier >= 2) {
      const craterCount = tier === 3 ? 3 : 1;
      for (let i = 0; i < craterCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * (baseRadius * 0.55);
        craters.push({
          x: Math.cos(ang) * dist,
          y: Math.sin(ang) * dist,
          r: baseRadius * (0.15 + Math.random() * 0.18),
        });
      }
    }

    // Velocity scale based on tier and sector
    const speed = (tier === 1 ? 1.9 : tier === 2 ? 1.3 : 0.8) * (1 + (gameRef.current.sector - 1) * 0.12);
    const vx = (Math.random() * 2 - 1) * speed;
    const vy = (Math.random() * 2 - 1) * speed;

    // Ensure spawn is not on top of ship
    let posX = x;
    let posY = y;
    if (avoidX !== undefined && avoidY !== undefined) {
      const dist = Math.hypot(posX - avoidX, posY - avoidY);
      if (dist < 120) {
        posX = (posX + 200) % 800;
        posY = (posY + 200) % 520;
      }
    }

    return {
      x: posX,
      y: posY,
      vx,
      vy,
      radius: baseRadius,
      points,
      craters,
      angle: Math.random() * Math.PI * 2,
      vAngle: (Math.random() * 0.04 - 0.02),
      tier,
    };
  }, []);

  // Initialize new sector wave
  const initSector = useCallback((sectorNum: number, keepShipPos = false) => {
    const g = gameRef.current;
    g.sector = sectorNum;
    setSector(sectorNum);

    const canvas = canvasRef.current;
    const w = canvas ? canvas.width : 800;
    const h = canvas ? canvas.height : 600;

    if (!keepShipPos) {
      g.ship.x = w / 2;
      g.ship.y = h / 2;
      g.ship.vx = 0;
      g.ship.vy = 0;
      g.ship.angle = -Math.PI / 2;
      g.ship.invulnerableTimer = 1.8;
    }

    g.asteroids = [];
    const asteroidCount = 3 + sectorNum;
    for (let i = 0; i < asteroidCount; i++) {
      const edge = Math.floor(Math.random() * 4);
      let ax: number, ay: number;
      if (edge === 0) { ax = Math.random() * w; ay = 20; }
      else if (edge === 1) { ax = w - 20; ay = Math.random() * h; }
      else if (edge === 2) { ax = Math.random() * w; ay = h - 20; }
      else { ax = 20; ay = Math.random() * h; }
      g.asteroids.push(createAsteroid(ax, ay, 3, g.ship.x, g.ship.y));
    }

    audioRef.current?.playSectorClear();
  }, [createAsteroid]);

  // Start new game
  const startGame = useCallback(() => {
    const g = gameRef.current;
    g.score = 0;
    g.shields = 100;
    g.combo = 1;
    g.lasers = [];
    g.particles = [];
    g.floatingTexts = [];
    setScore(0);
    setShields(100);
    initSector(1);
    setGameState("playing");
  }, [initSector]);

  // Handle keyboard inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }

      if (e.code === "KeyP") {
        setGameState(cur => cur === "playing" ? "paused" : cur === "paused" ? "playing" : cur);
        return;
      }
      if (e.code === "KeyM") {
        setSoundEnabled(prev => {
          const next = !prev;
          audioRef.current?.setMuted(!next);
          return next;
        });
        return;
      }
      if (e.code === "KeyR" && (gameState === "gameover" || gameState === "ready")) {
        startGame();
        return;
      }
      if (e.code === "Space" && (gameState === "ready" || gameState === "gameover")) {
        startGame();
        return;
      }
      if (e.code === "Escape" && onClose) {
        onClose();
        return;
      }

      gameRef.current.keys.add(e.code);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      gameRef.current.keys.delete(e.code);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [gameState, onClose, startGame]);

  // Main 60fps Game Animation Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Generate static deep space background starfield once
    if (gameRef.current.stars.length === 0) {
      for (let i = 0; i < 90; i++) {
        gameRef.current.stars.push({
          x: Math.random() * 800,
          y: Math.random() * 520,
          s: Math.random() * 1.8 + 0.6,
          b: Math.random() * 0.7 + 0.3,
        });
      }
    }

    const loop = (timestamp: number) => {
      const g = gameRef.current;
      const dt = Math.min((timestamp - (g.lastTime || timestamp)) / 1000, 0.1);
      g.lastTime = timestamp;

      const w = canvas.width;
      const h = canvas.height;

      // 1. UPDATE STATE
      if (gameState === "playing") {
        const keys = g.keys;
        const ship = g.ship;

        // Rotation
        const turnSpeed = 4.2 * dt;
        if (keys.has("ArrowLeft") || keys.has("KeyA")) {
          ship.angle -= turnSpeed;
        }
        if (keys.has("ArrowRight") || keys.has("KeyD")) {
          ship.angle += turnSpeed;
        }

        // Thrust
        const isThrusting = keys.has("ArrowUp") || keys.has("KeyW");
        ship.thrusting = isThrusting;
        audioRef.current?.setThrust(isThrusting);

        if (isThrusting) {
          const accel = 320 * dt;
          ship.vx += Math.cos(ship.angle) * accel;
          ship.vy += Math.sin(ship.angle) * accel;

          // Exhaust flame particles
          for (let i = 0; i < 2; i++) {
            const spread = (Math.random() - 0.5) * 0.45;
            const pSpeed = Math.random() * 120 + 80;
            const pAngle = ship.angle + Math.PI + spread;
            g.particles.push({
              x: ship.x - Math.cos(ship.angle) * 14,
              y: ship.y - Math.sin(ship.angle) * 14,
              vx: Math.cos(pAngle) * pSpeed + ship.vx * 0.4,
              vy: Math.sin(pAngle) * pSpeed + ship.vy * 0.4,
              life: 0.28,
              maxLife: 0.28,
              color: Math.random() > 0.4 ? "#38bdf8" : "#f59e0b",
              size: Math.random() * 3 + 2,
            });
          }
        }

        // Inertial damping
        ship.vx *= Math.pow(0.982, dt * 60);
        ship.vy *= Math.pow(0.982, dt * 60);

        // Max speed cap
        const speed = Math.hypot(ship.vx, ship.vy);
        const maxSpeed = 340;
        if (speed > maxSpeed) {
          ship.vx = (ship.vx / speed) * maxSpeed;
          ship.vy = (ship.vy / speed) * maxSpeed;
        }

        ship.x = (ship.x + ship.vx * dt + w) % w;
        ship.y = (ship.y + ship.vy * dt + h) % h;

        // Firing lasers
        const isFiring = keys.has("Space");
        const now = timestamp / 1000;
        if (isFiring && now - ship.lastFireTime > 0.16) {
          ship.lastFireTime = now;
          audioRef.current?.playLaser();

          // Dual wingtip laser bolts
          const wingOffset = 10;
          const noseDist = 16;
          const leftX = ship.x + Math.cos(ship.angle) * noseDist + Math.cos(ship.angle - Math.PI / 2) * wingOffset;
          const leftY = ship.y + Math.sin(ship.angle) * noseDist + Math.sin(ship.angle - Math.PI / 2) * wingOffset;
          const rightX = ship.x + Math.cos(ship.angle) * noseDist + Math.cos(ship.angle + Math.PI / 2) * wingOffset;
          const rightY = ship.y + Math.sin(ship.angle) * noseDist + Math.sin(ship.angle + Math.PI / 2) * wingOffset;

          const laserSpeed = 540;
          const lvx = Math.cos(ship.angle) * laserSpeed + ship.vx * 0.2;
          const lvy = Math.sin(ship.angle) * laserSpeed + ship.vy * 0.2;

          g.lasers.push({ x: leftX, y: leftY, vx: lvx, vy: lvy, life: 1.1, maxLife: 1.1 });
          g.lasers.push({ x: rightX, y: rightY, vx: lvx, vy: lvy, life: 1.1, maxLife: 1.1 });
        }

        // Invulnerability timer
        if (ship.invulnerableTimer > 0) {
          ship.invulnerableTimer -= dt;
        }

        // Update lasers
        for (let i = g.lasers.length - 1; i >= 0; i--) {
          const l = g.lasers[i];
          l.x = (l.x + l.vx * dt + w) % w;
          l.y = (l.y + l.vy * dt + h) % h;
          l.life -= dt;
          if (l.life <= 0) {
            g.lasers.splice(i, 1);
          }
        }

        // Update Asteroids
        for (let i = 0; i < g.asteroids.length; i++) {
          const a = g.asteroids[i];
          a.x = (a.x + a.vx * dt * 60 + w) % w;
          a.y = (a.y + a.vy * dt * 60 + h) % h;
          a.angle += a.vAngle * dt * 60;
        }

        // Laser vs Asteroid Collisions
        for (let lIdx = g.lasers.length - 1; lIdx >= 0; lIdx--) {
          const laser = g.lasers[lIdx];
          let laserHit = false;

          for (let aIdx = g.asteroids.length - 1; aIdx >= 0; aIdx--) {
            const ast = g.asteroids[aIdx];
            const dist = Math.hypot(laser.x - ast.x, laser.y - ast.y);

            if (dist < ast.radius + 3) {
              laserHit = true;
              audioRef.current?.playExplosion(ast.tier);

              // Explosion particles
              const pCount = ast.tier === 3 ? 18 : ast.tier === 2 ? 12 : 7;
              for (let p = 0; p < pCount; p++) {
                const pAng = Math.random() * Math.PI * 2;
                const pSpd = Math.random() * 160 + 40;
                g.particles.push({
                  x: ast.x,
                  y: ast.y,
                  vx: Math.cos(pAng) * pSpd,
                  vy: Math.sin(pAng) * pSpd,
                  life: 0.45 + Math.random() * 0.3,
                  maxLife: 0.75,
                  color: Math.random() > 0.4 ? "#a2ecd3" : "#e2e8f0",
                  size: Math.random() * 3 + 1.5,
                });
              }

              // Scoring & Combo multiplier
              const pts = (ast.tier === 3 ? 50 : ast.tier === 2 ? 100 : 200) * g.combo;
              g.score += pts;
              setScore(g.score);

              g.floatingTexts.push({
                x: ast.x,
                y: ast.y,
                text: `+${pts}`,
                color: g.combo > 1 ? "#38bdf8" : "#ffffff",
                life: 0.8,
                maxLife: 0.8,
              });

              if (g.score > highScore) {
                setHighScore(g.score);
                try { localStorage.setItem("nasa-asteroid-highscore", String(g.score)); } catch { /* Ignore */ }
              }

              // Fragment into smaller asteroids with spatial separation and opposing impulses
              if (ast.tier === 3 || ast.tier === 2) {
                const nextTier = ast.tier === 3 ? 2 : 1;
                const splitAngle = Math.random() * Math.PI * 2;
                const sep = ast.radius * 0.55;
                const dx = Math.cos(splitAngle) * sep;
                const dy = Math.sin(splitAngle) * sep;
                const boost = ast.tier === 3 ? 0.8 : 1.2;

                const c1 = createAsteroid(ast.x + dx, ast.y + dy, nextTier);
                const c2 = createAsteroid(ast.x - dx, ast.y - dy, nextTier);
                c1.vx = ast.vx * 0.6 + Math.cos(splitAngle) * boost;
                c1.vy = ast.vy * 0.6 + Math.sin(splitAngle) * boost;
                c2.vx = ast.vx * 0.6 - Math.cos(splitAngle) * boost;
                c2.vy = ast.vy * 0.6 - Math.sin(splitAngle) * boost;
                g.asteroids.push(c1, c2);
              }

              g.asteroids.splice(aIdx, 1);
              break;
            }
          }

          if (laserHit) {
            g.lasers.splice(lIdx, 1);
          }
        }

        // Ship vs Asteroid Collision
        if (ship.invulnerableTimer <= 0) {
          for (let aIdx = 0; aIdx < g.asteroids.length; aIdx++) {
            const ast = g.asteroids[aIdx];
            const dist = Math.hypot(ship.x - ast.x, ship.y - ast.y);
            if (dist < ship.radius + ast.radius * 0.85) {
              // Impact!
              audioRef.current?.playExplosion(3);
              g.shields = Math.max(0, g.shields - 34);
              setShields(g.shields);
              ship.invulnerableTimer = 2.0;

              // Blast impulse away from asteroid
              const impAng = Math.atan2(ship.y - ast.y, ship.x - ast.x);
              ship.vx += Math.cos(impAng) * 220;
              ship.vy += Math.sin(impAng) * 220;

              // Impact spark particles
              for (let p = 0; p < 16; p++) {
                const pAng = Math.random() * Math.PI * 2;
                g.particles.push({
                  x: ship.x,
                  y: ship.y,
                  vx: Math.cos(pAng) * 180,
                  vy: Math.sin(pAng) * 180,
                  life: 0.4,
                  maxLife: 0.4,
                  color: "#ef4444",
                  size: 3,
                });
              }

              if (g.shields <= 0) {
                setGameState("gameover");
                audioRef.current?.stopAll();
              }
              break;
            }
          }
        }

        // Wave cleared -> Next sector with shield restoration bonus
        if (g.asteroids.length === 0) {
          g.shields = Math.min(100, g.shields + 25);
          setShields(g.shields);
          initSector(g.sector + 1, true);
        }
      }

      // Update Particles
      for (let pIdx = g.particles.length - 1; pIdx >= 0; pIdx--) {
        const p = g.particles[pIdx];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.96, dt * 60);
        p.vy *= Math.pow(0.96, dt * 60);
        p.life -= dt;
        if (p.life <= 0) g.particles.splice(pIdx, 1);
      }

      // Update Floating texts
      for (let fIdx = g.floatingTexts.length - 1; fIdx >= 0; fIdx--) {
        const f = g.floatingTexts[fIdx];
        f.y -= 35 * dt;
        f.life -= dt;
        if (f.life <= 0) g.floatingTexts.splice(fIdx, 1);
      }

      // 2. RENDER CANVAS SCENE
      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, w, h);

      // Stars
      for (const st of g.stars) {
        ctx.fillStyle = `rgba(226, 232, 240, ${st.b})`;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.s, 0, Math.PI * 2);
        ctx.fill();
      }

      // Particles
      for (const p of g.particles) {
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // Lasers
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 8;
      for (const l of g.lasers) {
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x - (l.vx / 540) * 12, l.y - (l.vy / 540) * 12);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // Asteroids
      for (const ast of g.asteroids) {
        ctx.save();
        ctx.translate(ast.x, ast.y);
        ctx.rotate(ast.angle);

        // Rock body outline
        ctx.strokeStyle = "#94a3b8";
        ctx.fillStyle = "#1e293b";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        const pts = ast.points;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          const r = ast.radius * pts[i];
          const px = Math.cos(ang) * r;
          const py = Math.sin(ang) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Crater details
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1.2;
        for (const c of ast.craters) {
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      }

      // Ship Rocket
      if (gameState === "playing" || gameState === "paused") {
        const ship = g.ship;
        const flash = ship.invulnerableTimer > 0 && Math.floor(timestamp / 90) % 2 === 0;

        if (!flash) {
          ctx.save();
          ctx.translate(ship.x, ship.y);
          ctx.rotate(ship.angle);

          // Rocket Body (NASA SLS / Artemis Aesthetic)
          ctx.fillStyle = "#f8fafc";
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 1.6;

          // Main hull
          ctx.beginPath();
          ctx.moveTo(18, 0); // nosecone
          ctx.lineTo(-10, -8); // left side
          ctx.lineTo(-8, -4);
          ctx.lineTo(-8, 4);
          ctx.lineTo(-10, 8); // right side
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Swept delta wings / fins
          ctx.fillStyle = "#0284c7";
          ctx.beginPath();
          ctx.moveTo(-4, -6);
          ctx.lineTo(-14, -14);
          ctx.lineTo(-12, -4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(-4, 6);
          ctx.lineTo(-14, 14);
          ctx.lineTo(-12, 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Cockpit canopy window
          ctx.fillStyle = "#0ea5e9";
          ctx.beginPath();
          ctx.arc(4, 0, 3.5, 0, Math.PI * 2);
          ctx.fill();

          // Active engine thruster glow
          if (ship.thrusting) {
            ctx.fillStyle = "#fbbf24";
            ctx.beginPath();
            ctx.moveTo(-10, -4);
            ctx.lineTo(-22 - Math.random() * 8, 0);
            ctx.lineTo(-10, 4);
            ctx.closePath();
            ctx.fill();
          }

          // Shield bubble indicator
          if (ship.invulnerableTimer > 0) {
            ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(0, 0, 22, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.restore();
        }
      }

      // Floating Score Popups
      for (const ft of g.floatingTexts) {
        ctx.fillStyle = ft.color;
        ctx.font = "bold 13px monospace";
        ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.globalAlpha = 1.0;

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      audioRef.current?.stopAll();
    };
  }, [gameState, highScore]);

  // Touch handlers for mobile/onscreen controls
  const handleTouchThrust = (down: boolean) => {
    if (down) gameRef.current.keys.add("ArrowUp");
    else gameRef.current.keys.delete("ArrowUp");
  };
  const handleTouchLeft = (down: boolean) => {
    if (down) gameRef.current.keys.add("ArrowLeft");
    else gameRef.current.keys.delete("ArrowLeft");
  };
  const handleTouchRight = (down: boolean) => {
    if (down) gameRef.current.keys.add("ArrowRight");
    else gameRef.current.keys.delete("ArrowRight");
  };
  const handleTouchFire = (down: boolean) => {
    if (down) gameRef.current.keys.add("Space");
    else gameRef.current.keys.delete("Space");
  };

  return (
    <div className={`asteroid-game-container ${isOverlay ? "game-as-overlay" : ""}`}>
      {/* Game Header Bar */}
      <div className="asteroid-header">
        <div className="asteroid-header-left">
          <span className="game-badge">OFFLINE ARCADE</span>
          <h3 className="game-title">ROCKET ASTEROID DEFENSE</h3>
        </div>

        <div className="asteroid-stats">
          <div className="stat-pill">
            <span className="stat-label">SCORE</span>
            <strong className="stat-val">{score.toLocaleString()}</strong>
          </div>
          <div className="stat-pill">
            <span className="stat-label">HIGH</span>
            <strong className="stat-val">{highScore.toLocaleString()}</strong>
          </div>
          <div className="stat-pill">
            <span className="stat-label">SECTOR</span>
            <strong className="stat-val">{sector}</strong>
          </div>
          <div className="stat-pill shield-pill">
            <span className="stat-label">SHIELDS</span>
            <div className="shield-bar-bg">
              <div
                className="shield-bar-fill"
                style={{
                  width: `${shields}%`,
                  background: shields > 50 ? "#10b981" : shields > 25 ? "#f59e0b" : "#ef4444"
                }}
              />
            </div>
          </div>
        </div>

        <div className="asteroid-actions">
          <button
            type="button"
            className="game-icon-btn"
            title={soundEnabled ? "Mute audio (M)" : "Enable audio (M)"}
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              audioRef.current?.setMuted(!next);
            }}
          >
            {soundEnabled ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}
          </button>
          <button
            type="button"
            className="game-icon-btn"
            title="Pause / Resume (P)"
            onClick={() => setGameState(cur => cur === "playing" ? "paused" : cur === "paused" ? "playing" : cur)}
          >
            {gameState === "paused" ? <Play size={18} /> : <Pause size={18} />}
          </button>
          {onClose && (
            <button type="button" className="game-icon-btn" title="Exit Game (Esc)" onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Main Arcade Viewport */}
      <div className="asteroid-canvas-wrapper">
        <canvas ref={canvasRef} width={800} height={520} className="asteroid-canvas" />

        {/* Start / Intro Overlay */}
        {gameState === "ready" && (
          <div className="game-overlay-screen">
            <div className="overlay-dialog">
              <div className="overlay-rocket-icon">🚀</div>
              <h2>ASTEROID DEFENSE PROTOCOL</h2>
              <p>Telemetry standby. Protect your lunar transit rocket through the asteroid belt.</p>

              <div className="controls-guide">
                <div><kbd>W</kbd> or <kbd>↑</kbd> <span>Thrust Engine</span></div>
                <div><kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> <span>Rotate Hull</span></div>
                <div><kbd>SPACE</kbd> <span>Dual Plasma Lasers</span></div>
                <div><kbd>P</kbd> <span>Pause</span> · <kbd>M</kbd> <span>Sound</span></div>
              </div>

              <button type="button" className="game-btn-primary" onClick={startGame}>
                LAUNCH MISSION (SPACE)
              </button>
              <p className="offline-note">✓ 100% Offline Capable · Cached in Local Storage &amp; Service Worker</p>
            </div>
          </div>
        )}

        {/* Paused Overlay */}
        {gameState === "paused" && (
          <div className="game-overlay-screen">
            <div className="overlay-dialog">
              <h2>MISSION PAUSED</h2>
              <p>Orbital inertia maintained.</p>
              <button type="button" className="game-btn-primary" onClick={() => setGameState("playing")}>
                RESUME FLIGHT (P)
              </button>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameState === "gameover" && (
          <div className="game-overlay-screen">
            <div className="overlay-dialog">
              <h2 style={{ color: "#ef4444" }}>MISSION TERMINATED</h2>
              <p>Hull integrity compromised by asteroid collision.</p>
              <div className="gameover-scores">
                <div><span>FINAL SCORE</span><strong>{score.toLocaleString()}</strong></div>
                <div><span>SECTOR REACHED</span><strong>SECTOR {sector}</strong></div>
                <div><span>ALL-TIME RECORD</span><strong>{highScore.toLocaleString()}</strong></div>
              </div>
              <button type="button" className="game-btn-primary" onClick={startGame}>
                <ArrowCounterClockwise size={16} /> RE-ENGAGE MISSION (SPACE)
              </button>
            </div>
          </div>
        )}

        {/* Calculation Complete Banner in Overlay Mode */}
        {calculationReady && onCalculationFinished && (
          <div className="calc-ready-banner">
            <span>✓ Mission Geometry Calculation Complete</span>
            <button type="button" className="calc-continue-btn" onClick={onCalculationFinished}>
              View Results →
            </button>
          </div>
        )}
      </div>

      {/* On-Screen Touch Controls for Mobile/Tablet */}
      <div className="touch-controls-bar">
        <button
          type="button"
          className="touch-btn"
          onPointerDown={() => handleTouchLeft(true)}
          onPointerUp={() => handleTouchLeft(false)}
          onPointerLeave={() => handleTouchLeft(false)}
        >
          ↺ TURN L
        </button>
        <button
          type="button"
          className="touch-btn"
          onPointerDown={() => handleTouchRight(true)}
          onPointerUp={() => handleTouchRight(false)}
          onPointerLeave={() => handleTouchRight(false)}
        >
          ↻ TURN R
        </button>
        <button
          type="button"
          className="touch-btn touch-btn-thrust"
          onPointerDown={() => handleTouchThrust(true)}
          onPointerUp={() => handleTouchThrust(false)}
          onPointerLeave={() => handleTouchThrust(false)}
        >
          ▲ THRUST
        </button>
        <button
          type="button"
          className="touch-btn touch-btn-fire"
          onPointerDown={() => handleTouchFire(true)}
          onPointerUp={() => handleTouchFire(false)}
          onPointerLeave={() => handleTouchFire(false)}
        >
          🔥 FIRE
        </button>
      </div>
    </div>
  );
}
