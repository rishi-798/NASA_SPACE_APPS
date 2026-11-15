import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConditionsPanel } from "../components/explorer/ConditionsPanel";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { useLoadingScreen } from "../components/ui/useLoadingScreen";
import { useAnnounce, useCancelOnLeave, useVoiceGuide } from "../components/voice/voiceContext";
import { explainResult, PROMPTS } from "../lib/explainResult";
import { PlaybackControls } from "../components/explorer/PlaybackControls";
import { SiteComparison } from "../components/explorer/SiteComparison";
import { WindowFinder } from "../components/explorer/WindowFinder";
import { useTerrainCatalogue } from "../components/explorer/useTerrainCatalogue";
import { ExplorerControls } from "../components/explorer/ExplorerControls";
import { MoonExplorer } from "../components/explorer/MoonExplorer";
import { TerrainContext } from "../components/explorer/TerrainContext";
import { LocalSurfacePane } from "../components/explorer/LocalSurfacePane";
import { HorizonContainer } from "../components/visualization/HorizonContainer";
import { VisibilityTimeline } from "../components/visualization/VisibilityTimeline";
import { landingSites } from "../data/landingSites";
import { explorerDestination, missionRangeInput } from "../lib/missionNavigation";
import { ApiError, getAnalysis, getComparison } from "../lib/api";
import type { MoonLocation } from "../MoonMap";
import { checkRange, type RangeInput } from "../lib/analysisRange";
import { formatCoordinate } from "../lib/format";
import { conditionsAt, idlePlayback, playbackReducer, SPEEDS } from "../lib/playback";
import { createRequestGate } from "../lib/requestGate";
import type { AnalysisResult, AnalysisState, ComparisonResult } from "../types";

const DEFAULT_INPUT: RangeInput = {
  startDate: "2026-10-03", startTime: "18:00", endDate: "2026-10-04", endTime: "18:00", stepMinutes: "30",
};
/** Statement of the horizon model the user should expect, before the backend reports the real one. */
function horizonExpectation(custom: boolean, latitude: number) {
  if (!custom) return "Reported by the backend after analysis: terrain-aware only where a LOLA profile exists";
  return latitude <= -81.3
    ? "LOLA terrain generated for this point when its data is reachable; otherwise flat horizon, labelled degraded"
    : "Flat horizon: terrain data exists only poleward of about 81.3° S";
}

export function ExplorerPage() {
  const [params] = useSearchParams();
  return <ExplorerWorkspace key={params.toString()} />;
}

