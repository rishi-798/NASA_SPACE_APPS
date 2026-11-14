// 2026-11-14 — a native modal drawer for the device-local collection.
import { useEffect, useRef } from "react";
import type { MediaEntry } from "./mediaClient20261114";

export function CollectionDrawer20261114({ items, onDismiss, onOpen, onRemove }: {
  items: MediaEntry[]; onDismiss: () => void;
  onOpen: (entry: MediaEntry) => void; onRemove: (entry: MediaEntry) => void;
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = drawer.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={drawer} className="media-dialog media-drawer" aria-labelledby="saved-title"
    onCancel={event => { event.preventDefault(); onDismiss(); }}>
    <div className="media-dialog-top"><span>YOUR COLLECTION</span><button onClick={onDismiss}>Close ×</button></div>
    <div className="media-dialog-copy"><h2 id="saved-title">Saved images</h2>
      <p className="media-credit">Saved on this device. Clearing browser data removes this collection.</p>
      {!items.length && <p className="media-empty">Your collection is empty. Open an image and choose Save to collection.</p>}
      <ul className="media-saved-list">{items.map(item => <li key={item.id}>
        <button className="media-saved-open" onClick={() => onOpen(item)} aria-label={`Open saved ${item.title}`}>
          {item.previewUrl && <img src={item.previewUrl} alt="" width="80" height="60" loading="lazy" />}
          <span>{item.title}<small>{item.day.slice(0, 10)}</small></span></button>
        <button onClick={() => onRemove(item)} aria-label={`Remove ${item.title}`}>Remove</button>
      </li>)}</ul>
    </div>
  </dialog>;
}
