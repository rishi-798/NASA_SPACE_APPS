import { useEffect, useRef, useState } from "react";
import { createLoadingGate } from "../../lib/loadingGate";

/** Shown on every analysis (no delay) and held long enough to read a couple of facts. */
const LOADING_DELAY_MS = 0;
const LOADING_MIN_SHOW_MS = 5000;

export type LoadingScreenState = { visible: boolean; ready: boolean; dismiss: () => void };

/** `ready` turns true when the results have arrived but the minimum display time is still running. */
export function useLoadingScreen(loading: boolean): LoadingScreenState {
  const [visible, setVisible] = useState(false);
  const gateRef = useRef<ReturnType<typeof createLoadingGate> | null>(null);
  useEffect(() => {
    const gate = createLoadingGate({ delayMs: LOADING_DELAY_MS, minShowMs: LOADING_MIN_SHOW_MS }, setVisible);
    gateRef.current = gate;
    return () => { gate.dispose(); gateRef.current = null; };
  }, []);
  useEffect(() => { gateRef.current?.set(loading); }, [loading]);
  // After the overlay has painted, start the minimum-display clock.
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => gateRef.current?.confirmShown());
    return () => cancelAnimationFrame(frame);
  }, [visible]);
  return { visible, ready: visible && !loading, dismiss: () => gateRef.current?.dismiss() };
}
