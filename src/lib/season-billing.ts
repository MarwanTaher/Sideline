import "server-only";
import { sqlClient } from "./db";
import { invoiceAmountMinor, roundUpToPlnMinor } from "./format-money";
import { dueDateFor, playingDaysInPeriod } from "./season-calculations";

export { formatMinor, invoiceAmountMinor, roundUpToPlnMinor } from "./format-money";
export { dueDateFor, playingDaysInPeriod } from "./season-calculations";

/**
 * Season billing — the monthly subscription from the winter contract.
 *
 * Core subscribers owe a monthly amount whether they play or not, so this is
 * deliberately separate from the per-match `payments` table used by everyone
 * else. §8 of the rules is the reason: missing a Sunday does not reduce the
 * bill, because the pitch was already reserved and paid for.
 *
 * All amounts are minor units (grosz). 2,000 PLN / 14 is not representable in
 * binary floating point, and a rounding drift on a shared bill is the kind of
 * bug people argue about.
 */

export type Invoice = {
  id: number;
  seasonId: number;
  playerId: number;
  name: string;
  period: string;
  playingDays: number;
  dayRateMinor: number;
  splitBetween: number;
  grossMinor: number;
  /** Gross rounded up to a whole PLN — what is actually collected. */
  chargedMinor: number;
  /** Surplus created by that rounding. */
  roundingMinor: number;
  creditMinor: number;
  totalMinor: number;
  dueDate: string;
  /** Deadline as a real instant (end of the due day, club time). */
  dueAtMs: number | null;
  paidAt: string | null;
  /** The player says they've paid; not the same as confirmed. */
  declaredPaidAt: string | null;
  createdAt: string | null;
  declaredNote: string;
  note: string;
  /** Hidden by an admin: not shown to the player, reminded or chased. */
  hiddenAt: string | null;
};

type InvoiceRow = {
  id: number;
  season_id: number;
  player_id: number;
  name: string;
  period: string;
  playing_days: number;
  day_rate_minor: number;
  split_between: number;
  gross_minor: number;
  credit_minor: number;
  due_date: string;
  due_at: string | Date | null;
  paid_at: string | Date | null;
  declared_paid_at: string | Date | null;
  created_at: string | Date | null;
  declared_note: string;
  note: string;
  hidden_at?: string | Date | null;
};

function toIso(v: string | Date | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function toInvoice(r: InvoiceRow): Invoice {
  const gross = Number(r.gross_minor);
  const credit = Number(r.credit_minor);
  const charged = roundUpToPlnMinor(gross);
  return {
    id: Number(r.id),
    seasonId: Number(r.season_id),
    playerId: Number(r.player_id),
    name: String(r.name ?? ""),
    period: String(r.period),
    playingDays: Number(r.playing_days),
    dayRateMinor: Number(r.day_rate_minor),
    splitBetween: Number(r.split_between),
    grossMinor: gross,
    chargedMinor: charged,
    roundingMinor: charged - gross,
    creditMinor: credit,
    // A credit larger than the bill must never produce a negative charge.
    totalMinor: Math.max(0, charged - credit),
    dueDate: String(r.due_date),
    dueAtMs: (() => {
      const iso = toIso(r.due_at);
      if (!iso) return null;
      const ms = Date.parse(iso);
      return Number.isFinite(ms) ? ms : null;
    })(),
    paidAt: toIso(r.paid_at),
    declaredPaidAt: toIso(r.declared_paid_at),
    createdAt: toIso(r.created_at),
    declaredNote: String(r.declared_note ?? ""),
    note: String(r.note ?? ""),
    hiddenAt: toIso(r.hidden_at ?? null),
  };
}

export type SeasonRates = {
  dayRateMinor: number;
  multisportCreditMinor: number;
  paymentDueDay: number;
  guestRateMinor: number;
  extensionCostMinor: number;
  extensionMinExtra: number;
  ratesChangedAt: string | null;
};

export async function getSeasonRates(seasonId: number): Promise<SeasonRates | null> {
  const rows = (await sqlClient.query(
    `SELECT day_rate_minor, multisport_credit_minor, payment_due_day,
            guest_rate_minor, extension_cost_minor, extension_min_extra,
            rates_changed_at
       FROM seasons WHERE id = $1`,
    [seasonId],
  )) as Array<Record<string, number | string | Date | null>>;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    dayRateMinor: Number(r.day_rate_minor),
    multisportCreditMinor: Number(r.multisport_credit_minor),
    paymentDueDay: Number(r.payment_due_day),
    guestRateMinor: Number(r.guest_rate_minor),
    extensionCostMinor: Number(r.extension_cost_minor),
    extensionMinExtra: Number(r.extension_min_extra),
    ratesChangedAt: toIso(r.rates_changed_at as string | Date | null),
  };
}

