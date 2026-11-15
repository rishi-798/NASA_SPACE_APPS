import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadingGate } from '../frontend/src/lib/loadingGate.ts';

function harness() {
  let t = 0, id = 0; const q = new Map(); const log = [];
  const timers = { now: () => t, set: (fn, ms) => { q.set(++id, { at: t + ms, fn }); return id; }, clear: (i) => q.delete(i) };
  const advance = (ms) => { const end = t + ms; for (;;) { const next = [...q.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!next || next[1].at > end) break; t = next[1].at; q.delete(next[0]); next[1].fn(); } t = end; };
  const gate = createLoadingGate({ delayMs: 350, minShowMs: 2000 }, (v) => log.push([t, v]), timers);
  return { gate, advance, log };
}

test('a fast load never shows the screen', () => {
  const h = harness(); h.gate.set(true); h.advance(200); h.gate.set(false); h.advance(5000);
  assert.deepEqual(h.log, []);
});
test('a slow load shows after the delay and stays at least 2 s', () => {
  const h = harness(); h.gate.set(true); h.advance(400);          // shown at 350
  h.gate.set(false); h.advance(5000);                              // finished at 400, hidden at 350+2000
  assert.deepEqual(h.log, [[350, true], [2350, false]]);
});
test('a very slow load hides right after it finishes', () => {
  const h = harness(); h.gate.set(true); h.advance(6000); h.gate.set(false); h.advance(1);
  assert.deepEqual(h.log, [[350, true], [6000, false]]);
});
test('restarting during the hold keeps one continuous screen', () => {
  const h = harness(); h.gate.set(true); h.advance(400); h.gate.set(false); h.advance(500); h.gate.set(true); h.advance(5000);
  assert.deepEqual(h.log, [[350, true]]);
});
test('dismiss closes early only after loading has finished', () => {
  const h = harness(); h.gate.set(true); h.advance(400);
  h.gate.dismiss(); assert.deepEqual(h.log, [[350, true]]);          // still loading: ignored
  h.gate.set(false); h.advance(100); h.gate.dismiss();
  assert.deepEqual(h.log, [[350, true], [500, false]]);
  h.advance(5000); assert.equal(h.log.length, 2);                      // pending hide timer was cancelled
});
