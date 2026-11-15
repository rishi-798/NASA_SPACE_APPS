// Added 2026-11-14: independent media workspace beside the lunar tools.
import { Link } from "react-router-dom";
import { useState } from "react";
import { RouteIntro } from "../components/ui/RouteIntro";
import { AstronomyFeed20261114 } from "./AstronomyFeed20261114";
import { MediaDialog20261114 } from "./MediaDialog20261114";
import { RoverGallery20261114 } from "./RoverGallery20261114";
import { LibrarySearch20261114 } from "./LibrarySearch20261114";
import { CollectionDrawer20261114 } from "./CollectionDrawer20261114";
import { useCollection20261114 } from "./useCollection20261114";
import type { MediaEntry } from "./mediaClient20261114";
import "./discovery20261114.css";

export function DiscoverPage20261114() {
  const [active, setActive] = useState<MediaEntry | null>(null);
  const [view, setView] = useState<"apod" | "rovers" | "library">("apod");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const collection = useCollection20261114();
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
        <button aria-pressed={view === "library"} onClick={() => setView("library")}>NASA library</button>
        <button className="media-saved-trigger" onClick={() => setDrawerOpen(true)}>Saved images ({collection.items.length})</button>
      </nav>
      {collection.notice && !active && !drawerOpen && <p className="media-notice" role="status">{collection.notice}</p>}
      {view === "apod" && <AstronomyFeed20261114 onOpen={setActive} />}
      {view === "rovers" && <RoverGallery20261114 onOpen={setActive} />}
      {view === "library" && <LibrarySearch20261114 onOpen={setActive} />}
      {active && <MediaDialog20261114 key={active.id} entry={active} onDismiss={() => setActive(null)}
        saved={collection.items.some(item => item.id === active.id)} onToggle={() => collection.toggle(active)} notice={collection.notice} />}
      {drawerOpen && <CollectionDrawer20261114 items={collection.items} onDismiss={() => setDrawerOpen(false)}
        onOpen={entry => { setDrawerOpen(false); setActive(entry); }} onRemove={collection.toggle} />}
    </article>
  );
}
