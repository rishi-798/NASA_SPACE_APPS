import type { VisibilityResponse } from "../../types";

type VisibilityTimelineProps = {
  data: VisibilityResponse;
};

const ticks = ["00", "04", "08", "12", "16", "20", "24"];

export function VisibilityTimeline({ data }: VisibilityTimelineProps) {
  const selectedHour = new Date(data.time).getUTCHours();
  const markerPosition = `${(selectedHour / 24) * 100}%`;

  return (
    <section className="visibility-timeline" aria-labelledby="visibility-timeline-title" data-visualization-slot="timeline">
      <div className="visualization-heading">
        <div>
          <p className="eyebrow">Visibility window</p>
          <h2 id="visibility-timeline-title">24-hour signal outlook</h2>
        </div>
        <p>Preview shell · awaiting `/visibility/window` samples</p>
      </div>

      <div className="timeline-chart">
        <div className="timeline-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick}>{tick}:00</span>
          ))}
        </div>
        <div className="timeline-row">
          <span className="timeline-label">SUNLIGHT</span>
          <div className="timeline-track">
            <div className="timeline-preview-line timeline-sun-line" />
            <span className="timeline-cursor" style={{ left: markerPosition }} />
          </div>
          <span className="timeline-state">{data.sun.visible ? "VISIBLE NOW" : "BELOW HORIZON"}</span>
        </div>
        <div className="timeline-row">
          <span className="timeline-label">EARTH LINK</span>
          <div className="timeline-track">
            <div className="timeline-preview-line timeline-earth-line" />
            <span className="timeline-cursor" style={{ left: markerPosition }} />
          </div>
          <span className="timeline-state">{data.earth.visible ? "VISIBLE NOW" : "BLOCKED"}</span>
        </div>
      </div>
    </section>
  );
}
