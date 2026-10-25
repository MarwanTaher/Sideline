/** DB-free Phase 3 tests. Run: node --import tsx tests/phase3.test.ts */
import assert from "node:assert/strict";
import {
  formatMinor,
  invoiceAmountMinor,
  roundUpToPlnMinor,
} from "../src/lib/format-money";
import {
  dueDateFor,
  playingDaysInPeriod,
  seasonReminderDueDates,
} from "../src/lib/season-calculations";
import {
  isWithinAvailabilityLock,
  kickoffInstant,
  msUntilLock,
} from "../src/lib/match-schedule";

let passed = 0;
function test(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("kickoff and lock");
test("stored kickoff instant takes precedence over wall-clock fallback", () => {
  assert.equal(
    kickoffInstant("2026-11-01T12:30:00.000Z", "2026-11-01", "09:00 pm"),
    Date.parse("2026-11-01T12:30:00.000Z"),
  );
});
test("missing kickoff falls back to Warsaw local time", () => {
  assert.equal(
    kickoffInstant(null, "2026-01-10", "09:00 pm"),
    Date.parse("2026-01-10T20:00:00Z"),
  );
});
test("last Sunday in March uses the post-DST offset", () => {
  assert.equal(
    kickoffInstant(null, "2026-03-29", "09:00 pm"),
    Date.parse("2026-03-29T19:00:00Z"),
  );
});
test("last Sunday in October uses the standard-time offset", () => {
  assert.equal(
    kickoffInstant(null, "2026-10-25", "09:00 pm"),
    Date.parse("2026-10-25T20:00:00Z"),
  );
});
test("autumn repeated wall time selects standard time", () => {
  assert.equal(
    kickoffInstant(null, "2026-10-25", "02:30 am"),
    Date.parse("2026-10-25T01:30:00Z"),
  );
});
test("spring gap follows the pre-transition offset", () => {
  assert.equal(
    kickoffInstant(null, "2026-03-29", "02:30 am"),
    Date.parse("2026-03-29T01:30:00Z"),
  );
});
test("invalid and absent wall-clock inputs do not invent an instant", () => {
  assert.equal(kickoffInstant(null, "2026-02-30", "09:00 pm"), null);
  assert.equal(kickoffInstant(null, null, "09:00 pm"), null);
});
test("availability lock closes exactly 24 hours before kickoff", () => {
  const kickoff = Date.parse("2026-10-25T20:00:00Z");
  assert.equal(msUntilLock(kickoff, kickoff - 24 * 60 * 60 * 1000), 0);
  assert.equal(isWithinAvailabilityLock(kickoff, kickoff - 24 * 60 * 60 * 1000), true);
  assert.equal(isWithinAvailabilityLock(kickoff, kickoff - 24 * 60 * 60 * 1000 - 1), false);
});

console.log("season billing math");
test("invoice split is rounded to the nearest grosz", () => {
  assert.equal(invoiceAmountMinor(4, 50_000, 14), 14_286);
});
test("whole-PLN collection rounds upward without negative drift", () => {
  assert.equal(roundUpToPlnMinor(14_286), 14_300);
  assert.equal(roundUpToPlnMinor(14_300), 14_300);
  assert.equal(formatMinor(roundUpToPlnMinor(14_286)), "143.00 PLN");
});
test("due day is clamped to the supported first-through-28th range", () => {
  assert.equal(dueDateFor("2026-11", 3), "2026-11-03");
  assert.equal(dueDateFor("2026-11", 0), "2026-11-01");
  assert.equal(dueDateFor("2026-11", 31), "2026-11-28");
});
test("playing Sundays respect month and contract boundaries", () => {
  assert.equal(playingDaysInPeriod("2026-11", "2026-11-08", "2026-11-22"), 3);
  assert.equal(playingDaysInPeriod("2026-13", "2026-01-01", null), 0);
  assert.equal(playingDaysInPeriod("bad", "2026-01-01", null), 0);
});
test("reminder dates use the Warsaw calendar across month/year boundaries", () => {
  assert.deepEqual(
    seasonReminderDueDates(new Date("2026-12-30T23:30:00Z")),
    { today: "2026-12-31", threeDays: "2027-01-03" },
  );
});

console.log(`Phase 3 unit tests: ${passed} passed`);
