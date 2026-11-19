/**
 * SQL shared by session charges (`season-fund.ts`) and its tests. Kept free of
 * database imports so the PGlite unit tests can execute the real statements.
 */

/**
 * Charges a player has to pay: their own, plus those for guests they host
 * (guests have no account, so the host settles for them). A replacement owed
 * to the player themselves — e.g. their own guest covering their seat — is
 * not a debt and is left out.
 *
 * `$1` = player id, `$2` = match id or NULL for every match,
 * `$3` = true to return unpaid charges only.
 */
export const PLAYER_CHARGES_SQL = `
  SELECT gc.id, gc.match_id, m.played_on, gc.player_id, gc.guest_id,
         COALESCE(p.name, mg.name) AS name,
         gc.amount_minor, gc.kind, gc.owed_to_player_id,
         owed.name AS owed_to_name, gc.paid_at
    FROM guest_charges gc
    JOIN matches m ON m.id = gc.match_id
    LEFT JOIN players p ON p.id = gc.player_id
    LEFT JOIN match_guests mg ON mg.id = gc.guest_id
    LEFT JOIN players owed ON owed.id = gc.owed_to_player_id
   WHERE (gc.player_id = $1 OR (gc.guest_id IS NOT NULL AND mg.host_player_id = $1))
     AND gc.owed_to_player_id IS DISTINCT FROM $1
     AND ($2::int IS NULL OR gc.match_id = $2::int)
     AND (NOT $3::boolean OR gc.paid_at IS NULL)
   ORDER BY m.played_on DESC, gc.id`;

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
   (SELECT COALESCE(SUM(CASE WHEN gc.paid_at IS NULL THEN gc.amount_minor ELSE 0 END), 0)
      FROM guest_charges gc JOIN matches m ON m.id = gc.match_id
     WHERE gc.kind = 'extra' AND m.season_id = $1)::int AS fees_outstanding,
   (SELECT COALESCE(SUM(COALESCE(m.extension_cost_minor, s.extension_cost_minor)), 0)
      FROM matches m JOIN seasons s ON s.id = m.season_id
     WHERE m.extended = true AND m.season_id = $1)::int AS extensions,
   (SELECT COALESCE(SUM(amount_minor), 0)
      FROM fund_adjustments WHERE season_id = $1)::int AS adjustments`;
