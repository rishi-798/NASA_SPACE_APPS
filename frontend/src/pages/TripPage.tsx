import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle, GlobeHemisphereWest, RocketLaunch } from "@phosphor-icons/react";
import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MoonMap, type MoonControls, type MoonLocation } from "../MoonMap";
import { ConditionsPanel } from "../components/explorer/ConditionsPanel";
import { useTransferCalculation } from "../lib/useTransferCalculation";
import { TransferPlanner } from "../components/trip/TransferPlanner";
import { MissionDossierModal } from "../components/trip/MissionDossierModal";
import { LaunchWeatherPanel } from "../components/trip/LaunchWeatherPanel";
import { LandingSimPage } from "./LandingSimPage";
import { TerrainContext } from "../components/explorer/TerrainContext";
import { LocalSurfacePane } from "../components/explorer/LocalSurfacePane";
import { sceneForLanding } from "../sim/terrainScenes";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { useLoadingScreen } from "../components/ui/useLoadingScreen";
import { useAnnounce, useAutoEnableVoice, useCancelOnLeave, useVoiceGuide } from "../components/voice/voiceContext";
import { explainResult, PROMPTS } from "../lib/explainResult";
import { useTerrainCatalogue } from "../components/explorer/useTerrainCatalogue";
import { pointElevation } from "../lib/terrainFacts";
import { VisibilityTimeline } from "../components/visualization/VisibilityTimeline";
import { destinations, launchSites, rockets } from "../data/tripCatalogue";
import { landingSites } from "../data/landingSites";
import { getAnalysis } from "../lib/api";
import { formatCoordinate } from "../lib/format";
import { missionReady, missionReducer, restoreMission, type TripStage } from "../lib/missionState";
import type { AnalysisResult, AnalysisState } from "../types";
import "../trip.css";

const EarthGlobe = lazy(() => import("../components/trip/EarthGlobe").then((module) => ({ default: module.EarthGlobe })));
const SpaceScene = lazy(() => import("../components/trip/SpaceScene").then((module) => ({ default: module.SpaceScene })));
const STORAGE_KEY = "nasa-lunar-trip-v1";
const stages: { id: TripStage; label: string }[] = [
  { id: "earth", label: "Departure" }, { id: "rocket", label: "Rocket" },
  { id: "moon", label: "Destination" }, { id: "landing", label: "Conditions" }, { id: "flight", label: "Flight" }, { id: "simulate", label: "Landing" }, { id: "reveal", label: "Overview" },
];
const facts = [
  "The Moon is about 384,400 km from Earth on average.",
  "The Moon rotates once in roughly the same time it takes to orbit Earth.",
  "The Moon has a very thin atmosphere called an exosphere.",
];
function Preparation({ departure, destination }: { departure: string; destination: string }) {
  const [fact, setFact] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setFact((index) => (index + 1) % facts.length), 6000); return () => window.clearInterval(timer); }, []);
  return <section className="trip-preparation" role="status" aria-live="polite"><RocketLaunch weight="light" className="trip-loading-rocket" aria-hidden="true" />
    <h2>Preparing mission preview</h2><p>{departure} → {destination}</p><p className="trip-fact">{facts[fact]}</p>
    <a href="https://science.nasa.gov/moon/facts/" target="_blank" rel="noreferrer">NASA Moon Facts</a></section>;
}
const sceneLoading = <div className="trip-scene-loading" role="status">Opening 3D view...</div>;

