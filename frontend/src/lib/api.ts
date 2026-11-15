import type { MoonLocation } from "../MoonMap";
import type { AnalysisBundle, AnalysisResult, ComparisonResult, PowerAssessment, VolatilesAssessment, VisibilityResponse } from "../types";
import { analysisRangeQuery, defaultRange, rangeParams, type AnalysisRange } from "./analysisRange";
import { analysisWindow, toAnalysisResult } from "./analysisWindow";
import { validateComparisonRange } from "./comparison";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Visibility service is currently unreachable.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = typeof body?.detail === "string"
      ? body.detail
      : Array.isArray(body?.detail)
        ? body.detail.map((item: { msg?: string }) => item.msg ?? "Invalid request").join("; ")
        : "";
    throw new ApiError(
      detail || `Visibility service returned ${response.status}.`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export function getSiteVisibility(
  siteId: string,
  time: string,
  signal?: AbortSignal,
) {
  return request<VisibilityResponse>(
    `/api/sites/${encodeURIComponent(siteId)}/visibility?time=${encodeURIComponent(time)}`,
    signal,
  );
}

/** A bare UTC time means "the 24 hours from then" (the trip planner); the Explorer passes a full range. */
function asRange(rangeOrTime: AnalysisRange | string): AnalysisRange {
  try {
    return typeof rangeOrTime === "string" ? defaultRange(rangeOrTime) : rangeOrTime;
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "Choose a valid UTC date and time.");
  }
}

/**
 * One request, one calculation: GET /api/analysis returns the samples, summary, windows and horizon
 * computed from a single sample set covering the requested UTC range.
 */
export async function getAnalysis(
  siteId: string,
  location: MoonLocation | null,
  rangeOrTime: AnalysisRange | string,
  signal: AbortSignal,
): Promise<AnalysisResult> {
  const range = asRange(rangeOrTime);
  const bundle = await request<AnalysisBundle>(`/api/analysis?${analysisRangeQuery(siteId, location, range)}`, signal);
  try {
    const result = toAnalysisResult(bundle, range.start);
    if (Date.parse(bundle.summary.end) !== Date.parse(range.end) || bundle.summary.step_minutes !== range.stepMinutes) {
      throw new Error("The calculation did not cover the requested interval. No results are displayed.");
    }
    return result;
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "The calculation returned invalid data.");
  }
}

/** Athena vs Odysseus over exactly the same range and sample times (GET /api/compare). */
export async function getComparison(rangeOrTime: AnalysisRange | string, signal: AbortSignal): Promise<ComparisonResult> {
  const range = asRange(rangeOrTime);
  const result = await request<ComparisonResult>(`/api/compare?${rangeParams(range)}`, signal);
  try {
    return validateComparisonRange(result, range);
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "The comparison returned invalid data.");
  }
}

/** Photovoltaic power and battery energy budget (GET /api/analysis/power). */
export async function getPowerAssessment(
  siteId: string | null,
  location: MoonLocation | null,
  time: string,
  signal?: AbortSignal,
): Promise<PowerAssessment> {
  const params = new URLSearchParams();
  if (siteId && siteId !== "custom") {
    params.set("site_id", siteId);
  } else if (location) {
    params.set("lat", String(location.latitude));
    params.set("lon", String(location.longitude));
  }
  const window = analysisWindow(time);
  params.set("start", window.start);
  params.set("end", window.end);
  params.set("step_minutes", "30");
  return request<PowerAssessment>(`/api/analysis/power?${params}`, signal);
}

/** Lunar polar volatiles and cold trap proximity (GET /api/terrain/volatiles). */
export async function getVolatilesAssessment(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<VolatilesAssessment> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
  });
  return request<VolatilesAssessment>(`/api/terrain/volatiles?${params}`, signal);
}
