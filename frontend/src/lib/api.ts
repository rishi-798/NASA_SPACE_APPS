import type { MoonLocation } from "../MoonMap";
import type { AnalysisBundle, AnalysisResult, VisibilityResponse } from "../types";
import { analysisQuery, analysisWindow, toAnalysisResult } from "./analysisWindow";

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
