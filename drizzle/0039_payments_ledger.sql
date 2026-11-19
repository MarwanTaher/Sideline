-- Phase 3 + 4 of docs/PAYMENTS_REVIEW.md: the payments ledger.
--
-- `dues` (review §5.1) holds every amount someone owes, and `fund_entries`
-- every money event of a season's group fund. Both are kept current by
-- triggers on the existing payment tables, so they stay correct whichever
-- code version writes those tables: the deployed Previews and production
-- keep writing the old tables, and the ledger follows. Nothing old is
-- dropped or changed (old-column retirement, P3.4, is a later migration).
--
-- The rules that turn source rows into dues / fund entries live once, in the
-- views sideline_dues_source and sideline_fund_source.
--
-- Additive and idempotent: safe to re-run (views and functions are
-- replaced, the backfill at the end is an upsert).

-- P4.1: invoices created by the monthly cron are drafts until an admin
-- publishes them. Drafts are also hidden (hidden_at), so code that predates
-- this column keeps them invisible to players.
ALTER TABLE season_invoices ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS dues (
	due_key text PRIMARY KEY,
	source text NOT NULL,
	source_id integer NOT NULL,
	payer_player_id integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
	guest_id integer,
	payee text NOT NULL,
	payee_player_id integer REFERENCES players(id) ON DELETE SET NULL,
	match_id integer REFERENCES matches(id) ON DELETE CASCADE,
	season_id integer REFERENCES seasons(id) ON DELETE CASCADE,
	period text,
	amount_minor integer NOT NULL,
	currency text NOT NULL DEFAULT 'PLN',
	status text NOT NULL,
	due_on text NOT NULL DEFAULT '',
	declared_at timestamptz,
	declared_note text NOT NULL DEFAULT '',
	confirmed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT dues_source_check CHECK (source IN ('match_share', 'season_invoice', 'session_fee', 'replacement')),
	CONSTRAINT dues_payee_check CHECK (payee IN ('group', 'player')),
	CONSTRAINT dues_status_check CHECK (status IN ('open', 'declared', 'confirmed'))
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS dues_payer_idx ON dues (payer_player_id);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS dues_unconfirmed_idx ON dues (status, due_on) WHERE status <> 'confirmed';

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS dues_match_idx ON dues (match_id) WHERE match_id IS NOT NULL;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS fund_entries (
	entry_key text PRIMARY KEY,
	season_id integer NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
	kind text NOT NULL,
	amount_minor integer NOT NULL,
	occurred_at timestamptz NOT NULL,
	match_id integer REFERENCES matches(id) ON DELETE SET NULL,
	note text NOT NULL DEFAULT '',
	created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fund_entries_kind_check CHECK (kind IN ('rounding', 'session_fee', 'extension', 'facility_payment', 'adjustment'))
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fund_entries_season_idx ON fund_entries (season_id, occurred_at);

--> statement-breakpoint

-- Every due, derived from the source tables. `status` here is what the
-- source says; a player's "I've paid" on a session charge lives only in
-- dues.declared_at (the charge table has no such column).
CREATE OR REPLACE VIEW sideline_dues_source AS
WITH pot AS (
  -- Normal-match pot shares while payments are open; never on season
  -- matches. A finalized share (P2.5) no longer follows the roster.
  SELECT m.id, m.played_on, COALESCE(m.payment_currency, 'PLN') AS currency,
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
       pot.played_on AS due_on
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
       pot.played_on
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
       si.due_date
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
       m.played_on
  FROM guest_charges gc
  JOIN matches m ON m.id = gc.match_id
  LEFT JOIN seasons s ON s.id = m.season_id
  LEFT JOIN match_guests mg ON mg.id = gc.guest_id
 WHERE COALESCE(gc.player_id, mg.host_player_id) IS NOT NULL
   AND gc.owed_to_player_id IS DISTINCT FROM COALESCE(gc.player_id, mg.host_player_id);

--> statement-breakpoint

-- Every money event of a season's fund. Same parts as the derived formula
-- (season-fund-sql.ts FUND_BALANCE_SQL), one row per event, so the balance
-- is SUM(amount_minor) and the two can be reconciled.
CREATE OR REPLACE VIEW sideline_fund_source AS
SELECT 'rounding:' || si.id AS entry_key, si.season_id, 'rounding'::text AS kind,
       ((CEIL(si.gross_minor::numeric / 100) * 100) - si.gross_minor)::int AS amount_minor,
       si.paid_at AS occurred_at, NULL::int AS match_id,
       'Rounding on ' || si.period || ' invoice' AS note
  FROM season_invoices si
 WHERE si.paid_at IS NOT NULL AND CEIL(si.gross_minor::numeric / 100) * 100 > si.gross_minor
UNION ALL
SELECT 'fee:' || gc.id, m.season_id, 'session_fee', gc.amount_minor,
       gc.paid_at, gc.match_id, 'Session fee'
  FROM guest_charges gc
  JOIN matches m ON m.id = gc.match_id
 WHERE gc.kind = 'extra' AND gc.paid_at IS NOT NULL AND m.season_id IS NOT NULL
UNION ALL
SELECT 'extension:' || m.id, m.season_id, 'extension',
       -COALESCE(m.extension_cost_minor, s.extension_cost_minor),
       (m.played_on || ' 12:00')::timestamp AT TIME ZONE 'Europe/Warsaw', m.id, 'Pitch extension'
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
 WHERE m.extended = true
UNION ALL
SELECT 'facility:' || ds.match_id, m.season_id, 'facility_payment',
       ds.expected_minor - ds.paid_minor,
       ds.recorded_at, ds.match_id, 'Facility bill vs expected'
  FROM matchday_settlements ds
  JOIN matches m ON m.id = ds.match_id
 WHERE m.season_id IS NOT NULL AND ds.expected_minor <> ds.paid_minor
UNION ALL
SELECT 'adjustment:' || fa.id, fa.season_id, 'adjustment', fa.amount_minor,
       fa.created_at, NULL::int, fa.note
  FROM fund_adjustments fa;

--> statement-breakpoint

-- Bring the dues of one match (p_match) or one invoice (p_invoice) in line
-- with the source. A player's declaration on a charge is kept; a confirmed
-- due keeps its amount and stays as history unless its source row is gone.
CREATE OR REPLACE FUNCTION sideline_sync_dues(p_match integer, p_invoice integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO dues AS d (due_key, source, source_id, payer_player_id, guest_id, payee, payee_player_id,
                         match_id, season_id, period, amount_minor, currency, status, due_on,
                         declared_at, declared_note, confirmed_at)
  SELECT src.due_key, src.source, src.source_id, src.payer_player_id, src.guest_id, src.payee,
         src.payee_player_id, src.match_id, src.season_id, src.period, src.amount_minor, src.currency,
         src.status, COALESCE(src.due_on, ''), src.declared_at, src.declared_note, src.confirmed_at
    FROM sideline_dues_source src
   WHERE (p_match IS NOT NULL AND src.match_id = p_match)
      OR (p_invoice IS NOT NULL AND src.due_key = 'invoice:' || p_invoice)
  ON CONFLICT (due_key) DO UPDATE SET
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

-- Bring one season's fund entries in line with the source. Amounts already
-- recorded stay as they were (history never changes with rates); only
-- facility payments and adjustments, which an admin can correct, update.
CREATE OR REPLACE FUNCTION sideline_sync_fund(p_season integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_season IS NULL THEN RETURN; END IF;
  INSERT INTO fund_entries AS f (entry_key, season_id, kind, amount_minor, occurred_at, match_id, note)
  SELECT src.entry_key, src.season_id, src.kind, src.amount_minor, src.occurred_at, src.match_id, COALESCE(src.note, '')
    FROM sideline_fund_source src
   WHERE src.season_id = p_season
  ON CONFLICT (entry_key) DO UPDATE SET
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

CREATE OR REPLACE FUNCTION sideline_ledger_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
  old_match integer;
  new_match integer;
BEGIN
  IF TG_TABLE_NAME = 'season_invoices' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM sideline_sync_dues(NULL, OLD.id);
      PERFORM sideline_sync_fund(OLD.season_id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM sideline_sync_dues(NULL, NEW.id);
      PERFORM sideline_sync_fund(NEW.season_id);
    END IF;
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'fund_adjustments' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM sideline_sync_fund(OLD.season_id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM sideline_sync_fund(NEW.season_id); END IF;
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'seasons' THEN
    FOR r IN SELECT id FROM matches WHERE season_id = NEW.id LOOP
      PERFORM sideline_sync_dues(r.id, NULL);
    END LOOP;
    PERFORM sideline_sync_fund(NEW.id);
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'matches' THEN
    PERFORM sideline_sync_dues(NEW.id, NULL);
    PERFORM sideline_sync_fund(NEW.season_id);
    IF OLD.season_id IS DISTINCT FROM NEW.season_id THEN
      PERFORM sideline_sync_fund(OLD.season_id);
    END IF;
    RETURN NULL;
  END IF;

  -- Tables keyed by match: payments, match_players, match_guests,
  -- guest_charges, matchday_settlements.
  IF TG_OP <> 'INSERT' THEN old_match := OLD.match_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_match := NEW.match_id; END IF;
  IF old_match IS NOT NULL THEN
    PERFORM sideline_sync_dues(old_match, NULL);
    PERFORM sideline_sync_fund((SELECT season_id FROM matches WHERE id = old_match));
  END IF;
  IF new_match IS NOT NULL AND new_match IS DISTINCT FROM old_match THEN
    PERFORM sideline_sync_dues(new_match, NULL);
    PERFORM sideline_sync_fund((SELECT season_id FROM matches WHERE id = new_match));
  END IF;
  RETURN NULL;
END
$$;

--> statement-breakpoint

DROP TRIGGER IF EXISTS sideline_ledger_payments ON payments;

--> statement-breakpoint

CREATE TRIGGER sideline_ledger_payments AFTER INSERT OR UPDATE OR DELETE ON payments
	FOR EACH ROW EXECUTE FUNCTION sideline_ledger_trigger();

--> statement-breakpoint

DROP TRIGGER IF EXISTS sideline_ledger_match_players ON match_players;

--> statement-breakpoint

CREATE TRIGGER sideline_ledger_match_players AFTER INSERT OR UPDATE OR DELETE ON match_players
	FOR EACH ROW EXECUTE FUNCTION sideline_ledger_trigger();

--> statement-breakpoint

DROP TRIGGER IF EXISTS sideline_ledger_match_guests ON match_guests;

--> statement-breakpoint

CREATE TRIGGER sideline_ledger_match_guests AFTER INSERT OR UPDATE OR DELETE ON match_guests
	FOR EACH ROW EXECUTE FUNCTION sideline_ledger_trigger();

--> statement-breakpoint

DROP TRIGGER IF EXISTS sideline_ledger_guest_charges ON guest_charges;

--> statement-breakpoint

CREATE TRIGGER sideline_ledger_guest_charges AFTER INSERT OR UPDATE OR DELETE ON guest_charges
	FOR EACH ROW EXECUTE FUNCTION sideline_ledger_trigger();

--> statement-breakpoint

DROP TRIGGER IF EXISTS sideline_ledger_settlements ON matchday_settlements;

--> statement-breakpoint

CREATE TRIGGER sideline_ledger_settlements AFTER INSERT OR UPDATE OR DELETE ON matchday_settlements
	FOR EACH ROW EXECUTE FUNCTION sideline_ledger_trigger();

--> statement-breakpoint

DROP TRIGGER IF EXISTS sideline_ledger_invoices ON season_invoices;

--> statement-breakpoint

CREATE TRIGGER sideline_ledger_invoices AFTER INSERT OR UPDATE OR DELETE ON season_invoices
	FOR EACH ROW EXECUTE FUNCTION sideline_ledger_trigger();

--> statement-breakpoint

DROP TRIGGER IF EXISTS sideline_ledger_adjustments ON fund_adjustments;

--> statement-breakpoint

CREATE TRIGGER sideline_ledger_adjustments AFTER INSERT OR UPDATE OR DELETE ON fund_adjustments
	FOR EACH ROW EXECUTE FUNCTION sideline_ledger_trigger();

--> statement-breakpoint

DROP TRIGGER IF EXISTS sideline_ledger_matches ON matches;

--> statement-breakpoint

CREATE TRIGGER sideline_ledger_matches
	AFTER UPDATE OF payments_active, total_payment, share_minor, season_id, played_on,
	                payment_currency, extended, extension_cost_minor ON matches
	FOR EACH ROW EXECUTE FUNCTION sideline_ledger_trigger();

--> statement-breakpoint

DROP TRIGGER IF EXISTS sideline_ledger_seasons ON seasons;

--> statement-breakpoint

CREATE TRIGGER sideline_ledger_seasons
	AFTER UPDATE OF new_rules_from, subscription_enabled ON seasons
	FOR EACH ROW EXECUTE FUNCTION sideline_ledger_trigger();

--> statement-breakpoint

-- Backfill (P3.1): build the ledger from everything that exists today.
SELECT sideline_sync_dues(id, NULL) FROM matches;

--> statement-breakpoint

SELECT sideline_sync_dues(NULL, id) FROM season_invoices;

--> statement-breakpoint

SELECT sideline_sync_fund(id) FROM seasons;
