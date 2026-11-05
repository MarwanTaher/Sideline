import { kickoffInstant, AVAILABILITY_LOCK_MS } from "./match-schedule";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type Recurrence = {
  startDate: string;
  endDate: string;
  weekday: number;
  kickoffTime: string;
  openingWeekday: number;
  openingTime: string;
};

export function calendarDates(startDate: string, endDate: string, weekday: number): string[] {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use a valid calendar date.");
    const ms = Date.parse(`${value}T12:00:00Z`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
      throw new Error("Use a valid calendar date.");
    }
    return ms;
  };
  const start = parse(startDate);
  const end = parse(endDate);
  if (end < start || end - start > 366 * 5 * 86400000) throw new Error("Season must end within five years of its start.");
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error("Choose a valid weekday.");
  const dates: string[] = [];
  for (let ms = start; ms <= end; ms += 86400000) {
    const date = new Date(ms);
    if (date.getUTCDay() === weekday) dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function timeLabel(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Use a valid time.");
  const [hour, minute] = value.split(":").map(Number);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "pm" : "am"}`;
}

export function occurrenceTimes(date: string, config: Pick<Recurrence, "weekday" | "kickoffTime" | "openingWeekday" | "openingTime">) {
  calendarDates(date, date, config.weekday);
  if (!Number.isInteger(config.openingWeekday) || config.openingWeekday < 0 || config.openingWeekday > 6) {
    throw new Error("Choose a valid opening weekday.");
  }
  const daysBefore = (config.weekday - config.openingWeekday + 7) % 7;
  const openingDate = new Date(`${date}T12:00:00Z`);
  openingDate.setUTCDate(openingDate.getUTCDate() - daysBefore);
  const kickoff = kickoffInstant(null, date, timeLabel(config.kickoffTime));
  const opening = kickoffInstant(null, openingDate.toISOString().slice(0, 10), timeLabel(config.openingTime));
  if (kickoff == null || opening == null || opening >= kickoff - AVAILABILITY_LOCK_MS) {
    throw new Error("Signup must open before the 24-hour change lock.");
  }
  return { kickoffAt: new Date(kickoff).toISOString(), opensAt: new Date(opening).toISOString(), locksAt: new Date(kickoff - AVAILABILITY_LOCK_MS).toISOString() };
}

export function effectiveDuration(baseMinutes: number, extensionMinutes: number, extended: boolean): number {
  return baseMinutes + (extended ? extensionMinutes : 0);
}

export function mergeCalendarDates(previous: string[], future: string[], protectedDates: string[], cutoff: string): string[] {
  return [...new Set([...previous.filter((date) => date <= cutoff), ...future.filter((date) => date > cutoff), ...protectedDates])].sort();
}
