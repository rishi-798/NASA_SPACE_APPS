// 2026-11-14 — seven-day astronomy feed with UTC date navigation.
import { useState } from "react";
import { shiftDay, utcDay } from "./dateTools20261114";
import type { MediaEntry } from "./mediaClient20261114";
import { MediaGrid20261114 } from "./MediaGrid20261114";
import { useMedia20261114 } from "./useMedia20261114";

export function AstronomyFeed20261114({ onOpen }: { onOpen: (entry: MediaEntry) => void }) {
  const [lastDay, setLastDay] = useState(utcDay);
  const { data, error, loading, retry } = useMedia20261114(`apod?end=${lastDay}&days=7`);
  return <section aria-labelledby="astronomy-title">
    <div className="media-section-heading"><div><p className="eyebrow">A daily perspective</p>
      <h2 id="astronomy-title">Astronomy picture of the day</h2></div>
      <div className="media-controls"><button onClick={() => setLastDay(shiftDay(lastDay, -7))} disabled={lastDay <= "1995-06-22"}>← Earlier</button>
        <label>Week ending (UTC)<input type="date" value={lastDay} min="1995-06-22" max={utcDay()}
          onChange={event => { if (event.target.validity.valid && event.target.value) setLastDay(event.target.value); }} /></label>
        <button onClick={() => setLastDay(shiftDay(lastDay, 7) > utcDay() ? utcDay() : shiftDay(lastDay, 7))}
          disabled={lastDay >= utcDay()}>Later →</button></div>
    </div>
    {loading && <p className="media-status" role="status">Fetching the sky, one day at a time…</p>}
    {error && <div className="media-error" role="alert"><p>{error}</p><button onClick={retry}>Try again</button></div>}
    {data && <MediaGrid20261114 items={data.items} onOpen={onOpen} />}
  </section>;
}
