import { Broadcast, Sun } from "@phosphor-icons/react";
import type { VisibilityResponse } from "../../types";

type HorizonContainerProps = {
  data: VisibilityResponse;
};

function positionFor(azimuth: number, elevation: number) {
  return {
    left: `${8 + (azimuth / 360) * 84}%`,
    bottom: `${37 + Math.max(-10, Math.min(20, elevation)) * 1.7}%`,
  };
}

export function HorizonContainer({ data }: HorizonContainerProps) {
  return (
    <section className="horizon-panel" aria-labelledby="horizon-title" data-visualization-slot="horizon">
      <div className="visualization-heading">
        <div>
          <p className="eyebrow">Local horizon</p>
          <h2 id="horizon-title">Observer plane</h2>
        </div>
        <p>Visualization adapter · azimuth / elevation</p>
      </div>

      <div className="horizon-instrument">
        <div className="azimuth-axis" aria-hidden="true">
          {["0° N", "90° E", "180° S", "270° W", "360° N"].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="elevation-grid" aria-hidden="true">
          <span>+20°</span>
          <span>+10°</span>
          <span>0°</span>
          <span>−10°</span>
        </div>
        <svg className="terrain-profile" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 157 C90 151 130 164 205 151 S330 135 420 153 S570 163 655 145 S785 138 860 153 S950 145 1000 151" />
          <line x1="0" x2="1000" y1="160" y2="160" />
        </svg>

        <div className="celestial-marker marker-sun" style={positionFor(data.sun.azimuth, data.sun.elevation)}>
          <Sun weight="fill" aria-hidden="true" />
          <span>SUN</span>
        </div>
        <div className="celestial-marker marker-earth" style={positionFor(data.earth.azimuth, data.earth.elevation)}>
          <Broadcast weight="fill" aria-hidden="true" />
          <span>EARTH</span>
        </div>
        <div className="observer-origin" aria-label="Observer position">
          <span />
          OBSERVER
        </div>
      </div>
    </section>
  );
}
