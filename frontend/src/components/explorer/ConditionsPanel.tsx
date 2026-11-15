import {
  Broadcast,
  SunHorizon,
  Warning,
} from "@phosphor-icons/react";
import { formatAzimuth, formatSignedDegree, formatUtcDisplay } from "../../lib/format";
import type { AnalysisState, CelestialPosition, VisibilityResponse } from "../../types";
import { StatusIndicator } from "../ui/StatusIndicator";

type ConditionsPanelProps = {
  conditions: VisibilityResponse | null;
  state: AnalysisState;
  observationTime: string | null;
  errorMessage?: string;
};

type TelemetryRowProps = {
  kind: "sun" | "earth";
  title: string;
  subtitle: string;
  data?: CelestialPosition;
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
      <StatusIndicator visible={data?.visible ?? false} pending={!data} />
      <dl className="telemetry-values">
        <div>
          <dt>Elevation</dt>
          <dd aria-label={data ? undefined : "Not calculated"}>{data ? formatSignedDegree(data.elevation) : "--"}</dd>
        </div>
        <div>
          <dt>Azimuth</dt>
          <dd aria-label={data ? undefined : "Not calculated"}>{data ? formatAzimuth(data.azimuth) : "--"}</dd>
        </div>
      </dl>
    </article>
  );
}

export function ConditionsPanel({
  conditions,
  state,
  observationTime,
  errorMessage,
}: ConditionsPanelProps) {
  const hasTerrain = conditions?.sun.terrain_horizon !== undefined;
  const observed = conditions?.time ?? observationTime;

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
        {observed ? <time dateTime={observed}>{formatUtcDisplay(observed)}</time> : <span>Choose a date and time</span>}
      </div>

      {state === "error" && (
        <div className="service-notice" role="status">
          <Warning weight="fill" aria-hidden="true" />
          <div>
            <strong>Analysis unavailable</strong>
            <p>{errorMessage}</p>
          </div>
        </div>
      )}

      <div className={`telemetry-stack${state === "loading" ? " telemetry-loading" : ""}`}>
        <TelemetryRow
          kind="sun"
          title="Sunlight"
          subtitle="Solar vector"
          data={conditions?.sun}
        />
        <TelemetryRow
          kind="earth"
          title="Earth visibility"
          subtitle="Line of sight"
          data={conditions?.earth}
        />
        <p className="analysis-note">{!conditions ? "No calculated results yet." : hasTerrain ? "LOLA terrain horizon applied. Visibility uses the target center." : "FLAT HORIZON · Terrain data unavailable. Terrain obstruction is not assessed."}</p>
      </div>

      <div className="data-provenance">
        <span className={`mode-dot ${conditions ? "mode-live" : "mode-preview"}`} />
        <span>
          {conditions
            ? "SUHAS / SPICE · GEOMETRIC POSITION"
            : state === "loading" ? "CALCULATING WITH SPICE" : "SELECT PARAMETERS · ANALYZE CONDITIONS"}
        </span>
      </div>
    </section>
  );
}
