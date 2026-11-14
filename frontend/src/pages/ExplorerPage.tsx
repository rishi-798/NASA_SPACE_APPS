import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConditionsPanel } from "../components/explorer/ConditionsPanel";
import { ExplorerControls } from "../components/explorer/ExplorerControls";
import { MoonExplorer } from "../components/explorer/MoonExplorer";
import { TerrainContext } from "../components/explorer/TerrainContext";
import { HorizonContainer } from "../components/visualization/HorizonContainer";
import { VisibilityTimeline } from "../components/visualization/VisibilityTimeline";
import { landingSites } from "../data/landingSites";
import { explorerDestination } from "../lib/missionNavigation";
import { ApiError, getAnalysis } from "../lib/api";
import type { MoonLocation } from "../MoonMap";
import { formatCoordinate } from "../lib/format";
import type { AnalysisResult, AnalysisState } from "../types";

function timestamp(date: string, time: string) {
  return `${date}T${time}:00Z`;
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
  const [date, setDate] = useState("2026-10-03");
  const [time, setTime] = useState("18:00");
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [pickedLocation, setPickedLocation] = useState<MoonLocation | null>(destination.location);
  const activeRequest = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  const selectedSite =
    landingSites.find((site) => site.id === selectedId) ?? firstSite;
  const location = pickedLocation ?? selectedSite;
  const conditions = result?.conditions ?? null;
  useEffect(() => () => activeRequest.current?.abort(), []);

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

  const resetAnalysis = useCallback(() => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setAnalysisState("idle");
    setResult(null);
    setErrorMessage(undefined);
  }, []);

  const pickLocation = useCallback((value: MoonLocation | null) => {
    setPickedLocation(value);
    resetAnalysis();
  }, [resetAnalysis]);

  const selectSite = useCallback((siteId: string) => {
    if (siteId === "custom") return;
    setPickedLocation(null);
    setSelectedId(siteId);
    resetAnalysis();
  }, [resetAnalysis]);

  async function analyze() {
    if (!date || !time) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setAnalysisState("loading");
    setResult(null);
    setErrorMessage(undefined);

    try {
      const response = await getAnalysis(selectedSite.id, pickedLocation, timestamp(date, time), date, controller.signal);
      if (controller.signal.aborted) return;
      setResult(response);
      setAnalysisState("success");
    } catch (error) {
      if (controller.signal.aborted) return;
      controller.abort();
      setResult(null);
      setAnalysisState("error");
      setErrorMessage(
        error instanceof ApiError ? error.message : "An unexpected analysis error occurred.",
      );
    }
  }

  return (
    <article ref={root} className="explorer-page">
      <header className="explorer-context" data-reveal>
        <div>
          <p className="eyebrow">Lunar surface operations</p>
          <h1>Landing condition explorer</h1>
        </div>
        <dl className="context-coordinates">
          <div>
            <dt>LAT</dt>
            <dd>{formatCoordinate(location.latitude, "lat")}</dd>
          </div>
          <div>
            <dt>LON</dt>
            <dd>{formatCoordinate(location.longitude, "lon")}</dd>
          </div>
          <div>
            <dt>SITES</dt>
            <dd>{landingSites.length.toString().padStart(2, "0")} LOADED</dd>
          </div>
        </dl>
      </header>

      <div className="explorer-grid">
        <div className="explorer-visual" data-reveal>
          <MoonExplorer
            observationTime={date && time ? timestamp(date, time) : null}
            selectedSite={selectedSite}
            pickedLocation={pickedLocation}
            onLocationSelect={pickLocation}
            onSiteSelect={selectSite}
          />
        </div>
        <aside className="explorer-sidebar" data-reveal>
          <ExplorerControls
            sites={landingSites}
            selectedId={pickedLocation ? "custom" : selectedSite.id}
            customLocation={!!pickedLocation}
            date={date}
            time={time}
            loading={analysisState === "loading"}
            onSiteChange={selectSite}
            onDateChange={(value) => {
              setDate(value);
              resetAnalysis();
            }}
            onTimeChange={(value) => {
              setTime(value);
              resetAnalysis();
            }}
            onSubmit={analyze}
          />
          <ConditionsPanel
            conditions={conditions}
            state={analysisState}
            observationTime={date && time ? timestamp(date, time) : null}
            errorMessage={errorMessage}
          />
          <TerrainContext latitude={location.latitude} longitude={location.longitude} />
        </aside>
      </div>

      <div className="analysis-grid" data-reveal>
        <HorizonContainer data={conditions} profile={result?.horizon ?? null} />
        <VisibilityTimeline data={conditions} summary={result?.summary ?? null} sampleCount={result?.samples.length ?? 0} />
      </div>
    </article>
  );
}
