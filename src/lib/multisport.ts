import "server-only";
import { sqlClient } from "./db";
import { LEFTOVER_CREDITS_SQL, SETTLE_LEFTOVER_CREDIT_SQL } from "./multisport-sql";

/**
 * MultiSport scans. A player reports their own scan, an admin approves it, and
 * the credit lands on their next bill.
 *
 * §5 of the rules: the discount belongs to the cardholder alone and is never
 * shared, so this never touches anyone else's amount.
 */

export type ScanStatus = "pending" | "approved" | "rejected";
export type ScanSettlement = "refunded" | "fund";

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
  /** Leftover credit an admin refunded or moved to the group fund. */
  /** 'fee' = used on a non-core player's session fee (P2.2). */
  settledAs: ScanSettlement | "fee" | null;
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
  settled_as: string | null;
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
    settledAs:
      r.settled_as === "refunded" || r.settled_as === "fund" || r.settled_as === "fee"
        ? r.settled_as
        : null,
  };
}

const SCAN_SELECT = `SELECT ms.id, ms.match_id, m.played_on, ms.player_id, p.name,
                            ms.status, ms.credit_minor, ms.reported_at, ms.applied_invoice_id,
                            ms.settled_as
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
      WHERE multisport_scans.applied_invoice_id IS NULL
        AND multisport_scans.settled_at IS NULL`,
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

/** Approve or reject a scan. Returns its match, so callers can apply it to that fee (P2.2). */
export async function reviewScan(
  scanId: number,
  approve: boolean,
  actor: string,
): Promise<{ matchId: number } | null> {
  const rows = (await sqlClient.query(
    `UPDATE multisport_scans
        SET status = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
      WHERE id = $3 AND applied_invoice_id IS NULL AND settled_at IS NULL
      RETURNING match_id`,
    [approve ? "approved" : "rejected", actor, scanId],
  )) as Array<{ match_id: number }>;
  return rows[0] ? { matchId: Number(rows[0].match_id) } : null;
}

/** Approved scans a player has not yet been credited for. */
export async function uncreditedTotalMinor(playerId: number): Promise<number> {
  const rows = (await sqlClient.query(
    `SELECT COALESCE(SUM(credit_minor), 0)::int AS total
       FROM multisport_scans
      WHERE player_id = $1 AND status = 'approved' AND applied_invoice_id IS NULL
        AND settled_at IS NULL`,
    [playerId],
  )) as Array<{ total: number }>;
  return Number(rows[0]?.total ?? 0);
}

export type LeftoverCredit = {
  playerId: number;
  name: string;
  creditMinor: number;
  scans: number;
  /** P2.1: unused replacement credits (seat given up and paid for via the group). */
  replacementCredits: number;
  withdrawn: boolean;
  /** Newest period this player was billed for in the season, if any. */
  lastBilledPeriod: string | null;
};

/**
 * Approved, unused, unsettled credit per player from this season: MultiSport
 * scans on the season's matches plus replacement credits (P2.1).
 */
export async function listLeftoverCredits(seasonId: number): Promise<LeftoverCredit[]> {
  const rows = (await sqlClient.query(LEFTOVER_CREDITS_SQL, [seasonId])) as Array<{
    player_id: number;
    name: string;
    credit: number;
    scans: number;
    replacements: number;
    sub_status: string;
    last_period: string | null;
  }>;
  return rows.map((r) => ({
    playerId: Number(r.player_id),
    name: String(r.name),
    creditMinor: Number(r.credit),
    scans: Number(r.scans),
    replacementCredits: Number(r.replacements),
    withdrawn: r.sub_status !== "active",
    lastBilledPeriod: r.last_period == null ? null : String(r.last_period),
  }));
}

/**
 * Settle a player's unused credit from this season (scans and replacement
 * credits): refunded to them outside the app, or moved into the group fund
 * (as one fund adjustment). One statement, so the credits and the fund entry
 * can never disagree. Returns the amount settled (0 if nothing was left,
 * e.g. a bill just used it).
 */
export async function settleLeftoverCredit(
  seasonId: number,
  playerId: number,
  as: ScanSettlement,
  note: string,
  actor: string,
): Promise<number> {
  const rows = (await sqlClient.query(SETTLE_LEFTOVER_CREDIT_SQL, [
    seasonId,
    playerId,
    as,
    note,
    actor,
  ])) as Array<{ amount: number }>;
  return Number(rows[0]?.amount ?? 0);
}
