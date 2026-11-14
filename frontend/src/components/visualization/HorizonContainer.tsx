import { Broadcast, Sun } from "@phosphor-icons/react";
import type { HorizonProfile, VisibilityResponse } from "../../types";

type HorizonContainerProps = {
  data: VisibilityResponse | null;
  profile: HorizonProfile | null;
};

function positionFor(azimuth: number, elevation: number) {
  return {
    left: `${azimuth / 360 * 100}%`,
    top: `${(20 - Math.max(-10, Math.min(20, elevation))) / 30 * 100}%`,
  };
}

export function HorizonContainer({ data, profile }: HorizonContainerProps) {
  const y = (angle: number) => (20 - angle) / 30 * 220;
  const horizon = profile
    ? [...profile.horizon, profile.horizon[0]!].map((angle, index) =>
        `${index === 0 ? "M" : "L"}${index * profile.azimuth_step / 360 * 1000} ${y(angle)}`,
      ).join(" ")
    : `M0 ${y(0)} L1000 ${y(0)}`;
  return (
    <section className="horizon-panel" aria-labelledby="horizon-title" data-visualization-slot="horizon">
      <div className="visualization-heading">
        <div>
          <p className="eyebrow">Local horizon</p>
          <h2 id="horizon-title">Observer plane</h2>
        </div>
        <p>{!data ? "Awaiting analysis" : profile ? "LOLA terrain · 0.5° azimuth bins" : "Flat horizon · no terrain profile"}</p>
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
        <div className="horizon-plot">
          <svg className="terrain-profile" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
            {data && <path d={horizon} />}
            <line x1="0" x2="1000" y1={y(0)} y2={y(0)} />
          </svg>
          {data && <>
            <div className="celestial-marker marker-sun" style={positionFor(data.sun.azimuth, data.sun.elevation)}
              title={`Sun: ${data.sun.elevation.toFixed(2)}° elevation, ${data.sun.azimuth.toFixed(2)}° azimuth`}>
              <Sun weight="fill" aria-hidden="true" />
              <span>SUN {data.sun.elevation.toFixed(1)}°</span>
            </div>
            <div className="celestial-marker marker-earth" style={positionFor(data.earth.azimuth, data.earth.elevation)}
              title={`Earth: ${data.earth.elevation.toFixed(2)}° elevation, ${data.earth.azimuth.toFixed(2)}° azimuth`}>
              <Broadcast weight="fill" aria-hidden="true" />
              <span>EARTH {data.earth.elevation.toFixed(1)}°</span>
            </div>
          </>}
        </div>
        <div className="observer-origin" aria-label="Observer position">
          <span />
          OBSERVER
        </div>
      </div>
      {profile && <p className="analysis-note"><a href={profile.source} target="_blank" rel="noreferrer">Terrain source</a> · 2 m assumed observer height. Site/frame uncertainty applies.</p>}
      {data && <p className="analysis-note">Plot range −10° to +20°; out-of-range markers are pinned to the edge. Visibility means line of sight, not radio-link quality.</p>}
    </section>
  );
}
