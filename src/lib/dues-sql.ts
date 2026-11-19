/**
 * Reads of the `dues` ledger (review §5.1, migration 0039). The table is kept
 * in sync by database triggers from the pot, season invoices and session
 * charges; the rules live once, in the view `sideline_dues_source`.
 *
 * Kept free of database imports so the PGlite tests can run the real SQL.
 *
 * Columns: due_key, source, source_id, payer_player_id, payer_name,
 * guest_name, payee ('group' | 'player'), payee_player_id, payee_name,
 * match_id, played_on, season_id, period, amount_minor, currency,
 * status ('open' | 'declared' | 'confirmed'), declared_at, confirmed_at,
 * due_on (YYYY-MM-DD: invoice due date, or the match day).
 */
export const DUES_SELECT_SQL = `
  SELECT d.due_key, d.source, d.source_id, d.payer_player_id, payer.name AS payer_name,
         mg.name AS guest_name, d.payee, d.payee_player_id, payee.name AS payee_name,
         d.match_id, m.played_on, d.season_id, d.period, d.amount_minor, d.currency,
         d.status, d.declared_at::text AS declared_at, d.confirmed_at::text AS confirmed_at,
         d.due_on
    FROM dues d
    JOIN players payer ON payer.id = d.payer_player_id
    LEFT JOIN players payee ON payee.id = d.payee_player_id
    LEFT JOIN matches m ON m.id = d.match_id
    LEFT JOIN match_guests mg ON mg.id = d.guest_id`;

/** `$1` = player id. Everything that player pays, newest first. */
export const PLAYER_DUES_SQL = `${DUES_SELECT_SQL}
 WHERE d.payer_player_id = $1
 ORDER BY d.due_on DESC, d.due_key`;

/** Everything not yet confirmed, oldest first: the admin inbox. */
export const OPEN_DUES_SQL = `${DUES_SELECT_SQL}
 WHERE d.status <> 'confirmed'
 ORDER BY d.due_on, payer.name, d.due_key`;

/** `$1` = match id. Every due of one match, for the admin's per-match view. */
export const MATCH_DUES_SQL = `${DUES_SELECT_SQL}
 WHERE d.match_id = $1
 ORDER BY payer.name, d.due_key`;

/**
 * A player says they paid session/replacement charges (`$1` player,
 * `$2` keys, `$3` note), or takes it back (`$3` NULL). Only open/declared
 * charge dues of that payer change; returns the keys changed.
 */
export const DECLARE_CHARGE_DUES_SQL = `
  UPDATE dues
     SET status = CASE WHEN $3::text IS NULL THEN 'open' ELSE 'declared' END,
         declared_at = CASE WHEN $3::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
         declared_note = COALESCE($3::text, ''),
         updated_at = CURRENT_TIMESTAMP
   WHERE payer_player_id = $1
     AND due_key = ANY($2::text[])
     AND source IN ('session_fee', 'replacement')
     AND status = CASE WHEN $3::text IS NULL THEN 'declared' ELSE 'open' END
  RETURNING due_key`;

/**
 * Admin Home counters (`$1` = next match id or -1, `$2` = season id or -1):
 * guest requests, every due waiting for confirmation (all sources), open
 * session/replacement charges of the season, pending MultiSport scans.
 */
export const HOME_ADMIN_COUNTS_SQL = `SELECT
   (SELECT COUNT(*) FROM match_guests WHERE match_id = $1 AND status = 'pending')::int AS guests,
   (SELECT COUNT(*) FROM dues WHERE status = 'declared')::int AS payments,
   (SELECT COUNT(*) FROM multisport_scans WHERE status = 'pending')::int AS scans,
   (SELECT COUNT(*) FROM dues
     WHERE status = 'open' AND source IN ('session_fee', 'replacement') AND season_id = $2)::int AS charges`;

/**
 * Admin ▸ Payments ▸ Matches: recent matches with what is still open or
 * waiting for confirmation on each (`$1` = limit).
 */
export const PAYMENT_MATCHES_SQL = `
  SELECT m.id, m.played_on, m.season_id IS NOT NULL AS in_season,
         COUNT(d.due_key) FILTER (WHERE d.status = 'open')::int AS open,
         COUNT(d.due_key) FILTER (WHERE d.status = 'declared')::int AS declared
    FROM matches m
    LEFT JOIN dues d ON d.match_id = m.id
   GROUP BY m.id, m.played_on, m.season_id
   ORDER BY m.played_on DESC, m.id DESC
   LIMIT $1`;
