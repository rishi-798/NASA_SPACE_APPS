import { ArrowRight, Broadcast, Mountains, SunHorizon } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { RouteIntro } from "../components/ui/RouteIntro";

const flow = [
  { title: "Solar vector", copy: "Azimuth, elevation, and above-horizon visibility.", Icon: SunHorizon },
  { title: "Earth link", copy: "Communications line-of-sight from the selected site.", Icon: Broadcast },
  { title: "Terrain profile", copy: "Local obstruction context when a horizon profile exists.", Icon: Mountains },
];

export function AboutPage() {
  return (
    <article className="editorial-page about-page">
      <RouteIntro
        eyebrow="Why this exists"
        title={<>LOOK CLOSER.<br />GO FURTHER.</>}
        description="CLPS Lunar Browser brings Rishi's interactive Moon map and Suhas's visibility backend together. Choose a landing site and UTC timestamp to explore sunlight, Earth visibility, and terrain context."
        side={<Link className="primary-text-link" to="/explorer">Open Explorer <ArrowRight /></Link>}
      />

      <section className="system-flow" aria-labelledby="system-flow-title">
        <div className="system-flow-lead">
          <p className="eyebrow">Analysis model</p>
          <h2 id="system-flow-title">One observation.<br />Three operational questions.</h2>
        </div>
        <div className="system-flow-list">
          {flow.map(({ title, copy, Icon }) => (
            <article key={title}>
              <Icon weight="light" aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="integrity-note">
        <p>
          This is an independent NASA Space Apps 2026 project and not an official NASA
          product. Lunar imagery is credited to NASA’s Scientific Visualization Studio
          and the Lunar Reconnaissance Orbiter program. Suhas’s backend calculates
          geometric Sun and Earth positions using NAIF SPICE. Athena uses a LOLA terrain
          horizon. Other coordinates use an available or generated LOLA profile, or an
          explicitly labelled flat-horizon fallback. Visibility windows report their
          sampling interval and are not flight-certified predictions. Surface rocks
          and fine relief are illustrative; they do not establish local landing safety.
        </p>
      </section>
      <section className="integrity-note" aria-labelledby="data-sources-title">
        <h2 id="data-sources-title">Data and availability</h2>
        <p><a href="https://naif.jpl.nasa.gov/" target="_blank" rel="noreferrer">NASA/JPL NAIF SPICE</a> supplies the observation-geometry toolkit. The backend uses DE440s ephemerides for Sun, Earth and Moon positions.</p>
        <p>The <a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">NASA CGI Moon Kit</a> supplies LRO-derived color and displacement maps. A global map is context, not a photograph of the selected landing site.</p>
        <p>Point elevations and regional ranges are shown only when the terrain service returns them. Missing samples, unavailable weather access and uncomputed assessments are labelled explicitly.</p>
        <p>Trip transfers use an Earth-centered two-body approximation. Lunar capture, descent, launch-site accessibility and vehicle capability are not validated.</p>
      </section>
    </article>
  );
}
