import "server-only";
import { sqlClient } from "./db";
import { formatMinor, roundUpToPlnMinor } from "./format-money";
import {
  seasonReminderDueDates,
  SEASON_PAYMENT_REMINDER_COPY,
} from "./season-calculations";
import { notify } from "./push";
import { logAppError } from "./error-log";

type ReminderInvoiceRow = {
  id: number;
  player_id: number;
  name: string;
  period: string;
  due_date: string;
  gross_minor: number;
  credit_minor: number;
};

export type SeasonReminderResult = {
  checked: number;
  notified: number;
  failed: number;
};

/**
 * Send the two scheduled nudges used by the daily cron. The app_settings key is
 * claimed before sending so repeated cron invocations cannot create a push
 * storm for the same invoice.
 */
export async function sendSeasonPaymentReminders(
  now: Date = new Date(),
): Promise<SeasonReminderResult> {
  const dates = seasonReminderDueDates(now);
  const invoices = (await sqlClient.query(
    `SELECT si.id, si.player_id, p.name, si.period, si.due_date,
            si.gross_minor, si.credit_minor
       FROM season_invoices si
       JOIN players p ON p.id = si.player_id
      WHERE si.due_date = ANY($1::text[])
        AND si.paid_at IS NULL
        AND si.declared_paid_at IS NULL
        AND si.hidden_at IS NULL
        AND si.credit_minor < CEIL(si.gross_minor::numeric / 100) * 100
      ORDER BY si.due_date, p.name`,
    [[dates.threeDays, dates.today]],
  )) as ReminderInvoiceRow[];

  const groups = new Map<number, { rows: ReminderInvoiceRow[]; playerIds: Set<number> }>();
  for (const invoice of invoices) {
    const daysBeforeDue = invoice.due_date === dates.today ? 0 : 3;
    const claimed = (await sqlClient.query(
      `INSERT INTO app_settings(key, value)
       VALUES ($1, '1')
       ON CONFLICT (key) DO NOTHING
       RETURNING key`,
      [`season_invoice_reminder_${invoice.id}_${daysBeforeDue}`],
    )) as Array<{ key: string }>;
    if (claimed.length === 0) continue;
    const group = groups.get(daysBeforeDue) ?? { rows: [], playerIds: new Set<number>() };
    group.rows.push(invoice);
    group.playerIds.add(Number(invoice.player_id));
    groups.set(daysBeforeDue, group);
  }

  let notified = 0;
  let failed = 0;
  for (const [daysBeforeDue, group] of groups) {
    const playerIds = [...group.playerIds];
    const title = daysBeforeDue === 0 ? "Season payment due today" : "Season payment due soon";
    const body =
      daysBeforeDue === 0
        ? SEASON_PAYMENT_REMINDER_COPY.today
        : SEASON_PAYMENT_REMINDER_COPY.threeDays;
    try {
      await notify(
        "payment_due",
        {
          title,
          body,
          url: "/season?tab=payments",
          tag: `season-invoice-reminder-${daysBeforeDue}-${daysBeforeDue === 0 ? dates.today : dates.threeDays}`,
        },
        { playerIds },
      );
      notified += playerIds.length;
    } catch (error) {
      failed += playerIds.length;
      await logAppError(error, "season.payment-reminders");
    }
  }

  return { checked: invoices.length, notified, failed };
}

/** Send the admin's one-tap reminder for a single still-unpaid invoice. */
export async function sendSeasonInvoiceReminder(invoiceId: number): Promise<boolean> {
  const rows = (await sqlClient.query(
    `SELECT si.id, si.player_id, p.name, si.period, si.gross_minor, si.credit_minor
       FROM season_invoices si
       JOIN players p ON p.id = si.player_id
      WHERE si.id = $1 AND si.paid_at IS NULL AND si.declared_paid_at IS NULL
        AND si.hidden_at IS NULL
        AND si.credit_minor < CEIL(si.gross_minor::numeric / 100) * 100`,
    [invoiceId],
  )) as Array<ReminderInvoiceRow>;
  const invoice = rows[0];
  if (!invoice) return false;

  const amount = Math.max(
    0,
    roundUpToPlnMinor(Number(invoice.gross_minor)) - Number(invoice.credit_minor),
  );
  await notify(
    "payment_due",
    {
      title: "Season payment reminder",
      body: `${invoice.period} invoice · ${formatMinor(amount)} is still outstanding.`,
      url: "/season?tab=payments",
      tag: `season-invoice-manual-${invoice.id}`,
    },
    { playerIds: [Number(invoice.player_id)] },
  );
  return true;
}
