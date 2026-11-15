import { useGSAP } from "@gsap/react";
import { ArrowRight, ArrowUpRight, Broadcast, GlobeHemisphereWest, Mountains, SunHorizon } from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { landingSites } from "../data/landingSites";
import { formatCoordinate } from "../lib/format";

gsap.registerPlugin(ScrollTrigger);

const questions = [
  { title: "Where does the light fall?", Icon: SunHorizon, text: "Choose a UTC observation time. Suhas's SPICE backend calculates the Sun's azimuth and elevation, then checks it against the local horizon." },
  { title: "Is Earth within sight?", Icon: Broadcast, text: "Check geometric Earth visibility from the same lunar location. A sampled daily window shows when a direct line of sight is available." },
  { title: "What does terrain change?", Icon: Mountains, text: "Athena's LOLA horizon includes local terrain obstruction at a 2 m observer height. Custom points near the south pole get a LOLA horizon generated on demand; Odysseus and other points use a flat horizon. Every result states which model was used." },
];

function ExplorerLink({ className = "", children = "Open Explorer" }: { className?: string; children?: string }) {
  return <Link className={`orbit-button ${className}`} to="/explorer"><span>{children}</span><span className="button-orbit"><ArrowUpRight aria-hidden="true" /></span></Link>;
}

