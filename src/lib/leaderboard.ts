import { sqlClient } from "./db";
import { getPlayerScores, getScoringPolicy } from "./scoring";

export interface LeaderboardRow {
  id: number;
  name: string;
  position: string;
  matches: number;
  ranked: boolean;
  peer: number;
  stat: number | null;
  final: number;
}

export interface LeaderboardData {
  rows: LeaderboardRow[];
  peerWeightPct: number;
  statWeightPct: number;
  unratedMinMatches: number;
}

/**
 * Read-only leaderboard data — mirrors the Streamlit `leaderboard_ui()`:
 * active players, their match counts, and blended scores from the ported
 * scoring engine. Rows are returned sorted by final score (desc); the client
 * applies position / min-match filters.
 */
export async function getLeaderboard(): Promise<LeaderboardData> {
  const policy = await getScoringPolicy();
  const peerWeightPct = Math.round(policy.peer_base_weight * 100);
  const statWeightPct = Math.round(policy.stat_base_weight * 100);
  const unratedMinMatches = Math.trunc(policy.unrated_min_matches);

  const players = (await sqlClient.query(
    "SELECT id, name, preferred_position FROM players WHERE active = 1",
  )) as Array<{ id: number; name: string; preferred_position: string }>;

  const countRows = (await sqlClient.query(
    `
    SELECT mp.player_id AS player_id, COUNT(DISTINCT mp.match_id) AS n
    FROM match_players mp
    JOIN players p ON p.id = mp.player_id
    WHERE p.active = 1
    GROUP BY mp.player_id
    `,
  )) as Array<{ player_id: number; n: number }>;

  const matchCounts = new Map<number, number>();
  for (const r of countRows) {
    matchCounts.set(Number(r.player_id), Number(r.n));
  }

  const scores = await getPlayerScores();

  const rows: LeaderboardRow[] = players.map((p) => {
    const id = Number(p.id);
    const matches = matchCounts.get(id) ?? 0;
    const s = scores[id];
    const peer = s ? s.peer : 50.0;
    const stat = s ? s.stat : null;
    const final = s ? s.final : 50.0;
    return {
      id,
      name: String(p.name),
      position: String(p.preferred_position),
      matches,
      ranked: matches >= unratedMinMatches,
      peer,
      stat,
      final,
    };
  });

  rows.sort((a, b) => b.final - a.final);

  return { rows, peerWeightPct, statWeightPct, unratedMinMatches };
}
