import { useEffect, useRef, useState } from "react";
import { createLoadingGate } from "../../lib/loadingGate";

const LOADING_DELAY_MS = 350;
const LOADING_MIN_SHOW_MS = 2000;

/** True while the loading screen should be on screen: only after a slow start, then for at least 2 s. */
export function useLoadingScreen(loading: boolean): boolean {
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
  return visible;
}
