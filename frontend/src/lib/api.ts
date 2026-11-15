import type { MoonLocation } from "../MoonMap";
import type { AnalysisResult, HorizonProfile, MissionSummary, VisibilityResponse, VisibilitySample } from "../types";

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
  siteId: string,
  location: MoonLocation | null,
  time: string,
  date: string,
  signal: AbortSignal,
): Promise<AnalysisResult> {
  const start = `${date}T00:00:00Z`;
  const end = new Date(new Date(start).getTime() + 86400000).toISOString();
  const range = new URLSearchParams({ start, end, step_minutes: "30" });
  const coordinates = location
    ? new URLSearchParams({ lat: String(location.latitude), lon: String(location.longitude) })
    : null;
  const base = `/api/sites/${encodeURIComponent(siteId)}`;
  const [conditions, samples, summary, horizon] = await Promise.all([
    coordinates
      ? request<VisibilityResponse>(`/api/visibility?${coordinates}&time=${encodeURIComponent(time)}`, signal)
      : getSiteVisibility(siteId, time, signal),
    request<VisibilitySample[]>(
      coordinates ? `/api/visibility/window?${coordinates}&${range}` : `${base}/visibility/window?${range}`, signal,
    ),
    request<MissionSummary>(
      coordinates ? `/api/summary?${coordinates}&${range}` : `${base}/summary?${range}`, signal,
    ),
    coordinates ? Promise.resolve(null) : request<HorizonProfile | null>(`${base}/horizon`, signal),
  ]);
  return {
    conditions, samples, summary, horizon,
  };
}
