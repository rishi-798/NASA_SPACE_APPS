import type { AnalysisResult, VisibilityResponse } from "../types";

/**
 * One authoritative selected sample drives the timestamp, scene time, Sun/Earth indicators,
 * horizon markers and timeline cursor. `index` is the only playback position; nothing else stores a time.
 */
export type PlaybackState = { index: number; count: number; playing: boolean };
export type PlaybackAction =
  | { type: "load"; count: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "seek"; index: number }
  | { type: "step"; by: number }
  | { type: "tick" }
  | { type: "replay" };

export const idlePlayback: PlaybackState = { index: 0, count: 0, playing: false };

const clamp = (index: number, count: number) => Math.max(0, Math.min(Math.max(count - 1, 0), Math.trunc(index) || 0));
export const atEnd = (state: PlaybackState) => state.count > 0 && state.index >= state.count - 1;

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    // New or discarded results always restart paused at the first sample.
    case "load": return { index: 0, count: Math.max(0, action.count), playing: false };
    case "play": return state.count < 2 || atEnd(state) ? state : { ...state, playing: true };
    case "pause": return state.playing ? { ...state, playing: false } : state;
    case "toggle": return playbackReducer(state, { type: state.playing ? "pause" : atEnd(state) ? "replay" : "play" });
    // Scrubbing and stepping always pause: the user is now in control of the position.
    case "seek": return { ...state, index: clamp(action.index, state.count), playing: false };
    case "step": return { ...state, index: clamp(state.index + action.by, state.count), playing: false };
    case "tick": {
      if (!state.playing) return state;
      const index = clamp(state.index + 1, state.count);
      return { ...state, index, playing: index < state.count - 1 };   // stop at the final sample
    }
    case "replay": return state.count < 2 ? state : { ...state, index: 0, playing: true };
  }
}

/** Conditions for sample `index` of one analysis result (the same sample set as the summary). */
export function conditionsAt(result: AnalysisResult, index: number): VisibilityResponse {
  const i = clamp(index, result.samples.length);
  const sample = result.samples[i]!;
  const first = result.conditions;
  return { site: first.site, latitude: first.latitude, longitude: first.longitude, time: sample.time, sun: sample.sun, earth: sample.earth };
}

/** Index of the sample at exactly `time`; falls back to the last sample at or before it. -1 if before the first. */
export function indexForTime(result: Pick<AnalysisResult, "samples">, time: string): number {
  const target = Date.parse(time);
  let found = -1;
  for (let i = 0; i < result.samples.length; i++) {
    if (Date.parse(result.samples[i]!.time) <= target) found = i; else break;
  }
  return found;
}

/** Playback speed -> milliseconds per sample. */
export const SPEEDS = [{ label: "1×", ms: 600 }, { label: "2×", ms: 300 }, { label: "4×", ms: 150 }] as const;
