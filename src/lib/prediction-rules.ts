// Client-safe, DB-free rules for the predictions mini-game (who wins the
// matchday). Kept pure so scoring and the pick window can be unit tested.

/** The subset of a completed mini-match (`RoundOutcome`) scoring needs. */
export type PredictionRound = {
  teamA: number;
  teamB: number;
  goalsA: number;
  goalsB: number;
};

export const WIN_POINTS = 3;
export const DRAW_POINTS = 1;
export const LOSS_POINTS = 0;

/** Pundit points for each correct prediction. */
export const PUNDIT_POINTS_PER_CORRECT = 1;

/** Matchday points per team across completed mini-matches: W 3, D 1, L 0. */
export function matchdayTeamPoints(rounds: readonly PredictionRound[]): Map<number, number> {
  const points = new Map<number, number>();
  const add = (team: number, pts: number) => points.set(team, (points.get(team) ?? 0) + pts);
  for (const r of rounds) {
    if (r.goalsA > r.goalsB) {
      add(r.teamA, WIN_POINTS);
      add(r.teamB, LOSS_POINTS);
    } else if (r.goalsA < r.goalsB) {
      add(r.teamA, LOSS_POINTS);
      add(r.teamB, WIN_POINTS);
    } else {
      add(r.teamA, DRAW_POINTS);
      add(r.teamB, DRAW_POINTS);
    }
  }
  return points;
}

/**
 * Team numbers sharing the top points total, ascending. Null when there are no
 * completed rounds — the matchday is unscored, never a draw between everyone.
 */
export function matchdayWinners(rounds: readonly PredictionRound[]): number[] | null {
  if (rounds.length === 0) return null;
  const points = matchdayTeamPoints(rounds);
  const top = Math.max(...points.values());
  return [...points.entries()]
    .filter(([, pts]) => pts === top)
    .map(([team]) => team)
    .sort((a, b) => a - b);
}

/** Any of the tied leaders counts. Unscored matchdays are never correct. */
export function isPredictionCorrect(teamNo: number, winners: readonly number[] | null): boolean {
  return winners != null && winners.includes(teamNo);
}

export type PredictionWindowInput = {
  /** Teams are published (a team reveal has happened). */
  teamsPublished: boolean;
  /** Kickoff as epoch ms; null means no known kickoff, which never opens. */
  kickoffMs: number | null;
  matchdayStatus: "draft" | "active" | "closed";
  nowMs: number;
};

/**
 * - `not_open`: teams are not published yet.
 * - `open`: picks can be made or changed.
 * - `locked`: kickoff has passed (or the matchday was already closed).
 */
export type PredictionWindow = "not_open" | "open" | "locked";

export function predictionWindow(input: PredictionWindowInput): PredictionWindow {
  const kickedOff =
    input.matchdayStatus === "closed" ||
    input.kickoffMs == null ||
    input.nowMs >= input.kickoffMs;
  if (kickedOff) return input.teamsPublished ? "locked" : "not_open";
  return input.teamsPublished ? "open" : "not_open";
}

/** Others' picks stay hidden until kickoff (or close). */
export function picksRevealed(input: Omit<PredictionWindowInput, "teamsPublished">): boolean {
  return (
    input.matchdayStatus === "closed" ||
    input.kickoffMs == null ||
    input.nowMs >= input.kickoffMs
  );
}

/** Predictions only score once the matchday is closed and has a result. */
export function isMatchdayScored(
  matchdayStatus: PredictionWindowInput["matchdayStatus"],
  winners: readonly number[] | null,
): boolean {
  return matchdayStatus === "closed" && winners != null;
}

export type PunditPick = { matchId: number; playerId: number; teamNo: number };

export type PunditTally = { playerId: number; points: number; scored: number };

/**
 * Pundit points per player. `winnersByMatch` must only contain scored
 * (closed, with completed rounds) matches; picks for other matches are ignored.
 */
export function tallyPundits(
  picks: readonly PunditPick[],
  winnersByMatch: ReadonlyMap<number, readonly number[]>,
): PunditTally[] {
  const byPlayer = new Map<number, PunditTally>();
  for (const p of picks) {
    const winners = winnersByMatch.get(p.matchId);
    if (!winners) continue;
    let row = byPlayer.get(p.playerId);
    if (!row) {
      row = { playerId: p.playerId, points: 0, scored: 0 };
      byPlayer.set(p.playerId, row);
    }
    row.scored += 1;
    if (isPredictionCorrect(p.teamNo, winners)) row.points += PUNDIT_POINTS_PER_CORRECT;
  }
  return [...byPlayer.values()].sort(
    (a, b) => b.points - a.points || a.scored - b.scored || a.playerId - b.playerId,
  );
}
