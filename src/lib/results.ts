import "server-only";
import { sqlClient } from "./db";

/**
 * Per-round results are the only trustworthy source of W/D/L. A matchday is a
 * series of mini-matches between rotating teams, so comparing a team's total
 * goals across the whole match — which the profile stats used to do — compares
 * numbers that were never in competition with each other.
 *
 * A match with no recorded rounds has *no* result. It is never reported as a
 * draw, and never as a 0% win rate.
 */

export type RoundOutcome = {
  matchId: number;
  teamA: number;
  teamB: number;
  goalsA: number;
  goalsB: number;
};

export type MatchResult = "W" | "D" | "L";

export type WinRecord = { wins: number; draws: number; losses: number };

export function emptyRecord(): WinRecord {
  return { wins: 0, draws: 0, losses: 0 };
}

export function recordPlayed(rec: WinRecord): number {
  return rec.wins + rec.draws + rec.losses;
}

/** Win share over everything played. Null means "no data", which is not 0%. */
export function winRate(rec: WinRecord): number | null {
  const played = recordPlayed(rec);
  return played === 0 ? null : rec.wins / played;
}

export function addResult(rec: WinRecord, result: MatchResult): void {
  if (result === "W") rec.wins += 1;
  else if (result === "L") rec.losses += 1;
  else rec.draws += 1;
}

/** Goals are rows in `round_goals`, so a count is the score. */
export async function getRoundOutcomes(matchIds: number[]): Promise<RoundOutcome[]> {
  if (matchIds.length === 0) return [];
  const rows = (await sqlClient.query(
    `SELECT mr.match_id, mr.team_a, mr.team_b,
            COALESCE(SUM(CASE WHEN rg.team_no = mr.team_a THEN 1 ELSE 0 END), 0) AS a,
            COALESCE(SUM(CASE WHEN rg.team_no = mr.team_b THEN 1 ELSE 0 END), 0) AS b
       FROM match_rounds mr
       LEFT JOIN round_goals rg ON rg.round_id = mr.id
      WHERE mr.match_id = ANY($1) AND mr.status = 'done'
      GROUP BY mr.id, mr.match_id, mr.team_a, mr.team_b
      ORDER BY mr.match_id ASC, mr.id ASC`,
    [matchIds],
  )) as Array<{ match_id: number; team_a: number; team_b: number; a: number; b: number }>;

  return rows.map((r) => ({
    matchId: Number(r.match_id),
    teamA: Number(r.team_a),
    teamB: Number(r.team_b),
    goalsA: Number(r.a),
    goalsB: Number(r.b),
  }));
}

export function groupRoundsByMatch(
  rounds: RoundOutcome[],
): Map<number, RoundOutcome[]> {
  const byMatch = new Map<number, RoundOutcome[]>();
  for (const r of rounds) {
    const list = byMatch.get(r.matchId);
    if (list) list.push(r);
    else byMatch.set(r.matchId, [r]);
  }
  return byMatch;
}

/** Null when the team did not play this round. */
export function roundResultFor(
  round: RoundOutcome,
  teamNo: number,
): MatchResult | null {
  if (round.teamA !== teamNo && round.teamB !== teamNo) return null;
  const mine = round.teamA === teamNo ? round.goalsA : round.goalsB;
  const theirs = round.teamA === teamNo ? round.goalsB : round.goalsA;
  if (mine > theirs) return "W";
  if (mine < theirs) return "L";
  return "D";
}

/** The opposing team in a round, or null if this team did not play it. */
export function opponentTeamIn(round: RoundOutcome, teamNo: number): number | null {
  if (round.teamA === teamNo) return round.teamB;
  if (round.teamB === teamNo) return round.teamA;
  return null;
}

export function recordForTeam(rounds: RoundOutcome[], teamNo: number): WinRecord {
  const rec = emptyRecord();
  for (const round of rounds) {
    const result = roundResultFor(round, teamNo);
    if (result) addResult(rec, result);
  }
  return rec;
}

/** A whole matchday condensed to one result — whichever outcome dominated. */
export function matchResultFor(
  rounds: RoundOutcome[],
  teamNo: number,
): MatchResult | null {
  const rec = recordForTeam(rounds, teamNo);
  if (recordPlayed(rec) === 0) return null;
  if (rec.wins > rec.losses) return "W";
  if (rec.losses > rec.wins) return "L";
  return "D";
}
