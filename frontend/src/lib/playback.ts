import type { AnalysisRange, AnalysisResult, VisibilityResponse } from "../types";
export function rangeError(start: string, end: string, step: number): string | null {
  const a = Date.parse(`${start}Z`), b = Date.parse(`${end}Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "Choose a valid UTC start and end.";
  if (b <= a) return "End must be after start.";
  if (!Number.isInteger(step) || step < 1) return "Choose a positive calculation step.";
  if (Math.floor((b - a) / (step * 60000)) + 1 > 2000) return "This range exceeds 2,000 samples. Shorten it or increase the step.";
  return null;
}
export function utcRange(start: string, end: string, step: number): AnalysisRange {
  return { start: new Date(`${start}Z`).toISOString(), end: new Date(`${end}Z`).toISOString(), stepMinutes: step };
}
export function sampleAt(result: AnalysisResult | null, index: number): VisibilityResponse | null {
  const sample = result?.samples[index];
  return result && sample ? { ...sample, site: result.site.id, latitude: result.site.latitude, longitude: result.site.longitude } : null;
}
