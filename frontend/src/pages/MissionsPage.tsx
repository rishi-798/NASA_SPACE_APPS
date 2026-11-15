import {
  ArrowRight,
  ArrowUpRight,
  Database,
  MapPin,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { RouteIntro } from "../components/ui/RouteIntro";
import { missions, landingSites, missionRecordCount } from "../data/landingSites";

export function MissionsPage() {
  const [selectedId, setSelectedId] = useState(missions[0]?.id ?? "");
  const selected = missions.find((m) => m.id === selectedId) ?? missions[0]!;

  return (
    <article className="editorial-page missions-page">
      <RouteIntro
        eyebrow="CLPS & Artemis mission archive"
        title={<>THE LANDING<br />ARCHIVE.</>}
        description="Comprehensive manifest of NASA Commercial Lunar Payload Services (CLPS) and Artemis lunar landing missions, scientific instruments, and landing areas."
        side={
          <div className="dataset-readout">
            <Database aria-hidden="true" />
            <span>{missionRecordCount} mission records · {landingSites.length} primary sites</span>
          </div>
        }
      />

      <div className="mission-browser">
        <section className="mission-index" aria-label="Mission-linked landing sites">
          <div className="mission-columns" aria-hidden="true">
            <span>Mission</span>
            <span>Target area</span>
            <span>Status</span>
          </div>
          {missions.map((m) => (
            <button
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

          <dl className="mission-data-list">
            <div>
              <dt>Target Date</dt>
              <dd>{selected.landingDate}</dd>
            </div>
            <div>
              <dt>Flight Provider</dt>
              <dd>{selected.provider}</dd>
            </div>
            <div>
              <dt>Spacecraft / Lander</dt>
              <dd>{selected.lander ?? "Commercial Lander"}</dd>
            </div>
            <div>
              <dt>Launch Vehicle</dt>
              <dd>{selected.launchVehicle ?? "Falcon 9 / Heavy"}</dd>
            </div>
            <div>
              <dt>Mission Objective</dt>
              <dd>{selected.objective}</dd>
            </div>
            <div>
              <dt>Key Payloads</dt>
              <dd>{selected.payloads.join(", ")}</dd>
            </div>
          </dl>

          <div className="mission-actions" style={{ marginTop: "28px" }}>
            <Link
              className="primary-text-link"
              to={selected.siteId ? `/explorer?site=${selected.siteId}` : `/explorer`}
            >
              Analyze landing conditions <ArrowRight />
            </Link>
            <a className="source-link" href={selected.source} target="_blank" rel="noreferrer">
              Official NASA Record <ArrowUpRight />
            </a>
          </div>
        </aside>
      </div>
    </article>
  );
}
