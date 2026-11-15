import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConditionsPanel } from "../components/explorer/ConditionsPanel";
import { ExplorerControls } from "../components/explorer/ExplorerControls";
import { MoonExplorer } from "../components/explorer/MoonExplorer";
import { HorizonContainer } from "../components/visualization/HorizonContainer";
import { VisibilityTimeline } from "../components/visualization/VisibilityTimeline";
import { landingSites } from "../data/landingSites";
import { ApiError, createInterfacePreview, getSiteVisibility } from "../lib/api";
import { formatCoordinate } from "../lib/format";
import type { AnalysisState, VisibilityResponse } from "../types";

function timestamp(date: string, time: string) {
  return `${date}T${time}:00Z`;
}

export function ExplorerPage() {
  const root = useRef<HTMLElement>(null);
  const [searchParams] = useSearchParams();
  const requestedSite = searchParams.get("site");
  const firstSite = landingSites[0]!;
  const initialSite = landingSites.find((site) => site.id === requestedSite) ?? firstSite;

  const [selectedId, setSelectedId] = useState(initialSite.id);
  const [date, setDate] = useState("2026-10-03");
  const [time, setTime] = useState("18:00");
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [liveConditions, setLiveConditions] = useState<VisibilityResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  const selectedSite =
    landingSites.find((site) => site.id === selectedId) ?? firstSite;
  const preview = useMemo(
    () => createInterfacePreview(selectedSite, timestamp(date, time)),
    [selectedSite, date, time],
  );
  const conditions = liveConditions ?? preview;

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

  function resetAnalysis() {
    setAnalysisState("idle");
    setLiveConditions(null);
    setErrorMessage(undefined);
  }

  function selectSite(siteId: string) {
    setSelectedId(siteId);
    resetAnalysis();
  }

  async function analyze() {
    setAnalysisState("loading");
    setErrorMessage(undefined);

    try {
      const response = await getSiteVisibility(selectedSite.id, timestamp(date, time));
      setLiveConditions(response);
      setAnalysisState("success");
    } catch (error) {
      setLiveConditions(null);
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
            <dd>{formatCoordinate(selectedSite.latitude, "lat")}</dd>
          </div>
          <div>
            <dt>LON</dt>
            <dd>{formatCoordinate(selectedSite.longitude, "lon")}</dd>
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
            key={selectedSite.id}
            sites={landingSites}
            selectedSite={selectedSite}
            onSelectSite={(site) => selectSite(site.id)}
          />
        </div>
        <aside className="explorer-sidebar" data-reveal>
          <ExplorerControls
            sites={landingSites}
            selectedId={selectedSite.id}
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
            isPreview={!liveConditions}
            errorMessage={errorMessage}
          />
        </aside>
      </div>

      <div className="analysis-grid" data-reveal>
        <HorizonContainer data={conditions} />
        <VisibilityTimeline data={conditions} />
      </div>
    </article>
  );
}
