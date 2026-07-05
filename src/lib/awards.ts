import { sqlClient } from "./db";

/**
 * Direct TypeScript port of the read/compute path of `src/awards.py`.
 *
 * Computes the four award types (Top Scorer, Top Goal Contribution, Top
 * Defender, Man of the Match) for a match or overall scope, then layers admin
 * overrides on top — identical logic and SQL to the Streamlit engine.
 *
 * Includes the read/compute path plus the override write path
 * (`setAwardOverride`/`clearAwardOverride`); authorization is enforced by the
 * calling server action.
 */

export const AWARD_TOP_SCORER = "top_scorer";
export const AWARD_TOP_ASSISTS = "top_goal_contribution";
export const AWARD_TOP_DEFENDER = "top_defender";
export const AWARD_MOTM = "motm";

export type AwardType =
  | typeof AWARD_TOP_SCORER
  | typeof AWARD_TOP_ASSISTS
  | typeof AWARD_TOP_DEFENDER
  | typeof AWARD_MOTM;

export const AWARD_TYPES: AwardType[] = [
  AWARD_TOP_SCORER,
  AWARD_TOP_ASSISTS,
  AWARD_TOP_DEFENDER,
  AWARD_MOTM,
];

export const AWARD_LABELS: Record<AwardType, string> = {
  [AWARD_TOP_SCORER]: "Top Scorer",
  [AWARD_TOP_ASSISTS]: "Top Goal Contribution",
  [AWARD_TOP_DEFENDER]: "Top Defender",
  [AWARD_MOTM]: "Man of the Match",
};

export interface AwardWinner {
  player_id: number;
  name: string;
  preferred_position: string;
  metric_value: number | null;
  valid_votes: number | null;
}

export interface OverrideInfo {
  winner_ids: number[];
  reason: string;
  overridden_by: string;
  updated_at: string;
}

export interface AwardBlock {
  winners: AwardWinner[];
  metric_label: string;
  metric_key: string;
  award_label: string;
  source: "computed" | "override";
  override: OverrideInfo | null;
}

export interface AwardsResult {
  scope_type: "match" | "overall";
  scope_key: string;
  match_id: number | null;
  awards: Record<AwardType, AwardBlock>;
}

export function scopeKey(scopeType: string, matchId: number | null): string {
  if (scopeType === "overall") return "overall";
  if (matchId === null || matchId === undefined) {
    throw new Error("match_id is required for match scope");
  }
  return `match:${Math.trunc(matchId)}`;
}

const VALID_VOTE_CASE_SQL =
  "CASE " +
  "WHEN COALESCE(v.scope_status, 'in_scope') = 'in_scope' THEN 1 " +
  "WHEN COALESCE(v.scope_status, 'in_scope') IN ('out_of_scope', 'removed_from_calculation') THEN 0 " +
  "ELSE COALESCE(v.include_in_calculation, 1) END = 1";

type RawWinnerRow = {
  player_id: number | string;
  name: string;
  preferred_position: string;
  metric_value: number | string | null;
  valid_votes?: number | string | null;
};

function toWinner(r: RawWinnerRow): AwardWinner {
  return {
    player_id: Number(r.player_id),
    name: String(r.name),
    preferred_position: String(r.preferred_position),
    metric_value: r.metric_value === null || r.metric_value === undefined ? null : Number(r.metric_value),
    valid_votes: r.valid_votes === null || r.valid_votes === undefined ? null : Number(r.valid_votes),
  };
}

/** Pick the max metric_value; return all ties (mirrors _winners_from_rows). */
export function winnersFromRows(rows: AwardWinner[]): AwardWinner[] {
  if (rows.length === 0) return [];
  const topVal = Math.max(...rows.map((r) => Number(r.metric_value)));
  return rows.filter((r) => Number(r.metric_value) === topVal);
}

