import { useGSAP } from "@gsap/react";
import { ArrowRight, CalendarDots } from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { RouteIntro } from "../components/ui/RouteIntro";
import { missionExplorerUrl, missionTypeLabel } from "../lib/missionNavigation";
import { missions, missionRecordCount } from "../data/landingSites";

gsap.registerPlugin(ScrollTrigger);

const years = [...new Set(missions.filter((m) => m.status !== "Cancelled").map((m) => m.year))].sort((a, b) => a - b);
const groups = [
  { title: "Lunar surface missions", records: missions.filter((m) => m.missionType === "surface" && m.status !== "Cancelled") },
  { title: "Flybys and orbital demonstrations", records: missions.filter((m) => m.missionType !== "surface" && m.status !== "Cancelled") },
  { title: "Cancelled task orders", records: missions.filter((m) => m.status === "Cancelled") },
];

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
        description="Selected CLPS deliveries, crewed flybys, and orbital demonstrations. Future dates are targets; cancelled task orders are archived separately."
        side={<span className="archive-status"><CalendarDots /> {missionRecordCount} flight programs tracked</span>}
      />

      <section className="chronology" aria-labelledby="chronology-title">
        <h2 id="chronology-title" className="sr-only">CLPS and Artemis mission chronology</h2>
        <div className="chronology-line" aria-hidden="true">
          <span className="chronology-progress" />
        </div>
        <div className="chronology-years">
          {years.map((year) => {
            const yearMissions = missions.filter((m) => m.year === year && m.status !== "Cancelled");
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
          <h2 id="unscheduled-title">Mission archive and roadmap</h2>
          <p style={{ color: "var(--muted)", marginTop: "12px", lineHeight: "1.6" }}>
            Surface deliveries, lunar flybys, and Earth-orbit demonstrations serve different objectives. Dates and categories below follow the linked mission sources.
          </p>
        </div>
        <div className="unscheduled-list">
          {groups.map((group) => <section className="mission-timeline-group" key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          {group.records.map((m) => (
            <article className="unscheduled-record" key={m.id}>
              <span>{m.dateLabel}: {m.landingDate} · {m.status.toUpperCase()}</span>
              <p>{missionTypeLabel(m)}</p>
              <h4>{m.name}</h4>
              <p>{m.landingArea}</p>
              <p style={{ fontSize: "13px", color: "var(--muted)", margin: "8px 0 16px" }}>
                {m.objective}
              </p>
              <p className="trip-note">{m.scheduleNote}</p>
              <p>Last verified <time dateTime={m.lastVerified}>{m.lastVerified}</time></p>
              {missionExplorerUrl(m) && <Link to={missionExplorerUrl(m)!} aria-label={`Explore ${m.name} landing area`}>Explore landing area <ArrowRight /></Link>}
              <a className="source-link" href={m.source} target="_blank" rel="noreferrer">Mission source</a>
            </article>
          ))}
          </section>)}
        </div>
      </section>
    </article>
  );
}
