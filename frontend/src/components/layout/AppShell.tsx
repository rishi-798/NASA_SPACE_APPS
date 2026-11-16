import { ArrowUpRight } from "@phosphor-icons/react";
import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Navigation } from "../navigation/Navigation";
import { MissionControlDock } from "../voice/MissionControlDock";
import { VoiceGuideProvider } from "../voice/VoiceGuideProvider";
import { OfflineNotice } from "../game/OfflineNotice";

export function AppShell() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const name = pathname === "/" ? "The Moon. In context." : pathname.slice(1).replace(/^./, (letter) => letter.toUpperCase());
    document.title = `${name} | CLPS Lunar Browser`;
  }, [pathname]);
  return (
    <VoiceGuideProvider>
    <div className={`app-shell${pathname === "/" ? " app-shell-home" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <OfflineNotice />
      <Navigation />
      <main id="main-content" className="page-frame" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-top">
          <Link className="footer-wordmark" to="/">CLPS<span> / LUNAR</span></Link>
          <nav aria-label="Footer navigation">
            <Link to="/trip">Plan a trip</Link>
            <Link to="/explorer">Explorer <ArrowUpRight aria-hidden="true" /></Link>
            <Link to="/missions">Missions</Link>
            <Link to="/about">About</Link>
            <Link to="/planner">Flight phases</Link>
            <Link to="/game">Asteroid Game</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>NASA SPACE APPS 2026 · INDEPENDENT PROJECT</span>
          <span>NOT AN OFFICIAL NASA PRODUCT</span>
        </div>
      </footer>
      <MissionControlDock />
    </div>
    </VoiceGuideProvider>
  );
}