export function TripPage() {
  const [mission, dispatch] = useReducer(missionReducer, null, () => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* Private mode may disable storage. */ }
    return restoreMission(saved, launchSites.map((site) => site.id), rockets.map((rocket) => rocket.id));
  });
  const [liftoffUtc, setLiftoffUtc] = useState("");
  const [parkingAltitudeText,setParkingAltitudeText] = useState(String(mission.parkingAltitudeKm));
  const transferInput={departureUtc:mission.transferDepartureUtcTime,arrivalUtc:mission.utcTime,parkingAltitudeKm:parkingAltitudeText.trim()?Number(parkingAltitudeText):NaN};
  const transfer=useTransferCalculation(transferInput,mission.stage==="landing"||mission.stage==="flight");
  const changeParkingAltitude=(value:string)=>{setParkingAltitudeText(value);const altitude=Number(value);if(value.trim()&&Number.isFinite(altitude)&&altitude>=160&&altitude<=2000)dispatch({type:"parking-altitude",altitude});};
  const [tripMoonView, setTripMoonView] = useState<"globe" | "surface">("globe");
  const [query, setQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [coordinateText, setCoordinateText] = useState("");
  const [coordinateError, setCoordinateError] = useState("");
  const [showOtherLaunchers, setShowOtherLaunchers] = useState(() => {
    try {
      const saved = localStorage.getItem("clps_show_other_launchers");
      if (saved !== null) return saved === "true";
    } catch { /* Storage may be unavailable; keep the in-memory preference. */ }
    return true; // Always turned on by default
  });
  const toggleOtherLaunchers = (enabled: boolean) => {
    setShowOtherLaunchers(enabled);
    try {
      localStorage.setItem("clps_show_other_launchers", String(enabled));
    } catch { /* Storage may be unavailable; keep the in-memory preference. */ }
  };
  const [preview, setPreview] = useState<{ revision: number; state: AnalysisState; result: AnalysisResult | null; error?: string } | null>(null);
  const [storageNotice, setStorageNotice] = useState(false);
  const active = useRef<AbortController | null>(null);
  const controls = useRef<MoonControls | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const departure = launchSites.find((site) => site.id === mission.departureId);
  const rocket = rockets.find((item) => item.id === mission.rocketId);
  const landing = mission.landing;
  // One terrain lookup per landing point drives the elevation row and the terrain panel alike.
  const catalogue = useTerrainCatalogue(landing?.latitude ?? null, landing?.longitude ?? null);
  const elevation = pointElevation(catalogue.state);
  const currentPreview = preview?.revision === mission.revision ? preview : null;
  const analysis = (mission.stage === "flight" || mission.stage === "reveal") ? mission.result : currentPreview?.result ?? null;
  const allowedRockets = rockets.filter((item) => item.isNasa || showOtherLaunchers).sort((a, b) => Number(departure?.rockets.includes(b.id)) - Number(departure?.rockets.includes(a.id)));
  const filteredDepartures = launchSites.filter((site) => `${site.name} ${site.pad} ${site.country}`.toLowerCase().includes(query.toLowerCase()));
  const filteredDestinations = destinations.filter((site) => `${site.name} ${site.category}`.toLowerCase().includes(destinationQuery.toLowerCase()));
  // "Analyze landing" (preview) and "Plan this landing" without a reusable preview both show the loading screen.
  const loadingScreen = useLoadingScreen(currentPreview?.state === "loading" || mission.stage === "preparing");
  const { guide } = useVoiceGuide();
  const eventSerial = useRef(0);
  const stagePrompt = { earth: PROMPTS.departure, rocket: PROMPTS.rocket, moon: PROMPTS.destination, landing: PROMPTS.observation, preparing: null, flight: null, simulate: PROMPTS.simulate, reveal: PROMPTS.missionRecord }[mission.stage];
  // Key on the stage only: rerenders within a stage never repeat the prompt; a new stage replaces old speech.
  useAnnounce("stage", stagePrompt ? `trip:${mission.stage}` : null, stagePrompt);
  // On by default in the trip planner (after the stage is known, so it opens with the right prompt).
  useAutoEnableVoice();
  useCancelOnLeave();
  useEffect(() => { guide.cancel("explain"); }, [guide, mission.revision, analysis]);
  const stageIndex = mission.stage === "preparing" ? 3 : stages.findIndex((stage) => stage.id === mission.stage);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...mission, result: null, resultRevision: null, error: null }));
    } catch {
      // Storage availability is an external system status.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageNotice(true);
    }
  }, [mission]);
  useEffect(() => () => active.current?.abort(), [mission.revision]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); heading.current?.focus({ preventScroll: true }); }, [mission.stage]);
  const selectDeparture = useCallback((id: string) => {
    const site = launchSites.find((candidate) => candidate.id === id);
    if (site) dispatch({ type: "departure", id, compatibleRocketIds: site.rockets });
  }, []);
  const selectLocation = useCallback((location: MoonLocation) => {
    setCoordinateError("");
    const destination = destinations.find((site) => site.latitude === location.latitude && site.longitude === location.longitude);
    dispatch({ type: "landing", point: { ...location, name: location.name ?? destination?.name ?? "Selected Moon coordinate", destinationId: destination?.id } });
  }, []);
  const selectSite = useCallback((id: string) => {
    const site = destinations.find((candidate) => candidate.id === id);
    if (site) selectLocation({ latitude: site.latitude, longitude: site.longitude, name: site.name });
  }, [selectLocation]);
  /**
   * Arrival at a site with a measured Blender model: the globe zooms in from high above while the Blender terrain loads
   * hidden underneath; once both are done the view cross-fades to the terrain, whose camera dives to lander eye level.
   */
  const [arrival, setArrival] = useState<{ flightDone: boolean; ready: boolean } | null>(null);
  const markSurfaceReady = useCallback(() => setArrival((current) => current && { ...current, ready: true }), []);
  const beginArrival = useCallback((latitude: number, longitude: number) => {
    setArrival({ flightDone: false, ready: false });
    // Deferred so it replaces any fly-in the globe itself starts for the same click.
    window.setTimeout(() => {
      const arrived = () => setArrival((current) => current && { ...current, flightDone: true });
      if (controls.current) controls.current.zoomToLocation(latitude, longitude, arrived); else arrived();
      window.setTimeout(arrived, 5000);   // safety: never wait on the globe for longer than this
    }, 0);
  }, []);
  useEffect(() => {
    if (!arrival?.flightDone) return;
    const reveal = () => { setTripMoonView("surface"); setArrival(null); };
    if (arrival.ready) { reveal(); return; }
    const timer = window.setTimeout(reveal, 8000);   // slow download: reveal anyway; the dive starts once loaded
    return () => window.clearTimeout(timer);
  }, [arrival]);
  /** Destinations with a measured Blender model zoom into the 3D surface at lander eye level. */
  const openDestination = useCallback((id: string) => {
    const site = destinations.find((candidate) => candidate.id === id);
    if (!site) return;
    if (sceneForLanding(site.latitude, site.longitude)) {
      selectSite(id);
      if (tripMoonView === "globe") beginArrival(site.latitude, site.longitude);   // in the surface view the new site dives in by itself
    } else if (controls.current) controls.current.flyToSite(id);   // no surface model: keep the globe fly-in
    else selectSite(id);
  }, [selectSite, beginArrival, tripMoonView]);
  /** Globe clicks: a point with a measured Blender model also zooms into the eye-level surface view. */
  const pickOnGlobe = useCallback((location: MoonLocation) => {
    selectLocation(location);
    if (sceneForLanding(location.latitude, location.longitude)) beginArrival(location.latitude, location.longitude);
  }, [selectLocation, beginArrival]);
  function enterCoordinates(event: React.FormEvent) {
    event.preventDefault();
    const parts = coordinateText.split(",").map((part) => part.trim());
    const numbers = parts.map(Number);
    if (parts.length !== 2 || parts.some((part) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(part)) || !numbers.every(Number.isFinite) || Math.abs(numbers[0]!) > 90 || Math.abs(numbers[1]!) > 180) {
      setCoordinateError("Enter latitude [-90,90], longitude [-180,180], separated by a comma."); return;
    }
    setCoordinateError(""); selectLocation({ latitude: numbers[0]!, longitude: numbers[1]! });
  }
  async function analyze(finalize: boolean) {
    if (!landing || !missionReady(mission)) return;
    if (finalize && currentPreview?.state === "success" && currentPreview.result) {
      // Inputs are unchanged since the preview (same revision): reuse it instead of recalculating,
      // so an upstream failure now cannot block a result that was just displayed.
      active.current?.abort();
      dispatch({ type: "plan", revision: currentPreview.revision, result: currentPreview.result });
      return;
    }
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const revision = mission.revision;
    const event = ++eventSerial.current;
    guide.say("analysis", `trip:analysis:start:${event}`, PROMPTS.analysisStart);
    if (finalize) dispatch({ type: "prepare" });
    else setPreview({ revision, state: "loading", result: null });
    const matchedSite = landingSites.find((site) => site.latitude === landing.latitude && site.longitude === landing.longitude);
    try {
      const result = await getAnalysis(matchedSite?.id ?? "custom", matchedSite ? null : landing,
        mission.utcTime, controller.signal);
      if (controller.signal.aborted) return;
      if (finalize) dispatch({ type: "result", revision, result });
      else setPreview({ revision, state: "success", result });
      // A finalized plan moves to the mission record, whose stage prompt announces completion.
      if (!finalize) guide.say("analysis", `trip:analysis:done:${event}`, PROMPTS.tripDone);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Analysis unavailable. Please retry.";
      if (finalize) dispatch({ type: "error", revision, error: message });
      else setPreview({ revision, state: "error", result: null, error: message });
      guide.say("analysis", `trip:analysis:fail:${event}`, PROMPTS.analysisFailed);
    }
  }
  function go(stage: TripStage) { active.current?.abort(); dispatch({ type: "stage", stage }); }
  const title = mission.stage === "earth" ? "Where will you leave from?" : mission.stage === "rocket" ? "Choose your ride." : mission.stage === "moon" ? "Find your place on the Moon." : mission.stage === "flight" ? "Your journey to the Moon." : mission.stage === "simulate" ? "Now, land it." : mission.stage === "reveal" ? "Your mission. In context." : "Look before you land.";

  return <article className="trip-page">
    <LoadingScreen visible={loadingScreen.visible} ready={loadingScreen.ready} onDismiss={loadingScreen.dismiss} message="Analyzing your landing site" />
    <div className="trip-topline">
      <Link to="/"><ArrowLeft /> Back to website</Link>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <Link to="/planner" style={{ color: "#38bdf8", textDecoration: "none", fontSize: "0.82rem", fontWeight: 600 }}>
          🚀 Mission Phase Planner
        </Link>
        <span>TEAM BRAHMOS / MISSION PROTOTYPE</span>
      </div>
    </div>
    <nav className="trip-progress" aria-label="Trip progress">{stages.map((stage, index) => <button key={stage.id} type="button" aria-current={mission.stage === stage.id ? "step" : undefined}
      disabled={mission.stage === "preparing" || index > stageIndex} onClick={() => go(stage.id)}>{index < stageIndex ? <Check aria-hidden="true" /> : <span className="trip-step-number">{index + 1}</span>}{stage.label}</button>)}</nav>
    {storageNotice && <p className="trip-notice">Browser storage is unavailable. Your choices will last only while this planner is open.</p>}
    {mission.stage === "preparing" ? <><Preparation departure={departure?.name ?? "Earth"} destination={landing?.name ?? "Moon"} /><button className="trip-secondary" onClick={() => go("landing")}>Cancel / edit landing</button></> : <>
      <header className="trip-heading"><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{mission.stage === "earth" ? "One departure. A whole world of possibilities." : mission.stage === "rocket" ? `${departure?.name} / ${departure?.pad}` : `${departure?.name} → ${rocket?.name} → ${landing?.name ?? "Moon destination"}`}</p></header>
      {mission.stage === "earth" && <div className="trip-layout">
        <div className="trip-visual"><Suspense fallback={sceneLoading}><EarthGlobe selectedId={mission.departureId} onSelect={selectDeparture} /></Suspense></div>
        <aside className="trip-panel"><label className="trip-field">Find a launch site<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Country, spaceport or launch pad" /></label>
          <div className="trip-site-list">{filteredDepartures.map((site) => <button key={site.id} aria-pressed={site.id === mission.departureId} className="trip-site-option" onClick={() => selectDeparture(site.id)}>
            <span>{site.country}{site.historical ? " / historical" : ""}</span><strong>{site.name}</strong><small>{site.pad}</small></button>)}</div>
          {!filteredDepartures.length && <p role="status">No matching launch sites. Try a country or spaceport name.</p>}
          {departure && <div className="trip-selected"><strong>{departure.name} / {departure.pad}</strong><p>{departure.latitude.toFixed(2)}°, {departure.longitude.toFixed(2)}°</p><a href={departure.source} target="_blank" rel="noreferrer">Spaceport reference <ArrowUpRight /></a></div>}
          <label className="trip-field">Optional liftoff date and time (UTC)<input type="datetime-local" value={liftoffUtc} onChange={event => setLiftoffUtc(event.target.value)} /></label>
          {departure && <LaunchWeatherPanel key={departure.id} siteId={departure.id} liftoffUtc={liftoffUtc} />}
          <p className="trip-note">Pins are approximate prototype locations, not surveyed pad coordinates. Compatibility here is a catalogue association, not a launch approval.</p>
          <button className="trip-primary" disabled={!departure} onClick={() => go("rocket")}>Depart from here <ArrowRight /></button>
        </aside></div>}
      {mission.stage === "rocket" && <>
        <div className="trip-layout trip-rocket-layout"><div className="trip-visual">{rocket?.model ? <Suspense fallback={sceneLoading}><SpaceScene key={rocket.id} modelUrl={rocket.model} modelName={rocket.name} modelCredit={rocket.modelCredit} /></Suspense> : <div className="trip-model-pending"><RocketLaunch weight="thin" /><h2>{rocket?.name ?? "Choose a rocket below"}</h2><p>{rocket ? "Unavailable: no 3D model is supplied for this launcher." : "Select a launcher from the gallery below."}</p></div>}<p className="trip-canvas-disclaimer">3D visual models are cosmetic display representations and are strictly decoupled from numerical preflight flight calculations and trajectory simulations.</p></div>
          <aside className="trip-panel"><p className="trip-section-label">Rocket selection</p><h2>{rocket?.name ?? "Choose a launcher"}</h2>{rocket && <><p>{rocket.category}</p><p>{rocket.mission}</p></>}<p className="trip-note">{rocket?.note ?? "The catalogue includes historical and conceptual choices. It does not establish a feasible crewed flight."}</p>
            {rocket?.specs && (
              <dl className="trip-stat-list rocket-specs-list" aria-label="Vehicle launch specifications">
                <div><dt>Payload to TLI</dt><dd>{rocket.specs.payloadTli}</dd></div>
                <div><dt>Liftoff Thrust</dt><dd>{rocket.specs.liftoffThrust}</dd></div>
                <div><dt>Stages</dt><dd>{rocket.specs.stages}</dd></div>
                <div><dt>Propellants</dt><dd>{rocket.specs.propellants}</dd></div>
              </dl>
            )}
            {rocket && <><a href={rocket.source} target="_blank" rel="noreferrer">Source / model reference <ArrowUpRight /></a>{!departure?.rockets.includes(rocket.id) && <p className="trip-notice">Concept selection: this launcher is not associated with the selected pad in our catalogue. No compatibility is implied.</p>}</>}
            {rocket?.modelCredit.startsWith("John Morris") && <p className="trip-note">3D model by <a href="https://github.com/johnmorrisdotca/uchusen-rockets" target="_blank" rel="noreferrer">John Morris / Uchusen Rockets</a> · <a href="/third-party-licenses/uchusen-rockets-MIT.txt" target="_blank" rel="noreferrer">MIT license</a>.</p>}
            <p className="trip-note">Injection Δv is calculated from your transfer dates in the Flight step. Vehicle performance, staging and descent Δv are not assessed.</p>
            <button className="trip-primary" disabled={!rocket} onClick={() => go("moon")}>Choose rocket <ArrowRight /></button><button className="trip-secondary" onClick={() => go("earth")}>Back to Earth</button></aside></div>
        <div className="trip-rocket-gallery" aria-label="Rocket model catalogue">{allowedRockets.map((item) => <button key={item.id} aria-pressed={mission.rocketId === item.id} onClick={() => dispatch({ type: "rocket", id: item.id })}><RocketLaunch weight="light" /><span>{item.modelLabel}</span><strong>{item.name}</strong><small>{item.category}</small></button>)}</div>
        <label className="trip-catalogue-toggle"><input type="checkbox" checked={showOtherLaunchers} onChange={(event) => toggleOtherLaunchers(event.target.checked)} />Include international and commercial catalogue entries</label>
        <p className="trip-note">The collection includes NASA meshes and clearly labelled community or project reference models. Pad associations are historical context, not flight approval.</p>
      </>}
      {mission.stage === "moon" && <div className="trip-layout"><div className="trip-visual trip-moon-visual">
        <div className="visual-view-header">
          <div className="visual-view-toggle" role="group" aria-label="Moon view selector">
            <button
              type="button"
              className={`visual-toggle-btn ${tripMoonView === "globe" ? "active" : ""}`}
              onClick={() => setTripMoonView("globe")}
            >
              🌐 Global Moon Orbit
            </button>
            <button
              type="button"
              className={`visual-toggle-btn ${tripMoonView === "surface" ? "active" : ""}`}
              onClick={() => setTripMoonView("surface")}
            >
              🏔️ 3D Surface Terrain
            </button>
          </div>
          {tripMoonView === "surface" && (
            <span className="visual-view-badge">Continuous Lunar Topography (LOLA/Kaguya DEM Preview)</span>
          )}
        </div>

        {tripMoonView === "globe" && (
          <>
            <div className="trip-moon-canvas"><MoonMap onLocationSelect={pickOnGlobe} onSiteSelect={openDestination} selectedLocation={landing} showGrid={false} showAxis={false} controlsRef={controls} /></div>
            <div className="trip-map-tools">

              <button onClick={() => controls.current?.zoom(1)} aria-label="Zoom in">+</button>
              <button onClick={() => controls.current?.zoom(-1)} aria-label="Zoom out">−</button>
              <button onClick={() => controls.current?.setView("near")}>Reset view</button>
            </div>
          </>
        )}
        {(tripMoonView === "surface" || arrival) && (
          <div className={`trip-surface-full-view ${tripMoonView === "globe" ? "trip-surface-preload" : "trip-surface-reveal"}`} aria-hidden={tripMoonView === "globe" || undefined}>
            <LocalSurfacePane
              latitude={landing?.latitude ?? 26.1322}
              longitude={landing?.longitude ?? 3.6339}
              observationTime={mission.utcTime}
              onPick={(pt) => {
                selectLocation({ latitude: pt.latitude, longitude: pt.longitude, name: pt.name });
              }}
              onOpenGlobal={() => setTripMoonView("globe")}
              initialMode="eye"
              diveWhen={tripMoonView === "surface"}
              onReady={markSurfaceReady}
            />
          </div>
        )}
      </div>
        <aside className="trip-panel"><label className="trip-field">Find a Moon destination<input value={destinationQuery} onChange={(event) => setDestinationQuery(event.target.value)} placeholder="Apollo, Lunokhod, Athena..." /></label>
          <div className="trip-site-list">{filteredDestinations.map((site) => <button className="trip-site-option" key={site.id} aria-pressed={landing?.destinationId === site.id} onClick={() => openDestination(site.id)}><span>{site.category}</span><strong>{site.name}</strong><small>{formatCoordinate(site.latitude, "lat")} / {formatCoordinate(site.longitude, "lon")}</small></button>)}</div>
          {!filteredDestinations.length && <p role="status">No matching destinations. Try a mission name or enter coordinates below.</p>}
          <form onSubmit={enterCoordinates}><label className="trip-field">Or enter exact lunar coordinates<input value={coordinateText} onChange={(event) => setCoordinateText(event.target.value)} placeholder="Latitude, longitude" aria-describedby="trip-coordinate-note" /></label><button className="trip-secondary" type="submit">Select coordinates</button><p id="trip-coordinate-note" className="trip-note" role={coordinateError ? "alert" : undefined}>{coordinateError || "Planetocentric latitude, east-positive longitude."}</p></form>
          {landing && <div className="trip-selected"><strong>{landing.name}</strong><p>{landing.latitude.toFixed(6)}°, {landing.longitude.toFixed(6)}°</p></div>}
          {landing && <TerrainContext catalogue={catalogue.state} onRetry={catalogue.retry} />}
          <div className="trip-unavailable" style={{ borderLeftColor: "var(--accent)" }}><CheckCircle weight="fill" color="#a2ecd3" /><div><strong>Topographic Navigation Mode</strong><p>Calibrated coordinate projection with real-time NAIF SPICE solar lighting and Earth line-of-sight vectors.</p></div></div>
          <button className="trip-primary" disabled={!landing} onClick={() => go("landing")}>Review landing point <ArrowRight /></button><button className="trip-secondary" onClick={() => go("rocket")}>Change rocket</button></aside></div>}
      {mission.stage === "simulate" && landing && rocket && <LandingSimPage key={`${landing.latitude},${landing.longitude}:${rocket.id}`} rocket={rocket}
        landing={{ latitude: landing.latitude, longitude: landing.longitude, name: landing.name ?? "your landing point" }}
        onBack={() => go("flight")} onContinue={() => go("reveal")} />}
      {(mission.stage === "landing" || mission.stage === "flight" || mission.stage === "reveal") && landing && <>
        <div className="trip-layout">
          <div className="trip-visual">
            {mission.stage === "flight" && departure ? (
              <div className="trip-space-scene trip-space-scene-mission">
                <Suspense fallback={sceneLoading}><SpaceScene key={`${transfer.key}:${mission.stage}:${rocket?.id}`} mission transfer={transfer.data} modelUrl={rocket?.model??undefined} modelName={rocket?.name} modelCredit={rocket?.modelCredit} /></Suspense>
                {transfer.loading && <p className="trip-scene-message" role="status">Calculating the mission flight…</p>}
              </div>
            ) : (
              <div className="trip-landing-presentation">
                <img src="/lunar-color-map.webp" alt="NASA lunar color map. Overview only, not a detailed scene of the selected point." />
                <GlobeHemisphereWest weight="thin" />
                <span>Selected lunar point</span>
                <strong>{formatCoordinate(landing.latitude, "lat")}<br />{formatCoordinate(landing.longitude, "lon")}</strong>
                <p>{landing.name}</p>
              </div>
            )}
          </div>
          <aside className="trip-panel">
            {mission.stage !== "reveal" && (
              <TransferPlanner input={transferInput} altitudeText={parkingAltitudeText} calculation={transfer}
                onDeparture={time=>dispatch({type:"transfer-departure",time})} onArrival={time=>dispatch({type:"time",time})}
                onAltitudeText={changeParkingAltitude} frozen={mission.stage==="flight"} />
            )}
            <p className="trip-section-label">{mission.stage === "reveal" ? "Mission record" : mission.stage === "flight" ? "Lunar transfer" : "Confirm your selection"}</p>
            <h2>{landing.name}</h2>
            <dl className="trip-stat-list"><div><dt>Departure</dt><dd>{departure?.name} / {departure?.pad}</dd></div><div><dt>Rocket</dt><dd>{rocket?.name}</dd></div><div><dt>Latitude</dt><dd>{landing.latitude.toFixed(6)}°</dd></div><div><dt>Longitude</dt><dd>{landing.longitude.toFixed(6)}° east</dd></div><div><dt>Point elevation</dt><dd>{elevation.text}{elevation.state === "unavailable" ? " (see terrain information)" : ""}</dd></div></dl>
            {mission.stage !== "landing" && <p>{mission.utcTime}</p>}
            <p className="trip-note">Surface observation reference: <time dateTime={mission.utcTime}>{mission.utcTime}</time>. This uses the arrival epoch for planning; it is not a predicted touchdown time.</p>
            <p className="trip-note">Chosen coordinate is retained exactly. Terrain source frames and the ephemeris frame have alignment uncertainty; a single point height is not a landing-safety claim.</p>
            {mission.error && <p role="alert" className="trip-error">{mission.error}</p>}
            {mission.stage === "landing" ? <><button className="trip-secondary" disabled={currentPreview?.state === "loading"} onClick={() => void analyze(false)}>{currentPreview?.state === "loading" ? "Analyzing..." : currentPreview?.state === "error" ? "Retry analysis" : "Analyze landing"}</button><button className="trip-primary" disabled={!currentPreview?.result} onClick={() => void analyze(true)}>Continue to flight <ArrowRight /></button><button className="trip-secondary" onClick={() => go("moon")}>Change landing point</button></> : <>{mission.stage === "flight" ? <button className="trip-primary" disabled={!transfer.data || transfer.loading} onClick={() => go("simulate")}>Continue to landing <ArrowRight /></button> : <button className="trip-secondary" onClick={() => go("flight")}>Replay flight</button>}<p className="trip-note">The mission animation uses a preliminary date-based transfer. Launch-window feasibility, selected vehicle performance, capture and descent are not validated.</p><button className="trip-secondary" onClick={() => go("landing")}>Edit mission dates</button><button className="trip-secondary" onClick={() => go("earth")}>Edit departure</button><button className="trip-secondary" onClick={() => go("rocket")}>Change rocket</button><button className="trip-primary" onClick={() => go("moon")}>Explore landing site <ArrowRight /></button></>}
            {analysis && <MissionDossierModal latitude={landing.latitude} longitude={landing.longitude} start={mission.utcTime}
              launchSiteId={departure?.id} launchVehicle={rocket?.name} liftoffUtc={liftoffUtc ? `${liftoffUtc}:00Z` : undefined} missionName={landing.name} />}
            <TerrainContext catalogue={catalogue.state} onRetry={catalogue.retry} />
          </aside></div>

        <div className="trip-analysis"><ConditionsPanel showDossier={false} conditions={analysis?.conditions ?? null} state={mission.stage === "flight" || mission.stage === "reveal" ? "success" : currentPreview?.state ?? "idle"} observationTime={mission.utcTime} errorMessage={currentPreview?.error} terrain={analysis?.terrain ?? null} siteId={landing.destinationId} latitude={landing.latitude} longitude={landing.longitude}
            onExplain={analysis && landing ? () => guide.say("explain", `trip:explain:${analysis.conditions.time}`, explainResult({ siteId: landingSites.find((site) => site.latitude === landing.latitude && site.longitude === landing.longitude)?.id ?? null, siteName: landing.name ?? "Selected point", conditions: analysis.conditions, terrain: analysis.terrain }), { force: true, explicit: true }) : undefined} />
          <div><VisibilityTimeline data={analysis?.conditions ?? null} summary={analysis?.summary ?? null} sampleCount={analysis?.samples.length ?? 0} /></div></div>
      </>}
    </>}
    <footer className="trip-footer"><p>Exploration prototype. Geometric visibility is not a communications link budget or landing certification.</p><button onClick={() => { active.current?.abort(); dispatch({ type: "reset" }); setLiftoffUtc(""); setParkingAltitudeText("200"); }}>Start a new trip</button></footer>
  </article>;
}
