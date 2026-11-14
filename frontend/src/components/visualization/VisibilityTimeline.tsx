import { ANALYSIS_WINDOW_HOURS, windowFraction, windowTicks } from "../../lib/analysisWindow";
import type { MissionSummary, VisibilityInterval, VisibilityResponse } from "../../types";

type VisibilityTimelineProps = {
  data: VisibilityResponse | null;
  summary: MissionSummary | null;
  sampleCount: number;
};

const pendingTicks = Array.from({ length: ANALYSIS_WINDOW_HOURS / 4 + 1 }, (_, index) => `+${index * 4}h`);

function utcLabel(value: string) {
  return `${value.slice(0, 10)} ${value.slice(11, 16)}`;
}

export function VisibilityTimeline({ data, summary, sampleCount }: VisibilityTimelineProps) {
  // The axis spans the analysed window (selected time + 24 h), not the UTC calendar day.
  const ticks = summary ? windowTicks(summary.start, summary.end) : pendingTicks;
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
          <h2 id="visibility-timeline-title">24-hour signal outlook</h2>
        </div>
        <p>{summary
          ? `Next ${ANALYSIS_WINDOW_HOURS} h from selected time · ${utcLabel(summary.start)} → ${utcLabel(summary.end)} UTC · ${sampleCount} SPICE samples · ${summary.step_minutes}-minute steps`
          : "Awaiting analysis"}</p>
      </div>

      <div className="timeline-chart">
        <div className="timeline-axis" aria-hidden="true">
          {ticks.map((tick, index) => (
            <span key={`${tick}-${index}`}>{tick}</span>
          ))}
        </div>
        {(["sun", "earth"] as const).map((body) => {
          const intervals = body === "sun" ? summary?.windows.sunlight : summary?.windows.earth_visible;
          const percent = body === "sun" ? summary?.sunlight_percent : summary?.earth_visible_percent;
          return (
            <div className="timeline-row" key={body}>
              <span className="timeline-label">{body === "sun" ? "SUNLIGHT" : "EARTH VISIBLE"}</span>
              <div className="timeline-track" aria-label={summary ? `${body === "sun" ? "Sunlight" : "Earth visibility"}: ${percent}% of the ${ANALYSIS_WINDOW_HOURS} hours from the selected time` : "No analysis yet"}>
                {intervals?.map((interval) => <div
                  key={interval.start}
                  className={`timeline-visible-interval timeline-${body}-line`}
                  style={intervalStyle(interval)}
                  title={`${interval.start} to ${interval.end}`}
                />)}
                {data && <span className="timeline-cursor" style={{ left: markerPosition }} />}
              </div>
              <span className="timeline-state">{data ? `${percent}% OF NEXT ${ANALYSIS_WINDOW_HOURS} H · ${data[body].visible ? "VISIBLE NOW" : "BLOCKED NOW"}` : "PENDING"}</span>
            </div>
          );
        })}
      </div>
      {summary && <p className="analysis-note">
        Both available: {summary.both_available_percent}% · Longest darkness: {summary.longest_darkness_minutes} min · Longest Earth hidden: {earthHidden} min.
        {" "}Filled segments indicate visibility. Boundaries are approximate to {summary.step_minutes} minutes. Visibility alone does not establish power, a communications link or landing safety.
      </p>}
    </section>
  );
}
