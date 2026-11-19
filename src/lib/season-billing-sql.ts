/**
 * Invoice credit SQL shared by season-billing.ts and its PGlite tests; free
 * of database imports. Every statement takes `$1` = invoice id.
 */

/** Give an unpaid bill's credits back (hiding it). Paid bills keep theirs. */
export const RELEASE_INVOICE_CREDIT_SQL = [
  `UPDATE multisport_scans SET applied_invoice_id = NULL
    WHERE applied_invoice_id = $1::int
      AND EXISTS (SELECT 1 FROM season_invoices WHERE id = $1::int AND paid_at IS NULL)`,
  `UPDATE season_credits SET applied_invoice_id = NULL
    WHERE applied_invoice_id = $1::int
      AND EXISTS (SELECT 1 FROM season_invoices WHERE id = $1::int AND paid_at IS NULL)`,
];

/**
 * Re-fit credit to an unpaid, visible bill: scans first (unchanged rule),
 * then replacement credits (`season_credits`, P2.1) into what is left. Run in
 * order, in one transaction.
 */
export const REALLOCATE_CREDIT_SQL = [
  // 1. Scans that no longer fit go back.
  `WITH inv AS (
     SELECT CEIL(gross_minor::numeric / 100) * 100 AS charged
       FROM season_invoices WHERE id = $1::int AND paid_at IS NULL
   ),
   ranked AS (
     SELECT id, SUM(credit_minor) OVER (ORDER BY id) AS running
       FROM multisport_scans WHERE applied_invoice_id = $1::int
   )
   UPDATE multisport_scans SET applied_invoice_id = NULL
    WHERE id IN (SELECT r.id FROM ranked r, inv WHERE r.running > inv.charged)`,
  // 2. Replacement credits are re-fitted from scratch after the scans.
  `UPDATE season_credits SET applied_invoice_id = NULL
    WHERE applied_invoice_id = $1::int
      AND EXISTS (SELECT 1 FROM season_invoices WHERE id = $1::int AND paid_at IS NULL)`,
  // 3. Waiting scans that now fit are used.
  `WITH inv AS (
     SELECT id, player_id, CEIL(gross_minor::numeric / 100) * 100 AS charged
       FROM season_invoices
      WHERE id = $1::int AND paid_at IS NULL AND hidden_at IS NULL
   ),
   used AS (
     SELECT COALESCE(SUM(credit_minor), 0) AS amount
       FROM multisport_scans WHERE applied_invoice_id = $1::int
   ),
   available AS MATERIALIZED (
     SELECT ms.id, ms.credit_minor
       FROM multisport_scans ms
       JOIN inv ON inv.player_id = ms.player_id
      WHERE ms.status = 'approved' AND ms.applied_invoice_id IS NULL
        AND ms.settled_at IS NULL
      ORDER BY ms.id
      FOR UPDATE OF ms
   ),
   ranked AS (
     SELECT id, SUM(credit_minor) OVER (ORDER BY id) AS running FROM available
   )
   UPDATE multisport_scans SET applied_invoice_id = $1::int
    WHERE id IN (
      SELECT r.id FROM ranked r, inv, used WHERE used.amount + r.running <= inv.charged
    )`,
  // 4. Replacement credits of the same season fill what the scans left.
  `WITH inv AS (
     SELECT id, season_id, player_id, CEIL(gross_minor::numeric / 100) * 100 AS charged
       FROM season_invoices
      WHERE id = $1::int AND paid_at IS NULL AND hidden_at IS NULL
   ),
   used AS (
     SELECT COALESCE(SUM(credit_minor), 0) AS amount
       FROM multisport_scans WHERE applied_invoice_id = $1::int
   ),
   available AS MATERIALIZED (
     SELECT sc.id, sc.credit_minor
       FROM season_credits sc
       JOIN inv ON inv.player_id = sc.player_id AND inv.season_id = sc.season_id
      WHERE sc.applied_invoice_id IS NULL AND sc.settled_at IS NULL
      ORDER BY sc.id
      FOR UPDATE OF sc
   ),
   ranked AS (
     SELECT id, SUM(credit_minor) OVER (ORDER BY id) AS running FROM available
   )
   UPDATE season_credits SET applied_invoice_id = $1::int
    WHERE id IN (
      SELECT r.id FROM ranked r, inv, used WHERE used.amount + r.running <= inv.charged
    )`,
  // 5. The bill's credit is what is now attached to it.
  `UPDATE season_invoices
      SET credit_minor =
            (SELECT COALESCE(SUM(credit_minor), 0) FROM multisport_scans WHERE applied_invoice_id = $1::int)::int
          + (SELECT COALESCE(SUM(credit_minor), 0) FROM season_credits WHERE applied_invoice_id = $1::int)::int
    WHERE id = $1::int AND paid_at IS NULL`,
];

