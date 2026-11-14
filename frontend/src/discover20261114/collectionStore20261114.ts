// 2026-11-14 — local-only collection; malformed or unavailable storage is safe.
import type { MediaEntry } from "./mediaClient20261114";

type Shelf = Pick<Storage, "getItem" | "setItem">;
const key = "nasa.discovery.collection.v1";
const secureUrl = (value: unknown) => typeof value === "string" && /^https:\/\//i.test(value);

export function readCollection(storage?: Shelf): MediaEntry[] {
  try {
    const value: unknown = JSON.parse((storage ?? globalThis.localStorage).getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is MediaEntry => item &&
      ["id", "title", "description", "credit", "day"].every(field => typeof item[field] === "string") &&
      ["image", "video"].includes(item.kind) && ["apod", "rover", "library"].includes(item.source) &&
      secureUrl(item.assetUrl) && secureUrl(item.sourceUrl) &&
      (item.previewUrl === "" || secureUrl(item.previewUrl))).slice(0, 100);
  } catch { return []; }
}

export function writeCollection(items: MediaEntry[], storage?: Shelf): boolean {
  try {
    (storage ?? globalThis.localStorage).setItem(key, JSON.stringify(items.slice(0, 100)));
    return true;
  } catch { return false; }
}
