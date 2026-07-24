import { sqlClient } from "@/lib/db";
import { POSITIONS, type Position } from "@/lib/positions";
import {
  SKILL_LEVELS,
  DEFAULT_SKILL_SCORE,
  MAX_GUESTS_PER_HOST,
  skillScoreFromKey,
  skillLabelFromScore,
  type SkillLevel,
  type Guest,
  type GuestStatus,
} from "@/lib/guests-shared";

// Re-export the client-safe catalog so existing server imports keep working.
export {
  SKILL_LEVELS,
  DEFAULT_SKILL_SCORE,
  MAX_GUESTS_PER_HOST,
  skillScoreFromKey,
  skillLabelFromScore,
};
export type { SkillLevel, Guest, GuestStatus };

interface GuestRow {
  id: number;
  match_id: number;
  host_player_id: number;
  host_name: string;
  name: string;
  position: string;
  skill: number;
  team_no: number | null;
  paid: number;
  status: string;
  created_at: string;
}

function normalizePosition(pos: string): Position {
  return (POSITIONS as readonly string[]).includes(pos) ? (pos as Position) : "MID";
}

function normalizeStatus(s: string): GuestStatus {
  return s === "pending" ? "pending" : "approved";
}

function mapRow(r: GuestRow): Guest {
  return {
    id: r.id,
    matchId: r.match_id,
    hostPlayerId: r.host_player_id,
    hostName: r.host_name,
    name: r.name,
    position: normalizePosition(r.position),
    skill: r.skill,
    teamNo: r.team_no,
    paid: r.paid === 1,
    status: normalizeStatus(r.status),
    createdAt: r.created_at,
  };
}

/** All guests for a match, with the host player's name resolved. */
export async function listGuests(matchId: number): Promise<Guest[]> {
  const rows = (await sqlClient.query(
    `SELECT g.id, g.match_id, g.host_player_id, p.name AS host_name, g.name,
            g.position, g.skill, g.team_no, g.paid, g.status, g.created_at
       FROM match_guests g
       JOIN players p ON p.id = g.host_player_id
      WHERE g.match_id = $1
      ORDER BY host_name, g.created_at`,
    [matchId],
  )) as unknown as GuestRow[];
  return rows.map(mapRow);
}

export class GuestError extends Error {}

interface AddGuestInput {
  matchId: number;
  hostPlayerId: number;
  name: string;
  position?: Position | null;
  skillKey?: string | null;
  /** Approval state to insert with. Player requests default to "pending". */
  status?: GuestStatus;
}

/**
 * Add a guest brought by a host. Enforces the per-host cap and that the match
 * is still open. Returns the new guest id.
 */
