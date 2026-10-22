import { AVAILABILITY_LOCK_MS, kickoffMs } from "./match-schedule";

/**
 * A daily cron cannot deliver at the exact lock instant. It sends on its first
 * run after the lock while kickoff is still ahead; missing kickoff is fail-closed.
 */
export function isAvailabilityLockPushDue(
  kickoffAt: string | Date | null,
  nowMs: number,
): boolean {
  const kickoff = kickoffMs(kickoffAt);
  return kickoff != null && kickoff > nowMs && kickoff - AVAILABILITY_LOCK_MS <= nowMs;
}
