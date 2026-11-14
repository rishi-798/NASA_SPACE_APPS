// Added 2026-11-14: independent media workspace beside the lunar tools.
import { Link } from "react-router-dom";
import { useState } from "react";
import { RouteIntro } from "../components/ui/RouteIntro";
import { AstronomyFeed20261114 } from "./AstronomyFeed20261114";
import { MediaDialog20261114 } from "./MediaDialog20261114";
import { RoverGallery20261114 } from "./RoverGallery20261114";
import type { MediaEntry } from "./mediaClient20261114";
import "./discovery20261114.css";

export function DiscoverPage20261114() {
  const [active, setActive] = useState<MediaEntry | null>(null);
  const [view, setView] = useState<"apod" | "rovers">("apod");
  return (
    <article className="editorial-page media-workspace" aria-label="NASA media workspace">
      <RouteIntro
        eyebrow="NASA media / discovery"
        title={<>A WIDER<br />UNIVERSE.</>}
        description="Astronomy images, rover photography and NASA's image library, together with a personal collection saved on this device."
        side={<Link className="primary-text-link" to="/explorer">Return to the Moon</Link>}
      />
      <nav className="media-nav" aria-label="Media collections">
        <button aria-pressed={view === "apod"} onClick={() => setView("apod")}>Astronomy</button>
        <button aria-pressed={view === "rovers"} onClick={() => setView("rovers")}>Rover images</button>
      </nav>
      {view === "apod" ? <AstronomyFeed20261114 onOpen={setActive} /> : <RoverGallery20261114 onOpen={setActive} />}
      {active && <MediaDialog20261114 key={active.id} entry={active} onDismiss={() => setActive(null)} />}
    </article>
  );
}
