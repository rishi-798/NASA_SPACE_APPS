import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConditionsPanel } from "../components/explorer/ConditionsPanel";
import { ExplorerControls } from "../components/explorer/ExplorerControls";
import { MoonExplorer } from "../components/explorer/MoonExplorer";
import { AnalysisDetails } from "../components/explorer/AnalysisDetails";
import { SiteComparison, type ComparisonEntry } from "../components/explorer/SiteComparison";
import { HorizonContainer } from "../components/visualization/HorizonContainer";
import { VisibilityTimeline } from "../components/visualization/VisibilityTimeline";
import { landingSites } from "../data/landingSites";
import { getAnalysis } from "../lib/api";
import { rangeError, sampleAt, utcRange } from "../lib/playback";
import type { MoonLocation } from "../MoonMap";
import { formatCoordinate, formatUtcDisplay } from "../lib/format";
import type { AnalysisResult, AnalysisState } from "../types";

const initialStart = `${new Date().toISOString().slice(0, 10)}T00:00`;
const initialEnd = new Date(Date.parse(`${initialStart}Z`) + 86400000).toISOString().slice(0, 16);
const message = (error: unknown) => error instanceof Error ? error.message : "Analysis unavailable. Please retry.";

export function ExplorerPage() {
  const [searchParams] = useSearchParams();
  const firstSite = landingSites[0]!;
  const [selectedId, setSelectedId] = useState(landingSites.find(s => s.id === searchParams.get("site"))?.id ?? firstSite.id);
  const [start, setStart] = useState(initialStart), [end, setEnd] = useState(initialEnd);
  const [step, setStep] = useState(30);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [comparisons, setComparisons] = useState<ComparisonEntry[]>([]);
  const [pickedLocation, setPickedLocation] = useState<MoonLocation | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(800);
  const selectedSite = landingSites.find(s => s.id === selectedId) ?? firstSite;
  const location = pickedLocation ?? selectedSite;
  const conditions = sampleAt(result, index);
  const validation = rangeError(start, end, step);
  const lastIndex = (result?.samples.length ?? 1) - 1;
  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (!playing || !result) return;
    const timer = window.setTimeout(() => {
      if (index >= lastIndex) setPlaying(false);
      else { setIndex(index + 1); if (index + 1 === lastIndex) setPlaying(false); }
    }, speed);
    return () => window.clearTimeout(timer);
  }, [playing, result, index, lastIndex, speed]);

  const resetAnalysis = useCallback(() => {
    activeRequest.current?.abort(); activeRequest.current = null;
    setAnalysisState("idle"); setResult(null); setComparisons([]); setErrorMessage(undefined);
    setPlaying(false); setIndex(0);
  }, []);
  const pickLocation = useCallback((value: MoonLocation | null) => { setPickedLocation(value); resetAnalysis(); }, [resetAnalysis]);
  const selectSite = useCallback((id: string) => {
    if (id === "custom") return;
    setPickedLocation(null); setSelectedId(id); resetAnalysis();
  }, [resetAnalysis]);

  async function analyze() {
    if (validation) return;
    resetAnalysis();
    const controller = new AbortController(); activeRequest.current = controller;
    setAnalysisState("loading");
    const range = utcRange(start, end, step);
    const named = landingSites.map(site => getAnalysis(site.id, null, range, controller.signal));
    const selected = pickedLocation ? getAnalysis(selectedId, pickedLocation, range, controller.signal) : named[landingSites.findIndex(s => s.id === selectedId)]!;
    const responses = await Promise.allSettled([...named, selected]);
    if (controller.signal.aborted) return;
    setComparisons(landingSites.map((site, i) => {
      const response = responses[i]!;
      return response.status === "fulfilled" ? { site, result: response.value } : { site, error: message(response.reason) };
    }));
    const response = responses.at(-1)!;
    if (response.status === "fulfilled") { setResult(response.value); setAnalysisState("success"); }
    else { setErrorMessage(message(response.reason)); setAnalysisState("error"); }
  }
  function scrub(value: number) { setPlaying(false); setIndex(value); }
  return <article className="explorer-page">
    <header className="explorer-context"><div><p className="eyebrow">CLPS / Lunar mission browser</p><h1>Explore a window of possibility.</h1><p className="analysis-note">Choose a location. Review your dates. See when the Sun and Earth are visible.</p></div>
      <dl className="context-coordinates"><div><dt>LAT</dt><dd>{formatCoordinate(location.latitude, "lat")}</dd></div><div><dt>LON</dt><dd>{formatCoordinate(location.longitude, "lon")}</dd></div></dl>
    </header>
    <div className="explorer-grid">
      <div className="explorer-visual"><MoonExplorer selectedSite={selectedSite} pickedLocation={pickedLocation} onLocationSelect={pickLocation} onSiteSelect={selectSite} conditions={conditions} /></div>
      <aside className="explorer-sidebar">
        <ExplorerControls sites={landingSites} selectedId={pickedLocation ? "custom" : selectedId} customLocation={!!pickedLocation} start={start} end={end} step={step} validation={validation} loading={analysisState === "loading"} onSiteChange={selectSite}
          onStartChange={v => { setStart(v); resetAnalysis(); }} onEndChange={v => { setEnd(v); resetAnalysis(); }} onStepChange={v => { setStep(v); resetAnalysis(); }} onSubmit={analyze} />
        <ConditionsPanel conditions={conditions} state={analysisState} observationTime={null} errorMessage={errorMessage} />
      </aside>
    </div>
    <section className="playback-panel" aria-labelledby="playback-title">
      <div className="playback-heading"><div><p className="eyebrow">02 / Move through time</p><h2 id="playback-title">{result?.site.name ?? "Your observation window"}</h2></div>
        <output className="playback-time">{conditions ? formatUtcDisplay(conditions.time) : analysisState === "loading" ? "Calculating samples…" : "Review parameters, then press Analyze"}</output></div>
      <div className="playback-controls">
        <button type="button" disabled={!result || lastIndex < 1} onClick={() => { if (!playing && index === lastIndex) setIndex(0); setPlaying(!playing); }}>{playing ? "Pause" : index === lastIndex && result ? "Replay" : "Play"}</button>
        <button type="button" aria-label="Previous sample" disabled={!result || index === 0} onClick={() => scrub(index - 1)}>←</button>
        <input aria-label="Observation time" aria-valuetext={conditions ? formatUtcDisplay(conditions.time) : "No analysis"} type="range" min={0} max={lastIndex} step={1} value={index} disabled={!result} onChange={e => scrub(Number(e.target.value))} />
        <button type="button" aria-label="Next sample" disabled={!result || index === lastIndex} onClick={() => scrub(index + 1)}>→</button>
        <label>Playback<select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1600}>Slow</option><option value={800}>Normal</option><option value={250}>Fast</option></select></label>
      </div>
      <div className="playback-bounds"><span>{result ? formatUtcDisplay(result.summary.start) : "START / UTC"}</span><span>{result ? formatUtcDisplay(result.summary.end) : "END / UTC"}</span></div>
      <p className="analysis-note">{result ? `Sample ${index + 1} of ${result.samples.length} · ${result.summary.step_minutes}-minute calculation steps. Playback advances through calculated samples without interpolation.` : "Playback starts only when you press Play. No preview or sample values are substituted."}</p>
    </section>
    <div className="interpretation-note"><strong>Visibility is one input.</strong> It does not prove adequate power, a working communications link, or a safe landing. Landing hazards and descent are not assessed.</div>
    <div className="analysis-grid"><HorizonContainer data={conditions} profile={result?.horizon ?? null} /><VisibilityTimeline data={conditions} summary={result?.summary ?? null} sampleCount={result?.samples.length ?? 0} /></div>
    <SiteComparison entries={comparisons} loading={analysisState === "loading"} />
    {result && <AnalysisDetails result={result} />}
  </article>;
}
