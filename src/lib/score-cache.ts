import "server-only";
import { sqlClient } from "@/lib/db";
import type { ScorePayload } from "@/lib/scoring";
import {
  isSnapshotComplete,
  isSnapshotRevisionCurrent,
  SCORE_CACHE_MODEL_VERSION,
} from "@/lib/score-cache-policy";

export {
  isSnapshotComplete,
  isSnapshotRevisionCurrent,
  SCORE_CACHE_MODEL_VERSION,
  SCORING_REVISION_TRIGGER_TABLES,
} from "@/lib/score-cache-policy";

export type PersistedScoreSnapshot = {
  revision: string;
  scores: Record<number, ScorePayload>;
};

type SnapshotRow = {
  current_revision: string;
  snapshot_key: string | null;
  snapshot_revision: string | null;
  player_count: number | null;
  snapshot_model_version: string | null;
  player_id: number | null;
  final: number | null;
  peer: number | null;
  stat: number | null;
  has_stats: number | null;
  payload_json: string | null;
  entry_count: number;
};

function parseScorePayload(
  payloadJson: string | null,
  final: number | null,
  peer: number | null,
  stat: number | null,
  hasStats: number | null,
): ScorePayload | null {
  if (!payloadJson || final == null || peer == null || hasStats == null) return null;
  try {
    const parsed = JSON.parse(payloadJson) as Partial<ScorePayload>;
    if (
      !Number.isFinite(parsed.final) ||
      !Number.isFinite(parsed.peer) ||
      (parsed.stat !== null && !Number.isFinite(parsed.stat)) ||
      typeof parsed.has_stats !== "boolean" ||
      !["unrated", "provisional", "rated"].includes(String(parsed.tier)) ||
      !Number.isFinite(parsed.valid_votes) ||
      !Number.isFinite(parsed.match_count) ||
      parsed.final !== Number(final) ||
      parsed.peer !== Number(peer) ||
      parsed.stat !== (stat == null ? null : Number(stat)) ||
      parsed.has_stats !== (Number(hasStats) === 1)
    ) {
      return null;
    }
    return {
      final: parsed.final!,
      peer: parsed.peer!,
      stat: parsed.stat!,
      has_stats: parsed.has_stats,
      tier: parsed.tier!,
      valid_votes: parsed.valid_votes!,
      match_count: parsed.match_count!,
    };
  } catch {
    return null;
  }
}

/**
 * Read the current database revision and a complete matching close snapshot
 * from one SQL statement. Never consults an older revision as a score source.
 */
export async function readCurrentScoreSnapshot(): Promise<{
  revision: string;
  snapshot: PersistedScoreSnapshot | null;
}> {
  const rows = (await sqlClient.query(
    `WITH current_state AS (
       SELECT revision
         FROM score_cache_state
        WHERE id = 1
     ),
     current_snapshot AS (
       SELECT s.snapshot_key, s.revision, s.player_count, s.model_version
         FROM score_cache_snapshots s
         JOIN current_state cs ON cs.revision = s.revision
        WHERE s.model_version = $1
        ORDER BY s.captured_at DESC
        LIMIT 1
     )
     SELECT cs.revision::text AS current_revision,
            snap.snapshot_key,
            snap.revision::text AS snapshot_revision,
            snap.player_count,
            snap.model_version AS snapshot_model_version,
            scores.player_id,
            scores.final,
            scores.peer,
            scores.stat,
            scores.has_stats,
            scores.payload_json,
            COUNT(scores.player_id) OVER ()::int AS entry_count
       FROM current_state cs
       LEFT JOIN current_snapshot snap ON true
       LEFT JOIN legacy_score_snapshots scores
         ON scores.snapshot_key = snap.snapshot_key
        AND scores.revision = snap.revision
        AND scores.model_version = 'leaderboard_v2'
      ORDER BY scores.player_id`,
    [SCORE_CACHE_MODEL_VERSION],
  )) as SnapshotRow[];

  const state = rows[0];
  if (!state?.current_revision) {
    throw new Error("Score cache revision is not initialized; deploy migration 0031.");
  }
  if (
    !state.snapshot_key ||
    !state.snapshot_revision ||
    !isSnapshotRevisionCurrent(state.current_revision, state.snapshot_revision) ||
    state.snapshot_model_version !== SCORE_CACHE_MODEL_VERSION
  ) {
    return { revision: state.current_revision, snapshot: null };
  }

  const expectedCount = Number(state.player_count);
  const scoreRows = rows.filter((row) => row.player_id != null);
  if (
    !isSnapshotComplete(expectedCount, scoreRows.length) ||
    !isSnapshotComplete(expectedCount, Number(state.entry_count))
  ) {
    return { revision: state.current_revision, snapshot: null };
  }

  const scores: Record<number, ScorePayload> = {};
  for (const row of scoreRows) {
    const score = parseScorePayload(
      row.payload_json,
      row.final,
      row.peer,
      row.stat,
      row.has_stats,
    );
    if (!score) return { revision: state.current_revision, snapshot: null };
    scores[Number(row.player_id)] = score;
  }

  return {
    revision: state.current_revision,
    snapshot: { revision: state.current_revision, scores },
  };
}
