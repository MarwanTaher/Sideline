import { sqlClient } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface PlayerStatDefault {
  goals: number;
  assists: number;
  status: SubmissionStatus | null; // null when only an approved `stats` row exists
}

export interface PlayerStatsState {
  matchId: number;
  matchdayStatus: string;
  onRoster: boolean;
  open: boolean; // submissions allowed (matchday active)
  current: PlayerStatDefault | null;
}

export interface PendingSubmission {
  id: number;
  matchId: number;
  playerId: number;
  name: string;
  playedOn: string;
  goals: number;
  assists: number;
  createdAt: string;
}

export interface ApprovedStat {
  name: string;
  goals: number;
  assists: number;
}

export interface RosterStat {
  playerId: number;
  name: string;
  teamNo: number;
  goals: number;
  assists: number;
  /** Rolled up from the matchday goal log, or null when no matchday was recorded. */
  matchdayGoals: number | null;
  matchdayAssists: number | null;
  /** From the player's stats submission, or null when they never submitted. */
  submittedGoals: number | null;
  submittedAssists: number | null;
  submissionStatus: string | null;
}

export interface StatsReviewCounts {
  pending: number;
  approved: number;
  rejected: number;
}

/** Submissions are only accepted while the matchday is active. */
export function statsSubmissionOpen(matchdayStatus: string): boolean {
  return matchdayStatus === "active";
}

// ── Reads ────────────────────────────────────────────────────────────────

export async function getPlayerStatsState(
  matchId: number,
  playerId: number,
): Promise<PlayerStatsState | null> {
  const matchRaw = await sqlClient.query(
    `SELECT COALESCE(matchday_status, 'draft') AS matchday_status FROM matches WHERE id = $1`,
    [matchId],
  );
  const matchRows = matchRaw as { matchday_status: string }[];
  if (matchRows.length === 0) return null;
  const matchdayStatus = matchRows[0].matchday_status;

  const rosterRaw = await sqlClient.query(
    `SELECT 1 FROM match_players WHERE match_id = $1 AND player_id = $2 LIMIT 1`,
    [matchId, playerId],
  );
  const onRoster = (rosterRaw as unknown[]).length > 0;

  const current = await getPlayerStatDefault(matchId, playerId);

  return {
    matchId,
    matchdayStatus,
    onRoster,
    open: statsSubmissionOpen(matchdayStatus),
    current,
  };
}

/** Pending submission first, else an approved `stats` row, else null. */
export async function getPlayerStatDefault(
  matchId: number,
  playerId: number,
): Promise<PlayerStatDefault | null> {
  const subRaw = await sqlClient.query(
    `SELECT goals, assists, status
       FROM player_stats_submissions
      WHERE match_id = $1 AND player_id = $2`,
    [matchId, playerId],
  );
  const subRows = subRaw as { goals: number; assists: number; status: SubmissionStatus }[];
  if (subRows.length > 0) {
    return {
      goals: Number(subRows[0].goals),
      assists: Number(subRows[0].assists),
      status: subRows[0].status,
    };
  }

  const statRaw = await sqlClient.query(
    `SELECT goals, assists FROM stats WHERE match_id = $1 AND player_id = $2`,
    [matchId, playerId],
  );
  const statRows = statRaw as { goals: number; assists: number }[];
  if (statRows.length === 0) return null;
  return {
    goals: Number(statRows[0].goals),
    assists: Number(statRows[0].assists),
    status: null,
  };
}

/** All pending submissions across every match (admin review queue). */
export async function getAllPendingSubmissions(): Promise<PendingSubmission[]> {
  const raw = await sqlClient.query(
    `SELECT pss.id, pss.match_id, pss.player_id, p.name, m.played_on,
            pss.goals, pss.assists, pss.created_at
       FROM player_stats_submissions pss
       JOIN players p ON p.id = pss.player_id
       JOIN matches m ON m.id = pss.match_id
      WHERE pss.status = 'pending'
      ORDER BY m.id DESC, p.name ASC`,
  );
  const rows = raw as {
    id: number;
    match_id: number;
    player_id: number;
    name: string;
    played_on: string;
    goals: number;
    assists: number;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: Number(r.id),
    matchId: Number(r.match_id),
    playerId: Number(r.player_id),
    name: r.name,
    playedOn: r.played_on,
    goals: Number(r.goals),
    assists: Number(r.assists),
    createdAt: r.created_at,
  }));
}

