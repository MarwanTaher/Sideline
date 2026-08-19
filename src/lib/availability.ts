import { sqlClient } from "@/lib/db";

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
  matchdayStatus: MatchdayStatus;
  maxPlayers: number;
  availabilityOpen: boolean;
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
  matchday_status: string | null;
  max_players: number | null;
  availability_open: number | null;
}

/** Load the minimal match meta needed by the availability screen, or null. */
export async function getAvailabilityMatch(
  matchId: number,
): Promise<AvailabilityMatch | null> {
  const raw = await sqlClient.query(
    `SELECT id, played_on, match_time, matchday_status,
            COALESCE(max_players, ${DEFAULT_MAX_PLAYERS}) AS max_players,
            COALESCE(availability_open, 1) AS availability_open
       FROM matches WHERE id = $1`,
    [matchId],
  );
  const rows = raw as MatchMetaRow[];
  if (rows.length === 0) return null;
  const m = rows[0];
  return {
    id: Number(m.id),
    playedOn: m.played_on ?? "",
    matchTime: m.match_time ?? "",
    matchdayStatus: normMatchday(m.matchday_status),
    maxPlayers: Number(m.max_players ?? DEFAULT_MAX_PLAYERS),
    availabilityOpen: Number(m.availability_open ?? 1) === 1,
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
// The match_availability.status CHECK constraint only allows 'in'/'out', so the
// waitlist is kept as an ordered list of player ids in app_settings, keyed per
// match. Order = join order, which gives a fair first-in promotion rule.

const WAITLIST_PREFIX = "waitlist_";

export async function getWaitlist(matchId: number): Promise<number[]> {
  const rows = (await sqlClient.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [`${WAITLIST_PREFIX}${matchId}`],
  )) as Array<{ value: string | null }>;
  const raw = rows[0]?.value ?? "";
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

async function saveWaitlist(matchId: number, ids: number[]): Promise<void> {
  const clean = Array.from(new Set(ids.filter((n) => Number.isInteger(n) && n > 0)));
  await sqlClient.query(
    `INSERT INTO app_settings(key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
    [`${WAITLIST_PREFIX}${matchId}`, clean.join(",")],
  );
}

/** Append a player to the waitlist (idempotent). Returns their 1-based spot. */
export async function addToWaitlist(matchId: number, playerId: number): Promise<number> {
  const list = await getWaitlist(matchId);
  if (!list.includes(playerId)) list.push(playerId);
  await saveWaitlist(matchId, list);
  return list.indexOf(playerId) + 1;
}

/** Remove a player from the waitlist if present. */
export async function removeFromWaitlist(matchId: number, playerId: number): Promise<void> {
  const list = await getWaitlist(matchId);
  const next = list.filter((id) => id !== playerId);
  if (next.length !== list.length) await saveWaitlist(matchId, next);
}

/** Move a waitlisted player one place up (-1) or down (+1). No-op at the edges. */
export async function moveWaitlistPlayer(
  matchId: number,
  playerId: number,
  direction: -1 | 1,
): Promise<void> {
  const list = await getWaitlist(matchId);
  const i = list.indexOf(playerId);
  if (i < 0) return;
  const j = i + direction;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await saveWaitlist(matchId, list);
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
  const rows = (await sqlClient.query(
    `SELECT p.active, COALESCE(ma.status, 'pending') AS status
       FROM players p
       LEFT JOIN match_availability ma ON ma.match_id = $1 AND ma.player_id = p.id
      WHERE p.id = $2`,
    [matchId, playerId],
  )) as Array<{ active: number; status: string }>;
  if (rows.length === 0) return false;
  if (Number(rows[0].active) !== 1) return false;
  if (rows[0].status === "in") return false;
  await setPlayerAvailability(matchId, playerId, "in");
  return true;
}
