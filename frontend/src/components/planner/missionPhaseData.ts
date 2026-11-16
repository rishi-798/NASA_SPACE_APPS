// Illustrative educational reference parameters; not a validated mission or vehicle profile.
export interface MissionPhaseMilestone {
  timeMet: string;
  name: string;
  description: string;
  altitudeKm: number;
  velocityKmS: number;
}

export interface MissionPhase {
  id: "ascent" | "parking" | "tli" | "cruise" | "arrival" | "descent";
  phaseNumber: number;
  name: string;
  shortName: string;
  tagline: string;
  durationLabel: string;
  startMetSeconds: number;
  endMetSeconds: number;
  deltaVBudgetMS: number;
  initialAltitudeKm: number;
  finalAltitudeKm: number;
  initialVelocityKmS: number;
  finalVelocityKmS: number;
  trajectoryColor: string;
  overview: string;
  orbitalMechanics: string;
  engineeringChallenges: string;
  telemetryProfile: {
    primaryMetric: string;
    primaryValue: string;
    engineStatus: "Ignition / Full Thrust" | "Engine Cutoff / Coast" | "Deep Throttling" | "RCS Reaction Control" | "Shutdown / Touchdown";
    gravitationalDominance: "Earth Strong (1.0g)" | "Earth Low Orbit (0.89g)" | "Earth Gravity Well" | "Earth-Moon L1 Equilibrium" | "Moon Gravity Well" | "Lunar Surface (0.166g)";
    c3EnergyKm2S2?: number;
    semimajorAxisKm?: number;
    eccentricity?: number;
  };
  milestones: MissionPhaseMilestone[];
  keyEquations: {
    name: string;
    latex: string;
    meaning: string;
    formula?: string;
    variables?: { symbol: string; label: string }[];
  }[];
}