export async function getStatsReviewCounts(): Promise<StatsReviewCounts> {
  const raw = await sqlClient.query(
    `SELECT
        SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
       FROM player_stats_submissions`,
  );
  const rows = raw as { pending: number | null; approved: number | null; rejected: number | null }[];
  const r = rows[0] ?? { pending: 0, approved: 0, rejected: 0 };
  return {
    pending: Number(r.pending ?? 0),
    approved: Number(r.approved ?? 0),
    rejected: Number(r.rejected ?? 0),
  };
}

export interface StatMatchOption {
  id: number;
  label: string;
}

interface StatMatchRow {
  id: number;
  played_on: string;
}

/** Matches newest-first for the stats submission-status picker. */
export async function listMatchesForStats(): Promise<StatMatchOption[]> {
  const raw = (await sqlClient.query(
    `SELECT id, played_on FROM matches ORDER BY played_on DESC, id DESC`,
  )) as unknown as StatMatchRow[];
  return raw.map((m) => ({ id: Number(m.id), label: `Match ${m.id} (${fmtDate(m.played_on)})` }));
}

/** Per-rostered-player stats status for a match. */
export type StatSubmissionState = "approved" | "pending" | "rejected" | "missing";

export interface StatSubmissionRow {
  playerId: number;
  name: string;
  state: StatSubmissionState;
  goals: number | null;
  assists: number | null;
}

interface StatSubmissionRawRow {
  player_id: number;
  name: string;
  sub_status: SubmissionStatus | null;
  has_approved_stat: number;
  goals: number | null;
  assists: number | null;
}

/**
 * For a single match, list every rostered player and their stats status:
 * whether they have a submission (pending/approved/rejected) or an approved
 * `stats` row, or nothing yet (missing).
 */
export async function getStatsSubmissionStatus(
  matchId: number,
): Promise<StatSubmissionRow[]> {
  const raw = (await sqlClient.query(
    `SELECT mp.player_id,
            p.name,
            pss.status AS sub_status,
            CASE WHEN s.match_id IS NOT NULL THEN 1 ELSE 0 END AS has_approved_stat,
            COALESCE(pss.goals, s.goals) AS goals,
            COALESCE(pss.assists, s.assists) AS assists
       FROM match_players mp
       JOIN players p ON p.id = mp.player_id
       LEFT JOIN player_stats_submissions pss
         ON pss.match_id = mp.match_id AND pss.player_id = mp.player_id
       LEFT JOIN stats s
         ON s.match_id = mp.match_id AND s.player_id = mp.player_id
      WHERE mp.match_id = $1
      ORDER BY p.name`,
    [matchId],
  )) as unknown as StatSubmissionRawRow[];
  return raw.map((r) => {
    let state: StatSubmissionState;
    if (r.sub_status) state = r.sub_status;
    else if (Number(r.has_approved_stat) === 1) state = "approved";
    else state = "missing";
    return {
      playerId: Number(r.player_id),
      name: r.name,
      state,
      goals: r.goals == null ? null : Number(r.goals),
      assists: r.assists == null ? null : Number(r.assists),
    };
  });
}

// ── Writes ───────────────────────────────────────────────────────────────

/**
 * Every rostered player for a match with their current approved goals/assists
 * (0 when no `stats` row exists yet). Ordered by team then name — the admin
 * score-editing grid on the match stats page.
 */
