/**
 * SQL shared by session charges (`season-fund.ts`) and its tests. Kept free of
 * database imports so the PGlite unit tests can execute the real statements.
 */

/**
 * True when a season match falls under the new season rules (review §8.7,
 * Phase 2): on or after the season's cutover date, which stays NULL until an
 * admin sets it. Before it, today's rules apply unchanged.
 */
export function newRulesSql(match = "m", season = "s"): string {
  return `(${season}.new_rules_from IS NOT NULL AND ${match}.played_on >= ${season}.new_rules_from)`;
}

/**
 * Charge rows with what the UI needs. `new_rules` = a replacement pays the
 * group and the subscriber is credited on the next invoice (P2.1);
 * `scan_credit_minor` comes off the fee (P2.2) and `scan_settled_at` says
 * when, so a fee paid before that is owed a refund.
 */
export const CHARGE_SELECT_SQL = `
  SELECT gc.id, gc.match_id, m.played_on, gc.player_id, gc.guest_id,
         COALESCE(p.name, mg.name) AS name,
         gc.amount_minor, gc.kind, gc.owed_to_player_id,
         owed.name AS owed_to_name, gc.paid_at,
         COALESCE(${newRulesSql()}, false) AS new_rules,
         gc.scan_credit_minor, gc.scan_refunded_at,
         (SELECT ms.settled_at FROM multisport_scans ms
           WHERE ms.match_id = gc.match_id AND ms.player_id = gc.player_id
             AND ms.settled_as = 'fee') AS scan_settled_at
    FROM guest_charges gc
    JOIN matches m ON m.id = gc.match_id
    LEFT JOIN seasons s ON s.id = m.season_id
    LEFT JOIN players p ON p.id = gc.player_id
    LEFT JOIN match_guests mg ON mg.id = gc.guest_id
    LEFT JOIN players owed ON owed.id = gc.owed_to_player_id`;

/**
 * Charges a player has to pay: their own, plus those for guests they host
 * (guests have no account, so the host settles for them). A replacement owed
 * to the player themselves — e.g. their own guest covering their seat — is
 * not a debt and is left out.
 *
 * `$1` = player id, `$2` = match id or NULL for every match,
 * `$3` = true to return unpaid charges only.
 */
export const PLAYER_CHARGES_SQL = `${CHARGE_SELECT_SQL}
   WHERE (gc.player_id = $1 OR (gc.guest_id IS NOT NULL AND mg.host_player_id = $1))
     AND gc.owed_to_player_id IS DISTINCT FROM $1
     AND ($2::int IS NULL OR gc.match_id = $2::int)
     AND (NOT $3::boolean OR gc.paid_at IS NULL)
   ORDER BY m.played_on DESC, gc.id`;

/**
 * P2.1: when a replacement charge on a new-rules match is paid (to the
 * group), credit the subscriber whose seat it was on their next invoice.
 * `$1` = charge id. Idempotent (one credit per charge).
 */
export const CREATE_REPLACEMENT_CREDIT_SQL = `
  INSERT INTO season_credits (season_id, player_id, source, guest_charge_id, match_id, credit_minor)
  SELECT m.season_id, gc.owed_to_player_id, 'replacement', gc.id, gc.match_id, gc.amount_minor
    FROM guest_charges gc
    JOIN matches m ON m.id = gc.match_id
    JOIN seasons s ON s.id = m.season_id
   WHERE gc.id = $1 AND gc.kind = 'replacement' AND gc.paid_at IS NOT NULL
     AND gc.owed_to_player_id IS NOT NULL AND gc.amount_minor > 0
     AND ${newRulesSql()}
  ON CONFLICT (guest_charge_id) WHERE guest_charge_id IS NOT NULL DO NOTHING
  RETURNING id`;

/** The credit created for a charge, and whether it can still be withdrawn. `$1` = charge id. */
export const CHARGE_CREDIT_STATE_SQL = `
  SELECT sc.id, sc.applied_invoice_id, sc.settled_at IS NOT NULL AS settled,
         si.paid_at IS NOT NULL AS invoice_paid
    FROM season_credits sc
    LEFT JOIN season_invoices si ON si.id = sc.applied_invoice_id
   WHERE sc.guest_charge_id = $1`;

/**
 * Remove a match's unpaid charges that no longer apply: players who are not a
 * non-core IN player any more (dropped OUT, removed, or now a subscriber) and
 * guests who are no longer approved. Paid charges are never touched.
 *
 * `$1` = match id, `$2` = non-core IN player ids, `$3` = approved guest ids.
 */
export const DELETE_STALE_CHARGES_SQL = `
  DELETE FROM guest_charges gc
   WHERE gc.match_id = $1
     AND gc.paid_at IS NULL
     AND (
       (gc.player_id IS NOT NULL AND NOT (gc.player_id = ANY($2::int[])))
       OR (gc.guest_id IS NOT NULL AND NOT (gc.guest_id = ANY($3::int[])))
     )
  RETURNING gc.id`;

/**
 * Group fund balance parts for a season (`$1` = season id). Derived from the
 * rows, never stored. Extensions use the cost snapshotted when confirmed
 * (`matches.extension_cost_minor`, 0038); matches confirmed before that
 * column existed fall back to the season's current rate.
 */
