import type { MoonLocation } from "../MoonMap";
import type { AnalysisBundle, AnalysisResult, ComparisonResult, PowerAssessment, VisibilityResponse, VolatilesAssessment } from "../types";
import { analysisQuery, analysisWindow, toAnalysisResult } from "./analysisWindow";
import { comparisonQuery, validateComparison } from "./comparison";

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

/**
 * One request, one calculation: GET /api/analysis returns the samples, summary, windows and horizon
 * computed from a single sample set covering the 24 hours from `time`.
 */
export async function getAnalysis(
  siteId: string,
  location: MoonLocation | null,
  time: string,
  signal: AbortSignal,
): Promise<AnalysisResult> {
  let params: URLSearchParams;
  try {
    params = analysisQuery(siteId, location, time);
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "Choose a valid UTC date and time.");
  }
  const bundle = await request<AnalysisBundle>(`/api/analysis?${params}`, signal);
  try {
    return toAnalysisResult(bundle, analysisWindow(time).start);
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "The calculation returned invalid data.");
  }
}

/** Athena vs Odysseus over the same 24 h window and sample times (GET /api/compare). */
export async function getComparison(time: string, signal: AbortSignal): Promise<ComparisonResult> {
  let params: URLSearchParams;
  try {
    params = comparisonQuery(time);
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "Choose a valid UTC date and time.");
  }
  const result = await request<ComparisonResult>(`/api/compare?${params}`, signal);
  try {
    return validateComparison(result, analysisWindow(time).start);
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
