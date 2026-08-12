import { randomBytes } from "node:crypto";
import { sqlClient } from "./db";
import { getActiveLinkCounts } from "./access-tokens";

export const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type Position = (typeof POSITIONS)[number];

export interface PlayerRow {
  id: number;
  name: string;
  preferredPosition: string;
  active: boolean;
  hasPassword: boolean;
  activeLinkCount: number;
  email: string | null;
  phone: string | null;
}

export interface ResetRequestRow {
  id: number;
  playerId: number;
  name: string;
  requestedAt: string;
  existingToken: string | null;
}

export interface PlayersAdminData {
  players: PlayerRow[];
  activeCount: number;
  inactiveCount: number;
  resetRequests: ResetRequestRow[];
}

function isValidPosition(pos: string): pos is Position {
  return (POSITIONS as readonly string[]).includes(pos);
}

/** Full roster snapshot plus pending password-reset requests for the admin page. */
export async function getPlayersAdminData(): Promise<PlayersAdminData> {
  const players = (await sqlClient.query(
    `
    SELECT p.id, p.name, p.preferred_position, p.active, p.email, p.phone,
           CASE WHEN c.player_id IS NULL THEN 0 ELSE 1 END AS has_password
    FROM players p
    LEFT JOIN player_credentials c ON c.player_id = p.id
    WHERE p.deleted_at IS NULL
    ORDER BY p.active DESC, LOWER(p.name) ASC
    `,
  )) as unknown as Array<{
    id: number;
    name: string;
    preferred_position: string;
    active: number;
    email: string | null;
    phone: string | null;
    has_password: number;
  }>;

  const linkCounts = await getActiveLinkCounts();

  const rows: PlayerRow[] = players.map((p) => ({
    id: Number(p.id),
    name: String(p.name),
    preferredPosition: String(p.preferred_position),
    active: Number(p.active) === 1,
    hasPassword: Number(p.has_password) === 1,
    activeLinkCount: linkCounts.get(Number(p.id)) ?? 0,
    email: p.email ?? null,
    phone: p.phone ?? null,
  }));

  const resetRows = (await sqlClient.query(
    `
    SELECT pr.id, pr.player_id, p.name, pr.requested_at
    FROM password_reset_requests pr
    JOIN players p ON p.id = pr.player_id
    WHERE pr.status = 'pending'
    ORDER BY pr.requested_at ASC
    `,
  )) as unknown as Array<{
    id: number;
    player_id: number;
    name: string;
    requested_at: string;
  }>;

  const resetRequests: ResetRequestRow[] = [];
  for (const req of resetRows) {
    const tokenRows = (await sqlClient.query(
      `
      SELECT token FROM password_reset_tokens
      WHERE player_id = $1 AND used = 0 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY id DESC LIMIT 1
      `,
      [Number(req.player_id)],
    )) as unknown as Array<{ token: string }>;
    resetRequests.push({
      id: Number(req.id),
      playerId: Number(req.player_id),
      name: String(req.name),
      requestedAt: String(req.requested_at),
      existingToken: tokenRows.length > 0 ? String(tokenRows[0].token) : null,
    });
  }

  return {
    players: rows,
    activeCount: rows.filter((r) => r.active).length,
    inactiveCount: rows.filter((r) => !r.active).length,
    resetRequests,
  };
}

/** Insert a new active player. Throws on duplicate name (players.name is UNIQUE). */
export async function createPlayer(name: string, position: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Player name is required.");
  const pos = isValidPosition(position) ? position : "MID";
  await sqlClient.query(
    "INSERT INTO players (name, preferred_position, active) VALUES ($1, $2, 1)",
    [trimmed, pos],
  );
}

/** Error thrown when a chosen name is already taken (case-insensitive). */
export class DuplicateNameError extends Error {
  constructor() {
    super("That name is already taken.");
    this.name = "DuplicateNameError";
  }
}

/**
 * Insert a new self-registered player (instantly active) and return its id.
 * Names must be unique case-insensitively; throws {@link DuplicateNameError}
 * when the name already exists.
 */
export async function createSelfRegisteredPlayer(
  name: string,
  position: string,
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Player name is required.");
  const pos = isValidPosition(position) ? position : "MID";

  const existing = (await sqlClient.query(
    "SELECT 1 FROM players WHERE LOWER(name) = LOWER($1) LIMIT 1",
    [trimmed],
  )) as unknown as Array<unknown>;
  if (existing.length > 0) throw new DuplicateNameError();

  try {
    const rows = (await sqlClient.query(
      "INSERT INTO players (name, preferred_position, active) VALUES ($1, $2, 1) RETURNING id",
      [trimmed, pos],
    )) as unknown as Array<{ id: number }>;
    return Number(rows[0].id);
  } catch (err) {
    // Guard against a race between the check above and the insert.
    const msg = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(msg)) throw new DuplicateNameError();
    throw err;
  }
}


/** Update a player's preferred position and active flag. */
export async function updatePlayer(
  playerId: number,
  position: string,
  active: boolean,
): Promise<void> {
  const pos = isValidPosition(position) ? position : "MID";
  await sqlClient.query(
    "UPDATE players SET preferred_position = $1, active = $2 WHERE id = $3",
    [pos, active ? 1 : 0, playerId],
  );
}