async function computedMatchAwards(
  matchId: number,
  minPeerVotes: number,
): Promise<Record<AwardType, AwardBlock>> {
  const mid = Math.trunc(matchId);

  const scorerRaw = (await sqlClient.query(
    `
    SELECT p.id AS player_id, p.name, p.preferred_position,
           COALESCE(s.goals, 0) AS metric_value
    FROM match_players mp
    JOIN players p ON p.id = mp.player_id
    LEFT JOIN stats s ON s.match_id = mp.match_id AND s.player_id = mp.player_id
    WHERE mp.match_id = $1
    `,
    [mid],
  )) as RawWinnerRow[];
  const scorerRows = scorerRaw.map(toWinner).filter((r) => Number(r.metric_value) > 0);

  const assistRaw = (await sqlClient.query(
    `
    SELECT p.id AS player_id, p.name, p.preferred_position,
           COALESCE(s.assists, 0) AS metric_value
    FROM match_players mp
    JOIN players p ON p.id = mp.player_id
    LEFT JOIN stats s ON s.match_id = mp.match_id AND s.player_id = mp.player_id
    WHERE mp.match_id = $1
    `,
    [mid],
  )) as RawWinnerRow[];
  const assistRows = assistRaw.map(toWinner).filter((r) => Number(r.metric_value) > 0);

  const peerRaw = (await sqlClient.query(
    `
    SELECT p.id AS player_id, p.name, p.preferred_position,
           AVG(v.rating) AS metric_value,
           COUNT(*) AS valid_votes
    FROM votes v
    JOIN players p ON p.id = v.voted_for_id
    JOIN match_players mp ON mp.match_id = v.match_id AND mp.player_id = v.voted_for_id
    WHERE v.match_id = $1
      AND ${VALID_VOTE_CASE_SQL}
    GROUP BY p.id, p.name, p.preferred_position
    HAVING COUNT(*) >= $2
    `,
    [mid, Math.trunc(minPeerVotes)],
  )) as RawWinnerRow[];
  const peerRows = peerRaw.map(toWinner);

  const defenderRows = peerRows.filter((r) =>
    r.preferred_position === "DEF" || r.preferred_position === "MID",
  );

  return buildBlocks(scorerRows, assistRows, peerRows, defenderRows);
}

async function computedOverallAwards(
  minPeerVotes: number,
): Promise<Record<AwardType, AwardBlock>> {
  const scorerRaw = (await sqlClient.query(
    `
    SELECT p.id AS player_id, p.name, p.preferred_position,
           COALESCE(SUM(s.goals), 0) AS metric_value
    FROM players p
    LEFT JOIN stats s ON s.player_id = p.id
    WHERE p.active = 1
    GROUP BY p.id, p.name, p.preferred_position
    `,
  )) as RawWinnerRow[];
  const scorerRows = scorerRaw.map(toWinner).filter((r) => Number(r.metric_value) > 0);

  const assistRaw = (await sqlClient.query(
    `
    SELECT p.id AS player_id, p.name, p.preferred_position,
           COALESCE(SUM(s.assists), 0) AS metric_value
    FROM players p
    LEFT JOIN stats s ON s.player_id = p.id
    WHERE p.active = 1
    GROUP BY p.id, p.name, p.preferred_position
    `,
  )) as RawWinnerRow[];
  const assistRows = assistRaw.map(toWinner).filter((r) => Number(r.metric_value) > 0);

  const peerRaw = (await sqlClient.query(
    `
    SELECT p.id AS player_id, p.name, p.preferred_position,
           AVG(v.rating) AS metric_value,
           COUNT(*) AS valid_votes
    FROM players p
    JOIN votes v ON v.voted_for_id = p.id
    WHERE p.active = 1
      AND ${VALID_VOTE_CASE_SQL}
    GROUP BY p.id, p.name, p.preferred_position
    HAVING COUNT(*) >= $1
    `,
    [Math.trunc(minPeerVotes)],
  )) as RawWinnerRow[];
  const peerRows = peerRaw.map(toWinner);

  const defenderRows = peerRows.filter((r) =>
    r.preferred_position === "DEF" || r.preferred_position === "MID",
  );

  return buildBlocks(scorerRows, assistRows, peerRows, defenderRows);
}

