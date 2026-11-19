/**
 * SQL shared by the normal-match pot (`payments.ts`) and its tests. Kept free of
 * database imports so the PGlite unit tests can execute the real statements.
 */

/**
 * True when the match (alias `m`) belongs to a subscription season. Membership
 * is explicit through `matches.season_id`, matching
 * `getSubscriptionSeasonForMatch`. Core seats on such matches are paid by the
 * monthly invoice, so the per-match pot must never apply.
 */
export const SEASON_MATCH_SQL = `EXISTS (
  SELECT 1 FROM seasons s
   WHERE s.id = m.season_id AND s.subscription_enabled = true
)`;

/** `$1` = match id. Returns `active` (pot open for players) and `season`. */
export const POT_STATE_SQL = `SELECT COALESCE(m.payments_active, 0) = 1 AS active,
        ${SEASON_MATCH_SQL} AS season
   FROM matches m
  WHERE m.id = $1`;

/**
 * The most recent match whose pot payment details were filled in, used to
 * prefill a new match so the admin doesn't retype them every week. Season
 * matches usually leave these blank (no pot), so "has details" rather than
 * "latest match" is the test. Use as a CTE: `WITH prev_payment AS (...)`.
 */
export const PREV_PAYMENT_DETAILS_SQL = `SELECT payment_name, payment_mobile, payment_method,
        payment_note, pay_link
   FROM matches
  WHERE btrim(COALESCE(payment_name, '')) <> ''
     OR btrim(COALESCE(payment_mobile, '')) <> ''
     OR btrim(COALESCE(pay_link, '')) <> ''
  ORDER BY id DESC
  LIMIT 1`;

/**
 * P2.5 "Finalize cost": snapshot the per-head share (minor units of the match
 * currency) so later roster changes stop moving it. `$1` = match id,
 * `$2` = true to finalize, false to unlock. Season matches are never touched.
 * Returns the new share_minor (NULL when unlocked or nothing to split).
 */
export const FINALIZE_SHARE_SQL = `UPDATE matches m
    SET share_minor = CASE WHEN $2::boolean THEN (
          SELECT CASE WHEN h.heads > 0 AND COALESCE(m.total_payment, 0) > 0
                      THEN (CEIL(m.total_payment::numeric / h.heads) * 100)::int END
            FROM (SELECT (SELECT COUNT(*) FROM match_players mp WHERE mp.match_id = m.id)
                       + (SELECT COUNT(*) FROM match_guests g
                           WHERE g.match_id = m.id AND g.status = 'approved') AS heads) h
        ) END
  WHERE m.id = $1 AND NOT ${SEASON_MATCH_SQL}
  RETURNING m.share_minor`;
