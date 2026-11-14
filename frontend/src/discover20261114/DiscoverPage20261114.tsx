// Added 2026-11-14: independent media workspace beside the lunar tools.
import { Link } from "react-router-dom";
import { RouteIntro } from "../components/ui/RouteIntro";

export function DiscoverPage20261114() {
  return (
    <article className="editorial-page" aria-label="NASA media workspace">
      <RouteIntro
        eyebrow="NASA media / discovery"
        title={<>A WIDER<br />UNIVERSE.</>}
        description="Astronomy images, rover photography and NASA's image library, together with a personal collection saved on this device."
        side={<Link className="primary-text-link" to="/explorer">Return to the Moon</Link>}
      />
      <section className="integrity-note" aria-labelledby="discovery-status">
        <h2 id="discovery-status">Your media workspace</h2>
        <p>The media tools are being built independently alongside the lunar browser.</p>
      </section>
    </article>
  );
}