function buildBlocks(
  scorerRows: AwardWinner[],
  assistRows: AwardWinner[],
  peerRows: AwardWinner[],
  defenderRows: AwardWinner[],
): Record<AwardType, AwardBlock> {
  const base = (
    winners: AwardWinner[],
    metricLabel: string,
  ): AwardBlock => ({
    winners: winnersFromRows(winners),
    metric_label: metricLabel,
    metric_key: "metric_value",
    award_label: "",
    source: "computed",
    override: null,
  });

  return {
    [AWARD_TOP_SCORER]: base(scorerRows, "Goals"),
    [AWARD_TOP_ASSISTS]: base(assistRows, "Assists"),
    [AWARD_TOP_DEFENDER]: base(defenderRows, "Peer Avg"),
    [AWARD_MOTM]: base(peerRows, "Peer Avg"),
  };
}

async function getOverrides(
  scopeType: string,
  matchId: number | null,
): Promise<Record<string, OverrideInfo>> {
  const key = scopeKey(scopeType, matchId);
  const rows = (await sqlClient.query(
    `
    SELECT award_type, winner_player_ids, reason, overridden_by, updated_at
    FROM award_overrides
    WHERE scope_key = $1
    `,
    [key],
  )) as Array<{
    award_type: string;
    winner_player_ids: string | null;
    reason: string | null;
    overridden_by: string | null;
    updated_at: string | null;
  }>;

  const result: Record<string, OverrideInfo> = {};
  for (const r of rows) {
    let ids: number[] = [];
    try {
      const parsed = JSON.parse(String(r.winner_player_ids));
      if (Array.isArray(parsed)) ids = parsed.map((x) => Number(x));
    } catch {
      ids = [];
    }
    result[String(r.award_type)] = {
      winner_ids: ids,
      reason: String(r.reason ?? ""),
      overridden_by: String(r.overridden_by ?? ""),
      updated_at: String(r.updated_at ?? ""),
    };
  }
  return result;
}

export async function getAwards(
  scopeType: "match" | "overall",
  matchId: number | null = null,
  { minMatchVotes = 3, minOverallVotes = 12 }: { minMatchVotes?: number; minOverallVotes?: number } = {},
): Promise<AwardsResult> {
  if (scopeType !== "match" && scopeType !== "overall") {
    throw new Error("scope_type must be 'match' or 'overall'");
  }

  const computed =
    scopeType === "match"
      ? await computedMatchAwards(Number(matchId), Math.trunc(minMatchVotes))
      : await computedOverallAwards(Math.trunc(minOverallVotes));

  const overrides = await getOverrides(scopeType, matchId);

  const byIdRows = (await sqlClient.query(
    "SELECT id, name, preferred_position FROM players",
  )) as Array<{ id: number; name: string; preferred_position: string }>;
  const byId = new Map<number, { id: number; name: string; preferred_position: string }>();
  for (const r of byIdRows) byId.set(Number(r.id), r);

  for (const awardType of AWARD_TYPES) {
    const block = computed[awardType];
    block.award_label = AWARD_LABELS[awardType];
    block.source = "computed";
    block.override = null;
    const ov = overrides[awardType];
    if (ov) {
      const winners: AwardWinner[] = [];
      for (const pid of ov.winner_ids) {
        const p = byId.get(Number(pid));
        if (p) {
          winners.push({
            player_id: Number(p.id),
            name: String(p.name),
            preferred_position: String(p.preferred_position),
            metric_value: null,
            valid_votes: null,
          });
        }
      }
      block.winners = winners;
      block.source = "override";
      block.override = ov;
    }
  }

  return {
    scope_type: scopeType,
    scope_key: scopeKey(scopeType, matchId),
    match_id: scopeType === "overall" ? null : Number(matchId),
    awards: computed,
  };
}

