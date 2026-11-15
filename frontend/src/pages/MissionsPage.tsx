import {
  ArrowRight,
  ArrowUpRight,
  Database,
  MapPin,
} from "@phosphor-icons/react";
import { missionExplorerUrl, missionTypeLabel } from "../lib/missionNavigation";
import { useState } from "react";
import { Link } from "react-router-dom";
import { RouteIntro } from "../components/ui/RouteIntro";
import { missions, landingSites, missionRecordCount } from "../data/landingSites";

import { missionEvents, missionFacts } from "../data/missionEvents";

export function MissionsPage() {
  const [selectedId, setSelectedId] = useState(missions[0]?.id ?? "");
  const selected = missions.find((m) => m.id === selectedId) ?? missions[0]!;

  const explorerUrl = missionExplorerUrl(selected);
  const facts = missionFacts.find((record) => record.siteId === selected.siteId);
  const events = missionEvents.filter((event) => event.siteId === selected.siteId);

  return (
    <article className="editorial-page missions-page">
      <RouteIntro
        eyebrow="CLPS & Artemis mission archive"
        title={<>THE MISSION<br />ARCHIVE.</>}
        description="Selected CLPS deliveries, crewed flybys, and orbital demonstrations, with verified sources and landing areas where applicable."
        side={
          <div className="dataset-readout">
            <Database aria-hidden="true" />
            <span>{missionRecordCount} mission records · {landingSites.length} primary sites</span>
          </div>
        }
      />

      <div className="mission-browser">
        <section className="mission-index" aria-label="Mission records">
          <div className="mission-columns" aria-hidden="true">
            <span>Mission</span>
            <span>Target area</span>
            <span>Status</span>
          </div>
          {missions.map((m) => (
            <div key={m.id} className="mission-row-with-action"><button
              className={`mission-row${m.id === selected.id ? " mission-row-selected" : ""}`}
              key={m.id}
              type="button"
              aria-pressed={m.id === selected.id}
              onClick={() => setSelectedId(m.id)}
            >
              <strong>{m.name}</strong>
              <span>{m.landingArea}</span>
              <span className="mission-row-status" style={{
                color: m.status === "Completed" ? "#a2ecd3" : "#ffb578"
              }}>
                {m.status.toUpperCase()}
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
            {missionExplorerUrl(m) && <Link className="mission-explore-link" to={missionExplorerUrl(m)!} aria-label={`Explore ${m.name} on Moon`}>{m.missionType === 'surface' && m.status !== 'Cancelled' ? 'Explore on Moon' : 'Explore lunar context'} <ArrowUpRight /></Link>}
            </div>
          ))}
        </section>

        <aside className="mission-detail" aria-live="polite">
          <div className="mission-detail-topline">
            <span>{selected.provider.toUpperCase()}</span>
            <span>{selected.year} · {selected.status.toUpperCase()}</span>
          </div>
          <h2>{selected.name}</h2>
          <p className="mission-location"><MapPin weight="fill" /> {selected.landingArea}</p>

          <p className="mission-description" style={{ color: "var(--muted)", margin: "16px 0 24px", lineHeight: "1.6" }}>
            {selected.description}
          </p>

          <p>{missionTypeLabel(selected)} · Last verified <time dateTime={selected.lastVerified}>{selected.lastVerified}</time></p>
          <p className="trip-note">{selected.scheduleNote}</p>
          <dl className="mission-data-list">
            <div>
              <dt>{selected.dateLabel}</dt>
              <dd>{selected.landingDate}</dd>
            </div>
            <div>
              <dt>Flight Provider</dt>
              <dd>{selected.provider}</dd>
            </div>
            <div>
              <dt>Spacecraft / Lander</dt>
              <dd>{selected.lander ?? "Not specified"}</dd>
            </div>
            <div>
              <dt>Launch Vehicle</dt>
              <dd>{selected.launchVehicle ?? "Not specified"}</dd>
            </div>
            <div>
              <dt>Mission Objective</dt>
              <dd>{selected.objective}</dd>
            </div>
            <div>
              <dt>Payload highlights</dt>
              <dd>{selected.payloads.join(", ")}</dd>
            </div>
            {facts && <div><dt>Outcome</dt><dd>{facts.outcome}</dd></div>}
          </dl>
          {events.length > 0 && <ul className="evidence-list" aria-label="Dated events">
            {events.map((event) => <li key={event.time}>
              <time dateTime={event.time}>{event.time.slice(0, 10)}{event.approximate ? " (approx.)" : ""}</time> — {event.label}
              {" "}(<a href={event.source.url} target="_blank" rel="noreferrer">{event.source.name}</a>)
            </li>)}
          </ul>}

          <div className="mission-actions" style={{ marginTop: "28px" }}>
            {explorerUrl ? <Link className="primary-text-link" to={explorerUrl}>
              Explore on Moon <ArrowRight />
            </Link> : <p className="trip-note">{selected.status === "Cancelled" ? "Task order ended; no active landing destination." : selected.missionType !== "surface" ? "No lunar surface landing is part of this mission." : "Landing coordinates are not available."}</p>}
            {selected.sources.map((source, index) => <a key={source} className="source-link" href={source} target="_blank" rel="noreferrer">
              {index === 0 ? "Mission source" : `Supporting source ${index}`} <ArrowUpRight />
            </a>)}
          </div>
        </aside>
      </div>
    </article>
  );
}
