import {
  Broadcast,
  Mountains,
  SunHorizon,
  Warning,
} from "@phosphor-icons/react";
import { formatAzimuth, formatSignedDegree, formatUtcDisplay } from "../../lib/format";
import type { AnalysisState, CelestialPosition, TerrainStatus, VisibilityResponse } from "../../types";
import { StatusIndicator } from "../ui/StatusIndicator";

type ConditionsPanelProps = {
  conditions: VisibilityResponse | null;
  state: AnalysisState;
  observationTime: string | null;
  errorMessage?: string;
  /** Backend terrain status for this analysis (mode, status, explanation). */
  terrain?: TerrainStatus | null;
};

const TERRAIN_LABELS: Record<string, string> = {
  profile_loaded: "LOLA horizon · saved site profile · 2 m observer",
  profile_generated: "LOLA horizon · generated for this point · 2 m observer",
  no_profile_for_location: "No terrain profile here · flat horizon",
  not_requested: "Terrain not requested · flat horizon",
  on_demand_disabled: "Terrain generation off · flat horizon",
  on_demand_failed: "DEGRADED · terrain unavailable · flat horizon",
  configured_profile_missing: "DEGRADED · terrain profile missing · flat horizon",
  configured_profile_invalid: "DEGRADED · terrain profile unusable · flat horizon",
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
  terrain,
}: ConditionsPanelProps) {
  const terrainClear = !!conditions && conditions.sun.visible && conditions.earth.visible;
  const hasTerrain = terrain ? terrain.mode === "terrain_profile" : conditions?.sun.terrain_horizon !== undefined;
  const terrainLabel = state === "loading"
    ? "Calculating geometry and terrain horizon (a new south-polar point can take a few seconds)"
    : !conditions ? "Awaiting horizon analysis"
      : terrain ? TERRAIN_LABELS[terrain.status] ?? terrain.mode
        : hasTerrain ? "LOLA horizon · 2 m observer" : "No terrain profile · flat horizon";
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

      {state === "success" && terrain && terrain.mode !== "terrain_profile" && (
        <div className="service-notice" role="status">
          <Warning weight="fill" aria-hidden="true" />
          <div>
            <strong>{terrain.mode === "flat_horizon_degraded" ? "Degraded result: terrain not assessed" : "Flat horizon: terrain not assessed"}</strong>
            <p>{terrain.message}</p>
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
          title="Earth visible"
          subtitle="Line of sight"
          data={conditions?.earth}
        />
        <article className="terrain-row">
          <div className="telemetry-name">
            <Mountains weight="light" aria-hidden="true" />
            <div>
              <p>Terrain</p>
              <span>{terrainLabel}</span>
            </div>
          </div>
          <StatusIndicator
            visible={terrainClear}
            pending={!conditions || !hasTerrain}
            label={!conditions ? "AWAITING ANALYSIS" : !hasTerrain ? "FLAT HORIZON" : undefined}
          />
        </article>
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
