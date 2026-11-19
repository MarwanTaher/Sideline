-- M1 (docs/platform/01-M1-TENANCY-FOUNDATION.md §4-5, §7): group_id on the
-- season, money and ledger tables, composite foreign keys, and ledger
-- triggers that carry group_id from the source row.
--
-- Same shape as 0043: group_id (DEFAULT 1 = Krakow Pyramids, scaffolding until
-- M2) plus (group_id, <ref>) -> parent (group_id, id) keys next to the existing
-- single-column keys. season_match_occurrences references
-- season_match_automation by season_id, so the helper gains a parent-column
-- argument (default 'id') and learns RESTRICT.
--
-- The 0039 ledger (dues, fund_entries) is maintained by triggers from
-- sideline_dues_source / sideline_fund_source. Both views gain group_id as
-- their last column (CREATE OR REPLACE VIEW may only append), and the two
-- sync functions copy it, so a ledger row always belongs to the group of the
-- match or invoice it came from, whichever code version writes the sources.
-- The 'Europe/Warsaw' literal in sideline_fund_source is kept as in 0039;
-- M4 moves it to groups.timezone.
--
-- Additive and idempotent: safe to re-run.

DROP FUNCTION IF EXISTS sideline_add_group_fk(regclass, text, regclass, text);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION sideline_add_group_fk(
	child regclass, child_col text, parent regclass, on_delete text, parent_col text DEFAULT 'id'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	child_name text := (SELECT relname FROM pg_class WHERE oid = child);
	cname text := format('%s_%s_group_fkey', child_name, child_col);
	action text := CASE
		WHEN upper(on_delete) = 'CASCADE' THEN 'CASCADE'
		WHEN upper(on_delete) = 'SET NULL' THEN format('SET NULL (%I)', child_col)
		WHEN upper(on_delete) = 'RESTRICT' THEN 'RESTRICT'
		ELSE 'NO ACTION'
	END;
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = child AND conname = cname) THEN
		EXECUTE format(
			'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (group_id, %I) REFERENCES %s (group_id, %I) ON DELETE %s NOT VALID',
			child, cname, child_col, parent, parent_col, action
		);
	END IF;
	EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', child, cname);
END $$;
--> statement-breakpoint

ALTER TABLE season_subscriptions ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE season_invoices ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE season_credits ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE season_match_automation ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE season_match_occurrences ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE match_automation_audit ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE fund_adjustments ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE fund_entries ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE dues ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE seat_offers ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint
ALTER TABLE seat_offer_requests ADD COLUMN IF NOT EXISTS group_id integer NOT NULL DEFAULT 1 REFERENCES groups(id);
--> statement-breakpoint

