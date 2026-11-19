import { SEASON_MATCH_SQL } from "./payments-sql";
import { newRulesSql } from "./season-fund-sql";

/**
 * The `dues` read model (review §5.1, P1.1): every amount someone owes, from
 * the three payment systems, in one shape. It is a view over the existing
 * tables, not a table, so nothing is written and the deployed code is
 * unaffected. Phase 3 replaces it with a real `dues` table.
 *
 * Kept free of database imports so the PGlite tests can run the real SQL.
 *
 * Columns: due_key, source, source_id, payer_player_id, payer_name,
 * guest_name, payee ('group' | 'player'), payee_player_id, payee_name,
 * match_id, played_on, season_id, period, amount_minor, currency,
 * status ('open' | 'declared' | 'confirmed'), declared_at, confirmed_at,
 * due_on (YYYY-MM-DD: invoice due date, or the match day).
 */
export const ALL_DUES_SQL = `
WITH pot AS (
  -- Normal-match pot shares, only while payments are open (players can't
  -- see them otherwise). Share = ceil(total / heads), as computeSummary.
  SELECT m.id, m.played_on, m.payment_currency,
         -- A finalized share (P2.5) no longer follows the roster.
         COALESCE(m.share_minor, (CEIL(m.total_payment::numeric / h.heads) * 100)::int) AS share_minor
    FROM matches m
    CROSS JOIN LATERAL (
      SELECT (SELECT COUNT(*) FROM match_players mp WHERE mp.match_id = m.id)
           + (SELECT COUNT(*) FROM match_guests g
               WHERE g.match_id = m.id AND g.status = 'approved') AS heads
    ) h
   WHERE COALESCE(m.payments_active, 0) = 1
     AND COALESCE(m.total_payment, 0) > 0
     AND h.heads > 0
     AND NOT ${SEASON_MATCH_SQL}
)
SELECT 'share:' || pot.id || ':p' || mp.player_id AS due_key,
       'match_share' AS source, pot.id AS source_id,
       mp.player_id AS payer_player_id, p.name AS payer_name,
       NULL::text AS guest_name,
       'group' AS payee, NULL::int AS payee_player_id, NULL::text AS payee_name,
       pot.id AS match_id, pot.played_on, NULL::int AS season_id, NULL::text AS period,
       pot.share_minor AS amount_minor, COALESCE(pot.payment_currency, 'PLN') AS currency,
       CASE WHEN COALESCE(pay.paid, 0) = 1 THEN 'confirmed' ELSE 'open' END AS status,
       NULL::text AS declared_at,
       CASE WHEN COALESCE(pay.paid, 0) = 1 THEN pay.updated_at::text END AS confirmed_at,
       pot.played_on AS due_on
  FROM pot
  JOIN match_players mp ON mp.match_id = pot.id
  JOIN players p ON p.id = mp.player_id
  LEFT JOIN payments pay ON pay.match_id = pot.id AND pay.player_id = mp.player_id
UNION ALL
SELECT 'share:' || pot.id || ':g' || g.id,
       'match_share', pot.id,
       g.host_player_id, host.name, g.name,
       'group', NULL::int, NULL::text,
       pot.id, pot.played_on, NULL::int, NULL::text,
       pot.share_minor, COALESCE(pot.payment_currency, 'PLN'),
       CASE WHEN g.paid = 1 THEN 'confirmed' ELSE 'open' END,
       NULL::text, NULL::text,
       pot.played_on
  FROM pot
  JOIN match_guests g ON g.match_id = pot.id AND g.status = 'approved'
  JOIN players host ON host.id = g.host_player_id
UNION ALL
SELECT 'invoice:' || si.id,
       'season_invoice', si.id,
       si.player_id, p.name, NULL::text,
       'group', NULL::int, NULL::text,
       NULL::int, NULL::text, si.season_id, si.period,
       GREATEST(CEIL(si.gross_minor::numeric / 100) * 100 - si.credit_minor, 0)::int, 'PLN',
       CASE WHEN si.paid_at IS NOT NULL THEN 'confirmed'
            WHEN si.declared_paid_at IS NOT NULL THEN 'declared'
            ELSE 'open' END,
       si.declared_paid_at::text, si.paid_at::text,
       si.due_date
  FROM season_invoices si
  JOIN players p ON p.id = si.player_id
 WHERE si.hidden_at IS NULL
   AND CEIL(si.gross_minor::numeric / 100) * 100 > si.credit_minor
UNION ALL
SELECT 'charge:' || gc.id,
       CASE WHEN gc.kind = 'replacement' THEN 'replacement' ELSE 'session_fee' END, gc.id,
       COALESCE(gc.player_id, mg.host_player_id), payer.name, mg.name,
       -- New rules (P2.1): a replacement pays the group; the subscriber is credited.
       CASE WHEN gc.kind = 'replacement' AND NOT COALESCE(${newRulesSql()}, false)
            THEN 'player' ELSE 'group' END,
       gc.owed_to_player_id, owed.name,
       gc.match_id, m.played_on, m.season_id, NULL::text,
       gc.amount_minor - gc.scan_credit_minor, 'PLN',  -- P2.2: scan comes off the fee
       CASE WHEN gc.paid_at IS NOT NULL THEN 'confirmed' ELSE 'open' END,
       NULL::text, gc.paid_at::text,
       m.played_on
  FROM guest_charges gc
  JOIN matches m ON m.id = gc.match_id
  LEFT JOIN seasons s ON s.id = m.season_id
  LEFT JOIN match_guests mg ON mg.id = gc.guest_id
  JOIN players payer ON payer.id = COALESCE(gc.player_id, mg.host_player_id)
  LEFT JOIN players owed ON owed.id = gc.owed_to_player_id
 WHERE gc.owed_to_player_id IS DISTINCT FROM COALESCE(gc.player_id, mg.host_player_id)`;

/** `$1` = player id. Everything that player pays, newest first. */
export const PLAYER_DUES_SQL = `
SELECT * FROM (${ALL_DUES_SQL}) d
 WHERE d.payer_player_id = $1
 ORDER BY d.due_on DESC, d.due_key`;

/** Everything not yet confirmed, oldest first: the admin inbox. */
export const OPEN_DUES_SQL = `
SELECT * FROM (${ALL_DUES_SQL}) d
 WHERE d.status <> 'confirmed'
 ORDER BY d.due_on, d.payer_name, d.due_key`;