export async function getMatchRosterStats(matchId: number): Promise<RosterStat[]> {
  const matchdayCountRaw = await sqlClient.query(
    `SELECT COUNT(*) AS n FROM round_goals WHERE match_id = $1`,
    [matchId],
  );
  const matchdayUsed = Number((matchdayCountRaw as { n: number }[])[0]?.n ?? 0) > 0;

  const raw = await sqlClient.query(
    `WITH md AS (
        SELECT player_id, SUM(goals)::int AS goals, SUM(assists)::int AS assists
          FROM (
            SELECT scorer_player_id AS player_id, COUNT(*) AS goals, 0 AS assists
              FROM round_goals
             WHERE match_id = $1 AND scorer_player_id IS NOT NULL
             GROUP BY scorer_player_id
            UNION ALL
            SELECT assist_player_id AS player_id, 0 AS goals, COUNT(*) AS assists
              FROM round_goals
             WHERE match_id = $1 AND assist_player_id IS NOT NULL
             GROUP BY assist_player_id
          ) rolled
         GROUP BY player_id
     )
     SELECT mp.player_id, p.name, mp.team_no,
            COALESCE(s.goals, 0) AS goals,
            COALESCE(s.assists, 0) AS assists,
            md.goals AS md_goals,
            md.assists AS md_assists,
            pss.goals AS sub_goals,
            pss.assists AS sub_assists,
            pss.status AS sub_status
       FROM match_players mp
       JOIN players p ON p.id = mp.player_id
       LEFT JOIN stats s ON s.match_id = mp.match_id AND s.player_id = mp.player_id
       LEFT JOIN md ON md.player_id = mp.player_id
       LEFT JOIN player_stats_submissions pss
              ON pss.match_id = mp.match_id AND pss.player_id = mp.player_id
      WHERE mp.match_id = $1
      ORDER BY mp.team_no, p.name`,
    [matchId],
  );
  const rows = raw as Array<{
    player_id: number;
    name: string;
    team_no: number;
    goals: number;
    assists: number;
    md_goals: number | null;
    md_assists: number | null;
    sub_goals: number | null;
    sub_assists: number | null;
    sub_status: string | null;
  }>;
  return rows.map((r) => ({
    playerId: Number(r.player_id),
    name: r.name,
    teamNo: Number(r.team_no),
    goals: Number(r.goals),
    assists: Number(r.assists),
    matchdayGoals: matchdayUsed ? Number(r.md_goals ?? 0) : null,
    matchdayAssists: matchdayUsed ? Number(r.md_assists ?? 0) : null,
    submittedGoals: r.sub_goals == null ? null : Number(r.sub_goals),
    submittedAssists: r.sub_assists == null ? null : Number(r.sub_assists),
    submissionStatus: r.sub_status ?? null,
  }));
}

/**
 * Admin direct edit of a player's goals/assists for a match. Writes the
 * canonical `stats` row, keeps the submission/goal-claim mirror in sync (marked
 * approved by the admin so the player view matches), enables stats scoring for
 * the match, and logs a `stats_audit` entry. Bypasses the player submission /
 * review flow entirely.
 */
