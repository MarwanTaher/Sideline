/** Pure calendar and amount calculations for season billing. */
import { calendarDates } from "./match-recurrence";
import { invoiceAmountMinor, roundUpToPlnMinor } from "./format-money";

export const SEASON_PAYMENT_REMINDER_COPY = {
  threeDays: "Your season invoice is due in 3 days. Check the amount and payment details.",
  today: "Your season invoice is due today. Check the amount and payment details.",
} as const;

/** "2026-11" → Sundays in that month that fall inside the contract. */
export function playingDaysInPeriod(
  period: string,
  startDate: string,
  endDate: string | null,
  options?: { weekday: number; waivedDates: string[]; scheduledDates?: string[] },
): number {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return 0;

  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = endDate ? Date.parse(`${endDate}T00:00:00Z`) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(start) || (endDate != null && !Number.isFinite(end))) return 0;

  if (options) {
    const monthStart = `${period}-01`;
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const from = startDate > monthStart ? startDate : monthStart;
    const to = endDate && endDate < monthEnd ? endDate : monthEnd;
    if (to < from) return 0;
    return (options.scheduledDates ?? calendarDates(from, to, options.weekday))
      .filter((date) => date >= from && date <= to && !options.waivedDates.includes(date)).length;
  }

  let count = 0;
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  while (cursor.getUTCMonth() === month - 1) {
    if (
      cursor.getUTCDay() === 0 &&
      cursor.getTime() >= start &&
      cursor.getTime() <= end
    ) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function dueDateFor(period: string, dueDay: number): string {
  return `${period}-${String(Math.max(1, Math.min(28, Math.trunc(dueDay)))).padStart(2, "0")}`;
}

/** The Warsaw-calendar dates used by the daily invoice reminder job. */
export function seasonReminderDueDates(now: Date): { today: string; threeDays: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${date.year}-${date.month}-${date.day}`;
  const plusThree = new Date(
    Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day) + 3),
  );
  const threeDays = [
    plusThree.getUTCFullYear(),
    String(plusThree.getUTCMonth() + 1).padStart(2, "0"),
    String(plusThree.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return { today, threeDays };
}

export type SeatCapGap = {
  period: string;
  subscriberCap: number;
  activeSubscribers: number;
  emptySeats: number;
  playingDays: number;
  /** Pitch cost for the month. */
  costMinor: number;
  /** What the active subscribers' invoices raise (each rounded up to whole PLN). */
  invoicedMinor: number;
  /** Cost the invoices leave uncovered; positive means the fund has to cover it. */
  gapMinor: number;
};

/**
 * With the season split by seat cap (decision 5), each subscriber pays
 * cost ÷ cap, so every empty seat leaves part of the pitch cost uncovered.
 * Returns null when every seat is taken or the month has no playing days.
 */
export function seatCapGap(input: {
  period: string;
  subscriberCap: number;
  activeSubscribers: number;
  playingDays: number;
  dayRateMinor: number;
}): SeatCapGap | null {
  const cap = Math.max(0, Math.trunc(input.subscriberCap));
  const active = Math.max(0, Math.trunc(input.activeSubscribers));
  if (cap === 0 || active >= cap || input.playingDays <= 0) return null;
  const costMinor = input.playingDays * input.dayRateMinor;
  const perSeat = roundUpToPlnMinor(
    invoiceAmountMinor(input.playingDays, input.dayRateMinor, cap),
  );
  const invoicedMinor = active * perSeat;
  return {
    period: input.period,
    subscriberCap: cap,
    activeSubscribers: active,
    emptySeats: cap - active,
    playingDays: input.playingDays,
    costMinor,
    invoicedMinor,
    gapMinor: costMinor - invoicedMinor,
  };
}

export type SplitMode = "cap" | "active";

/**
 * How many shares the month's pitch cost is split into (P2.6). 'cap' (the
 * default, decision 5) keeps a fixed price; 'active' splits between the
 * active subscribers so the cost is always covered.
 */
export function splitBetween(mode: SplitMode, subscriberCap: number, activeSubscribers: number): number {
  return mode === "active" && activeSubscribers > 0 ? activeSubscribers : subscriberCap;
}

/** P4.1: day of the month (club time) from which next month's draft invoices are created. */
export const DRAFT_INVOICE_DAY = 25;

/**
 * P4.1: the month to draft invoices for on `today` (YYYY-MM-DD, club time),
 * or null. From the 25th, next month is drafted if it overlaps the contract
 * (start date to end date, inclusive).
 */
export function nextDraftPeriod(
  today: string,
  startDate: string,
  endDate: string | null,
  draftDay = DRAFT_INVOICE_DAY,
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m) return null;
  if (Number(m[3]) < draftDay) return null;
  const year = Number(m[1]) + (m[2] === "12" ? 1 : 0);
  const month = m[2] === "12" ? 1 : Number(m[2]) + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  if (startDate > lastDay) return null;
  if (endDate != null && endDate < `${period}-01`) return null;
  return period;
}