/**
 * Rates apply to invoices raised from now on. Existing invoices snapshot what
 * they were charged at, so changing these never rewrites a bill.
 */
export async function updateSeasonRates(
  seasonId: number,
  rates: Omit<SeasonRates, "ratesChangedAt">,
): Promise<void> {
  const changed =
    "day_rate_minor IS DISTINCT FROM $1 OR multisport_credit_minor IS DISTINCT FROM $2 OR " +
    "payment_due_day IS DISTINCT FROM $3 OR guest_rate_minor IS DISTINCT FROM $4 OR " +
    "extension_cost_minor IS DISTINCT FROM $5 OR extension_min_extra IS DISTINCT FROM $6";
  await sqlClient.query(
    `UPDATE seasons
        SET day_rate_minor = $1,
            multisport_credit_minor = $2,
            payment_due_day = $3,
            guest_rate_minor = $4,
            extension_cost_minor = $5,
            extension_min_extra = $6,
            rates_changed_at = CASE WHEN ${changed}
              THEN CURRENT_TIMESTAMP ELSE rates_changed_at END,
            rates_confirmed_at = CASE WHEN ${changed} THEN CASE
              WHEN visible_to_players THEN CURRENT_TIMESTAMP ELSE NULL
            END ELSE rates_confirmed_at END
      WHERE id = $7`,
    [
      rates.dayRateMinor,
      rates.multisportCreditMinor,
      rates.paymentDueDay,
      rates.guestRateMinor,
      rates.extensionCostMinor,
      rates.extensionMinExtra,
      seasonId,
    ],
  );
}

// The deadline is the end of the due day in the club's zone, not UTC midnight.
const DUE_AT = `((si.due_date || ' 23:59:59')::timestamp AT TIME ZONE 'Europe/Warsaw') AS due_at`;

export async function listInvoices(
  seasonId: number,
  period?: string,
): Promise<Invoice[]> {
  const rows = (await sqlClient.query(
    `SELECT si.*, ${DUE_AT}, p.name
       FROM season_invoices si
       JOIN players p ON p.id = si.player_id
      WHERE si.season_id = $1 AND ($2::text IS NULL OR si.period = $2)
      ORDER BY si.period DESC, p.name ASC`,
    [seasonId, period ?? null],
  )) as InvoiceRow[];
  return rows.map(toInvoice);
}

export async function listOutstandingInvoices(seasonId: number): Promise<Invoice[]> {
  const rows = (await sqlClient.query(
    `SELECT si.*, ${DUE_AT}, p.name
       FROM season_invoices si
       JOIN players p ON p.id = si.player_id
      WHERE si.season_id = $1 AND si.paid_at IS NULL AND si.hidden_at IS NULL
        AND si.credit_minor < CEIL(si.gross_minor::numeric / 100) * 100
      ORDER BY si.due_date ASC, p.name ASC`,
    [seasonId],
  )) as InvoiceRow[];
  return rows.map(toInvoice);
}

export type WithdrawnInvoiceWarning = {
  playerId: number;
  name: string;
  period: string;
  totalMinor: number;
};

export async function listWithdrawnWithOpenInvoices(
  seasonId: number,
): Promise<WithdrawnInvoiceWarning[]> {
  const rows = (await sqlClient.query(
    `SELECT si.player_id, p.name, si.period, si.gross_minor, si.credit_minor
       FROM season_invoices si
       JOIN season_subscriptions ss
         ON ss.season_id = si.season_id AND ss.player_id = si.player_id
       JOIN players p ON p.id = si.player_id
      WHERE si.season_id = $1 AND ss.status = 'withdrawn' AND si.paid_at IS NULL
        AND si.hidden_at IS NULL
        AND si.credit_minor < CEIL(si.gross_minor::numeric / 100) * 100
      ORDER BY si.due_date ASC, p.name ASC`,
    [seasonId],
  )) as Array<{
    player_id: number;
    name: string;
    period: string;
    gross_minor: number;
    credit_minor: number;
  }>;
  return rows.map((row) => ({
    playerId: Number(row.player_id),
    name: String(row.name),
    period: String(row.period),
    totalMinor: Math.max(
      0,
      roundUpToPlnMinor(Number(row.gross_minor)) - Number(row.credit_minor),
    ),
  }));
}