export async function setPlayerMatchStats(
  matchId: number,
  playerId: number,
  goals: number,
  assists: number,
  actor: string,
): Promise<void> {
  const priorRaw = await sqlClient.query(
    `SELECT goals, assists FROM stats WHERE match_id = $1 AND player_id = $2`,
    [matchId, playerId],
  );
  const priorRows = priorRaw as { goals: number; assists: number }[];
  const oldGoals = priorRows.length > 0 ? Number(priorRows[0].goals) : null;
  const oldAssists = priorRows.length > 0 ? Number(priorRows[0].assists) : null;

  await sqlClient.query(
    `INSERT INTO stats(match_id, player_id, goals, assists)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(match_id, player_id) DO UPDATE SET
       goals = EXCLUDED.goals,
       assists = EXCLUDED.assists`,
    [matchId, playerId, goals, assists],
  );

  await sqlClient.query(
    `INSERT INTO player_stats_submissions(match_id, player_id, goals, assists, status, reviewed_by, reviewed_at, created_at)
     VALUES ($1, $2, $3, $4, 'approved', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(match_id, player_id) DO UPDATE SET
       goals = EXCLUDED.goals,
       assists = EXCLUDED.assists,
       status = 'approved',
       reviewed_by = EXCLUDED.reviewed_by,
       reviewed_at = CURRENT_TIMESTAMP`,
    [matchId, playerId, goals, assists, actor],
  );

  await sqlClient.query(
    `INSERT INTO player_goals_claims(match_id, player_id, goals_claimed, status, reviewed_by, reviewed_at, created_at)
     VALUES ($1, $2, $3, 'approved', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(match_id, player_id) DO UPDATE SET
       goals_claimed = EXCLUDED.goals_claimed,
       status = 'approved',
       reviewed_by = EXCLUDED.reviewed_by,
       reviewed_at = CURRENT_TIMESTAMP`,
    [matchId, playerId, goals, actor],
  );

  await sqlClient.query(
    `INSERT INTO stats_audit(match_id, player_id, action, actor,
                             old_goals, new_goals, old_assists, new_assists, note)
     VALUES ($1, $2, 'admin_edit', $3, $4, $5, $6, $7, $8)`,
    [matchId, playerId, actor, oldGoals, goals, oldAssists, assists, "Admin direct edit"],
  );

  await sqlClient.query(`UPDATE matches SET stats_scoring_enabled = 1 WHERE id = $1`, [matchId]);
}


export async function submitPlayerStats(
  matchId: number,
  playerId: number,
  goals: number,
  assists: number,
): Promise<number> {
  const existingRaw = await sqlClient.query(
    `SELECT status FROM player_stats_submissions WHERE match_id = $1 AND player_id = $2`,
    [matchId, playerId],
  );
  const existing = existingRaw as { status: SubmissionStatus }[];
  if (existing.length > 0 && existing[0].status === "approved") {
    await sqlClient.query(`DELETE FROM stats WHERE match_id = $1 AND player_id = $2`, [
      matchId,
      playerId,
    ]);
  }

  const insertRaw = await sqlClient.query(
    `INSERT INTO player_stats_submissions(match_id, player_id, goals, assists, status, created_at)
     VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP)
     ON CONFLICT(match_id, player_id) DO UPDATE SET
       goals = EXCLUDED.goals,
       assists = EXCLUDED.assists,
       status = 'pending',
       reviewed_by = NULL,
       reviewed_at = NULL
     RETURNING id`,
    [matchId, playerId, goals, assists],
  );
  const submissionId = Number((insertRaw as { id: number }[])[0].id);

  await sqlClient.query(
    `INSERT INTO player_goals_claims(match_id, player_id, goals_claimed, status, created_at)
     VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP)
     ON CONFLICT(match_id, player_id) DO UPDATE SET
       goals_claimed = EXCLUDED.goals_claimed,
       status = 'pending',
       reviewed_by = NULL,
       reviewed_at = NULL`,
    [matchId, playerId, goals],
  );

  return submissionId;
}

interface SubmissionRow {
  match_id: number;
  player_id: number;
  goals: number;
  assists: number;
}

/**
 * Approve a submission. Optionally override goals/assists first. Writes the
 * approved `stats` row, marks the submission + goal claim approved, and logs a
 * stats_audit entry. Returns false if the submission id does not exist.
 */
