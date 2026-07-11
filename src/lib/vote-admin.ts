import { sqlClient } from "@/lib/db";
import { fmtDate } from "@/lib/matches";

import { SCOPE_OPTIONS, type ScopeStatus } from "@/lib/vote-admin-constants";
export { SCOPE_OPTIONS, type ScopeStatus };

export type OutlierSensitivity = "strict" | "normal" | "lenient";

const IQR_MULTIPLIER: Record<OutlierSensitivity, number> = {
  strict: 1.0,
  normal: 1.5,
  lenient: 2.0,
};

/**
 * Minimum half-width of the acceptable band around the median, used as a floor
 * when the IQR is tiny/zero (e.g. most voters agree on one rating). Prevents
 * harmless small deviations (4 or 6 around a cluster of 5s) from being flagged
 * while still catching genuinely wild votes (0, 1 or 9, 10). The band is only
 * ever widened by this floor, never narrowed, so it can only reduce flags.
 */
const MIN_HALF_BAND: Record<OutlierSensitivity, number> = {
  strict: 1.5, // keep median ±1; flag deviations of 2+ (…3,7…)
  normal: 2.5, // keep median ±2; flag deviations of 3+ (…2,8…)
  lenient: 3.5, // keep median ±3; flag deviations of 4+ (…1,9…)
};

export interface VoteControls {
  rating: number;
  includeInCalculation: number;
  scopeStatus: ScopeStatus;
}

export interface VoteReviewRow {
  matchId: number;
  playedOn: string;
  voterId: number;
  voterName: string;
  votedForId: number;
  votedForName: string;
  rating: number;
  createdAt: string;
  updatedAt: string;
  includeInCalculation: number;
  scopeStatus: ScopeStatus;
}

export interface VoteAuditRow {
  changedAt: string;
  actor: string;
  action: string;
  matchId: number;
  voterName: string;
  votedForName: string;
  oldRating: number | null;
  newRating: number | null;
  oldInclude: number | null;
  newInclude: number | null;
  oldScopeStatus: string | null;
  newScopeStatus: string | null;
  note: string;
}

export interface MatchOption {
  id: number;
  label: string;
}

export interface ParticipantOption {
  id: number;
  name: string;
}

export interface VoteReviewCounts {
  total: number;
  inScope: number;
  exceptions: number;
}

/**
 * Mirror of the Streamlit `normalize_vote_controls`: the scope status drives
 * the include flag except when it's a neutral in_scope, where the operator's
 * checkbox choice is honoured.
 */
export function normalizeVoteControls(
  include: boolean,
  scopeStatus: string,
): { include: number; scope: ScopeStatus } {
  const scope = (SCOPE_OPTIONS as string[]).includes(scopeStatus)
    ? (scopeStatus as ScopeStatus)
    : "in_scope";
  if (scope === "in_scope") return { include: include ? 1 : 0, scope };
  if (scope === "out_of_scope" || scope === "removed_from_calculation") {
    return { include: 0, scope };
  }
  return { include: include ? 1 : 0, scope };
}

function normScope(value: unknown): ScopeStatus {
  const s = String(value ?? "in_scope");
  return (SCOPE_OPTIONS as string[]).includes(s) ? (s as ScopeStatus) : "in_scope";
}

