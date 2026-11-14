// Added 2026-11-14: independent media workspace beside the lunar tools.
import { Link } from "react-router-dom";
import { useState } from "react";
import { RouteIntro } from "../components/ui/RouteIntro";
import { AstronomyFeed20261114 } from "./AstronomyFeed20261114";
import { MediaDialog20261114 } from "./MediaDialog20261114";
import type { MediaEntry } from "./mediaClient20261114";
import "./discovery20261114.css";

export function DiscoverPage20261114() {
  const [active, setActive] = useState<MediaEntry | null>(null);
  return (
    <article className="editorial-page media-workspace" aria-label="NASA media workspace">
      <RouteIntro
        eyebrow="NASA media / discovery"
        title={<>A WIDER<br />UNIVERSE.</>}
        description="Astronomy images, rover photography and NASA's image library, together with a personal collection saved on this device."
        side={<Link className="primary-text-link" to="/explorer">Return to the Moon</Link>}
      />
      <AstronomyFeed20261114 onOpen={setActive} />
      {active && <MediaDialog20261114 key={active.id} entry={active} onDismiss={() => setActive(null)} />}
    </article>
  );
}