export async function approveStatsSubmission(
  submissionId: number,
  actor: string,
  override?: { goals: number; assists: number },
): Promise<{ playerId: number; matchId: number } | null> {
  if (override) {
    await sqlClient.query(
      `UPDATE player_stats_submissions SET goals = $1, assists = $2 WHERE id = $3`,
      [override.goals, override.assists, submissionId],
    );
  }

  const subRaw = await sqlClient.query(
    `SELECT match_id, player_id, goals, assists FROM player_stats_submissions WHERE id = $1`,
    [submissionId],
  );
  const subRows = subRaw as SubmissionRow[];
  if (subRows.length === 0) return null;
  const { match_id, player_id, goals, assists } = subRows[0];

  // Prior approved values for the audit trail (null on first approval).
  const priorRaw = await sqlClient.query(
    `SELECT goals, assists FROM stats WHERE match_id = $1 AND player_id = $2`,
    [match_id, player_id],
  );
  const priorRows = priorRaw as { goals: number; assists: number }[];
  const oldGoals = priorRows.length > 0 ? Number(priorRows[0].goals) : null;
  const oldAssists = priorRows.length > 0 ? Number(priorRows[0].assists) : null;

  await sqlClient.query(
    `UPDATE player_stats_submissions
        SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = $2`,
    [actor, submissionId],
  );

  await sqlClient.query(
    `INSERT INTO stats(match_id, player_id, goals, assists)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(match_id, player_id) DO UPDATE SET
       goals = EXCLUDED.goals,
       assists = EXCLUDED.assists`,
    [match_id, player_id, goals, assists],
  );

  await sqlClient.query(
    `INSERT INTO player_goals_claims(match_id, player_id, goals_claimed, status, reviewed_by, reviewed_at, created_at)
     VALUES ($1, $2, $3, 'approved', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(match_id, player_id) DO UPDATE SET
       goals_claimed = EXCLUDED.goals_claimed,
       status = 'approved',
       reviewed_by = EXCLUDED.reviewed_by,
       reviewed_at = CURRENT_TIMESTAMP`,
    [match_id, player_id, goals, actor],
  );

  await sqlClient.query(
    `INSERT INTO stats_audit(match_id, player_id, action, actor,
                             old_goals, new_goals, old_assists, new_assists, note)
     VALUES ($1, $2, 'approve', $3, $4, $5, $6, $7, $8)`,
    [
      match_id,
      player_id,
      actor,
      oldGoals,
      goals,
      oldAssists,
      assists,
      "Approved from player submission",
    ],
  );

  return { playerId: Number(player_id), matchId: Number(match_id) };
}

/** Reject a submission. Marks the submission + goal claim rejected. */
export async function rejectStatsSubmission(
  submissionId: number,
  actor: string,
): Promise<boolean> {
  const subRaw = await sqlClient.query(
    `SELECT match_id, player_id FROM player_stats_submissions WHERE id = $1`,
    [submissionId],
  );
  const subRows = subRaw as { match_id: number; player_id: number }[];
  if (subRows.length === 0) return false;
  const { match_id, player_id } = subRows[0];

  await sqlClient.query(
    `UPDATE player_stats_submissions
        SET status = 'rejected', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = $2`,
    [actor, submissionId],
  );

  await sqlClient.query(
    `UPDATE player_goals_claims
        SET status = 'rejected', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
      WHERE match_id = $2 AND player_id = $3`,
    [actor, match_id, player_id],
  );

  return true;
}

/**
 * Rebuild the `stats` table from every approved submission and enable stats
 * scoring on the affected matches. Returns the number of stat rows written.
 */
export async function backfillApprovedStats(): Promise<number> {
  const raw = await sqlClient.query(
    `SELECT match_id, player_id, goals, assists
       FROM player_stats_submissions
      WHERE status = 'approved'`,
  );
  const rows = raw as SubmissionRow[];

  const matchIds = new Set<number>();
  for (const row of rows) {
    const matchId = Number(row.match_id);
    const playerId = Number(row.player_id);
    const goals = Number(row.goals ?? 0);
    const assists = Number(row.assists ?? 0);
    matchIds.add(matchId);
    await sqlClient.query(
      `INSERT INTO stats(match_id, player_id, goals, assists)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(match_id, player_id) DO UPDATE SET
         goals = EXCLUDED.goals,
         assists = EXCLUDED.assists`,
      [matchId, playerId, goals, assists],
    );
  }

  for (const matchId of matchIds) {
    await sqlClient.query(`UPDATE matches SET stats_scoring_enabled = 1 WHERE id = $1`, [
      matchId,
    ]);
  }

  return rows.length;
}
