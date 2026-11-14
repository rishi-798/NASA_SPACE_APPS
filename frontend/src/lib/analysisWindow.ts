import type { AnalysisBundle, AnalysisResult } from "../types";

/** The analysis covers the 24 hours that START at the selected UTC time. */
export const ANALYSIS_WINDOW_HOURS = 24;
export const ANALYSIS_STEP_MINUTES = 30;

export type AnalysisLocation = { latitude: number; longitude: number };

export function analysisWindow(time: string): { start: string; end: string } {
  const start = Date.parse(time);
  if (!Number.isFinite(start)) throw new RangeError("Choose a valid UTC date and time.");
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + ANALYSIS_WINDOW_HOURS * 3_600_000).toISOString(),
  };
}

/** Query for GET /api/analysis: a named site, or custom coordinates when `location` is given. */
export function analysisQuery(siteId: string, location: AnalysisLocation | null, time: string): URLSearchParams {
  const { start, end } = analysisWindow(time);
  // allow_flat_fallback: if terrain data cannot be read right now, get an explicitly DEGRADED,
  // labelled flat-horizon result (shown with a warning) instead of no result at all.
  const params = new URLSearchParams({
    start, end, step_minutes: String(ANALYSIS_STEP_MINUTES), allow_flat_fallback: "true",
  });
  if (location) {
    params.set("lat", String(location.latitude));
    params.set("lon", String(location.longitude));
  } else {
    params.set("site_id", siteId);
  }
  return params;
}

/**
 * Check the bundle and derive the views the pages use. Conditions at the selected time are the
 * first sample of the window, so the panel, timeline and summary all come from one sample set.
 * Throws an Error with a displayable message when the data is incomplete; nothing is filled in.
 */
export function toAnalysisResult(bundle: AnalysisBundle, requestedStart: string): AnalysisResult {
  if (bundle?.schema_version !== 1 || !Array.isArray(bundle.samples) || !bundle.samples.length
    || !bundle.summary || !bundle.site) {
    throw new Error("The calculation returned incomplete data. No results are displayed.");
  }
  const times = bundle.samples.map((sample) => Date.parse(sample.time));
  const invalid = bundle.samples.some((sample, index) =>
    !Number.isFinite(times[index]) || (index > 0 && times[index]! <= times[index - 1]!)
    || [sample.sun, sample.earth].some((body) => !body || !Number.isFinite(body.azimuth)
      || !Number.isFinite(body.elevation) || typeof body.visible !== "boolean"));
  if (invalid) throw new Error("The calculation returned invalid samples. Please retry.");
  if (times[0] !== Date.parse(requestedStart)) {
    throw new Error("The calculation did not start at the selected time. No results are displayed.");
  }
  const first = bundle.samples[0]!;
  return {
    conditions: {
      site: bundle.site.id, latitude: bundle.site.latitude, longitude: bundle.site.longitude,
      time: first.time, sun: first.sun, earth: first.earth,
    },
    samples: bundle.samples,
    summary: bundle.summary,
    horizon: bundle.horizon,
    terrain: bundle.terrain ?? null,
  };
}

/** Position of `time` within [start, end] as a 0..1 fraction (clamped). */
export function windowFraction(time: string, start: string, end: string): number {
  const t = Date.parse(time), a = Date.parse(start), b = Date.parse(end);
  if (![t, a, b].every(Number.isFinite) || b <= a) return 0;
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

/** Axis labels: UTC clock times every `stepHours` from start to end inclusive. */
export function windowTicks(start: string, end: string, stepHours = 4): string[] {
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return [];
  const ticks: string[] = [];
  for (let t = a; t <= b + 1; t += stepHours * 3_600_000) ticks.push(new Date(t).toISOString().slice(11, 16));
  return ticks;
}
