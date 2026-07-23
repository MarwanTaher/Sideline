import "server-only";
import { sqlClient } from "./db";
import { getLeaderboard } from "./leaderboard";

/**
 * Score snapshots power leaderboard "movement" (#4) and rating-change
 * notifications (#3). We persist the full computed leaderboard into
 * `legacy_score_snapshots` once per matchday close — deliberately NOT on every
 * settings tweak — so "since last match" reflects actual play, not admin noise.
 *
 * A snapshot is keyed `match_<id>`. Each player's rank/ranked flag is stored in
 * `payload_json` alongside the final/peer/stat values.
 */

export type SnapshotEntry = {
  playerId: number;
  final: number;
  peer: number;
  stat: number | null;
  rank: number;
  ranked: boolean;
};

export type RatingChange = {
  playerId: number;
  name: string;
  prevFinal: number;
  newFinal: number;
  deltaFinal: number;
  prevRank: number;
  newRank: number;
  deltaRank: number; // positive = moved up (rank number decreased)
};

export function snapshotKeyForMatch(matchId: number): string {
  return `match_${matchId}`;
}

/**
 * Compute the current leaderboard and persist it under `snapshotKey`. Safe to
 * re-run: rows are upserted on (player_id, snapshot_key).
 */
export async function captureScoreSnapshot(snapshotKey: string): Promise<void> {
  const lb = await getLeaderboard();

  await Promise.all(
    lb.rows.map((row, idx) => {
      const rank = idx + 1;
      const payload = JSON.stringify({ rank, ranked: row.ranked });
      return sqlClient.query(
        `INSERT INTO legacy_score_snapshots
           (snapshot_key, player_id, final, peer, stat, has_stats, payload_json, model_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'leaderboard_v1')
         ON CONFLICT (player_id, snapshot_key)
         DO UPDATE SET final = EXCLUDED.final,
                       peer = EXCLUDED.peer,
                       stat = EXCLUDED.stat,
                       has_stats = EXCLUDED.has_stats,
                       payload_json = EXCLUDED.payload_json,
                       captured_at = CURRENT_TIMESTAMP`,
        [
          snapshotKey,
          row.id,
          row.final,
          row.peer,
          row.stat,
          row.stat != null ? 1 : 0,
          payload,
        ],
      );
    }),
  );
}

/** The two most recent snapshot keys, newest first (used for diffing). */
export async function getRecentSnapshotKeys(limit = 2): Promise<string[]> {
  const rows = (await sqlClient.query(
    `SELECT snapshot_key
       FROM legacy_score_snapshots
      GROUP BY snapshot_key
      ORDER BY MAX(captured_at) DESC
      LIMIT $1`,
    [limit],
  )) as Array<{ snapshot_key: string }>;
  return rows.map((r) => r.snapshot_key);
}

/** Read a snapshot as a map of playerId -> entry. */
export async function getSnapshotEntries(
  snapshotKey: string,
): Promise<Map<number, SnapshotEntry>> {
  const rows = (await sqlClient.query(
    `SELECT player_id, final, peer, stat, payload_json
       FROM legacy_score_snapshots
      WHERE snapshot_key = $1`,
    [snapshotKey],
  )) as Array<{
    player_id: number;
    final: number;
    peer: number;
    stat: number | null;
    payload_json: string | null;
  }>;

  const map = new Map<number, SnapshotEntry>();
  for (const r of rows) {
    let rank = 0;
    let ranked = false;
    if (r.payload_json) {
      try {
        const p = JSON.parse(r.payload_json) as {
          rank?: number;
          ranked?: boolean;
        };
        rank = Number(p.rank) || 0;
        ranked = Boolean(p.ranked);
      } catch {
        // ignore malformed payloads
      }
    }
    map.set(Number(r.player_id), {
      playerId: Number(r.player_id),
      final: Number(r.final),
      peer: Number(r.peer),
      stat: r.stat == null ? null : Number(r.stat),
      rank,
      ranked,
    });
  }
  return map;
}

export type MovementInfo = {
  /** rank delta: positive = moved up, negative = down, 0 = same, null = n/a. */
  rankDelta: number | null;
  /** score delta since the previous snapshot, or null when not comparable. */
  scoreDelta: number | null;
};

/**
 * Movement for the current leaderboard vs the previous matchday snapshot.
 * Compares the two most recent snapshots so the arrows reflect the last match,
 * not live churn. Movement is only meaningful for players ranked in BOTH
 * snapshots — newcomers' first swings are hidden to avoid misleading spikes.
 */
export async function getLeaderboardMovement(): Promise<
  Map<number, MovementInfo>
> {
  const keys = await getRecentSnapshotKeys(2);
  const result = new Map<number, MovementInfo>();
  if (keys.length < 2) return result;

  const [latest, previous] = await Promise.all([
    getSnapshotEntries(keys[0]),
    getSnapshotEntries(keys[1]),
  ]);

  for (const [playerId, cur] of latest) {
    const prev = previous.get(playerId);
    if (!prev || !cur.ranked || !prev.ranked) {
      result.set(playerId, { rankDelta: null, scoreDelta: null });
      continue;
    }
    result.set(playerId, {
      rankDelta: prev.rank - cur.rank,
      scoreDelta: cur.final - prev.final,
    });
  }
  return result;
}

/**
 * Diff the freshly-captured snapshot for `matchId` against the previous one to
 * find players whose rating/rank moved meaningfully. Only ranked players are
 * returned. Used to send personalised rating-change pushes.
 */
export async function getRatingChangesForMatch(
  matchId: number,
  opts: { minAbsDelta?: number } = {},
): Promise<RatingChange[]> {
  const minAbsDelta = opts.minAbsDelta ?? 1;
  const keys = await getRecentSnapshotKeys(2);
  const latestKey = snapshotKeyForMatch(matchId);
  // The just-captured snapshot must be the newest; need a prior one to diff.
  if (keys.length < 2 || keys[0] !== latestKey) return [];

  const [latest, previous] = await Promise.all([
    getSnapshotEntries(keys[0]),
    getSnapshotEntries(keys[1]),
  ]);

  const nameRows = (await sqlClient.query(
    `SELECT id, name FROM players WHERE active = 1`,
  )) as Array<{ id: number; name: string }>;
  const names = new Map(nameRows.map((r) => [Number(r.id), String(r.name)]));

  const changes: RatingChange[] = [];
  for (const [playerId, cur] of latest) {
    const prev = previous.get(playerId);
    if (!prev || !cur.ranked || !prev.ranked) continue;
    const deltaFinal = cur.final - prev.final;
    const deltaRank = prev.rank - cur.rank;
    if (Math.abs(deltaFinal) < minAbsDelta && deltaRank === 0) continue;
    changes.push({
      playerId,
      name: names.get(playerId) ?? `Player ${playerId}`,
      prevFinal: prev.final,
      newFinal: cur.final,
      deltaFinal,
      prevRank: prev.rank,
      newRank: cur.rank,
      deltaRank,
    });
  }
  return changes;
}
