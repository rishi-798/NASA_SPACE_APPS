import {
  ArrowRight,
  ArrowUpRight,
  Database,
  MapPin,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { RouteIntro } from "../components/ui/RouteIntro";
import { landingSites, missionRecordCount } from "../data/landingSites";
import { formatCoordinate } from "../lib/format";

export function MissionsPage() {
  const [selectedId, setSelectedId] = useState(landingSites[0]!.id);
  const selected =
    landingSites.find((site) => site.id === selectedId) ?? landingSites[0]!;

  return (
    <article className="editorial-page missions-page">
      <RouteIntro
        eyebrow="CLPS mission archive"
        title={<>THE LANDING<br />ARCHIVE.</>}
        description="Explore Odysseus and Athena, the two lunar landing sites currently available in the project."
        side={
          <div className="dataset-readout">
            <Database aria-hidden="true" />
            <span>{missionRecordCount} mission records · {landingSites.length} site records</span>
          </div>
        }
      />

      <div className="mission-browser">
        <section className="mission-index" aria-label="Mission-linked landing sites">
          <div className="mission-columns" aria-hidden="true">
            <span>Mission</span>
            <span>Landing area</span>
            <span>Record</span>
          </div>
          {landingSites.map((site) => (
            <button
              className={`mission-row${site.id === selected.id ? " mission-row-selected" : ""}`}
              key={site.id}
              type="button"
              aria-pressed={site.id === selected.id}
              onClick={() => setSelectedId(site.id)}
            >
              <strong>{site.mission}</strong>
              <span>{site.name}</span>
              <span className="mission-row-status">SITE DATA</span>
              <ArrowRight aria-hidden="true" />
            </button>
          ))}
          {missionRecordCount === 0 && (
            <div className="mission-empty-note">
              <span>ARCHIVE NOTICE</span>
              <p>
                Mission details are still being added. Provider, payload, and schedule
                information will appear when the mission dataset is populated.
              </p>
            </div>
          )}
        </section>

        <aside className="mission-detail" aria-live="polite">
          <div className="mission-detail-topline">
            <span>SELECTED RECORD</span>
            <span>{selected.id.toUpperCase()}</span>
          </div>
          <h2>{selected.mission}</h2>
          <p className="mission-location"><MapPin weight="fill" /> {selected.name}</p>

          <dl className="mission-data-list">
            <div>
              <dt>Latitude</dt>
              <dd>{formatCoordinate(selected.latitude, "lat")}</dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd>{formatCoordinate(selected.longitude, "lon")}</dd>
            </div>
            <div>
              <dt>Reference frame</dt>
              <dd>MOON_ME</dd>
            </div>
            <div>
              <dt>Mission metadata</dt>
              <dd>Awaiting dataset</dd>
            </div>
          </dl>

          <div className="mission-actions">
            <Link className="primary-text-link" to={`/explorer?site=${selected.id}`}>
              Analyze landing conditions <ArrowRight />
            </Link>
            <a className="source-link" href={selected.source} target="_blank" rel="noreferrer">
              View source record <ArrowUpRight />
            </a>
          </div>
        </aside>
      </div>
    </article>
  );
}