export type SeasonGoLiveChecklist = {
  transferDetailsComplete: boolean;
  ratesConfirmed: boolean;
  termsFinal: boolean;
  testInvoiceCompleted: boolean;
  reminderTextReviewed: boolean;
  complete: boolean;
};

export async function getSeasonGoLiveChecklist(
  seasonId: number,
): Promise<SeasonGoLiveChecklist | null> {
  const rows = (await sqlClient.query(
    `SELECT payment_name, payment_account, day_rate_minor, payment_due_day, terms,
            rates_confirmed_at, terms_final_at, test_invoice_completed_at,
            reminder_text_reviewed_at
       FROM seasons WHERE id = $1`,
    [seasonId],
  )) as Array<{
    payment_name: string | null;
    payment_account: string | null;
    day_rate_minor: number;
    payment_due_day: number;
    terms: string | null;
    rates_confirmed_at: string | Date | null;
    terms_final_at: string | Date | null;
    test_invoice_completed_at: string | Date | null;
    reminder_text_reviewed_at: string | Date | null;
  }>;
  if (rows.length === 0) return null;

  const row = rows[0];
  const checks = {
    transferDetailsComplete: Boolean(row.payment_name?.trim() && row.payment_account?.trim()),
    ratesConfirmed:
      Number(row.day_rate_minor) > 0 &&
      Number(row.payment_due_day) >= 1 &&
      Number(row.payment_due_day) <= 28 &&
      row.rates_confirmed_at != null,
    termsFinal: Boolean(row.terms?.trim() && row.terms_final_at != null),
    testInvoiceCompleted: row.test_invoice_completed_at != null,
    reminderTextReviewed: row.reminder_text_reviewed_at != null,
  };
  return { ...checks, complete: Object.values(checks).every(Boolean) };
}

export type SeasonGoLiveCheckKey =
  | "ratesConfirmed"
  | "termsFinal"
  | "testInvoiceCompleted"
  | "reminderTextReviewed";

const GO_LIVE_CHECK_COLUMNS: Record<SeasonGoLiveCheckKey, string> = {
  ratesConfirmed: "rates_confirmed_at",
  termsFinal: "terms_final_at",
  testInvoiceCompleted: "test_invoice_completed_at",
  reminderTextReviewed: "reminder_text_reviewed_at",
};

export async function setSeasonGoLiveCheck(
  seasonId: number,
  check: SeasonGoLiveCheckKey,
  checked: boolean,
): Promise<void> {
  const column = GO_LIVE_CHECK_COLUMNS[check];
  if (!column) throw new Error("Invalid go-live check.");
  const preconditions = {
    ratesConfirmed: `day_rate_minor > 0 AND payment_due_day BETWEEN 1 AND 28`,
    termsFinal: `length(btrim(terms)) > 0`,
    testInvoiceCompleted: "TRUE",
    reminderTextReviewed: "TRUE",
  }[check];
  const rows = (await sqlClient.query(
    `UPDATE seasons
        SET ${column} = CASE WHEN $2 AND ${preconditions} THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = $1 AND (NOT $2 OR ${preconditions})
      RETURNING id`,
    [seasonId, checked],
  )) as Array<{ id: number }>;
  if (rows.length === 0) {
    throw new Error("Set valid rates or add the final terms before confirming this item.");
  }
}

export async function listPlayerInvoices(
  seasonId: number,
  playerId: number,
): Promise<Invoice[]> {
  const rows = (await sqlClient.query(
    `SELECT si.*, ${DUE_AT}, p.name
       FROM season_invoices si
       JOIN players p ON p.id = si.player_id
      WHERE si.season_id = $1 AND si.player_id = $2 AND si.hidden_at IS NULL
      ORDER BY si.period DESC`,
    [seasonId, playerId],
  )) as InvoiceRow[];
  return rows.map(toInvoice);
}

export type SeasonPaymentDetails = {
  paymentName: string;
  paymentAccount: string;
  paymentMethod: string;
  paymentNote: string;
  payLink: string;
};

export async function getPaymentDetails(
  seasonId: number,
): Promise<SeasonPaymentDetails> {
  const rows = (await sqlClient.query(
    `SELECT payment_name, payment_account, payment_method, payment_note, pay_link
       FROM seasons WHERE id = $1`,
    [seasonId],
  )) as Array<Record<string, string>>;
  const r = rows[0] ?? {};
  return {
    paymentName: String(r.payment_name ?? ""),
    paymentAccount: String(r.payment_account ?? ""),
    paymentMethod: String(r.payment_method ?? ""),
    paymentNote: String(r.payment_note ?? ""),
    payLink: String(r.pay_link ?? ""),
  };
}

