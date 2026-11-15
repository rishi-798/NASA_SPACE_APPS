import { Scales, Warning } from "@phosphor-icons/react";
import { formatUtcDisplay } from "../../lib/format";
import { CONFIDENCE, failedSites, formatDuration, unequalConfidence } from "../../lib/comparison";
import type { AnalysisState, ComparisonResult } from "../../types";

type SiteComparisonProps = {
  result: ComparisonResult | null;
  state: AnalysisState;
  errorMessage?: string;
  onCompare: () => void;
  disabled?: boolean;
};

const METRICS = [
  { key: "sunlight_percent", label: "Sunlight", unit: "%" },
  { key: "earth_visible_percent", label: "Earth visible", unit: "%" },
  { key: "both_available_percent", label: "Both visible", unit: "%" },
] as const;
const DURATIONS = [
  { key: "longest_darkness_minutes", label: "Longest dark period" },
  { key: "longest_earth_hidden_minutes", label: "Longest Earth hidden" },
  { key: "longest_joint_window_minutes", label: "Longest both-visible window" },
] as const;

export function SiteComparison({ result, state, errorMessage, onCompare, disabled }: SiteComparisonProps) {
  const rows = result?.table ?? [];
  const failures = result ? failedSites(result) : [];
  return (
    <section className="site-comparison" aria-labelledby="site-comparison-title" aria-busy={state === "loading"}>
      <div className="visualization-heading">
        <div>
          <p className="eyebrow">Site comparison</p>
          <h2 id="site-comparison-title">Athena vs Odysseus</h2>
        </div>
        <button type="button" className="comparison-button" onClick={onCompare} disabled={disabled || state === "loading"}>
          <Scales aria-hidden="true" /> {state === "loading" ? "Comparing…" : "Compare both sites"}
        </button>
      </div>

      {state === "idle" && <p className="analysis-note">
        Analyses both sites over exactly the range set above, on identical sample times.
      </p>}
      {state === "loading" && <p role="status" className="analysis-note">Calculating both sites…</p>}
      {state === "error" && <div className="service-notice" role="status">
        <Warning weight="fill" aria-hidden="true" />
        <div><strong>Comparison unavailable</strong><p>{errorMessage}</p></div>
      </div>}

      {failures.map((site) => <div className="service-notice" role="status" key={site.site_id}>
        <Warning weight="fill" aria-hidden="true" />
        <div><strong>{site.site_id} could not be analysed</strong><p>{site.error?.message}</p></div>
      </div>)}

      {state === "success" && result && rows.length > 0 && <>
        <div className="comparison-scroll">
          <table className="comparison-table">
            <caption className="visually-hidden">
              Visibility comparison over {result.request.start} to {result.request.end} UTC, {result.request.sample_count} samples per site
            </caption>
            <thead>
              <tr>
                <th scope="col">{formatUtcDisplay(result.request.start)} → {formatUtcDisplay(result.request.end)}</th>
                {rows.map((row) => <th scope="col" key={row.site_id}>
                  {row.mission}
                  <span className={`confidence confidence-${row.horizon_mode}`} title={CONFIDENCE[row.horizon_mode].detail}>
                    {CONFIDENCE[row.horizon_mode].label}
                  </span>
                </th>)}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((metric) => <tr key={metric.key}>
                <th scope="row">{metric.label}</th>
                {rows.map((row) => <td key={row.site_id}>
                  <strong>{row[metric.key]}{metric.unit}</strong>
                  <span className="comparison-bar" aria-hidden="true"><i style={{ width: `${row[metric.key]}%` }} /></span>
                </td>)}
              </tr>)}
              {DURATIONS.map((metric) => <tr key={metric.key}>
                <th scope="row">{metric.label}</th>
                {rows.map((row) => <td key={row.site_id}><strong>{formatDuration(row[metric.key])}</strong></td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
        {unequalConfidence(rows) && <p className="analysis-note comparison-caution">
          <strong>These results are not equally reliable.</strong>{" "}
          {rows.filter((row) => row.horizon_mode !== "terrain_profile").map((row) => row.mission).join(" and ")}{" "}
          {rows.filter((row) => row.horizon_mode !== "terrain_profile").length > 1 ? "use" : "uses"} a flat horizon,
          so nearby ridges or crater rims that could hide the Sun or Earth are not accounted for.
        </p>}
        <p className="analysis-note">
          {result.request.sample_count} samples per site at {result.request.step_minutes}-minute steps, identical for both.
          Visibility does not by itself prove adequate power, a working communications link, or a safe landing.
        </p>
      </>}
    </section>
  );
}