/** Insert a vote_audit row. old/new controls null => that side is blank. */
async function logVoteAudit(
  matchId: number,
  voterId: number,
  votedForId: number,
  action: string,
  actor: string,
  oldVote: VoteControls | null,
  newVote: VoteControls | null,
  note = "",
): Promise<void> {
  await sqlClient.query(
    `INSERT INTO vote_audit(
       match_id, voter_id, voted_for_id, action, actor,
       old_rating, new_rating,
       old_include, new_include,
       old_scope_status, new_scope_status,
       note
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      matchId,
      voterId,
      votedForId,
      action,
      actor,
      oldVote === null ? null : oldVote.rating,
      newVote === null ? null : newVote.rating,
      oldVote === null ? null : oldVote.includeInCalculation,
      newVote === null ? null : newVote.includeInCalculation,
      oldVote === null ? null : oldVote.scopeStatus,
      newVote === null ? null : newVote.scopeStatus,
      note,
    ],
  );
}

interface MatchRow {
  id: number;
  played_on: string;
}

export async function listMatchesForReview(): Promise<MatchOption[]> {
  const raw = (await sqlClient.query(
    `SELECT id, played_on FROM matches ORDER BY played_on DESC, id DESC`,
  )) as unknown as MatchRow[];
  return raw.map((m) => ({ id: m.id, label: `Match ${m.id} (${fmtDate(m.played_on)})` }));
}

interface ReviewRawRow {
  match_id: number;
  played_on: string;
  voter_id: number;
  voter_name: string;
  voted_for_id: number;
  voted_for_name: string;
  rating: number;
  created_at: string;
  updated_at: string;
  include_in_calculation: number;
  scope_status: string;
}

/** matchId=0 => all matches. */
export async function getVotesForReview(matchId: number): Promise<VoteReviewRow[]> {
  const where = matchId !== 0 ? "WHERE v.match_id = $1" : "";
  const params = matchId !== 0 ? [matchId] : [];
  const raw = (await sqlClient.query(
    `SELECT v.match_id,
            m.played_on,
            v.voter_id,
            pv.name AS voter_name,
            v.voted_for_id,
            pt.name AS voted_for_name,
            v.rating,
            v.created_at,
            COALESCE(v.updated_at, v.created_at) AS updated_at,
            COALESCE(v.include_in_calculation, 1) AS include_in_calculation,
            COALESCE(v.scope_status, 'in_scope') AS scope_status
     FROM votes v
     JOIN matches m ON m.id = v.match_id
     JOIN players pv ON pv.id = v.voter_id
     JOIN players pt ON pt.id = v.voted_for_id
     ${where}
     ORDER BY m.played_on DESC, v.match_id DESC, updated_at DESC`,
    params,
  )) as unknown as ReviewRawRow[];
  return raw.map((r) => ({
    matchId: r.match_id,
    playedOn: r.played_on,
    voterId: r.voter_id,
    voterName: r.voter_name,
    votedForId: r.voted_for_id,
    votedForName: r.voted_for_name,
    rating: r.rating,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    includeInCalculation: r.include_in_calculation,
    scopeStatus: normScope(r.scope_status),
  }));
}

export function reviewCounts(rows: VoteReviewRow[]): VoteReviewCounts {
  const inScope = rows.filter((r) => r.scopeStatus === "in_scope").length;
  return { total: rows.length, inScope, exceptions: rows.length - inScope };
}

interface AuditRawRow {
  changed_at: string;
  actor: string;
  action: string;
  match_id: number;
  voter_name: string;
  voted_for_name: string;
  old_rating: number | null;
  new_rating: number | null;
  old_include: number | null;
  new_include: number | null;
  old_scope_status: string | null;
  new_scope_status: string | null;
  note: string;
}

export async function getVoteAuditRows(matchId: number): Promise<VoteAuditRow[]> {
  const where = matchId !== 0 ? "WHERE va.match_id = $1" : "";
  const params = matchId !== 0 ? [matchId] : [];
  const raw = (await sqlClient.query(
    `SELECT va.changed_at,
            va.actor,
            va.action,
            va.match_id,
            pv.name AS voter_name,
            pt.name AS voted_for_name,
            va.old_rating,
            va.new_rating,
            va.old_include,
            va.new_include,
            va.old_scope_status,
            va.new_scope_status,
            COALESCE(va.note, '') AS note
     FROM vote_audit va
     JOIN players pv ON pv.id = va.voter_id
     JOIN players pt ON pt.id = va.voted_for_id
     ${where}
     ORDER BY va.changed_at DESC, va.id DESC
     LIMIT 200`,
    params,
  )) as unknown as AuditRawRow[];
  return raw.map((r) => ({
    changedAt: r.changed_at,
    actor: r.actor,
    action: r.action,
    matchId: r.match_id,
    voterName: r.voter_name,
    votedForName: r.voted_for_name,
    oldRating: r.old_rating,
    newRating: r.new_rating,
    oldInclude: r.old_include,
    newInclude: r.new_include,
    oldScopeStatus: r.old_scope_status,
    newScopeStatus: r.new_scope_status,
    note: r.note,
  }));
}

interface ParticipantRawRow {
  id: number;
  name: string;
}

export async function getMatchParticipants(matchId: number): Promise<ParticipantOption[]> {
  const raw = (await sqlClient.query(
    `SELECT p.id, p.name
     FROM match_players mp
     JOIN players p ON p.id = mp.player_id
     WHERE mp.match_id = $1
     ORDER BY p.name`,
    [matchId],
  )) as unknown as ParticipantRawRow[];
  return raw.map((r) => ({ id: r.id, name: r.name }));
}

async function getExistingVote(
  matchId: number,
  voterId: number,
  votedForId: number,
): Promise<VoteControls | null> {
  const raw = (await sqlClient.query(
    `SELECT rating,
            COALESCE(include_in_calculation, 1) AS include_in_calculation,
            COALESCE(scope_status, 'in_scope') AS scope_status
     FROM votes
     WHERE match_id = $1 AND voter_id = $2 AND voted_for_id = $3`,
    [matchId, voterId, votedForId],
  )) as unknown as {
    rating: number;
    include_in_calculation: number;
    scope_status: string;
  }[];
  if (raw.length === 0) return null;
  return {
    rating: raw[0].rating,
    includeInCalculation: raw[0].include_in_calculation,
    scopeStatus: normScope(raw[0].scope_status),
  };
}

async function countVotesByVoter(matchId: number, voterId: number): Promise<number> {
  const raw = (await sqlClient.query(
    `SELECT COUNT(*)::int AS count FROM votes WHERE match_id = $1 AND voter_id = $2`,
    [matchId, voterId],
  )) as unknown as { count: number }[];
  return raw.length ? raw[0].count : 0;
}

async function fetchVote(
  matchId: number,
  voterId: number,
  votedForId: number,
): Promise<VoteControls> {
  const existing = await getExistingVote(matchId, voterId, votedForId);
  if (!existing) throw new Error("Vote not found.");
  return existing;
}

export interface VoteKey {
  matchId: number;
  voterId: number;
  votedForId: number;
}

/** Edit a vote's rating/include/scope. Records an `edit` audit row. */
export async function editVote(
  key: VoteKey,
  input: { rating: number; include: boolean; scopeStatus: string },
  actor: string,
): Promise<void> {
  const old = await fetchVote(key.matchId, key.voterId, key.votedForId);
  const { include, scope } = normalizeVoteControls(input.include, input.scopeStatus);
  await sqlClient.query(
    `UPDATE votes
     SET rating = $1, include_in_calculation = $2, scope_status = $3, updated_at = CURRENT_TIMESTAMP
     WHERE match_id = $4 AND voter_id = $5 AND voted_for_id = $6`,
    [input.rating, include, scope, key.matchId, key.voterId, key.votedForId],
  );
  await logVoteAudit(key.matchId, key.voterId, key.votedForId, "edit", actor, old, {
    rating: input.rating,
    includeInCalculation: include,
    scopeStatus: scope,
  });
}

/** Reset a vote to rating 3 / include 1 / in_scope. */
export async function resetVote(key: VoteKey, actor: string): Promise<void> {
  const old = await fetchVote(key.matchId, key.voterId, key.votedForId);
  await sqlClient.query(
    `UPDATE votes
     SET rating = 3, include_in_calculation = 1, scope_status = 'in_scope', updated_at = CURRENT_TIMESTAMP
     WHERE match_id = $1 AND voter_id = $2 AND voted_for_id = $3`,
    [key.matchId, key.voterId, key.votedForId],
  );
  await logVoteAudit(key.matchId, key.voterId, key.votedForId, "reset", actor, old, {
    rating: 3,
    includeInCalculation: 1,
    scopeStatus: "in_scope",
  });
}

/** Exclude a vote from the calculation (removed_from_calculation). */
export async function excludeVote(key: VoteKey, actor: string): Promise<void> {
  const old = await fetchVote(key.matchId, key.voterId, key.votedForId);
  await sqlClient.query(
    `UPDATE votes
     SET include_in_calculation = 0, scope_status = 'removed_from_calculation', updated_at = CURRENT_TIMESTAMP
     WHERE match_id = $1 AND voter_id = $2 AND voted_for_id = $3`,
    [key.matchId, key.voterId, key.votedForId],
  );
  await logVoteAudit(key.matchId, key.voterId, key.votedForId, "exclude", actor, old, {
    rating: old.rating,
    includeInCalculation: 0,
    scopeStatus: "removed_from_calculation",
  });
}

/**
 * Delete a vote. When the voter has no remaining votes for the match, their
 * stat submission / approved stats / goal claim are rolled back to pending,
 * exactly as the Streamlit app does.
 */
export async function deleteVote(key: VoteKey, actor: string): Promise<void> {
  const old = await fetchVote(key.matchId, key.voterId, key.votedForId);
  await sqlClient.query(
    `DELETE FROM votes WHERE match_id = $1 AND voter_id = $2 AND voted_for_id = $3`,
    [key.matchId, key.voterId, key.votedForId],
  );
  await logVoteAudit(key.matchId, key.voterId, key.votedForId, "delete", actor, old, null);

  const remaining = await countVotesByVoter(key.matchId, key.voterId);
  if (remaining === 0) {
    await sqlClient.query(
      `UPDATE player_stats_submissions
       SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
       WHERE match_id = $1 AND player_id = $2`,
      [key.matchId, key.voterId],
    );
    await sqlClient.query(`DELETE FROM stats WHERE match_id = $1 AND player_id = $2`, [
      key.matchId,
      key.voterId,
    ]);
    await sqlClient.query(
      `UPDATE player_goals_claims
       SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
       WHERE match_id = $1 AND player_id = $2`,
      [key.matchId, key.voterId],
    );
  }
}

/** Insert or update a vote (admin add). Records `add` or `update`. */
export async function addOrUpdateVote(
  key: VoteKey,
  input: { rating: number; include: boolean; scopeStatus: string },
  actor: string,
): Promise<void> {
  const existing = await getExistingVote(key.matchId, key.voterId, key.votedForId);
  const { include, scope } = normalizeVoteControls(input.include, input.scopeStatus);
  await sqlClient.query(
    `INSERT INTO votes(match_id, voter_id, voted_for_id, rating, created_at, updated_at, include_in_calculation, scope_status)
     VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$5,$6)
     ON CONFLICT(match_id, voter_id, voted_for_id) DO UPDATE SET
       rating = EXCLUDED.rating,
       include_in_calculation = EXCLUDED.include_in_calculation,
       scope_status = EXCLUDED.scope_status,
       updated_at = CURRENT_TIMESTAMP`,
    [key.matchId, key.voterId, key.votedForId, input.rating, include, scope],
  );
  await logVoteAudit(
    key.matchId,
    key.voterId,
    key.votedForId,
    existing ? "update" : "add",
    actor,
    existing,
    { rating: input.rating, includeInCalculation: include, scopeStatus: scope },
  );
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const xs = [...values].sort((a, b) => a - b);
  if (xs.length === 1) return xs[0];
  const idx = (xs.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.min(low + 1, xs.length - 1);
  const frac = idx - low;
  return xs[low] * (1 - frac) + xs[high] * frac;
}

interface OutlierRawRow {
  match_id: number;
  voter_id: number;
  voted_for_id: number;
  rating: number;
  include_in_calculation: number;
  scope_status: string;
  voter_name: string;
  voted_for_name: string;
}

/** A vote the detector considers an outlier, with the acceptable band. */
export interface OutlierCandidate {
  matchId: number;
  voterId: number;
  votedForId: number;
  voterName: string;
  votedForName: string;
  rating: number;
  /** Inclusive-ish acceptable band the rating fell outside of. */
  low: number;
  high: number;
  /** Median rating of the bucket (the group's consensus). */
  median: number;
  includeInCalculation: number;
  scopeStatus: ScopeStatus;
  /** Already excluded from the calculation (a re-run would be a no-op). */
  alreadyOutOfScope: boolean;
}

/**
 * Detect statistical outlier votes (per match+target bucket via IQR fences,
 * with a median floor so tight clusters only flag genuinely wild votes).
 * Buckets with fewer than 4 votes are skipped. matchId=0 scans every match.
 * Pure read — does not modify any data. Used for the admin preview and as the
 * basis for {@link autoFlagOutliers}.
 */
export async function detectOutliers(
  matchId: number,
  sensitivity: OutlierSensitivity,
): Promise<OutlierCandidate[]> {
  const mult = IQR_MULTIPLIER[sensitivity];
  const minHalf = MIN_HALF_BAND[sensitivity];
  const raw = (await sqlClient.query(
    `SELECT v.match_id, v.voter_id, v.voted_for_id, v.rating,
            COALESCE(v.include_in_calculation, 1) AS include_in_calculation,
            COALESCE(v.scope_status, 'in_scope') AS scope_status,
            voter.name AS voter_name,
            target.name AS voted_for_name
       FROM votes v
       JOIN players voter ON voter.id = v.voter_id
       JOIN players target ON target.id = v.voted_for_id`,
  )) as unknown as OutlierRawRow[];

  const rows = raw.filter((r) => matchId === 0 || r.match_id === matchId);
  const grouped = new Map<string, OutlierRawRow[]>();
  for (const r of rows) {
    const gkey = `${r.match_id}:${r.voted_for_id}`;
    const bucket = grouped.get(gkey);
    if (bucket) bucket.push(r);
    else grouped.set(gkey, [r]);
  }

  const candidates: OutlierCandidate[] = [];
  for (const bucket of grouped.values()) {
    if (bucket.length < 4) continue;
    const vals = bucket.map((x) => x.rating);
    const q1 = percentile(vals, 0.25);
    const q3 = percentile(vals, 0.75);
    const iqr = q3 - q1;
    const med = percentile(vals, 0.5);
    // Use whichever band is wider: the IQR fences or the median floor. This
    // keeps small deviations around a tight cluster from being flagged while
    // still catching wild votes.
    const low = Math.min(q1 - mult * iqr, med - minHalf);
    const high = Math.max(q3 + mult * iqr, med + minHalf);
    for (const vote of bucket) {
      if (vote.rating < low || vote.rating > high) {
        candidates.push({
          matchId: vote.match_id,
          voterId: vote.voter_id,
          votedForId: vote.voted_for_id,
          voterName: vote.voter_name,
          votedForName: vote.voted_for_name,
          rating: vote.rating,
          low,
          high,
          median: med,
          includeInCalculation: vote.include_in_calculation,
          scopeStatus: normScope(vote.scope_status),
          alreadyOutOfScope: vote.include_in_calculation === 0,
        });
      }
    }
  }
  return candidates;
}

/**
 * Flag statistical outlier votes as out_of_scope. Buckets with fewer than 4
 * votes are skipped. matchId=0 scans every match. Votes already excluded from
 * the calculation are left untouched (so re-runs are idempotent). Returns the
 * number of votes newly flagged.
 */
export async function autoFlagOutliers(
  matchId: number,
  sensitivity: OutlierSensitivity,
  actor: string,
): Promise<number> {
  const candidates = await detectOutliers(matchId, sensitivity);
  let flagged = 0;
  for (const c of candidates) {
    if (c.alreadyOutOfScope) continue;
    await sqlClient.query(
      `UPDATE votes
       SET include_in_calculation = 0, scope_status = 'out_of_scope', updated_at = CURRENT_TIMESTAMP
       WHERE match_id = $1 AND voter_id = $2 AND voted_for_id = $3`,
      [c.matchId, c.voterId, c.votedForId],
    );
    await logVoteAudit(
      c.matchId,
      c.voterId,
      c.votedForId,
      "mark_out_of_scope",
      actor,
      {
        rating: c.rating,
        includeInCalculation: c.includeInCalculation,
        scopeStatus: c.scopeStatus,
      },
      { rating: c.rating, includeInCalculation: 0, scopeStatus: "out_of_scope" },
      `Detected as statistical outlier (${sensitivity})`,
    );
    flagged++;
  }
  return flagged;
}
