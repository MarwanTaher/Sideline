import { sqlClient } from "@/lib/db";
import { kickoffAtSql } from "@/lib/kickoff-sql";
import { publicSignupSql } from "./availability-policy-sql";

export type AvailabilityStatus = "in" | "out" | "pending";
export type MatchdayStatus = "draft" | "active" | "closed";

export interface PlayerAvailability {
  playerId: number;
  name: string;
  preferredPosition: string;
  photoUrl: string | null;
  status: AvailabilityStatus;
  updatedAt: string | null;
}

export interface AvailabilitySummary {
  inCount: number;
  outCount: number;
  pendingCount: number;
}

export interface AvailabilityMatch {
  id: number;
  playedOn: string;
  matchTime: string;
  /** True kickoff instant as an ISO string, or null if never scheduled. */
  kickoffAt: string | null;
  matchdayStatus: MatchdayStatus;
  maxPlayers: number;
  availabilityOpen: boolean;
  signupOpensAt: string | null;
  automated: boolean;
  coreResponsesOpen: boolean;
  baseMinutes: number;
  extensionMinutes: number;
  extended: boolean;
}

function normMatchday(value: unknown): MatchdayStatus {
  const s = String(value ?? "draft").toLowerCase();
  return s === "active" || s === "closed" ? s : "draft";
}

/** Default cap on how many players can mark themselves IN for a match. */
export const DEFAULT_MAX_PLAYERS = 18;

interface MatchMetaRow {
  id: number;
  played_on: string | null;
  match_time: string | null;
  kickoff_at: string | Date | null;
  matchday_status: string | null;
  max_players: number | null;
  availability_open: number | null;
  signup_opens_at: string | Date | null;
  automated: boolean;
  core_responses_open: boolean;
  base_minutes: number;
  extension_minutes: number;
  extended: boolean;
}

/** Load the minimal match meta needed by the availability screen, or null. */
export async function getAvailabilityMatch(
  matchId: number,
): Promise<AvailabilityMatch | null> {
  const raw = await sqlClient.query(
    `SELECT id, played_on, match_time, ${kickoffAtSql()} AS kickoff_at, matchday_status,
            COALESCE(max_players, ${DEFAULT_MAX_PLAYERS}) AS max_players,
            (${publicSignupSql()}::int) AS availability_open, signup_opens_at,base_minutes,extension_minutes,extended,
            EXISTS(SELECT 1 FROM season_match_occurrences WHERE match_id=m.id) AS automated,
            EXISTS(SELECT 1 FROM season_match_occurrences o
              JOIN season_match_automation a ON a.season_id=o.season_id
              JOIN seasons s ON s.id=o.season_id
              WHERE o.match_id=m.id AND o.state='scheduled' AND a.enabled AND NOT a.paused
                AND s.status='active' AND s.subscription_enabled AND s.visible_to_players
                AND m.availability_override IS DISTINCT FROM 'closed'
                AND m.matchday_status <> 'closed') AS core_responses_open
       FROM matches m WHERE id = $1`,
    [matchId],
  );
  const rows = raw as MatchMetaRow[];
  if (rows.length === 0) return null;
  const m = rows[0];
  return {
    id: Number(m.id),
    playedOn: m.played_on ?? "",
    matchTime: m.match_time ?? "",
    kickoffAt:
      m.kickoff_at == null
        ? null
        : m.kickoff_at instanceof Date
          ? m.kickoff_at.toISOString()
          : String(m.kickoff_at),
    matchdayStatus: normMatchday(m.matchday_status),
    maxPlayers: Number(m.max_players ?? DEFAULT_MAX_PLAYERS),
    availabilityOpen: Number(m.availability_open ?? 1) === 1,
    signupOpensAt: m.signup_opens_at == null ? null : new Date(m.signup_opens_at).toISOString(),
    automated: m.automated,
    coreResponsesOpen: m.core_responses_open,
    baseMinutes: m.base_minutes,
    extensionMinutes: m.extension_minutes,
    extended: m.extended,
  };
}

interface AvailabilityRow {
  player_id: number;
  name: string;
  preferred_position: string | null;
  photo_url: string | null;
  status: string;
  updated_at: string | null;
}

/**
 * Every active player with their in/out/pending status for a match.
 * Players with no row are reported as "pending" (synthetic — never stored).
 * Ordered in → pending → out, then by name (direct port of the Streamlit query).
 */
export async function getAvailabilityAllPlayers(
  matchId: number,
): Promise<PlayerAvailability[]> {
  const raw = await sqlClient.query(
    `SELECT p.id AS player_id, p.name, p.preferred_position, p.photo_url,
            COALESCE(ma.status, 'pending') AS status,
            ma.updated_at
       FROM players p
       LEFT JOIN match_availability ma
              ON ma.match_id = $1 AND ma.player_id = p.id
      WHERE p.active = 1
      ORDER BY
        CASE COALESCE(ma.status, 'pending')
          WHEN 'in' THEN 0
          WHEN 'pending' THEN 1
          WHEN 'out' THEN 2
        END,
        p.name`,
    [matchId],
  );
  const rows = raw as AvailabilityRow[];
  return rows.map((r) => ({
    playerId: Number(r.player_id),
    name: r.name,
    preferredPosition: r.preferred_position ?? "",
    photoUrl: r.photo_url ?? null,
    status: (r.status === "in" || r.status === "out" ? r.status : "pending") as AvailabilityStatus,
    updatedAt: r.updated_at ?? null,
  }));
}

