import { useGSAP } from "@gsap/react";
import { ArrowRight, CalendarDots } from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { RouteIntro } from "../components/ui/RouteIntro";
import { landingSites, missionRecordCount } from "../data/landingSites";

gsap.registerPlugin(ScrollTrigger);

const years = [2024, 2025, 2026, 2027, 2028];

export function TimelinePage() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap.fromTo(
        ".chronology-progress",
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          scrollTrigger: {
            trigger: ".chronology",
            start: "top 78%",
            end: "bottom 42%",
            scrub: 0.5,
          },
        },
      );
      gsap.from(".unscheduled-record", {
        y: 32,
        opacity: 0,
        stagger: 0.14,
        scrollTrigger: {
          trigger: ".unscheduled-record",
          start: "top 82%",
        },
      });
    },
    { scope: root },
  );

  return (
    <article ref={root} className="editorial-page timeline-page">
      <RouteIntro
        eyebrow="Mission chronology"
        title={<>LUNAR<br />CHRONOLOGY.</>}
        description="Dated mission records have not been imported yet. Explore the available mission-linked landing sites below while the chronology takes shape."
        side={<span className="archive-status"><CalendarDots /> {missionRecordCount} dated events loaded</span>}
      />

      <section className="chronology" aria-labelledby="chronology-title">
        <h2 id="chronology-title" className="sr-only">CLPS mission chronology</h2>
        <div className="chronology-line" aria-hidden="true">
          <span className="chronology-progress" />
        </div>
        <div className="chronology-years">
          {years.map((year) => (
            <div key={year}>
              <span>{year}</span>
              <i aria-hidden="true" />
              <small>NO DATED RECORDS</small>
            </div>
          ))}
        </div>
      </section>

      <section className="unscheduled" aria-labelledby="unscheduled-title">
        <div className="unscheduled-heading">
          <p className="eyebrow">Unscheduled in current dataset</p>
          <h2 id="unscheduled-title">Mission-linked sites</h2>
        </div>
        <div className="unscheduled-list">
          {landingSites.map((site) => (
            <article className="unscheduled-record" key={site.id}>
              <span>{site.id.toUpperCase()}</span>
              <h3>{site.mission}</h3>
              <p>{site.name}</p>
              <Link to={`/explorer?site=${site.id}`} aria-label={`Analyze ${site.mission}`}>
                Analyze <ArrowRight />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </article>
  );
}
