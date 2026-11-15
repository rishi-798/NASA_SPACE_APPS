import { ANALYSIS_STEP_MINUTES, ANALYSIS_WINDOW_HOURS } from "./analysisWindow.ts";

/** Mirrors backend limits (backend/calculations/sun_earth.py, backend/analysis.py). The backend stays authoritative. */
export const MAX_WINDOW_SAMPLES = 2000;
export const MAX_STEP_MINUTES = 1440;
export const MIN_STEP_MINUTES = 1;

export type AnalysisRange = { start: string; end: string; stepMinutes: number };
export type RangeInput = { startDate: string; startTime: string; endDate: string; endTime: string; stepMinutes: string | number };
export type RangeCheck =
  | { ok: true; range: AnalysisRange; sampleCount: number; durationMinutes: number }
  | { ok: false; errors: string[] };

const toIso = (date: string, time: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return NaN;
  return Date.parse(`${date}T${time}:00Z`);
};

/** Number of samples the backend will produce: start, start+step, ... up to and including end when it lands on a step. */
export function sampleCountFor(startMs: number, endMs: number, stepMinutes: number): number {
  return Math.floor((endMs - startMs) / (stepMinutes * 60_000)) + 1;
}

/** Validate UTC range inputs before any request is made; every problem is reported, none is silently corrected. */
export function checkRange(input: RangeInput): RangeCheck {
  const errors: string[] = [];
  const start = toIso(input.startDate, input.startTime);
  const end = toIso(input.endDate, input.endTime);
  const stepText = String(input.stepMinutes).trim();
  const step = /^\d+$/.test(stepText) ? Number(stepText) : NaN;
  if (!Number.isFinite(start)) errors.push("Enter a valid UTC start date and time.");
  if (!Number.isFinite(end)) errors.push("Enter a valid UTC end date and time.");
  if (!Number.isInteger(step) || step < MIN_STEP_MINUTES || step > MAX_STEP_MINUTES) {
    errors.push(`Sampling interval must be a whole number of minutes from ${MIN_STEP_MINUTES} to ${MAX_STEP_MINUTES}.`);
  }
  if (errors.length) return { ok: false, errors };
  if (end <= start) return { ok: false, errors: ["The end time must be after the start time."] };
  const sampleCount = sampleCountFor(start, end, step);
  if (sampleCount > MAX_WINDOW_SAMPLES) {
    return { ok: false, errors: [`This range needs ${sampleCount.toLocaleString("en")} samples; the limit is ${MAX_WINDOW_SAMPLES.toLocaleString("en")}. Shorten the range or increase the sampling interval.`] };
  }
  return {
    ok: true, sampleCount, durationMinutes: (end - start) / 60_000,
    range: { start: new Date(start).toISOString(), end: new Date(end).toISOString(), stepMinutes: step },
  };
}

/** The default range: the 24 hours that start at `time`, sampled every 30 minutes. */
export function defaultRange(time: string): AnalysisRange {
  const start = Date.parse(time);
  if (!Number.isFinite(start)) throw new RangeError("Choose a valid UTC date and time.");
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + ANALYSIS_WINDOW_HOURS * 3_600_000).toISOString(),
    stepMinutes: ANALYSIS_STEP_MINUTES,
  };
}

export function rangeParams(range: AnalysisRange): URLSearchParams {
  return new URLSearchParams({ start: range.start, end: range.end, step_minutes: String(range.stepMinutes) });
}

export function sameRange(a: AnalysisRange | null, b: AnalysisRange | null): boolean {
  return !!a && !!b && Date.parse(a.start) === Date.parse(b.start)
    && Date.parse(a.end) === Date.parse(b.end) && a.stepMinutes === b.stepMinutes;
}

/** Axis labels for any range: ~6 intervals on a round hour step; dates are added once the range exceeds a day. */
export function rangeTicks(start: string, end: string): string[] {
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return [];
  const hours = (b - a) / 3_600_000;
  const steps = [1, 2, 3, 4, 6, 12, 24, 48, 96, 168, 336];
  const stepHours = steps.find((s) => hours / s <= 6) ?? 336;
  const ticks: string[] = [];
  for (let t = a; t <= b + 1; t += stepHours * 3_600_000) {
    const iso = new Date(t).toISOString();
    ticks.push(hours > 24 ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}` : iso.slice(11, 16));
  }
  return ticks;
}

/** GET /api/analysis query for a named site, or custom coordinates when `location` is given. */
export function analysisRangeQuery(siteId: string, location: { latitude: number; longitude: number } | null, range: AnalysisRange): URLSearchParams {
  // allow_flat_fallback: unreadable terrain gives an explicitly DEGRADED, labelled result rather than nothing.
  const params = rangeParams(range);
  params.set("allow_flat_fallback", "true");
  if (location) { params.set("lat", String(location.latitude)); params.set("lon", String(location.longitude)); }
  else params.set("site_id", siteId);
  return params;
}
