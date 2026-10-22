import assert from "node:assert/strict";
import test from "node:test";
import { computeHeadToHead, emptyHeadToHead, type SharedMatch } from "../src/lib/head-to-head";
import type { RoundOutcome } from "../src/lib/results";

function round(matchId: number, teamA: number, goalsA: number, teamB: number, goalsB: number): RoundOutcome {
  return { matchId, teamA, teamB, goalsA, goalsB };
}

test("never met: empty pair with null win rate (not 0%)", () => {
  const h2h = computeHeadToHead([], []);
  assert.deepEqual(h2h, emptyHeadToHead());
  assert.equal(h2h.together.winRate, null);
  assert.equal(h2h.against.faced, 0);
});

test("opponents are counted per round, only rounds where the two teams met", () => {
  // Viewer on team 1, other on team 2, a third team rotates in.
  const shared: SharedMatch[] = [{ matchId: 10, viewerTeam: 1, otherTeam: 2 }];
  const rounds = [
    round(10, 1, 2, 2, 0), // viewer wins vs other
    round(10, 2, 1, 3, 1), // other vs team 3: not head-to-head
    round(10, 1, 0, 3, 0), // viewer vs team 3: not head-to-head
    round(10, 2, 3, 1, 1), // other beats viewer (teams listed the other way round)
    round(10, 1, 1, 2, 1), // draw
  ];
  const h2h = computeHeadToHead(shared, rounds);
  assert.deepEqual(h2h.against, { matchdays: 1, faced: 3, wins: 1, draws: 1, losses: 1 });
  assert.equal(h2h.together.matchdays, 0);
  assert.equal(h2h.together.winRate, null);
});

test("perspective flips W/L when viewer and other swap", () => {
  const rounds = [round(7, 1, 3, 2, 0), round(7, 1, 3, 2, 1), round(7, 2, 2, 1, 0), round(7, 1, 0, 2, 0)];
  const mine = computeHeadToHead([{ matchId: 7, viewerTeam: 1, otherTeam: 2 }], rounds);
  const theirs = computeHeadToHead([{ matchId: 7, viewerTeam: 2, otherTeam: 1 }], rounds);
  assert.deepEqual(mine.against, { matchdays: 1, faced: 4, wins: 2, draws: 1, losses: 1 });
  assert.deepEqual(theirs.against, { matchdays: 1, faced: 4, wins: 1, draws: 1, losses: 2 });
});

test("teammates are counted per matchday, with their team's round record", () => {
  const shared: SharedMatch[] = [
    { matchId: 1, viewerTeam: 2, otherTeam: 2 },
    { matchId: 2, viewerTeam: 1, otherTeam: 1 },
    { matchId: 3, viewerTeam: 3, otherTeam: 3 }, // no results recorded
  ];
  const rounds = [
    round(1, 2, 1, 1, 0), // W
    round(1, 1, 2, 3, 2), // team 2 sat out
    round(1, 3, 4, 2, 1), // L
    round(2, 1, 0, 2, 0), // D
    round(2, 3, 0, 1, 5), // W
  ];
  const h2h = computeHeadToHead(shared, rounds);
  assert.equal(h2h.together.matchdays, 3);
  assert.equal(h2h.together.rounds, 4);
  assert.deepEqual(h2h.together.record, { wins: 2, draws: 1, losses: 1 });
  assert.equal(h2h.together.winRate, 0.5);
  assert.equal(h2h.against.matchdays, 0);
  assert.equal(h2h.against.faced, 0);
});

test("mixed history across matchdays; opposite sides without meeting still counts as no rounds faced", () => {
  const shared: SharedMatch[] = [
    { matchId: 1, viewerTeam: 1, otherTeam: 1 },
    { matchId: 2, viewerTeam: 1, otherTeam: 2 },
    { matchId: 3, viewerTeam: 1, otherTeam: 3 },
    { matchId: 3, viewerTeam: 1, otherTeam: 3 }, // duplicate row is ignored
  ];
  const rounds = [
    round(1, 1, 0, 2, 1), // together: L
    round(2, 1, 2, 3, 0), // viewer vs team 3 only
    round(2, 2, 1, 3, 0), // other vs team 3 only
    round(3, 3, 0, 1, 2), // viewer beats other
  ];
  const h2h = computeHeadToHead(shared, rounds);
  assert.deepEqual(h2h.against, { matchdays: 2, faced: 1, wins: 1, draws: 0, losses: 0 });
  assert.deepEqual(h2h.together, {
    matchdays: 1,
    rounds: 1,
    record: { wins: 0, draws: 0, losses: 1 },
    winRate: 0,
  });
});
