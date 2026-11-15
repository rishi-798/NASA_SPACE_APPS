import type { SimState } from "../../sim/physics";

type Series = { label: string; color: string; value: (s: SimState) => number };
const CHARTS: { title: string; unit: string; series: Series[] }[] = [
  { title: "Altitude (lowest footpad above terrain)", unit: "m", series: [{ label: "altitude", color: "var(--earth)", value: (s) => Math.max(0, s.altitudeM) }] },
  { title: "Speed", unit: "m/s", series: [
    { label: "vertical (down +)", color: "var(--sun)", value: (s) => -s.vel[2] },
    { label: "horizontal", color: "var(--success)", value: (s) => Math.hypot(s.vel[0], s.vel[1]) },
  ] },
  { title: "Propellant remaining", unit: "kg", series: [{ label: "propellant", color: "var(--accent)", value: (s) => s.propellantKg }] },
];

/** Altitude, speed and fuel against simulation time, from recorded samples (the same states the scene drew). */
export function SimCharts({ samples, cursorT }: { samples: SimState[]; cursorT: number | null }) {
  if (samples.length < 2) return <p className="analysis-note">Plots appear once the run starts.</p>;
  const stride = Math.max(1, Math.ceil(samples.length / 400));
  const pts = samples.filter((_, i) => i % stride === 0 || i === samples.length - 1);
  const t1 = pts.at(-1)!.t || 1;
  return <div className="sim-charts">
    {CHARTS.map((chart) => {
      const values = chart.series.flatMap((s) => pts.map(s.value));
      const lo = Math.min(0, ...values), hi = Math.max(...values, lo + 1e-6);
      const x = (t: number) => (t / t1) * 300, y = (v: number) => 110 - ((v - lo) / (hi - lo)) * 100;
      return <figure key={chart.title} className="sim-chart">
        <figcaption>{chart.title} <span>({chart.unit}, 0–{hi.toFixed(hi < 10 ? 1 : 0)})</span></figcaption>
        <svg viewBox="0 0 300 120" preserveAspectRatio="none" role="img" aria-label={`${chart.title} over ${t1.toFixed(1)} s of simulation time`}>
          <line x1="0" x2="300" y1={y(0)} y2={y(0)} className="sim-chart-axis" />
          {chart.series.map((s) => <polyline key={s.label} fill="none" stroke={s.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke"
            points={pts.map((p) => `${x(p.t).toFixed(1)},${y(s.value(p)).toFixed(1)}`).join(" ")} />)}
          {cursorT !== null && <line x1={x(cursorT)} x2={x(cursorT)} y1="0" y2="120" className="sim-chart-cursor" />}
        </svg>
        <p className="sim-chart-legend">{chart.series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)} · T+0 to T+{t1.toFixed(1)} s</p>
      </figure>;
    })}
  </div>;
}
