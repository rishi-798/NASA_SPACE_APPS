import type { MissionSummary, VisibilityInterval, VisibilityResponse } from "../../types";

type VisibilityTimelineProps = {
  data: VisibilityResponse | null;
  summary: MissionSummary | null;
  sampleCount: number;
};

const ticks = ["00", "04", "08", "12", "16", "20", "24"];

export function VisibilityTimeline({ data, summary, sampleCount }: VisibilityTimelineProps) {
  const time = data ? new Date(data.time) : null;
  const markerPosition = `${time ? (time.getUTCHours() + time.getUTCMinutes() / 60) / 24 * 100 : 0}%`;
  function intervalStyle(interval: VisibilityInterval) {
    const start = new Date(summary!.start).getTime();
    const duration = new Date(summary!.end).getTime() - start;
    return {
      left: `${(new Date(interval.start).getTime() - start) / duration * 100}%`,
      width: `${(new Date(interval.end).getTime() - new Date(interval.start).getTime()) / duration * 100}%`,
    };
  }

  return (
    <section className="visibility-timeline" aria-labelledby="visibility-timeline-title" data-visualization-slot="timeline">
      <div className="visualization-heading">
        <div>
          <p className="eyebrow">Visibility window</p>
          <h2 id="visibility-timeline-title">24-hour signal outlook</h2>
        </div>
        <p>{summary ? `${sampleCount} SPICE samples · ${summary.step_minutes}-minute steps · UTC` : "Awaiting analysis"}</p>
      </div>

      <div className="timeline-chart">
        <div className="timeline-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick}>{tick}:00</span>
          ))}
        </div>
        {(["sun", "earth"] as const).map((body) => {
          const intervals = body === "sun" ? summary?.windows.sunlight : summary?.windows.earth_visible;
          const percent = body === "sun" ? summary?.sunlight_percent : summary?.earth_visible_percent;
          return (
            <div className="timeline-row" key={body}>
              <span className="timeline-label">{body === "sun" ? "SUNLIGHT" : "EARTH LINK"}</span>
              <div className="timeline-track" aria-label={summary ? `${body === "sun" ? "Sunlight" : "Earth visibility"}: ${percent}% of the UTC day` : "No analysis yet"}>
                {intervals?.map((interval) => <div
                  key={interval.start}
                  className={`timeline-visible-interval timeline-${body}-line`}
                  style={intervalStyle(interval)}
                  title={`${interval.start} to ${interval.end}`}
                />)}
                {data && <span className="timeline-cursor" style={{ left: markerPosition }} />}
              </div>
              <span className="timeline-state">{data ? `${percent}% OF DAY · ${data[body].visible ? "VISIBLE NOW" : "BLOCKED NOW"}` : "PENDING"}</span>
            </div>
          );
        })}
      </div>
      {summary && <p className="analysis-note">
        Both available: {summary.both_available_percent}% · Longest darkness: {summary.longest_darkness_minutes} min · Longest Earth blackout: {summary.longest_comm_blackout_minutes} min.
        {" "}Filled segments indicate visibility. Boundaries are approximate to {summary.step_minutes} minutes.
      </p>}
    </section>
  );
}
