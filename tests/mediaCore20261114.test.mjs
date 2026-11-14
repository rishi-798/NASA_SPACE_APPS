// 2026-11-14 — exercise UTC boundaries and untrusted browser storage.
import test from "node:test";
import assert from "node:assert/strict";
import { shiftDay, utcDay } from "../frontend/src/discover20261114/dateTools20261114.ts";
import { readCollection, writeCollection } from "../frontend/src/discover20261114/collectionStore20261114.ts";

test("calendar shifts stay in UTC across daylight-saving and leap boundaries", () => {
  assert.equal(shiftDay("2026-03-08", -1), "2026-03-07");
  assert.equal(shiftDay("2024-03-01", -1), "2024-02-29");
  assert.equal(utcDay(new Date("2026-11-14T23:30:00-08:00")), "2026-11-15");
  assert.throws(() => shiftDay("2026-02-30", 1));
});

const item = { id: "one", title: "Moon", description: "A view", credit: "NASA", day: "2026-11-14",
  previewUrl: "https://images.nasa.gov/a.jpg", assetUrl: "https://images.nasa.gov/a.jpg",
  sourceUrl: "https://images.nasa.gov/details/one", kind: "image", source: "library" };

test("collections survive reload and reject unsafe stored links", () => {
  let stored = "[]";
  const shelf = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  assert.equal(writeCollection([item], shelf), true);
  assert.deepEqual(readCollection(shelf), [item]);
  stored = JSON.stringify([{ ...item, assetUrl: "javascript:alert(1)" }, item]);
  assert.deepEqual(readCollection(shelf), [item]);
  stored = "{broken";
  assert.deepEqual(readCollection(shelf), []);
});

test("blocked browser storage does not crash the app or pretend to save", () => {
  const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("full"); } };
  assert.deepEqual(readCollection(blocked), []);
  assert.equal(writeCollection([item], blocked), false);
});
