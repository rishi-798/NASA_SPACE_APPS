// 2026-11-14 — genuine NASA raw-image records, with source-based instrument choices.
import { useState } from "react";
import type { MediaEntry } from "./mediaClient20261114";
import { MediaGrid20261114 } from "./MediaGrid20261114";
import { useMedia20261114 } from "./useMedia20261114";

export function RoverGallery20261114({ onOpen }: { onOpen: (entry: MediaEntry) => void }) {
  const [filters, setFilters] = useState({ rover: "curiosity", sol: 1000, camera: "", page: 1 });
  const query = new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, String(value)]));
  const { data, error, loading, retry } = useMedia20261114(`rovers?${query}`);
  return <section aria-labelledby="rover-title">
    <div className="media-section-heading"><div><p className="eyebrow">On another world</p>
      <h2 id="rover-title">Rover image browser</h2></div>
      <form className="media-controls" onSubmit={event => {
        event.preventDefault();
        const sol = Number(new FormData(event.currentTarget).get("sol"));
        setFilters(value => ({ ...value, sol, page: 1, camera: "" }));
      }}>
        <label>Rover<select aria-label="Rover" value={filters.rover} onChange={event => setFilters({ rover: event.target.value, sol: 1000, camera: "", page: 1 })}>
          <option value="curiosity">Curiosity</option><option value="perseverance">Perseverance</option></select></label>
        <label>Martian day (sol)<input key={`${filters.rover}:${filters.sol}`} name="sol" type="number" min="0" max="100000" step="1" defaultValue={filters.sol} required /></label>
        <button type="submit">View sol</button>
        <label>Camera<select aria-label="Camera" value={filters.camera} disabled={!data?.cameras?.length}
          onChange={event => setFilters(value => ({ ...value, camera: event.target.value, page: 1 }))}>
          <option value="">All cameras</option>{data?.cameras?.map(camera => <option key={camera} value={camera}>{camera.replaceAll("_", " ")}</option>)}</select></label>
      </form>
    </div>
    <p className="media-credit">Raw mission imagery from NASA/JPL. A sol is one Martian day; camera choices come from that sol’s source records.</p>
    {loading && <p className="media-status" role="status">Receiving images from Mars…</p>}
    {error && <div className="media-error" role="alert"><p>{error}</p><button onClick={retry}>Try again</button></div>}
    {data && <><p className="media-credit">{data.total.toLocaleString()} matching images · Page {filters.page}</p>
      <MediaGrid20261114 items={data.items} onOpen={onOpen} />
      <div className="media-controls" aria-label="Rover image pages" style={{ marginTop: 24 }}>
        <button disabled={filters.page === 1} onClick={() => setFilters(value => ({ ...value, page: value.page - 1 }))}>← Previous page</button>
        <button disabled={!data.nextPage} onClick={() => setFilters(value => ({ ...value, page: value.page + 1 }))}>Next page →</button>
      </div></>}
  </section>;
}
