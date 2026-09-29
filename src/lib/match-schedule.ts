// Client-safe helpers for the 24h availability lock.
//
// Kickoff is stored as `matches.kickoff_at` (timestamptz), converted from the
// club's local wall time once, in SQL. Everything here compares instants, so
// there is no timezone maths — and no dependence on the server's clock zone,
// which is UTC on Vercel.

export const AVAILABILITY_LOCK_MS = 24 * 60 * 60 * 1000;

export type KickoffInput = Date | string | number | null | undefined;

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
