/**
 * Leftover-credit SQL shared by multisport.ts and its PGlite tests; free of
 * database imports. `$1` = season id.
 */

/** Unused credit per player: scans on the season's matches + replacement credits (P2.1). */
export const LEFTOVER_CREDITS_SQL = `
  WITH credits AS (
    SELECT ms.player_id, ms.credit_minor, 1 AS scan, 0 AS replacement
      FROM multisport_scans ms
      JOIN matches m ON m.id = ms.match_id AND m.season_id = $1::int
     WHERE ms.status = 'approved' AND ms.applied_invoice_id IS NULL AND ms.settled_at IS NULL
    UNION ALL
    SELECT sc.player_id, sc.credit_minor, 0, 1
      FROM season_credits sc
     WHERE sc.season_id = $1::int AND sc.applied_invoice_id IS NULL AND sc.settled_at IS NULL
  )
  SELECT c.player_id, p.name,
         SUM(c.credit_minor)::int AS credit,
         SUM(c.scan)::int AS scans,
         SUM(c.replacement)::int AS replacements,
         COALESCE(MAX(ss.status), '') AS sub_status,
         (SELECT MAX(si.period) FROM season_invoices si
           WHERE si.season_id = $1::int AND si.player_id = c.player_id) AS last_period
    FROM credits c
    JOIN players p ON p.id = c.player_id
    LEFT JOIN season_subscriptions ss
           ON ss.season_id = $1::int AND ss.player_id = c.player_id
   GROUP BY c.player_id, p.name
   ORDER BY p.name`;

/**
 * Settle all of a player's unused season credit as 'refunded' or 'fund'.
 * `$2` player, `$3` 'refunded' | 'fund', `$4` note, `$5` actor.
 */
export const SETTLE_LEFTOVER_CREDIT_SQL = `
  WITH settled_scans AS (
    UPDATE multisport_scans ms
       SET settled_at = CURRENT_TIMESTAMP, settled_as = $3::text
      FROM matches m
     WHERE m.id = ms.match_id AND m.season_id = $1::int AND ms.player_id = $2::int
       AND ms.status = 'approved' AND ms.applied_invoice_id IS NULL AND ms.settled_at IS NULL
     RETURNING ms.credit_minor
  ),
  settled_credits AS (
    UPDATE season_credits sc
       SET settled_at = CURRENT_TIMESTAMP, settled_as = $3::text
     WHERE sc.season_id = $1::int AND sc.player_id = $2::int
       AND sc.applied_invoice_id IS NULL AND sc.settled_at IS NULL
     RETURNING sc.credit_minor
  ),
  total AS (
    SELECT (SELECT COALESCE(SUM(credit_minor), 0) FROM settled_scans)::int
         + (SELECT COALESCE(SUM(credit_minor), 0) FROM settled_credits)::int AS amount
  ),
  fund AS (
    INSERT INTO fund_adjustments (season_id, amount_minor, note, created_by)
    SELECT $1::int, amount, $4::text, $5::text FROM total
     WHERE $3::text = 'fund' AND amount > 0
    RETURNING id
  )
  SELECT amount FROM total`;