export function HomePage() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Keep pre-rendered content visible during hydration instead of hiding it again.
    gsap.from(".hero-copy > *", { y: 12, duration: 0.7, stagger: 0.06, ease: "power3.out" });
    gsap.utils.toArray<HTMLElement>("[data-home-reveal]").forEach((element) => {
      gsap.from(element, { y: 36, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: element, start: "top 92%", once: true } });
    });
    if (window.matchMedia("(min-width: 901px)").matches) {
      gsap.to(".hero-image", { y: 70, ease: "none", scrollTrigger: { trigger: ".lunar-hero", start: "top top", end: "bottom top", scrub: 1 } });
    }
  }, { scope: root });

  return (
    <article ref={root} className="home-page">
      <section className="lunar-hero" aria-labelledby="hero-title">
        <img className="hero-image" src="/lunar-hero.webp" alt="" width="1672" height="941" fetchPriority="high" />
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">NASA Space Apps 2026</p>
          <h1 id="hero-title">THE MOON.<br /><span>IN CONTEXT.</span></h1>
          <p className="hero-description">Explore lunar terrain, track sunlight, and find a clear line of sight to Earth.</p>
          <div className="hero-actions"><Link className="orbit-button" to="/explorer"><span>Analyze a landing site</span><span className="button-orbit"><ArrowUpRight aria-hidden="true" /></span></Link><Link className="quiet-link" to="/trip">Plan a trip (optional) <ArrowRight aria-hidden="true" /></Link></div>
        </div>
      </section>

      <div className="project-rail">
        <span>ONE MOON. MANY QUESTIONS.</span>
        <span><i aria-hidden="true" /> {landingSites.length} landing sites</span>
        <span>3D exploration + SPICE analysis</span>
      </div>

      <section className="home-projects home-section" aria-labelledby="projects-title">
        <header className="section-heading" data-home-reveal>
          <h2 id="projects-title">Built to <span>explore.</span></h2>
          <p>Our projects, brought together.<br />A shared view of the lunar surface.</p>
        </header>
        <div className="project-grid">
          <Link className="project-card project-map" to="/explorer" data-home-reveal aria-label="Open Rishi's interactive Moon map in Explorer">
            <div className="project-image"><img src="/lunar-color-map.webp" srcSet="/lunar-color-map-640.webp 640w, /lunar-color-map-1280.webp 1280w, /lunar-color-map.webp 2048w" sizes="(max-width: 640px) calc(100vw - 44px), (max-width: 1600px) 55vw, 820px" alt="NASA LRO global lunar color map showing craters and dark maria" width="2048" height="1024" loading="lazy" /></div>
            <div className="project-card-copy"><div><p className="project-author">RISHI / MOON MAP</p><h3>A world worth<br />looking closer at.</h3><p>Orbit the NASA 3D Moon, choose a location, and put the surface in perspective.</p></div><span className="card-arrow"><ArrowUpRight aria-hidden="true" /></span></div>
          </Link>
          <div className="project-side">
            <Link className="project-card project-compute" to="/explorer" data-home-reveal aria-label="Open Suhas's visibility analysis in Explorer">
              <div className="compute-symbol" aria-hidden="true"><SunHorizon weight="thin" /><Broadcast weight="thin" /></div>
              <div className="project-card-copy"><div><p className="project-author">SUHAS / VISIBILITY ENGINE</p><h3>Beyond the<br />visible surface.</h3><p>Real Sun and Earth geometry. Terrain-aware horizons. One UTC timestamp.</p></div><span className="card-arrow"><ArrowUpRight aria-hidden="true" /></span></div>
            </Link>
            <Link className="archive-card" to="/missions" data-home-reveal><GlobeHemisphereWest weight="light" aria-hidden="true" /><div><h3>The landing-site archive</h3><p>CLPS & Artemis Manifest</p></div><ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </div>
        <p className="image-source">Lunar color map: NASA CGI Moon Kit. Interactive model: NASA Goddard / Cesium.</p>
      </section>

      <section className="home-analysis home-section" aria-labelledby="analysis-title">
        <div className="analysis-story" data-home-reveal>
          <h2 id="analysis-title">LIGHT.<br /><span>LINK.</span><br />LANDSCAPE.</h2>
          <p>A landing site is more than a point on a map. Understand what reaches it, what it can see, and what stands in the way.</p>
          <ExplorerLink />
          <div className="analysis-facts"><div><strong>30 min</strong><span>Daily window sampling</span></div><div><strong>NAIF SPICE</strong><span>Sun + Earth geometry</span></div></div>
        </div>
        <div className="analysis-details" data-home-reveal>
          <figure className="terrain-figure"><img src="/lunar-terrain.webp" srcSet="/lunar-terrain-640.webp 640w, /lunar-terrain-1000.webp 1000w, /lunar-terrain.webp 1672w" sizes="(max-width: 900px) calc(100vw - 44px), (max-width: 1600px) 45vw, 650px" alt="Conceptual lunar landscape with grazing sunlight and long crater shadows" width="1672" height="941" loading="lazy" /><figcaption>Conceptual lunar terrain illustration. Not a landing-site photograph.</figcaption></figure>
          <div className="question-list">{questions.map(({ title, Icon, text }, index) => <details key={title} open={index === 0}><summary><Icon weight="light" aria-hidden="true" /><span>{title}</span><span className="details-plus" aria-hidden="true" /></summary><p>{text}</p></details>)}</div>
        </div>
      </section>

      <section className="home-sites home-section" aria-labelledby="sites-title">
        <header className="section-heading" data-home-reveal><h2 id="sites-title">Start with <span>a site.</span></h2><Link className="quiet-link" to="/missions">Browse mission records <ArrowUpRight aria-hidden="true" /></Link></header>
        <div className="home-site-list">{landingSites.map((site) => <Link className="home-site-row" key={site.id} to={`/explorer?site=${site.id}`} data-home-reveal>
          <span className="site-mission">{site.mission}</span><h3>{site.name.replace(" landing site", "")}</h3><span className="site-coordinates">{formatCoordinate(site.latitude, "lat")}<br />{formatCoordinate(site.longitude, "lon")}</span><span className="site-row-action">Explore site <ArrowUpRight aria-hidden="true" /></span>
        </Link>)}</div>
        <p className="site-dataset-note">Two source-linked landing sites with four dated events, alongside the wider mission archive.</p>
      </section>

      <section className="home-outro home-section" aria-labelledby="outro-title" data-home-reveal>
        <div><h2 id="outro-title">A DIFFERENT<br /><span>POINT OF VIEW.</span></h2><p>Go from a distant world to a location you can explore.</p></div><ExplorerLink />
      </section>
    </article>
  );
}