/** Activate a pending (inactive) player. */
export async function activatePlayer(playerId: number): Promise<void> {
  await sqlClient.query("UPDATE players SET active = 1 WHERE id = $1", [playerId]);
}

/** Soft-delete a player: hide them everywhere but keep all their history. */
export async function deletePlayer(playerId: number): Promise<void> {
  await sqlClient.query(
    "UPDATE players SET active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = $1",
    [playerId],
  );
}

/** Deleted (archived) players, most recently removed first. */
export interface DeletedPlayer {
  id: number;
  name: string;
  preferredPosition: string;
  deletedAt: string;
}

export async function getDeletedPlayers(): Promise<DeletedPlayer[]> {
  const rows = (await sqlClient.query(
    `SELECT id, name, preferred_position, deleted_at
       FROM players
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC`,
  )) as unknown as Array<{
    id: number;
    name: string;
    preferred_position: string;
    deleted_at: string;
  }>;
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    preferredPosition: String(r.preferred_position),
    deletedAt: String(r.deleted_at),
  }));
}

/** Restore a soft-deleted player, bringing them back as active. */
export async function restorePlayer(playerId: number): Promise<void> {
  await sqlClient.query(
    "UPDATE players SET deleted_at = NULL, active = 1 WHERE id = $1",
    [playerId],
  );
}

/**
 * Approve a password-reset request: generate a fresh 24h token and return the
 * token string. Mirrors Streamlit — the request stays 'pending' so the link can
 * be regenerated if needed.
 */
export async function approveResetRequest(playerId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expiresStr = expires.toISOString().slice(0, 19).replace("T", " ");
  await sqlClient.query(
    "INSERT INTO password_reset_tokens (player_id, token, expires_at) VALUES ($1, $2, $3)",
    [playerId, token, expiresStr],
  );
  return token;
}

/** Dismiss a password-reset request without generating a link. */
export async function dismissResetRequest(requestId: number, actor: string): Promise<void> {
  await sqlClient.query(
    "UPDATE password_reset_requests SET status = 'dismissed', resolved_by = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2",
    [actor, requestId],
  );
}

/** Set the active flag for multiple players at once. */
export async function bulkSetActive(ids: number[], active: boolean): Promise<void> {
  if (ids.length === 0) return;
  await sqlClient.query(`UPDATE players SET active = $1 WHERE id = ANY($2::int[])`, [
    active ? 1 : 0,
    ids,
  ]);
}

/** Set the preferred position for multiple players at once. */
export async function bulkSetPosition(ids: number[], position: string): Promise<void> {
  if (ids.length === 0) return;
  const pos = isValidPosition(position) ? position : "MID";
  await sqlClient.query(`UPDATE players SET preferred_position = $1 WHERE id = ANY($2::int[])`, [
    pos,
    ids,
  ]);
}

/** Soft-delete multiple players at once (keeps history, allows restore). */
export async function bulkDelete(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await sqlClient.query(
    `UPDATE players SET active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])`,
    [ids],
  );
}

export interface ImportPlayerRow {
  name: string;
  preferredPosition: string;
  active: boolean;
}

/**
 * Upsert players by name (players.name is UNIQUE), mirroring the Streamlit CSV
 * import. Returns the number of rows processed.
 */
export async function importPlayers(rows: ImportPlayerRow[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    const pos = isValidPosition(row.preferredPosition) ? row.preferredPosition : "MID";
    await sqlClient.query(
      `
      INSERT INTO players (name, preferred_position, active)
      VALUES ($1, $2, $3)
      ON CONFLICT (name) DO UPDATE SET
        preferred_position = EXCLUDED.preferred_position,
        active = EXCLUDED.active
      `,
      [name, pos, row.active ? 1 : 0],
    );
    count += 1;
  }
  return count;
}

/**
 * Parse a players CSV. Accepts a 'name' column plus optional
 * 'preferred_position'/'position' and 'active' columns. Invalid positions
 * default to MID; missing active defaults to true.
 */
export function parsePlayersCsv(text: string): ImportPlayerRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  const splitLine = (line: string): string[] =>
    line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));

  const header = splitLine(lines[0]).map((h) => h.toLowerCase());
  const nameIdx = header.indexOf("name");
  if (nameIdx === -1) {
    throw new Error("CSV must have a 'name' column.");
  }
  const posIdx = header.indexOf("preferred_position") !== -1
    ? header.indexOf("preferred_position")
    : header.indexOf("position");
  const activeIdx = header.indexOf("active");

  const out: ImportPlayerRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const name = (cells[nameIdx] ?? "").trim();
    if (!name) continue;
    const rawPos = posIdx !== -1 ? (cells[posIdx] ?? "").toUpperCase().trim() : "MID";
    const preferredPosition = isValidPosition(rawPos) ? rawPos : "MID";
    let active = true;
    if (activeIdx !== -1) {
      const rawActive = (cells[activeIdx] ?? "").trim();
      active = rawActive !== "0" && rawActive.toLowerCase() !== "false" && rawActive !== "";
    }
    out.push({ name, preferredPosition, active });
  }
  return out;
}
