import { Outlet } from "react-router-dom";
import { Navigation } from "../navigation/Navigation";

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="ambient-grid" aria-hidden="true" />
      <div className="ambient-orbit" aria-hidden="true" />
      <Navigation />
      <main id="main-content" className="page-frame">
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>CLPS LUNAR BROWSER</span>
        <span>NASA SPACE APPS 2026 · INDEPENDENT PROJECT</span>
      </footer>
    </div>
  );
}
