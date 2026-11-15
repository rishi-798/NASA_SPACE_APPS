// 2026-11-14 — shared, keyboard-operable media cards.
import type { MediaEntry } from "./mediaClient20261114";

export function MediaGrid20261114({ items, onOpen }: {
  items: MediaEntry[]; onOpen: (entry: MediaEntry) => void;
}) {
  if (!items.length) return <p className="media-empty" role="status">No images match these filters. Try another date or search.</p>;
  return <div className="media-grid">{items.map(item => <article className="media-card" key={item.id}>
    <button className="media-card-open" onClick={() => onOpen(item)} aria-label={`Open ${item.title}`}>
      <div className="media-card-image">{item.previewUrl
        ? <img src={item.previewUrl} alt={item.title} loading="lazy" decoding="async" width="900" height="600" />
        : <span>{item.kind === "video" ? "Video / view details" : "NASA / view details"}</span>}
        {item.kind === "video" && <span className="media-video-label">VIDEO ↗</span>}
      </div>
      <div className="media-card-copy"><p>{item.day.slice(0, 10)} <span>{item.source.toUpperCase()}</span></p>
        <h3>{item.title}</h3><p className="media-credit">{item.credit || "NASA"}</p></div>
    </button>
  </article>)}</div>;
}