export interface AwardsSettings {
  matchMinValidVotes: number;
  overallMinValidVotes: number;
}

/** Port of app.py _get_awards_settings — reads thresholds from app_settings. */
export async function getAwardsSettings(): Promise<AwardsSettings> {
  const settings: AwardsSettings = { matchMinValidVotes: 3, overallMinValidVotes: 12 };
  const rows = (await sqlClient.query(
    `
    SELECT key, value
    FROM app_settings
    WHERE key IN ('scoring_awards_match_min_valid_votes', 'scoring_awards_overall_min_valid_votes')
    `,
  )) as Array<{ key: string; value: string | number | null }>;
  for (const r of rows) {
    let parsed: number | null;
    const num = Number(r.value);
    parsed = Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : null;
    if (parsed === null) continue;
    if (r.key === "scoring_awards_match_min_valid_votes") settings.matchMinValidVotes = parsed;
    else if (r.key === "scoring_awards_overall_min_valid_votes") settings.overallMinValidVotes = parsed;
  }
  return settings;
}

export interface AwardMatch {
  id: number;
  played_on: string;
}

/** Matches ordered newest-first, for the awards match selector. */
export async function getAwardMatches(): Promise<AwardMatch[]> {
  const rows = (await sqlClient.query(
    "SELECT id, played_on FROM matches ORDER BY played_on DESC, id DESC",
  )) as Array<{ id: number; played_on: string }>;
  return rows.map((r) => ({ id: Number(r.id), played_on: String(r.played_on) }));
}

/**
 * Port of app.py _compute_player_badge_counts — counts award wins for a player
 * across the overall scope plus every match they played (not limited).
 */
export async function getPlayerBadgeCounts(
  playerId: number,
  { minMatchVotes = 3, minOverallVotes = 12 }: { minMatchVotes?: number; minOverallVotes?: number } = {},
): Promise<Record<AwardType, number>> {
  const pid = Math.trunc(playerId);
  const counts: Record<AwardType, number> = {
    [AWARD_TOP_SCORER]: 0,
    [AWARD_TOP_ASSISTS]: 0,
    [AWARD_TOP_DEFENDER]: 0,
    [AWARD_MOTM]: 0,
  };

  const overall = await getAwards("overall", null, { minMatchVotes, minOverallVotes });
  for (const awardType of AWARD_TYPES) {
    if (overall.awards[awardType].winners.some((w) => Number(w.player_id) === pid)) {
      counts[awardType] += 1;
    }
  }

  const matchRows = (await sqlClient.query(
    `
    SELECT m.id AS match_id
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.player_id = $1
    ORDER BY m.played_on DESC, m.id DESC
    `,
    [pid],
  )) as Array<{ match_id: number }>;

  for (const r of matchRows) {
    const mid = Number(r.match_id);
    const awards = await getAwards("match", mid, { minMatchVotes, minOverallVotes });
    for (const awardType of AWARD_TYPES) {
      if (awards.awards[awardType].winners.some((w) => Number(w.player_id) === pid)) {
        counts[awardType] += 1;
      }
    }
  }

  return counts;
}

export interface AwardHistoryEntry {
  scope: string;
  award_type: AwardType;
  award_label: string;
  source: "computed" | "override";
}

