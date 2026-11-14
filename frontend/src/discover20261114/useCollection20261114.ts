// 2026-11-14 — preserve an in-memory collection even when persistence is blocked.
import { useState } from "react";
import { readCollection, writeCollection } from "./collectionStore20261114";
import type { MediaEntry } from "./mediaClient20261114";

export function useCollection20261114() {
  const [items, setItems] = useState(readCollection);
  const [notice, setNotice] = useState("");
  function toggle(entry: MediaEntry) {
    const exists = items.some(item => item.id === entry.id);
    if (!exists && items.length >= 100) {
      setNotice("Your collection holds 100 items. Remove one before saving another.");
      return;
    }
    const next = exists ? items.filter(item => item.id !== entry.id) : [entry, ...items];
    const persisted = writeCollection(next);
    setItems(next);
    setNotice(persisted ? (exists ? "Removed from your collection." : "Saved to your collection.")
      : "Browser storage is unavailable. Your changes are kept for this session only.");
  }
  return { items, notice, toggle };
}
