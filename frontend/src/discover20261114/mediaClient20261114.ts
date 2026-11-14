// 2026-11-14 — browser contract; NASA credentials belong to the backend.
export type MediaEntry = {
  id: string;
  title: string;
  description: string;
  previewUrl: string;
  assetUrl: string;
  sourceUrl: string;
  credit: string;
  day: string;
  kind: "image" | "video";
  source: "apod" | "rover" | "library";
};

export type MediaPage = {
  items: MediaEntry[];
  total: number;
  nextPage: number | null;
  note?: string;
};

const apiRoot = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function mediaRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiRoot}/api/discover/${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    let message = `NASA request failed (${response.status}). Please retry.`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch { /* An upstream HTML error is not a useful user message. */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
