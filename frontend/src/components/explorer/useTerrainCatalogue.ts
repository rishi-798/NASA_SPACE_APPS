import { useEffect, useState } from "react";
import type { CatalogueState, TerrainCatalogue } from "../../types";

/** One catalogue lookup per location. Every panel shows what this single result says. */
export function useTerrainCatalogue(latitude: number | null, longitude: number | null): { state: CatalogueState; retry: () => void } {
  const key = `${latitude},${longitude}`;
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; state: CatalogueState } | null>(null);
  const wanted = `${key}:${attempt}`;
  useEffect(() => {
    if (latitude === null || longitude === null) return;
    const controller = new AbortController();
    const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
    const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
    void fetch(`${base}/api/terrain/catalogue?${params}`, { signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) {
          const body = await result.json().catch(() => null) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ? `Terrain catalogue unavailable: ${body.error.message}.` : "Terrain catalogue unavailable. Check the backend and local Moon index, then retry.");
        }
        const data = await result.json() as TerrainCatalogue;
        if (Math.abs(data.latitude - latitude) > 1e-9 || Math.abs(data.longitude - (longitude === 180 ? -180 : longitude)) > 1e-9) {
          throw new Error("Catalogue returned a different coordinate. Retry without changing your selected point.");
        }
        return data;
      })
      .then((data) => { if (!controller.signal.aborted) setResponse({ key: wanted, state: { status: "ready", data } }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResponse({ key: wanted, state: { status: "error", message: error instanceof Error ? error.message : "Catalogue unavailable. Retry." } });
      });
    return () => controller.abort();
  }, [latitude, longitude, wanted]);
  return { state: response?.key === wanted ? response.state : { status: "loading" }, retry: () => setAttempt((v) => v + 1) };
}