-- Parents of composite keys added here.
CREATE UNIQUE INDEX IF NOT EXISTS season_invoices_group_id_id_uq ON season_invoices (group_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS guest_charges_group_id_id_uq ON guest_charges (group_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS seat_offers_group_id_id_uq ON seat_offers (group_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS season_match_automation_group_id_season_id_uq ON season_match_automation (group_id, season_id);
--> statement-breakpoint

SELECT sideline_add_group_fk('season_subscriptions', 'season_id', 'seasons', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_subscriptions', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_invoices', 'season_id', 'seasons', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_invoices', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_credits', 'season_id', 'seasons', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_credits', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_credits', 'guest_charge_id', 'guest_charges', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_credits', 'match_id', 'matches', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_credits', 'applied_invoice_id', 'season_invoices', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_match_automation', 'season_id', 'seasons', 'RESTRICT');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_match_occurrences', 'season_id', 'season_match_automation', 'RESTRICT', 'season_id');
--> statement-breakpoint
SELECT sideline_add_group_fk('season_match_occurrences', 'match_id', 'matches', 'RESTRICT');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_automation_audit', 'season_id', 'seasons', 'RESTRICT');
--> statement-breakpoint
SELECT sideline_add_group_fk('match_automation_audit', 'match_id', 'matches', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('fund_adjustments', 'season_id', 'seasons', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('fund_entries', 'season_id', 'seasons', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('fund_entries', 'match_id', 'matches', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('dues', 'payer_player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('dues', 'payee_player_id', 'players', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('dues', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('dues', 'season_id', 'seasons', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('seat_offers', 'match_id', 'matches', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('seat_offers', 'subscriber_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('seat_offers', 'replacement_player_id', 'players', 'SET NULL');
--> statement-breakpoint
SELECT sideline_add_group_fk('seat_offer_requests', 'offer_id', 'seat_offers', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('seat_offer_requests', 'player_id', 'players', 'CASCADE');
--> statement-breakpoint
SELECT sideline_add_group_fk('multisport_scans', 'applied_invoice_id', 'season_invoices', 'SET NULL');
--> statement-breakpoint

-- Ledger: views and sync functions from 0039, with group_id.
CREATE OR REPLACE VIEW sideline_dues_source AS
WITH pot AS (
  -- Normal-match pot shares while payments are open; never on season
  -- matches. A finalized share (P2.5) no longer follows the roster.
  SELECT m.id, m.group_id, m.played_on, COALESCE(m.payment_currency, 'PLN') AS currency,
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
     AND NOT EXISTS (SELECT 1 FROM seasons s WHERE s.id = m.season_id AND s.subscription_enabled = true)
)
SELECT 'share:' || pot.id || ':p' || mp.player_id AS due_key,
       'match_share'::text AS source, pot.id AS source_id,
       mp.player_id AS payer_player_id, NULL::int AS guest_id,
       'group'::text AS payee, NULL::int AS payee_player_id,
       pot.id AS match_id, NULL::int AS season_id, NULL::text AS period,
       pot.share_minor AS amount_minor, pot.currency,
       CASE WHEN COALESCE(pay.paid, 0) = 1 THEN 'confirmed' ELSE 'open' END AS status,
       NULL::timestamptz AS declared_at, ''::text AS declared_note,
       CASE WHEN COALESCE(pay.paid, 0) = 1 THEN pay.updated_at::timestamptz END AS confirmed_at,
       pot.played_on AS due_on,
       pot.group_id
  FROM pot
  JOIN match_players mp ON mp.match_id = pot.id
  LEFT JOIN payments pay ON pay.match_id = pot.id AND pay.player_id = mp.player_id
UNION ALL
SELECT 'share:' || pot.id || ':g' || g.id,
       'match_share', pot.id,
       g.host_player_id, g.id,
       'group', NULL::int,
       pot.id, NULL::int, NULL::text,
       pot.share_minor, pot.currency,
       CASE WHEN g.paid = 1 THEN 'confirmed' ELSE 'open' END,
       NULL::timestamptz, '',
       NULL::timestamptz,
       pot.played_on,
       pot.group_id
  FROM pot
  JOIN match_guests g ON g.match_id = pot.id AND g.status = 'approved'
UNION ALL
SELECT 'invoice:' || si.id,
       'season_invoice', si.id,
       si.player_id, NULL::int,
       'group', NULL::int,
       NULL::int, si.season_id, si.period,
       GREATEST(CEIL(si.gross_minor::numeric / 100) * 100 - si.credit_minor, 0)::int, 'PLN',
       CASE WHEN si.paid_at IS NOT NULL THEN 'confirmed'
            WHEN si.declared_paid_at IS NOT NULL THEN 'declared'
            ELSE 'open' END,
       si.declared_paid_at, COALESCE(si.declared_note, ''),
       si.paid_at,
       si.due_date,
       si.group_id
  FROM season_invoices si
 WHERE si.hidden_at IS NULL
   AND CEIL(si.gross_minor::numeric / 100) * 100 > si.credit_minor
UNION ALL
SELECT 'charge:' || gc.id,
       CASE WHEN gc.kind = 'replacement' THEN 'replacement' ELSE 'session_fee' END, gc.id,
       COALESCE(gc.player_id, mg.host_player_id), gc.guest_id,
       -- New rules (P2.1): a replacement pays the group; the subscriber is credited.
       CASE WHEN gc.kind = 'replacement'
             AND NOT COALESCE(s.new_rules_from IS NOT NULL AND m.played_on >= s.new_rules_from, false)
            THEN 'player' ELSE 'group' END,
       gc.owed_to_player_id,
       gc.match_id, m.season_id, NULL::text,
       gc.amount_minor - gc.scan_credit_minor, 'PLN',
       CASE WHEN gc.paid_at IS NOT NULL THEN 'confirmed' ELSE 'open' END,
       NULL::timestamptz, '',
       gc.paid_at,
       m.played_on,
       gc.group_id
  FROM guest_charges gc
  JOIN matches m ON m.id = gc.match_id
  LEFT JOIN seasons s ON s.id = m.season_id
  LEFT JOIN match_guests mg ON mg.id = gc.guest_id
 WHERE COALESCE(gc.player_id, mg.host_player_id) IS NOT NULL
   AND gc.owed_to_player_id IS DISTINCT FROM COALESCE(gc.player_id, mg.host_player_id);

--> statement-breakpoint

CREATE OR REPLACE VIEW sideline_fund_source AS
SELECT 'rounding:' || si.id AS entry_key, si.season_id, 'rounding'::text AS kind,
       ((CEIL(si.gross_minor::numeric / 100) * 100) - si.gross_minor)::int AS amount_minor,
       si.paid_at AS occurred_at, NULL::int AS match_id,
       'Rounding on ' || si.period || ' invoice' AS note,
       si.group_id
  FROM season_invoices si
 WHERE si.paid_at IS NOT NULL AND CEIL(si.gross_minor::numeric / 100) * 100 > si.gross_minor
UNION ALL
SELECT 'fee:' || gc.id, m.season_id, 'session_fee', gc.amount_minor,
       gc.paid_at, gc.match_id, 'Session fee',
       gc.group_id
  FROM guest_charges gc
  JOIN matches m ON m.id = gc.match_id
 WHERE gc.kind = 'extra' AND gc.paid_at IS NOT NULL AND m.season_id IS NOT NULL
UNION ALL
SELECT 'extension:' || m.id, m.season_id, 'extension',
       -COALESCE(m.extension_cost_minor, s.extension_cost_minor),
       (m.played_on || ' 12:00')::timestamp AT TIME ZONE 'Europe/Warsaw', m.id, 'Pitch extension',
       m.group_id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
 WHERE m.extended = true
UNION ALL
SELECT 'facility:' || ds.match_id, m.season_id, 'facility_payment',
       ds.expected_minor - ds.paid_minor,
       ds.recorded_at, ds.match_id, 'Facility bill vs expected',
       m.group_id
  FROM matchday_settlements ds
  JOIN matches m ON m.id = ds.match_id
 WHERE m.season_id IS NOT NULL AND ds.expected_minor <> ds.paid_minor
UNION ALL
SELECT 'adjustment:' || fa.id, fa.season_id, 'adjustment', fa.amount_minor,
       fa.created_at, NULL::int, fa.note,
       fa.group_id
  FROM fund_adjustments fa;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION sideline_sync_dues(p_match integer, p_invoice integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO dues AS d (due_key, source, source_id, payer_player_id, guest_id, payee, payee_player_id,
                         match_id, season_id, period, amount_minor, currency, status, due_on,
                         declared_at, declared_note, confirmed_at, group_id)
  SELECT src.due_key, src.source, src.source_id, src.payer_player_id, src.guest_id, src.payee,
         src.payee_player_id, src.match_id, src.season_id, src.period, src.amount_minor, src.currency,
         src.status, COALESCE(src.due_on, ''), src.declared_at, src.declared_note, src.confirmed_at,
         src.group_id
    FROM sideline_dues_source src
   WHERE (p_match IS NOT NULL AND src.match_id = p_match)
      OR (p_invoice IS NOT NULL AND src.due_key = 'invoice:' || p_invoice)
  ON CONFLICT (due_key) DO UPDATE SET
    group_id = EXCLUDED.group_id,
    payer_player_id = EXCLUDED.payer_player_id,
    payee = EXCLUDED.payee,
    payee_player_id = EXCLUDED.payee_player_id,
    season_id = EXCLUDED.season_id,
    period = EXCLUDED.period,
    currency = EXCLUDED.currency,
    due_on = EXCLUDED.due_on,
    amount_minor = CASE WHEN d.status = 'confirmed' AND EXCLUDED.status = 'confirmed'
                        THEN d.amount_minor ELSE EXCLUDED.amount_minor END,
    status = CASE
      WHEN EXCLUDED.status IN ('confirmed', 'declared') THEN EXCLUDED.status
      WHEN d.source IN ('session_fee', 'replacement') AND d.declared_at IS NOT NULL
           AND d.status <> 'confirmed' THEN 'declared'
      ELSE 'open' END,
    declared_at = CASE WHEN EXCLUDED.source = 'season_invoice' THEN EXCLUDED.declared_at
                       WHEN EXCLUDED.status = 'open' AND d.status = 'confirmed' THEN NULL
                       ELSE d.declared_at END,
    declared_note = CASE WHEN EXCLUDED.source = 'season_invoice' THEN EXCLUDED.declared_note
                         ELSE d.declared_note END,
    confirmed_at = EXCLUDED.confirmed_at,
    updated_at = CURRENT_TIMESTAMP;

  DELETE FROM dues d
   WHERE ((p_match IS NOT NULL AND d.match_id = p_match)
       OR (p_invoice IS NOT NULL AND d.due_key = 'invoice:' || p_invoice))
     AND NOT EXISTS (SELECT 1 FROM sideline_dues_source src WHERE src.due_key = d.due_key)
     AND (d.status <> 'confirmed'
       OR (d.source = 'season_invoice' AND NOT EXISTS (SELECT 1 FROM season_invoices si WHERE si.id = d.source_id))
       OR (d.source IN ('session_fee', 'replacement')
           AND NOT EXISTS (SELECT 1 FROM guest_charges gc WHERE gc.id = d.source_id)));
END
$$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION sideline_sync_fund(p_season integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_season IS NULL THEN RETURN; END IF;
  INSERT INTO fund_entries AS f (entry_key, season_id, kind, amount_minor, occurred_at, match_id, note, group_id)
  SELECT src.entry_key, src.season_id, src.kind, src.amount_minor, src.occurred_at, src.match_id, COALESCE(src.note, ''),
         src.group_id
    FROM sideline_fund_source src
   WHERE src.season_id = p_season
  ON CONFLICT (entry_key) DO UPDATE SET
    group_id = EXCLUDED.group_id,
    amount_minor = CASE WHEN f.kind IN ('facility_payment', 'adjustment')
                        THEN EXCLUDED.amount_minor ELSE f.amount_minor END,
    occurred_at = CASE WHEN f.kind IN ('facility_payment', 'adjustment')
                       THEN EXCLUDED.occurred_at ELSE f.occurred_at END,
    note = EXCLUDED.note;

  DELETE FROM fund_entries f
   WHERE f.season_id = p_season
     AND NOT EXISTS (SELECT 1 FROM sideline_fund_source src WHERE src.entry_key = f.entry_key);
END
$$;

--> statement-breakpoint

-- Existing ledger rows were created under DEFAULT 1; re-sync so group_id
-- comes from the source rows (a no-op while only group 1 exists).
SELECT sideline_sync_dues(id, NULL) FROM matches;
--> statement-breakpoint
SELECT sideline_sync_dues(NULL, id) FROM season_invoices;
--> statement-breakpoint
SELECT sideline_sync_fund(id) FROM seasons;
