import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";

const ExplorerPage = lazy(() => import("./pages/ExplorerPage").then((module) => ({ default: module.ExplorerPage })));
const MissionsPage = lazy(() => import("./pages/MissionsPage").then((module) => ({ default: module.MissionsPage })));
const TimelinePage = lazy(() => import("./pages/TimelinePage").then((module) => ({ default: module.TimelinePage })));
const AboutPage = lazy(() => import("./pages/AboutPage").then((module) => ({ default: module.AboutPage })));
const LandingSimPage = lazy(() => import("./pages/LandingSimPage").then((module) => ({ default: module.LandingSimPage })));
const TripPage = lazy(() => import("./pages/TripPage").then((module) => ({ default: module.TripPage })));
const DiscoverPage = lazy(() => import("./discover20261114/DiscoverPage20261114").then((module) => ({ default: module.DiscoverPage20261114 })));
const GamePage = lazy(() => import("./pages/GamePage").then((module) => ({ default: module.GamePage })));
const MissionPhasePlannerPage = lazy(() => import("./pages/MissionPhasePlannerPage").then((module) => ({ default: module.MissionPhasePlannerPage })));

export function App() {
  return (
    <Suspense fallback={<div className="route-loading" role="status"><span className="route-loading-orbit" aria-hidden="true" />Opening your lunar workspace...</div>}>
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/trip" element={<TripPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/landing" element={<LandingSimPage />} />
        <Route path="/planner" element={<MissionPhasePlannerPage />} />
        <Route path="/phases" element={<MissionPhasePlannerPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