export async function addGuest(input: AddGuestInput): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new GuestError("Guest name is required.");
  if (name.length > 60) throw new GuestError("Guest name is too long.");

  const matchRows = (await sqlClient.query(
    `SELECT status, matchday_status FROM matches WHERE id = $1`,
    [input.matchId],
  )) as unknown as { status: string; matchday_status: string }[];
  const match = matchRows[0];
  if (!match) throw new GuestError("Match not found.");
  if (match.status === "closed" || match.matchday_status === "closed") {
    throw new GuestError("This match is closed.");
  }

  const hostRows = (await sqlClient.query(
    `SELECT id FROM players WHERE id = $1 AND active = 1`,
    [input.hostPlayerId],
  )) as unknown as { id: number }[];
  if (!hostRows[0]) throw new GuestError("Host player not found.");

  const countRows = (await sqlClient.query(
    `SELECT COUNT(*)::int AS n FROM match_guests WHERE match_id = $1 AND host_player_id = $2`,
    [input.matchId, input.hostPlayerId],
  )) as unknown as { n: number }[];
  if ((countRows[0]?.n ?? 0) >= MAX_GUESTS_PER_HOST) {
    throw new GuestError(`You can bring at most ${MAX_GUESTS_PER_HOST} guests.`);
  }

  const position = input.position ? normalizePosition(input.position) : "MID";
  const skill = skillScoreFromKey(input.skillKey);
  const status: GuestStatus = input.status === "pending" ? "pending" : "approved";

  const inserted = (await sqlClient.query(
    `INSERT INTO match_guests(match_id, host_player_id, name, position, skill, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.matchId, input.hostPlayerId, name, position, skill, status],
  )) as unknown as { id: number }[];
  return inserted[0].id;
}

/** Fetch a single guest by id within a match (or null). */
export async function getGuest(
  matchId: number,
  guestId: number,
): Promise<Guest | null> {
  const rows = (await sqlClient.query(
    `SELECT g.id, g.match_id, g.host_player_id, p.name AS host_name, g.name,
            g.position, g.skill, g.team_no, g.paid, g.status, g.created_at
       FROM match_guests g
       JOIN players p ON p.id = g.host_player_id
      WHERE g.match_id = $1 AND g.id = $2`,
    [matchId, guestId],
  )) as unknown as GuestRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Approve a pending guest request. */
export async function approveGuest(matchId: number, guestId: number): Promise<void> {
  await sqlClient.query(
    `UPDATE match_guests SET status = 'approved' WHERE id = $1 AND match_id = $2`,
    [guestId, matchId],
  );
}

/**
 * Remove a guest. When `hostPlayerId` is provided the caller must own the guest
 * (self-service removal); admins pass null to remove any guest.
 */
export async function removeGuest(
  matchId: number,
  guestId: number,
  hostPlayerId: number | null,
): Promise<void> {
  if (hostPlayerId == null) {
    await sqlClient.query(`DELETE FROM match_guests WHERE id = $1 AND match_id = $2`, [
      guestId,
      matchId,
    ]);
  } else {
    await sqlClient.query(
      `DELETE FROM match_guests WHERE id = $1 AND match_id = $2 AND host_player_id = $3`,
      [guestId, matchId, hostPlayerId],
    );
  }
}

/** Remove every guest for a match (used when the matchday is closed). */
export async function deleteGuestsForMatch(matchId: number): Promise<void> {
  await sqlClient.query(`DELETE FROM match_guests WHERE match_id = $1`, [matchId]);
}

/** Remove a host's guests (used when the host leaves the match). */
export async function deleteGuestsForHost(
  matchId: number,
  hostPlayerId: number,
): Promise<void> {
  await sqlClient.query(
    `DELETE FROM match_guests WHERE match_id = $1 AND host_player_id = $2`,
    [matchId, hostPlayerId],
  );
}

/** Set a guest's team assignment (null benches the guest). */
export async function updateGuestTeam(
  guestId: number,
  teamNo: number | null,
): Promise<void> {
  await sqlClient.query(`UPDATE match_guests SET team_no = $1 WHERE id = $2`, [teamNo, guestId]);
}

/** Set a guest's played position. */
export async function updateGuestPosition(
  guestId: number,
  position: Position,
): Promise<void> {
  await sqlClient.query(`UPDATE match_guests SET position = $1 WHERE id = $2`, [
    normalizePosition(position),
    guestId,
  ]);
}

/** Clear all guest team assignments for a match (used on draft reset/auto-balance). */
export async function clearGuestTeams(matchId: number): Promise<void> {
  await sqlClient.query(`UPDATE match_guests SET team_no = NULL WHERE match_id = $1`, [matchId]);
}

export async function setGuestPaid(
  matchId: number,
  guestId: number,
  paid: boolean,
): Promise<void> {
  await sqlClient.query(
    `UPDATE match_guests SET paid = $1 WHERE id = $2 AND match_id = $3`,
    [paid ? 1 : 0, guestId, matchId],
  );
}

/** Count approved guests for a match (for capacity + payment share). */
export async function countGuests(matchId: number): Promise<number> {
  const rows = (await sqlClient.query(
    `SELECT COUNT(*)::int AS n FROM match_guests WHERE match_id = $1 AND status = 'approved'`,
    [matchId],
  )) as unknown as { n: number }[];
  return rows[0]?.n ?? 0;
}
