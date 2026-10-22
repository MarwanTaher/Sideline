import type { RoundOutcome, WinRecord } from "./results";

/**
 * Pure, DB-free head-to-head between two players, from the viewer's
 * perspective. Lives outside `chemistry.ts` (server-only) so it can be unit
 * tested; `getHeadToHead` in `chemistry.ts` loads the data and calls it.
 *
 * Teams are fixed for a matchday, so "together" is counted per matchday (and
 * the mini-matches that team played). Opponents rotate every round, so
 * "against" only counts rounds where the two teams actually met.
 */

/** A matchday both players appeared in, with each one's team. */
export type SharedMatch = { matchId: number; viewerTeam: number; otherTeam: number };

export type HeadToHead = {
  against: {
    /** Matchdays on opposing teams (they may never have met in a round). */
    matchdays: number;
    /** Rounds actually played against each other. */
    faced: number;
    wins: number;
    draws: number;
    losses: number;
  };
  together: {
    /** Matchdays on the same team. */
    matchdays: number;
    /** Rounds played together with a recorded result. */
    rounds: number;
    record: WinRecord;
    /** Null when no rounds were recorded — not the same as never winning. */
    winRate: number | null;
  };
};

export function emptyHeadToHead(): HeadToHead {
  return {
    against: { matchdays: 0, faced: 0, wins: 0, draws: 0, losses: 0 },
    together: { matchdays: 0, rounds: 0, record: { wins: 0, draws: 0, losses: 0 }, winRate: null },
  };
}

/** Viewer-perspective result of a round, or null if the viewer's team sat it out. */
function resultFor(round: RoundOutcome, team: number): "W" | "D" | "L" | null {
  if (round.teamA !== team && round.teamB !== team) return null;
  const mine = round.teamA === team ? round.goalsA : round.goalsB;
  const theirs = round.teamA === team ? round.goalsB : round.goalsA;
  if (mine > theirs) return "W";
  if (mine < theirs) return "L";
  return "D";
}

export function computeHeadToHead(
  shared: SharedMatch[],
  rounds: RoundOutcome[],
): HeadToHead {
  const h2h = emptyHeadToHead();

  const roundsByMatch = new Map<number, RoundOutcome[]>();
  for (const r of rounds) {
    const list = roundsByMatch.get(r.matchId);
    if (list) list.push(r);
    else roundsByMatch.set(r.matchId, [r]);
  }

  const seen = new Set<number>();
  for (const m of shared) {
    if (seen.has(m.matchId)) continue;
    seen.add(m.matchId);
    const matchRounds = roundsByMatch.get(m.matchId) ?? [];

    if (m.viewerTeam === m.otherTeam) {
      h2h.together.matchdays += 1;
      for (const round of matchRounds) {
        const result = resultFor(round, m.viewerTeam);
        if (!result) continue;
        h2h.together.rounds += 1;
        if (result === "W") h2h.together.record.wins += 1;
        else if (result === "L") h2h.together.record.losses += 1;
        else h2h.together.record.draws += 1;
      }
      continue;
    }

    h2h.against.matchdays += 1;
    for (const round of matchRounds) {
      const met =
        (round.teamA === m.viewerTeam && round.teamB === m.otherTeam) ||
        (round.teamA === m.otherTeam && round.teamB === m.viewerTeam);
      if (!met) continue;
      const result = resultFor(round, m.viewerTeam);
      h2h.against.faced += 1;
      if (result === "W") h2h.against.wins += 1;
      else if (result === "L") h2h.against.losses += 1;
      else h2h.against.draws += 1;
    }
  }

  h2h.together.winRate =
    h2h.together.rounds === 0 ? null : h2h.together.record.wins / h2h.together.rounds;
  return h2h;
}
