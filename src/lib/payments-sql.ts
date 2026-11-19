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
