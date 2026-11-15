import type { SimEvent, SimState, Vec3 } from "./physics.ts";

/**
 * The one snapshot every view reads (3D scene, instruments, charts cursor). The simulation loop or the
 * replay player writes it once per frame; nothing else computes positions or times.
 */
export type SimPhase = "idle" | "running" | "paused" | "ended" | "replay";
export type Snapshot = { state: SimState; trail: Vec3[]; events: SimEvent[]; phase: SimPhase; source: "live" | "replay" | "preview" };

export function createSnapshotStore(initial: Snapshot) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    set(next: Snapshot) { snapshot = next; listeners.forEach((l) => l()); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export type SnapshotStore = ReturnType<typeof createSnapshotStore>;
