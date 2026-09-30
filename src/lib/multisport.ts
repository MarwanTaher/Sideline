import "server-only";
import { sqlClient } from "./db";

/**
 * MultiSport scans. A player reports their own scan, an admin approves it, and
 * the credit lands on their next bill.
 *
 * §5 of the rules: the discount belongs to the cardholder alone and is never
 * shared, so this never touches anyone else's amount.
 */

export type ScanStatus = "pending" | "approved" | "rejected";

export type MultisportScan = {
  id: number;
  matchId: number;
  playedOn: string;
  playerId: number;
  name: string;
  status: ScanStatus;
  creditMinor: number;
  reportedAt: string;
  applied: boolean;
};

type ScanRow = {
  id: number;
  match_id: number;
  played_on: string | null;
  player_id: number;
  name: string;
  status: string;
  credit_minor: number;
  reported_at: string | Date;
  applied_invoice_id: number | null;
};

function toScan(r: ScanRow): MultisportScan {
  const status = r.status === "approved" || r.status === "rejected" ? r.status : "pending";
  return {
    id: Number(r.id),
    matchId: Number(r.match_id),
    playedOn: String(r.played_on ?? ""),
    playerId: Number(r.player_id),
    name: String(r.name ?? ""),
    status,
    creditMinor: Number(r.credit_minor),
    reportedAt:
      r.reported_at instanceof Date ? r.reported_at.toISOString() : String(r.reported_at),
    applied: r.applied_invoice_id != null,
  };
}

const SCAN_SELECT = `SELECT ms.id, ms.match_id, m.played_on, ms.player_id, p.name,
                            ms.status, ms.credit_minor, ms.reported_at, ms.applied_invoice_id
                       FROM multisport_scans ms
                       JOIN players p ON p.id = ms.player_id
                       JOIN matches m ON m.id = ms.match_id`;

export async function listPendingScans(): Promise<MultisportScan[]> {
  const rows = (await sqlClient.query(
    `${SCAN_SELECT} WHERE ms.status = 'pending' ORDER BY m.played_on DESC, p.name ASC`,
  )) as ScanRow[];
  return rows.map(toScan);
}

export async function listPlayerScans(playerId: number): Promise<MultisportScan[]> {
  const rows = (await sqlClient.query(
    `${SCAN_SELECT} WHERE ms.player_id = $1 ORDER BY m.played_on DESC`,
    [playerId],
  )) as ScanRow[];
  return rows.map(toScan);
}

export async function getScanForMatch(
  matchId: number,
  playerId: number,
): Promise<MultisportScan | null> {
  const rows = (await sqlClient.query(
    `${SCAN_SELECT} WHERE ms.match_id = $1 AND ms.player_id = $2`,
    [matchId, playerId],
  )) as ScanRow[];
  return rows.length > 0 ? toScan(rows[0]) : null;
}

/** Report your own scan. Re-reporting a rejected one puts it back in the queue. */
export async function reportScan(
  matchId: number,
  playerId: number,
  creditMinor: number,
): Promise<void> {
  await sqlClient.query(
    `INSERT INTO multisport_scans (match_id, player_id, status, credit_minor, reported_at)
     VALUES ($1, $2, 'pending', $3, CURRENT_TIMESTAMP)
     ON CONFLICT (match_id, player_id) DO UPDATE
        SET status = 'pending',
            credit_minor = EXCLUDED.credit_minor,
            reported_at = CURRENT_TIMESTAMP,
            reviewed_at = NULL,
            reviewed_by = ''
      WHERE multisport_scans.applied_invoice_id IS NULL`,
    [matchId, playerId, creditMinor],
  );
}

/** Withdraw an unreviewed report. Credited scans stay put. */
export async function withdrawScan(matchId: number, playerId: number): Promise<void> {
  await sqlClient.query(
    `DELETE FROM multisport_scans
      WHERE match_id = $1 AND player_id = $2
        AND status = 'pending' AND applied_invoice_id IS NULL`,
    [matchId, playerId],
  );
}

export async function reviewScan(
  scanId: number,
  approve: boolean,
  actor: string,
): Promise<void> {
  await sqlClient.query(
    `UPDATE multisport_scans
        SET status = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
      WHERE id = $3 AND applied_invoice_id IS NULL`,
    [approve ? "approved" : "rejected", actor, scanId],
  );
}

/** Approved scans a player has not yet been credited for. */
export async function uncreditedTotalMinor(playerId: number): Promise<number> {
  const rows = (await sqlClient.query(
    `SELECT COALESCE(SUM(credit_minor), 0)::int AS total
       FROM multisport_scans
      WHERE player_id = $1 AND status = 'approved' AND applied_invoice_id IS NULL`,
    [playerId],
  )) as Array<{ total: number }>;
  return Number(rows[0]?.total ?? 0);
}
