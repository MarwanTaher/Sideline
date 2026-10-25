// Client-safe helpers for the 24h availability lock.
//
// Kickoff is stored as `matches.kickoff_at` (timestamptz), converted from the
// club's local wall time once, in SQL. Everything here compares instants, so
// there is no timezone maths — and no dependence on the server's clock zone,
// which is UTC on Vercel.

export const AVAILABILITY_LOCK_MS = 24 * 60 * 60 * 1000;

export type KickoffInput = Date | string | number | null | undefined;

const CLUB_TIME_ZONE = "Europe/Warsaw";

/** Kickoff as epoch ms, or null when the match has no scheduled instant. */
export function kickoffMs(kickoffAt: KickoffInput): number | null {
  if (kickoffAt == null || kickoffAt === "") return null;
  const ms =
    kickoffAt instanceof Date
      ? kickoffAt.getTime()
      : typeof kickoffAt === "number"
        ? kickoffAt
        : Date.parse(kickoffAt);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolve a stored kickoff or fall back to the club-local wall-clock fields.
 * Offset discovery uses Intl rather than the host timezone, so this is safe in
 * both a Warsaw browser and a UTC server.
 */
export function kickoffInstant(
  kickoffAt: KickoffInput,
  playedOn?: string | null,
  matchTime?: string | null,
): number | null {
  const stored = kickoffMs(kickoffAt);
  if (stored != null) return stored;
  if (!playedOn) return null;

  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(playedOn);
  const time = String(matchTime ?? "09:00 pm")
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (!date || !time) return null;

  const year = Number(date[1]);
  const month = Number(date[2]);
  const day = Number(date[3]);
  const hour12 = Number(time[1]);
  const minute = Number(time[2]);
  const checkDate = new Date(Date.UTC(year, month - 1, day));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day ||
    hour12 < 1 ||
    hour12 > 12 ||
    minute > 59
  ) {
    return null;
  }

  const hour = (hour12 % 12) + (time[3] === "pm" ? 12 : 0);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const partsAt = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
    };
  };
  const offsetAt = (instant: number) => {
    const local = partsAt(instant);
    return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - instant;
  };

  const offsets = new Set<number>();
  for (let delta = -36; delta <= 36; delta += 6) {
    offsets.add(offsetAt(wallClockAsUtc + delta * 60 * 60 * 1000));
  }
  const candidates = [...offsets]
    .map((offset) => wallClockAsUtc - offset)
    .sort((a, b) => a - b);
  const matching = candidates.filter((candidate) => {
    const local = partsAt(candidate);
    return (
      local.year === year &&
      local.month === month &&
      local.day === day &&
      local.hour === hour &&
      local.minute === minute
    );
  });

  // In the autumn overlap choose the later (standard-time) instant. During the
  // spring gap, the pre-transition offset matches Postgres AT TIME ZONE.
  return matching.length > 0 ? matching[matching.length - 1] : candidates[candidates.length - 1] ?? null;
}

/** True once we are within 24h of kickoff, or past it. */
export function isWithinAvailabilityLock(
  kickoffAt: KickoffInput,
  nowMs: number = Date.now(),
): boolean {
  const start = kickoffMs(kickoffAt);
  return start != null && nowMs >= start - AVAILABILITY_LOCK_MS;
}

/**
 * Milliseconds until changes close. Negative once locked, null when the match
 * has no kickoff instant.
 */
export function msUntilLock(
  kickoffAt: KickoffInput,
  nowMs: number = Date.now(),
): number | null {
  const start = kickoffMs(kickoffAt);
  return start == null ? null : start - AVAILABILITY_LOCK_MS - nowMs;
}

/** Coarse "2 days" / "6h 20m" / "45m" label for a positive duration. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(total / (60 * 24));
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