export function summarize(players: PlayerAvailability[]): AvailabilitySummary {
  let inCount = 0;
  let outCount = 0;
  let pendingCount = 0;
  for (const p of players) {
    if (p.status === "in") inCount++;
    else if (p.status === "out") outCount++;
    else pendingCount++;
  }
  return { inCount, outCount, pendingCount };
}

/**
 * Upsert a single player's in/out availability for a match.
 * Mirrors `_set_player_availability` in the Streamlit app.
 */
export async function setPlayerAvailability(
  matchId: number,
  playerId: number,
  status: "in" | "out",
): Promise<void> {
  await sqlClient.query(
    `INSERT INTO match_availability (match_id, player_id, status, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (match_id, player_id)
     DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP`,
    [matchId, playerId, status],
  );
}

/**
 * Clear a player's stored availability for a match, returning them to the
 * synthetic "pending" state (no row = pending).
 */
export async function clearPlayerAvailability(
  matchId: number,
  playerId: number,
): Promise<void> {
  await sqlClient.query(
    `DELETE FROM match_availability WHERE match_id = $1 AND player_id = $2`,
    [matchId, playerId],
  );
}

/** How many active players are currently marked IN for a match. */
export async function countInPlayers(matchId: number): Promise<number> {
  const raw = await sqlClient.query(
    `SELECT COUNT(*) AS c
       FROM match_availability ma
       JOIN players p ON p.id = ma.player_id AND p.active = 1
      WHERE ma.match_id = $1 AND ma.status = 'in'`,
    [matchId],
  );
  const rows = raw as { c: number }[];
  return Number(rows[0]?.c ?? 0);
}

/** A single player's stored availability for a match ("pending" when no row). */
export async function getPlayerAvailabilityStatus(
  matchId: number,
  playerId: number,
): Promise<AvailabilityStatus> {
  const rows = (await sqlClient.query(
    `SELECT status FROM match_availability WHERE match_id = $1 AND player_id = $2`,
    [matchId, playerId],
  )) as Array<{ status: string }>;
  const s = rows[0]?.status;
  return s === "in" || s === "out" ? s : "pending";
}

// ── Waitlist (#9) ──────────────────────────────────────────────────────────
export async function getWaitlist(matchId: number): Promise<number[]> {
  const rows = (await sqlClient.query(
    `SELECT w.player_id FROM match_waitlist w JOIN players p ON p.id=w.player_id
     WHERE w.match_id=$1 AND p.active=1 AND p.deleted_at IS NULL
       AND NOT EXISTS(SELECT 1 FROM match_availability a WHERE a.match_id=$1 AND a.player_id=w.player_id AND a.status='in')
     ORDER BY w.position,w.player_id`,
    [matchId],
  )) as Array<{ player_id: number }>;
  return rows.map((row) => Number(row.player_id));
}

/** Append a player to the waitlist (idempotent). Returns their 1-based spot. */
export async function addToWaitlist(matchId: number, playerId: number): Promise<number> {
  const rows = await sqlClient.query(`SELECT sideline_waitlist_edit($1,$2,'join') AS spot`, [matchId, playerId]);
  return Number(rows[0].spot);
}

/** Remove a player from the waitlist if present. */
export async function removeFromWaitlist(matchId: number, playerId: number): Promise<void> {
  await sqlClient.query(`SELECT sideline_waitlist_edit($1,$2,'leave')`, [matchId, playerId]);
}

/** Move a waitlisted player one place up (-1) or down (+1). No-op at the edges. */
export async function moveWaitlistPlayer(
  matchId: number,
  playerId: number,
  direction: -1 | 1,
): Promise<void> {
  await sqlClient.query(`SELECT sideline_waitlist_edit($1,$2,$3)`, [matchId, playerId, direction === -1 ? "up" : "down"]);
}

/** The waitlisted players (id, name) in join order — for the admin view. */
export async function getWaitlistPlayers(
  matchId: number,
): Promise<{ playerId: number; name: string }[]> {
  const ids = await getWaitlist(matchId);
  if (ids.length === 0) return [];
  const raw = (await sqlClient.query(
    `SELECT id, name FROM players WHERE id = ANY($1::int[])`,
    [ids],
  )) as Array<{ id: number; name: string }>;
  const byId = new Map(raw.map((r) => [Number(r.id), r.name]));
  return ids
    .filter((id) => byId.has(id))
    .map((id) => ({ playerId: id, name: byId.get(id) as string }));
}

/**
 * Promote a waitlisted player into the match if they are still active and not
 * already IN. Returns true when they were moved to IN.
 */
export async function promoteWaitlistCandidate(
  matchId: number,
  playerId: number,
): Promise<boolean> {
  const rows = await sqlClient.query(`SELECT sideline_promote_waitlist($1,$2) AS promoted`, [matchId, playerId]);
  return rows[0].promoted === true;
}

export async function respondToMatch(matchId: number, playerId: number, status: "in" | "out", waitlist: boolean): Promise<string> {
  const rows = await sqlClient.query(`SELECT sideline_respond($1,$2,$3,$4) AS result`, [matchId, playerId, status, waitlist]);
  return String(rows[0].result);
}

export async function assertPublicResponse(matchId: number, playerId: number): Promise<void> {
  await sqlClient.query(`SELECT sideline_assert_response($1,$2,true)`, [matchId, playerId]);
}

export async function assertPlayerResponse(matchId: number, playerId: number): Promise<void> {
  await sqlClient.query(`SELECT sideline_assert_response($1,$2,false)`, [matchId, playerId]);
}
