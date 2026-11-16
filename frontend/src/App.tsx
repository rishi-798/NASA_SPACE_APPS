import { lazy, Suspense, useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";

function CinematicHome() {
  const { search, hash } = useLocation();
  useEffect(() => {
    window.location.replace(`/brahmos/index.html${search}${hash}`);
  }, [search, hash]);
  return <p role="status">Opening BRAHMOS… <a href={`/brahmos/index.html${search}${hash}`}>Continue to home</a></p>;
}

const ExplorerPage = lazy(() => import("./pages/ExplorerPage").then((module) => ({ default: module.ExplorerPage })));
const MissionsPage = lazy(() => import("./pages/MissionsPage").then((module) => ({ default: module.MissionsPage })));
const TimelinePage = lazy(() => import("./pages/TimelinePage").then((module) => ({ default: module.TimelinePage })));
const AboutPage = lazy(() => import("./pages/AboutPage").then((module) => ({ default: module.AboutPage })));
const TripPage = lazy(() => import("./pages/TripPage").then((module) => ({ default: module.TripPage })));
const DiscoverPage = lazy(() => import("./discover20261114/DiscoverPage20261114").then((module) => ({ default: module.DiscoverPage20261114 })));
const GamePage = lazy(() => import("./pages/GamePage").then((module) => ({ default: module.GamePage })));
const MissionPhasePlannerPage = lazy(() => import("./pages/MissionPhasePlannerPage").then((module) => ({ default: module.MissionPhasePlannerPage })));

function UnknownRoute() {
  const location = useLocation();
  return (
    <section className="route-not-found" aria-labelledby="route-not-found-title">
      <p className="eyebrow">ROUTE NOT FOUND</p>
      <h1 id="route-not-found-title">This page isn’t in the flight plan.</h1>
      <p>The address <code>{location.pathname}</code> doesn’t match a page in this site.</p>
      <Link to="/">Return to the lunar browser</Link>
    </section>
  );
}

function WorkspaceRoute() {
  const { search, hash } = useLocation();
  const query = new URLSearchParams(search);
  const routes: Record<string, string> = { analyze: "/explorer", trip: "/trip", phases: "/planner", missions: "/missions" };
  const route = routes[query.get("view") ?? "analyze"];
  if (!route) return <UnknownRoute />;
  query.delete("view");
  query.set("ui", "brahmos");
  return <Navigate replace to={`${route}?${query}${hash}`} />;
}

export function App() {
  return (
    <Suspense fallback={<div className="route-loading" role="status"><span className="route-loading-orbit" aria-hidden="true" />Opening your lunar workspace...</div>}>
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<CinematicHome />} />
        <Route path="/index.html" element={<CinematicHome />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="/workspace.html" element={<WorkspaceRoute />} />
        <Route path="/analyze" element={<Navigate replace to="/explorer" />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/trip" element={<TripPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/landing" element={<Navigate replace to="/trip" />} />
        <Route path="/planner" element={<MissionPhasePlannerPage />} />
        <Route path="/phases" element={<MissionPhasePlannerPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="*" element={<UnknownRoute />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
