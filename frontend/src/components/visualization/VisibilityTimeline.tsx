import { rangeTicks } from "../../lib/analysisRange";
import { windowFraction } from "../../lib/analysisWindow";
import { formatMinutes } from "../../lib/windowFinder";
import type { MissionSummary, VisibilityInterval, VisibilityResponse } from "../../types";

type VisibilityTimelineProps = {
  data: VisibilityResponse | null;
  summary: MissionSummary | null;
  sampleCount: number;
};

const pendingTicks = ["start", "", "", "", "", "", "end"];

function utcLabel(value: string) {
  return `${value.slice(0, 10)} ${value.slice(11, 16)}`;
}

export function VisibilityTimeline({ data, summary, sampleCount }: VisibilityTimelineProps) {
  // The axis spans exactly the analysed UTC range.
  const ticks = summary ? rangeTicks(summary.start, summary.end) : pendingTicks;
  const rangeLabel = summary ? formatMinutes((Date.parse(summary.end) - Date.parse(summary.start)) / 60_000) : "";
  const markerPosition = `${data && summary ? windowFraction(data.time, summary.start, summary.end) * 100 : 0}%`;
  function intervalStyle(interval: VisibilityInterval) {
    const left = windowFraction(interval.start, summary!.start, summary!.end);
    const right = windowFraction(interval.end, summary!.start, summary!.end);
    return { left: `${left * 100}%`, width: `${(right - left) * 100}%` };
  }
  const earthHidden = summary?.longest_earth_hidden_minutes ?? summary?.longest_comm_blackout_minutes;

  return (
    <section className="visibility-timeline" aria-labelledby="visibility-timeline-title" data-visualization-slot="timeline">
      <div className="visualization-heading">
        <div>
          <p className="eyebrow">Visibility window</p>
          <h2 id="visibility-timeline-title">Visibility timeline</h2>
        </div>
        <p>{summary
          ? `${rangeLabel} · ${utcLabel(summary.start)} → ${utcLabel(summary.end)} UTC · ${sampleCount} SPICE samples · ${summary.step_minutes}-minute steps`
          : "Awaiting analysis"}</p>
      </div>

      <div className="timeline-chart">
        <div className="timeline-axis" aria-hidden="true">
          {ticks.map((tick, index) => (
            <span key={`${tick}-${index}`}>{tick}</span>
          ))}
        </div>
        {(["sun", "earth", "both"] as const).map((body) => {
          const intervals = body === "sun" ? summary?.windows.sunlight : body === "earth" ? summary?.windows.earth_visible : summary?.windows.both;
          const percent = body === "sun" ? summary?.sunlight_percent : body === "earth" ? summary?.earth_visible_percent : summary?.both_available_percent;
          const name = body === "sun" ? "SUNLIGHT" : body === "earth" ? "EARTH VISIBLE" : "BOTH VISIBLE";
          const atCursor = data ? (body === "both" ? data.sun.visible && data.earth.visible : data[body].visible) : false;
          return (
            <div className="timeline-row" key={body}>
              <span className="timeline-label">{name}</span>
              <div className="timeline-track" aria-label={summary ? `${name.toLowerCase()}: ${percent}% of the analysed range` : "No analysis yet"}>
                {intervals?.map((interval) => <div
                  key={interval.start}
                  className={`timeline-visible-interval timeline-${body}-line`}
                  style={intervalStyle(interval)}
                  title={`${interval.start} to ${interval.end}`}
                />)}
                {data && <span className="timeline-cursor" style={{ left: markerPosition }} />}
              </div>
              <span className="timeline-state">{data ? `${percent}% OF RANGE · ${atCursor ? "VISIBLE AT CURSOR" : "NOT VISIBLE AT CURSOR"}` : "PENDING"}</span>
            </div>
          );
        })}
      </div>
      {summary && <p className="analysis-note">
        Both available: {summary.both_available_percent}% · Longest darkness: {formatMinutes(summary.longest_darkness_minutes)} · Longest Earth hidden: {formatMinutes(earthHidden ?? 0)}.
        {" "}Filled segments indicate visibility. Boundaries are approximate to {summary.step_minutes} minutes. Visibility alone does not establish power, a communications link or landing safety.
      </p>}
    </section>
  );
}
