export const SCORE_CACHE_MODEL_VERSION = "score-cache-v2";
export const SCORING_REVISION_TRIGGER_TABLES = [
  "players",
  "matches",
  "match_players",
  "votes",
  "stats",
  "player_stats_submissions",
  "app_settings",
] as const;

export function isSnapshotRevisionCurrent(
  currentRevision: string,
  snapshotRevision: string,
): boolean {
  return currentRevision === snapshotRevision;
}

export function isSnapshotComplete(expectedCount: number, actualCount: number): boolean {
  return (
    Number.isInteger(expectedCount) &&
    Number.isInteger(actualCount) &&
    expectedCount >= 0 &&
    actualCount === expectedCount
  );
}