export async function getPlayerAwardHistory(
  playerId: number,
  {
    recentMatchLimit = 8,
    minMatchVotes = 3,
    minOverallVotes = 12,
  }: { recentMatchLimit?: number; minMatchVotes?: number; minOverallVotes?: number } = {},
): Promise<AwardHistoryEntry[]> {
  const pid = Math.trunc(playerId);
  const history: AwardHistoryEntry[] = [];

  const overall = await getAwards("overall", null, { minMatchVotes, minOverallVotes });
  for (const awardType of AWARD_TYPES) {
    const block = overall.awards[awardType];
    if (block.winners.some((w) => Number(w.player_id) === pid)) {
      history.push({
        scope: "Overall",
        award_type: awardType,
        award_label: block.award_label,
        source: block.source,
      });
    }
  }

  const matchRows = (await sqlClient.query(
    `
    SELECT m.id AS match_id, m.played_on
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.player_id = $1
    ORDER BY m.played_on DESC, m.id DESC
    LIMIT $2
    `,
    [pid, Math.trunc(recentMatchLimit)],
  )) as Array<{ match_id: number }>;

  for (const r of matchRows) {
    const mid = Number(r.match_id);
    const awards = await getAwards("match", mid, { minMatchVotes, minOverallVotes });
    for (const awardType of AWARD_TYPES) {
      const block = awards.awards[awardType];
      if (block.winners.some((w) => Number(w.player_id) === pid)) {
        history.push({
          scope: `Match ${mid}`,
          award_type: awardType,
          award_label: block.award_label,
          source: block.source,
        });
      }
    }
  }

  return history;
}

export interface ActivePlayer {
  id: number;
  name: string;
}

/** Active players (id, name) sorted by name — for the override picker. */
export async function getActivePlayers(): Promise<ActivePlayer[]> {
  const rows = (await sqlClient.query(
    "SELECT id, name FROM players WHERE active = 1 ORDER BY name",
  )) as Array<{ id: number; name: string }>;
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name) }));
}

/**
 * Port of app.py set_award_override — upserts an override and records an audit
 * row. Enforcement of who may call this lives in the server action.
 */
export async function setAwardOverride(
  scopeType: "match" | "overall",
  awardType: AwardType,
  winnerPlayerIds: number[],
  reason: string,
  actor: string,
  matchId: number | null = null,
): Promise<void> {
  if (!AWARD_TYPES.includes(awardType)) throw new Error("invalid award_type");
  if (winnerPlayerIds.length === 0) throw new Error("winner_player_ids cannot be empty");

  const key = scopeKey(scopeType, matchId);
  const winnerJson = JSON.stringify(winnerPlayerIds.map((x) => Math.trunc(x)));
  const mid = scopeType === "overall" ? null : Math.trunc(Number(matchId));

  await sqlClient.query(
    `
    INSERT INTO award_overrides(scope_key, scope_type, match_id, award_type, winner_player_ids, reason, overridden_by, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(scope_key, award_type) DO UPDATE SET
        winner_player_ids = excluded.winner_player_ids,
        reason = excluded.reason,
        overridden_by = excluded.overridden_by,
        updated_at = CURRENT_TIMESTAMP
    `,
    [key, scopeType, mid, awardType, winnerJson, reason, actor],
  );
  await sqlClient.query(
    `
    INSERT INTO award_override_audit(scope_key, scope_type, match_id, award_type, winner_player_ids, reason, actor, changed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `,
    [key, scopeType, mid, awardType, winnerJson, reason, actor],
  );
}

/**
 * Port of app.py clear_award_override — deletes an override and records an
 * audit row noting the clear.
 */
export async function clearAwardOverride(
  scopeType: "match" | "overall",
  awardType: AwardType,
  actor: string,
  matchId: number | null = null,
): Promise<void> {
  if (!AWARD_TYPES.includes(awardType)) throw new Error("invalid award_type");
  const key = scopeKey(scopeType, matchId);
  const mid = scopeType === "overall" ? null : Math.trunc(Number(matchId));

  await sqlClient.query(
    "DELETE FROM award_overrides WHERE scope_key = $1 AND award_type = $2",
    [key, awardType],
  );
  await sqlClient.query(
    `
    INSERT INTO award_override_audit(scope_key, scope_type, match_id, award_type, winner_player_ids, reason, actor, changed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `,
    [key, scopeType, mid, awardType, "[]", "override_cleared", actor],
  );
}