function ExplorerWorkspace() {
  const root = useRef<HTMLElement>(null);
  const [searchParams] = useSearchParams();
  const destination = explorerDestination(searchParams, landingSites.map((site) => site.id));
  const firstSite = landingSites[0]!;
  const initialSite = landingSites.find((site) => site.id === destination.siteId) ?? firstSite;

  const [selectedId, setSelectedId] = useState(initialSite.id);
  const [input, setInput] = useState<RangeInput>(() => missionRangeInput(destination.time, DEFAULT_INPUT));
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [pickedLocation, setPickedLocation] = useState<MoonLocation | null>(destination.location);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [comparisonState, setComparisonState] = useState<AnalysisState>("idle");
  const [comparisonError, setComparisonError] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [playback, dispatchPlayback] = useReducer(playbackReducer, idlePlayback);
  const [speed, setSpeed] = useState(0);
  // Each gate keeps only the newest request's response; changing any input invalidates both.
  const analysisGate = useRef(createRequestGate());
  const comparisonGate = useRef(createRequestGate());

  const selectedSite = landingSites.find((site) => site.id === selectedId) ?? firstSite;
  const location = pickedLocation ?? selectedSite;
  const check = useMemo(() => checkRange(input), [input]);
  const requestedStart = check.ok ? check.range.start : null;
  // The one authoritative sample: everything below reads `active`, nothing keeps its own time.
  const active = useMemo(() => (result ? conditionsAt(result, playback.index) : null), [result, playback.index]);
  const catalogue = useTerrainCatalogue(location.latitude, location.longitude);
  const { guide } = useVoiceGuide();
  const eventSerial = useRef(0);
  useAnnounce("stage", "explorer:intro", PROMPTS.explorer);
  useCancelOnLeave();
  // An explanation describes one sample of one result: drop it when either changes.
  useEffect(() => { guide.cancel("explain"); }, [guide, result, playback.index]);

  useEffect(() => {
    const analysis = analysisGate.current, compareGate = comparisonGate.current;
    return () => { analysis.invalidate(); compareGate.invalidate(); };
  }, []);

  // Playback clock: advances the single sample index; stops itself at the final sample.
  useEffect(() => {
    if (!playback.playing) return;
    const timer = window.setInterval(() => dispatchPlayback({ type: "tick" }), SPEEDS[speed]!.ms);
    return () => window.clearInterval(timer);
  }, [playback.playing, speed]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap.from("[data-reveal]", {
        y: 18,
        opacity: 0,
        duration: 0.85,
        stagger: 0.09,
        ease: "power3.out",
      });
      gsap.from("[data-moon-stage]", {
        scale: 0.965,
        opacity: 0,
        duration: 1.45,
        ease: "power2.out",
      });
    },
    { scope: root },
  );

  const resetComparison = useCallback(() => {
    comparisonGate.current.invalidate();
    setComparisonState("idle");
    setComparison(null);
    setComparisonError(undefined);
  }, []);

  /** Any change to the inputs cancels playback, in-flight requests and every outdated result. */
  const resetAnalysis = useCallback(() => {
    resetComparison();
    analysisGate.current.invalidate();
    dispatchPlayback({ type: "load", count: 0 });
    setAnalysisState("idle");
    setResult(null);
    setErrorMessage(undefined);
  }, [resetComparison]);

  const pickLocation = useCallback((value: MoonLocation | null) => {
    setPickedLocation(value);
    resetAnalysis();
  }, [resetAnalysis]);

  const selectSite = useCallback((siteId: string) => {
    if (siteId === "custom") return;
    setPickedLocation(null);
    setSelectedId(siteId);
    resetAnalysis();
  }, [resetAnalysis, setSelectedId]);

  function changeInput(patch: Partial<RangeInput>) {
    setInput((current) => ({ ...current, ...patch }));
    resetAnalysis();
  }

  async function compare() {
    if (!check.ok) return;
    const ticket = comparisonGate.current.begin();
    const event = ++eventSerial.current;
    guide.say("analysis", `compare:start:${event}`, PROMPTS.compareStart);
    setComparisonState("loading");
    setComparison(null);
    setComparisonError(undefined);
    try {
      const response = await getComparison(check.range, ticket.signal);
      if (!ticket.current()) return;
      setComparison(response);
      setComparisonState("success");
      guide.say("analysis", `compare:done:${event}`, PROMPTS.compareDone);
    } catch (error) {
      if (!ticket.current()) return;
      setComparison(null);
      setComparisonState("error");
      setComparisonError(error instanceof ApiError ? error.message : "An unexpected comparison error occurred.");
      guide.say("analysis", `compare:fail:${event}`, PROMPTS.compareFailed);
    }
  }

  async function analyze() {
    if (!check.ok) return;
    const ticket = analysisGate.current.begin();
    const event = ++eventSerial.current;
    guide.say("analysis", `analysis:start:${event}`, PROMPTS.analysisStart);
    dispatchPlayback({ type: "load", count: 0 });
    setAnalysisState("loading");
    setResult(null);
    setErrorMessage(undefined);
    try {
      const response = await getAnalysis(selectedSite.id, pickedLocation, check.range, ticket.signal);
      if (!ticket.current()) return;
      setResult(response);
      dispatchPlayback({ type: "load", count: response.samples.length });
      setAnalysisState("success");
      guide.say("analysis", `analysis:done:${event}`, PROMPTS.analysisDone);
    } catch (error) {
      if (!ticket.current()) return;
      setResult(null);
      setAnalysisState("error");
      setErrorMessage(error instanceof ApiError ? error.message : "An unexpected analysis error occurred.");
      guide.say("analysis", `analysis:fail:${event}`, PROMPTS.analysisFailed);
    }
  }

  function explain() {
    if (!result || !active) return;
    dispatchPlayback({ type: "pause" });           // the explanation is about the sample on screen now
    const siteName = pickedLocation
      ? `The selected point at ${formatCoordinate(location.latitude, "lat")}, ${formatCoordinate(location.longitude, "lon")}`
      : selectedSite.name;
    guide.say("explain", `explain:${active.time}`, explainResult({ siteId: pickedLocation ? null : selectedSite.id, siteName, conditions: active, terrain: result.terrain }), { force: true, explicit: true });
  }

  const sceneTime = active?.time ?? requestedStart;
  const loadingScreen = useLoadingScreen(analysisState === "loading" || comparisonState === "loading");

  return (
    <article ref={root} className="explorer-page">
      <LoadingScreen visible={loadingScreen.visible} ready={loadingScreen.ready} onDismiss={loadingScreen.dismiss} message={comparisonState === "loading" ? "Comparing both sites" : undefined} />
      <header className="explorer-context" data-reveal>
        <div>
          <p className="eyebrow">Lunar surface operations</p>
          <h1>Landing condition explorer</h1>
        </div>
        <dl className="context-coordinates">
          <div><dt>LAT</dt><dd>{formatCoordinate(location.latitude, "lat")}</dd></div>
          <div><dt>LON</dt><dd>{formatCoordinate(location.longitude, "lon")}</dd></div>
          <div><dt>SITES</dt><dd>{landingSites.length.toString().padStart(2, "0")} LOADED</dd></div>
        </dl>
      </header>

      {searchParams.get("context") && <p className="trip-notice" role="note">{searchParams.get("context")?.slice(0, 500)}</p>}
      <div className="explorer-grid">
        <div className="explorer-visual" data-reveal>
          <MoonExplorer
            focusOnMount={Boolean(destination.siteId || destination.location)}
            observationTime={sceneTime}
            selectedSite={selectedSite}
            pickedLocation={pickedLocation}
            onLocationSelect={pickLocation}
            onSiteSelect={selectSite}
          />
          {result && active && <PlaybackControls playback={playback} activeTime={active.time} requestedStart={result.summary.start}
            speed={speed} onSpeed={setSpeed} dispatch={dispatchPlayback} />}
          <TerrainContext latitude={location.latitude} longitude={location.longitude}
            catalogue={catalogue.state} onRetry={catalogue.retry}
            terrain={result?.terrain ?? null} horizon={result?.horizon ?? null} />
        </div>
        <aside className="explorer-sidebar" data-reveal>
          <ExplorerControls
            sites={landingSites}
            selectedId={pickedLocation ? "custom" : selectedSite.id}
            customLocation={!!pickedLocation}
            input={input}
            check={check}
            loading={analysisState === "loading"}
            horizonExpectation={horizonExpectation(!!pickedLocation, location.latitude)}
            onSiteChange={selectSite}
            onInputChange={changeInput}
            onSubmit={analyze}
          />
          <ConditionsPanel
            conditions={active}
            state={analysisState}
            observationTime={requestedStart}
            dossierRange={result ? {start: result.summary.start, end: result.summary.end, stepMinutes: result.summary.step_minutes} : undefined}
            sampleLabel={result ? `Sample ${playback.index + 1} of ${playback.count}` : undefined}
            errorMessage={errorMessage}
            terrain={result?.terrain ?? null}
            siteId={pickedLocation ? undefined : selectedSite.id}
            latitude={location.latitude}
            longitude={location.longitude}
            onExplain={explain}
          />
        </aside>
      </div>

      <LocalSurfacePane latitude={location.latitude} longitude={location.longitude}
        observationTime={sceneTime ?? `${DEFAULT_INPUT.startDate}T${DEFAULT_INPUT.startTime}:00Z`} onPick={pickLocation} />

      <div className="analysis-grid" data-reveal>
        <HorizonContainer data={active} profile={result?.horizon ?? null} />
        <VisibilityTimeline data={active} summary={result?.summary ?? null} sampleCount={result?.samples.length ?? 0} />
      </div>

      <WindowFinder result={result} activeIndex={playback.index} onSelect={(index) => dispatchPlayback({ type: "seek", index })} />

      <SiteComparison result={comparison} state={comparisonState} errorMessage={comparisonError}
        onCompare={compare} disabled={!check.ok} />
    </article>
  );
}
