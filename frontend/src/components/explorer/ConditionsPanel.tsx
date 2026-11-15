import {
  Broadcast,
  Mountains,
  SunHorizon,
  Warning,
} from "@phosphor-icons/react";
import { formatAzimuth, formatSignedDegree, formatUtcDisplay } from "../../lib/format";
import type { AnalysisState, CelestialPosition, VisibilityResponse } from "../../types";
import { StatusIndicator } from "../ui/StatusIndicator";

type ConditionsPanelProps = {
  conditions: VisibilityResponse;
  state: AnalysisState;
  isPreview: boolean;
  errorMessage?: string;
};

type TelemetryRowProps = {
  kind: "sun" | "earth";
  title: string;
  subtitle: string;
  data: CelestialPosition;
};

function TelemetryRow({ kind, title, subtitle, data }: TelemetryRowProps) {
  const Icon = kind === "sun" ? SunHorizon : Broadcast;

  return (
    <article className={`telemetry-row telemetry-${kind}`}>
      <div className="telemetry-name">
        <Icon weight="light" aria-hidden="true" />
        <div>
          <p>{title}</p>
          <span>{subtitle}</span>
        </div>
      </div>
      <StatusIndicator visible={data.visible} />
      <dl className="telemetry-values">
        <div>
          <dt>Elevation</dt>
          <dd>{formatSignedDegree(data.elevation)}</dd>
        </div>
        <div>
          <dt>Azimuth</dt>
          <dd>{formatAzimuth(data.azimuth)}</dd>
        </div>
      </dl>
    </article>
  );
}

export function ConditionsPanel({
  conditions,
  state,
  isPreview,
  errorMessage,
}: ConditionsPanelProps) {
  const terrainClear = conditions.sun.visible && conditions.earth.visible;

  return (
    <section className="conditions" aria-labelledby="conditions-title" aria-busy={state === "loading"}>
      <div className="panel-heading conditions-heading">
        <div>
          <p className="eyebrow">Mission conditions</p>
          <h2 id="conditions-title">Surface outlook</h2>
        </div>
        <span className="sequence-number">02</span>
      </div>

      <div className="conditions-time">
        <span>OBSERVATION</span>
        <time dateTime={conditions.time}>{formatUtcDisplay(conditions.time)}</time>
      </div>

      {state === "error" && (
        <div className="service-notice" role="status">
          <Warning weight="fill" aria-hidden="true" />
          <div>
            <strong>Backend unavailable</strong>
            <p>{errorMessage} Showing the interface preview below.</p>
          </div>
        </div>
      )}

      <div className={`telemetry-stack${state === "loading" ? " telemetry-loading" : ""}`}>
        <TelemetryRow
          kind="sun"
          title="Sunlight"
          subtitle="Solar vector"
          data={conditions.sun}
        />
        <TelemetryRow
          kind="earth"
          title="Earth / Comms"
          subtitle="Line of sight"
          data={conditions.earth}
        />
        <article className="terrain-row">
          <div className="telemetry-name">
            <Mountains weight="light" aria-hidden="true" />
            <div>
              <p>Terrain</p>
              <span>Horizon profile</span>
            </div>
          </div>
          <StatusIndicator
            visible={terrainClear}
            pending={conditions.sun.terrain_horizon === undefined}
            label={conditions.sun.terrain_horizon === undefined ? "PROFILE PENDING" : undefined}
          />
        </article>
      </div>

      <div className="data-provenance">
        <span className={`mode-dot ${isPreview ? "mode-preview" : "mode-live"}`} />
        <span>
          {isPreview
            ? "INTERFACE PREVIEW · VALUES ARE ILLUSTRATIVE"
            : "LIVE BACKEND RESPONSE · GEOMETRIC POSITION"}
        </span>
      </div>
    </section>
  );
}
