import type { AnalysisResult, VisibilityInterval } from "../types";
import { indexForTime } from "./playback.ts";

export type FoundWindow = {
  start: string; end: string; durationMinutes: number; startIndex: number;
  /** Window is cut by the analysed range, not by a visibility change: it may extend beyond. */
  clippedAtStart: boolean; clippedAtEnd: boolean;
  /** What changed at the boundaries, read from the returned samples (null when cut by the range). */
  begins: string | null; ends: string | null;
};
export type WindowSearch = { windows: FoundWindow[]; qualifying: number; total: number; longestMinutes: number; reason: string | null };

const BODY: Record<"sun" | "earth", string> = { sun: "Sun", earth: "Earth" };

/** Which body's visibility changes between adjacent samples `before` -> `after` (from the returned samples only). */
function change(result: AnalysisResult, before: number, after: number, kind: "begins" | "ends"): string | null {
  const x = result.samples[before], y = result.samples[after];
  if (!x || !y) return null;
  const parts = (["sun", "earth"] as const)
    .filter((b) => kind === "begins" ? !x[b].visible && y[b].visible : x[b].visible && !y[b].visible)
    .map((b) => kind === "begins" ? `${BODY[b]} becomes visible` : `${BODY[b]} no longer visible`);
  return parts.length ? parts.join(" and ") : null;
}

/**
 * Every joint (Sun AND Earth) window of at least `minMinutes`, taken from the backend's own intervals.
 * Durations are sample-and-hold: boundaries are only known to the sampling step, and the final sample of
 * the range carries no duration, so a window touching the range end is reported as clipped.
 */
export function findWindows(result: AnalysisResult, minMinutes: number): WindowSearch {
  const both: VisibilityInterval[] = result.summary.windows.both ?? [];
  const step = result.summary.step_minutes;
  const all = both.map((interval) => {
    const startIndex = Math.max(0, indexForTime(result, interval.start));
    const minutes = interval.duration_minutes ?? (Date.parse(interval.end) - Date.parse(interval.start)) / 60_000;
    // `end` is the first non-qualifying sample (or the range end); the last qualifying sample is one step earlier.
    const endIndex = indexForTime(result, interval.end);
    const clippedAtStart = !!interval.starts_at_range_start || startIndex === 0;
    const clippedAtEnd = !!interval.ends_at_range_end;
    return {
      start: interval.start, end: interval.end, durationMinutes: minutes, startIndex, clippedAtStart, clippedAtEnd,
      begins: clippedAtStart ? null : change(result, startIndex - 1, startIndex, "begins"),
      ends: clippedAtEnd ? null : change(result, endIndex - 1, endIndex, "ends"),
    } satisfies FoundWindow;
  });
  const windows = all.filter((w) => w.durationMinutes >= minMinutes);
  const longestMinutes = all.reduce((m, w) => Math.max(m, w.durationMinutes), 0);
  let reason: string | null = null;
  if (!windows.length) {
    const s = result.summary;
    if (s.sunlight_percent === 0 && s.earth_visible_percent === 0) reason = "Neither the Sun nor Earth is visible at any sample in this range.";
    else if (s.sunlight_percent === 0) reason = "The Sun is not visible at any sample in this range, so there is no joint window.";
    else if (s.earth_visible_percent === 0) reason = "Earth is not visible at any sample in this range, so there is no joint window.";
    else if (!all.length) reason = `The Sun (${s.sunlight_percent}% of the range) and Earth (${s.earth_visible_percent}%) are each visible at times, but never together at the same sample.`;
    else reason = `The longest joint window is ${formatMinutes(longestMinutes)}, shorter than the ${formatMinutes(minMinutes)} required. Sampling every ${step} min limits how precisely short windows can be resolved.`;
  }
  return { windows, qualifying: windows.length, total: all.length, longestMinutes, reason };
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return "--";
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Parse the user's minimum duration (hours + minutes fields); null when invalid. */
export function parseMinDuration(hours: string, minutes: string): number | null {
  const h = hours.trim() === "" ? 0 : Number(hours), m = minutes.trim() === "" ? 0 : Number(minutes);
  if (![h, m].every((v) => Number.isFinite(v) && v >= 0) || !Number.isInteger(h) || !Number.isInteger(m)) return null;
  const total = h * 60 + m;
  return total > 0 ? total : null;
}
