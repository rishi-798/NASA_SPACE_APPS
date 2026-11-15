import type { MoonLocation } from "../MoonMap";
import type { AnalysisRange, AnalysisResult, VisibilityResponse } from "../types";

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

export async function getAnalysis(
  siteId: string, location: MoonLocation | null, range: AnalysisRange, signal: AbortSignal,
): Promise<AnalysisResult> {
  const params = new URLSearchParams({ start: range.start, end: range.end, step_minutes: String(range.stepMinutes) });
  if (location) { params.set("lat", String(location.latitude)); params.set("lon", String(location.longitude)); }
  else params.set("site_id", siteId);
  const result = await request<AnalysisResult>(`/api/analysis?${params}`, signal);
  if (result.schema_version !== 1 || !Array.isArray(result.samples) || !result.samples.length || !result.summary || !result.provenance) {
    throw new ApiError("The calculation returned incomplete data. No results are displayed.");
  }
  if (result.samples.some((sample, i) =>
    !Number.isFinite(Date.parse(sample.time)) || (i > 0 && Date.parse(sample.time) <= Date.parse(result.samples[i - 1]!.time)) ||
    [sample.sun, sample.earth].some(body => !body || !Number.isFinite(body.azimuth) || !Number.isFinite(body.elevation) || typeof body.visible !== "boolean")
  )) throw new ApiError("The calculation returned invalid samples. Please retry.");
  return result;
}