export async function updatePaymentDetails(
  seasonId: number,
  details: SeasonPaymentDetails,
): Promise<void> {
  await sqlClient.query(
    `UPDATE seasons
        SET payment_name = $1, payment_account = $2, payment_method = $3,
            payment_note = $4, pay_link = $5
      WHERE id = $6`,
    [
      details.paymentName.trim(),
      details.paymentAccount.trim(),
      details.paymentMethod.trim(),
      details.paymentNote.trim(),
      details.payLink.trim(),
      seasonId,
    ],
  );
}

/** A player claims they have transferred the money. */
export async function declareInvoicePaid(
  invoiceId: number,
  playerId: number,
  declared: boolean,
  note: string,
): Promise<void> {
  await sqlClient.query(
    `UPDATE season_invoices
        SET declared_paid_at = ${declared ? "CURRENT_TIMESTAMP" : "NULL"},
            declared_note = $1
      WHERE id = $2 AND player_id = $3 AND paid_at IS NULL`,
    [declared ? note.trim() : "", invoiceId, playerId],
  );
}

/**
 * "Pay together": declare (or withdraw) every open visible bill of the player
 * in one go. Declaring skips bills already declared so their timestamps stay.
 * Returns how many bills changed.
 */
export async function declareAllInvoicesPaid(
  seasonId: number,
  playerId: number,
  declared: boolean,
  note: string,
): Promise<number> {
  const rows = (await (declared
    ? sqlClient.query(
        `UPDATE season_invoices
            SET declared_paid_at = CURRENT_TIMESTAMP, declared_note = $3
          WHERE season_id = $1 AND player_id = $2
            AND paid_at IS NULL AND hidden_at IS NULL AND declared_paid_at IS NULL
            AND credit_minor < CEIL(gross_minor::numeric / 100) * 100
          RETURNING id`,
        [seasonId, playerId, note.trim()],
      )
    : sqlClient.query(
        `UPDATE season_invoices
            SET declared_paid_at = NULL, declared_note = ''
          WHERE season_id = $1 AND player_id = $2
            AND paid_at IS NULL AND hidden_at IS NULL AND declared_paid_at IS NOT NULL
          RETURNING id`,
        [seasonId, playerId],
      ))) as Array<{ id: number }>;
  return rows.length;
}

/**
 * Hide an invoice from the player (or show it again). Hiding an unpaid bill
 * gives its MultiSport credit back so it comes off a later bill; showing it
 * again re-applies whatever credit is still waiting. A paid bill keeps its
 * credit — the player already paid the reduced amount.
 */
export async function setInvoiceHidden(invoiceId: number, hidden: boolean): Promise<void> {
  if (hidden) {
    await sqlClient.transaction([
      sqlClient.query(
        `UPDATE multisport_scans SET applied_invoice_id = NULL
          WHERE applied_invoice_id = $1::int
            AND EXISTS (SELECT 1 FROM season_invoices WHERE id = $1::int AND paid_at IS NULL)`,
        [invoiceId],
      ),
      sqlClient.query(
        `UPDATE season_invoices
            SET hidden_at = CURRENT_TIMESTAMP,
                credit_minor = CASE WHEN paid_at IS NULL THEN 0 ELSE credit_minor END
          WHERE id = $1::int`,
        [invoiceId],
      ),
    ]);
    return;
  }
  await sqlClient.transaction([
    sqlClient.query(`UPDATE season_invoices SET hidden_at = NULL WHERE id = $1::int`, [invoiceId]),
    ...reallocateCreditQueries(invoiceId),
  ]);
}

/** Periods that already have invoices, newest first. */
export async function listInvoicePeriods(seasonId: number): Promise<string[]> {
  const rows = (await sqlClient.query(
    `SELECT DISTINCT period FROM season_invoices WHERE season_id = $1 ORDER BY period DESC`,
    [seasonId],
  )) as Array<{ period: string }>;
  return rows.map((r) => String(r.period));
}

export type GenerateResult = {
  created: number;
  skipped: number;
  playingDays: number;
  amountMinor: number;
};

