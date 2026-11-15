import data from "../data/voiceLines.json" with { type: "json" };

/** Every spoken line exists, pre-written, in each of these languages (frontend/src/data/voiceLines.json). */
export type Lang = "en" | "es" | "fr" | "hi" | "zh";
export type LineId = keyof typeof data.lines;
export const LANGS = Object.keys(data.languages) as Lang[];

/**
 * What is said: a sequence of pre-recorded lines. `prefix` is caption-only detail that cannot be pre-recorded
 * (an exact UTC time, a custom site name). It is shown, never spoken.
 */
export type Utterance = { ids: LineId[]; prefix?: Partial<Record<Lang, string>> };

export const line = (...ids: LineId[]): Utterance => ({ ids });
export const lineText = (id: LineId, lang: Lang): string => (data.lines[id] as Record<Lang, string>)[lang];
export const languageName = (lang: Lang): string => data.languages[lang].name;
export const bcp47 = (lang: Lang): string => data.languages[lang].bcp47;

export function captionText(utterance: Utterance, lang: Lang): string {
  const spoken = utterance.ids.map((id) => lineText(id, lang)).join(lang === "zh" ? "" : " ");
  const prefix = utterance.prefix?.[lang];
  return prefix ? `${prefix} — ${spoken}` : spoken;
}

/** First supported language in the device's preference list (navigator.languages); English otherwise. */
export function deviceLanguage(preferences: readonly string[] | undefined | null): Lang {
  for (const tag of preferences ?? []) {
    const base = tag.toLowerCase().split(/[-_]/)[0] as Lang;
    if (LANGS.includes(base)) return base;
  }
  return "en";
}
