import assert from "node:assert/strict";
import test from "node:test";
import { creditsThatFit, isCreditStranded } from "../src/lib/multisport-rules";

const c = (id: number, creditMinor = 1500) => ({ id, creditMinor });

test("credits are used in scan order only while they fit the bill", () => {
  // 1 Sunday: 500 PLN / 14 → 36 PLN charged; three 15 PLN scans.
  assert.deepEqual(creditsThatFit([c(3), c(1), c(2)], 3600), [1, 2]);
  assert.deepEqual(creditsThatFit([c(1), c(2)], 3000), [1, 2], "exactly covering is allowed");
  assert.deepEqual(creditsThatFit([c(1)], 0), [], "a zero bill takes no credit");
  assert.deepEqual(creditsThatFit([], 10300), []);
});

test("top-up respects credit already on the bill", () => {
  assert.deepEqual(creditsThatFit([c(4), c(5)], 3600, 1500), [4]);
  assert.deepEqual(creditsThatFit([c(4)], 3600, 3000), []);
});

test("credit is stranded only when no bill can come", () => {
  const base = { withdrawn: false, seasonEndDate: "2027-03-30", lastBilledPeriod: "2027-01" };
  assert.equal(isCreditStranded(base), false);
  assert.equal(isCreditStranded({ ...base, withdrawn: true }), true);
  assert.equal(isCreditStranded({ ...base, lastBilledPeriod: "2027-03" }), true);
  assert.equal(isCreditStranded({ ...base, lastBilledPeriod: null }), false);
  assert.equal(isCreditStranded({ ...base, seasonEndDate: null, lastBilledPeriod: "2030-01" }), false);
});
