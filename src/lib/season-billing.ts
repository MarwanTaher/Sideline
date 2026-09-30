import "server-only";
import { sqlClient } from "./db";
import { invoiceAmountMinor, roundUpToPlnMinor } from "./format-money";

export { formatMinor, invoiceAmountMinor, roundUpToPlnMinor } from "./format-money";

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
  declaredNote: string;
  note: string;
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
  declared_note: string;
  note: string;
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
    declaredNote: String(r.declared_note ?? ""),
    note: String(r.note ?? ""),
  };
}

/** "2026-11" → the Sundays in that month that fall inside the contract. */
export function playingDaysInPeriod(
  period: string,
  startDate: string,
  endDate: string | null,
): number {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return 0;
  const year = Number(m[1]);
  const month = Number(m[2]);

  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = endDate ? Date.parse(`${endDate}T00:00:00Z`) : Number.POSITIVE_INFINITY;

  let count = 0;
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  while (cursor.getUTCMonth() === month - 1) {
    // 0 = Sunday.
    if (cursor.getUTCDay() === 0) {
      const t = cursor.getTime();
      if (t >= start && t <= end) count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function dueDateFor(period: string, dueDay: number): string {
  return `${period}-${String(Math.max(1, Math.min(28, dueDay))).padStart(2, "0")}`;
}

export type SeasonRates = {
  dayRateMinor: number;
  multisportCreditMinor: number;
  paymentDueDay: number;
  guestRateMinor: number;
  extensionCostMinor: number;
  extensionMinExtra: number;
};

export async function getSeasonRates(seasonId: number): Promise<SeasonRates | null> {
  const rows = (await sqlClient.query(
    `SELECT day_rate_minor, multisport_credit_minor, payment_due_day,
            guest_rate_minor, extension_cost_minor, extension_min_extra
       FROM seasons WHERE id = $1`,
    [seasonId],
  )) as Array<Record<string, number>>;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    dayRateMinor: Number(r.day_rate_minor),
    multisportCreditMinor: Number(r.multisport_credit_minor),
    paymentDueDay: Number(r.payment_due_day),
    guestRateMinor: Number(r.guest_rate_minor),
    extensionCostMinor: Number(r.extension_cost_minor),
    extensionMinExtra: Number(r.extension_min_extra),
  };
}

/**
 * Rates apply to invoices raised from now on. Existing invoices snapshot what
 * they were charged at, so changing these never rewrites a bill.
 */
export async function updateSeasonRates(
  seasonId: number,
  rates: SeasonRates,
): Promise<void> {
  await sqlClient.query(
    `UPDATE seasons
        SET day_rate_minor = $1,
            multisport_credit_minor = $2,
            payment_due_day = $3,
            guest_rate_minor = $4,
            extension_cost_minor = $5,
            extension_min_extra = $6
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

export async function listPlayerInvoices(
  seasonId: number,
  playerId: number,
): Promise<Invoice[]> {
  const rows = (await sqlClient.query(
    `SELECT si.*, ${DUE_AT}, p.name
       FROM season_invoices si
       JOIN players p ON p.id = si.player_id
      WHERE si.season_id = $1 AND si.player_id = $2
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

  let created = 0;
  let skipped = 0;

  for (const s of subscribers) {
    const playerId = Number(s.player_id);
    const credit = await pendingCreditMinor(playerId);

    const inserted = (await sqlClient.query(
      `INSERT INTO season_invoices
         (season_id, player_id, period, playing_days, day_rate_minor,
          split_between, gross_minor, credit_minor, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (season_id, player_id, period) DO NOTHING
       RETURNING id`,
      [seasonId, playerId, period, playingDays, dayRate, splitBetween, gross, credit, dueDate],
    )) as Array<{ id: number }>;

    if (inserted.length === 0) {
      skipped += 1;
      continue;
    }
    created += 1;
    if (credit > 0) await markCreditsApplied(playerId, Number(inserted[0].id));
  }

  return { created, skipped, playingDays, amountMinor: gross };
}

/** Approved scans not yet credited to any bill. */
async function pendingCreditMinor(playerId: number): Promise<number> {
  const rows = (await sqlClient.query(
    `SELECT COALESCE(SUM(credit_minor), 0)::int AS total
       FROM multisport_scans
      WHERE player_id = $1 AND status = 'approved' AND applied_invoice_id IS NULL`,
    [playerId],
  )) as Array<{ total: number }>;
  return Number(rows[0]?.total ?? 0);
}

async function markCreditsApplied(playerId: number, invoiceId: number): Promise<void> {
  await sqlClient.query(
    `UPDATE multisport_scans SET applied_invoice_id = $1
      WHERE player_id = $2 AND status = 'approved' AND applied_invoice_id IS NULL`,
    [invoiceId, playerId],
  );
}

export async function setInvoicePaid(invoiceId: number, paid: boolean): Promise<void> {
  await sqlClient.query(
    `UPDATE season_invoices SET paid_at = ${paid ? "CURRENT_TIMESTAMP" : "NULL"} WHERE id = $1`,
    [invoiceId],
  );
}

/** Correct the billed days when a week is cancelled; recomputes the amount. */
export async function setInvoicePlayingDays(
  invoiceId: number,
  playingDays: number,
): Promise<void> {
  await sqlClient.query(
    `UPDATE season_invoices
        SET playing_days = $1,
            gross_minor = ROUND(($1::numeric * day_rate_minor) / GREATEST(split_between, 1))
      WHERE id = $2`,
    [playingDays, invoiceId],
  );
}

export async function deleteInvoice(invoiceId: number): Promise<void> {
  // Release any credits so they fall onto the next bill instead of vanishing.
  await sqlClient.query(
    `UPDATE multisport_scans SET applied_invoice_id = NULL WHERE applied_invoice_id = $1`,
    [invoiceId],
  );
  await sqlClient.query(`DELETE FROM season_invoices WHERE id = $1`, [invoiceId]);
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
