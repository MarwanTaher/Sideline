import assert from "node:assert/strict";
import { isAvailabilityLockPushDue } from "../src/lib/reminder-scheduling";
import { AVAILABILITY_LOCK_MS } from "../src/lib/match-schedule";
import { digestPushBody } from "../src/lib/digest-push";

const now = Date.parse("2026-10-22T12:00:00Z");

assert.equal(
  isAvailabilityLockPushDue(new Date(now + AVAILABILITY_LOCK_MS), now),
  true,
);
assert.equal(
  isAvailabilityLockPushDue(new Date(now + AVAILABILITY_LOCK_MS + 1), now),
  false,
);
assert.equal(isAvailabilityLockPushDue(new Date(now), now), false);
assert.equal(isAvailabilityLockPushDue(new Date(now - 1), now), false);
assert.equal(isAvailabilityLockPushDue(null, now), false);

console.log("Phase 4 reminder scheduling tests passed.");

assert.equal(digestPushBody(null), "The matchday is complete. Open your recap and updated ratings.");
assert.equal(
  digestPushBody({
    matchId: 1, playedOn: "2026-10-22", playedOnLabel: "22 Oct",
    matchTimeLabel: "", teams: [], hasResult: true,
    motm: { name: "Alex", votes: 4 }, topScorer: { name: "Sam", goals: 3 },
    movers: [{ name: "Jordan", deltaFinal: 0.74 }],
  }),
  "MOTM: Alex · Top scorer: Sam (3) · Jordan +0.7. Full recap inside.",
);
console.log("Phase 4 final-matchday digest copy tests passed.");