export const FUND_BALANCE_SQL = `SELECT
   (SELECT COALESCE(SUM(CASE WHEN paid_at IS NOT NULL
             THEN (CEIL(gross_minor::numeric / 100) * 100) - gross_minor ELSE 0 END), 0)
      FROM season_invoices WHERE season_id = $1)::int AS rounding,
   (SELECT COALESCE(SUM(CASE WHEN gc.paid_at IS NOT NULL THEN gc.amount_minor ELSE 0 END), 0)
      FROM guest_charges gc JOIN matches m ON m.id = gc.match_id
     WHERE gc.kind = 'extra' AND m.season_id = $1)::int AS fees_paid,
   -- Still to collect: the fee less any scan credit (P2.2). Paid fees count
   -- in full above, because the facility bill drops by the same scan credit.
   (SELECT COALESCE(SUM(CASE WHEN gc.paid_at IS NULL THEN gc.amount_minor - gc.scan_credit_minor ELSE 0 END), 0)
      FROM guest_charges gc JOIN matches m ON m.id = gc.match_id
     WHERE gc.kind = 'extra' AND m.season_id = $1)::int AS fees_outstanding,
   (SELECT COALESCE(SUM(COALESCE(m.extension_cost_minor, s.extension_cost_minor)), 0)
      FROM matches m JOIN seasons s ON s.id = m.season_id
     WHERE m.extended = true AND m.season_id = $1)::int AS extensions,
   (SELECT COALESCE(SUM(amount_minor), 0)
      FROM fund_adjustments WHERE season_id = $1)::int AS adjustments,
   -- P2.3: paying the facility less than expected leaves money with the
   -- group (more: it costs the fund).
   (SELECT COALESCE(SUM(ds.expected_minor - ds.paid_minor), 0)
      FROM matchday_settlements ds JOIN matches m ON m.id = ds.match_id
     WHERE m.season_id = $1)::int AS facility_difference`;

/**
 * P2.3: what the facility should be paid for a season matchday (`$1` = match
 * id): the day rate, plus the extension if confirmed (snapshotted cost,
 * P2.4), less the approved MultiSport scans' credit for that match.
 */
export const EXPECTED_FACILITY_BILL_SQL = `
  SELECT s.day_rate_minor
         + CASE WHEN COALESCE(m.extended, false)
                THEN COALESCE(m.extension_cost_minor, s.extension_cost_minor) ELSE 0 END
         - COALESCE(sc.credit, 0) AS expected_minor,
         COALESCE(sc.scans, 0)::int AS approved_scans
    FROM matches m
    JOIN seasons s ON s.id = m.season_id AND s.subscription_enabled = true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS scans, SUM(ms.credit_minor) AS credit
        FROM multisport_scans ms
       WHERE ms.match_id = m.id AND ms.status = 'approved'
    ) sc ON true
   WHERE m.id = $1`;

/**
 * P2.3: record (or correct) what was actually paid, snapshotting the
 * expected bill at that moment. `$1` match, `$2` paid, `$3` facility's scan
 * count or NULL, `$4` note, `$5` actor.
 */
export const RECORD_SETTLEMENT_SQL = `
  WITH expected AS (${EXPECTED_FACILITY_BILL_SQL})
  INSERT INTO matchday_settlements
    (match_id, expected_minor, paid_minor, approved_scans, facility_scans, note, recorded_by, recorded_at)
  SELECT $1, e.expected_minor, $2, e.approved_scans, $3, $4, $5, CURRENT_TIMESTAMP FROM expected e
  ON CONFLICT (match_id) DO UPDATE
     SET expected_minor = EXCLUDED.expected_minor, paid_minor = EXCLUDED.paid_minor,
         approved_scans = EXCLUDED.approved_scans, facility_scans = EXCLUDED.facility_scans,
         note = EXCLUDED.note, recorded_by = EXCLUDED.recorded_by, recorded_at = CURRENT_TIMESTAMP
  RETURNING expected_minor, paid_minor, approved_scans, facility_scans`;

/**
 * P2.2: an approved MultiSport scan by a non-core player on a new-rules
 * match comes off that session's fee (36 → 21) instead of waiting as
 * leftover credit. The scan is settled as 'fee' so it is never also put on
 * an invoice. Only charges with no scan credit yet are touched, so it is
 * safe to re-run. `$1` = match id. Returns one row per scan used.
 */
export const APPLY_SCANS_TO_CHARGES_SQL = `
  WITH eligible AS MATERIALIZED (
    SELECT ms.id AS scan_id, gc.id AS charge_id,
           LEAST(ms.credit_minor, gc.amount_minor) AS credit
      FROM multisport_scans ms
      JOIN guest_charges gc ON gc.match_id = ms.match_id AND gc.player_id = ms.player_id
      JOIN matches m ON m.id = ms.match_id
      JOIN seasons s ON s.id = m.season_id
     WHERE ms.match_id = $1 AND ms.status = 'approved'
       AND ms.applied_invoice_id IS NULL AND ms.settled_at IS NULL
       AND gc.scan_credit_minor = 0
       AND ${newRulesSql()}
     FOR UPDATE OF ms, gc
  ),
  charged AS (
    UPDATE guest_charges gc SET scan_credit_minor = e.credit
      FROM eligible e WHERE gc.id = e.charge_id
    RETURNING gc.id
  )
  UPDATE multisport_scans ms SET settled_at = CURRENT_TIMESTAMP, settled_as = 'fee'
    FROM eligible e WHERE ms.id = e.scan_id
  RETURNING ms.id`;
