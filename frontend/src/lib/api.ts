import type { LandingSite, VisibilityResponse } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

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
  } catch {
    throw new ApiError("Visibility service is currently unreachable.");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
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

export function createInterfacePreview(
  site: LandingSite,
  time: string,
): VisibilityResponse {
  return {
    site: site.id,
    latitude: site.latitude,
    longitude: site.longitude,
    time,
    sun: { azimuth: 124.2, elevation: 3.7, visible: true },
    earth: { azimuth: 241.8, elevation: 7.1, visible: true },
  };
}
