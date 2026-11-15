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
          horizon; other sites and map coordinates use a flat horizon. Daily visibility
          windows use 30-minute samples and are not flight-certified predictions.
          Atmospheric illustrations on the home page are AI-generated artwork, not
          scientific imagery or photographs of the named landing sites.
        </p>
      </section>
    </article>
  );
}
