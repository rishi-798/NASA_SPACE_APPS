// 2026-11-14 — native modal keeps focus within the open image details.
import { useEffect, useRef } from "react";
import type { MediaEntry } from "./mediaClient20261114";

export function MediaDialog20261114({ entry, onDismiss }: {
  entry: MediaEntry; onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="media-dialog" aria-labelledby="media-detail-title"
    onCancel={event => { event.preventDefault(); onDismiss(); }}
    onClick={event => { if (event.target === dialog.current) onDismiss(); }}>
    <div className="media-dialog-inner">
      <div className="media-dialog-top"><span>{entry.source.toUpperCase()} / {entry.day.slice(0, 10)}</span>
        <button type="button" onClick={onDismiss} aria-label="Close image details">Close ×</button></div>
      {entry.kind === "image" && entry.previewUrl
        ? <img className="media-detail-image" src={entry.assetUrl} alt={entry.title} />
        : <div className="media-video-prompt"><p>{entry.kind === "video" ? "Watch this video at its original source." : "Open the original NASA page to view this item."}</p>
          <a href={entry.assetUrl} target="_blank" rel="noopener noreferrer">Open original ↗</a></div>}
      <div className="media-dialog-copy"><h2 id="media-detail-title">{entry.title}</h2>
        <p className="media-credit">{entry.credit}</p><p>{entry.description}</p>
        <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">View source and usage information ↗</a></div>
    </div>
  </dialog>;
}
