import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createVoiceGuide } from '../frontend/src/lib/voiceGuide.ts';
import { explainResult, captionUtc, PROMPTS } from '../frontend/src/lib/explainResult.ts';
import { captionText, deviceLanguage, LANGS, line } from '../frontend/src/lib/voiceLines.ts';

function fakePort() {
  const log = []; let current = null;
  return { log, port: {
    speak(req, h) { log.push(['speak', req]); current = h; h.onstart(); },
    cancel() { log.push(['cancel']); if (current) { const h = current; current = null; h.onerror('interrupted'); } },
  }, finish() { const h = current; current = null; h?.onend(); }, fail(e) { const h = current; current = null; h?.onerror(e); } };
}
const spoken = (log) => log.filter((e) => e[0] === 'speak').map((e) => e[1]);
const texts = (log) => spoken(log).map((r) => r.text);

test('nothing is spoken until enabled; enabling announces the current context as recorded lines', () => {
  const f = fakePort(); const g = createVoiceGuide(f.port, () => {});
  g.say('stage', 'trip:earth', PROMPTS.departure);
  assert.deepEqual(spoken(f.log), []);
  assert.equal(g.getState().caption, null);
  g.enable();
  assert.deepEqual(spoken(f.log)[0].ids, ['online', 'departure']);
  assert.equal(texts(f.log)[0], 'Mission control online. Select your departure location.');
  assert.equal(g.getState().caption.text, texts(f.log)[0]);   // caption == speech
  assert.equal(g.getState().speaking, true);
});

test('the same key never repeats (rerenders); a new key cancels the previous line', () => {
  const f = fakePort(); const g = createVoiceGuide(f.port, () => {}); g.enable();
  for (let i = 0; i < 3; i++) g.say('stage', 'trip:earth', PROMPTS.departure);
  g.say('stage', 'trip:rocket', PROMPTS.rocket);
  assert.deepEqual(spoken(f.log).slice(1).map((r) => r.ids[0]), ['departure', 'rocket']);
  const i = f.log.findIndex((e) => e[0] === 'speak' && e[1].ids[0] === 'rocket');
  assert.deepEqual(f.log[i - 1], ['cancel']);
  f.finish(); assert.equal(g.getState().speaking, false);
});

test('language follows the device; switching re-renders the caption and the next line uses it', () => {
  const f = fakePort(); const g = createVoiceGuide(f.port, () => {}, 'es'); g.enable();
  assert.equal(spoken(f.log)[0].lang, 'es');
  assert.equal(g.getState().caption.text, 'Control de misión en línea.');
  g.say('stage', 'r', PROMPTS.rocket);
  g.setLang('hi');
  assert.equal(g.getState().caption.text, 'अपना प्रक्षेपण यान चुनें।');
  g.replay();
  assert.deepEqual([spoken(f.log).at(-1).lang, spoken(f.log).at(-1).ids], ['hi', ['rocket']]);
  assert.deepEqual(['fr-CA', 'en'].map((x) => deviceLanguage([x])), ['fr', 'en']);
  assert.equal(deviceLanguage(['de-DE', 'zh-Hans-CN']), 'zh');
  assert.equal(deviceLanguage(['de-DE', 'ja']), 'en');
  assert.equal(deviceLanguage(undefined), 'en');
});

test('mute keeps captions without speech; replay repeats the latest line', () => {
  const f = fakePort(); const g = createVoiceGuide(f.port, () => {}); g.enable();
  g.setMuted(true);
  g.say('analysis', 'a:start:1', PROMPTS.analysisStart);
  assert.equal(g.getState().caption.text, 'Calculating sunlight and Earth visibility.');
  assert.equal(spoken(f.log).some((r) => r.ids[0] === 'analysis_start'), false);
  g.setMuted(false); g.replay();
  assert.deepEqual(spoken(f.log).at(-1).ids, ['analysis_start']);
});

test('disable stops speech and clears captions; cancel(tag) only cancels a matching line', () => {
  const f = fakePort(); const g = createVoiceGuide(f.port, () => {}); g.enable();
  g.say('explain', 'e1', line('not_power'), { explicit: true });
  g.cancel('stage'); assert.ok(g.getState().caption);
  g.cancel('explain'); assert.equal(g.getState().caption, null);
  g.say('stage', 's', PROMPTS.rocket); g.disable();
  assert.deepEqual([g.getState().enabled, g.getState().caption, g.getState().speaking], [false, null, false]);
  g.say('stage', 's2', PROMPTS.destination); assert.equal(spoken(f.log).some((r) => r.ids[0] === 'destination'), false);
});

test('explicit explanations show captions while off but are not spoken; no audio still captions', () => {
  const f = fakePort(); const g = createVoiceGuide(f.port, () => {});
  g.say('explain', 'e', line('earth_above_flat'), { explicit: true, force: true });
  assert.equal(g.getState().caption.text, 'Earth is above the flat horizon.');
  assert.deepEqual(spoken(f.log), []);
  const none = createVoiceGuide(null, () => {});
  assert.equal(none.getState().available, false);
  none.enable(); none.say('stage', 'k', PROMPTS.rocket);
  assert.equal(none.getState().caption.text, 'Choose your launch vehicle.');
});

