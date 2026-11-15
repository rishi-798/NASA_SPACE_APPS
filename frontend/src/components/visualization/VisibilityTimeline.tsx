import type { MissionSummary, VisibilityResponse } from "../../types";
import { formatUtcDisplay } from "../../lib/format";
type Props = { data: VisibilityResponse | null; summary: MissionSummary | null; sampleCount: number };
export function VisibilityTimeline({ data, summary, sampleCount }: Props) {
  const start = Date.parse(summary?.start ?? ""), duration = Date.parse(summary?.end ?? "") - start;
  const percent = (time: string) => (Date.parse(time) - start) / duration * 100;
  const rows = summary ? [
    { title: "SUNLIGHT", key: "sun", intervals: summary.windows.sunlight, value: summary.sunlight_percent },
    { title: "EARTH VISIBLE", key: "earth", intervals: summary.windows.earth_visible, value: summary.earth_visible_percent },
    { title: "BOTH VISIBLE", key: "both", intervals: summary.windows.both, value: summary.both_available_percent },
  ] : [];
  return <section className="visibility-timeline" aria-labelledby="visibility-timeline-title">
    <div className="visualization-heading"><div><p className="eyebrow">03 / Inspect visibility</p><h2 id="visibility-timeline-title">Windows of opportunity</h2></div><p>{summary ? `${sampleCount} samples · ${summary.step_minutes}-minute steps · UTC` : "Awaiting analysis"}</p></div>
    {summary ? <>
      <div className="timeline-chart"><div className="timeline-axis">{[0, .5, 1].map(f => <span key={f}>{new Date(start + duration * f).toISOString().slice(5, 16).replace("T", " ")} UTC</span>)}</div>
        {rows.map(row => <div className="timeline-row" key={row.key}><span className="timeline-label">{row.title}</span><div className="timeline-track" role="img" aria-label={`${row.title}: ${row.value}% of selected range`}>
          {row.intervals.map(interval => <div key={interval.start} className={`timeline-visible-interval timeline-${row.key}-line`} style={{ left: `${percent(interval.start)}%`, width: `${percent(interval.end) - percent(interval.start)}%` }} title={`${formatUtcDisplay(interval.start)} – ${formatUtcDisplay(interval.end)}`} />)}
          {data && <span className="timeline-cursor" style={{ left: `${percent(data.time)}%` }} />}
        </div><span className="timeline-state">{row.value}%</span></div>)}
      </div>
      <div className="summary-metrics"><div><span>Longest dark period</span><strong>{summary.longest_darkness_minutes} <small>min</small></strong></div><div><span>Longest Earth-hidden period</span><strong>{summary.longest_comm_blackout_minutes} <small>min</small></strong></div></div>
      <p className="analysis-note">Filled segments = visible. Unfilled = hidden. Joint windows require both Sun and Earth; vehicle operating constraints are not modeled. Boundaries use {summary.step_minutes}-minute samples and may miss shorter events.</p>
      <details className="window-details"><summary>Inspect UTC window boundaries</summary>{rows.map(row => <div key={row.key}><h3>{row.title}</h3>{row.intervals.length ? <ul>{row.intervals.map(i => <li key={i.start}><time>{formatUtcDisplay(i.start)}</time> → <time>{formatUtcDisplay(i.end)}</time></li>)}</ul> : <p>No windows in this range.</p>}</div>)}</details>
    </> : <p className="analysis-note">Sunlight, Earth visibility, joint windows and longest gaps appear after analysis.</p>}
  </section>;
}
