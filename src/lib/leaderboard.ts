import { unstable_cache } from "next/cache";
import { sqlClient } from "./db";
import { getPlayerScores, getScoringPolicy, type ScorePayload } from "./scoring";

/**
 * Cache tag for all computed-score reads. Score-affecting writes (match close,
 * stat approval, vote edits, scoring-config changes, roster/player changes)
 * call `revalidateScores()` to invalidate it. See `scores-cache.ts`.
 */
export const SCORES_CACHE_TAG = "scores";

/**
 * Every player's score, cached behind the `scores` tag. `getPlayerScores()`
 * recomputes from all votes and stats, so hot paths (leaderboard, Lineup
 * Builder, score breakdown) share this one cached result instead.
 */
export const getCachedPlayerScores = unstable_cache(
  async (): Promise<Record<number, ScorePayload>> => getPlayerScores(),
  ["player-scores-v1"],
  { tags: [SCORES_CACHE_TAG], revalidate: 600 },
);

export interface LeaderboardRow {
  id: number;
  name: string;
  position: string;
  photoUrl: string | null;
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
    "SELECT id, name, preferred_position, photo_url FROM players WHERE active = 1",
  )) as Array<{ id: number; name: string; preferred_position: string; photo_url: string | null }>;

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

  const scores = await getCachedPlayerScores();

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
      photoUrl: p.photo_url ?? null,
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

/**
 * Cached leaderboard for the hot read paths (dashboard + leaderboard page).
 * `getPlayerScores()` is a full recompute; caching it behind the `scores` tag
 * turns "recompute on every load" into "compute once per score-affecting
 * change". Invalidation is event-driven via `revalidateScores()`, with a long
 * TTL only as a safety net against a missed invalidation path.
 */
export const getCachedLeaderboard = unstable_cache(
  async (): Promise<LeaderboardData> => getLeaderboard(),
  ["leaderboard-v1"],
  { tags: [SCORES_CACHE_TAG], revalidate: 600 },
);

/** A single player's rank/score from the cached leaderboard (dashboard use). */
export async function getPlayerRank(playerId: number): Promise<{
  rank: number;
  total: number;
  final: number;
  ranked: boolean;
} | null> {
  const lb = await getCachedLeaderboard();
  const idx = lb.rows.findIndex((r) => r.id === playerId);
  if (idx < 0) return null;
  return {
    rank: idx + 1,
    total: lb.rows.length,
    final: lb.rows[idx].final,
    ranked: lb.rows[idx].ranked,
  };
}
