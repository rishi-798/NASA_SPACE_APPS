import type { ComparisonResult, ComparisonRow, ComparisonSiteResult } from "../types";
import { analysisWindow, ANALYSIS_STEP_MINUTES } from "./analysisWindow.ts";
import type { AnalysisRange } from "./analysisRange.ts";

export function comparisonQuery(time: string): URLSearchParams {
  const { start, end } = analysisWindow(time);
  return new URLSearchParams({ start, end, step_minutes: String(ANALYSIS_STEP_MINUTES) });
}

/** Check a /api/compare response before display; nothing is filled in. */
export function validateComparison(result: ComparisonResult, requestedStart: string): ComparisonResult {
  if (result?.schema_version !== 1 || !Array.isArray(result.sites) || !Array.isArray(result.table)) {
    throw new Error("The comparison returned incomplete data. No results are displayed.");
  }
  if (result.shared_sample_times !== true) {
    throw new Error("The sites were not analysed on the same sample times, so they cannot be compared.");
  }
  if (Date.parse(result.request?.start) !== Date.parse(requestedStart)) {
    throw new Error("The comparison did not start at the selected time. No results are displayed.");
  }
  return result;
}

export const CONFIDENCE: Record<ComparisonRow["horizon_mode"], { label: string; detail: string }> = {
  terrain_profile: { label: "TERRAIN-AWARE", detail: "LOLA terrain horizon applied" },
  flat_horizon: { label: "FLAT HORIZON", detail: "terrain not assessed" },
  flat_horizon_degraded: { label: "DEGRADED", detail: "terrain unavailable, flat horizon used" },
};

/** True when the sites do not share one horizon model, so the numbers are not equally reliable. */
export function unequalConfidence(rows: ComparisonRow[]): boolean {
  return new Set(rows.map((row) => row.horizon_mode)).size > 1
    || rows.some((row) => row.horizon_mode !== "terrain_profile");
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return "--";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`;
}

export function failedSites(result: ComparisonResult): ComparisonSiteResult[] {
  return result.sites.filter((site) => !site.ok);
}

/** The comparison must cover exactly the range that was requested (start, end and sampling step). */
export function validateComparisonRange(result: ComparisonResult, range: AnalysisRange): ComparisonResult {
  validateComparison(result, range.start);
  const r = result.request;
  if (Date.parse(r.end) !== Date.parse(range.end) || r.step_minutes !== range.stepMinutes) {
    throw new Error("The comparison did not cover the requested interval. No results are displayed.");
  }
  return result;
}
