import type { CelestialPosition, TerrainStatus, VisibilityResponse } from "../types";
import { bcp47, LANGS, line, type Lang, type LineId, type Utterance } from "./voiceLines.ts";

/**
 * Deterministic explanation of ONE returned sample, assembled from pre-recorded sentences. Every sentence
 * comes from a returned flag or status: `visible` (authoritative), `flat_visible` (terrain mode only) and the
 * terrain mode. Elevation alone never decides visibility, and nothing is called safe. The exact UTC time (and a
 * custom site's name) cannot be pre-recorded, so they appear in the caption prefix.
 */
export type ExplainInput = { siteId: string | null; siteName: string; conditions: VisibilityResponse; terrain: TerrainStatus | null };

export function captionUtc(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const text = new Intl.DateTimeFormat(bcp47(lang), { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(d);
  return `${text} UTC`;
}

function bodyLine(body: "sun" | "earth", position: CelestialPosition, mode: TerrainStatus["mode"] | null): LineId {
  const terrainMode = mode === "terrain_profile";
  if (position.visible) return `${body}_${terrainMode ? "visible_terrain" : "above_flat"}`;
  if (terrainMode) {
    if (position.flat_visible === true) return `${body}_blocked_terrain`;
    if (position.flat_visible === false) return `${body}_below_horizon`;
    return `${body}_not_visible`;
  }
  return mode ? `${body}_below_flat` : `${body}_not_visible`;
}

export function explainResult({ siteId, siteName, conditions, terrain }: ExplainInput): Utterance {
  const mode = terrain?.mode ?? null;
  const site: LineId = siteId === "athena-im2" ? "site_athena" : siteId === "odysseus-im1" ? "site_odysseus" : "site_custom";
  const ids: LineId[] = [site, bodyLine("earth", conditions.earth, mode), bodyLine("sun", conditions.sun, mode)];
  if (mode === "terrain_profile") ids.push("terrain_included", terrain?.profile_metadata?.pixel_resolution_m === 80 ? "res_80" : "res_generic");
  else if (mode === "flat_horizon") ids.push("flat_not_included");
  else if (mode === "flat_horizon_degraded") ids.push("degraded");
  else ids.push("horizon_unknown");
  ids.push("not_power");
  const prefix = Object.fromEntries(LANGS.map((lang) => [lang,
    site === "site_custom" ? `${siteName} · ${captionUtc(conditions.time, lang)}` : captionUtc(conditions.time, lang)]));
  return { ids, prefix };
}

/** Workflow prompts: each is one pre-recorded line. */
export const PROMPTS = {
  departure: line("departure"),
  rocket: line("rocket"),
  destination: line("destination"),
  observation: line("observation"),
  explorer: line("explorer"),
  analysisStart: line("analysis_start"),
  analysisDone: line("analysis_done"),
  tripDone: line("trip_done"),
  analysisFailed: line("analysis_failed"),
  compareStart: line("compare_start"),
  compareDone: line("compare_done"),
  compareFailed: line("compare_failed"),
  missionRecord: line("mission_record"),
} as const;