/**
 * Raise the month's bills for every active subscriber.
 *
 * Existing invoices are left alone, so re-running after someone joins mid-month
 * only fills the gaps and never rewrites a bill someone has already paid.
 * Approved MultiSport scans that have not yet been credited are applied here —
 * scans from any earlier match, which is what "deducted from the next bill"
 * means in practice.
 */
export async function generateInvoices(
  seasonId: number,
  period: string,
): Promise<GenerateResult> {
  const seasonRows = (await sqlClient.query(
    `SELECT start_date, end_date, subscriber_cap, day_rate_minor, payment_due_day
       FROM seasons WHERE id = $1`,
    [seasonId],
  )) as Array<{
    start_date: string;
    end_date: string | null;
    subscriber_cap: number;
    day_rate_minor: number;
    payment_due_day: number;
  }>;
  if (seasonRows.length === 0) {
    return { created: 0, skipped: 0, playingDays: 0, amountMinor: 0 };
  }
  const season = seasonRows[0];

  const playingDays = playingDaysInPeriod(
    period,
    String(season.start_date),
    season.end_date == null ? null : String(season.end_date),
  );
  const splitBetween = Number(season.subscriber_cap);
  const dayRate = Number(season.day_rate_minor);
  const gross = invoiceAmountMinor(playingDays, dayRate, splitBetween);
  const dueDate = dueDateFor(period, Number(season.payment_due_day));

  const subscribers = (await sqlClient.query(
    `SELECT player_id FROM season_subscriptions
      WHERE season_id = $1 AND status = 'active'
      ORDER BY seat_no`,
    [seasonId],
  )) as Array<{ player_id: number }>;

  const writes = subscribers.map((subscriber) =>
    sqlClient.query(
      // Credits are used in scan order only while they fit the bill; the rest
      // stays approved and comes off a later bill instead of being lost.
      // Locked before ranking (FOR UPDATE cannot sit next to a window function).
      `WITH available_credit AS MATERIALIZED (
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
       credit AS (
         SELECT COALESCE(SUM(credit_minor), 0)::int AS amount
           FROM fitting_credit
       ),
       inserted AS (
         INSERT INTO season_invoices
           (season_id, player_id, period, playing_days, day_rate_minor,
            split_between, gross_minor, credit_minor, due_date)
         SELECT $1, $2, $3, $4, $5, $6, $7, credit.amount, $8 FROM credit
         ON CONFLICT (season_id, player_id, period) DO NOTHING
         RETURNING id
       ),
       applied AS (
         UPDATE multisport_scans
            SET applied_invoice_id = (SELECT id FROM inserted)
          WHERE id IN (SELECT id FROM fitting_credit)
            AND EXISTS (SELECT 1 FROM inserted)
         RETURNING id
       )
       SELECT id FROM inserted`,
      [
        seasonId,
        Number(subscriber.player_id),
        period,
        playingDays,
        dayRate,
        splitBetween,
        gross,
        dueDate,
        roundUpToPlnMinor(gross),
      ],
    ),
  );
  const results = writes.length
    ? await sqlClient.transaction(writes)
    : [];
  const created = results.filter((rows) => rows.length > 0).length;
  const skipped = subscribers.length - created;

  return { created, skipped, playingDays, amountMinor: gross };
}

export async function setInvoicePaid(invoiceId: number, paid: boolean): Promise<void> {
  await sqlClient.query(
    `UPDATE season_invoices SET paid_at = ${paid ? "CURRENT_TIMESTAMP" : "NULL"} WHERE id = $1`,
    [invoiceId],
  );
}

export async function confirmDeclaredInvoices(
  seasonId: number,
  period: string,
): Promise<number> {
  const rows = (await sqlClient.query(
    `UPDATE season_invoices
        SET paid_at = CURRENT_TIMESTAMP
      WHERE season_id = $1 AND period = $2
        AND declared_paid_at IS NOT NULL AND paid_at IS NULL
      RETURNING id`,
    [seasonId, period],
  )) as Array<{ id: number }>;
  return rows.length;
}

/** Correct the billed days when a week is cancelled; recomputes the amount. */
export async function setInvoicePlayingDays(
  invoiceId: number,
  playingDays: number,
): Promise<void> {
  await sqlClient.transaction([
    sqlClient.query(
      `UPDATE season_invoices
          SET playing_days = $1::int,
              gross_minor = ROUND(($1::int::numeric * day_rate_minor) / GREATEST(split_between, 1))
        WHERE id = $2::int`,
      [playingDays, invoiceId],
    ),
    ...reallocateCreditQueries(invoiceId),
  ]);
}