test('missing recordings and real failures are reported; our own interruptions are not', () => {
  const f = fakePort(); const g = createVoiceGuide(f.port, () => {}); g.enable();
  g.say('stage', 'x', PROMPTS.rocket); f.fail('no-recording');
  assert.match(g.getState().error, /No recording/);
  g.say('stage', 'y', PROMPTS.destination); f.fail('clip-failed');
  assert.match(g.getState().error, /Captions continue/);
  g.say('stage', 'z', PROMPTS.observation); g.say('stage', 'w', PROMPTS.explorer);
  assert.equal(g.getState().error, null);
});

const pos = (visible, extra = {}) => ({ azimuth: 100, elevation: 1, visible, ...extra });
const cond = (sun, earth) => ({ site: 'athena-im2', latitude: -84.79, longitude: 29.2, time: '2026-10-03T18:00:00Z', sun, earth });
const terrain = { mode: 'terrain_profile', status: 'profile_loaded', terrain_obstruction_assessed: true, message: '', profile_metadata: { source: 'x', pixel_resolution_m: 80 } };

test('explanation is built from recorded sentences chosen by the visibility flags', () => {
  const u = explainResult({ siteId: 'athena-im2', siteName: 'Athena landing site', conditions: cond(pos(false, { flat_visible: true }), pos(true, { flat_visible: true })), terrain });
  assert.deepEqual(u.ids, ['site_athena', 'earth_visible_terrain', 'sun_blocked_terrain', 'terrain_included', 'res_80', 'not_power']);
  const en = captionText(u, 'en');
  assert.match(en, /^October 3, 2026 at 18:00 UTC — Athena landing site, at the selected time\./);
  assert.match(en, /The Sun is above the flat horizon, but blocked by the local terrain\./);
  assert.doesNotMatch(en, /\bsafe\b/i);
  assert.match(captionText(u, 'fr'), /Le Soleil est au-dessus de l'horizon plat, mais masqué par le relief local\./);
});

test('elevation never overrides the visible flag; flat/degraded/unknown modes', () => {
  const blocked = explainResult({ siteId: 'athena-im2', siteName: 'A', conditions: cond(pos(false, { elevation: 5 }), pos(false, { elevation: 9, flat_visible: false })), terrain });
  assert.deepEqual(blocked.ids.slice(1, 3), ['earth_below_horizon', 'sun_not_visible']);
  const negVisible = explainResult({ siteId: 'athena-im2', siteName: 'A', conditions: cond(pos(true, { elevation: -0.5 }), pos(true)), terrain });
  assert.equal(negVisible.ids[2], 'sun_visible_terrain');
  const flat = explainResult({ siteId: 'odysseus-im1', siteName: 'O', conditions: cond(pos(true), pos(false)), terrain: { ...terrain, mode: 'flat_horizon', profile_metadata: null } });
  assert.deepEqual(flat.ids, ['site_odysseus', 'earth_below_flat', 'sun_above_flat', 'flat_not_included', 'not_power']);
  assert.ok(explainResult({ siteId: null, siteName: 'S', conditions: cond(pos(true), pos(true)), terrain: { ...terrain, mode: 'flat_horizon_degraded' } }).ids.includes('degraded'));
  const unknown = explainResult({ siteId: null, siteName: 'Apollo 11', conditions: cond(pos(false), pos(false)), terrain: null });
  assert.equal(unknown.ids[0], 'site_custom');
  assert.ok(unknown.ids.includes('horizon_unknown'));
  assert.match(captionText(unknown, 'en'), /^Apollo 11 · October 3, 2026 at 18:00 UTC/);   // custom name only in caption
  assert.match(captionUtc('2024-02-22T23:23:00Z', 'es'), /22 de febrero de 2024.*23:23 UTC/);
});

test('every line exists in every language, and every recorded clip in the manifest exists', () => {
  const data = JSON.parse(readFileSync(new URL('../frontend/src/data/voiceLines.json', import.meta.url)));
  for (const [id, byLang] of Object.entries(data.lines)) for (const lang of LANGS) assert.ok(byLang[lang]?.trim(), `${id}/${lang}`);
  const manifestUrl = new URL('../frontend/public/voice/manifest.json', import.meta.url);
  if (!existsSync(manifestUrl)) return;
  const manifest = JSON.parse(readFileSync(manifestUrl));
  for (const lang of Object.keys(manifest.lines)) for (const [id, entry] of Object.entries(manifest.lines[lang])) {
    assert.ok(data.lines[id], `manifest has unknown line ${id}`);
    assert.ok(existsSync(new URL(`../frontend/public/voice/${entry.file}`, import.meta.url)), entry.file);
  }
});
