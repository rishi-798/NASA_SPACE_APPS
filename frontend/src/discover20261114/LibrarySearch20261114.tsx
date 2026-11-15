// 2026-11-14 — debounced NASA search with cancellable results and explicit paging.
import { useState } from "react";
import type { MediaEntry } from "./mediaClient20261114";
import { MediaGrid20261114 } from "./MediaGrid20261114";
import { useMedia20261114 } from "./useMedia20261114";
import { useSettled20261114 } from "./useSettled20261114";

export function LibrarySearch20261114({ onOpen }: { onOpen: (entry: MediaEntry) => void }) {
  const [text, setText] = useState("Moon");
  const [kind, setKind] = useState("image");
  const [page, setPage] = useState(1);
  const query = useSettled20261114(text.trim());
  const settling = query !== text.trim();
  const path = query.length >= 2 && !settling ? `library?${new URLSearchParams({ q: query, kind, page: String(page) })}` : null;
  const { data, error, loading, retry } = useMedia20261114(path);
  return <section aria-labelledby="library-title">
    <div className="media-section-heading"><div><p className="eyebrow">From the NASA archive</p>
      <h2 id="library-title">Image & video library</h2></div>
      <form className="media-controls" role="search" onSubmit={event => event.preventDefault()}>
        <label>Search NASA<input type="search" value={text} maxLength={100} placeholder="Apollo 12, nebula, Earth…"
          onChange={event => { setText(event.target.value); setPage(1); }} /></label>
        <label>Media type<select aria-label="Media type" value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}>
          <option value="image">Images</option><option value="video">Videos</option></select></label>
      </form>
    </div>
    {query.length < 2 && !settling && <p className="media-empty">Enter at least two characters to search NASA’s collection.</p>}
    {(loading || settling) && <p className="media-status" role="status">Searching NASA’s collection…</p>}
    {error && <div className="media-error" role="alert"><p>{error}</p><button onClick={retry}>Try again</button></div>}
    {data && !settling && <><p className="media-credit">{data.total.toLocaleString()} results for “{query}” · Page {page}</p>
      <MediaGrid20261114 items={data.items} onOpen={onOpen} />
      <div className="media-controls" aria-label="Search result pages" style={{ marginTop: 24 }}>
        <button disabled={page === 1} onClick={() => setPage(value => value - 1)}>← Previous results</button>
        <button disabled={!data.nextPage} onClick={() => setPage(value => value + 1)}>Next results →</button>
      </div></>}
  </section>;
}
