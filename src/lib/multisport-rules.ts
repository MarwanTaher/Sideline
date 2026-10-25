/**
 * Approved MultiSport credit normally comes off the player's next bill. It is
 * stranded when no next bill will come: the player is no longer an active
 * subscriber, or they were already billed for the season's last month.
 */
export function isCreditStranded(input: {
  withdrawn: boolean;
  seasonEndDate: string | null;
  lastBilledPeriod: string | null;
}): boolean {
  if (input.withdrawn) return true;
  const endMonth = input.seasonEndDate?.slice(0, 7) ?? null;
  return endMonth != null && input.lastBilledPeriod != null && input.lastBilledPeriod >= endMonth;
}

/**
 * Credits used on a bill, in scan order, never exceeding what the bill
 * charges; the rest waits for a later bill. Mirrors the SQL allocation so the
 * rule can be unit-tested.
 */
export function creditsThatFit(
  credits: Array<{ id: number; creditMinor: number }>,
  chargedMinor: number,
  alreadyUsedMinor = 0,
): number[] {
  const sorted = [...credits].sort((a, b) => a.id - b.id);
  const used: number[] = [];
  let running = alreadyUsedMinor;
  for (const c of sorted) {
    running += c.creditMinor;
    if (running > chargedMinor) break;
    used.push(c.id);
  }
  return used;
}
