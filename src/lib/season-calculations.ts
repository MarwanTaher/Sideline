/** Pure calendar and amount calculations for season billing. */

export const SEASON_PAYMENT_REMINDER_COPY = {
  threeDays: "Your season invoice is due in 3 days. Check the amount and payment details.",
  today: "Your season invoice is due today. Check the amount and payment details.",
} as const;

/** "2026-11" → Sundays in that month that fall inside the contract. */
export function playingDaysInPeriod(
  period: string,
  startDate: string,
  endDate: string | null,
): number {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return 0;

  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = endDate ? Date.parse(`${endDate}T00:00:00Z`) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(start) || (endDate != null && !Number.isFinite(end))) return 0;

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
