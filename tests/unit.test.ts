/**
 * DB-free unit tests for pure helpers. Run: npm run test:unit
 */
import assert from "node:assert/strict";
import { getMatchPhase, type MatchPhaseInput } from "../src/lib/match-phase";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-21T12:00:00Z");
const base: MatchPhaseInput = {
  matchdayStatus: "draft",
  availabilityOpen: true,
  kickoffAt: new Date(NOW + 72 * HOUR).toISOString(),
  lockEnabled: true,
  hasRoster: false,
};

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("match-phase");
test("open well before kickoff", () => {
  assert.equal(getMatchPhase(base, NOW), "open");
});
test("locked within 24h", () => {
  assert.equal(
    getMatchPhase({ ...base, kickoffAt: new Date(NOW + 23 * HOUR).toISOString() }, NOW),
    "locked",
  );
});
test("lock disabled keeps it open within 24h", () => {
  assert.equal(
    getMatchPhase(
      { ...base, lockEnabled: false, kickoffAt: new Date(NOW + 2 * HOUR).toISOString() },
      NOW,
    ),
    "open",
  );
});
test("admin-closed availability reads as locked", () => {
  assert.equal(getMatchPhase({ ...base, availabilityOpen: false }, NOW), "locked");
});
test("missing kickoff never locks by time", () => {
  assert.equal(getMatchPhase({ ...base, kickoffAt: null }, NOW), "open");
});
test("roster drafted -> teams", () => {
  assert.equal(getMatchPhase({ ...base, hasRoster: true }, NOW), "teams");
});
test("active -> matchday, closed -> done", () => {
  assert.equal(getMatchPhase({ ...base, matchdayStatus: "active", hasRoster: true }, NOW), "matchday");
  assert.equal(getMatchPhase({ ...base, matchdayStatus: "closed" }, NOW), "done");
});

console.log(`\n${passed} passed`);