/**
 * Raise one subscriber's invoice for a month, using credit in order: their
 * MultiSport scans (only while they fit the bill; the rest waits), then
 * replacement credits of the season into what is left (P2.1). A draft (P4.1)
 * is created hidden, marked is_draft and with no credit attached.
 *
 * `$1` season, `$2` player, `$3` period, `$4` playing days, `$5` day rate,
 * `$6` split between, `$7` gross, `$8` due date, `$9` charged (gross rounded
 * up to whole PLN), `$10` draft. Returns the new id, or nothing if the
 * invoice already existed.
 */
export const GENERATE_INVOICE_SQL = `WITH available_credit AS MATERIALIZED (
         SELECT id, credit_minor
           FROM multisport_scans
          WHERE player_id = $2 AND status = 'approved'
            AND applied_invoice_id IS NULL AND settled_at IS NULL
          ORDER BY id
          FOR UPDATE
       ),
       fitting_credit AS (
         SELECT id, credit_minor
           FROM (SELECT id, credit_minor,
                        SUM(credit_minor) OVER (ORDER BY id) AS running
                   FROM available_credit) ranked
          WHERE running <= $9::int
       ),
       scan_credit AS (
         SELECT COALESCE(SUM(credit_minor), 0)::int AS amount
           FROM fitting_credit
       ),
       -- P2.1: replacement credits fill what the scans left, oldest first.
       available_season_credit AS MATERIALIZED (
         SELECT id, credit_minor
           FROM season_credits
          WHERE season_id = $1 AND player_id = $2
            AND applied_invoice_id IS NULL AND settled_at IS NULL
          ORDER BY id
          FOR UPDATE
       ),
       fitting_season_credit AS (
         SELECT r.id, r.credit_minor
           FROM (SELECT id, credit_minor,
                        SUM(credit_minor) OVER (ORDER BY id) AS running
                   FROM available_season_credit) r, scan_credit
          WHERE scan_credit.amount + r.running <= $9::int
       ),
       credit AS (
         SELECT CASE WHEN $10::boolean THEN 0 ELSE scan_credit.amount
                + (SELECT COALESCE(SUM(credit_minor), 0) FROM fitting_season_credit)::int END AS amount
           FROM scan_credit
       ),
       inserted AS (
         INSERT INTO season_invoices
           (season_id, player_id, period, playing_days, day_rate_minor,
            split_between, gross_minor, credit_minor, due_date, is_draft, hidden_at)
         SELECT $1, $2, $3, $4, $5, $6, $7, credit.amount, $8,
                $10::boolean, CASE WHEN $10::boolean THEN CURRENT_TIMESTAMP END
           FROM credit
         ON CONFLICT (season_id, player_id, period) DO NOTHING
         RETURNING id
       ),
       applied AS (
         UPDATE multisport_scans
            SET applied_invoice_id = (SELECT id FROM inserted)
          WHERE id IN (SELECT id FROM fitting_credit)
            AND NOT $10::boolean
            AND EXISTS (SELECT 1 FROM inserted)
         RETURNING id
       ),
       applied_season_credit AS (
         UPDATE season_credits
            SET applied_invoice_id = (SELECT id FROM inserted)
          WHERE id IN (SELECT id FROM fitting_season_credit)
            AND NOT $10::boolean
            AND EXISTS (SELECT 1 FROM inserted)
         RETURNING id
       )
       SELECT id FROM inserted`;
