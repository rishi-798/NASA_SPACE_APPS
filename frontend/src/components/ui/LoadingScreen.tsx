import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { NASA_FACTS_SOURCE, nasaFacts } from "../../data/nasaFacts";

const FACT_MS = 2500;
/** Continue is offered only after the first fact has been on screen, so the screen is always seen. */
const CONTINUE_AFTER_MS = 2500;

type Props = { visible: boolean; ready: boolean; onDismiss: () => void; message?: string };

export function LoadingScreen({ visible, ready, onDismiss, message = "Calculating Sun and Earth geometry" }: Props) {
  if (!visible) return null;
  return <LoadingOverlay ready={ready} onDismiss={onDismiss} message={message} />;
}

function LoadingOverlay({ ready: resultsReady, onDismiss, message }: { ready: boolean; onDismiss: () => void; message: string }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), CONTINUE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const ready = resultsReady && settled;
  // Start on a random fact so repeat visits see different ones.
  const [fact, setFact] = useState(() => Math.floor(Math.random() * nasaFacts.length));
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setFact((i) => (i + 1) % nasaFacts.length), FACT_MS);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (ready) continueRef.current?.focus(); }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, onDismiss]);

  return (
    <div className="loading-screen" role="dialog" aria-modal="true" aria-label="Loading">
      <div className="loading-stars" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
      <div className="loading-rocket" aria-hidden="true">
        <svg viewBox="0 0 64 128" width="64" height="128">
          <path className="rocket-fin" d="M18 74 L6 98 L20 94 Z" />
          <path className="rocket-fin" d="M46 74 L58 98 L44 94 Z" />
          <path className="rocket-body" d="M32 4 C46 18 48 44 46 94 L18 94 C16 44 18 18 32 4 Z" />
          <circle className="rocket-window" cx="32" cy="44" r="7" />
          <path className="rocket-band" d="M18.4 78 H45.6" />
          <path className="rocket-nozzle" d="M24 94 H40 L37 102 H27 Z" />
        </svg>
        <span className="rocket-flame" />
      </div>
      <p className="loading-title" role="status">{ready ? "Results ready" : message}</p>
      <figure className="loading-fact" aria-live="polite">
        <figcaption>NASA fun fact</figcaption>
        <blockquote key={fact}>{nasaFacts[fact]}</blockquote>
      </figure>
      {ready
        ? <button ref={continueRef} type="button" className="loading-continue" onClick={onDismiss}>Continue <ArrowRight aria-hidden="true" /></button>
        : <span className="loading-bar" aria-hidden="true" />}
      <a className="loading-source" href={NASA_FACTS_SOURCE} target="_blank" rel="noreferrer">Facts from NASA science pages</a>
    </div>
  );
}
