import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";

const ExplorerPage = lazy(() => import("./pages/ExplorerPage").then((module) => ({ default: module.ExplorerPage })));
const MissionsPage = lazy(() => import("./pages/MissionsPage").then((module) => ({ default: module.MissionsPage })));
const TimelinePage = lazy(() => import("./pages/TimelinePage").then((module) => ({ default: module.TimelinePage })));
const AboutPage = lazy(() => import("./pages/AboutPage").then((module) => ({ default: module.AboutPage })));

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
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