export const MISSION_PHASES: MissionPhase[] = [
  {
    id: "ascent",
    phaseNumber: 1,
    name: "Atmospheric Ascent & Gravity Turn",
    shortName: "Ascent",
    tagline: "Surface liftoff to Low Earth Orbit insertion",
    durationLabel: "0 to 8.5 minutes (T+00:00:00 → T+00:08:30)",
    startMetSeconds: 0,
    endMetSeconds: 510,
    deltaVBudgetMS: 9250,
    initialAltitudeKm: 0,
    finalAltitudeKm: 185,
    initialVelocityKmS: 0.41, // Surface launch pad eastward rotational assist
    finalVelocityKmS: 7.79,
    trajectoryColor: "#f97316", // Orange
    overview:
      "The ascent phase overcomes Earth's dense atmosphere and gravitational pull, steering the launch vehicle eastward along a predetermined gravity turn to reach orbital velocity before propellant exhaustion.",
    orbitalMechanics:
      "At liftoff, thrust-to-weight ratio (T/W) must exceed 1.2 to achieve positive vertical acceleration. At ~100 m/s, the vehicle executes a gentle pitch maneuver downrange. From that point onward, the flight path angle naturally pitches down under the influence of gravity (the zero-aerodynamic-lift 'gravity turn'), which minimizes lateral aerodynamic loads and steering losses. Earth's eastward equatorial rotation provides a free ~400–465 m/s velocity bonus.",
    engineeringChallenges:
      "Surviving Max-Q (maximum aerodynamic dynamic pressure, typically ~35 kPa at T+1:15), intense acoustic vibrations, staging separations (booster MECO, interstage jettison), and payload fairing jettison once atmospheric density drops low enough (above 110 km) to prevent aerodynamic heating.",
    telemetryProfile: {
      primaryMetric: "Dynamic Pressure (Max-Q)",
      primaryValue: "34.2 kPa @ T+1:18",
      engineStatus: "Ignition / Full Thrust",
      gravitationalDominance: "Earth Strong (1.0g)",
      c3EnergyKm2S2: -60.8,
      semimajorAxisKm: 6450,
      eccentricity: 0.08,
    },
    milestones: [
      { timeMet: "T+00:00:00", name: "Liftoff", description: "Main engines ignite, hold-down release, vehicle clears tower", altitudeKm: 0, velocityKmS: 0.41 },
      { timeMet: "T+00:01:15", name: "Max-Q", description: "Maximum aerodynamic structural stress at Mach 1.6", altitudeKm: 13.8, velocityKmS: 0.52 },
      { timeMet: "T+00:02:40", name: "Booster MECO & Staging", description: "First stage propellant exhaustion and pyrotechnic staging", altitudeKm: 68.0, velocityKmS: 2.75 },
      { timeMet: "T+00:03:15", name: "Payload Fairing Jettison", description: "Atmosphere sufficiently thin; fairing halves discarded", altitudeKm: 114.0, velocityKmS: 3.40 },
      { timeMet: "T+00:08:30", name: "SECO-1 / Orbit Insertion", description: "Second stage cutoff; spacecraft in circular parking orbit", altitudeKm: 185.0, velocityKmS: 7.79 },
    ],
    keyEquations: [
      {
        name: "Tsiolkovsky Rocket Equation",
        latex: "\\Delta v = v_e \\ln\\left(\\frac{m_0}{m_f}\\right) - \\Delta v_{\\text{grav}} - \\Delta v_{\\text{drag}}",
        formula: "Δv = ve · ln(m₀ / mf) - Δvgrav - Δvdrag",
        meaning: "Determines total achievable velocity based on engine effective exhaust velocity and propellant mass fraction, minus gravity and atmospheric drag losses (~1,400 m/s total losses).",
        variables: [
          { symbol: "ve", label: "Effective exhaust velocity (Isp · g₀)" },
          { symbol: "m₀ / mf", label: "Initial wet mass to final dry mass ratio" },
          { symbol: "Δvgrav", label: "Gravity steering losses (∫ g·sin θ dt)" },
          { symbol: "Δvdrag", label: "Aerodynamic drag loss (∫ D/m dt)" },
        ],
      },
      {
        name: "Dynamic Pressure (Max-Q)",
        latex: "q = \\frac{1}{2} \\rho v^2",
        formula: "q = ½ · ρ · v²",
        meaning: "Quantifies structural stress from air resistance, peaking at Max-Q as velocity increases while atmospheric density exponentially decays.",
        variables: [
          { symbol: "ρ", label: "Atmospheric density (kg/m³)" },
          { symbol: "v", label: "Vehicle airspeed relative to atmosphere (m/s)" },
          { symbol: "q_max", label: "Peak stress reached (~34.2 kPa at T+1:15)" },
        ],
      },
    ],
  },
  {
    id: "parking",
    phaseNumber: 2,
    name: "Earth Parking Orbit (LEO Checkout)",
    shortName: "Parking Orbit",
    tagline: "Low Earth Orbit circular coast, system diagnostics & TLI alignment",
    durationLabel: "8.5 minutes to 2.75 hours (1 to 2 revolutions)",
    startMetSeconds: 510,
    endMetSeconds: 9900,
    deltaVBudgetMS: 0, // Coast phase
    initialAltitudeKm: 185,
    finalAltitudeKm: 185,
    initialVelocityKmS: 7.79,
    finalVelocityKmS: 7.79,
    trajectoryColor: "#38bdf8", // Sky blue
    overview:
      "A temporary circular coast in Low Earth Orbit (LEO) at ~185 km altitude. Spacecraft subsystems, solar arrays, navigation gyroscopes, and thermal loops undergo automated checkout while tracking ground stations verify orbital parameters.",
    orbitalMechanics:
      "In a circular orbit, gravitational force equals required centripetal acceleration (vc = √(μE / r)). At 185 km altitude, orbital velocity is exactly 7.79 km/s and the orbital period is 88.3 minutes. The parking orbit is essential for translunar flight because the Earth and Moon are not static; the parking orbit allows the spacecraft to coast until reaching the exact perigee position (phase angle ~115° relative to the Moon) required for translunar injection.",
    engineeringChallenges:
      "Managing cryogenic boil-off of liquid hydrogen and liquid oxygen in the upper stage tanks, tracking orbital decay from upper-atmospheric drag, and establishing precise navigation state vectors using star trackers and DSN / TDRSS telemetry.",
    telemetryProfile: {
      primaryMetric: "Orbital Period",
      primaryValue: "88.24 minutes (185 × 185 km)",
      engineStatus: "Engine Cutoff / Coast",
      gravitationalDominance: "Earth Low Orbit (0.89g)",
      c3EnergyKm2S2: -60.7,
      semimajorAxisKm: 6563,
      eccentricity: 0.0008,
    },
    milestones: [
      { timeMet: "T+00:08:45", name: "Spacecraft Systems Checkout", description: "Attitude control check, electrical bus telemetry verified", altitudeKm: 185, velocityKmS: 7.79 },
      { timeMet: "T+00:25:00", name: "Flight Computer TLI Solution", description: "Final burn ignition timing and vector uploaded from ground", altitudeKm: 185, velocityKmS: 7.79 },
      { timeMet: "T+01:28:00", name: "Orbit 1 Completion", description: "Pass over Australian and Pacific tracking stations", altitudeKm: 185, velocityKmS: 7.79 },
      { timeMet: "T+02:40:00", name: "TLI Attitude Slew", description: "Vehicle slews to prograde ignition attitude for translunar injection", altitudeKm: 185, velocityKmS: 7.79 },
    ],
    keyEquations: [
      {
        name: "Circular Orbital Velocity",
        latex: "v_c = \\sqrt{\\frac{\\mu_E}{R_E + h}} = \\sqrt{\\frac{398600.4}{6563}} \\approx 7.794 \\text{ km/s}",
        formula: "vc = √(μE / r) = √(398,600.4 / 6,563) ≈ 7.794 km/s",
        meaning: "Exact speed needed to maintain altitude where gravitational fall precisely matches the curvature of the Earth.",
        variables: [
          { symbol: "μE", label: "Earth standard gravitational parameter (398,600.4 km³/s²)" },
          { symbol: "r", label: "Orbital radius from Earth center (RE + h = 6,563 km)" },
          { symbol: "vc", label: "Circular speed in LEO (7.794 km/s = 28,058 km/h)" },
        ],
      },
      {
        name: "Orbital Period",
        latex: "T = 2\\pi \\sqrt{\\frac{r^3}{\\mu_E}} = 2\\pi \\sqrt{\\frac{6563^3}{398600.4}} \\approx 5294 \\text{ s} \\approx 88.24 \\text{ min}",
        formula: "T = 2π · √(r³ / μE) ≈ 5,294 s ≈ 88.24 min",
        meaning: "Time elapsed per full revolution around the planet.",
        variables: [
          { symbol: "r", label: "Semi-major axis of circular orbit (6,563 km)" },
          { symbol: "T", label: "Orbital period (88.24 min, ~16 orbits per 24 hours)" },
        ],
      },
    ],
  },
  {
    id: "tli",
    phaseNumber: 3,
    name: "Translunar Injection (TLI Burn)",
    shortName: "TLI",
    tagline: "Prograde escape burn raising apogee to lunar orbit intersection",
    durationLabel: "5.5 minutes (T+02:45:00 → T+02:50:30)",
    startMetSeconds: 9900,
    endMetSeconds: 10230,
    deltaVBudgetMS: 3150,
    initialAltitudeKm: 185,
    finalAltitudeKm: 320,
    initialVelocityKmS: 7.79,
    finalVelocityKmS: 10.94,
    trajectoryColor: "#facc15", // Amber yellow
    overview:
      "The upper stage reignites in Low Earth Orbit to execute a massive ~3,150 m/s prograde burn. This stretches the circular orbit into a high-energy transfer ellipse whose apogee matches the distance of the Moon ~384,400 km away.",
    orbitalMechanics:
      "TLI takes advantage of the Oberth effect: applying rocket thrust at high speed deep within Earth's gravity well maximizes kinetic energy gain per unit of propellant. The post-burn velocity (~10.94 km/s) is barely below Earth escape velocity (11.02 km/s), setting the transfer ellipse eccentricity to ~0.966 with apogee timed to intercept the Moon's future position 3 days later.",
    engineeringChallenges:
      "Re-igniting cryogenic engines (like the J-2 on Apollo's S-IVB or RL-10 on Centaur) in zero-g requires propellant settling using small ullage motors. The burn vector must be accurate within fractions of a meter per second to avoid completely missing the Moon.",
    telemetryProfile: {
      primaryMetric: "TLI Delta-V Imparted",
      primaryValue: "+3,150.4 m/s (C3 = -1.82 km²/s²)",
      engineStatus: "Ignition / Full Thrust",
      gravitationalDominance: "Earth Gravity Well",
      c3EnergyKm2S2: -1.82,
      semimajorAxisKm: 195480,
      eccentricity: 0.9664,
    },
    milestones: [
      { timeMet: "T+02:45:00", name: "TLI Ignition", description: "Upper stage cryogenic restart, ullage motors active", altitudeKm: 185, velocityKmS: 7.79 },
      { timeMet: "T+02:47:30", name: "Burn Midpoint", description: "G-force peaks at 1.8g, apogee rapidly climbing through 100,000 km", altitudeKm: 245, velocityKmS: 9.35 },
      { timeMet: "T+02:50:30", name: "TLI Cutoff (SECO-2)", description: "Target orbital energy achieved, apogee at lunar distance", altitudeKm: 320, velocityKmS: 10.94 },
    ],
    keyEquations: [
      {
        name: "Vis-Viva Equation for TLI",
        latex: "v^2 = \\mu_E \\left(\\frac{2}{r} - \\frac{1}{a}\\right)",
        formula: "v² = μE · (2/r - 1/a)",
        meaning: "Relates spacecraft speed to its distance from Earth and the semi-major axis of the translunar ellipse.",
        variables: [
          { symbol: "r", label: "Perigee distance at burn ignition (6,556 km)" },
          { symbol: "a", label: "Transfer ellipse semi-major axis (~195,480 km)" },
          { symbol: "v", label: "Cutoff velocity (10.94 km/s near Earth escape)" },
        ],
      },
      {
        name: "Oberth Effect Energy Gain",
        latex: "\\Delta E_k = v \\cdot \\Delta v + \\frac{1}{2}(\\Delta v)^2",
        formula: "ΔEk = v · Δv + ½ · (Δv)²",
        meaning: "Because kinetic energy scales with v², burning at the highest possible orbital velocity (perigee) generates vastly more orbital mechanical energy.",
        variables: [
          { symbol: "v", label: "High initial perigee speed (7.79 km/s)" },
          { symbol: "Δv", label: "Propulsion burn velocity increment (+3,150 m/s)" },
          { symbol: "ΔEk", label: "Total specific kinetic energy gained (MJ/kg)" },
        ],
      },
    ],
  },
  {
    id: "cruise",
    phaseNumber: 4,
    name: "Translunar Coast & Cislunar Cruise",
    shortName: "Cruise",
    tagline: "3-day cislunar transit, thermal barbecue roll & trajectory trims",
    durationLabel: "68 to 96 hours (~3 days)",
    startMetSeconds: 10230,
    endMetSeconds: 257400, // ~71.5h
    deltaVBudgetMS: 35, // Mid-course corrections
    initialAltitudeKm: 320,
    finalAltitudeKm: 384400,
    initialVelocityKmS: 10.94,
    finalVelocityKmS: 0.92, // Decelerates toward L1 neutral point before lunar acceleration
    trajectoryColor: "#818cf8", // Indigo blue
    overview:
      "A quiet 3-day coast spanning ~384,400 km of cislunar space. The spacecraft continuously trades kinetic energy for gravitational potential energy, slowing down as it climbs Earth's gravitational slope.",
    orbitalMechanics:
      "Governed by the Circular Restricted Three-Body Problem (CR3BP). Velocity drops from ~10.9 km/s near Earth to ~0.9 km/s near the Earth-Moon L1 gravitational saddle point (~326,000 km from Earth). At ~66,100 km from the Moon, the craft crosses the lunar Sphere of Influence (SOI), where lunar gravitational attraction surpasses Earth's, causing the vehicle to accelerate toward the Moon.",
    engineeringChallenges:
      "Deep Space Network (DSN) tracking with light-time delays up to 1.3 seconds, executing small Trajectory Correction Maneuvers (TCMs) using RCS thrusters, and maintaining Passive Thermal Control (PTC 'barbecue roll' at 1–3 RPM) to prevent solar overheating on one side and deep freezing on the other.",
    telemetryProfile: {
      primaryMetric: "Earth-Moon L1 Transit",
      primaryValue: "Neutral gravity @ 326,000 km",
      engineStatus: "RCS Reaction Control",
      gravitationalDominance: "Earth-Moon L1 Equilibrium",
      c3EnergyKm2S2: -1.75,
      semimajorAxisKm: 195480,
      eccentricity: 0.9664,
    },
    milestones: [
      { timeMet: "T+03:10:00", name: "Transposition & Separation", description: "Spacecraft separates from spent booster and begins cislunar cruise", altitudeKm: 1420, velocityKmS: 10.35 },
      { timeMet: "T+05:00:00", name: "Van Allen Radiation Belt Exit", description: "Spacecraft clears outer Earth radiation belt safely", altitudeKm: 25000, velocityKmS: 7.20 },
      { timeMet: "T+14:00:00", name: "TCM-1 Midcourse Correction", description: "Small 12 m/s RCS burn to refine perilune aim point", altitudeKm: 110000, velocityKmS: 3.10 },
      { timeMet: "T+40:00:00", name: "Cislunar Halfway Point", description: "Distance exceeds 200,000 km, passive thermal roll ongoing", altitudeKm: 205000, velocityKmS: 1.62 },
      { timeMet: "T+62:00:00", name: "Lunar Sphere of Influence Entry", description: "Crossing 66,100 km lunar boundary; Moon's gravity becomes dominant", altitudeKm: 320000, velocityKmS: 0.98 },
    ],
    keyEquations: [
      {
        name: "Laplace Sphere of Influence",
        latex: "r_{\\text{SOI}} = D \\left(\\frac{M_{\\text{Moon}}}{M_{\\text{Earth}}}\\right)^{2/5} \\approx 384400 \\left(\\frac{7.348\\times 10^{22}}{5.972\\times 10^{24}}\\right)^{2/5} \\approx 66180 \\text{ km}",
        formula: "r_SOI = D · (M_Moon / M_Earth)^(2/5) ≈ 66,180 km",
        meaning: "The boundary where the Moon's gravitational acceleration on the spacecraft exceeds Earth's tidal perturbation.",
        variables: [
          { symbol: "D", label: "Earth-Moon orbital separation distance (384,400 km)" },
          { symbol: "M_Moon / M_Earth", label: "Mass ratio between Moon and Earth (1 / 81.3)" },
          { symbol: "r_SOI", label: "Radius of lunar sphere of influence (~66,180 km)" },
        ],
      },
      {
        name: "Jacobi Energy Integral (CR3BP)",
        latex: "C_J = 2\\Omega(x,y,z) - (\\dot{x}^2 + \\dot{y}^2 + \\dot{z}^2)",
        formula: "CJ = 2·Ω(x, y, z) - (ẋ² + ẏ² + ż²)",
        meaning: "The invariant conserved energy quantity in rotating frame orbital mechanics across the Earth-Moon system.",
        variables: [
          { symbol: "Ω(x,y,z)", label: "Effective combined gravitational + centrifugal potential" },
          { symbol: "ẋ, ẏ, ż", label: "Rotating frame spacecraft velocity components" },
          { symbol: "CJ", label: "Jacobi constant defining forbidden zero-velocity regions" },
        ],
      },
    ],
  },
  {
    id: "arrival",
    phaseNumber: 5,
    name: "Lunar Orbit Insertion & Capture (LOI)",
    shortName: "Lunar Arrival",
    tagline: "Hyperbolic perilune approach & retrograde braking into Low Lunar Orbit",
    durationLabel: "4.5 hours (T+71:30:00 → T+76:00:00)",
    startMetSeconds: 257400,
    endMetSeconds: 273600,
    deltaVBudgetMS: 890,
    initialAltitudeKm: 66180, // Moon-relative distance
    finalAltitudeKm: 100, // Circular LLO
    initialVelocityKmS: 2.55, // Hyperbolic speed at perilune
    finalVelocityKmS: 1.63, // Circular orbit speed
    trajectoryColor: "#10b981", // Emerald green
    overview:
      "As the spacecraft swoops past perilune (100 km above the Moon's far side), it fires its main engine retrograde for ~6 minutes to shed excess hyperbolic velocity, capturing into a stable circular Low Lunar Orbit.",
    orbitalMechanics:
      "Because the Moon lacks an atmosphere, aerocapture is impossible: 100% of the capture velocity must be eliminated with rocket propellant. The approach trajectory is a hyperbola relative to the Moon with hyperbolic excess velocity v∞ ≈ 0.85 km/s. At periselene (100 km altitude), velocity reaches ~2.55 km/s. A retrograde burn of Δv ≈ 890 m/s slows the craft to the circular orbital speed of 1.633 km/s.",
    engineeringChallenges:
      "LOI ignition takes place behind the Moon on the far side, resulting in a 45-minute Loss of Signal (LOS) where the spacecraft must operate entirely autonomously without Mission Control communications.",
    telemetryProfile: {
      primaryMetric: "Circular LLO Velocity",
      primaryValue: "1,633 m/s (100 × 100 km orbit)",
      engineStatus: "Ignition / Full Thrust",
      gravitationalDominance: "Moon Gravity Well",
      c3EnergyKm2S2: -2.66,
      semimajorAxisKm: 1837,
      eccentricity: 0.0012,
    },
    milestones: [
      { timeMet: "T+71:30:00", name: "Loss of Signal (LOS)", description: "Spacecraft passes behind lunar limb; autonomous burn mode armed", altitudeKm: 280, velocityKmS: 2.40 },
      { timeMet: "T+72:00:00", name: "LOI Burn Ignition", description: "Retrograde braking burn begins at periselene altitude of 100 km", altitudeKm: 100, velocityKmS: 2.55 },
      { timeMet: "T+72:06:00", name: "LOI Cutoff / Lunar Capture", description: "Hyperbolic trajectory closed into circular 100 km Low Lunar Orbit", altitudeKm: 100, velocityKmS: 1.63 },
      { timeMet: "T+72:45:00", name: "Acquisition of Signal (AOS)", description: "Spacecraft emerges from lunar far side; telemetry verified by Goldstone DSN", altitudeKm: 100, velocityKmS: 1.63 },
    ],
    keyEquations: [
      {
        name: "Lunar Capture Delta-V",
        latex: "\\Delta v_{\\text{LOI}} = \\sqrt{v_\\infty^2 + \\frac{2\\mu_M}{r_p}} - \\sqrt{\\frac{\\mu_M}{r_p}}",
        formula: "Δv_LOI = √(v∞² + 2μM / rp) - √(μM / rp) ≈ 890 m/s",
        meaning: "Calculates the exact retrograde impulse needed to brake from hyperbolic arrival trajectory down to circular orbital capture velocity.",
        variables: [
          { symbol: "v∞", label: "Hyperbolic arrival excess velocity (~0.85 km/s)" },
          { symbol: "rp", label: "Periselene radius at burn altitude (1,737.4 + 100 km)" },
          { symbol: "μM", label: "Moon gravitational parameter (4,902.8 km³/s²)" },
        ],
      },
      {
        name: "Low Lunar Orbit Period",
        latex: "T_M = 2\\pi \\sqrt{\\frac{(R_M + h)^3}{\\mu_M}} = 2\\pi \\sqrt{\\frac{(1737.4 + 100)^3}{4902.8}} \\approx 7096 \\text{ s} \\approx 118.3 \\text{ min}",
        formula: "TM = 2π · √((RM + h)³ / μM) ≈ 7,096 s ≈ 118.3 min",
        meaning: "One complete orbital revolution around the Moon takes slightly under two hours.",
        variables: [
          { symbol: "RM + h", label: "Radius of 100 km circular lunar orbit (1,837.4 km)" },
          { symbol: "TM", label: "Orbital period (1 hr 58 min)" },
        ],
      },
    ],
  },
  {
    id: "descent",
    phaseNumber: 6,
    name: "Powered Descent & Surface Touchdown",
    shortName: "Descent & Landing",
    tagline: "DOI deorbit, braking phase, terrain hazard avoidance & soft touchdown",
    durationLabel: "12 to 14 minutes (PDI → Touchdown)",
    startMetSeconds: 273600,
    endMetSeconds: 288000,
    deltaVBudgetMS: 2150,
    initialAltitudeKm: 100,
    finalAltitudeKm: 0,
    initialVelocityKmS: 1.63,
    finalVelocityKmS: 0.001, // ~1 m/s vertical touchdown
    trajectoryColor: "#e11d48", // Rose red
    overview:
      "The descent engine throttles continuously to brake 1,630 m/s of horizontal orbital speed, transitioning from horizontal braking to a vertical optical/hazard-avoidance descent for a soft touchdown on the lunar regolith.",
    orbitalMechanics:
      "A small Descent Orbit Insertion (DOI) burn drops perilune from 100 km to 15 km over the landing site. At 15 km, Powered Descent Initiation (PDI) begins. In vacuum, the descent trajectory executes a continuous gravity-turn braking maneuver. Below 2.5 km (High Gate), the lander pitches upright so optical cameras and LiDAR scan the landing zone. At Low Gate (300 m), pilot/autopilot guides vertical velocity to ≤ 1.5 m/s until landing gear contact probes trigger engine shutdown.",
    engineeringChallenges:
      "Non-linear rocket mass depletion, severe rocket exhaust plume interaction with lunar dust ('dust storm' obscuring surface below 30 m), crater slopes and boulder collision avoidance, and strict propellant margins leaving zero room for error.",
    telemetryProfile: {
      primaryMetric: "Touchdown Velocity",
      primaryValue: "Vertical 0.8 m/s · Horiz 0.1 m/s",
      engineStatus: "Deep Throttling",
      gravitationalDominance: "Lunar Surface (0.166g)",
      c3EnergyKm2S2: -2.82,
      semimajorAxisKm: 1737,
      eccentricity: 0.0,
    },
    milestones: [
      { timeMet: "T+78:00:00", name: "DOI Deorbit Burn", description: "Retrograde burn lowers orbit perigee to 15 km above landing zone", altitudeKm: 100, velocityKmS: 1.63 },
      { timeMet: "T+79:46:00", name: "PDI (Powered Descent Initiation)", description: "Descent engine ignites at full throttle (100%) for main braking", altitudeKm: 15.0, velocityKmS: 1.69 },
      { timeMet: "T+79:53:00", name: "High Gate / Pitch-Up", description: "Vehicle pitches upright from horizontal braking to optical view", altitudeKm: 2.2, velocityKmS: 0.15 },
      { timeMet: "T+79:57:00", name: "Low Gate / Vertical Descent", description: "Terminal vertical descent; hazard avoidance LiDAR active", altitudeKm: 0.12, velocityKmS: 0.02 },
      { timeMet: "T+79:58:30", name: "Touchdown / Contact Light", description: "Landing gear contacts lunar regolith, engine shutdown confirmed", altitudeKm: 0, velocityKmS: 0.00 },
    ],
    keyEquations: [
      {
        name: "Constant Gravity Braking",
        latex: "a_{\\text{req}} = \\frac{v_0^2}{2 \\Delta x} + g_M \\sin\\theta",
        formula: "areq = v₀² / (2 · Δx) + gM · sin θ",
        meaning: "Determines the necessary deceleration to halt horizontal velocity before reaching the target landing coordinate.",
        variables: [
          { symbol: "v₀", label: "Initial horizontal velocity at PDI (~1,690 m/s)" },
          { symbol: "Δx", label: "Downrange distance to landing zone (~450 km)" },
          { symbol: "gM", label: "Lunar surface gravity (1.62 m/s²)" },
        ],
      },
      {
        name: "Descent Mass Depletion",
        latex: "m(t) = m_0 - \\dot{m} t = m_0 - \\left(\\frac{T(t)}{I_{\\text{sp}} g_0}\\right) t",
        formula: "m(t) = m₀ - ṁ · t = m₀ - [T(t) / (Isp · g₀)] · t",
        meaning: "As propellant burns, lander mass plummets, causing acceleration to surge unless the engine is continuously throttled down.",
        variables: [
          { symbol: "m₀", label: "Initial lander wet mass with full fuel tanks" },
          { symbol: "ṁ", label: "Propellant mass flow rate (kg/s)" },
          { symbol: "T(t)", label: "Engine throttle level (deep throttle 10% to 100%)" },
          { symbol: "Isp", label: "Engine specific impulse (310 s storable / 450 s hydrolox)" },
        ],
      },
    ],
  },
];
