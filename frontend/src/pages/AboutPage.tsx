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
        <h2 id="data-sources-title">Scientific Specifications & Data Sources</h2>
        <p><strong>Planetary Reference Frame:</strong> Observation vectors are computed in the IAU <code>MOON_ME_DE440_ME421</code> mean Earth/polar axis selenographic reference frame with mean lunar radius R = 1737.4 km and planetocentric east-positive selenographic coordinates.</p>
        <p><strong>Ephemeris Toolkit:</strong> Powered by <a href="https://naif.jpl.nasa.gov/" target="_blank" rel="noreferrer">NASA/JPL NAIF SPICE</a> with the <code>de440s.bsp</code> planetary ephemeris kernel, <code>naif0012.tls</code> leapseconds kernel, and <code>pck00010.tpc</code> orientation kernel.</p>
        <p><strong>Topographic Horizon Modeling:</strong> Horizon profiles evaluate 720 azimuthal bins (0.5° angular step) across a 40 km radial baseline derived from merged LOLA GDR and Kaguya LALT digital elevation models (DEM) for an observer mast elevation of 2.0 m above local surface datum.</p>
        <p><strong>Visual Mapping:</strong> The <a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">NASA SVS CGI Moon Kit</a> supplies LRO LROC-derived 8-bit color albedo and LOLA displacement basemaps. Regional 3D terrain meshes render sampled elevation tiles with high-contrast low-sun shadow projection.</p>
        <p><strong>Preliminary Orbital Mechanics:</strong> Trip transfers evaluate patched-conic two-body trajectories with date-based ephemeris boundary conditions. Launch-window constraints, descent trajectory Δv, and real-time flight guidance require formal mission certification.</p>
      </section>

      <section className="integrity-note" aria-labelledby="academic-citations-title">
        <h2 id="academic-citations-title">Academic & Technical Citations</h2>
        <ul className="about-citation-list" style={{ paddingLeft: "1.2rem", fontSize: "12px", lineHeight: 1.6, color: "var(--muted)" }}>
          <li>Acton, C. H., et al. (2018). <em>A look towards the future of the SPICE toolkit for planetary science missions</em>. Planetary and Space Science, 150, 9–12. doi:10.1016/j.pss.2017.11.013</li>
          <li>Smith, D. E., et al. (2017). <em>Summary of the results from the Lunar Orbiter Laser Altimeter after seven years in lunar orbit</em>. Icarus, 283, 70–91. doi:10.1016/j.icarus.2016.06.006</li>
          <li>Park, R. S., et al. (2021). <em>The JPL Planetary and Lunar Ephemerides DE440 and DE441</em>. The Astronomical Journal, 161(3), 105. doi:10.3847/1538-3881/abd414</li>
        </ul>
      </section>
    </article>
  );
}
