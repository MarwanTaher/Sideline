import "server-only";
import { sqlClient } from "./db";
import { getLeaderboard } from "./leaderboard";
import { getPlayerScores, getScoringPolicy } from "./scoring";
import { SCORE_CACHE_MODEL_VERSION } from "./score-cache";

/**
 * Score snapshots power leaderboard "movement" (#4) and rating-change
 * notifications (#3). We persist the full computed leaderboard into
 * `legacy_score_snapshots` once per matchday close — deliberately NOT on every
 * settings tweak — so "since last match" reflects actual play, not admin noise.
 * The revision-stamped payload is also the authoritative hot-read score cache
 * while no scoring input has changed since close.
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
 * Compute scores from current inputs, then publish a complete revision-stamped
 * snapshot only if the inputs stayed unchanged during the computation.
 */
export async function captureScoreSnapshot(snapshotKey: string): Promise<boolean> {
  const beforeRows = (await sqlClient.query(
    "SELECT revision::text AS revision FROM score_cache_state WHERE id = 1",
  )) as Array<{ revision: string }>;
  const revision = beforeRows[0]?.revision;
  if (!revision) throw new Error("Score cache revision is not initialized; deploy migration 0031.");

  const policy = await getScoringPolicy();
  const scores = await getPlayerScores();
  const leaderboard = await getLeaderboard({ scorePayload: scores });
  const afterRows = (await sqlClient.query(
    "SELECT revision::text AS revision FROM score_cache_state WHERE id = 1",
  )) as Array<{ revision: string }>;
  if (afterRows[0]?.revision !== revision) return false;

  const snapshotModelVersion =
    policy.recency_decay > 0
      ? `${SCORE_CACHE_MODEL_VERSION}-time-dependent`
      : SCORE_CACHE_MODEL_VERSION;
  const existing = (await sqlClient.query(
    `SELECT revision::text AS revision, model_version
       FROM score_cache_snapshots
      WHERE snapshot_key = $1
      LIMIT 1`,
    [snapshotKey],
  )) as Array<{ revision: string; model_version: string }>;
  if (
    existing[0]?.revision === revision &&
    existing[0]?.model_version === snapshotModelVersion
  ) return true;

  const values: unknown[] = [];
  const tuples = leaderboard.rows.map((row, idx) => {
    const score = scores[row.id];
    if (!score) throw new Error(`Score payload missing for active player ${row.id}.`);
    const payload = JSON.stringify({
      ...score,
      rank: idx + 1,
      ranked: row.ranked,
    });
    const offset = idx * 9;
    values.push(
      snapshotKey,
      row.id,
      row.final,
      row.peer,
      row.stat,
      score.has_stats ? 1 : 0,
      payload,
      revision,
      "leaderboard_v2",
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
  });
  const writes = [
    sqlClient.query("DELETE FROM legacy_score_snapshots WHERE snapshot_key = $1", [snapshotKey]),
  ];
  if (tuples.length > 0) {
    writes.push(sqlClient.query(
      `INSERT INTO legacy_score_snapshots
         (snapshot_key, player_id, final, peer, stat, has_stats, payload_json, revision, model_version)
       VALUES ${tuples.join(",")}
       ON CONFLICT (player_id, snapshot_key)
       DO UPDATE SET final = EXCLUDED.final,
                     peer = EXCLUDED.peer,
                     stat = EXCLUDED.stat,
                     has_stats = EXCLUDED.has_stats,
                     payload_json = EXCLUDED.payload_json,
                     revision = EXCLUDED.revision,
                     model_version = EXCLUDED.model_version,
                     captured_at = CURRENT_TIMESTAMP`,
      values,
    ));
  }

  writes.push(sqlClient.query(
    `INSERT INTO score_cache_snapshots
       (snapshot_key, revision, player_count, model_version)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (snapshot_key)
     DO UPDATE SET revision = EXCLUDED.revision,
                   player_count = EXCLUDED.player_count,
                   model_version = EXCLUDED.model_version,
                   captured_at = CURRENT_TIMESTAMP`,
    [snapshotKey, revision, leaderboard.rows.length, snapshotModelVersion],
  ));
  await sqlClient.transaction(writes);
  return true;
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
