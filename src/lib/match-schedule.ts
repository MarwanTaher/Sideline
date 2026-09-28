// Client-safe helpers for the match kickoff schedule + the 24h availability lock.

export const AVAILABILITY_LOCK_MS = 24 * 60 * 60 * 1000;

/** Kickoff time as epoch ms from stored "YYYY-MM-DD" + "hh:mm am/pm". */
export function matchStartMs(playedOn: string, matchTime: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(playedOn ?? "").trim());
  if (!d) return null;
  const t = String(matchTime ?? "")
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  let hh = 21;
  let mm = 0;
  if (t) {
    hh = Number(t[1]) % 12;
    if (t[3] === "pm") hh += 12;
    mm = Number(t[2]);
  }
  const ms = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hh, mm, 0, 0).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** True once we are within 24h of kickoff (or past it). */
export function isWithinAvailabilityLock(
  playedOn: string,
  matchTime: string,
  nowMs: number = Date.now(),
): boolean {
  const start = matchStartMs(playedOn, matchTime);
  if (start == null) return false;
  return nowMs >= start - AVAILABILITY_LOCK_MS;
}