/**
 * Re-fit MultiSport credit to an unpaid, visible bill after its amount changed:
 * credit that no longer fits goes back for a later bill, and waiting credit
 * that now fits is used. Paid bills are a closed record and are left alone.
 */
function reallocateCreditQueries(invoiceId: number) {
  return [
    sqlClient.query(
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
      [invoiceId],
    ),
    sqlClient.query(
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
      [invoiceId],
    ),
    sqlClient.query(
      `UPDATE season_invoices
          SET credit_minor = (SELECT COALESCE(SUM(credit_minor), 0)::int
                                FROM multisport_scans WHERE applied_invoice_id = $1::int)
        WHERE id = $1::int AND paid_at IS NULL`,
      [invoiceId],
    ),
  ];
}

export async function deleteInvoice(invoiceId: number): Promise<void> {
  // Release any credits so they fall onto the next bill instead of vanishing.
  await sqlClient.transaction([
    sqlClient.query(
      `UPDATE multisport_scans SET applied_invoice_id = NULL WHERE applied_invoice_id = $1`,
      [invoiceId],
    ),
    sqlClient.query(`DELETE FROM season_invoices WHERE id = $1`, [invoiceId]),
  ]);
}

export type SeasonBillingSummary = {
  period: string;
  invoices: number;
  paid: number;
  dueMinor: number;
  collectedMinor: number;
  /** Surplus from rounding up to whole PLN, for this period. */
  roundingMinor: number;
  /** Surplus already collected, i.e. on paid invoices only. */
  roundingCollectedMinor: number;
};

// Charged = gross rounded up to a whole PLN; payable = charged less credits.
const CHARGED = `(CEIL(gross_minor::numeric / 100) * 100)`;
const PAYABLE = `GREATEST(${CHARGED} - credit_minor, 0)`;
const ROUNDING = `(${CHARGED} - gross_minor)`;

export async function getBillingSummary(
  seasonId: number,
  period: string,
): Promise<SeasonBillingSummary> {
  const rows = (await sqlClient.query(
    `SELECT COUNT(*)::int AS invoices,
            COUNT(paid_at)::int AS paid,
            COALESCE(SUM(${PAYABLE}), 0)::int AS due,
            COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN ${PAYABLE} ELSE 0 END), 0)::int AS collected,
            COALESCE(SUM(${ROUNDING}), 0)::int AS rounding,
            COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN ${ROUNDING} ELSE 0 END), 0)::int AS rounding_collected
       FROM season_invoices WHERE season_id = $1 AND period = $2`,
    [seasonId, period],
  )) as Array<{
    invoices: number;
    paid: number;
    due: number;
    collected: number;
    rounding: number;
    rounding_collected: number;
  }>;
  const r = rows[0];
  return {
    period,
    invoices: Number(r?.invoices ?? 0),
    paid: Number(r?.paid ?? 0),
    dueMinor: Number(r?.due ?? 0),
    collectedMinor: Number(r?.collected ?? 0),
    roundingMinor: Number(r?.rounding ?? 0),
    roundingCollectedMinor: Number(r?.rounding_collected ?? 0),
  };
}

export type RoundingLine = {
  period: string;
  invoices: number;
  roundingMinor: number;
  collectedMinor: number;
};

/**
 * Rounding surplus per month across the whole season. Small per player, but it
 * accumulates into real money the group owns and should be able to see.
 */
export async function getRoundingLedger(seasonId: number): Promise<{
  lines: RoundingLine[];
  totalMinor: number;
  collectedMinor: number;
}> {
  const rows = (await sqlClient.query(
    `SELECT period,
            COUNT(*)::int AS invoices,
            COALESCE(SUM(${ROUNDING}), 0)::int AS rounding,
            COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN ${ROUNDING} ELSE 0 END), 0)::int AS collected
       FROM season_invoices
      WHERE season_id = $1
      GROUP BY period
      ORDER BY period DESC`,
    [seasonId],
  )) as Array<{ period: string; invoices: number; rounding: number; collected: number }>;

  const lines = rows.map((r) => ({
    period: String(r.period),
    invoices: Number(r.invoices),
    roundingMinor: Number(r.rounding),
    collectedMinor: Number(r.collected),
  }));

  return {
    lines,
    totalMinor: lines.reduce((sum, l) => sum + l.roundingMinor, 0),
    collectedMinor: lines.reduce((sum, l) => sum + l.collectedMinor, 0),
  };
}
