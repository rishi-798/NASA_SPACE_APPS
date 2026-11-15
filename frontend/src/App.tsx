import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AboutPage } from "./pages/AboutPage";
import { ExplorerPage } from "./pages/ExplorerPage";
import { MissionsPage } from "./pages/MissionsPage";
import { TimelinePage } from "./pages/TimelinePage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate replace to="/explorer" />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate replace to="/explorer" />} />
      </Route>
    </Routes>
  );
}
