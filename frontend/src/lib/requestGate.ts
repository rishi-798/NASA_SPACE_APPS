/**
 * Keeps only the latest request's response. `begin()` cancels the previous request and returns a ticket;
 * a response may be applied only while `ticket.current()` is true. `invalidate()` (input changed) cancels all.
 */
export type Ticket = { signal: AbortSignal; current: () => boolean };
export function createRequestGate() {
  let serial = 0;
  let controller: AbortController | null = null;
  return {
    begin(): Ticket {
      controller?.abort();
      const mine = ++serial, own = new AbortController();
      controller = own;
      return { signal: own.signal, current: () => serial === mine && !own.signal.aborted };
    },
    invalidate() { serial++; controller?.abort(); controller = null; },
  };
}
