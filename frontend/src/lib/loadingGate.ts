/**
 * Decides when a loading screen is visible. Fast loads never show it (no flicker); once it has appeared
 * it stays for at least `minShowMs`, so it never flashes away half-drawn.
 */
export type LoadingGateOptions = { delayMs: number; minShowMs: number };
export type Timers = {
  now: () => number;
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
};
const realTimers: Timers = { now: () => Date.now(), set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };

export function createLoadingGate(options: LoadingGateOptions, onChange: (visible: boolean) => void, timers: Timers = realTimers) {
  let visible = false, loading = false, shownAt = 0;
  let timer: unknown = null;
  let hiding = false;
  const cancel = () => { if (timer !== null) timers.clear(timer); timer = null; hiding = false; };
  const setVisible = (value: boolean) => { if (visible !== value) { visible = value; onChange(value); } };
  return {
    set(next: boolean) {
      if (next === loading) return;
      loading = next;
      cancel();
      if (next) {
        if (visible) return;                                   // restarted during the hold: stay visible
        timer = timers.set(() => { timer = null; shownAt = timers.now(); setVisible(true); }, options.delayMs);
      } else if (visible) {
        const remaining = Math.max(0, shownAt + options.minShowMs - timers.now());
        hiding = true;
        timer = timers.set(() => { timer = null; hiding = false; setVisible(false); }, remaining);
      }
    },
    /** Call once the screen is actually on screen: the minimum time counts from here, not from the state change. */
    confirmShown() {
      shownAt = timers.now();
      if (hiding && !loading) {
        cancel(); hiding = true;
        timer = timers.set(() => { timer = null; hiding = false; setVisible(false); }, options.minShowMs);
      }
    },
    dispose() { cancel(); },
  };
}
