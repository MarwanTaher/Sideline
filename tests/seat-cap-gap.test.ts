import assert from "node:assert/strict";
import test from "node:test";
import { seatCapGap } from "../src/lib/season-calculations";

const base = { period: "2026-11", subscriberCap: 14, playingDays: 4, dayRateMinor: 50_000 };

test("seat-cap gap: the review's 12-of-14 example leaves 284 PLN uncovered", () => {
  const gap = seatCapGap({ ...base, activeSubscribers: 12 });
  assert.ok(gap);
  assert.equal(gap.emptySeats, 2);
  assert.equal(gap.costMinor, 200_000);
  assert.equal(gap.invoicedMinor, 12 * 14_300);
  assert.equal(gap.gapMinor, 28_400);
});

test("seat-cap gap: none when the season is full or there is nothing to bill", () => {
  assert.equal(seatCapGap({ ...base, activeSubscribers: 14 }), null);
  assert.equal(seatCapGap({ ...base, activeSubscribers: 15 }), null);
  assert.equal(seatCapGap({ ...base, activeSubscribers: 10, playingDays: 0 }), null);
  assert.equal(seatCapGap({ ...base, subscriberCap: 0, activeSubscribers: 0 }), null);
});

test("seat-cap gap: no subscribers means the whole cost is uncovered", () => {
  const gap = seatCapGap({ ...base, activeSubscribers: 0 });
  assert.equal(gap?.gapMinor, 200_000);
});

test("split mode: cap keeps the seat count, active splits between subscribers", async () => {
  const { splitBetween } = await import("../src/lib/season-calculations");
  assert.equal(splitBetween("cap", 14, 12), 14);
  assert.equal(splitBetween("active", 14, 12), 12);
  // No active subscribers yet: fall back to the cap rather than divide by zero.
  assert.equal(splitBetween("active", 14, 0), 14);
});
