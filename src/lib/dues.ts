import "server-only";
import { sqlClient } from "./db";
import { OPEN_DUES_SQL, PLAYER_DUES_SQL } from "./dues-sql";
import { toDue, type Due, type DueRow } from "./dues-summary";

export type { Due } from "./dues-summary";

/**
 * Unified read model over the pot, season invoices and session charges
 * (review §5.1, P1.1). Read-only: writes still go through each system's own
 * server actions.
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
