import { ArrowRight, CalendarDots } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RouteIntro } from "../components/ui/RouteIntro";
import { missionExplorerUrl, missionTypeLabel } from "../lib/missionNavigation";
import { missions, missionRecordCount } from "../data/landingSites";

import "../components/redesign/mission-workspace.css";
import { formatCoordinate } from "../lib/format";
import { missionEvents } from "../data/missionEvents";


const years = [...new Set([...missions.filter((m) => m.status !== "Cancelled").map((m) => m.year), ...missionEvents.map((event) => Number(event.time.slice(0, 4)))])].sort((a, b) => a - b);
const groups = [
  { title: "Lunar surface missions", records: missions.filter((m) => m.missionType === "surface" && m.status !== "Cancelled") },
  { title: "Flybys and orbital demonstrations", records: missions.filter((m) => m.missionType !== "surface" && m.status !== "Cancelled") },
  { title: "Cancelled task orders", records: missions.filter((m) => m.status === "Cancelled") },
];

export function TimelinePage() {
  const [filterType, setFilterType] = useState<"all" | "surface" | "orbit">("all");

  const filteredGroups = useMemo(() => {
    return groups.map((g) => ({
      ...g,
      records: g.records.filter((m) => {
        if (filterType === "all") return true;
        if (filterType === "surface") return m.missionType === "surface";
        return m.missionType !== "surface";
      }),
    })).filter((g) => g.records.length > 0);
  }, [filterType]);


  return (
    <article className="editorial-page timeline-page mission-workspace">
      <RouteIntro
        eyebrow="BRAHMOS / FLIGHT HISTORY"
        title={<>Mission timeline<span className="mw-title-dot">.</span></>}
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
                    ? yearMissions.map((m) => m.name).join(" · ")
                    : "DEVELOPMENT"}
                </small>
                {missionEvents.filter((event) => event.time.startsWith(String(year))).map((event) => <div className="chronology-event" key={`${event.siteId}:${event.time}:${event.label}`}>
                  <time dateTime={event.time}>{event.time.slice(0, 10)}{event.approximate ? " ≈" : ""}</time>
                  <p>{event.label}</p>
                  <small><a href={event.source.url} target="_blank" rel="noreferrer">{event.source.name}</a></small>
                </div>)}
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
          <div className="timeline-filter-bar" role="group" aria-label="Mission category filter" style={{ display: "flex", gap: "8px", margin: "20px 0 10px", flexWrap: "wrap" }}>
            {(["all", "surface", "orbit"] as const).map((type) => (
              <button
                key={type}
                type="button"
                style={{
                  padding: "7px 16px",
                  borderRadius: "100px",
                  fontSize: "12px",
                  fontWeight: 500,
                  border: "1px solid var(--line)",
                  background: filterType === type ? "var(--text)" : "#14151a",
                  color: filterType === type ? "#151619" : "var(--text)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                aria-pressed={filterType === type}
                onClick={() => setFilterType(type)}
              >
                {type === "all" ? "All Programs" : type === "surface" ? "Surface Deliveries" : "Orbital & Demonstrations"}
              </button>
            ))}
          </div>
        </div>
        <div className="unscheduled-list">
          {filteredGroups.map((group) => <section className="mission-timeline-group" key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          {group.records.map((m) => (
            <article className="unscheduled-record" key={m.id}>
              <span>{m.dateLabel}: {m.landingDate} · {m.status.toUpperCase()}</span>
              <p>{missionTypeLabel(m)}</p>
              <h4>{m.name}</h4>
              <p>{m.landingArea}</p>
              {Number.isFinite(m.latitude) && Number.isFinite(m.longitude) && <p className="mw-coordinate">{formatCoordinate(m.latitude!, "lat")} / {formatCoordinate(m.longitude!, "lon")}</p>}
              <p style={{ fontSize: "13px", color: "var(--muted)", margin: "8px 0 16px" }}>
                {m.objective}
              </p>
              <p className="trip-note">{m.scheduleNote}</p>
              <p>Last verified <time dateTime={m.lastVerified}>{m.lastVerified}</time></p>
              {missionExplorerUrl(m) && <Link to={missionExplorerUrl(m)!} aria-label={`Explore ${m.name} on Moon`}>{m.missionType === "surface" && m.status !== "Cancelled" ? "Explore on Moon" : "Explore lunar context"} <ArrowRight /></Link>}
              {(m.sources.length ? m.sources : [m.source]).map((source, index) => <a key={source} className="source-link" href={source} target="_blank" rel="noreferrer">{index ? `Supporting source ${index}` : "Mission source"}</a>)}
            </article>
          ))}
          </section>)}
        </div>
      </section>
    </article>
  );
}
