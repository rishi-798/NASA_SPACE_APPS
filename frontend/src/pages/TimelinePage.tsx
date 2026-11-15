import { useGSAP } from "@gsap/react";
import { ArrowRight, CalendarDots } from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { RouteIntro } from "../components/ui/RouteIntro";
import { missions, missionRecordCount } from "../data/landingSites";

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
        description="Multi-year flight manifest for NASA's Commercial Lunar Payload Services (CLPS) and Artemis lunar surface exploration from 2024 through 2028."
        side={<span className="archive-status"><CalendarDots /> {missionRecordCount} flight programs tracked</span>}
      />

      <section className="chronology" aria-labelledby="chronology-title">
        <h2 id="chronology-title" className="sr-only">CLPS mission chronology</h2>
        <div className="chronology-line" aria-hidden="true">
          <span className="chronology-progress" />
        </div>
        <div className="chronology-years">
          {years.map((year) => {
            const yearMissions = missions.filter((m) => m.year === year);
            return (
              <div key={year}>
                <span>{year}</span>
                <i aria-hidden="true" />
                <small style={{ lineHeight: "1.4", color: yearMissions.length ? "var(--text)" : "var(--quiet)" }}>
                  {yearMissions.length
                    ? yearMissions.map((m) => m.name.replace(" Mission 1", " 1")).join(" · ")
                    : "DEVELOPMENT"}
                </small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="unscheduled" aria-labelledby="unscheduled-title">
        <div className="unscheduled-heading">
          <p className="eyebrow">Flight manifest & roadmap</p>
          <h2 id="unscheduled-title">Surface Missions (2024–2028)</h2>
          <p style={{ color: "var(--muted)", marginTop: "12px", lineHeight: "1.6" }}>
            Each mission carries scientific payloads to investigate lunar volatile extraction, polar illumination, radio astronomy, and crewed exploration viability.
          </p>
        </div>
        <div className="unscheduled-list">
          {missions.map((m) => (
            <article className="unscheduled-record" key={m.id}>
              <span>{m.year} · {m.status.toUpperCase()}</span>
              <h3>{m.name}</h3>
              <p>{m.landingArea}</p>
              <p style={{ fontSize: "13px", color: "var(--muted)", margin: "8px 0 16px" }}>
                {m.objective}
              </p>
              <Link
                to={m.siteId ? `/explorer?site=${m.siteId}` : `/explorer`}
                aria-label={`Analyze ${m.name}`}
              >
                Analyze landing conditions <ArrowRight />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </article>
  );
}
