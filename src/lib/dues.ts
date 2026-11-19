import "server-only";
import { sqlClient } from "./db";
import {
  DECLARE_CHARGE_DUES_SQL,
  MATCH_DUES_SQL,
  OPEN_DUES_SQL,
  PLAYER_DUES_SQL,
} from "./dues-sql";
import { toDue, type Due, type DueRow } from "./dues-summary";

export type { Due } from "./dues-summary";

/**
 * The `dues` ledger (review §5.1): one source of truth for what everyone
 * owes. Kept in sync by triggers (migration 0039); writes still go through
 * each system's own functions, except a player's declaration on a session
 * charge, which only the ledger can hold.
 */

/** Everything a player pays: their own dues and their guests'. */
export async function listPlayerDues(playerId: number): Promise<Due[]> {
  const rows = (await sqlClient.query(PLAYER_DUES_SQL, [playerId])) as DueRow[];
  return rows.map(toDue);
}

/** Every due not yet confirmed, for the admin Payments inbox. */
export async function listOpenDues(): Promise<Due[]> {
  const rows = (await sqlClient.query(OPEN_DUES_SQL)) as DueRow[];
  return rows.map(toDue);
}

/** Every due of one match (admin drill-down). */
export async function listMatchDues(matchId: number): Promise<Due[]> {
  const rows = (await sqlClient.query(MATCH_DUES_SQL, [matchId])) as DueRow[];
  return rows.map(toDue);
}

/**
 * The player says they paid these session/replacement charges (or takes it
 * back with `note = null`). Returns how many changed.
 */
export async function declareChargeDues(
  playerId: number,
  keys: string[],
  note: string | null,
): Promise<number> {
  if (keys.length === 0) return 0;
  const rows = (await sqlClient.query(DECLARE_CHARGE_DUES_SQL, [
    playerId,
    keys,
    note == null ? null : note.trim().slice(0, 200),
  ])) as unknown[];
  return rows.length;
}

/** Admin: the money for a declared session charge never arrived; back to open. */
export async function rejectChargeDeclaration(key: string): Promise<boolean> {
  const rows = (await sqlClient.query(
    `UPDATE dues SET status = 'open', declared_at = NULL, declared_note = '', updated_at = CURRENT_TIMESTAMP
      WHERE due_key = $1 AND status = 'declared' AND source IN ('session_fee', 'replacement')
      RETURNING due_key`,
    [key],
  )) as unknown[];
  return rows.length > 0;
}
