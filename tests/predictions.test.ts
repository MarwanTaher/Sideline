import assert from "node:assert/strict";
import test from "node:test";
import {
  isMatchdayScored,
  isPredictionCorrect,
  matchdayTeamPoints,
  matchdayWinners,
  picksRevealed,
  predictionWindow,
  tallyPundits,
  type PredictionRound,
} from "../src/lib/prediction-rules";

const round = (teamA: number, teamB: number, goalsA: number, goalsB: number): PredictionRound => ({
  teamA,
  teamB,
  goalsA,
  goalsB,
});

test("matchday points are win 3, draw 1, loss 0", () => {
  const points = matchdayTeamPoints([round(1, 2, 2, 0), round(2, 3, 1, 1), round(1, 3, 0, 1)]);
  assert.equal(points.get(1), 3);
  assert.equal(points.get(2), 1);
  assert.equal(points.get(3), 4);
  assert.deepEqual(matchdayWinners([round(1, 2, 2, 0), round(2, 3, 1, 1), round(1, 3, 0, 1)]), [3]);
});

test("points beat goal difference and win count", () => {
  // Team 1: one big win (3). Team 2: three draws (3) and team 3 two draws + one loss.
  const rounds = [round(1, 3, 5, 0), round(2, 3, 0, 0), round(2, 1, 2, 2), round(2, 3, 1, 1)];
  // T1: W(3)+D(1)=4, T2: D+D+D=3, T3: L+D+D=2
  assert.deepEqual(matchdayWinners(rounds), [1]);
});

test("tied leaders all count as correct", () => {
  const rounds = [round(1, 2, 1, 0), round(2, 3, 1, 0), round(3, 1, 1, 0)];
  const winners = matchdayWinners(rounds);
  assert.deepEqual(winners, [1, 2, 3]);
  assert.equal(isPredictionCorrect(1, winners), true);
  assert.equal(isPredictionCorrect(2, winners), true);
  assert.equal(isPredictionCorrect(3, winners), true);

  const twoWay = matchdayWinners([round(1, 2, 1, 1), round(1, 3, 2, 0), round(2, 3, 3, 1)]);
  assert.deepEqual(twoWay, [1, 2]);
  assert.equal(isPredictionCorrect(3, twoWay), false);
});

test("no completed rounds means unscored", () => {
  assert.equal(matchdayWinners([]), null);
  assert.equal(isPredictionCorrect(1, null), false);
  assert.equal(isMatchdayScored("closed", null), false);
  assert.equal(isMatchdayScored("closed", [1]), true);
  assert.equal(isMatchdayScored("active", [1]), false);
});

test("window is open before kickoff and locked from kickoff", () => {
  const kickoff = Date.UTC(2026, 9, 22, 19, 0);
  const base = { teamsPublished: true, kickoffMs: kickoff, matchdayStatus: "draft" as const };
  assert.equal(predictionWindow({ ...base, nowMs: kickoff - 60_000 }), "open");
  assert.equal(predictionWindow({ ...base, nowMs: kickoff }), "locked");
  assert.equal(predictionWindow({ ...base, nowMs: kickoff + 60_000 }), "locked");
  assert.equal(predictionWindow({ ...base, matchdayStatus: "closed", nowMs: kickoff - 60_000 }), "locked");
  assert.equal(predictionWindow({ ...base, kickoffMs: null, nowMs: kickoff - 60_000 }), "locked");

  assert.equal(picksRevealed({ kickoffMs: kickoff, matchdayStatus: "draft", nowMs: kickoff - 1 }), false);
  assert.equal(picksRevealed({ kickoffMs: kickoff, matchdayStatus: "draft", nowMs: kickoff }), true);
  assert.equal(picksRevealed({ kickoffMs: kickoff, matchdayStatus: "closed", nowMs: kickoff - 1 }), true);
});

test("unpublished teams keep the window closed", () => {
  const kickoff = Date.UTC(2026, 9, 22, 19, 0);
  const base = { teamsPublished: false, kickoffMs: kickoff, matchdayStatus: "draft" as const };
  assert.equal(predictionWindow({ ...base, nowMs: kickoff - 3_600_000 }), "not_open");
  assert.equal(predictionWindow({ ...base, nowMs: kickoff + 3_600_000 }), "not_open");
});

test("pundit tally scores only scored matches, 1 point per correct pick", () => {
  const winners = new Map<number, number[]>([
    [10, [1]],
    [11, [2, 3]],
  ]);
  const tally = tallyPundits(
    [
      { matchId: 10, playerId: 1, teamNo: 1 },
      { matchId: 11, playerId: 1, teamNo: 3 },
      { matchId: 10, playerId: 2, teamNo: 2 },
      { matchId: 11, playerId: 2, teamNo: 2 },
      { matchId: 12, playerId: 3, teamNo: 1 },
    ],
    winners,
  );
  assert.deepEqual(tally, [
    { playerId: 1, points: 2, scored: 2 },
    { playerId: 2, points: 1, scored: 2 },
  ]);
});
